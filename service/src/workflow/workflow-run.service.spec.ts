import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { WorkflowRunService } from './workflow-run.service';
import {
  WorkflowRun,
  WorkflowTemplate,
  WorkflowTemplateVersion,
  NodeRun,
  Task,
  TaskVersion,
  User,
  Asset,
  HumanReviewDecisionEntity,
  ProviderConfig,
  GlobalConfig,
  PromptTemplate,
  PromptTemplateVersion,
  TrashAsset,
} from '../database/entities';
import { AiOrchestratorService } from '../ai-service/orchestrator.service';
import { PromptService } from '../prompt/prompt.service';
import { ProviderType, TaskStage, TaskStatus, UserRole, WorkflowNodeType, WorkflowRunStatus, NodeRunStatus } from '@shared/constants';
import { ConfigModule } from '@nestjs/config';
import { WorkflowValidationService } from './workflow-validation.service';
import { TrashService } from '../asset/trash.service';

describe('WorkflowRunService', () => {
  let workflowRunService: WorkflowRunService;
  let moduleRef: any;

  beforeAll(async () => {
    process.env.AI_MODE = 'mock';
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          synchronize: true,
          entities: [
            WorkflowRun,
            WorkflowTemplate,
            WorkflowTemplateVersion,
            NodeRun,
            Task,
            TaskVersion,
            User,
            Asset,
            HumanReviewDecisionEntity,
            ProviderConfig,
            GlobalConfig,
            PromptTemplate,
            PromptTemplateVersion,
            TrashAsset,
          ],
        }),
        TypeOrmModule.forFeature([
          WorkflowRun,
          WorkflowTemplate,
          WorkflowTemplateVersion,
          NodeRun,
          Task,
          TaskVersion,
          User,
          Asset,
          HumanReviewDecisionEntity,
          ProviderConfig,
          GlobalConfig,
          PromptTemplate,
          PromptTemplateVersion,
          TrashAsset,
        ]),
      ],
      providers: [
        WorkflowRunService,
        AiOrchestratorService,
        PromptService,
        WorkflowValidationService,
        TrashService,
        {
          provide: 'IStorageService',
          useValue: {
            uploadBuffer: async () => 'http://localhost/mock',
            uploadRemoteFile: async () => 'http://localhost/mock',
            uploadFile: async () => 'http://localhost/mock',
            delete: async () => undefined,
            getUrl: (path: string) => path,
          },
        },
      ],
    }).compile();

    workflowRunService = moduleRef.get(WorkflowRunService);
  });

  it('rejects concurrent workflow run for same task version', async () => {
    const userRepo = moduleRef.get(getRepositoryToken(User));
    const taskRepo = moduleRef.get(getRepositoryToken(Task));
    const versionRepo = moduleRef.get(getRepositoryToken(TaskVersion));
    const templateRepo = moduleRef.get(getRepositoryToken(WorkflowTemplate));
    const templateVersionRepo = moduleRef.get(getRepositoryToken(WorkflowTemplateVersion));
    const providerRepo = moduleRef.get(getRepositoryToken(ProviderConfig));

    await providerRepo.save(
      providerRepo.create({
        name: 'Mock Provider',
        type: ProviderType.LLM,
        baseUrl: 'http://localhost',
        apiKey: 'mock',
        modelsJson: JSON.stringify(['mock']),
        enabled: true,
      }),
    );

    const user = await userRepo.save(
      userRepo.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashed',
        role: UserRole.USER,
      }),
    );

    const task = await taskRepo.save(
      taskRepo.create({
        userId: user.id,
        title: 'Test Task',
        status: TaskStatus.PENDING,
        stage: TaskStage.SCRIPT_UPLOADED,
      }),
    );

    const version = await versionRepo.save(
      versionRepo.create({
        taskId: task.id,
        version: 1,
        stage: TaskStage.SCRIPT_UPLOADED,
      }),
    );

    const template = await templateRepo.save(
      templateRepo.create({
        name: 'Lock Template',
        description: 'Only human review',
      }),
    );

    const nodes = [
      { id: 'node-review', type: WorkflowNodeType.HUMAN_REVIEW_ASSETS, position: { x: 0, y: 0 }, data: { config: {} } },
    ];

    const templateVersion = await templateVersionRepo.save(
      templateVersionRepo.create({
        templateId: template.id,
        version: 1,
        nodesJson: JSON.stringify(nodes),
        edgesJson: JSON.stringify([]),
      }),
    );

    await workflowRunService.startRun(task.id, version.id, { templateVersionId: templateVersion.id }, user);

    await expect(
      workflowRunService.startRun(task.id, version.id, { templateVersionId: templateVersion.id }, user),
    ).rejects.toThrow('Task version is locked');
  });

  it('pauses and resumes human breakpoint run', async () => {
    const userRepo = moduleRef.get(getRepositoryToken(User));
    const taskRepo = moduleRef.get(getRepositoryToken(Task));
    const versionRepo = moduleRef.get(getRepositoryToken(TaskVersion));
    const templateRepo = moduleRef.get(getRepositoryToken(WorkflowTemplate));
    const templateVersionRepo = moduleRef.get(getRepositoryToken(WorkflowTemplateVersion));
    const providerRepo = moduleRef.get(getRepositoryToken(ProviderConfig));
    const runRepo = moduleRef.get(getRepositoryToken(WorkflowRun));
    const nodeRunRepo = moduleRef.get(getRepositoryToken(NodeRun));

    await providerRepo.save(
      providerRepo.create({
        name: 'Mock Provider',
        type: ProviderType.LLM,
        baseUrl: 'http://localhost',
        apiKey: 'mock',
        modelsJson: JSON.stringify(['mock']),
        enabled: true,
      }),
    );

    const user = await userRepo.save(
      userRepo.create({
        username: 'breakpoint-user',
        email: 'breakpoint@example.com',
        password: 'hashed',
        role: UserRole.USER,
      }),
    );

    const task = await taskRepo.save(
      taskRepo.create({
        userId: user.id,
        title: 'Breakpoint Task',
        status: TaskStatus.PENDING,
        stage: TaskStage.SCRIPT_UPLOADED,
      }),
    );

    const version = await versionRepo.save(
      versionRepo.create({
        taskId: task.id,
        version: 1,
        stage: TaskStage.SCRIPT_UPLOADED,
      }),
    );

    const template = await templateRepo.save(
      templateRepo.create({
        name: 'Breakpoint Template',
        description: 'Start -> Human Breakpoint -> End',
      }),
    );

    const nodes = [
      {
        id: 'node-start',
        type: WorkflowNodeType.START,
        data: { config: {}, inputs: [{ key: 'candidates', type: 'list<text>', required: true }] },
      },
      {
        id: 'node-break',
        type: WorkflowNodeType.HUMAN_BREAKPOINT,
        data: {
          config: { selectionMode: 'single' },
          inputs: [{ key: 'candidates', type: 'list<text>', required: true }],
          outputs: [{ key: 'selected', type: 'text', required: true }],
        },
      },
      {
        id: 'node-end',
        type: WorkflowNodeType.END,
        data: { config: {}, inputs: [{ key: 'result', type: 'text', required: true }] },
      },
    ];

    const edges = [
      { id: 'e1', source: 'node-start', target: 'node-break', sourceOutputKey: 'candidates', targetInputKey: 'candidates' },
      { id: 'e2', source: 'node-break', target: 'node-end', sourceOutputKey: 'selected', targetInputKey: 'result' },
    ];

    const templateVersion = await templateVersionRepo.save(
      templateVersionRepo.create({
        templateId: template.id,
        version: 1,
        nodesJson: JSON.stringify(nodes),
        edgesJson: JSON.stringify(edges),
      }),
    );

    const run = await workflowRunService.startRun(
      task.id,
      version.id,
      { templateVersionId: templateVersion.id, startInputs: { candidates: ['a', 'b', 'c'] } },
      user,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    const pausedRun = await runRepo.findOne({ where: { id: run.id } });
    expect(pausedRun?.status).toBe(WorkflowRunStatus.PAUSED);

    const nodeRuns = await nodeRunRepo.find({ where: { workflowRunId: run.id } });
    const breakpointRun = nodeRuns.find((item) => item.nodeType === WorkflowNodeType.HUMAN_BREAKPOINT);
    expect(breakpointRun?.status).toBe(NodeRunStatus.WAITING_HUMAN);

    await workflowRunService.submitHumanSelect(run.id, { nodeRunId: breakpointRun?.id, selectedIndices: [1] }, user);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const completedRun = await runRepo.findOne({ where: { id: run.id } });
    expect(completedRun?.status).toBe(WorkflowRunStatus.SUCCEEDED);
  });
});
