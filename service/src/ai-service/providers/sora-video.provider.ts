/**
 * Sora video provider (async creation + polling + binary download)
 * @module ai-service/providers
 */

import axios from 'axios';
import FormData from 'form-data';
import { InputAssetFile } from '../types';

interface SoraVideoOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

interface CreateVideoResult {
  id: string;
  status?: string;
}

interface QueryVideoResult {
  id: string;
  model: string;
  status: 'submitted' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  url?: string;
  error?: string;
  trace_id?: string;
}

export class SoraVideoProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;

  constructor(options: SoraVideoOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs || 60000;
    this.pollIntervalMs = options.pollIntervalMs || 3000;
    this.maxPollAttempts = options.maxPollAttempts || 200;
  }

  /**
   * Create, poll, and download a video
   */
  async generateVideo(params: {
    model: string;
    prompt: string;
    size: string;
    seconds: number;
    input?: InputAssetFile;
    jobId?: string;
    onProgress?: (payload: { taskId: string; status: string; progress?: number; error?: string }) => void;
  }): Promise<{ videoBuffer: Buffer; taskId: string; downloadUrl: string; mimeType?: string }> {
    const createResult = await this.createVideoTask(params);
    params.onProgress?.({
      taskId: createResult.id,
      status: 'submitted',
      progress: 0,
    });
    const status = await this.pollStatus(createResult.id, params.onProgress);
    const downloadUrl = this.resolveDownloadUrl(status.url);
    const videoBuffer = await this.downloadVideo(downloadUrl);
    return { videoBuffer, taskId: createResult.id, downloadUrl, mimeType: 'video/mp4' };
  }

  private async createVideoTask(params: {
    model: string;
    prompt: string;
    size: string;
    seconds: number;
    input?: InputAssetFile;
  }): Promise<CreateVideoResult> {
    const endpoint = this.buildEndpoint('/videos');
    console.log('[SoraVideoProvider] createVideoTask', {
      endpoint,
      model: params.model,
      size: params.size,
      seconds: params.seconds,
      filename: params.input?.filename,
      mime: params.input?.mimeType,
    });
    const form = new FormData();
    form.append('model', params.model);
    form.append('prompt', params.prompt);
    form.append('size', params.size);
    form.append('seconds', String(params.seconds));
    if (params.input) {
      form.append('input_reference', params.input.buffer, {
        filename: params.input.filename || 'input.png',
        contentType: params.input.mimeType || 'image/png',
        knownLength: params.input.size ?? params.input.buffer?.length,
      });
    }

    const response = await axios.post<CreateVideoResult>(endpoint, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: this.timeoutMs,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: (status) => status < 500,
    });

    if (!response.data?.id) {
      throw new Error(`Sora create video failed: ${response.data ? JSON.stringify(response.data) : 'empty response'}`);
    }

    console.log('[SoraVideoProvider] Created video task', response.data.id);
    return response.data;
  }

  private async pollStatus(
    taskId: string,
    onProgress?: (payload: { taskId: string; status: string; progress?: number; error?: string }) => void,
  ): Promise<QueryVideoResult> {
    let attempts = 0;
    while (attempts < this.maxPollAttempts) {
      attempts += 1;
      const status = await this.queryVideoStatus(taskId);
      const progressStr = status.progress !== undefined ? `${status.progress}%` : 'N/A';
      console.log(`[SoraVideoProvider] Poll #${attempts}: status=${status.status}, progress=${progressStr}, err=${status.error || ''}`);
      onProgress?.({
        taskId,
        status: status.status,
        progress: status.progress,
        error: status.error as any,
      });

      if (status.status === 'completed') {
        return status;
      }
      if (status.status === 'failed') {
        const errorDetail =
          typeof status.error === 'string'
            ? status.error
            : status.error
            ? JSON.stringify(status.error)
            : undefined;
        const details = errorDetail || status.trace_id || JSON.stringify(status);
        console.warn('[SoraVideoProvider] task failed', { taskId, status: JSON.stringify(status) });
        throw new Error(`Sora video generation failed: ${details}`);
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
    throw new Error(`Sora video generation timeout after ${this.maxPollAttempts} attempts`);
  }

  private async queryVideoStatus(taskId: string): Promise<QueryVideoResult> {
    const endpoint = this.buildEndpoint(`/videos/${encodeURIComponent(taskId)}`);
    const response = await axios.get<QueryVideoResult>(endpoint, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: this.timeoutMs,
      validateStatus: (status) => status < 500,
    });

    if (!response.data?.id) {
      throw new Error(`Sora query failed: ${response.data ? JSON.stringify(response.data) : 'empty response'}`);
    }
    return response.data;
  }

  private resolveDownloadUrl(url?: string): string {
    if (!url) {
      throw new Error('Sora response missing download url');
    }
    if (url.startsWith('http')) {
      return url;
    }
    const base = this.baseUrl;
    if (url.startsWith('/')) {
      return `${base}${url}`;
    }
    return `${base}/${url}`;
  }

  /**
   * Build API endpoint while avoiding duplicated /videos path.
   * Supports baseUrl provided as either host root or already ending with /videos.
   */
  private buildEndpoint(path: string) {
    const base = this.baseUrl.replace(/\/$/, '');
    const withoutPrefix = path.replace(/^\/videos/, '');
    const needsVideos = !/\/videos$/i.test(base);
    const suffix = withoutPrefix ? `/${withoutPrefix.replace(/^\/+/, '')}` : '';
    return `${base}${needsVideos ? '/videos' : ''}${suffix}`;
  }

  private async downloadVideo(url: string): Promise<Buffer> {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: this.timeoutMs,
      maxContentLength: Infinity,
    });
    return Buffer.from(response.data);
  }
}
