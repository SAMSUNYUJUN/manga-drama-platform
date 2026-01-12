/**
 * Workflow run service
 * @module workflow
 */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import {
  WorkflowRun,
  WorkflowTemplateVersion,
  NodeRun,
  Task,
  TaskVersion,
  Asset,
  HumanReviewDecisionEntity,
} from '../database/entities';
import {
  AssetStatus,
  AssetType,
  HumanReviewDecision,
  NodeRunStatus,
  TaskStatus,
  TaskStage,
  UserRole,
  WorkflowNodeType,
  WorkflowRunStatus,
} from '@shared/constants';
import { AiOrchestratorService } from '../ai-service/orchestrator.service';
import { PromptService } from '../prompt/prompt.service';
import type { IStorageService } from '../storage/storage.interface';
import { Inject } from '@nestjs/common';
import { User } from '../database/entities';
import { StartWorkflowRunDto, ReviewDecisionDto, ReviewUploadDto, HumanSelectDto, CreateWorkflowRunDto, NodeTestDto } from './dto';
import axios from 'axios';
import { WorkflowValidationService } from './workflow-validation.service';
import { normalizeWorkflowVersion } from './workflow-utils';
import { TrashService } from '../asset/trash.service';
import { NodeToolService } from '../node-tool/node-tool.service';

const TASK_STAGE_ORDER: TaskStage[] = [
  TaskStage.SCRIPT_UPLOADED,
  TaskStage.STORYBOARD_GENERATED,
  TaskStage.CHARACTER_DESIGNED,
  TaskStage.SCENE_GENERATED,
  TaskStage.KEYFRAME_GENERATING,
  TaskStage.KEYFRAME_COMPLETED,
  TaskStage.VIDEO_GENERATING,
  TaskStage.VIDEO_COMPLETED,
  TaskStage.FINAL_COMPOSING,
  TaskStage.COMPLETED,
];

const STAGE_NODE_MAP: Record<TaskStage, WorkflowNodeType[]> = {
  [TaskStage.SCRIPT_UPLOADED]: [WorkflowNodeType.LLM_PARSE_SCRIPT],
  [TaskStage.STORYBOARD_GENERATED]: [
    WorkflowNodeType.LLM_PARSE_SCRIPT,
    WorkflowNodeType.GENERATE_STORYBOARD,
  ],
  [TaskStage.CHARACTER_DESIGNED]: [
    WorkflowNodeType.GENERATE_CHARACTER_IMAGES,
    WorkflowNodeType.HUMAN_REVIEW_ASSETS,
  ],
  [TaskStage.SCENE_GENERATED]: [WorkflowNodeType.GENERATE_SCENE_IMAGE],
  [TaskStage.KEYFRAME_GENERATING]: [WorkflowNodeType.GENERATE_KEYFRAMES],
  [TaskStage.KEYFRAME_COMPLETED]: [WorkflowNodeType.GENERATE_KEYFRAMES],
  [TaskStage.VIDEO_GENERATING]: [WorkflowNodeType.GENERATE_VIDEO],
  [TaskStage.VIDEO_COMPLETED]: [WorkflowNodeType.GENERATE_VIDEO],
  [TaskStage.FINAL_COMPOSING]: [WorkflowNodeType.FINAL_COMPOSE],
  [TaskStage.COMPLETED]: [WorkflowNodeType.FINAL_COMPOSE],
};

@Injectable()
export class WorkflowRunService implements OnModuleInit, OnModuleDestroy {
  private readonly processingRuns = new Set<number>();
  private poller: NodeJS.Timeout | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly aiService: AiOrchestratorService,
    private readonly promptService: PromptService,
    private readonly validationService: WorkflowValidationService,
    private readonly trashService: TrashService,
    private readonly nodeToolService: NodeToolService,
    @Inject('IStorageService') private readonly storageService: IStorageService,
    @InjectRepository(WorkflowRun)
    private runRepository: Repository<WorkflowRun>,
    @InjectRepository(WorkflowTemplateVersion)
    private versionRepository: Repository<WorkflowTemplateVersion>,
    @InjectRepository(NodeRun)
    private nodeRunRepository: Repository<NodeRun>,
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    @InjectRepository(TaskVersion)
    private taskVersionRepository: Repository<TaskVersion>,
    @InjectRepository(Asset)
    private assetRepository: Repository<Asset>,
    @InjectRepository(HumanReviewDecisionEntity)
    private reviewRepository: Repository<HumanReviewDecisionEntity>,
  ) {}

  onModuleInit() {
    this.poller = setInterval(() => {
      this.resumePendingRuns().catch(() => null);
    }, 15000);
  }

  onModuleDestroy() {
    if (this.poller) {
      clearInterval(this.poller);
    }
  }

  async startRun(taskId: number, versionId: number, dto: StartWorkflowRunDto, user: User) {
    const { task, version } = await this.ensureTaskAccess(taskId, versionId, user);
    const templateVersion = await this.versionRepository.findOne({
      where: { id: dto.templateVersionId },
    });
    if (!templateVersion) {
      throw new NotFoundException(`WorkflowTemplateVersion with ID ${dto.templateVersionId} not found`);
    }
    const validation = this.validationService.validate(templateVersion.nodes, templateVersion.edges);
    if (!validation.ok) {
      throw new BadRequestException({ message: 'Workflow validation failed', errors: validation.errors });
    }

    const run = this.runRepository.create({
      templateVersionId: templateVersion.id,
      taskId,
      taskVersionId: versionId,
      status: WorkflowRunStatus.PENDING,
      input: dto.startInputs,
    });
    const savedRun = await this.runRepository.save(run);
    try {
      await this.acquireLock(versionId, `run-${savedRun.id}`);
    } catch (error) {
      await this.runRepository.delete({ id: savedRun.id });
      throw error;
    }
    await this.updateTaskStatus(taskId, TaskStatus.PROCESSING);

    const { nodes } = normalizeWorkflowVersion(templateVersion.nodes, templateVersion.edges);
    const nodeRuns = nodes.map((node) =>
      this.nodeRunRepository.create({
        workflowRunId: savedRun.id,
        nodeId: node.id,
        nodeType: node.type,
        status: NodeRunStatus.PENDING,
        retryCount: 0,
      }),
    );
    await this.nodeRunRepository.save(nodeRuns);

    savedRun.status = WorkflowRunStatus.RUNNING;
    savedRun.currentNodeId = nodes[0]?.id || null;
    await this.runRepository.save(savedRun);

    void this.executeRun(savedRun.id);
    return savedRun;
  }

  async getRun(taskId: number, versionId: number, user: User) {
    await this.ensureTaskAccess(taskId, versionId, user);
    const run = await this.runRepository.findOne({
      where: { taskId, taskVersionId: versionId },
      order: { createdAt: 'DESC' },
    });
    if (!run) {
      throw new NotFoundException('Workflow run not found');
    }
    return run;
  }

  async cancelRun(runId: number, user: User) {
    const run = await this.runRepository.findOne({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException(`WorkflowRun with ID ${runId} not found`);
    }
    await this.ensureTaskAccess(run.taskId, run.taskVersionId, user);
    run.status = WorkflowRunStatus.CANCELLED;
    await this.runRepository.save(run);
    await this.releaseLock(run.taskVersionId);
    await this.updateTaskStatus(run.taskId, TaskStatus.CANCELLED);
    return run;
  }

  async retryRun(runId: number, user: User) {
    const run = await this.runRepository.findOne({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException(`WorkflowRun with ID ${runId} not found`);
    }
    await this.ensureTaskAccess(run.taskId, run.taskVersionId, user);
    if (run.status !== WorkflowRunStatus.FAILED && run.status !== WorkflowRunStatus.CANCELLED) {
      throw new BadRequestException('Only failed or cancelled runs can be retried');
    }
    run.status = WorkflowRunStatus.RUNNING;
    await this.runRepository.save(run);
    await this.acquireLock(run.taskVersionId, `run-${run.id}`);
    void this.executeRun(run.id);
    return run;
  }

  async listNodeRuns(runId: number, user: User) {
    const run = await this.runRepository.findOne({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException(`WorkflowRun with ID ${runId} not found`);
    }
    await this.ensureTaskAccess(run.taskId, run.taskVersionId, user);
    return await this.nodeRunRepository.find({
      where: { workflowRunId: runId },
      order: { createdAt: 'ASC' },
    });
  }

  async getReviewAssets(nodeRunId: number, user: User) {
    const nodeRun = await this.nodeRunRepository.findOne({ where: { id: nodeRunId } });
    if (!nodeRun) {
      throw new NotFoundException(`NodeRun with ID ${nodeRunId} not found`);
    }
    const run = await this.runRepository.findOne({ where: { id: nodeRun.workflowRunId } });
    if (!run) {
      throw new NotFoundException('Workflow run not found');
    }
    await this.ensureTaskAccess(run.taskId, run.taskVersionId, user);
    const input = nodeRun.input || {};
    const inputVariables = input.variables || {};
    const variableLists = Object.values(inputVariables).filter((value) => Array.isArray(value)) as any[];
    const firstList = variableLists[0] || [];
    const assetIds = input.assetIds || firstList || [];
    if (!assetIds.length) return [];
    return await this.assetRepository.find({ where: { id: In(assetIds) } });
  }

  async submitReviewDecision(nodeRunId: number, dto: ReviewDecisionDto, user: User) {
    const nodeRun = await this.nodeRunRepository.findOne({ where: { id: nodeRunId } });
    if (!nodeRun) {
      throw new NotFoundException(`NodeRun with ID ${nodeRunId} not found`);
    }
    const run = await this.runRepository.findOne({ where: { id: nodeRun.workflowRunId } });
    if (!run) {
      throw new NotFoundException('Workflow run not found');
    }
    await this.ensureTaskAccess(run.taskId, run.taskVersionId, user);

    const approved = await this.assetRepository.find({
      where: { id: In(dto.approvedAssetIds || []) },
    });
    const rejected = await this.assetRepository.find({
      where: { id: In(dto.rejectedAssetIds || []) },
    });

    for (const asset of approved) {
      asset.status = AssetStatus.ACTIVE;
      asset.trashedAt = null;
      await this.assetRepository.save(asset);
      await this.trashService.removeTrashRecordByAssetId(asset.id);
      await this.reviewRepository.save(
        this.reviewRepository.create({
          nodeRunId,
          userId: user.id,
          assetId: asset.id,
          decision: HumanReviewDecision.APPROVE,
          reason: dto.reason,
        }),
      );
    }

    for (const asset of rejected) {
      await this.trashService.trashAsset(asset, {
        originRunId: run.id,
        originNodeId: nodeRun.nodeId,
        metadata: { reason: dto.reason },
      });
      await this.reviewRepository.save(
        this.reviewRepository.create({
          nodeRunId,
          userId: user.id,
          assetId: asset.id,
          decision: HumanReviewDecision.REJECT,
          reason: dto.reason,
        }),
      );
    }

    nodeRun.output = {
      assetIds: dto.approvedAssetIds,
      approvedAssetIds: dto.approvedAssetIds,
      rejectedAssetIds: dto.rejectedAssetIds,
      variables: { assets: dto.approvedAssetIds || [] },
    };
    await this.nodeRunRepository.save(nodeRun);
    return nodeRun;
  }

  async uploadReviewAsset(
    nodeRunId: number,
    file: Express.Multer.File,
    dto: ReviewUploadDto,
    user: User,
  ) {
    const nodeRun = await this.nodeRunRepository.findOne({ where: { id: nodeRunId } });
    if (!nodeRun) {
      throw new NotFoundException(`NodeRun with ID ${nodeRunId} not found`);
    }
    const run = await this.runRepository.findOne({ where: { id: nodeRun.workflowRunId } });
    if (!run) {
      throw new NotFoundException('Workflow run not found');
    }
    const { task, version } = await this.ensureTaskAccess(run.taskId, run.taskVersionId, user);

    const assetType = (dto.assetType as AssetType) || AssetType.CHARACTER_DESIGN;
    const folder = this.buildAssetFolder(task.userId, task.id, version.id, assetType);
    const filename = this.buildFilename('review', file.originalname);
    const url = await this.storageService.uploadBuffer(file.buffer, filename, {
      folder,
      contentType: file.mimetype,
      isPublic: false,
    });

    const asset = await this.assetRepository.save(
      this.assetRepository.create({
        taskId: task.id,
        versionId: version.id,
        type: assetType,
        status: AssetStatus.ACTIVE,
        url,
        filename: file.originalname,
        filesize: file.size,
        mimeType: file.mimetype,
        metadataJson: JSON.stringify({ source: 'human_review' }),
      }),
    );

    if (dto.replaceAssetId) {
      const original = await this.assetRepository.findOne({ where: { id: dto.replaceAssetId } });
      if (original) {
        original.status = AssetStatus.REPLACED;
        original.replacedById = asset.id;
        await this.assetRepository.save(original);
      }
    }

    const currentInput = nodeRun.input || {};
    const assetIds = Array.isArray(currentInput.assetIds) ? [...currentInput.assetIds] : [];
    if (dto.replaceAssetId && assetIds.length) {
      const idx = assetIds.indexOf(dto.replaceAssetId);
      if (idx >= 0) {
        assetIds.splice(idx, 1, asset.id);
      } else {
        assetIds.push(asset.id);
      }
    } else {
      assetIds.push(asset.id);
    }
    nodeRun.input = { ...currentInput, assetIds };
    await this.nodeRunRepository.save(nodeRun);

    await this.reviewRepository.save(
      this.reviewRepository.create({
        nodeRunId,
        userId: user.id,
        assetId: asset.id,
        decision: HumanReviewDecision.REPLACE,
      }),
    );

    return asset;
  }

  async continueReview(nodeRunId: number, user: User) {
    const nodeRun = await this.nodeRunRepository.findOne({ where: { id: nodeRunId } });
    if (!nodeRun) {
      throw new NotFoundException(`NodeRun with ID ${nodeRunId} not found`);
    }
    const run = await this.runRepository.findOne({ where: { id: nodeRun.workflowRunId } });
    if (!run) {
      throw new NotFoundException('Workflow run not found');
    }
    await this.ensureTaskAccess(run.taskId, run.taskVersionId, user);

    nodeRun.status = NodeRunStatus.SUCCEEDED;
    nodeRun.endedAt = new Date();
    await this.nodeRunRepository.save(nodeRun);

    run.status = WorkflowRunStatus.RUNNING;
    await this.runRepository.save(run);
    await this.updateTaskStatus(run.taskId, TaskStatus.PROCESSING);
    void this.executeRun(run.id);
    return run;
  }

  async createRun(dto: CreateWorkflowRunDto, user: User) {
    return await this.startRun(dto.taskId, dto.taskVersionId, {
      templateVersionId: dto.templateVersionId,
      startInputs: dto.startInputs,
    }, user);
  }

  async getRunById(runId: number, user: User) {
    const run = await this.runRepository.findOne({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException(`WorkflowRun with ID ${runId} not found`);
    }
    await this.ensureTaskAccess(run.taskId, run.taskVersionId, user);
    return run;
  }

  async submitHumanSelect(runId: number, dto: HumanSelectDto, user: User) {
    const run = await this.runRepository.findOne({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException(`WorkflowRun with ID ${runId} not found`);
    }
    await this.ensureTaskAccess(run.taskId, run.taskVersionId, user);
    const nodeRun = dto.nodeRunId
      ? await this.nodeRunRepository.findOne({ where: { id: dto.nodeRunId, workflowRunId: runId } })
      : await this.nodeRunRepository.findOne({
          where: { workflowRunId: runId, status: NodeRunStatus.WAITING_HUMAN },
          order: { createdAt: 'ASC' },
        });
    if (!nodeRun) {
      throw new NotFoundException('No pending human breakpoint node');
    }
    if (nodeRun.status !== NodeRunStatus.WAITING_HUMAN && nodeRun.status !== NodeRunStatus.PAUSED) {
      throw new BadRequestException('Node is not waiting for human selection');
    }

    const templateVersion = await this.versionRepository.findOne({
      where: { id: run.templateVersionId },
    });
    if (!templateVersion) {
      throw new NotFoundException('Workflow template version not found');
    }
    const normalized = normalizeWorkflowVersion(templateVersion.nodes, templateVersion.edges);
    const node = normalized.nodes.find((item) => item.id === nodeRun.nodeId);
    if (!node || node.type !== WorkflowNodeType.HUMAN_BREAKPOINT) {
      throw new BadRequestException('Target node is not a human breakpoint');
    }

    const inputVariables = nodeRun.input?.variables || {};
    const inputKey = node.data?.inputs?.[0]?.key;
    const candidates = (inputKey ? inputVariables[inputKey] : undefined) ?? nodeRun.input?.assetIds ?? [];
    const candidateList = Array.isArray(candidates) ? candidates : [candidates];

    let selectedValues: any[] = [];
    if (dto.selectedAssetIds?.length) {
      selectedValues = dto.selectedAssetIds;
    } else if (dto.selectedIndices?.length) {
      selectedValues = dto.selectedIndices
        .map((index) => candidateList[index])
        .filter((item) => item !== undefined);
    }
    if (!selectedValues.length) {
      throw new BadRequestException('No selection provided');
    }

    const selectedSet = new Set(selectedValues);
    const unselected = candidateList.filter((item) => !selectedSet.has(item));
    const assetCandidateIds = candidateList.filter((item) => typeof item === 'number') as number[];
    if (assetCandidateIds.length) {
      const assets = await this.assetRepository.find({ where: { id: In(assetCandidateIds) } });
      for (const asset of assets) {
        if (selectedSet.has(asset.id)) {
          asset.status = AssetStatus.ACTIVE;
          asset.trashedAt = null;
          await this.assetRepository.save(asset);
          await this.trashService.removeTrashRecordByAssetId(asset.id);
        } else {
          await this.trashService.trashAsset(asset, {
            originRunId: runId,
            originNodeId: nodeRun.nodeId,
            metadata: dto.metadata,
          });
        }
      }
    }
    const nonAssetRejected = unselected.filter((item) => typeof item !== 'number');
    if (nonAssetRejected.length) {
      await this.trashService.createTrashRecord({
        originRunId: runId,
        originNodeId: nodeRun.nodeId,
        metadata: { rejected: nonAssetRejected, ...dto.metadata },
      });
    }

    const selectionMode =
      node.data?.config?.selectionMode ||
      (node.data?.config?.multiSelect ? 'multiple' : 'single');
    const outputValue = selectionMode === 'multiple' ? selectedValues : selectedValues[0];
    const outputVariables = this.buildOutputVariables(node, outputValue);
    nodeRun.output = { variables: outputVariables };
    nodeRun.status = NodeRunStatus.SUCCEEDED;
    nodeRun.endedAt = new Date();
    await this.nodeRunRepository.save(nodeRun);

    run.status = WorkflowRunStatus.RUNNING;
    await this.runRepository.save(run);
    await this.updateTaskStatus(run.taskId, TaskStatus.PROCESSING);
    void this.executeRun(run.id);
    return run;
  }

  async testNode(dto: NodeTestDto) {
    const start = Date.now();
    const logs: string[] = [];
    try {
      const config = dto.config || {};
      const inputs = dto.inputs || {};
      const nodeType = dto.nodeType as WorkflowNodeType;

      switch (nodeType) {
        case WorkflowNodeType.LLM_TOOL: {
          const promptTemplateVersionId = config.promptTemplateVersionId;
          if (!promptTemplateVersionId) {
            throw new BadRequestException('promptTemplateVersionId is required for LLM tool test');
          }
          const renderVariables = this.normalizePromptVariables(inputs);
          const rendered = await this.promptService.renderPrompt({
            templateVersionId: promptTemplateVersionId,
            variables: renderVariables,
          });
          const outputText = await this.aiService.generateText(rendered.rendered, config.model);
          return {
            outputs: { output: outputText, renderedPrompt: rendered.rendered, missingVariables: rendered.missingVariables },
            logs,
            durationMs: Date.now() - start,
          };
        }
        case WorkflowNodeType.LLM_PARSE_SCRIPT: {
          const scriptText =
            (typeof inputs.script === 'string' && inputs.script) ||
            (typeof inputs.input === 'string' && inputs.input) ||
            (typeof inputs.text === 'string' && inputs.text) ||
            'Test script';
          const parsed = await this.aiService.parseScript(scriptText, config);
          return { outputs: { storyboard: parsed }, logs, durationMs: Date.now() - start };
        }
        case WorkflowNodeType.GENERATE_CHARACTER_IMAGES:
        case WorkflowNodeType.GENERATE_SCENE_IMAGE:
        case WorkflowNodeType.GENERATE_KEYFRAMES: {
          const prompt = inputs.prompt || config.prompt || 'Test prompt';
          const results = await this.aiService.generateImage(prompt, config.model);
          const images = results.map((item) =>
            item.url ? item.url : item.data ? `data:${item.mimeType || 'image/png'};base64,${item.data.toString('base64')}` : '',
          );
          return { outputs: { images }, logs, durationMs: Date.now() - start };
        }
        case WorkflowNodeType.GENERATE_VIDEO: {
          const prompt = inputs.prompt || config.prompt || 'Test video prompt';
          const results = await this.aiService.generateVideo(prompt, config.model);
          const videos = results.map((item) =>
            item.url ? item.url : item.data ? `data:${item.mimeType || 'video/mp4'};base64,${item.data.toString('base64')}` : '',
          );
          return { outputs: { videos }, logs, durationMs: Date.now() - start };
        }
        case WorkflowNodeType.HUMAN_BREAKPOINT: {
          return { outputs: { selection: inputs }, logs, durationMs: Date.now() - start };
        }
        default: {
          return { outputs: inputs, logs, durationMs: Date.now() - start };
        }
      }
    } catch (error: any) {
      return {
        outputs: null,
        logs,
        error: error?.message || 'Node test failed',
        durationMs: Date.now() - start,
      };
    }
  }

  private async resumePendingRuns() {
    const runs = await this.runRepository.find({
      where: { status: WorkflowRunStatus.RUNNING },
      order: { updatedAt: 'ASC' },
    });
    for (const run of runs) {
      if (!this.processingRuns.has(run.id)) {
        void this.executeRun(run.id);
      }
    }
  }

  private async executeRun(runId: number) {
    if (this.processingRuns.has(runId)) return;
    this.processingRuns.add(runId);
    try {
      const run = await this.runRepository.findOne({ where: { id: runId } });
      if (!run) return;
      if (run.status !== WorkflowRunStatus.RUNNING) return;

      const templateVersion = await this.versionRepository.findOne({
        where: { id: run.templateVersionId },
      });
      if (!templateVersion) return;

      const { nodes, edges } = normalizeWorkflowVersion(templateVersion.nodes, templateVersion.edges);
      const order = this.resolveNodeOrder(nodes, edges);
      for (const nodeId of order) {
        const currentRun = await this.runRepository.findOne({ where: { id: runId } });
        if (!currentRun || currentRun.status !== WorkflowRunStatus.RUNNING) {
          return;
        }
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) continue;
        const nodeRun = await this.nodeRunRepository.findOne({
          where: { workflowRunId: runId, nodeId: node.id },
        });
        if (!nodeRun) continue;
        if (nodeRun.status === NodeRunStatus.SUCCEEDED) {
          continue;
        }
        if (nodeRun.status === NodeRunStatus.WAITING_HUMAN || nodeRun.status === NodeRunStatus.PAUSED) {
          await this.updateRunStatus(runId, WorkflowRunStatus.PAUSED, node.id);
          return;
        }

        await this.updateRunStatus(runId, WorkflowRunStatus.RUNNING, node.id);
        const result = await this.executeNode(run, node, nodeRun, nodes, edges);
        if (result.status === NodeRunStatus.WAITING_HUMAN || result.status === NodeRunStatus.PAUSED) {
          await this.updateRunStatus(runId, WorkflowRunStatus.PAUSED, node.id);
          return;
        }
        if (result.status === NodeRunStatus.FAILED) {
          await this.updateRunStatus(runId, WorkflowRunStatus.FAILED, node.id, result.error);
          await this.releaseLock(run.taskVersionId);
          return;
        }

        await this.updateStageIfReady(run, {
          ...templateVersion,
          nodes,
          edges,
          metadata: templateVersion.metadata,
        });
      }
      await this.updateRunStatus(runId, WorkflowRunStatus.SUCCEEDED, null);
      await this.updateTaskStage(run.taskId, run.taskVersionId, TaskStage.COMPLETED);
      await this.updateTaskStatus(run.taskId, TaskStatus.COMPLETED);
      await this.releaseLock(run.taskVersionId);
    } finally {
      this.processingRuns.delete(runId);
    }
  }

  private async executeNode(
    run: WorkflowRun,
    node: any,
    nodeRun: NodeRun,
    nodes: any[],
    edges: any[],
  ) {
    nodeRun.status = NodeRunStatus.RUNNING;
    nodeRun.startedAt = new Date();
    await this.nodeRunRepository.save(nodeRun);

    try {
      if (nodeRun.retryCount >= 3) {
        throw new BadRequestException('Retry limit exceeded for node');
      }
      const config = node.data?.config || {};
      const inputVariables = await this.resolveInputVariables(run, node, nodes, edges);
      const inputAssets = await this.getInputAssets(run.id);
      nodeRun.input = { variables: inputVariables, assetIds: inputAssets.map((asset) => asset.id) };
      await this.nodeRunRepository.save(nodeRun);

      switch (node.type as WorkflowNodeType) {
        case WorkflowNodeType.START: {
          nodeRun.output = { variables: this.buildOutputVariables(node, inputVariables) };
          nodeRun.status = NodeRunStatus.SUCCEEDED;
          nodeRun.endedAt = new Date();
          await this.nodeRunRepository.save(nodeRun);
          return nodeRun;
        }
        case WorkflowNodeType.LLM_TOOL: {
          const toolConfig = node.data?.config || {};
          let promptTemplateVersionId = toolConfig.promptTemplateVersionId;
          let model = toolConfig.model;
          if ((promptTemplateVersionId === undefined || model === undefined) && node.data?.toolId) {
            const tool = await this.nodeToolService.getTool(node.data.toolId);
            promptTemplateVersionId = promptTemplateVersionId ?? tool.promptTemplateVersionId ?? undefined;
            model = model ?? tool.model ?? undefined;
          }
          if (!promptTemplateVersionId) {
            throw new BadRequestException('LLM tool missing prompt template version');
          }
          const renderVariables = this.normalizePromptVariables(inputVariables);
          const rendered = await this.promptService.renderPrompt({
            templateVersionId: promptTemplateVersionId,
            variables: renderVariables,
          });
          const outputText = await this.aiService.generateText(rendered.rendered, model);
          nodeRun.output = {
            variables: this.buildOutputVariables(node, outputText),
            logs: [],
          };
          nodeRun.status = NodeRunStatus.SUCCEEDED;
          nodeRun.endedAt = new Date();
          await this.nodeRunRepository.save(nodeRun);
          return nodeRun;
        }
        case WorkflowNodeType.LLM_PARSE_SCRIPT: {
          const scriptText =
            (typeof inputVariables?.script === 'string' && inputVariables.script) ||
            (typeof inputVariables?.input === 'string' && inputVariables.input) ||
            (typeof inputVariables?.text === 'string' && inputVariables.text) ||
            (await this.fetchScriptText(run));
          const parsed = await this.aiService.parseScript(scriptText, config);
          const asset = await this.saveJsonAsset(
            run,
            AssetType.STORYBOARD_SCRIPT,
            'storyboard.json',
            parsed,
          );
          nodeRun.output = {
            assetIds: [asset.id],
            providerTaskId: null,
            logs: [],
            variables: this.buildOutputVariables(node, parsed, [asset.id]),
          };
          nodeRun.status = NodeRunStatus.SUCCEEDED;
          nodeRun.endedAt = new Date();
          await this.nodeRunRepository.save(nodeRun);
          await this.updateTaskStage(run.taskId, run.taskVersionId, TaskStage.STORYBOARD_GENERATED);
          return nodeRun;
        }
        case WorkflowNodeType.GENERATE_STORYBOARD: {
          nodeRun.output = {
            ...(nodeRun.input || {}),
            providerTaskId: null,
            logs: [],
            variables: this.buildOutputVariables(node, inputVariables),
          };
          nodeRun.status = NodeRunStatus.SUCCEEDED;
          nodeRun.endedAt = new Date();
          await this.nodeRunRepository.save(nodeRun);
          return nodeRun;
        }
        case WorkflowNodeType.GENERATE_CHARACTER_IMAGES: {
          const prompt = await this.resolvePrompt(config, 'Character design');
          const count = config.outputCount || (process.env.AI_MODE === 'mock' ? 4 : 1);
          const assets = await this.generateMediaAssets(
            run,
            AssetType.CHARACTER_DESIGN,
            prompt,
            count,
            'image',
            undefined,
            config.model,
          );
          nodeRun.output = {
            assetIds: assets.map((asset) => asset.id),
            providerTaskId: null,
            logs: [],
            variables: this.buildOutputVariables(node, assets.map((asset) => asset.id), assets.map((asset) => asset.id)),
          };
          nodeRun.status = NodeRunStatus.SUCCEEDED;
          nodeRun.endedAt = new Date();
          await this.nodeRunRepository.save(nodeRun);
          await this.updateTaskStage(run.taskId, run.taskVersionId, TaskStage.CHARACTER_DESIGNED);
          return nodeRun;
        }
        case WorkflowNodeType.HUMAN_REVIEW_ASSETS: {
          if (config.autoApprove || config.requireHuman === false) {
            const primaryInput = node.data?.inputs?.[0]?.key;
            const passthrough = primaryInput ? inputVariables?.[primaryInput] : inputVariables;
            nodeRun.output = {
              ...(nodeRun.input || {}),
              variables: this.buildOutputVariables(node, passthrough, nodeRun.input?.assetIds),
            };
            nodeRun.status = NodeRunStatus.SUCCEEDED;
            nodeRun.endedAt = new Date();
            await this.nodeRunRepository.save(nodeRun);
            return nodeRun;
          }
          nodeRun.status = NodeRunStatus.WAITING_HUMAN;
          await this.nodeRunRepository.save(nodeRun);
          return nodeRun;
        }
        case WorkflowNodeType.HUMAN_BREAKPOINT: {
          const selectionMode = config.selectionMode || (config.multiSelect ? 'multiple' : 'single');
          if (config.autoApprove || config.requireHuman === false) {
            const inputKey = node.data?.inputs?.[0]?.key;
            const candidates = inputKey ? inputVariables?.[inputKey] : inputVariables;
            const outputVariables = this.buildOutputVariables(node, candidates);
            nodeRun.output = { variables: outputVariables };
            nodeRun.status = NodeRunStatus.SUCCEEDED;
            nodeRun.endedAt = new Date();
            await this.nodeRunRepository.save(nodeRun);
            return nodeRun;
          }
          nodeRun.status = NodeRunStatus.WAITING_HUMAN;
          nodeRun.output = { variables: { selectionMode } };
          await this.nodeRunRepository.save(nodeRun);
          return nodeRun;
        }
        case WorkflowNodeType.GENERATE_SCENE_IMAGE: {
          const prompt = await this.resolvePrompt(config, 'Scene image');
          const assets = await this.generateMediaAssets(
            run,
            AssetType.SCENE_IMAGE,
            prompt,
            1,
            'image',
            undefined,
            config.model,
          );
          nodeRun.output = {
            assetIds: assets.map((asset) => asset.id),
            providerTaskId: null,
            logs: [],
            variables: this.buildOutputVariables(node, assets[0]?.id, assets.map((asset) => asset.id)),
          };
          nodeRun.status = NodeRunStatus.SUCCEEDED;
          nodeRun.endedAt = new Date();
          await this.nodeRunRepository.save(nodeRun);
          await this.updateTaskStage(run.taskId, run.taskVersionId, TaskStage.SCENE_GENERATED);
          return nodeRun;
        }
        case WorkflowNodeType.GENERATE_KEYFRAMES: {
          await this.updateTaskStage(run.taskId, run.taskVersionId, TaskStage.KEYFRAME_GENERATING);
          const prompt = await this.resolvePrompt(config, 'Keyframe');
          const assets = await this.generateMediaAssets(
            run,
            AssetType.KEYFRAME_IMAGE,
            prompt,
            1,
            'image',
            undefined,
            config.model,
          );
          nodeRun.output = {
            assetIds: assets.map((asset) => asset.id),
            providerTaskId: null,
            logs: [],
            variables: this.buildOutputVariables(node, assets.map((asset) => asset.id), assets.map((asset) => asset.id)),
          };
          nodeRun.status = NodeRunStatus.SUCCEEDED;
          nodeRun.endedAt = new Date();
          await this.nodeRunRepository.save(nodeRun);
          await this.updateTaskStage(run.taskId, run.taskVersionId, TaskStage.KEYFRAME_COMPLETED);
          return nodeRun;
        }
        case WorkflowNodeType.GENERATE_VIDEO: {
          await this.updateTaskStage(run.taskId, run.taskVersionId, TaskStage.VIDEO_GENERATING);
          const prompt = await this.resolvePrompt(config, 'Storyboard video');
          const duration = config.duration || 10;
          if (duration > 15) {
            throw new BadRequestException('Video duration exceeds 15s limit');
          }
          const assets = await this.generateMediaAssets(
            run,
            AssetType.STORYBOARD_VIDEO,
            prompt,
            1,
            'video',
            { duration },
            config.model,
          );
          nodeRun.output = {
            assetIds: assets.map((asset) => asset.id),
            providerTaskId: null,
            logs: [],
            variables: this.buildOutputVariables(node, assets[0]?.id, assets.map((asset) => asset.id)),
          };
          nodeRun.status = NodeRunStatus.SUCCEEDED;
          nodeRun.endedAt = new Date();
          await this.nodeRunRepository.save(nodeRun);
          await this.updateTaskStage(run.taskId, run.taskVersionId, TaskStage.VIDEO_COMPLETED);
          return nodeRun;
        }
        case WorkflowNodeType.FINAL_COMPOSE: {
          await this.updateTaskStage(run.taskId, run.taskVersionId, TaskStage.FINAL_COMPOSING);
          const asset = await this.saveMockFinal(run);
          nodeRun.output = {
            assetIds: [asset.id],
            providerTaskId: null,
            logs: [],
            variables: this.buildOutputVariables(node, asset.id, [asset.id]),
          };
          nodeRun.status = NodeRunStatus.SUCCEEDED;
          nodeRun.endedAt = new Date();
          await this.nodeRunRepository.save(nodeRun);
          await this.updateTaskStage(run.taskId, run.taskVersionId, TaskStage.FINAL_COMPOSING);
          return nodeRun;
        }
        case WorkflowNodeType.END: {
          nodeRun.output = { variables: this.buildOutputVariables(node, inputVariables) };
          nodeRun.status = NodeRunStatus.SUCCEEDED;
          nodeRun.endedAt = new Date();
          await this.nodeRunRepository.save(nodeRun);
          run.output = nodeRun.output?.variables || {};
          await this.runRepository.save(run);
          return nodeRun;
        }
        default: {
          nodeRun.status = NodeRunStatus.SUCCEEDED;
          nodeRun.endedAt = new Date();
          await this.nodeRunRepository.save(nodeRun);
          return nodeRun;
        }
      }
    } catch (error) {
      nodeRun.status = NodeRunStatus.FAILED;
      nodeRun.error = error.message || 'Node execution failed';
      nodeRun.retryCount = (nodeRun.retryCount || 0) + 1;
      nodeRun.endedAt = new Date();
      await this.nodeRunRepository.save(nodeRun);
      return nodeRun;
    }
  }

  private async updateRunStatus(
    runId: number,
    status: WorkflowRunStatus,
    currentNodeId: string | null,
    error?: string | null,
  ) {
    const run = await this.runRepository.findOne({ where: { id: runId } });
    if (!run) return;
    run.status = status;
    run.currentNodeId = currentNodeId;
    run.error = error ?? null;
    await this.runRepository.save(run);
    if (status === WorkflowRunStatus.FAILED) {
      await this.updateTaskStatus(run.taskId, TaskStatus.FAILED);
    }
    if (status === WorkflowRunStatus.PAUSED || status === WorkflowRunStatus.WAITING_HUMAN) {
      await this.updateTaskStatus(run.taskId, TaskStatus.PAUSED);
    }
    if (status === WorkflowRunStatus.RUNNING) {
      await this.updateTaskStatus(run.taskId, TaskStatus.PROCESSING);
    }
  }

  private async updateTaskStage(taskId: number, versionId: number, stage: TaskStage) {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    const version = await this.taskVersionRepository.findOne({ where: { id: versionId } });
    if (!task || !version) return;
    if (!this.isStageAdvanced(version.stage, stage)) return;
    task.stage = stage;
    version.stage = stage;
    await this.taskRepository.save(task);
    await this.taskVersionRepository.save(version);
  }

  private async updateTaskStatus(taskId: number, status: TaskStatus) {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) return;
    task.status = status;
    await this.taskRepository.save(task);
  }

  private isStageAdvanced(current: TaskStage | null | undefined, next: TaskStage) {
    if (!current) return true;
    return TASK_STAGE_ORDER.indexOf(next) >= TASK_STAGE_ORDER.indexOf(current);
  }

  private async updateStageIfReady(run: WorkflowRun, templateVersion: WorkflowTemplateVersion) {
    const nodeRuns = await this.nodeRunRepository.find({
      where: { workflowRunId: run.id },
    });
    for (const [stage, nodeTypes] of Object.entries(STAGE_NODE_MAP)) {
      const nodesInTemplate = templateVersion.nodes.filter((node) =>
        nodeTypes.includes(node.type as WorkflowNodeType),
      );
      if (!nodesInTemplate.length) continue;
      const allSucceeded = nodesInTemplate.every((node) => {
        const runState = nodeRuns.find((nr) => nr.nodeId === node.id);
        return runState?.status === NodeRunStatus.SUCCEEDED;
      });
      if (allSucceeded) {
        await this.updateTaskStage(run.taskId, run.taskVersionId, stage as TaskStage);
      }
    }
  }

  private resolveNodeOrder(nodes: any[], edges: any[]): string[] {
    const incoming: Record<string, number> = {};
    const graph: Record<string, string[]> = {};
    nodes.forEach((node) => {
      incoming[node.id] = 0;
      graph[node.id] = [];
    });
    edges.forEach((edge) => {
      graph[edge.source] = graph[edge.source] || [];
      graph[edge.source].push(edge.target);
      incoming[edge.target] = (incoming[edge.target] || 0) + 1;
    });
    const queue = Object.keys(incoming).filter((id) => incoming[id] === 0);
    const order: string[] = [];
    while (queue.length) {
      const id = queue.shift()!;
      order.push(id);
      (graph[id] || []).forEach((target) => {
        incoming[target] -= 1;
        if (incoming[target] === 0) {
          queue.push(target);
        }
      });
    }
    return order.length ? order : nodes.map((node) => node.id);
  }

  private async resolveInputVariables(
    run: WorkflowRun,
    node: any,
    nodes: any[],
    edges: any[],
  ): Promise<Record<string, any>> {
    if (node.type === WorkflowNodeType.START) {
      return run.input || {};
    }
    const incomingEdges = edges.filter((edge: any) => edge.target === node.id);
    if (!incomingEdges.length) {
      return this.applyDefaultInputs(node);
    }
    const nodeRuns = await this.nodeRunRepository.find({
      where: { workflowRunId: run.id, status: NodeRunStatus.SUCCEEDED },
      order: { createdAt: 'ASC' },
    });
    const runMap = new Map(nodeRuns.map((item) => [item.nodeId, item]));
    const variables: Record<string, any> = {};
    for (const edge of incomingEdges) {
      const sourceRun = runMap.get(edge.source);
      const output = sourceRun?.output || {};
      let value = output.variables?.[edge.sourceOutputKey];
      if (value === undefined && Array.isArray(output.assetIds)) {
        value = output.assetIds;
      }
      if (edge.transform === 'stringify' && value !== undefined) {
        value = JSON.stringify(value);
      }
      if (edge.transform === 'parse_json' && typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          value = undefined;
        }
      }
      if (value !== undefined && edge.targetInputKey) {
        variables[edge.targetInputKey] = value;
      }
    }
    const withDefaults = this.applyDefaultInputs(node, variables);
    return withDefaults;
  }

  private applyDefaultInputs(node: any, current: Record<string, any> = {}) {
    const inputs = node.data?.inputs || [];
    const next = { ...current };
    inputs.forEach((input: any) => {
      if (next[input.key] === undefined && input.defaultValue !== undefined) {
        next[input.key] = input.defaultValue;
      }
    });
    return next;
  }

  private buildOutputVariables(
    node: any,
    value?: any,
    assetIds?: number[],
  ): Record<string, any> {
    const outputs = node.data?.outputs || [];
    if (!outputs.length) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value;
      }
      return value !== undefined ? { output: value } : {};
    }
    const variables: Record<string, any> = {};
    outputs.forEach((output: any, index: number) => {
      if (value && typeof value === 'object' && !Array.isArray(value) && output.key in value) {
        variables[output.key] = value[output.key];
        return;
      }
      const fallback = index === 0 ? value : undefined;
      variables[output.key] = this.coerceValueForType(output.type, fallback, assetIds);
    });
    return variables;
  }

  private coerceValueForType(type: string, value: any, assetIds?: number[]) {
    if (type.startsWith('list<')) {
      if (Array.isArray(value)) return value;
      if (assetIds) return assetIds;
      return value !== undefined ? [value] : [];
    }
    if (type === 'asset_ref') {
      if (typeof value === 'number') return value;
      if (Array.isArray(assetIds) && assetIds.length) return assetIds[0];
      return value;
    }
    if (type === 'text' && value !== undefined && typeof value !== 'string') {
      return JSON.stringify(value);
    }
    if (type === 'json' && typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }

  private normalizePromptVariables(values: Record<string, any>) {
    const normalized: Record<string, string> = {};
    Object.entries(values || {}).forEach(([key, value]) => {
      if (typeof value === 'string') {
        normalized[key] = value;
        return;
      }
      if (value === undefined || value === null) {
        normalized[key] = '';
        return;
      }
      normalized[key] = JSON.stringify(value);
    });
    return normalized;
  }

  private async getInputAssets(runId: number): Promise<Asset[]> {
    const nodeRuns = await this.nodeRunRepository.find({
      where: { workflowRunId: runId, status: NodeRunStatus.SUCCEEDED },
      order: { createdAt: 'ASC' },
    });
    const ids = nodeRuns.flatMap((node) => {
      const output = node.output || {};
      return output.assetIds || output.approvedAssetIds || [];
    });
    if (!ids.length) return [];
    return await this.assetRepository.find({ where: { id: In(ids) } });
  }

  private async resolvePrompt(config: any, fallback: string): Promise<string> {
    if (config.promptTemplateVersionId) {
      const rendered = await this.promptService.renderPrompt({
        templateVersionId: config.promptTemplateVersionId,
        variables: config.variables || {},
      });
      if (!rendered.missingVariables.length) {
        return rendered.rendered;
      }
    }
    return config.prompt || fallback;
  }

  private async generateMediaAssets(
    run: WorkflowRun,
    type: AssetType,
    prompt: string,
    count: number,
    mediaType: 'image' | 'video',
    metadata?: Record<string, any>,
    modelOverride?: string,
  ): Promise<Asset[]> {
    const assets: Asset[] = [];
    for (let i = 0; i < count; i += 1) {
      const media =
        mediaType === 'image'
          ? await this.aiService.generateImage(prompt, modelOverride)
          : await this.aiService.generateVideo(prompt, modelOverride);
      if (!media.length) {
        throw new BadRequestException('AI provider returned no media');
      }
      const saved = await this.saveMediaResult(run, type, media[0], mediaType, metadata);
      assets.push(saved);
    }
    return assets;
  }

  private async saveMediaResult(
    run: WorkflowRun,
    type: AssetType,
    media: { url?: string; data?: Buffer; mimeType?: string },
    mediaType: 'image' | 'video',
    metadata?: Record<string, any>,
  ): Promise<Asset> {
    const task = await this.taskRepository.findOne({ where: { id: run.taskId } });
    const version = await this.taskVersionRepository.findOne({ where: { id: run.taskVersionId } });
    if (!task || !version) throw new NotFoundException('Task not found');

    const folder = this.buildAssetFolder(task.userId, task.id, version.id, type);
    const filename = this.buildFilename(type, mediaType === 'image' ? 'png' : 'mp4');
    let url: string;
    let mimeType = media.mimeType || (mediaType === 'image' ? 'image/png' : 'video/mp4');
    if (media.url) {
      url = await this.storageService.uploadRemoteFile(media.url, filename, { folder, contentType: mimeType });
    } else if (media.data) {
      url = await this.storageService.uploadBuffer(media.data, filename, { folder, contentType: mimeType });
    } else {
      throw new BadRequestException('No media data available');
    }

    return await this.assetRepository.save(
      this.assetRepository.create({
        taskId: task.id,
        versionId: version.id,
        type,
        status: AssetStatus.ACTIVE,
        url,
        filename,
        filesize: media.data?.length,
        mimeType,
        metadataJson: JSON.stringify({ prompt, ...(metadata || {}) }),
      }),
    );
  }

  private async saveJsonAsset(
    run: WorkflowRun,
    type: AssetType,
    filename: string,
    payload: any,
  ): Promise<Asset> {
    const task = await this.taskRepository.findOne({ where: { id: run.taskId } });
    const version = await this.taskVersionRepository.findOne({ where: { id: run.taskVersionId } });
    if (!task || !version) throw new NotFoundException('Task not found');

    const folder = this.buildAssetFolder(task.userId, task.id, version.id, type);
    const buffer = Buffer.from(JSON.stringify(payload, null, 2));
    const url = await this.storageService.uploadBuffer(buffer, filename, {
      folder,
      contentType: 'application/json',
      isPublic: false,
    });

    return await this.assetRepository.save(
      this.assetRepository.create({
        taskId: task.id,
        versionId: version.id,
        type,
        status: AssetStatus.ACTIVE,
        url,
        filename,
        filesize: buffer.length,
        mimeType: 'application/json',
      }),
    );
  }

  private async saveMockFinal(run: WorkflowRun): Promise<Asset> {
    const payload = { status: 'final_compose', timestamp: new Date().toISOString() };
    return await this.saveJsonAsset(run, AssetType.FINAL_VIDEO, 'final.json', payload);
  }

  private buildAssetFolder(userId: number, taskId: number, versionId: number, type: AssetType): string {
    return `users/${userId}/tasks/${taskId}/versions/${versionId}/${type}`;
  }

  private buildFilename(prefix: string, ext: string): string {
    return `${prefix}_${Date.now()}.${ext}`;
  }

  private async fetchText(url: string): Promise<string> {
    const response = await axios.get<string>(url, { responseType: 'text' });
    return response.data;
  }

  private async fetchScriptText(run: WorkflowRun): Promise<string> {
    const scriptAsset = await this.getLatestAsset(
      run.taskId,
      run.taskVersionId,
      AssetType.ORIGINAL_SCRIPT,
    );
    if (!scriptAsset) {
      throw new NotFoundException('No script asset found');
    }
    return await this.fetchText(scriptAsset.url);
  }

  private async getLatestAsset(taskId: number, versionId: number, type: AssetType) {
    return await this.assetRepository.findOne({
      where: { taskId, versionId, type, status: AssetStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  }

  private async ensureTaskAccess(taskId: number, versionId: number, user: User) {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }
    if (task.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only access your own tasks');
    }
    const version = await this.taskVersionRepository.findOne({
      where: { id: versionId, taskId },
    });
    if (!version) {
      throw new NotFoundException(`TaskVersion with ID ${versionId} not found`);
    }
    return { task, version };
  }

  private async acquireLock(versionId: number, lockedBy: string) {
    const lockTimeoutMinutes = 30;
    const expiredAt = new Date(Date.now() - lockTimeoutMinutes * 60 * 1000);
    const result = await this.taskVersionRepository
      .createQueryBuilder()
      .update(TaskVersion)
      .set({ lockedBy, lockedAt: new Date() })
      .where('id = :id', { id: versionId })
      .andWhere('(lockedAt IS NULL OR lockedAt < :expiredAt)', { expiredAt })
      .execute();
    if (!result.affected) {
      throw new ConflictException('Task version is locked by another run');
    }
  }

  private async releaseLock(versionId: number) {
    await this.taskVersionRepository
      .createQueryBuilder()
      .update(TaskVersion)
      .set({ lockedBy: null, lockedAt: null })
      .where('id = :id', { id: versionId })
      .execute();
  }
}
