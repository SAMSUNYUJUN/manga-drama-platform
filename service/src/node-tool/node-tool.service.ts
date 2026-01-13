/**
 * Node tool service
 * @module node-tool
 */

import { BadRequestException, Injectable, NotFoundException, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NodeTool } from '../database/entities';
import { PromptService } from '../prompt/prompt.service';
import { AiOrchestratorService } from '../ai-service/orchestrator.service';
import type { IStorageService } from '../storage/storage.interface';
import { ProviderType } from '@shared/constants';

@Injectable()
export class NodeToolService {
  constructor(
    @InjectRepository(NodeTool)
    private readonly toolRepository: Repository<NodeTool>,
    private readonly promptService: PromptService,
    private readonly aiService: AiOrchestratorService,
    @Inject('IStorageService')
    private readonly storageService: IStorageService,
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
    const safeInputs = Array.isArray(payload.inputs) ? payload.inputs : [];
    const safeOutputs = Array.isArray(payload.outputs) ? payload.outputs : [];
    const tool = this.toolRepository.create({
      name: payload.name,
      description: payload.description ?? null,
      promptTemplateVersionId: payload.promptTemplateVersionId ?? null,
      model: payload.model ?? null,
      enabled: payload.enabled ?? true,
      inputs: safeInputs,
      outputs: safeOutputs,
    });
    // Ensure JSON columns are always populated even if setters are skipped by TypeORM.
    if (!tool.inputsJson) {
      tool.inputsJson = JSON.stringify(safeInputs);
    }
    if (!tool.outputsJson) {
      tool.outputsJson = JSON.stringify(safeOutputs);
    }
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
    if (payload.inputs !== undefined) {
      tool.inputs = Array.isArray(payload.inputs) ? payload.inputs : [];
    }
    if (payload.outputs !== undefined) {
      tool.outputs = Array.isArray(payload.outputs) ? payload.outputs : [];
    }
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

  async testToolByIdWithFiles(
    id: number,
    inputs: Record<string, any> | undefined,
    files: any[] = [],
  ) {
    const tool = await this.getTool(id);
    return await this.testToolConfigWithFiles(
      {
        promptTemplateVersionId: tool.promptTemplateVersionId ?? undefined,
        model: tool.model ?? undefined,
        inputs: inputs || {},
      },
      files,
    );
  }

  async testToolConfigWithFiles(
    payload: { promptTemplateVersionId?: number; model?: string; inputs?: Record<string, any> },
    files: any[] = [],
  ) {
    if (!files.length) {
      return await this.testToolConfig(payload);
    }
    const useDataUri = this.isNanoBananaModel(payload.model);
    const merged = await this.mergeInputsWithFiles(payload.inputs || {}, files, {
      useDataUri,
      maxImages: useDataUri ? 3 : undefined,
    });
    return await this.testToolConfig({
      ...payload,
      inputs: merged.inputs,
      assetUrls: merged.assetUrls,
    });
  }

  async testToolConfig(payload: {
    promptTemplateVersionId?: number;
    model?: string;
    inputs?: Record<string, any>;
    assetUrls?: string[];
  }) {
    console.log('[NodeToolService] testToolConfig START', { model: payload.model, hasAssetUrls: !!payload.assetUrls });
    try {
      if (!payload.promptTemplateVersionId) {
        throw new BadRequestException('promptTemplateVersionId is required for testing');
      }
      const start = Date.now();
      console.log('[NodeToolService] Rendering prompt...');
      const renderVariables = this.normalizeVariables(payload.inputs || {});
      const rendered = await this.promptService.renderPrompt({
        templateVersionId: payload.promptTemplateVersionId,
        variables: renderVariables,
      });
      console.log('[NodeToolService] Prompt rendered, resolving provider type...');
      const providerType = await this.aiService.resolveProviderType(payload.model);
      console.log('[NodeToolService] Provider type resolved:', providerType);
      const assetUrls = payload.assetUrls || this.collectAssetUrls(payload.inputs || {});
      console.log('[NodeToolService] Asset URLs:', assetUrls.length);
      let outputText = '';
      let mediaUrls: string[] | undefined;
      if (providerType === ProviderType.IMAGE) {
        console.log('[NodeToolService] Calling generateImage...');
        const results = await this.aiService.generateImage(rendered.rendered, payload.model, assetUrls);
        console.log('[NodeToolService] generateImage completed, results:', results.length);
        mediaUrls = this.toMediaUrls(results, 'image/png');
        outputText = mediaUrls[0] || '';
      } else if (providerType === ProviderType.VIDEO) {
        console.log('[NodeToolService] Calling generateVideo...');
        const results = await this.aiService.generateVideo(rendered.rendered, payload.model, assetUrls);
        console.log('[NodeToolService] generateVideo completed, results:', results.length);
        mediaUrls = this.toMediaUrls(results, 'video/mp4');
        outputText = mediaUrls[0] || '';
      } else {
        console.log('[NodeToolService] Calling generateText...');
        outputText = await this.aiService.generateText(rendered.rendered, payload.model);
        console.log('[NodeToolService] generateText completed');
      }
      const parsedJson = providerType === ProviderType.LLM ? this.tryParseJson(outputText) : undefined;
      console.log('[NodeToolService] testToolConfig SUCCESS, duration:', Date.now() - start, 'ms');
      return {
        renderedPrompt: rendered.rendered,
        outputText,
        mediaUrls,
        parsedJson,
        missingVariables: rendered.missingVariables,
        durationMs: Date.now() - start,
      };
    } catch (error: any) {
      console.log('[NodeToolService] testToolConfig FAILED:', error?.message, 'code:', error?.code);
      if (error instanceof HttpException) {
        throw error;
      }
      const message = this.formatToolError(error, 'Node tool test failed');
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }
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

  private collectAssetUrls(values: Record<string, any>) {
    const urls: string[] = [];
    Object.values(values || {}).forEach((value) => {
      if (typeof value === 'string') {
        if (this.isAssetUrl(value)) urls.push(value);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (typeof item === 'string' && this.isAssetUrl(item)) urls.push(item);
        });
      }
    });
    return urls;
  }

  private toMediaUrls(results: { url?: string; data?: Buffer; mimeType?: string }[], fallbackMime: string) {
    return results
      .map((item) => {
        if (item.url) return item.url;
        if (item.data) {
          const mime = item.mimeType || fallbackMime;
          return `data:${mime};base64,${item.data.toString('base64')}`;
        }
        return '';
      })
      .filter(Boolean);
  }

  private async mergeInputsWithFiles(
    inputs: Record<string, any>,
    files: any[],
    options?: { useDataUri?: boolean; maxImages?: number },
  ) {
    const nextInputs = { ...inputs };
    const grouped = new Map<string, any[]>();
    files.forEach((file) => {
      const list = grouped.get(file.fieldname) || [];
      list.push(file);
      grouped.set(file.fieldname, list);
    });

    if (options?.useDataUri && options?.maxImages && files.length > options.maxImages) {
      throw new BadRequestException(`最多支持${options.maxImages}张图片`);
    }

    const assetUrls: string[] = [];
    for (const [fieldname, list] of grouped.entries()) {
      const urls: string[] = [];
      for (const file of list) {
        if (options?.useDataUri) {
          const dataUri = this.toDataUri(file);
          urls.push(dataUri);
          assetUrls.push(dataUri);
        } else {
          const filename = this.sanitizeFilename(file.originalname || 'upload');
          const url = await this.storageService.uploadBuffer(file.buffer, filename, {
            folder: 'node-tool-test',
            contentType: file.mimetype,
          });
          urls.push(url);
          assetUrls.push(url);
        }
      }
      nextInputs[fieldname] = urls.length > 1 ? urls : urls[0];
    }
    return { inputs: nextInputs, assetUrls };
  }

  private sanitizeFilename(name: string) {
    return `${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  }

  private isAssetUrl(value: string) {
    return /^(https?:\/\/|data:image\/|data:video\/)/i.test(value);
  }

  private isNanoBananaModel(model?: string) {
    if (!model) return false;
    const key = model.toLowerCase().replace(/[^a-z0-9]/g, '');
    return key === 'nanobanana';
  }

  private toDataUri(file: any) {
    const mime = file?.mimetype || 'image/png';
    const buffer = file?.buffer || Buffer.from('');
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }

  private formatToolError(error: any, fallback: string) {
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
}
