/**
 * Prompt service
 * @module prompt
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PromptTemplate, PromptTemplateVersion } from '../database/entities';
import { CreatePromptTemplateDto, CreatePromptTemplateVersionDto, RenderPromptDto } from './dto';

@Injectable()
export class PromptService {
  constructor(
    @InjectRepository(PromptTemplate)
    private templateRepository: Repository<PromptTemplate>,
    @InjectRepository(PromptTemplateVersion)
    private versionRepository: Repository<PromptTemplateVersion>,
  ) {}

  async createTemplate(dto: CreatePromptTemplateDto): Promise<PromptTemplate> {
    const template = this.templateRepository.create({
      name: dto.name,
      description: dto.description,
    });
    const saved = await this.templateRepository.save(template);

    if (dto.content) {
      await this.createVersion(saved.id, { content: dto.content, name: '默认版本' });
    }
    return saved;
  }

  async listTemplates(): Promise<PromptTemplate[]> {
    return await this.templateRepository.find({ order: { updatedAt: 'DESC' } });
  }

  async getTemplate(id: number): Promise<PromptTemplate> {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`PromptTemplate with ID ${id} not found`);
    }
    return template;
  }

  async deleteTemplate(id: number): Promise<void> {
    const template = await this.getTemplate(id);
    await this.templateRepository.remove(template);
  }

  async createVersion(templateId: number, dto: CreatePromptTemplateVersionDto): Promise<PromptTemplateVersion> {
    const template = await this.getTemplate(templateId);
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException('Version name is required');
    }
    const existingByName = await this.versionRepository.findOne({ where: { templateId, name } });
    if (existingByName) {
      throw new BadRequestException('Version name already exists');
    }
    const lastVersion = await this.versionRepository.findOne({
      where: { templateId },
      order: { version: 'DESC' },
    });
    const nextVersion = lastVersion ? lastVersion.version + 1 : 1;
    const variables = this.extractVariables(dto.content);
    const version = this.versionRepository.create({
      templateId,
      version: nextVersion,
      name,
      content: dto.content,
      variablesJson: JSON.stringify(variables),
    });
    const saved = await this.versionRepository.save(version);
    template.updatedAt = new Date();
    await this.templateRepository.save(template);
    return saved;
  }

  async listVersions(templateId: number): Promise<PromptTemplateVersion[]> {
    await this.getTemplate(templateId);
    return await this.versionRepository.find({
      where: { templateId },
      order: { version: 'DESC' },
    });
  }

  async getVersion(templateId: number, versionId: number): Promise<PromptTemplateVersion> {
    await this.getTemplate(templateId);
    const version = await this.versionRepository.findOne({
      where: { id: versionId, templateId },
    });
    if (!version) {
      throw new NotFoundException(`PromptTemplateVersion with ID ${versionId} not found`);
    }
    return version;
  }

  async updateVersion(
    templateId: number,
    versionId: number,
    payload: { name?: string | null },
  ): Promise<PromptTemplateVersion> {
    const version = await this.getVersion(templateId, versionId);
    if (payload.name !== undefined) {
      const name = payload.name?.trim();
      if (!name) {
        throw new BadRequestException('Version name is required');
      }
      if (name !== version.name) {
        const existingByName = await this.versionRepository.findOne({ where: { templateId, name } });
        if (existingByName) {
          throw new BadRequestException('Version name already exists');
        }
      }
      version.name = name;
    }
    const saved = await this.versionRepository.save(version);
    const template = await this.getTemplate(templateId);
    template.updatedAt = new Date();
    await this.templateRepository.save(template);
    return saved;
  }

  async deleteVersion(templateId: number, versionId: number): Promise<void> {
    const version = await this.getVersion(templateId, versionId);
    await this.versionRepository.remove(version);
    const template = await this.getTemplate(templateId);
    template.updatedAt = new Date();
    await this.templateRepository.save(template);
  }

  async renderPrompt(dto: RenderPromptDto) {
    const version = await this.versionRepository.findOne({ where: { id: dto.templateVersionId } });
    if (!version) {
      throw new NotFoundException(`PromptTemplateVersion with ID ${dto.templateVersionId} not found`);
    }
    const missingVariables = version.variables.filter((key) => !dto.variables[key]);
    let rendered = version.content;
    Object.entries(dto.variables).forEach(([key, value]) => {
      const reg = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      rendered = rendered.replace(reg, value);
    });
    return { rendered, missingVariables };
  }

  private extractVariables(content: string): string[] {
    const regex = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
    const variables = new Set<string>();
    let match = regex.exec(content);
    while (match) {
      variables.add(match[1]);
      match = regex.exec(content);
    }
    return Array.from(variables);
  }
}
