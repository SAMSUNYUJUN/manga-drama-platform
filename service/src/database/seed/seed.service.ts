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
    
    // Check if we need to update VIDEO provider to jimeng-video-3.0
    const videoProvider = existing.find((p) => p.type === ProviderType.VIDEO);
    if (videoProvider) {
      let needsUpdate = false;
      if (videoProvider.name !== 'jimeng-video-3.0') {
        videoProvider.name = 'jimeng-video-3.0';
        needsUpdate = true;
      }
      if (videoProvider.baseUrl !== 'https://api.qingyuntop.top') {
        videoProvider.baseUrl = 'https://api.qingyuntop.top';
        needsUpdate = true;
      }
      if (!videoProvider.modelsJson?.includes('jimeng-video-3.0')) {
        videoProvider.modelsJson = JSON.stringify(['jimeng-video-3.0']);
        needsUpdate = true;
      }
      // API keys should be configured via admin UI at /admin/providers
      if (needsUpdate) {
        await this.providerRepository.save(videoProvider);
        this.logger.log('Updated VIDEO provider to jimeng-video-3.0');
      }
      
      // Also update global config
      const globalConfig = await this.globalConfigRepository.findOne({ where: { id: 1 } });
      if (globalConfig && globalConfig.defaultVideoModel !== 'jimeng-video-3.0') {
        globalConfig.defaultVideoModel = 'jimeng-video-3.0';
        await this.globalConfigRepository.save(globalConfig);
      }
    }
    
    if (existing.length) return;

    // Only seed 3 models: deepseek-chat, nano-banana, jimeng-video-3.0
    const providers = [
      this.providerRepository.create({
        name: 'deepseek-chat',
        type: ProviderType.LLM,
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: '', // User should configure via admin UI
        enabled: true,
        modelsJson: JSON.stringify(['deepseek-chat']),
      }),
      this.providerRepository.create({
        name: 'nano-banana',
        type: ProviderType.IMAGE,
        baseUrl: 'https://newapi.aisonnet.org/v1',
        apiKey: '', // User should configure via admin UI
        enabled: true,
        modelsJson: JSON.stringify(['nano-banana']),
      }),
      this.providerRepository.create({
        name: 'jimeng-video-3.0',
        type: ProviderType.VIDEO,
        baseUrl: 'https://api.qingyuntop.top',
        apiKey: '', // User should configure via admin UI
        enabled: true,
        modelsJson: JSON.stringify(['jimeng-video-3.0']),
      }),
    ];
    await this.providerRepository.save(providers);

    const globalConfig = this.globalConfigRepository.create({
      id: 1,
      defaultLlmProviderId: providers[0].id,
      defaultImageProviderId: providers[1].id,
      defaultVideoProviderId: providers[2].id,
      defaultLlmModel: 'deepseek-chat',
      defaultImageModel: 'nano-banana',
      defaultVideoModel: 'jimeng-video-3.0',
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
}
