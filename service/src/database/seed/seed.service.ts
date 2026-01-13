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
  WorkflowTemplate,
  WorkflowTemplateVersion,
  WorkflowRun,
  ProviderConfig,
  GlobalConfig,
} from '../entities';
import { UserRole, TaskStatus, TaskStage, ProviderType } from '@shared/constants';
import { ConfigService } from '@nestjs/config';
import { In } from 'typeorm';

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
    @InjectRepository(WorkflowTemplate)
    private workflowTemplateRepository: Repository<WorkflowTemplate>,
    @InjectRepository(WorkflowTemplateVersion)
    private workflowVersionRepository: Repository<WorkflowTemplateVersion>,
    @InjectRepository(WorkflowRun)
    private workflowRunRepository: Repository<WorkflowRun>,
    @InjectRepository(ProviderConfig)
    private providerRepository: Repository<ProviderConfig>,
    @InjectRepository(GlobalConfig)
    private globalConfigRepository: Repository<GlobalConfig>,
  ) {}

  async onModuleInit() {
    const shouldSeed = this.configService.get<string>('SEED_ON_START', 'true') === 'true';
    if (!shouldSeed) return;

    await this.seedAdminUser();
    await this.seedProviders();
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

  private async seedWorkflow() {
    const existing = await this.workflowTemplateRepository.findOne({ where: { name: 'Default Workflow' } });
    if (existing) {
      const versions = await this.workflowVersionRepository.find({ where: { templateId: existing.id } });
      const versionIds = versions.map((version) => version.id);
      if (versionIds.length) {
        const runCount = await this.workflowRunRepository.count({ where: { templateVersionId: In(versionIds) } });
        if (runCount > 0) {
          this.logger.warn('Default Workflow has existing runs, skip auto-removal');
          return;
        }
      }
      await this.workflowVersionRepository.delete({ templateId: existing.id });
      await this.workflowTemplateRepository.remove(existing);
      this.logger.log('Removed default workflow template');
      return;
    }
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
