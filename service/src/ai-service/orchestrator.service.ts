/**
 * AI orchestrator service
 * @module ai-service
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderConfig, GlobalConfig } from '../database/entities';
import { ProviderType } from '@shared/constants';
import { OpenAICompatibleProvider } from './providers/openai-compatible.provider';

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

  async generateText(prompt: string, modelOverride?: string, systemPrompt?: string): Promise<string> {
    if (this.aiMode === 'mock') {
      return `Mock response: ${prompt.slice(0, 120)}`;
    }
    const { provider, model } = await this.getProvider(ProviderType.LLM, modelOverride);
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });
    const response = await provider.chatCompletions({
      model,
      messages,
      max_tokens: this.getMaxTokens(),
      temperature: 0.2,
    });
    return response.data?.choices?.[0]?.message?.content || '';
  }

  async generateImage(
    prompt: string,
    modelOverride?: string,
    inputImages?: string[],
  ): Promise<MediaResult[]> {
    console.log('[AiOrchestratorService] generateImage START', { model: modelOverride, inputImagesCount: inputImages?.length });
    if (this.aiMode === 'mock') {
      return [this.mockImage()];
    }
    console.log('[AiOrchestratorService] Getting provider...');
    const { provider, model } = await this.getProvider(ProviderType.IMAGE, modelOverride);
    console.log('[AiOrchestratorService] Building multimodal content...');
    const content = this.buildMultimodalContent(prompt, inputImages);
    console.log('[AiOrchestratorService] Making API request...');
    const response = await this.requestWithModelFallback(provider, model, {
      messages: [{ role: 'user', content }],
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
  ): Promise<MediaResult[]> {
    if (this.aiMode === 'mock') {
      return [this.mockVideo()];
    }
    const { provider, model } = await this.getProvider(ProviderType.VIDEO, modelOverride);
    const content = this.buildMultimodalContent(prompt, inputImages);
    const response = await this.requestWithModelFallback(provider, model, {
      messages: [{ role: 'user', content }],
      max_tokens: this.getMediaMaxTokens(),
      temperature: 0.7,
    });
    const media = this.extractMedia(response.data);
    return media;
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
    const envBaseUrl = this.configService.get<string>('AI_GATEWAY_BASE_URL');
    const envKey = this.configService.get<string>('AI_GATEWAY_API_KEY');
    const envTimeout = Number(this.configService.get<string>('AI_TIMEOUT_MS', '180000'));
    const envRetry = Number(this.configService.get<string>('AI_RETRY_COUNT', '2'));

    const globalConfig = await this.globalConfigRepository.findOne({ where: { id: 1 } });
    const model = this.normalizeModelName(modelOverride || this.getDefaultModel(type, globalConfig));

    const providerId =
      type === ProviderType.LLM
        ? globalConfig?.defaultLlmProviderId
        : type === ProviderType.IMAGE
        ? globalConfig?.defaultImageProviderId
        : globalConfig?.defaultVideoProviderId;

    let providerConfig: ProviderConfig | null = null;
    if (providerId) {
      providerConfig = await this.providerRepository.findOne({ where: { id: providerId } });
    }
    if (!providerConfig) {
      providerConfig = await this.providerRepository.findOne({
        where: { type, enabled: true },
        order: { updatedAt: 'DESC' },
      });
    }

    const baseUrl = envBaseUrl || providerConfig?.baseUrl || 'https://newapi.aisonnet.org/v1';
    const apiKey = envKey || providerConfig?.apiKey || '';
    const timeoutMs = providerConfig?.timeoutMs || envTimeout;
    const retryCount = providerConfig?.retryCount ?? envRetry;

    if (!apiKey) {
      this.logger.warn(`Missing API key for ${type} provider`);
    }

    this.logger.log(`Provider config: type=${type}, model=${model}, timeout=${timeoutMs}ms, retry=${retryCount}`);

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
    const envModel =
      type === ProviderType.LLM
        ? this.configService.get<string>('LLM_MODEL')
        : type === ProviderType.IMAGE
        ? this.configService.get<string>('IMAGE_MODEL')
        : this.configService.get<string>('VIDEO_MODEL');

    if (envModel) return envModel;
    if (type === ProviderType.LLM) return globalConfig?.defaultLlmModel || 'gpt-4';
    if (type === ProviderType.IMAGE) return globalConfig?.defaultImageModel || 'jimeng-4.5';
    return globalConfig?.defaultVideoModel || 'jimeng-video-3.5-pro-10s';
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
    const key = this.normalizeModelKey(model);
    if (key === 'nanobanana') {
      const variants = ['nano-banana', 'nanobanana'];
      const unique = new Set([model, ...variants]);
      return Array.from(unique);
    }
    return [model];
  }

  private normalizeModelKey(model?: string): string {
    if (!model) return '';
    return model.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private normalizeModelName(model?: string): string {
    if (!model) return '';
    const key = this.normalizeModelKey(model);
    if (key === 'nanobanana') return 'nano-banana';
    return model.trim();
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
      // Handle nano-banana special marker: |>![g2pimage](url)
      // This must be checked before general markdown extraction
      const nanoBananaMarkerRegex = /\|>!\[g2pimage\]\(([^)]+)\)/g;
      const nanoBananaMatches = Array.from(content.matchAll(nanoBananaMarkerRegex));
      if (nanoBananaMatches.length > 0) {
        nanoBananaMatches.forEach((match) => {
          const url = match[1];
          if (url && url.startsWith('http')) {
            results.push({ url });
          }
        });
        if (results.length > 0) return results;
      }

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

      // Handle nano-banana base64 data format: "|>g2pimage" followed by base64
      const markerMatch = content.match(/\|>g2pimage([A-Za-z0-9+/=\s]+)/);
      if (markerMatch) {
        const base64Data = markerMatch[1].replace(/\s+/g, ''); // Remove whitespace
        if (base64Data.length > 100) { // Sanity check for valid base64
          try {
            results.push({ data: Buffer.from(base64Data, 'base64'), mimeType: 'image/png' });
            return results;
          } catch (error) {
            this.logger.warn('Failed to decode nano-banana image data', error);
          }
        }
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
          url.includes('cloudflare') || url.includes('nananobanana')) {
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
