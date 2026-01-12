/**
 * Workflow template service
 * @module workflow
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowTemplate, WorkflowTemplateVersion } from '../database/entities';
import { CreateWorkflowTemplateDto, CreateWorkflowTemplateVersionDto } from './dto';

@Injectable()
export class WorkflowTemplateService {
  constructor(
    @InjectRepository(WorkflowTemplate)
    private templateRepository: Repository<WorkflowTemplate>,
    @InjectRepository(WorkflowTemplateVersion)
    private versionRepository: Repository<WorkflowTemplateVersion>,
  ) {}

  async createTemplate(dto: CreateWorkflowTemplateDto): Promise<WorkflowTemplate> {
    const template = this.templateRepository.create({
      name: dto.name,
      description: dto.description,
    });
    return await this.templateRepository.save(template);
  }

  async listTemplates(): Promise<WorkflowTemplate[]> {
    return await this.templateRepository.find({ order: { updatedAt: 'DESC' } });
  }

  async getTemplate(id: number): Promise<WorkflowTemplate> {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`WorkflowTemplate with ID ${id} not found`);
    }
    return template;
  }

  async createVersion(
    templateId: number,
    dto: CreateWorkflowTemplateVersionDto,
  ): Promise<WorkflowTemplateVersion> {
    await this.getTemplate(templateId);
    const lastVersion = await this.versionRepository.findOne({
      where: { templateId },
      order: { version: 'DESC' },
    });
    const nextVersion = lastVersion ? lastVersion.version + 1 : 1;
    const version = this.versionRepository.create({
      templateId,
      version: nextVersion,
      nodesJson: JSON.stringify(dto.nodes || []),
      edgesJson: JSON.stringify(dto.edges || []),
      metadataJson: dto.metadata ? JSON.stringify(dto.metadata) : null,
    });
    return await this.versionRepository.save(version);
  }

  async listVersions(templateId: number): Promise<WorkflowTemplateVersion[]> {
    await this.getTemplate(templateId);
    return await this.versionRepository.find({
      where: { templateId },
      order: { version: 'DESC' },
    });
  }

  async getVersion(templateId: number, versionId: number): Promise<WorkflowTemplateVersion> {
    await this.getTemplate(templateId);
    const version = await this.versionRepository.findOne({
      where: { id: versionId, templateId },
    });
    if (!version) {
      throw new NotFoundException(`WorkflowTemplateVersion with ID ${versionId} not found`);
    }
    return version;
  }

  async getVersionById(versionId: number): Promise<WorkflowTemplateVersion> {
    const version = await this.versionRepository.findOne({ where: { id: versionId } });
    if (!version) {
      throw new NotFoundException(`WorkflowTemplateVersion with ID ${versionId} not found`);
    }
    return version;
  }
}
