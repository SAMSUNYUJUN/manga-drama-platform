/**
 * AI orchestrator service
 * @module ai-service
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderConfig, GlobalConfig } from '../database/entities';
import { ProviderType } from '@shared/constants';
import { OpenAICompatibleProvider } from './providers/openai-compatible.provider';
import { SoraVideoProvider } from './providers/sora-video.provider';
import { InputAssetFile } from './types';
import { imageSize } from 'image-size';
import axios from 'axios';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';

export interface MediaResult {
  url?: string;
  data?: Buffer;
  mimeType?: string;
}

@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);
  private readonly aiMode: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ProviderConfig)
    private providerRepository: Repository<ProviderConfig>,
    @InjectRepository(GlobalConfig)
    private globalConfigRepository: Repository<GlobalConfig>,
  ) {
    this.aiMode = this.configService.get<string>('AI_MODE', 'mock');
  }

  async parseScript(scriptText: string, config?: { maxDuration?: number; style?: string }) {
    if (this.aiMode === 'mock') {
      return this.mockParse(scriptText);
    }
    const trimmed = scriptText.slice(0, 10000);
    const { provider, model } = await this.getProvider(ProviderType.LLM);
    const systemPrompt = [
      'You are a storyboard writer.',
      'Return pure JSON with title, scenes, characters.',
      'Each scene duration <= 15 seconds.',
    ].join(' ');
    const userPrompt = `Parse script:\n${trimmed}`;
    const response = await provider.chatCompletions({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: this.getMaxTokens(),
      temperature: 0.2,
    });
    const content = response.data?.choices?.[0]?.message?.content || '{}';
    try {
      return JSON.parse(content);
    } catch (error) {
      this.logger.warn('Failed to parse JSON, returning raw content');
      return { raw: content };
    }
  }

  async generateText(
    prompt: string,
    modelOverride?: string,
    systemPrompt?: string,
    options?: { maxTokens?: number; temperature?: number },
  ): Promise<string> {
    if (this.aiMode === 'mock') {
      return `Mock response: ${prompt.slice(0, 120)}`;
    }
    const { provider, model } = await this.getProvider(ProviderType.LLM, modelOverride);
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
      console.log('[AiOrchestratorService] System prompt added, length:', systemPrompt.length);
    }
    messages.push({ role: 'user', content: prompt });
    const maxTokens = options?.maxTokens ?? 1000;
    const temperature = options?.temperature ?? 0.7;
    const response = await provider.chatCompletions({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    });
    // Debug: log the full response structure
    console.log('[AiOrchestratorService] generateText response status:', response.status);
    console.log('[AiOrchestratorService] generateText response data keys:', Object.keys(response.data || {}));
    console.log('[AiOrchestratorService] generateText choices:', JSON.stringify(response.data?.choices, null, 2)?.substring(0, 500));
    const content = response.data?.choices?.[0]?.message?.content || '';
    console.log('[AiOrchestratorService] generateText content length:', content.length);
    return content;
  }

  async generateImage(
    prompt: string,
    modelOverride?: string,
    inputImages?: string[],
    options?: { 
      imageAspectRatio?: string;
      modelConfig?: Record<string, any>;
      assetFiles?: InputAssetFile[];
    },
  ): Promise<MediaResult[]> {
    console.log('[AiOrchestratorService] generateImage START', {
      model: modelOverride || 'default',
      inputImagesCount: inputImages?.length,
      ...(options?.imageAspectRatio && { aspectRatio: options.imageAspectRatio }),
      ...(options?.modelConfig && { modelConfig: options.modelConfig }),
    });
    if (this.aiMode === 'mock') {
      return [this.mockImage()];
    }
    
    // Check if this is doubao-seedream model
    if (this.isDoubaoSeedreamModel(modelOverride)) {
      return await this.generateImageWithDoubaoSeedream(prompt, modelOverride!, inputImages, options);
    }

    // Check if this is Gemini image model
    if (this.isGeminiImageModel(modelOverride)) {
      return await this.generateImageWithGemini(prompt, modelOverride!, inputImages, options);
    }
    
    console.log('[AiOrchestratorService] Getting provider...');
    const { provider, model } = await this.getProvider(ProviderType.IMAGE, modelOverride);
    console.log('[AiOrchestratorService] Building multimodal content...');
    const content = this.buildMultimodalContent(prompt, inputImages);
    const messages: Array<{ role: 'system' | 'user'; content: any }> = [{ role: 'user', content }];
    
    console.log('[AiOrchestratorService] Making API request...');
    const response = await this.requestWithModelFallback(provider, model, {
      messages,
      max_tokens: this.getMediaMaxTokens(),
      temperature: 0.7,
    });
    console.log('[AiOrchestratorService] API request completed, extracting media...');
    const media = this.extractMedia(response.data);
    console.log('[AiOrchestratorService] Media extracted:', media.length, 'items');
    return media;
  }

  async generateVideo(
    prompt: string,
    modelOverride?: string,
    inputImages?: string[],
    options?: {
      imageAspectRatio?: string;
      modelConfig?: Record<string, any>;
      assetFiles?: InputAssetFile[];
      clientJobId?: string;
      onProgress?: (payload: { taskId?: string; status: string; progress?: number; error?: string }) => void;
    },
  ): Promise<MediaResult[]> {
    console.log('[AiOrchestratorService] generateVideo START', { model: modelOverride, inputImagesCount: inputImages?.length, aspectRatio: options?.imageAspectRatio });
    if (this.aiMode === 'mock') {
      return [this.mockVideo()];
    }

    const model = modelOverride || 'sora';
    const providerConfig = await this.findProviderConfigByModel(model, ProviderType.VIDEO);

    // Handle sora async video models
    if (this.isSoraModel(model) || this.isSoraBaseUrl(providerConfig?.baseUrl)) {
      return await this.generateVideoWithSora(prompt, model, inputImages, {
        modelConfig: options?.modelConfig,
        assetFiles: options?.assetFiles,
        clientJobId: options?.clientJobId,
        onProgress: options?.onProgress,
      }, providerConfig);
    }
    
    // Fallback to OpenAI-compatible provider
    const { provider, model: resolvedModel } = await this.getProvider(ProviderType.VIDEO, modelOverride);
    const content = this.buildMultimodalContent(prompt, inputImages);
    const response = await this.requestWithModelFallback(provider, resolvedModel, {
      messages: [{ role: 'user', content }],
      max_tokens: this.getMediaMaxTokens(),
      temperature: 0.7,
    });
    const media = this.extractMedia(response.data);
    return media;
  }

  private async generateVideoWithSora(
    prompt: string,
    model: string,
    inputImages?: string[],
    options?: {
      modelConfig?: Record<string, any>;
      assetFiles?: InputAssetFile[];
      clientJobId?: string;
      onProgress?: (payload: { taskId?: string; status: string; progress?: number; error?: string }) => void;
    },
    providerConfig?: ProviderConfig | null,
  ): Promise<MediaResult[]> {
    if (!providerConfig) {
      providerConfig = await this.findProviderConfigByModel(model, ProviderType.VIDEO);
    }
    if (!providerConfig?.baseUrl || !providerConfig?.apiKey) {
      throw new BadRequestException('Sora 视频提供商未配置，请先在 /admin/providers 中配置 baseUrl 与 apiKey');
    }

    const inputFile = await this.resolveSoraInputFile(options?.assetFiles, inputImages);
    const size = this.resolveSoraSize(options?.modelConfig, inputFile);
    const seconds = this.resolveSoraSeconds(options?.modelConfig);
    console.log('[AiOrchestratorService] Sora params', { model, size, seconds, hasBuffer: !!inputFile?.buffer });

    const soraProvider = new SoraVideoProvider({
      baseUrl: providerConfig.baseUrl,
      apiKey: providerConfig.apiKey,
      timeoutMs: providerConfig.timeoutMs || 60000,
      pollIntervalMs: 5000, // Poll every few seconds
      maxPollAttempts: providerConfig.timeoutMs ? Math.max(60, Math.floor(providerConfig.timeoutMs / 3000)) : 200,
    });

    const result = await soraProvider.generateVideo({
      model,
      prompt,
      size,
      seconds,
      input: inputFile,
      jobId: options?.clientJobId,
      onProgress: options?.onProgress,
    });

    return [
      {
        data: result.videoBuffer,
        mimeType: result.mimeType || 'video/mp4',
        url: result.downloadUrl,
      },
    ];
  }

  private async resolveSoraInputFile(assetFiles?: InputAssetFile[], inputImages?: string[]): Promise<InputAssetFile | undefined> {
    if (assetFiles && assetFiles.length) {
      const file = assetFiles[0];
      const measured = this.measureImage(file.buffer);
      return { ...file, ...measured };
    }
    if (inputImages && inputImages.length) {
      return await this.downloadInputImageAsFile(inputImages[0]);
    }
    // 文生视频时没有参考图也应允许
    return undefined;
  }

  private async downloadInputImageAsFile(url: string): Promise<InputAssetFile> {
    if (!url) {
      throw new BadRequestException('缺少输入图片');
    }
    if (url.startsWith('data:')) {
      const match = url.match(/^data:(.*?);base64,(.+)$/);
      if (!match) {
        throw new BadRequestException('仅支持 base64 图片作为输入');
      }
      const mimeType = match[1] || 'image/png';
      const buffer = Buffer.from(match[2], 'base64');
      const measured = this.measureImage(buffer);
      return {
        buffer,
        mimeType,
        filename: this.buildFilenameFromUrl('upload', mimeType),
        size: buffer.length,
        ...measured,
      };
    }

    const httpsAgent = new https.Agent({ family: 4, timeout: 60000 });
    const httpAgent = new http.Agent({ family: 4, timeout: 60000 });
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 60000,
      httpsAgent,
      httpAgent,
      maxRedirects: 5,
    });
    const buffer = Buffer.from(response.data);
    const mimeType =
      (response.headers['content-type'] as string | undefined) ||
      this.guessMimeType('image', path.extname(url).replace('.', ''));
    const measured = this.measureImage(buffer);
    return {
      buffer,
      mimeType,
      filename: this.buildFilenameFromUrl(url, mimeType),
      size: buffer.length,
      sourceUrl: url,
      ...measured,
    };
  }

  private measureImage(buffer?: Buffer): { width?: number; height?: number } {
    if (!buffer) return {};
    try {
      const meta = imageSize(buffer);
      return { width: meta.width, height: meta.height };
    } catch {
      return {};
    }
  }

  private resolveSoraSize(modelConfig?: Record<string, any>, file?: InputAssetFile) {
    const allowed = new Set(['1280x720', '1920x1080', '1024x576']);
    const sanitize = (value?: string) => (value || '').toLowerCase().replace(/\s+/g, '');
    const configSize = sanitize(modelConfig?.size);
    if (configSize && allowed.has(configSize)) return configSize;

    if (file?.width && file?.height) {
      const derived = `${file.width}x${file.height}`;
      if (allowed.has(derived)) return derived;
      console.log('[AiOrchestratorService] Sora size fallback, unsupported input size:', derived);
    }
    return '1280x720';
  }

  private resolveSoraSeconds(modelConfig?: Record<string, any>) {
    const rawSeconds = modelConfig?.seconds;
    const seconds = Number(rawSeconds);
    if (Number.isFinite(seconds) && seconds >= 15) return 15;
    if (Number.isFinite(seconds) && seconds >= 10) return 10;
    return 10;
  }

  private buildFilenameFromUrl(url: string, mimeType?: string) {
    const ext = path.extname(url.split('?')[0]) || '';
    const fallbackExt = mimeType?.includes('png')
      ? '.png'
      : mimeType?.includes('jpg') || mimeType?.includes('jpeg')
      ? '.jpg'
      : '.bin';
    const name = path.basename(url.split('?')[0]) || 'input';
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');
    return `${Date.now()}_${safeName}${ext || fallbackExt}`;
  }

  private guessMimeType(mediaType: 'image' | 'video', ext?: string) {
    if (ext) {
      const normalized = ext.replace('.', '').toLowerCase();
      if (mediaType === 'image') {
        if (normalized === 'png') return 'image/png';
        if (normalized === 'jpg' || normalized === 'jpeg') return 'image/jpeg';
        if (normalized === 'webp') return 'image/webp';
      } else {
        if (normalized === 'mp4') return 'video/mp4';
        if (normalized === 'webm') return 'video/webm';
      }
    }
    return mediaType === 'image' ? 'image/png' : 'video/mp4';
  }

  private async findProviderConfigByModel(model: string, type: ProviderType): Promise<ProviderConfig | null> {
    const targetKey = this.normalizeModelKey(model);
    const providers = await this.providerRepository.find({ where: { type, enabled: true } });
    const matched = providers.find((provider) =>
      provider.models.some((candidate) => this.normalizeModelKey(candidate) === targetKey),
    );
    return matched || providers[0] || null;
  }

  private isSoraModel(model?: string): boolean {
    if (!model) return false;
    const key = this.normalizeModelKey(model);
    return key === 'sora' || key === 'sora2' || key === 'sora2pro' || key === 'veo31';
  }

  private isSoraBaseUrl(baseUrl?: string): boolean {
    if (!baseUrl) return false;
    const normalized = baseUrl.toLowerCase().replace(/\/$/, '');
    return normalized === 'https://api.laozhang.ai/v1/videos';
  }

  async resolveProviderType(model?: string): Promise<ProviderType> {
    if (!model) return ProviderType.LLM;
    const targetKey = this.normalizeModelKey(model);
    const providers = await this.providerRepository.find({ where: { enabled: true } });
    const matched = providers.find((provider) =>
      provider.models.some((candidate) => this.normalizeModelKey(candidate) === targetKey),
    );
    return matched?.type || ProviderType.LLM;
  }

  private async getProvider(type: ProviderType, modelOverride?: string) {
    const defaultTimeout = Number(this.configService.get<string>('AI_TIMEOUT_MS', '180000'));
    const defaultRetry = Number(this.configService.get<string>('AI_RETRY_COUNT', '2'));

    const globalConfig = await this.globalConfigRepository.findOne({ where: { id: 1 } });
    const model = this.normalizeModelName(modelOverride || this.getDefaultModel(type, globalConfig));

    // 优先根据模型名称查找对应的 provider
    let providerConfig: ProviderConfig | null = null;
    if (modelOverride) {
      const targetKey = this.normalizeModelKey(modelOverride);
      const providers = await this.providerRepository.find({ where: { enabled: true } });
      providerConfig = providers.find((provider) =>
        provider.models.some((candidate) => this.normalizeModelKey(candidate) === targetKey),
      ) || null;
    }

    // 如果没有找到，则根据 globalConfig 中的 providerId 查找
    if (!providerConfig) {
      const providerId =
        type === ProviderType.LLM
          ? globalConfig?.defaultLlmProviderId
          : type === ProviderType.IMAGE
          ? globalConfig?.defaultImageProviderId
          : globalConfig?.defaultVideoProviderId;

      if (providerId) {
        providerConfig = await this.providerRepository.findOne({ where: { id: providerId } });
      }
    }

    // 如果还是没有，则根据类型查找最近更新的 provider
    if (!providerConfig) {
      providerConfig = await this.providerRepository.findOne({
        where: { type, enabled: true },
        order: { updatedAt: 'DESC' },
      });
    }

    const baseUrl = providerConfig?.baseUrl || '';
    const apiKey = providerConfig?.apiKey || '';
    const timeoutMs = providerConfig?.timeoutMs || defaultTimeout;
    const retryCount = providerConfig?.retryCount ?? defaultRetry;

    if (!apiKey) {
      this.logger.warn(`Missing API key for ${type} provider`);
    }

    this.logger.log(`Provider config: type=${type}, model=${model}, baseUrl=${baseUrl}, timeout=${timeoutMs}ms, retry=${retryCount}`);

    return {
      provider: new OpenAICompatibleProvider({
        baseUrl,
        apiKey,
        timeoutMs,
        retryCount,
      }),
      model,
    };
  }

  private getDefaultModel(type: ProviderType, globalConfig?: GlobalConfig | null): string {
    // All model settings are managed via admin UI at /admin/providers
    if (type === ProviderType.LLM) return globalConfig?.defaultLlmModel || 'deepseek-chat';
    if (type === ProviderType.IMAGE) return globalConfig?.defaultImageModel || 'image-generation';
    return globalConfig?.defaultVideoModel || 'sora';
  }

  private getMaxTokens(): number {
    const maxTokens = Number(this.configService.get<string>('LLM_MAX_TOKENS', '600'));
    return Math.min(maxTokens, 600);
  }

  private getMediaMaxTokens(): number {
    return Math.min(this.getMaxTokens(), 300);
  }

  private buildMultimodalContent(prompt: string, inputImages?: string[]) {
    const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [];
    content.push({ type: 'text', text: prompt?.trim() || ' ' });
    if (inputImages && inputImages.length) {
      inputImages.slice(0, 3).forEach((url) => {
        content.push({ type: 'image_url', image_url: { url } });
      });
    }
    return content;
  }

  private async requestWithModelFallback(
    provider: OpenAICompatibleProvider,
    model: string,
    payload: Record<string, any>,
  ) {
    const candidates = this.getModelCandidates(model);
    let lastError: any = null;
    for (const candidate of candidates) {
      try {
        return await provider.chatCompletions({ model: candidate, ...payload });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  private getModelCandidates(model: string): string[] {
    return [model];
  }

  private normalizeModelKey(model?: string): string {
    if (!model) return '';
    return model.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private normalizeModelName(model?: string): string {
    if (!model) return '';
    return model.trim();
  }

  private isGeminiImageModel(model?: string): boolean {
    if (!model) return false;
    const key = this.normalizeModelKey(model);
    return key === 'gemini3proimagepreview' || key === 'gemini3proimage';
  }

  private isDoubaoSeedreamModel(model?: string): boolean {
    if (!model) return false;
    const key = this.normalizeModelKey(model);
    return key.includes('doubaoseedream') || key.includes('seedream');
  }

  /**
   * 使用 Gemini 3 Pro Image Preview 模型生成图片
   * 支持：纯文本生图、文+图生图（URL 优先，失败回退为 base64）
   */
  private async generateImageWithGemini(
    prompt: string,
    model: string,
    inputImages?: string[],
    options?: {
      imageAspectRatio?: string;
      modelConfig?: Record<string, any>;
      assetFiles?: InputAssetFile[];
    },
  ): Promise<MediaResult[]> {
    console.log('[AiOrchestratorService] generateImageWithGemini START', {
      model,
      prompt: prompt.substring(0, 100),
      inputImagesCount: inputImages?.length,
      modelConfig: options?.modelConfig,
    });

    const providerConfig = await this.findProviderConfigByModel(model, ProviderType.IMAGE);
    if (!providerConfig?.baseUrl || !providerConfig?.apiKey) {
      throw new BadRequestException('Gemini 图像模型未配置，请在 /admin/providers 中设置 baseUrl 与 apiKey');
    }

    const baseUrl = providerConfig.baseUrl.replace(/\/$/, '');
    const endpoint = baseUrl.includes('/models/')
      ? baseUrl
      : `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;

    // 选择图片来源：优先用户上传文件，其次输入 URL
    const imageUrl = inputImages?.[0];
    const inlineFile: InputAssetFile | undefined =
      options?.assetFiles?.[0] ||
      (imageUrl && imageUrl.startsWith('data:') ? await this.downloadInputImageAsFile(imageUrl) : undefined);

    // 构建请求并发送；如 fileData 失败再回退 inline_data
    const aspectRatio =
      options?.modelConfig?.imageConfig?.aspectRatio ||
      options?.imageAspectRatio ||
      '16:9';
    const imageSize = options?.modelConfig?.imageConfig?.imageSize || '4K';

    const sendRequest = async (useInline: boolean): Promise<MediaResult[]> => {
      const payload: any = {
        contents: [
          {
            role: 'user',
            parts: [
              ...(useInline && inlineFile
                ? [
                    {
                      inline_data: {
                        mime_type: inlineFile.mimeType || 'image/png',
                        data: inlineFile.buffer.toString('base64'),
                      },
                    },
                  ]
                : !useInline && imageUrl
                ? [
                    {
                      fileData: {
                        fileUri: imageUrl,
                        mimeType: this.guessMimeType('image', path.extname(imageUrl).replace('.', '')),
                      },
                    },
                  ]
                : []),
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: {
            aspectRatio,
            imageSize,
          },
        },
      };

      const response = await axios.post(endpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': providerConfig.apiKey,
        },
        timeout: providerConfig.timeoutMs || 120000,
        httpsAgent: new https.Agent({ family: 4, timeout: providerConfig.timeoutMs || 120000 }),
      });

      const media = this.extractGeminiMedia(response.data);
      if (!media.length) {
        throw new BadRequestException('Gemini 返回数据中未找到图片');
      }
      return media;
    };

    // 优先走 URL；失败后尝试 inline_data
    if (imageUrl && !inlineFile) {
      try {
        return await sendRequest(false);
      } catch (error) {
        console.warn('[AiOrchestratorService] Gemini fileData failed, retry with inline_data', error?.message);
        const downloaded = await this.downloadInputImageAsFile(imageUrl);
        const inlineFromUrl: InputAssetFile = {
          ...downloaded,
          mimeType: downloaded.mimeType || 'image/png',
        };
        (options ??= {}).assetFiles = [inlineFromUrl];
        return await this.generateImageWithGemini(prompt, model, inputImages, options);
      }
    }

    // 直接使用 inline_data（包含本地上传或 data URI）
    if (inlineFile) {
      return await sendRequest(true);
    }

    // 纯文生图
    return await sendRequest(false);
  }

  private extractGeminiMedia(response: any): MediaResult[] {
    const results: MediaResult[] = [];
    const candidates = response?.candidates || [];
    candidates.forEach((candidate: any) => {
      const parts = candidate?.content?.parts || [];
      parts.forEach((part: any) => {
        const inlineData = part?.inlineData || part?.inline_data;
        if (inlineData?.data) {
          const mime = inlineData?.mimeType || inlineData?.mime_type || 'image/png';
          results.push({ data: Buffer.from(inlineData.data, 'base64'), mimeType: mime });
          return;
        }
        const fileData = part?.fileData || part?.file_data;
        if (fileData?.fileUri) {
          results.push({ url: fileData.fileUri });
        }
      });
    });
    return results;
  }


  /**
   * 使用 doubao-seedream 模型生成图片
   * API 格式参考字节跳动火山引擎的图片生成 API
   */
  private async generateImageWithDoubaoSeedream(
    prompt: string,
    model: string,
    inputImages?: string[],
    options?: {
      imageAspectRatio?: string;
      modelConfig?: {
        size?: string;
        sequential_image_generation?: 'auto' | 'disabled';
        max_images?: number;
        watermark?: boolean;
        stream?: boolean;
        response_format?: 'url' | 'b64_json';
      };
    },
  ): Promise<MediaResult[]> {
    console.log('[AiOrchestratorService] generateImageWithDoubaoSeedream START', {
      model,
      prompt: prompt.substring(0, 100),
      inputImagesCount: inputImages?.length,
      options,
    });

    // Prefer provider matched by model; fallback to latest IMAGE provider
    let providerConfig =
      (await this.findProviderConfigByModel(model, ProviderType.IMAGE)) ||
      (await this.providerRepository.findOne({
        where: { type: ProviderType.IMAGE, enabled: true },
        order: { updatedAt: 'DESC' },
      }));

    if (!providerConfig?.baseUrl || !providerConfig?.apiKey) {
      throw new BadRequestException('Image provider not configured. Please configure it at /admin/providers');
    }

    const config = options?.modelConfig || {};
    
    // Build request body
    const requestBody: any = {
      model: model,
      prompt: prompt,
      size: config.size || '2048x2048',
      sequential_image_generation: config.sequential_image_generation || 'disabled',
      watermark: config.watermark ?? false,
      stream: config.stream ?? false,
      response_format: config.response_format || 'url',
    };

    // Add sequential_image_generation_options if auto mode
    if (config.sequential_image_generation === 'auto' && config.max_images) {
      requestBody.sequential_image_generation_options = {
        max_images: config.max_images,
      };
    }

    // Add reference images if provided
    if (inputImages && inputImages.length > 0) {
      requestBody.image = inputImages;
    }

    console.log('[AiOrchestratorService] Doubao Seedream request body:', {
      ...requestBody,
      prompt: requestBody.prompt.substring(0, 100) + '...',
      image: requestBody.image?.length ? `[${requestBody.image.length} images]` : undefined,
    });

    // baseUrl should be the API endpoint (e.g., https://ark.cn-beijing.volces.com/api/v3)
    // We append /images/generations to it
    const apiUrl = providerConfig.baseUrl.endsWith('/v1/images/generations') 
      ? providerConfig.baseUrl 
      : `${providerConfig.baseUrl.replace(/\/$/, '')}/images/generations`;

    try {
      const response = await axios.post(
        apiUrl,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${providerConfig.apiKey}`,
          },
          timeout: 120000, // 2 minutes timeout
        },
      );

      console.log('[AiOrchestratorService] Doubao Seedream response status:', response.status);
      
      const results: MediaResult[] = [];
      const dataItems = response.data?.data;
      
      if (Array.isArray(dataItems)) {
        dataItems.forEach((item: any) => {
          if (item?.url) {
            results.push({ url: item.url });
          } else if (item?.b64_json) {
            results.push({ 
              data: Buffer.from(item.b64_json, 'base64'), 
              mimeType: 'image/png' 
            });
          }
        });
      }

      console.log('[AiOrchestratorService] Doubao Seedream extracted', results.length, 'images');
      return results;
    } catch (error: any) {
      console.error('[AiOrchestratorService] Doubao Seedream error:', error?.response?.data || error?.message);
      throw new BadRequestException(
        `Doubao Seedream API error: ${error?.response?.data?.error?.message || error?.message}`
      );
    }
  }

  private extractMedia(response: any): MediaResult[] {
    const results: MediaResult[] = [];

    const dataItems = response?.data;
    if (Array.isArray(dataItems)) {
      dataItems.forEach((item) => {
        if (item?.url) {
          results.push({ url: item.url });
        } else if (item?.b64_json) {
          results.push({ data: Buffer.from(item.b64_json, 'base64'), mimeType: 'image/png' });
        }
      });
      if (results.length > 0) return results;
    }

    const content = response?.choices?.[0]?.message?.content;
    if (Array.isArray(content)) {
      content.forEach((part) => {
        const url = part?.image_url?.url || part?.video_url?.url || part?.url;
        if (url) results.push({ url });
      });
      if (results.length > 0) return results;
    }

    if (typeof content === 'string') {
      // Extract Markdown image links: ![alt](url)
      const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
      const markdownMatches = Array.from(content.matchAll(markdownImageRegex));
      if (markdownMatches.length > 0) {
        markdownMatches.forEach((match) => {
          const url = match[2];
          if (url && url.startsWith('http')) {
            results.push({ url });
          }
        });
        if (results.length > 0) return results;
      }

      const jsonObject = this.tryParseJson(content);
      if (jsonObject) {
        const url =
          jsonObject.image_url?.url ||
          jsonObject.video_url?.url ||
          jsonObject.url ||
          jsonObject.video_url ||
          jsonObject.image_url;
        if (url) results.push({ url });
        if (Array.isArray(jsonObject.images)) {
          jsonObject.images.forEach((imageUrl: string) => results.push({ url: imageUrl }));
        }
        if (results.length > 0) return results;
      }

      const dataUri = this.extractDataUri(content);
      if (dataUri) {
        const { mimeType, base64 } = dataUri;
        results.push({ data: Buffer.from(base64, 'base64'), mimeType });
        return results;
      }

      const url = this.extractMediaUrl(content);
      if (url) {
        results.push({ url });
        return results;
      }
    }

    return results;
  }

  private extractMediaUrl(content: string): string | null {
    // First try to match URLs with common media extensions
    const extRegex = /(https?:\/\/[^\s)]+?\.(png|jpg|jpeg|gif|mp4|webm))/i;
    const extMatch = content.match(extRegex);
    if (extMatch) return extMatch[1];
    
    // Fallback: match any HTTP(S) URL that looks like a media resource
    // This handles URLs without extensions or with query parameters
    const urlRegex = /(https?:\/\/[^\s)]+)/i;
    const urlMatch = content.match(urlRegex);
    if (urlMatch) {
      const url = urlMatch[1];
      // Check if URL contains common media hosting patterns or paths
      if (url.includes('/png/') || url.includes('/jpg/') || url.includes('/jpeg/') || 
          url.includes('/image/') || url.includes('/video/') || url.includes('/mp4/') ||
          url.includes('cloudflare')) {
        return url;
      }
    }
    
    return null;
  }

  private extractDataUri(content: string): { mimeType: string; base64: string } | null {
    const regex = /(data:(image|video)\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+))/i;
    const match = content.match(regex);
    if (!match) return null;
    const full = match[1];
    const mimeType = full.split(';')[0].replace('data:', '');
    const base64 = match[3];
    return { mimeType, base64 };
  }

  private tryParseJson(content: string): any | null {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      const snippet = content.slice(start, end + 1);
      return JSON.parse(snippet);
    } catch {
      return null;
    }
  }

  private mockParse(scriptText: string) {
    return {
      title: 'Mock Storyboard',
      scenes: [
        {
          index: 1,
          duration: 10,
          description: scriptText.slice(0, 40) || 'Scene 1',
          characters: ['Hero'],
          dialogue: 'Mock dialogue',
          visualPrompt: 'A hero standing in the rain, cinematic',
          sceneType: 'outdoor',
        },
      ],
      characters: [
        {
          name: 'Hero',
          description: 'A young hero with determined eyes',
          designPrompt: 'anime hero portrait, clean line art',
        },
      ],
    };
  }

  private mockImage(): MediaResult {
    const base64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
    return { data: Buffer.from(base64, 'base64'), mimeType: 'image/png' };
  }

  private mockVideo(): MediaResult {
    const base64 =
      'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANvbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAABB1dHJhawAAAFx0a2hkAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAABR0bWVkAAAAAQAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAABp0cmFrAAAAHHRraGQAAAAAAAAAAAAAAAAAAAAQAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAABOAAAAAABcAAAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAABR0a2hkAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAABOAAAAAABcAAAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAABR0a2hkAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAABOAAAAAABcAAAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAEAAAAAAAAAAAAAAAAAAAAAAA==';
    return { data: Buffer.from(base64, 'base64'), mimeType: 'video/mp4' };
  }
}
