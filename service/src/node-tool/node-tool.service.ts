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
import { InputAssetFile } from '../ai-service/types';
import { ProgressTrackerService } from '../ai-service/progress-tracker.service';
import type { IStorageService } from '../storage/storage.interface';
import { ProviderType } from '@shared/constants';
import { imageSize } from 'image-size';
import { User } from '../database/entities';

@Injectable()
export class NodeToolService {
  constructor(
    @InjectRepository(NodeTool)
    private readonly toolRepository: Repository<NodeTool>,
    private readonly promptService: PromptService,
    private readonly aiService: AiOrchestratorService,
    @Inject('IStorageService')
    private readonly storageService: IStorageService,
    private readonly progressTracker: ProgressTrackerService,
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
      systemPromptVersionId: payload.systemPromptVersionId ?? null,
      model: payload.model ?? null,
      imageAspectRatio: payload.imageAspectRatio,
      maxTokens: payload.maxTokens ?? 1000,
      temperature: payload.temperature ?? 0.7,
      modelConfig: payload.modelConfig ?? null,
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
    if (payload.systemPromptVersionId !== undefined) {
      tool.systemPromptVersionId = payload.systemPromptVersionId;
    }
    if (payload.model !== undefined) tool.model = payload.model;
    if (payload.imageAspectRatio !== undefined) tool.imageAspectRatio = payload.imageAspectRatio;
    if (payload.maxTokens !== undefined) tool.maxTokens = payload.maxTokens;
    if (payload.temperature !== undefined) tool.temperature = payload.temperature;
    if ((payload as any).modelConfig !== undefined) tool.modelConfig = (payload as any).modelConfig;
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

  async testToolById(id: number, inputs?: Record<string, any>, user?: User, spaceId?: number) {
    const tool = await this.getTool(id);
    return await this.testToolConfig({
      promptTemplateVersionId: tool.promptTemplateVersionId ?? undefined,
      systemPromptVersionId: tool.systemPromptVersionId ?? undefined,
      model: tool.model ?? undefined,
      imageAspectRatio: tool.imageAspectRatio ?? undefined,
      maxTokens: tool.maxTokens ?? 1000,
      temperature: tool.temperature ?? 0.7,
      modelConfig: tool.modelConfig ?? undefined,
      inputs: inputs || {},
      outputs: tool.outputs || [],
      spaceId,
      assetFiles: undefined,
    }, user);
  }

  async testToolByIdWithFiles(
    id: number,
    inputs: Record<string, any> | undefined,
    files: any[] = [],
    user?: User,
    spaceId?: number,
  ) {
    const tool = await this.getTool(id);
    return await this.testToolConfigWithFiles(
      {
        promptTemplateVersionId: tool.promptTemplateVersionId ?? undefined,
        systemPromptVersionId: tool.systemPromptVersionId ?? undefined,
        model: tool.model ?? undefined,
        imageAspectRatio: tool.imageAspectRatio ?? undefined,
        maxTokens: tool.maxTokens ?? 1000,
        temperature: tool.temperature ?? 0.7,
        modelConfig: tool.modelConfig ?? undefined,
        inputs: inputs || {},
        outputs: tool.outputs || [],
        spaceId,
      },
      files,
      user,
    );
  }

  async testToolConfigWithFiles(
    payload: {
      promptTemplateVersionId?: number;
      systemPromptVersionId?: number;
      model?: string;
      imageAspectRatio?: string;
      maxTokens?: number;
      temperature?: number;
      modelConfig?: Record<string, any>;
      inputs?: Record<string, any>;
      outputs?: { key: string; name?: string; type: string }[];
      spaceId?: number;
      assetFiles?: InputAssetFile[];
    },
    files: any[] = [],
    user?: User,
  ) {
    if (!files.length) {
      return await this.testToolConfig(payload, user);
    }
    const useDataUri = this.isDoubaoSeedreamModel(payload.model);
    const merged = await this.mergeInputsWithFiles(payload.inputs || {}, files, {
      useDataUri,
      maxImages: useDataUri ? 3 : undefined,
    });
    return await this.testToolConfig({
      ...payload,
      inputs: merged.inputs,
      assetUrls: merged.assetUrls,
      assetFiles: merged.assetFiles,
    }, user);
  }

  private isDoubaoSeedreamModel(model?: string) {
    if (!model) return false;
    const key = model.toLowerCase().replace(/[^a-z0-9]/g, '');
    return key.includes('doubaoseedream') || key.includes('seedream');
  }

  async testToolConfig(payload: {
    promptTemplateVersionId?: number;
    systemPromptVersionId?: number;
    model?: string;
    imageAspectRatio?: string;
    maxTokens?: number;
    temperature?: number;
    modelConfig?: Record<string, any>;
    inputs?: Record<string, any>;
    assetUrls?: string[];
    outputs?: { key: string; name?: string; type: string }[];
    /** Asset space ID for saving JSON assets */
    spaceId?: number;
    assetFiles?: InputAssetFile[];
  }, user?: User) {
    console.log('[NodeToolService] testToolConfig START', {
      model: payload.model,
      systemPromptVersionId: payload.systemPromptVersionId,
      maxTokens: payload.maxTokens,
      temperature: payload.temperature,
      imageAspectRatio: payload.imageAspectRatio,
      modelConfig: payload.modelConfig,
      hasAssetUrls: !!payload.assetUrls,
      hasAssetFiles: !!payload.assetFiles?.length,
      outputs: payload.outputs?.map(o => `${o.key}:${o.type}`),
    });
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

      // Render system prompt if provided (for LLM nodes)
      let renderedSystemPrompt: string | undefined;
      if (payload.systemPromptVersionId) {
        const systemRendered = await this.promptService.renderPrompt({
          templateVersionId: payload.systemPromptVersionId,
          variables: renderVariables,
        });
        renderedSystemPrompt = systemRendered.rendered;
        console.log('[NodeToolService] System prompt rendered');
      }

      console.log('[NodeToolService] Prompt rendered, resolving provider type...');
      const providerType = await this.aiService.resolveProviderType(payload.model);
      console.log('[NodeToolService] Provider type resolved:', providerType);
      const assetUrls = payload.assetUrls || this.collectAssetUrls(payload.inputs || {});
      console.log('[NodeToolService] Asset URLs:', assetUrls.length);
      let outputText = '';
      let mediaUrls: string[] | undefined;
      let rawMediaResults: { url?: string; data?: Buffer; mimeType?: string }[] | undefined;
      if (providerType === ProviderType.IMAGE) {
        console.log('[NodeToolService] Calling generateImage...');
        const results = await this.aiService.generateImage(
          rendered.rendered,
          payload.model,
          assetUrls,
          { imageAspectRatio: payload.imageAspectRatio, modelConfig: payload.modelConfig, assetFiles: payload.assetFiles },
        );
        console.log('[NodeToolService] generateImage completed, results:', results.length);
        rawMediaResults = results;
        mediaUrls = this.toMediaUrls(results, 'image/png');
        outputText = mediaUrls[0] || '';
      } else if (providerType === ProviderType.VIDEO) {
        console.log('[NodeToolService] Calling generateVideo...');
        const jobId = payload.modelConfig?.clientJobId as string | undefined;
        let lastTaskId: string | undefined;
        if (jobId) {
          this.progressTracker.set({ jobId, status: 'submitted', progress: 0, updatedAt: Date.now() });
        }
        const results = await this.aiService.generateVideo(
          rendered.rendered,
          payload.model,
          assetUrls,
          {
            imageAspectRatio: payload.imageAspectRatio,
            modelConfig: payload.modelConfig,
            assetFiles: payload.assetFiles,
            clientJobId: jobId,
            onProgress: (state) => {
              if (!jobId) return;
              lastTaskId = state.taskId || lastTaskId;
              this.progressTracker.set({
                jobId,
                taskId: state.taskId,
                status: state.status,
                progress: state.progress,
                error: state.error as any,
                updatedAt: Date.now(),
              });
            },
          },
        );
        if (!results.length) {
          throw new BadRequestException('Video generation returned empty result');
        }
        console.log('[NodeToolService] generateVideo completed, results:', results.length);
        rawMediaResults = results;
        mediaUrls = this.toMediaUrls(results, 'video/mp4');
        outputText = mediaUrls[0] || '';
        if (jobId) {
          this.progressTracker.set({
            jobId,
            taskId: lastTaskId,
            status: 'completed',
            progress: 100,
            updatedAt: Date.now(),
          });
        }
      } else {
        console.log('[NodeToolService] Calling generateText...', {
          hasSystemPrompt: !!renderedSystemPrompt,
          maxTokens: payload.maxTokens,
          temperature: payload.temperature,
        });
        outputText = await this.aiService.generateText(
          rendered.rendered,
          payload.model,
          renderedSystemPrompt,
          { maxTokens: payload.maxTokens, temperature: payload.temperature },
        );
        console.log('[NodeToolService] generateText completed, output length:', outputText.length);
      }
      let savedAssets: { id: number; url: string; filename: string; mimeType: string; type: string }[] | undefined;

      const parsedJson = providerType === ProviderType.LLM ? this.tryParseJson(outputText) : undefined;
      
      console.log('[NodeToolService] testToolConfig SUCCESS, duration:', Date.now() - start, 'ms');
      return {
        renderedPrompt: rendered.rendered,
        renderedSystemPrompt,
        outputText,
        mediaUrls,
        parsedJson,
        savedAssets,
        missingVariables: rendered.missingVariables,
        durationMs: Date.now() - start,
      };
    } catch (error: any) {
      console.log('[NodeToolService] testToolConfig FAILED:', error?.message, 'code:', error?.code);
      const jobId = payload?.modelConfig?.clientJobId as string | undefined;
      if (jobId) {
        this.progressTracker.set({
          jobId,
          status: 'failed',
          progress: 100,
          error: error?.message,
          updatedAt: Date.now(),
        });
      }
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
    const assetFiles: InputAssetFile[] = [];
    for (const [fieldname, list] of grouped.entries()) {
      const urls: string[] = [];
      for (const file of list) {
        const measured = this.measureUploadDimensions(file?.buffer);
        assetFiles.push({
          buffer: file?.buffer,
          filename: file?.originalname || 'upload',
          mimeType: file?.mimetype,
          size: file?.size,
          ...measured,
        });
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
          assetFiles[assetFiles.length - 1].sourceUrl = url;
        }
      }
      nextInputs[fieldname] = urls.length > 1 ? urls : urls[0];
    }
    return { inputs: nextInputs, assetUrls, assetFiles };
  }

  private sanitizeFilename(name: string) {
    return `${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  }

  private measureUploadDimensions(buffer?: Buffer): { width?: number; height?: number } {
    if (!buffer) return {};
    try {
      const info = imageSize(buffer);
      return { width: info.width, height: info.height };
    } catch {
      return {};
    }
  }

  private isAssetUrl(value: string) {
    return /^(https?:\/\/|data:image\/|data:video\/)/i.test(value);
  }

  private isSoraModel(model?: string) {
    if (!model) return false;
    const key = model.toLowerCase().replace(/[^a-z0-9]/g, '');
    return key === 'sora' || key === 'sora2' || key === 'sora2pro' || key === 'veo31';
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
