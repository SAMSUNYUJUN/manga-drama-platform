/**
 * Node tool service
 * @module node-tool
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NodeTool } from '../database/entities';
import { PromptService } from '../prompt/prompt.service';
import { AiOrchestratorService } from '../ai-service/orchestrator.service';

@Injectable()
export class NodeToolService {
  constructor(
    @InjectRepository(NodeTool)
    private readonly toolRepository: Repository<NodeTool>,
    private readonly promptService: PromptService,
    private readonly aiService: AiOrchestratorService,
  ) {}

  async listTools(enabled?: boolean): Promise<NodeTool[]> {
    const where = enabled === undefined ? {} : { enabled };
    return await this.toolRepository.find({
      where,
      order: { updatedAt: 'DESC' },
    });
  }

  async getTool(id: number): Promise<NodeTool> {
    const tool = await this.toolRepository.findOne({ where: { id } });
    if (!tool) {
      throw new NotFoundException(`NodeTool with ID ${id} not found`);
    }
    return tool;
  }

  async createTool(payload: Partial<NodeTool>): Promise<NodeTool> {
    if (!payload.name) {
      throw new BadRequestException('Tool name is required');
    }
    const tool = this.toolRepository.create({
      name: payload.name,
      description: payload.description ?? null,
      promptTemplateVersionId: payload.promptTemplateVersionId ?? null,
      model: payload.model ?? null,
      enabled: payload.enabled ?? true,
      inputs: payload.inputs || [],
      outputs: payload.outputs || [],
    });
    return await this.toolRepository.save(tool);
  }

  async updateTool(id: number, payload: Partial<NodeTool>): Promise<NodeTool> {
    const tool = await this.getTool(id);
    if (payload.name !== undefined) tool.name = payload.name;
    if (payload.description !== undefined) tool.description = payload.description;
    if (payload.promptTemplateVersionId !== undefined) {
      tool.promptTemplateVersionId = payload.promptTemplateVersionId;
    }
    if (payload.model !== undefined) tool.model = payload.model;
    if (payload.enabled !== undefined) tool.enabled = payload.enabled;
    if (payload.inputs !== undefined) tool.inputs = payload.inputs;
    if (payload.outputs !== undefined) tool.outputs = payload.outputs;
    return await this.toolRepository.save(tool);
  }

  async deleteTool(id: number): Promise<void> {
    const tool = await this.getTool(id);
    await this.toolRepository.remove(tool);
  }

  async testToolById(id: number, inputs?: Record<string, any>) {
    const tool = await this.getTool(id);
    return await this.testToolConfig({
      promptTemplateVersionId: tool.promptTemplateVersionId ?? undefined,
      model: tool.model ?? undefined,
      inputs: inputs || {},
    });
  }

  async testToolConfig(payload: {
    promptTemplateVersionId?: number;
    model?: string;
    inputs?: Record<string, any>;
  }) {
    if (!payload.promptTemplateVersionId) {
      throw new BadRequestException('promptTemplateVersionId is required for testing');
    }
    const start = Date.now();
    const renderVariables = this.normalizeVariables(payload.inputs || {});
    const rendered = await this.promptService.renderPrompt({
      templateVersionId: payload.promptTemplateVersionId,
      variables: renderVariables,
    });
    const outputText = await this.aiService.generateText(rendered.rendered, payload.model);
    const parsedJson = this.tryParseJson(outputText);
    return {
      renderedPrompt: rendered.rendered,
      outputText,
      parsedJson,
      missingVariables: rendered.missingVariables,
      durationMs: Date.now() - start,
    };
  }

  private normalizeVariables(values: Record<string, any>) {
    const normalized: Record<string, string> = {};
    Object.entries(values).forEach(([key, value]) => {
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

  private tryParseJson(content: string) {
    try {
      return JSON.parse(content);
    } catch {
      return undefined;
    }
  }
}
