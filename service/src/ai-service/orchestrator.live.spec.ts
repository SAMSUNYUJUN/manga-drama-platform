import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AiOrchestratorService } from './orchestrator.service';
import {
  Asset,
  Task,
  TaskVersion,
  User,
  ProviderConfig,
  GlobalConfig,
  PromptTemplate,
  PromptTemplateVersion,
  WorkflowRun,
  WorkflowTemplate,
  WorkflowTemplateVersion,
  NodeRun,
  HumanReviewDecisionEntity,
} from '../database/entities';
import { LocalStorageService } from '../storage/local-storage.service';
import { AssetService } from '../asset/asset.service';
import { AssetController } from '../asset/asset.controller';
import { UserRole, AssetType, TaskStage } from '@shared/constants';
import { Repository } from 'typeorm';

const shouldRun = process.env.LIVE_AI_TESTS === 'true' && process.env.AI_MODE === 'live';
const shouldRunVideo = process.env.LIVE_VIDEO_TESTS === 'true';
const hasKey = !!process.env.AI_GATEWAY_API_KEY;

const describeLive = shouldRun && hasKey ? describe : describe.skip;

describeLive('Live AI smoke tests', () => {
  let aiService: AiOrchestratorService;
  let assetService: AssetService;
  let assetController: AssetController;
  let assetRepo: Repository<Asset>;
  let taskRepo: Repository<Task>;
  let versionRepo: Repository<TaskVersion>;
  let userRepo: Repository<User>;
  let storageService: LocalStorageService;
  let user: User;
  let task: Task;
  let version: TaskVersion;

  beforeAll(async () => {
    process.env.LOCAL_STORAGE_PATH = process.env.LOCAL_STORAGE_PATH || './storage/test';
    process.env.LOCAL_STORAGE_URL = process.env.LOCAL_STORAGE_URL || 'http://localhost:3001/uploads';

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          synchronize: true,
          entities: [
            Asset,
            Task,
            TaskVersion,
            User,
            ProviderConfig,
            GlobalConfig,
            PromptTemplate,
            PromptTemplateVersion,
            WorkflowRun,
            WorkflowTemplate,
            WorkflowTemplateVersion,
            NodeRun,
            HumanReviewDecisionEntity,
          ],
        }),
        TypeOrmModule.forFeature([Asset, Task, TaskVersion, User, ProviderConfig, GlobalConfig]),
      ],
      controllers: [AssetController],
      providers: [
        AiOrchestratorService,
        AssetService,
        LocalStorageService,
        { provide: 'IStorageService', useExisting: LocalStorageService },
      ],
    }).compile();

    aiService = moduleRef.get(AiOrchestratorService);
    assetService = moduleRef.get(AssetService);
    assetController = moduleRef.get(AssetController);
    assetRepo = moduleRef.get(getRepositoryToken(Asset));
    taskRepo = moduleRef.get(getRepositoryToken(Task));
    versionRepo = moduleRef.get(getRepositoryToken(TaskVersion));
    userRepo = moduleRef.get(getRepositoryToken(User));
    storageService = moduleRef.get(LocalStorageService);

    user = await userRepo.save(
      userRepo.create({
        username: 'liveuser',
        email: 'live@example.com',
        password: 'hashed',
        role: UserRole.ADMIN,
      }),
    );

    task = await taskRepo.save(
      taskRepo.create({
        userId: user.id,
        title: 'Live Test Task',
      }),
    );
    version = await versionRepo.save(
      versionRepo.create({
        taskId: task.id,
        version: 1,
        stage: TaskStage.SCRIPT_UPLOADED,
      }),
    );
  });

  it('LLM parse script returns scenes', async () => {
    const result = await aiService.parseScript('A hero walks into the rain.');
    expect(result).toBeDefined();
    expect(result.scenes || result.title || result.raw).toBeTruthy();
  });

  it('Image generation saves asset and exposes download url', async () => {
    const media = await aiService.generateImage('A small blue cat, minimal style');
    if (!media.length) {
      return;
    }
    const item = media[0];
    const filename = `live_image_${Date.now()}.png`;
    let url: string;
    if (item.url) {
      url = await storageService.uploadRemoteFile(item.url, filename, { folder: 'live-test' });
    } else if (item.data) {
      url = await storageService.uploadBuffer(item.data, filename, { folder: 'live-test' });
    } else {
      return;
    }
    const asset = await assetRepo.save(
      assetRepo.create({
        taskId: task.id,
        versionId: version.id,
        type: AssetType.CHARACTER_DESIGN,
        url,
        filename,
      }),
    );
    const response = await assetController.download(asset.id, user);
    expect(response.data?.url || response.data.url).toContain('http');
  });

  (shouldRunVideo ? it : it.skip)('Video generation saves asset', async () => {
    const media = await aiService.generateVideo('A short cinematic rain loop');
    if (!media.length) {
      return;
    }
    const item = media[0];
    const filename = `live_video_${Date.now()}.mp4`;
    let url: string;
    if (item.url) {
      url = await storageService.uploadRemoteFile(item.url, filename, { folder: 'live-test' });
    } else if (item.data) {
      url = await storageService.uploadBuffer(item.data, filename, { folder: 'live-test' });
    } else {
      return;
    }
    const asset = await assetRepo.save(
      assetRepo.create({
        taskId: task.id,
        versionId: version.id,
        type: AssetType.STORYBOARD_VIDEO,
        url,
        filename,
      }),
    );
    const response = await assetController.download(asset.id, user);
    expect(response.data?.url || response.data.url).toContain('http');
  });
});
