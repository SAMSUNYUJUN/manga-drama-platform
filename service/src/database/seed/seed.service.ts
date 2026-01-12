/**
 * Database seed service
 * @module database/seed
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  User,
  Task,
  TaskVersion,
  PromptTemplate,
  PromptTemplateVersion,
  WorkflowTemplate,
  WorkflowTemplateVersion,
  ProviderConfig,
  GlobalConfig,
  NodeTool,
} from '../entities';
import { UserRole, TaskStatus, TaskStage, WorkflowNodeType, ProviderType } from '@shared/constants';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    @InjectRepository(TaskVersion)
    private taskVersionRepository: Repository<TaskVersion>,
    @InjectRepository(PromptTemplate)
    private promptTemplateRepository: Repository<PromptTemplate>,
    @InjectRepository(PromptTemplateVersion)
    private promptVersionRepository: Repository<PromptTemplateVersion>,
    @InjectRepository(WorkflowTemplate)
    private workflowTemplateRepository: Repository<WorkflowTemplate>,
    @InjectRepository(WorkflowTemplateVersion)
    private workflowVersionRepository: Repository<WorkflowTemplateVersion>,
    @InjectRepository(ProviderConfig)
    private providerRepository: Repository<ProviderConfig>,
    @InjectRepository(GlobalConfig)
    private globalConfigRepository: Repository<GlobalConfig>,
    @InjectRepository(NodeTool)
    private nodeToolRepository: Repository<NodeTool>,
  ) {}

  async onModuleInit() {
    const shouldSeed = this.configService.get<string>('SEED_ON_START', 'true') === 'true';
    if (!shouldSeed) return;

    await this.seedAdminUser();
    await this.seedProviders();
    await this.seedPrompt();
    await this.seedNodeTools();
    await this.seedWorkflow();
    await this.seedSampleTask();
  }

  private async seedAdminUser() {
    const existing = await this.userRepository.findOne({ where: { role: UserRole.ADMIN } });
    if (existing) return;

    const password = this.configService.get<string>('ADMIN_SEED_PASSWORD', 'admin123');
    const admin = this.userRepository.create({
      username: 'admin',
      email: 'admin@example.com',
      password: await bcrypt.hash(password, 10),
      role: UserRole.ADMIN,
    });
    await this.userRepository.save(admin);
    this.logger.log('Seeded admin user');
  }

  private async seedProviders() {
    const existing = await this.providerRepository.find();
    if (existing.length) return;

    const baseUrl = this.configService.get<string>('AI_GATEWAY_BASE_URL', 'https://newapi.aisonnet.org/v1');
    const apiKey = this.configService.get<string>('AI_GATEWAY_API_KEY', '');
    const defaultModels = {
      llm: ['deepseek-v3.2'],
      image: ['nanobanana', 'jimeng-4.1', 'jimeng-4.1-4k', 'jimeng-4.5', 'jimeng-4.5-4k'],
      video: ['jimeng-video-3.5-pro', 'jimeng-video-3.5-pro-10s'],
    };

    const providers = [
      this.providerRepository.create({
        name: 'Aisonnet LLM',
        type: ProviderType.LLM,
        baseUrl,
        apiKey,
        enabled: true,
        modelsJson: JSON.stringify(defaultModels.llm),
      }),
      this.providerRepository.create({
        name: 'Aisonnet Image',
        type: ProviderType.IMAGE,
        baseUrl,
        apiKey,
        enabled: true,
        modelsJson: JSON.stringify(defaultModels.image),
      }),
      this.providerRepository.create({
        name: 'Aisonnet Video',
        type: ProviderType.VIDEO,
        baseUrl,
        apiKey,
        enabled: true,
        modelsJson: JSON.stringify(defaultModels.video),
      }),
    ];
    await this.providerRepository.save(providers);

    const globalConfig = this.globalConfigRepository.create({
      id: 1,
      defaultLlmProviderId: providers[0].id,
      defaultImageProviderId: providers[1].id,
      defaultVideoProviderId: providers[2].id,
      defaultLlmModel: this.configService.get<string>('LLM_MODEL', 'deepseek-v3.2'),
      defaultImageModel: this.configService.get<string>('IMAGE_MODEL', 'jimeng-4.5'),
      defaultVideoModel: this.configService.get<string>('VIDEO_MODEL', 'jimeng-video-3.5-pro-10s'),
    });
    await this.globalConfigRepository.save(globalConfig);
    this.logger.log('Seeded providers and global config');
  }

  private async seedPrompt() {
    const existing = await this.promptTemplateRepository.findOne({ where: { name: 'Character Prompt' } });
    if (existing) return;

    const template = await this.promptTemplateRepository.save(
      this.promptTemplateRepository.create({
        name: 'Character Prompt',
        description: 'Character design base prompt',
      }),
    );

    await this.promptVersionRepository.save(
      this.promptVersionRepository.create({
        templateId: template.id,
        version: 1,
        name: '默认版本',
        content: 'A {{character}} in {{style}} style, high detail, clean line art.',
        variablesJson: JSON.stringify(['character', 'style']),
      }),
    );
    this.logger.log('Seeded prompt template');
  }

  private async seedNodeTools() {
    const existing = await this.nodeToolRepository.findOne({ where: { name: 'Character Prompt Tool' } });
    if (existing) return;

    const template = await this.promptTemplateRepository.findOne({ where: { name: 'Character Prompt' } });
    if (!template) return;
    const version = await this.promptVersionRepository.findOne({
      where: { templateId: template.id },
      order: { version: 'DESC' },
    });
    if (!version) return;

    const tool = this.nodeToolRepository.create({
      name: 'Character Prompt Tool',
      description: 'LLM prompt tool for character design',
      promptTemplateVersionId: version.id,
      model: this.configService.get<string>('LLM_MODEL', 'deepseek-v3.2'),
      enabled: true,
      inputsJson: '[]',
      outputsJson: '[]',
    });
    tool.inputs = [
      { key: 'character', name: '角色', type: 'text', required: true },
      { key: 'style', name: '风格', type: 'text', required: true },
    ];
    tool.outputs = [{ key: 'prompt', name: 'Prompt 输出', type: 'text', required: true }];
    await this.nodeToolRepository.save(tool);
    this.logger.log('Seeded node tool');
  }

  private async seedWorkflow() {
    const existing = await this.workflowTemplateRepository.findOne({ where: { name: 'Default Workflow' } });
    if (existing) return;

    const template = await this.workflowTemplateRepository.save(
      this.workflowTemplateRepository.create({
        name: 'Default Workflow',
        description: 'Default linear workflow with human review',
      }),
    );

    const nodes = [
      { id: 'node-start', type: WorkflowNodeType.START, position: { x: -200, y: 0 }, data: { config: {} } },
      { id: 'node-llm', type: WorkflowNodeType.LLM_PARSE_SCRIPT, position: { x: 0, y: 0 }, data: { config: {} } },
      { id: 'node-story', type: WorkflowNodeType.GENERATE_STORYBOARD, position: { x: 200, y: 0 }, data: { config: {} } },
      { id: 'node-char', type: WorkflowNodeType.GENERATE_CHARACTER_IMAGES, position: { x: 400, y: 0 }, data: { config: { requireHuman: true } } },
      { id: 'node-review', type: WorkflowNodeType.HUMAN_REVIEW_ASSETS, position: { x: 600, y: 0 }, data: { config: { requireHuman: true } } },
      { id: 'node-scene', type: WorkflowNodeType.GENERATE_SCENE_IMAGE, position: { x: 800, y: 0 }, data: { config: {} } },
      { id: 'node-key', type: WorkflowNodeType.GENERATE_KEYFRAMES, position: { x: 1000, y: 0 }, data: { config: {} } },
      { id: 'node-video', type: WorkflowNodeType.GENERATE_VIDEO, position: { x: 1200, y: 0 }, data: { config: {} } },
      { id: 'node-final', type: WorkflowNodeType.FINAL_COMPOSE, position: { x: 1400, y: 0 }, data: { config: {} } },
      { id: 'node-end', type: WorkflowNodeType.END, position: { x: 1600, y: 0 }, data: { config: {} } },
    ];
    const edges = [
      { id: 'e0', source: 'node-start', target: 'node-llm' },
      { id: 'e1', source: 'node-llm', target: 'node-story' },
      { id: 'e2', source: 'node-story', target: 'node-char' },
      { id: 'e3', source: 'node-char', target: 'node-review' },
      { id: 'e4', source: 'node-review', target: 'node-scene' },
      { id: 'e5', source: 'node-scene', target: 'node-key' },
      { id: 'e6', source: 'node-key', target: 'node-video' },
      { id: 'e7', source: 'node-video', target: 'node-final' },
      { id: 'e8', source: 'node-final', target: 'node-end' },
    ];

    await this.workflowVersionRepository.save(
      this.workflowVersionRepository.create({
        templateId: template.id,
        version: 1,
        nodesJson: JSON.stringify(nodes),
        edgesJson: JSON.stringify(edges),
      }),
    );
    this.logger.log('Seeded workflow template');
  }

  private async seedSampleTask() {
    const admin = await this.userRepository.findOne({ where: { role: UserRole.ADMIN } });
    if (!admin) return;
    const existing = await this.taskRepository.findOne({ where: { title: 'Sample Task' } });
    if (existing) return;

    const task = await this.taskRepository.save(
      this.taskRepository.create({
        userId: admin.id,
        title: 'Sample Task',
        description: 'Seeded task for demo',
        status: TaskStatus.PENDING,
        stage: TaskStage.SCRIPT_UPLOADED,
      }),
    );

    const version = await this.taskVersionRepository.save(
      this.taskVersionRepository.create({
        taskId: task.id,
        version: 1,
        stage: TaskStage.SCRIPT_UPLOADED,
      }),
    );
    task.currentVersionId = version.id;
    await this.taskRepository.save(task);
    this.logger.log('Seeded sample task');
  }
}
