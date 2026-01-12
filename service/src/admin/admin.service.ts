/**
 * Admin service
 * @module admin
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderConfig, GlobalConfig } from '../database/entities';
import { CreateProviderDto, UpdateProviderDto, UpdateGlobalConfigDto } from './dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(ProviderConfig)
    private providerRepository: Repository<ProviderConfig>,
    @InjectRepository(GlobalConfig)
    private globalConfigRepository: Repository<GlobalConfig>,
  ) {}

  async listProviders(): Promise<any[]> {
    const providers = await this.providerRepository.find({ order: { updatedAt: 'DESC' } });
    return providers.map((provider) => this.toSafeProvider(provider));
  }

  async createProvider(dto: CreateProviderDto): Promise<any> {
    const provider = this.providerRepository.create({
      name: dto.name,
      type: dto.type,
      baseUrl: dto.baseUrl,
      apiKey: dto.apiKey,
      timeoutMs: dto.timeoutMs,
      retryCount: dto.retryCount,
      enabled: dto.enabled ?? true,
      modelsJson: JSON.stringify(dto.models || []),
    });
    const saved = await this.providerRepository.save(provider);
    return this.toSafeProvider(saved);
  }

  async updateProvider(id: number, dto: UpdateProviderDto): Promise<any> {
    const provider = await this.providerRepository.findOne({ where: { id } });
    if (!provider) {
      throw new NotFoundException(`Provider with ID ${id} not found`);
    }
    if (dto.name !== undefined) provider.name = dto.name;
    if (dto.type !== undefined) provider.type = dto.type;
    if (dto.baseUrl !== undefined) provider.baseUrl = dto.baseUrl;
    if (dto.apiKey !== undefined) provider.apiKey = dto.apiKey;
    if (dto.timeoutMs !== undefined) provider.timeoutMs = dto.timeoutMs;
    if (dto.retryCount !== undefined) provider.retryCount = dto.retryCount;
    if (dto.enabled !== undefined) provider.enabled = dto.enabled;
    if (dto.models !== undefined) provider.models = dto.models;
    const saved = await this.providerRepository.save(provider);
    return this.toSafeProvider(saved);
  }

  async enableProvider(id: number): Promise<any> {
    return this.updateProvider(id, { enabled: true });
  }

  async disableProvider(id: number): Promise<any> {
    return this.updateProvider(id, { enabled: false });
  }

  async getGlobalConfig(): Promise<GlobalConfig> {
    let config = await this.globalConfigRepository.findOne({ where: { id: 1 } });
    if (!config) {
      config = this.globalConfigRepository.create({ id: 1 });
      await this.globalConfigRepository.save(config);
    }
    return config;
  }

  async updateGlobalConfig(dto: UpdateGlobalConfigDto): Promise<GlobalConfig> {
    const config = await this.getGlobalConfig();
    Object.assign(config, dto);
    return await this.globalConfigRepository.save(config);
  }

  private toSafeProvider(provider: ProviderConfig) {
    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl,
      timeoutMs: provider.timeoutMs,
      retryCount: provider.retryCount,
      enabled: provider.enabled,
      models: provider.models,
      apiKeyMasked: this.maskApiKey(provider.apiKey),
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  private maskApiKey(apiKey: string): string {
    if (!apiKey) return '';
    const last = apiKey.slice(-4);
    return `****${last}`;
  }
}
