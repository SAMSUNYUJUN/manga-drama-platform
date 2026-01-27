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
  WorkflowTemplate,
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
  ProviderType,
  WorkflowNodeType,
  WorkflowRunStatus,
} from '@shared/constants';
import { AiOrchestratorService } from '../ai-service/orchestrator.service';
import { PromptService } from '../prompt/prompt.service';
import type { IStorageService } from '../storage/storage.interface';
import { Inject } from '@nestjs/common';
import { User } from '../database/entities';
import { InputAssetFile } from '../ai-service/types';
import { StartWorkflowRunDto, ReviewDecisionDto, ReviewUploadDto, HumanSelectDto, CreateWorkflowRunDto, NodeTestDto, WorkflowTestDto } from './dto';
import axios from 'axios';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { WorkflowValidationService } from './workflow-validation.service';
import { normalizeWorkflowVersion } from './workflow-utils';
import { TrashService } from '../asset/trash.service';
import { NodeToolService } from '../node-tool/node-tool.service';
import type { WorkflowTestNodeResult, WorkflowTestResult } from '@shared/types/workflow.types';

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
  private readonly workflowSpaceCache = new Map<number, number | null>();
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
    @InjectRepository(WorkflowTemplate)
    private templateRepository: Repository<WorkflowTemplate>,
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
    console.log(`[startRun] dto.startInputs: ${JSON.stringify(dto.startInputs)}`);
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
      inputJson: dto.startInputs ? JSON.stringify(dto.startInputs) : null,
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

    const assetType = (dto.assetType as AssetType) || AssetType.TASK_EXECUTION;
    const spaceId = await this.getWorkflowSpaceId(run);
    const folder = this.buildAssetFolder(task.userId, task.id, version.id, assetType, spaceId);
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
        spaceId,
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
          // Render system prompt if configured
          let systemPrompt: string | undefined;
          if (config.systemPromptVersionId) {
            const systemRendered = await this.promptService.renderPrompt({
              templateVersionId: config.systemPromptVersionId,
              variables: renderVariables,
            });
            systemPrompt = systemRendered.rendered;
          }
          const outputText = await this.aiService.generateText(
            rendered.rendered,
            config.model,
            systemPrompt,
            { maxTokens: config.maxTokens, temperature: config.temperature },
          );
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

  async testWorkflow(dto: WorkflowTestDto, user: User): Promise<WorkflowTestResult> {
    const startedAt = Date.now();
    const normalized = normalizeWorkflowVersion(dto.nodes || [], dto.edges || []);
    const nodes = normalized.nodes;
    const edges = normalized.edges;
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const outputsMap = new Map<string, Record<string, any>>();
    const nodeResults: WorkflowTestNodeResult[] = [];
    const startNode = nodes.find((node) => node.type === WorkflowNodeType.START);
    const endNode = nodes.find((node) => node.type === WorkflowNodeType.END);
    let testSpaceId: number | null = null;

    if (dto.templateId) {
      const template = await this.templateRepository.findOne({ where: { id: dto.templateId } });
      testSpaceId = template?.spaceId ?? null;
    }

    // 构建依赖图
    const inDegree: Record<string, number> = {};
    const dependents: Record<string, string[]> = {};
    
    nodes.forEach((node) => {
      inDegree[node.id] = 0;
      dependents[node.id] = [];
    });
    
    edges.forEach((edge) => {
      inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
      dependents[edge.source] = dependents[edge.source] || [];
      dependents[edge.source].push(edge.target);
    });

    const remainingInDegree = { ...inDegree };
    const completedNodes = new Set<string>();
    let failedNodeId: string | undefined;
    let failedError: string | undefined;

    // 处理 START 节点
    if (startNode) {
      const startInputs = this.applyDefaultInputs(startNode, dto.startInputs || {});
      outputsMap.set(startNode.id, startInputs);
      nodeResults.push({
        nodeId: startNode.id,
        nodeType: startNode.type,
        inputs: startInputs,
        outputs: startInputs,
        durationMs: 0,
      });
      completedNodes.add(startNode.id);
      // 更新下游节点入度
      for (const dep of dependents[startNode.id] || []) {
        remainingInDegree[dep] -= 1;
      }
    }

    // 获取当前可执行的节点
    const getReadyNodes = (): string[] => {
      return nodes
        .filter((n) => 
          remainingInDegree[n.id] === 0 && 
          !completedNodes.has(n.id) && 
          n.type !== WorkflowNodeType.START
        )
        .map((n) => n.id);
    };

    // 执行单个节点
    const executeTestNode = async (nodeId: string) => {
      const node = nodeMap.get(nodeId)!;
      const inputs = this.resolveTestInputs(node, edges, nodeMap, outputsMap);
      let outputs: Record<string, any> = {};
      let error: string | undefined;
      let durationMs = 0;

      if (node.type === WorkflowNodeType.HUMAN_BREAKPOINT) {
        outputs = this.resolveBreakpointOutput(node, inputs);
        nodeResults.push({
          nodeId: node.id,
          nodeType: node.type,
          inputs,
          outputs,
          durationMs,
        });
      } else if (node.type === WorkflowNodeType.END) {
        outputs = this.buildOutputVariables(node, inputs);
        nodeResults.push({
          nodeId: node.id,
          nodeType: node.type,
          inputs,
          outputs,
          durationMs,
        });
      } else {
        const result = await this.runWorkflowNodeTest(node, inputs);
        durationMs = result.durationMs;
        if (result.error) {
          error = result.error;
        }
        let assetUrls: string[] | undefined;
        let savedJsonAssets: { id: number; url: string; filename: string }[] | undefined;
        
        // Save media assets (image/video)
        if (this.hasAssetRefOutputs(node)) {
          const mediaUrls = this.collectTestMediaUrls(result.outputs);
          if (mediaUrls.length) {
            const assets = await this.saveTestMediaAssets(mediaUrls, user, testSpaceId, dto.templateId);
            assetUrls = assets.map((asset) => asset.url);
          }
        }
        
        // Save JSON assets for json/list<json> output types (use toolOutputs from result if available)
        const toolOutputs = result.outputs?.toolOutputs || [];
        const hasJsonOutput = toolOutputs.some((o: any) => o.type === 'json' || o.type === 'list<json>') || this.hasJsonOutputs(node);
        if (hasJsonOutput && result.outputs) {
          savedJsonAssets = await this.saveTestJsonAssetsWithToolOutputs(node, result.outputs, toolOutputs, user, testSpaceId, dto.templateId);
        }
        
        const primaryOutput = this.getPrimaryOutputValue(node, result.outputs);
        outputs = this.buildOutputVariables(node, primaryOutput, undefined, assetUrls);
        nodeResults.push({
          nodeId: node.id,
          nodeType: node.type,
          inputs,
          outputs,
          rawOutputs: result.outputs,
          savedJsonAssets,
          error,
          durationMs,
        });
      }

      return { nodeId, outputs, error };
    };

    // 主循环：按层级并行执行
    while (true) {
      const readyNodes = getReadyNodes();
      
      if (readyNodes.length === 0) {
        break; // 没有更多可执行的节点
      }

      console.log(`[testWorkflow] Executing batch: [${readyNodes.join(', ')}]`);
      
      // 并行执行当前批次的所有节点
      const results = await Promise.all(readyNodes.map(executeTestNode));
      
      // 处理结果
      for (const result of results) {
        outputsMap.set(result.nodeId, result.outputs);
        
        if (result.error) {
          failedNodeId = result.nodeId;
          failedError = result.error;
          // 失败时立即返回
          return {
            ok: false,
            endNodeId: endNode?.id,
            finalOutput: endNode ? outputsMap.get(endNode.id) : result.outputs,
            nodeResults,
            error: failedError,
            failedNodeId,
            durationMs: Date.now() - startedAt,
          };
        }
        
        completedNodes.add(result.nodeId);
        // 更新下游节点入度
        for (const dep of dependents[result.nodeId] || []) {
          remainingInDegree[dep] -= 1;
        }
      }
    }

    const finalOutput = endNode ? outputsMap.get(endNode.id) : undefined;
    return {
      ok: true,
      endNodeId: endNode?.id,
      finalOutput: finalOutput || {},
      nodeResults,
      durationMs: Date.now() - startedAt,
    };
  }

  private resolveTestInputs(
    node: any,
    edges: any[],
    nodeMap: Map<string, any>,
    outputsMap: Map<string, Record<string, any>>,
  ) {
    const incomingEdges = edges.filter((edge) => edge.target === node.id);
    if (!incomingEdges.length) {
      return this.applyDefaultInputs(node, {});
    }
    const variables: Record<string, any> = {};
    incomingEdges.forEach((edge) => {
      const sourceNode = nodeMap.get(edge.source);
      if (!sourceNode) return;
      const fallbackKey =
        sourceNode.type === WorkflowNodeType.START
          ? sourceNode.data?.inputs?.[0]?.key
          : sourceNode.data?.outputs?.[0]?.key;
      const sourceKey = edge.sourceOutputKey || fallbackKey;
      const sourceOutputs = outputsMap.get(edge.source) || {};
      let value = sourceKey ? sourceOutputs[sourceKey] : undefined;
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
    });
    return this.applyDefaultInputs(node, variables);
  }

  private resolveBreakpointOutput(node: any, inputs: Record<string, any>) {
    const config = node.data?.config || {};
    const selectionMode = config.selectionMode || (config.multiSelect ? 'multiple' : 'single');
    const inputKey = node.data?.inputs?.[0]?.key;
    const value = inputKey ? inputs[inputKey] : undefined;
    if (selectionMode === 'multiple') {
      return this.buildOutputVariables(node, Array.isArray(value) ? value : value !== undefined ? [value] : []);
    }
    const selected = Array.isArray(value) ? value[0] : value;
    return this.buildOutputVariables(node, selected);
  }

  private getPrimaryOutputValue(node: any, outputs: any) {
    if (!outputs) return outputs;
    const definedOutputs = node.data?.outputs || [];
    for (const output of definedOutputs) {
      if (output.key in outputs) {
        return outputs[output.key];
      }
    }
    if (typeof outputs.outputText === 'string') return outputs.outputText;
    if (Array.isArray(outputs.mediaUrls)) return outputs.mediaUrls;
    if (Array.isArray(outputs.images)) return outputs.images;
    if (Array.isArray(outputs.videos)) return outputs.videos;
    if (typeof outputs.output === 'string' || Array.isArray(outputs.output)) return outputs.output;
    return outputs;
  }

  private async runWorkflowNodeTest(node: any, inputs: Record<string, any>) {
    const start = Date.now();
    const config = node.data?.config || {};
    try {
      if (node.type === WorkflowNodeType.LLM_TOOL) {
        // 1. 首先从节点工具获取所有配置（作为基础配置）
        let tool: any;
        if (node.data?.toolId) {
          tool = await this.nodeToolService.getTool(node.data.toolId);
        }
        
        // 2. 使用节点工具配置作为默认值，节点级别配置可以覆盖
        const promptTemplateVersionId = config.promptTemplateVersionId ?? tool?.promptTemplateVersionId ?? undefined;
        const systemPromptVersionId = config.systemPromptVersionId ?? tool?.systemPromptVersionId ?? undefined;
        const model = config.model ?? tool?.model ?? undefined;
        const imageAspectRatio = config.imageAspectRatio ?? tool?.imageAspectRatio;
        const maxTokens = config.maxTokens ?? tool?.maxTokens ?? 1000;
        const temperature = config.temperature ?? tool?.temperature ?? 0.7;
        const toolOutputs = tool?.outputs || [];
        const modelConfig = config.modelConfig ?? tool?.modelConfig ?? undefined;
        
        if (!promptTemplateVersionId) {
          throw new BadRequestException('promptTemplateVersionId is required for LLM tool test');
        }
        const renderVariables = this.normalizePromptVariables(inputs);
        const rendered = await this.promptService.renderPrompt({
          templateVersionId: promptTemplateVersionId,
          variables: renderVariables,
        });
        // Render system prompt if configured
        let systemPrompt: string | undefined;
        if (systemPromptVersionId) {
          const systemRendered = await this.promptService.renderPrompt({
            templateVersionId: systemPromptVersionId,
            variables: renderVariables,
          });
          systemPrompt = systemRendered.rendered;
        }
        const providerType = await this.resolveToolProviderType(model, node, tool);
        if (providerType === ProviderType.IMAGE || providerType === ProviderType.VIDEO) {
          const inputAssetUrls = await this.collectAssetUrlsFromInputs(inputs);
          const assetInputs = (node.data?.inputs || tool?.inputs || []).filter(
            (input: any) => this.isImageValueType(input.type) || this.isImageListType(input.type),
          );
          const requiresAssetInput = assetInputs.some((input: any) => input.required);
          if (requiresAssetInput && !inputAssetUrls.length) {
            throw new BadRequestException('缺少图片输入');
          }
          const inputImages = await this.prepareInputImagesForModel(inputAssetUrls, model, { forceDataUri: false });
          const media =
            providerType === ProviderType.IMAGE
              ? await this.aiService.generateImage(rendered.rendered, model, inputImages, { imageAspectRatio, modelConfig })
              : await this.aiService.generateVideo(rendered.rendered, model, inputImages, { imageAspectRatio, modelConfig });
          const urls = media.map((item) =>
            item.url
              ? item.url
              : item.data
                ? `data:${item.mimeType || (providerType === ProviderType.IMAGE ? 'image/png' : 'video/mp4')};base64,${item.data.toString('base64')}`
                : '',
          );
          return {
            outputs: providerType === ProviderType.IMAGE ? { images: urls, renderedPrompt: rendered.rendered } : { videos: urls, renderedPrompt: rendered.rendered },
            durationMs: Date.now() - start,
          };
        }
        
        console.log('[runWorkflowNodeTest] LLM call params:', {
          model,
          hasSystemPrompt: !!systemPrompt,
          maxTokens,
          temperature,
          toolOutputTypes: toolOutputs.map((o: any) => `${o.key}:${o.type}`),
        });
        
        const outputText = await this.aiService.generateText(
          rendered.rendered,
          model,
          systemPrompt,
          { maxTokens, temperature },
        );
        return {
          outputs: { output: outputText, renderedPrompt: rendered.rendered, missingVariables: rendered.missingVariables, toolOutputs },
          durationMs: Date.now() - start,
        };
      }
      const result = await this.testNode({ nodeType: node.type, config, inputs });
      return { outputs: result.outputs, error: result.error, durationMs: result.durationMs };
    } catch (error: any) {
      return {
        outputs: null,
        error: this.formatWorkflowTestError(error, 'Workflow node test failed'),
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
      
      // 构建依赖图
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      const inDegree: Record<string, number> = {};
      const dependents: Record<string, string[]> = {}; // 每个节点完成后需要通知的下游节点
      
      nodes.forEach((node) => {
        inDegree[node.id] = 0;
        dependents[node.id] = [];
      });
      
      edges.forEach((edge) => {
        inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
        dependents[edge.source] = dependents[edge.source] || [];
        dependents[edge.source].push(edge.target);
      });

      // 跟踪每个节点的剩余入度（动态更新）
      const remainingInDegree = { ...inDegree };
      const completedNodes = new Set<string>();
      const failedNodes = new Set<string>();
      let paused = false;

      // 获取当前可执行的节点（入度为0且未完成）
      const getReadyNodes = (): string[] => {
        return nodes
          .filter((n) => remainingInDegree[n.id] === 0 && !completedNodes.has(n.id) && !failedNodes.has(n.id))
          .map((n) => n.id);
      };

      // 并行执行一批节点
      const executeBatch = async (nodeIds: string[]): Promise<boolean> => {
        const tasks = nodeIds.map(async (nodeId) => {
          const node = nodeMap.get(nodeId);
          if (!node) return { nodeId, success: true, paused: false };

          const nodeRun = await this.nodeRunRepository.findOne({
            where: { workflowRunId: runId, nodeId: node.id },
          });
          if (!nodeRun) return { nodeId, success: true, paused: false };

          // 已完成的跳过
          if (nodeRun.status === NodeRunStatus.SUCCEEDED) {
            return { nodeId, success: true, paused: false };
          }

          // 等待人工或暂停的节点
          if (nodeRun.status === NodeRunStatus.WAITING_HUMAN || nodeRun.status === NodeRunStatus.PAUSED) {
            return { nodeId, success: true, paused: true };
          }

          console.log(`[executeRun] Executing node: ${nodeId} (${node.type})`);
          
          try {
            const result = await this.executeNode(run, node, nodeRun, nodes, edges);
            
            if (result.status === NodeRunStatus.WAITING_HUMAN || result.status === NodeRunStatus.PAUSED) {
              return { nodeId, success: true, paused: true };
            }
            if (result.status === NodeRunStatus.FAILED) {
              return { nodeId, success: false, error: result.error, paused: false };
            }
            
            console.log(`[executeRun] Node completed: ${nodeId}`);
            return { nodeId, success: true, paused: false };
          } catch (error: any) {
            console.error(`[executeRun] Node failed: ${nodeId}`, error?.message);
            return { nodeId, success: false, error: error?.message, paused: false };
          }
        });

        const results = await Promise.all(tasks);
        
        // 处理结果
        for (const result of results) {
          if (result.paused) {
            paused = true;
          } else if (result.success) {
            completedNodes.add(result.nodeId);
            // 更新下游节点的入度
            for (const dependent of dependents[result.nodeId] || []) {
              remainingInDegree[dependent] -= 1;
            }
          } else {
            failedNodes.add(result.nodeId);
            await this.updateRunStatus(runId, WorkflowRunStatus.FAILED, result.nodeId, result.error);
            await this.releaseLock(run.taskVersionId);
            return false; // 有节点失败，停止执行
          }
        }

        return true; // 继续执行
      };

      // 主循环：按层级并行执行
      while (true) {
        // 检查运行状态
        const currentRun = await this.runRepository.findOne({ where: { id: runId } });
        if (!currentRun || currentRun.status !== WorkflowRunStatus.RUNNING) {
          return;
        }

        const readyNodes = getReadyNodes();
        
        if (readyNodes.length === 0) {
          // 没有可执行的节点了
          if (paused) {
            // 有节点暂停等待人工
            const pausedNodeId = nodes.find(
              (n) => !completedNodes.has(n.id) && !failedNodes.has(n.id)
            )?.id;
            await this.updateRunStatus(runId, WorkflowRunStatus.PAUSED, pausedNodeId || null);
            return;
          }
          // 全部完成
          break;
        }

        console.log(`[executeRun] Executing batch: [${readyNodes.join(', ')}]`);
        await this.updateRunStatus(runId, WorkflowRunStatus.RUNNING, readyNodes[0]);
        
        const shouldContinue = await executeBatch(readyNodes);
        if (!shouldContinue) {
          return; // 执行失败，已在 executeBatch 中处理
        }

        await this.updateStageIfReady(run, {
          ...templateVersion,
          nodes,
          edges,
          metadata: templateVersion.metadata,
        });
      }

      // 全部成功完成
      await this.updateRunStatus(runId, WorkflowRunStatus.SUCCEEDED, null);
      await this.updateTaskStage(run.taskId, run.taskVersionId, TaskStage.COMPLETED);
      await this.updateTaskStatus(run.taskId, TaskStatus.COMPLETED);
      await this.releaseLock(run.taskVersionId);
    } finally {
      this.processingRuns.delete(runId);
      this.workflowSpaceCache.delete(runId);
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
          console.log(`[START] run.input: ${JSON.stringify(run.input)}`);
          console.log(`[START] inputVariables: ${JSON.stringify(inputVariables)}`);
          nodeRun.output = { variables: this.buildOutputVariables(node, inputVariables) };
          nodeRun.status = NodeRunStatus.SUCCEEDED;
          nodeRun.endedAt = new Date();
          await this.nodeRunRepository.save(nodeRun);
          return nodeRun;
        }
        case WorkflowNodeType.LLM_TOOL: {
          const toolConfig = node.data?.config || {};
          
          // 1. 首先从节点工具获取所有配置（作为基础配置）
          let tool: any;
          if (node.data?.toolId) {
            tool = await this.nodeToolService.getTool(node.data.toolId);
          }
          
          // 2. 使用节点工具配置作为默认值，节点级别配置可以覆盖
          const promptTemplateVersionId = toolConfig.promptTemplateVersionId ?? tool?.promptTemplateVersionId ?? undefined;
          const systemPromptVersionId = toolConfig.systemPromptVersionId ?? tool?.systemPromptVersionId ?? undefined;
          const model = toolConfig.model ?? tool?.model ?? undefined;
          const maxTokens = toolConfig.maxTokens ?? tool?.maxTokens ?? 1000;
          const temperature = toolConfig.temperature ?? tool?.temperature ?? 0.7;
          const imageAspectRatio = toolConfig.imageAspectRatio ?? tool?.imageAspectRatio;
          const modelConfig = toolConfig.modelConfig ?? tool?.modelConfig ?? undefined;
          
          if (!promptTemplateVersionId) {
            throw new BadRequestException('LLM tool missing prompt template version');
          }
          
          console.log(`[LLM_TOOL executeNode] params:`, {
            toolId: node.data?.toolId,
            model,
            hasSystemPrompt: !!systemPromptVersionId,
            maxTokens,
            temperature,
          });
          
          const renderVariables = this.normalizePromptVariables(inputVariables);
          console.log(`[LLM_TOOL] inputVariables: ${JSON.stringify(inputVariables)}`);
          console.log(`[LLM_TOOL] renderVariables: ${JSON.stringify(renderVariables)}`);
          const rendered = await this.promptService.renderPrompt({
            templateVersionId: promptTemplateVersionId,
            variables: renderVariables,
          });
          // Render system prompt if configured
          let systemPrompt: string | undefined;
          if (systemPromptVersionId) {
            const systemRendered = await this.promptService.renderPrompt({
              templateVersionId: systemPromptVersionId,
              variables: renderVariables,
            });
            systemPrompt = systemRendered.rendered;
          }
          console.log(`[LLM_TOOL] rendered prompt: ${JSON.stringify(rendered.rendered).slice(0, 200)}`);
          const providerType = await this.resolveToolProviderType(model, node, tool);
          console.log(`[LLM_TOOL] providerType: ${providerType}`);
          const nodeName = this.getNodeLabel(node);
          if (providerType === ProviderType.IMAGE || providerType === ProviderType.VIDEO) {
            console.log(`[LLM_TOOL] Generating media assets...`);
            const inputAssetUrls = await this.collectAssetUrlsFromInputs(inputVariables);
            const inputImages = await this.prepareInputImagesForModel(inputAssetUrls, model);
            const count = toolConfig.outputCount || 1;
            const assets = await this.generateMediaAssets(
              run,
              AssetType.TASK_EXECUTION,
              rendered.rendered,
              count,
              providerType === ProviderType.IMAGE ? 'image' : 'video',
              undefined,
              model,
              inputImages,
              nodeName,
              { imageAspectRatio, modelConfig },
            );
            console.log(`[LLM_TOOL] Generated ${assets.length} assets`);
            const assetIds = assets.map((asset) => asset.id);
            const assetUrls = assets.map((asset) => asset.url);
            nodeRun.output = {
              assetIds,
              providerTaskId: null,
              logs: [],
              variables: this.buildOutputVariables(node, assetUrls, assetIds, assetUrls),
            };
          } else {
            const outputText = await this.aiService.generateText(
              rendered.rendered,
              model,
              systemPrompt,
              { maxTokens, temperature },
            );
            const outputDef = node.data?.outputs?.[0];
            const outputType = outputDef?.type || 'text';
            let savedAssets: Asset[] = [];
            let outputValue: any = outputText;

            // 根据输出类型保存文件
            if (outputType === 'json') {
              try {
                const parsed = JSON.parse(outputText);
                outputValue = parsed;
                const asset = await this.saveJsonAsset(
                  run,
                  AssetType.TASK_EXECUTION,
                  `${nodeName}.json`,
                  parsed,
                  nodeName,
                );
                savedAssets.push(asset);
              } catch {
                // 如果解析失败，保存为文本
                const asset = await this.saveTextAsset(run, AssetType.TASK_EXECUTION, outputText, nodeName);
                savedAssets.push(asset);
              }
            } else if (outputType === 'list<json>') {
              try {
                const parsed = JSON.parse(outputText);
                const items = Array.isArray(parsed) ? parsed : [parsed];
                outputValue = items;
                const asset = await this.saveJsonlAsset(
                  run,
                  AssetType.TASK_EXECUTION,
                  items,
                  nodeName,
                );
                savedAssets.push(asset);
              } catch {
                // 解析失败，保存为文本
                const asset = await this.saveTextAsset(run, AssetType.TASK_EXECUTION, outputText, nodeName);
                savedAssets.push(asset);
              }
            } else if (outputType === 'asset_ref') {
              // 输出是单个 URL，下载并保存
              if (outputText && typeof outputText === 'string' && outputText.trim()) {
                const asset = await this.downloadAndSaveAsset(
                  run,
                  AssetType.TASK_EXECUTION,
                  outputText.trim(),
                  nodeName,
                );
                savedAssets.push(asset);
                outputValue = asset.url;
              }
            } else if (outputType === 'list<asset_ref>') {
              // 输出是 URL 列表
              try {
                const parsed = JSON.parse(outputText);
                const urls = Array.isArray(parsed) ? parsed : [parsed];
                outputValue = [];
                for (const url of urls) {
                  if (url && typeof url === 'string' && url.trim()) {
                    const asset = await this.downloadAndSaveAsset(
                      run,
                      AssetType.TASK_EXECUTION,
                      url.trim(),
                      nodeName,
                    );
                    savedAssets.push(asset);
                    outputValue.push(asset.url);
                  }
                }
              } catch {
                // 解析失败，尝试按行分割
                const urls = outputText.split('\\n').map((line) => line.trim()).filter(Boolean);
                outputValue = [];
                for (const url of urls) {
                  if (url.startsWith('http')) {
                    const asset = await this.downloadAndSaveAsset(
                      run,
                      AssetType.TASK_EXECUTION,
                      url,
                      nodeName,
                    );
                    savedAssets.push(asset);
                    outputValue.push(asset.url);
                  }
                }
              }
            } else {
              // 默认保存为文本
              const asset = await this.saveTextAsset(run, AssetType.TASK_EXECUTION, outputText, nodeName);
              savedAssets.push(asset);
            }

            nodeRun.output = {
              assetIds: savedAssets.map((a) => a.id),
              variables: this.buildOutputVariables(node, outputValue),
              logs: [],
            };
          }
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
            AssetType.TASK_EXECUTION,
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
          const nodeName = this.getNodeLabel(node);
          const assets = await this.generateMediaAssets(
            run,
            AssetType.TASK_EXECUTION,
            prompt,
            count,
            'image',
            undefined,
            config.model,
            undefined,
            nodeName,
          );
          const assetIds = assets.map((asset) => asset.id);
          const assetUrls = assets.map((asset) => asset.url);
          nodeRun.output = {
            assetIds,
            providerTaskId: null,
            logs: [],
            variables: this.buildOutputVariables(node, assetUrls, assetIds, assetUrls),
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
          const nodeName = this.getNodeLabel(node);
          const assets = await this.generateMediaAssets(
            run,
            AssetType.TASK_EXECUTION,
            prompt,
            1,
            'image',
            undefined,
            config.model,
            undefined,
            nodeName,
          );
          const assetIds = assets.map((asset) => asset.id);
          const assetUrls = assets.map((asset) => asset.url);
          nodeRun.output = {
            assetIds,
            providerTaskId: null,
            logs: [],
            variables: this.buildOutputVariables(node, assetUrls[0], assetIds, assetUrls),
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
          const nodeName = this.getNodeLabel(node);
          const assets = await this.generateMediaAssets(
            run,
            AssetType.TASK_EXECUTION,
            prompt,
            1,
            'image',
            undefined,
            config.model,
            undefined,
            nodeName,
          );
          const assetIds = assets.map((asset) => asset.id);
          const assetUrls = assets.map((asset) => asset.url);
          nodeRun.output = {
            assetIds,
            providerTaskId: null,
            logs: [],
            variables: this.buildOutputVariables(node, assetUrls, assetIds, assetUrls),
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
          const nodeName = this.getNodeLabel(node);
          const assets = await this.generateMediaAssets(
            run,
            AssetType.TASK_EXECUTION,
            prompt,
            1,
            'video',
            { duration },
            config.model,
            undefined,
            nodeName,
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
          const outputVariables = this.buildOutputVariables(node, inputVariables);
          const persisted = await this.persistEndNodeAssets(run, node, outputVariables);
          nodeRun.output = { variables: persisted.outputs, assetIds: persisted.assetIds };
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
    assetUrls?: string[],
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
      variables[output.key] = this.coerceValueForType(output.type, fallback, assetIds, assetUrls);
    });
    return variables;
  }

  private coerceValueForType(
    type: string,
    value: any,
    assetIds?: number[],
    assetUrls?: string[],
  ) {
    if (type === 'list<asset_ref>' || type === 'list<asset_file>') {
      if (assetUrls && assetUrls.length) return assetUrls;
      if (assetIds && assetIds.length) return assetIds;
      if (value && typeof value === 'object' && Array.isArray((value as any).mediaUrls)) {
        return (value as any).mediaUrls;
      }
      if (value && typeof value === 'object' && Array.isArray((value as any).images)) {
        return (value as any).images;
      }
      if (Array.isArray(value)) return value;
      return value !== undefined ? [value] : [];
    }
    if (type.startsWith('list<')) {
      if (Array.isArray(value)) return value;
      if (assetIds) return assetIds;
      return value !== undefined ? [value] : [];
    }
    if (type === 'asset_ref' || type === 'asset_file') {
      if (assetUrls && assetUrls.length) return assetUrls[0];
      if (typeof value === 'number') return value;
      if (Array.isArray(assetIds) && assetIds.length) return assetIds[0];
      if (Array.isArray(value)) return value[0];
      if (value && typeof value === 'object') {
        if (typeof (value as any).url === 'string') return (value as any).url;
        if (Array.isArray((value as any).mediaUrls)) return (value as any).mediaUrls[0];
        if (Array.isArray((value as any).images)) return (value as any).images[0];
      }
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

  private isImageValueType(type?: string) {
    return type === 'asset_ref' || type === 'asset_file';
  }

  private isImageListType(type?: string) {
    return type === 'list<asset_ref>' || type === 'list<asset_file>';
  }

  private isVideoValueType(type?: string) {
    return type === 'video_ref' || type === 'video';
  }

  private isVideoListType(type?: string) {
    return type === 'list<video_ref>' || type === 'list<video>';
  }

  private isMediaType(type?: string) {
    return this.isImageValueType(type) || this.isImageListType(type) || 
           this.isVideoValueType(type) || this.isVideoListType(type);
  }

  private resolveToolOutputs(node: any, tool?: any) {
    if (node?.data?.outputs?.length) return node.data.outputs;
    if (tool?.outputs?.length) return tool.outputs;
    return [];
  }

  private async resolveToolProviderType(model: string | undefined, node: any, tool?: any) {
    const resolved = model ? await this.aiService.resolveProviderType(model) : null;
    if (resolved && resolved !== ProviderType.LLM) {
      return resolved;
    }
    const outputs = this.resolveToolOutputs(node, tool);
    if (outputs.some((output: any) => this.isImageValueType(output.type) || this.isImageListType(output.type))) {
      return ProviderType.IMAGE;
    }
    return resolved ?? ProviderType.LLM;
  }

  private async collectAssetUrlsFromInputs(values: Record<string, any>) {
    const urls: string[] = [];
    const ids: number[] = [];
    const pushUrl = (candidate: any) => {
      if (typeof candidate === 'string' && this.isAssetUrl(candidate)) {
        urls.push(candidate);
      }
    };
    Object.values(values || {}).forEach((value) => {
      if (typeof value === 'number') {
        ids.push(value);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (typeof item === 'number') ids.push(item);
          if (typeof item === 'string') pushUrl(item);
          if (item && typeof item === 'object') {
            const url = item.image_url?.url || item.video_url?.url || item.url;
            pushUrl(url);
          }
        });
        return;
      }
      if (typeof value === 'string') {
        pushUrl(value);
        return;
      }
      if (value && typeof value === 'object') {
        const url = value.image_url?.url || value.video_url?.url || value.url;
        pushUrl(url);
      }
    });

    if (ids.length) {
      const assets = await this.assetRepository.find({ where: { id: In(ids) } });
      assets.forEach((asset) => urls.push(asset.url));
    }
    return urls;
  }

  private isAssetUrl(value: string) {
    return /^(https?:\/\/|data:image\/|data:video\/)/i.test(value);
  }

  private hasAssetRefOutputs(node: any) {
    const outputs = node.data?.outputs || [];
    return outputs.some(
      (output: any) => this.isMediaType(output.type),
    );
  }

  /**
   * Check if node has json or list<json> outputs
   */
  private hasJsonOutputs(node: any) {
    const outputs = node.data?.outputs || [];
    return outputs.some(
      (output: any) => output.type === 'json' || output.type === 'list<json>',
    );
  }

  /**
   * Save JSON outputs as assets for workflow test
   */
  private async saveTestJsonAssets(
    node: any,
    outputs: any,
    user: User,
    spaceId?: number | null,
    templateId?: number,
  ): Promise<{ id: number; url: string; filename: string }[]> {
    const outputDefs = (node.data?.outputs || []).filter(
      (o: any) => o.type === 'json' || o.type === 'list<json>',
    );
    const savedAssets: { id: number; url: string; filename: string }[] = [];
    
    for (const outputDef of outputDefs) {
      const value = outputs?.[outputDef.key] ?? outputs?.output;
      if (value === undefined || value === null) continue;
      
      // Try to parse if it's a string
      let jsonValue = value;
      if (typeof value === 'string') {
        try {
          jsonValue = JSON.parse(value);
        } catch {
          // Keep as string if parsing fails
          continue;
        }
      }
      
      const isList = outputDef.type === 'list<json>';
      
      let content: string;
      let mimeType: string;
      let ext: string;
      
      if (isList) {
        const items = Array.isArray(jsonValue) ? jsonValue : [jsonValue];
        content = items.map(item => JSON.stringify(item)).join('\n');
        mimeType = 'application/x-ndjson';
        ext = 'jsonl';
      } else {
        content = JSON.stringify(jsonValue, null, 2);
        mimeType = 'application/json';
        ext = 'json';
      }
      
      // Use same filename format as other assets: {prefix}_{timestamp}.{ext}
      const filenamePrefix = outputDef.key || 'workflow_test';
      const filename = this.buildFilename(filenamePrefix, ext);
      const buffer = Buffer.from(content, 'utf-8');
      const folder = this.buildWorkflowTestFolder(user.id, spaceId, templateId);
      
      const url = await this.storageService.uploadBuffer(buffer, filename, {
        folder,
        contentType: mimeType,
        isPublic: false,
      });
      
      const asset = await this.assetRepository.save(
        this.assetRepository.create({
          taskId: null,
          versionId: null,
          spaceId: spaceId ?? null,
          type: AssetType.WORKFLOW_TEST,
          status: AssetStatus.ACTIVE,
          url,
          filename,
          filesize: buffer.length,
          mimeType,
          metadataJson: JSON.stringify({
            workflowTest: true,
            templateId: templateId ?? null,
            nodeId: node.id,
            outputKey: outputDef.key,
            isList,
          }),
        }),
      );
      
      savedAssets.push({
        id: asset.id,
        url: asset.url,
        filename: asset.filename,
      });
    }
    
    return savedAssets;
  }

  /**
   * Save JSON assets using tool outputs definition (preferred) or node outputs
   */
  private async saveTestJsonAssetsWithToolOutputs(
    node: any,
    outputs: any,
    toolOutputs: any[],
    user: User,
    spaceId?: number | null,
    templateId?: number,
  ): Promise<{ id: number; url: string; filename: string }[]> {
    // Use tool outputs if available, otherwise fall back to node outputs
    const outputDefs = toolOutputs.length > 0 
      ? toolOutputs.filter((o: any) => o.type === 'json' || o.type === 'list<json>')
      : (node.data?.outputs || []).filter((o: any) => o.type === 'json' || o.type === 'list<json>');
    
    const savedAssets: { id: number; url: string; filename: string }[] = [];
    
    for (const outputDef of outputDefs) {
      // Try to get value from outputs by key, or use 'output' as fallback for LLM text output
      const value = outputs?.[outputDef.key] ?? outputs?.output;
      if (value === undefined || value === null) continue;
      
      // Try to parse if it's a string
      let jsonValue = value;
      if (typeof value === 'string') {
        try {
          jsonValue = JSON.parse(value);
        } catch {
          // Keep raw string if parsing fails - still save it
          console.log('[saveTestJsonAssetsWithToolOutputs] JSON parse failed, saving raw text');
        }
      }
      
      const isList = outputDef.type === 'list<json>';
      
      let content: string;
      let mimeType: string;
      let ext: string;
      
      if (isList) {
        const items = Array.isArray(jsonValue) ? jsonValue : [jsonValue];
        content = items.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n');
        mimeType = 'application/x-ndjson';
        ext = 'jsonl';
      } else {
        content = typeof jsonValue === 'string' ? jsonValue : JSON.stringify(jsonValue, null, 2);
        mimeType = 'application/json';
        ext = 'json';
      }
      
      // Use same filename format as other assets: {prefix}_{timestamp}.{ext}
      const filenamePrefix = outputDef.key || 'workflow_test';
      const filename = this.buildFilename(filenamePrefix, ext);
      const buffer = Buffer.from(content, 'utf-8');
      const folder = this.buildWorkflowTestFolder(user.id, spaceId, templateId);
      
      console.log('[saveTestJsonAssetsWithToolOutputs] Saving JSON asset:', { 
        outputKey: outputDef.key, 
        type: outputDef.type, 
        filename, 
        contentLength: content.length 
      });
      
      const url = await this.storageService.uploadBuffer(buffer, filename, {
        folder,
        contentType: mimeType,
        isPublic: false,
      });
      
      const asset = await this.assetRepository.save(
        this.assetRepository.create({
          taskId: null,
          versionId: null,
          spaceId: spaceId ?? null,
          type: AssetType.WORKFLOW_TEST,
          status: AssetStatus.ACTIVE,
          url,
          filename,
          filesize: buffer.length,
          mimeType,
          metadataJson: JSON.stringify({
            workflowTest: true,
            templateId: templateId ?? null,
            nodeId: node.id,
            outputKey: outputDef.key,
            isList,
          }),
        }),
      );
      
      savedAssets.push({
        id: asset.id,
        url: asset.url,
        filename: asset.filename,
      });
      
      console.log('[saveTestJsonAssetsWithToolOutputs] JSON asset saved:', asset.id, asset.url);
    }
    
    return savedAssets;
  }

  private collectTestMediaUrls(outputs: any): { url: string; mediaType: 'image' | 'video' }[] {
    const results: { url: string; mediaType: 'image' | 'video' }[] = [];
    const pushUrl = (value: string, mediaType: 'image' | 'video') => {
      if (this.isAssetUrl(value)) {
        results.push({ url: value, mediaType });
      }
    };
    const pushFromValue = (value: any, mediaType: 'image' | 'video') => {
      if (typeof value === 'string') {
        pushUrl(value, mediaType);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (typeof item === 'string') pushUrl(item, mediaType);
        });
      }
    };
    if (outputs && typeof outputs === 'object') {
      // 根据 key 判断媒体类型
      if (outputs.images) {
        pushFromValue(outputs.images, 'image');
      }
      if (outputs.videos) {
        pushFromValue(outputs.videos, 'video');
      }
      // 兼容其他格式
      Object.entries(outputs).forEach(([key, value]) => {
        if (key === 'images' || key === 'videos') return; // 已处理
        const mediaType = key.toLowerCase().includes('video') ? 'video' : 'image';
        pushFromValue(value, mediaType);
      });
    }
    // 去重
    const seen = new Set<string>();
    return results.filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }

  private async saveTestMediaAssets(
    mediaItems: { url: string; mediaType: 'image' | 'video' }[],
    user: User,
    spaceId?: number | null,
    templateId?: number,
  ) {
    const folder = this.buildWorkflowTestFolder(user.id, spaceId, templateId);
    const assets: Asset[] = [];
    for (const { url, mediaType } of mediaItems) {
      const parsed = this.parseDataUri(url);
      // 优先使用传入的 mediaType，其次从 data URI 推断
      const actualMediaType = parsed?.mimeType?.startsWith('video/') ? 'video' : 
                              parsed?.mimeType?.startsWith('image/') ? 'image' : mediaType;
      const ext = this.inferExtension(actualMediaType, parsed?.mimeType, url);
      const filename = `test_${Date.now()}_${Math.random().toString(16).slice(2, 8)}.${ext}`;
      const mimeType = parsed?.mimeType || this.guessMimeType(actualMediaType, ext);
      let storedUrl: string;
      let filesize: number | undefined;
      
      // 只有 data URI 才上传到本地存储，远程 URL 直接使用（避免服务器端下载超时）
      if (parsed) {
        try {
          storedUrl = await this.storageService.uploadBuffer(parsed.buffer, filename, {
            folder,
            contentType: mimeType,
          });
          filesize = parsed.buffer.length;
        } catch (e: any) {
          console.warn(`[saveTestMediaAssets] 上传失败，回退使用 data URI: ${e?.message || e}`);
          storedUrl = url;
        }
      } else {
        // 远程 URL 直接使用，不尝试下载（服务器端通常无法访问 CDN）
        storedUrl = url;
      }
      
      const asset = await this.assetRepository.save(
        this.assetRepository.create({
          taskId: null,
          versionId: null,
          spaceId: spaceId ?? null,
          type: AssetType.WORKFLOW_TEST,
          status: AssetStatus.ACTIVE,
          url: storedUrl,
          filename,
          filesize,
          mimeType,
          metadataJson: JSON.stringify({
            sourceUrl: url,
            workflowTest: true,
            templateId: templateId ?? null,
          }),
        }),
      );
      assets.push(asset);
    }
    return assets;
  }

  private async persistEndNodeAssets(
    run: WorkflowRun,
    node: any,
    outputs: Record<string, any>,
  ): Promise<{ outputs: Record<string, any>; assetIds: number[] }> {
    const outputDefs = node.data?.outputs || [];
    const resolvedOutputs = { ...outputs };
    const savedAssetIds: number[] = [];
    const spaceId = await this.getWorkflowSpaceId(run);
    const nodeName = 'END';

    // 处理所有输出类型
    for (const outputDef of outputDefs) {
      const value = outputs?.[outputDef.key];
      if (value === undefined || value === null) continue;

      const type = outputDef.type as string;
      
      // image/list<image>/video/list<video> 类型保存媒体资产
      const isImageType = this.isImageValueType(type) || this.isImageListType(type);
      const isVideoType = this.isVideoValueType(type) || this.isVideoListType(type);
      if (isImageType || isVideoType) {
        const urls = Array.isArray(value) ? value : [value];
        const resolvedUrls: string[] = [];
        
        for (const item of urls) {
          if (typeof item === 'number') {
            // 已保存的 asset id
            const asset = await this.assetRepository.findOne({ where: { id: item } });
            if (asset) {
              resolvedUrls.push(asset.url);
              savedAssetIds.push(asset.id);
            }
          } else if (typeof item === 'string' && this.isAssetUrl(item)) {
            // 检查是否已经是本地存储的资产（避免重复保存）
            const existingAsset = await this.assetRepository.findOne({ 
              where: { url: item, status: AssetStatus.ACTIVE } 
            });
            if (existingAsset) {
              // 已存在的资产，直接引用
              resolvedUrls.push(existingAsset.url);
              savedAssetIds.push(existingAsset.id);
            } else {
              // 新资产，需要保存
              // 根据 URL 内容智能检测媒体类型
              const parsed = this.parseDataUri(item);
              const detectedMediaType = this.inferMediaType(item, parsed?.mimeType);
              const saved = await this.saveOutputMediaAsset(run, item, detectedMediaType, {
                nodeId: node.id,
                outputKey: outputDef.key,
              }, nodeName);
              resolvedUrls.push(saved.url);
              savedAssetIds.push(saved.id);
            }
          }
        }
        
        if (resolvedUrls.length) {
          resolvedOutputs[outputDef.key] = (this.isImageListType(type) || this.isVideoListType(type)) ? resolvedUrls : resolvedUrls[0];
        }
      }
      // json 类型保存 JSON 文件
      else if (type === 'json') {
        const jsonContent = typeof value === 'string' ? value : JSON.stringify(value);
        const asset = await this.saveJsonAsset(
          run,
          AssetType.TASK_EXECUTION,
          `${nodeName}_${outputDef.key}.json`,
          typeof value === 'string' ? JSON.parse(value) : value,
          `${nodeName}_${outputDef.key}`,
        );
        savedAssetIds.push(asset.id);
        resolvedOutputs[`${outputDef.key}_assetId`] = asset.id;
        resolvedOutputs[`${outputDef.key}_url`] = asset.url;
      }
      // text 类型保存文本文件
      else if (type === 'text') {
        const textContent = typeof value === 'string' ? value : JSON.stringify(value);
        const asset = await this.saveTextAsset(
          run,
          AssetType.TASK_EXECUTION,
          textContent,
          `${nodeName}_${outputDef.key}`,
        );
        savedAssetIds.push(asset.id);
        resolvedOutputs[`${outputDef.key}_assetId`] = asset.id;
        resolvedOutputs[`${outputDef.key}_url`] = asset.url;
      }
    }

    return { outputs: resolvedOutputs, assetIds: savedAssetIds };
  }

  private async saveOutputMediaAsset(
    run: WorkflowRun,
    sourceUrl: string,
    mediaType: 'image' | 'video',
    metadata: Record<string, any>,
    nodeName?: string,
  ): Promise<Asset> {
    const parsed = this.parseDataUri(sourceUrl);
    const assetType = mediaType === 'video' ? AssetType.TASK_EXECUTION : AssetType.TASK_EXECUTION;
    
    if (parsed) {
      // 从 data URI 的 mimeType 推断实际类型
      const actualMediaType = parsed.mimeType.startsWith('video/') ? 'video' : 'image';
      return await this.saveMediaResult(
        run,
        actualMediaType === 'video' ? AssetType.TASK_EXECUTION : AssetType.TASK_EXECUTION,
        { data: parsed.buffer, mimeType: parsed.mimeType },
        actualMediaType,
        metadata,
        nodeName,
      );
    }
    const ext = this.inferExtension(mediaType, undefined, sourceUrl);
    const mimeType = this.guessMimeType(mediaType, ext);
    return await this.saveMediaResult(
      run,
      assetType,
      { url: sourceUrl, mimeType },
      mediaType,
      metadata,
      nodeName,
    );
  }

  private buildWorkflowTestFolder(userId: number, spaceId?: number | null, templateId?: number) {
    const suffix = templateId ? `template-${templateId}` : 'adhoc';
    if (spaceId) {
      return `users/${userId}/spaces/${spaceId}/workflow-tests/${suffix}`;
    }
    return `users/${userId}/workflow-tests/${suffix}`;
  }

  private parseDataUri(url: string) {
    if (!url.startsWith('data:')) return null;
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const mimeType = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    return { mimeType, buffer };
  }

  private inferMediaType(url: string, mimeType?: string): 'image' | 'video' {
    if (mimeType?.startsWith('video/')) return 'video';
    if (mimeType?.startsWith('image/')) return 'image';
    // 检查 URL 扩展名
    if (/\.mp4|\.webm|\.mov|\.mkv|\.avi|\.m4v/i.test(url)) return 'video';
    if (/\.png|\.jpg|\.jpeg|\.gif|\.webp|\.bmp/i.test(url)) return 'image';
    // 检查 URL 中是否包含视频相关的关键词（用于无扩展名的 CDN URL）
    if (/video|\.mp4|mp4|mov|webm/i.test(url)) return 'video';
    return 'image';
  }

  private inferExtension(mediaType: 'image' | 'video', mimeType?: string, url?: string) {
    if (mimeType) {
      const ext = mimeType.split('/')[1];
      if (ext) return ext.replace('+xml', '');
    }
    if (url) {
      const ext = path.extname(url.split('?')[0]).replace('.', '');
      if (ext) return ext;
    }
    return mediaType === 'video' ? 'mp4' : 'png';
  }

  private guessMimeType(mediaType: 'image' | 'video', ext?: string) {
    if (ext) {
      const normalized = ext.toLowerCase();
      if (normalized === 'jpg' || normalized === 'jpeg') return 'image/jpeg';
      if (normalized === 'png') return 'image/png';
      if (normalized === 'webp') return 'image/webp';
      if (normalized === 'mp4') return 'video/mp4';
      if (normalized === 'webm') return 'video/webm';
    }
    return mediaType === 'video' ? 'video/mp4' : 'image/png';
  }

  private async prepareInputImagesForModel(
    urls: string[],
    model?: string,
    options?: { forceDataUri?: boolean },
  ) {
    if (!urls.length) return urls;
    const useDataUri = options?.forceDataUri;
    if (!useDataUri) return urls;
    const dataUris = await Promise.all(urls.map((url) => this.toImageDataUri(url)));
    return dataUris;
  }

  private formatWorkflowTestError(error: any, fallback: string) {
    if (!error) return fallback;
    const responseData = error?.response?.data;
    const responseMessage =
      responseData?.error?.message ||
      responseData?.message ||
      (typeof responseData === 'string' ? responseData : undefined);
    const message = responseMessage || error?.message || fallback;
    const status = error?.response?.status;
    const code = error?.code;
    const details = [status ? `status=${status}` : '', code ? `code=${code}` : '']
      .filter(Boolean)
      .join(' ');
    return details ? `${message} (${details})` : message;
  }

  private async toImageDataUri(url: string) {
    if (url.startsWith('data:image/')) return url;
    if (url.startsWith('data:')) {
      throw new BadRequestException('仅支持图片作为输入');
    }
    // Force IPv4 to avoid ETIMEDOUT issues on some networks
    const httpsAgent = new https.Agent({ family: 4, timeout: 60000 });
    const httpAgent = new http.Agent({ family: 4, timeout: 60000 });
    try {
      const response = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        httpsAgent,
        httpAgent,
        maxRedirects: 5,
      });
      const contentType =
        (response.headers['content-type'] as string | undefined) || 'image/png';
      if (!contentType.startsWith('image/')) {
        throw new BadRequestException('仅支持图片作为输入');
      }
      const base64 = Buffer.from(response.data).toString('base64');
      return `data:${contentType};base64,${base64}`;
    } catch (err: any) {
      console.error('[toImageDataUri] Error downloading image:', err.message, 'status:', err.response?.status);
      throw err;
    }
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
    inputImages?: string[],
    nodeName?: string,
    options?: { imageAspectRatio?: string; modelConfig?: Record<string, any>; assetFiles?: InputAssetFile[] },
  ): Promise<Asset[]> {
    const assets: Asset[] = [];
    for (let i = 0; i < count; i += 1) {
      console.log(`[generateMediaAssets] Generating ${mediaType} ${i + 1}/${count}...`);
      const media =
        mediaType === 'image'
          ? await this.aiService.generateImage(prompt, modelOverride, inputImages, options)
          : await this.aiService.generateVideo(prompt, modelOverride, inputImages, options);
      console.log(`[generateMediaAssets] AI returned ${media.length} items`);
      if (!media.length) {
        throw new BadRequestException('AI provider returned no media');
      }
      console.log(`[generateMediaAssets] media[0] format: url=${!!media[0].url}, data=${!!media[0].data}, url_prefix=${media[0].url?.substring(0, 50)}`);
      console.log(`[generateMediaAssets] Saving media result...`);
      const saved = await this.saveMediaResult(run, type, media[0], mediaType, metadata, nodeName);
      console.log(`[generateMediaAssets] Saved asset: ${saved.id}, url: ${saved.url?.substring(0, 100)}`);
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
    nodeName?: string,
  ): Promise<Asset> {
    const task = await this.taskRepository.findOne({ where: { id: run.taskId } });
    const version = await this.taskVersionRepository.findOne({ where: { id: run.taskVersionId } });
    if (!task || !version) throw new NotFoundException('Task not found');

    const spaceId = await this.getWorkflowSpaceId(run);
    const folder = this.buildAssetFolder(task.userId, task.id, version.id, type, spaceId);
    const filenamePrefix = nodeName || type;
    const filename = this.buildFilename(filenamePrefix, mediaType === 'image' ? 'png' : 'mp4');
    let url: string = '';
    let mimeType = media.mimeType || (mediaType === 'image' ? 'image/png' : 'video/mp4');
    let filesize: number | undefined;
    
    if (media.data) {
      // 已有 buffer 数据，直接上传
      console.log(`[saveMediaResult] Uploading buffer data, size: ${media.data.length}`);
      url = await this.storageService.uploadBuffer(media.data, filename, { folder, contentType: mimeType });
      console.log(`[saveMediaResult] Buffer 上传成功: ${url.substring(0, 80)}`);
      filesize = media.data.length;
    } else if (media.url) {
      // 尝试下载远程 URL 到本地存储
      console.log(`[saveMediaResult] 尝试下载远程 URL: ${media.url.substring(0, 80)}...`);
      try {
        const response = await axios.get(media.url, {
          responseType: 'arraybuffer',
          timeout: 120000, // 2分钟超时（视频可能较大）
          maxContentLength: 500 * 1024 * 1024, // 500MB max
        });
        const buffer = Buffer.from(response.data);
        filesize = buffer.length;
        console.log(`[saveMediaResult] 下载成功，大小: ${filesize} bytes`);
        url = await this.storageService.uploadBuffer(buffer, filename, { folder, contentType: mimeType });
        console.log(`[saveMediaResult] 上传到本地存储成功: ${url.substring(0, 80)}`);
      } catch (downloadError: any) {
        // 下载失败，回退到使用原始 URL
        console.warn(`[saveMediaResult] 下载失败 (${downloadError.code || downloadError.message})，使用原始 URL`);
        url = media.url;
      }
    } else {
      throw new BadRequestException('No media data available');
    }

    return await this.assetRepository.save(
      this.assetRepository.create({
        taskId: task.id,
        versionId: version.id,
        spaceId,
        type,
        status: AssetStatus.ACTIVE,
        url,
        filename,
        filesize: filesize ?? media.data?.length,
        mimeType,
        metadataJson: JSON.stringify({ nodeName, ...(metadata || {}) }),
      }),
    );
  }

  private async saveJsonAsset(
    run: WorkflowRun,
    type: AssetType,
    filename: string,
    payload: any,
    nodeName?: string,
  ): Promise<Asset> {
    const task = await this.taskRepository.findOne({ where: { id: run.taskId } });
    const version = await this.taskVersionRepository.findOne({ where: { id: run.taskVersionId } });
    if (!task || !version) throw new NotFoundException('Task not found');

    const spaceId = await this.getWorkflowSpaceId(run);
    const folder = this.buildAssetFolder(task.userId, task.id, version.id, type, spaceId);
    const actualFilename = nodeName ? this.buildFilename(nodeName, 'json') : filename;
    const buffer = Buffer.from(JSON.stringify(payload, null, 2));
    const url = await this.storageService.uploadBuffer(buffer, actualFilename, {
      folder,
      contentType: 'application/json',
      isPublic: false,
    });

    return await this.assetRepository.save(
      this.assetRepository.create({
        taskId: task.id,
        versionId: version.id,
        spaceId,
        type,
        status: AssetStatus.ACTIVE,
        url,
        filename: actualFilename,
        filesize: buffer.length,
        mimeType: 'application/json',
        metadataJson: nodeName ? JSON.stringify({ nodeName }) : undefined,
      }),
    );
  }

  private async saveTextAsset(
    run: WorkflowRun,
    type: AssetType,
    content: string,
    nodeName?: string,
  ): Promise<Asset> {
    const task = await this.taskRepository.findOne({ where: { id: run.taskId } });
    const version = await this.taskVersionRepository.findOne({ where: { id: run.taskVersionId } });
    if (!task || !version) throw new NotFoundException('Task not found');

    const spaceId = await this.getWorkflowSpaceId(run);
    const folder = this.buildAssetFolder(task.userId, task.id, version.id, type, spaceId);
    const filename = this.buildFilename(nodeName || type, 'txt');
    const buffer = Buffer.from(content, 'utf-8');
    const url = await this.storageService.uploadBuffer(buffer, filename, {
      folder,
      contentType: 'text/plain; charset=utf-8',
      isPublic: false,
    });

    return await this.assetRepository.save(
      this.assetRepository.create({
        taskId: task.id,
        versionId: version.id,
        spaceId,
        type,
        status: AssetStatus.ACTIVE,
        url,
        filename,
        filesize: buffer.length,
        mimeType: 'text/plain',
        metadataJson: nodeName ? JSON.stringify({ nodeName }) : undefined,
      }),
    );
  }

  private async saveJsonlAsset(
    run: WorkflowRun,
    type: AssetType,
    items: any[],
    nodeName?: string,
  ): Promise<Asset> {
    const task = await this.taskRepository.findOne({ where: { id: run.taskId } });
    const version = await this.taskVersionRepository.findOne({ where: { id: run.taskVersionId } });
    if (!task || !version) throw new NotFoundException('Task not found');

    const spaceId = await this.getWorkflowSpaceId(run);
    const folder = this.buildAssetFolder(task.userId, task.id, version.id, type, spaceId);
    const filename = this.buildFilename(nodeName || type, 'jsonl');
    const content = items.map((item) => JSON.stringify(item)).join('\\n');
    const buffer = Buffer.from(content, 'utf-8');
    const url = await this.storageService.uploadBuffer(buffer, filename, {
      folder,
      contentType: 'application/x-ndjson',
      isPublic: false,
    });

    return await this.assetRepository.save(
      this.assetRepository.create({
        taskId: task.id,
        versionId: version.id,
        spaceId,
        type,
        status: AssetStatus.ACTIVE,
        url,
        filename,
        filesize: buffer.length,
        mimeType: 'application/x-ndjson',
        metadataJson: nodeName ? JSON.stringify({ nodeName }) : undefined,
      }),
    );
  }

  private async downloadAndSaveAsset(
    run: WorkflowRun,
    type: AssetType,
    assetUrl: string,
    nodeName?: string,
  ): Promise<Asset> {
    const task = await this.taskRepository.findOne({ where: { id: run.taskId } });
    const version = await this.taskVersionRepository.findOne({ where: { id: run.taskVersionId } });
    if (!task || !version) throw new NotFoundException('Task not found');

    // 下载文件
    const response = await axios.get<Buffer>(assetUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      httpAgent: new http.Agent(),
    });
    const buffer = Buffer.from(response.data);
    
    // 从 URL 或 Content-Type 推断文件类型
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    let ext = 'bin';
    let mimeType = contentType;
    
    if (contentType.startsWith('image/')) {
      ext = contentType.split('/')[1]?.split(';')[0] || 'png';
      if (ext === 'jpeg') ext = 'jpg';
    } else if (contentType.startsWith('video/')) {
      ext = contentType.split('/')[1]?.split(';')[0] || 'mp4';
    } else {
      // 从 URL 推断
      const urlExt = assetUrl.split('.').pop()?.split('?')[0]?.toLowerCase();
      if (urlExt && /^(png|jpg|jpeg|gif|webp|mp4|webm|mov|mkv)$/.test(urlExt)) {
        ext = urlExt;
        if (/^(png|jpg|jpeg|gif|webp)$/.test(ext)) {
          mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        } else {
          mimeType = `video/${ext}`;
        }
      }
    }

    const spaceId = await this.getWorkflowSpaceId(run);
    const folder = this.buildAssetFolder(task.userId, task.id, version.id, type, spaceId);
    const filename = this.buildFilename(nodeName || type, ext);
    
    const url = await this.storageService.uploadBuffer(buffer, filename, {
      folder,
      contentType: mimeType,
      isPublic: true,
    });

    return await this.assetRepository.save(
      this.assetRepository.create({
        taskId: task.id,
        versionId: version.id,
        spaceId,
        type,
        status: AssetStatus.ACTIVE,
        url,
        filename,
        filesize: buffer.length,
        mimeType,
        metadataJson: nodeName ? JSON.stringify({ nodeName, originalUrl: assetUrl }) : undefined,
      }),
    );
  }

  private async saveMockFinal(run: WorkflowRun): Promise<Asset> {
    const payload = { status: 'final_compose', timestamp: new Date().toISOString() };
    return await this.saveJsonAsset(run, AssetType.TASK_EXECUTION, 'final.json', payload);
  }

  private async getWorkflowSpaceId(run: WorkflowRun): Promise<number | null> {
    if (this.workflowSpaceCache.has(run.id)) {
      return this.workflowSpaceCache.get(run.id) ?? null;
    }
    const templateVersion = await this.versionRepository.findOne({
      where: { id: run.templateVersionId },
    });
    if (!templateVersion) {
      this.workflowSpaceCache.set(run.id, null);
      return null;
    }
    const template = await this.templateRepository.findOne({
      where: { id: templateVersion.templateId },
    });
    const spaceId = template?.spaceId ?? null;
    this.workflowSpaceCache.set(run.id, spaceId);
    return spaceId;
  }

  private buildAssetFolder(
    userId: number,
    taskId: number,
    versionId: number,
    type: AssetType,
    spaceId?: number | null,
  ): string {
    if (spaceId) {
      return `users/${userId}/spaces/${spaceId}/tasks/${taskId}/versions/${versionId}/${type}`;
    }
    return `users/${userId}/tasks/${taskId}/versions/${versionId}/${type}`;
  }

  private buildFilename(prefix: string, ext: string): string {
    // 清理前缀，移除不安全字符，保留中文、字母、数字、下划线和连字符
    const safePrefix = prefix.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_').slice(0, 50);
    return `${safePrefix}_${Date.now()}.${ext}`;
  }

  private getNodeLabel(node: any): string {
    return node.data?.label || node.label || node.data?.toolName || node.id;
  }

  private async fetchText(url: string): Promise<string> {
    const response = await axios.get<string>(url, { responseType: 'text' });
    return response.data;
  }

  private async fetchScriptText(run: WorkflowRun): Promise<string> {
    const scriptAsset = await this.getLatestAsset(
      run.taskId,
      run.taskVersionId,
      AssetType.TASK_EXECUTION,
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
