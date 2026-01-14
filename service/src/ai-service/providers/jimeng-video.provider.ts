/**
 * Jimeng Video provider (async create + polling query)
 * @module ai-service/providers
 */

import axios from 'axios';
import * as https from 'https';

interface JimengVideoOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

interface CreateVideoRequest {
  model: string;
  prompt: string;
  aspect_ratio: string;
  size: string;
  images: string[];
}

interface CreateVideoResponse {
  id: string;
  status: string;
  status_update_time: number;
}

interface QueryVideoResponse {
  id: string;
  model: string;
  ratio: string;
  prompt: string;
  status: 'processing' | 'generating' | 'completed' | 'failed';
  progress?: number;
  video_url?: string;
  completed_at?: number;
  status_update_time: number;
  error?: string;
  trace_id?: string;
}

export class JimengVideoProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;
  private readonly httpsAgent: https.Agent;

  constructor(options: JimengVideoOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs || 60000;
    this.pollIntervalMs = options.pollIntervalMs || 5000; // Poll every 5 seconds
    this.maxPollAttempts = options.maxPollAttempts || 120; // Max 10 minutes (120 * 5s)
    
    this.httpsAgent = new https.Agent({
      keepAlive: true,
      timeout: this.timeoutMs,
      family: 4,
    });
  }

  /**
   * Generate video with async polling
   * @returns video_url when completed
   */
  async generateVideo(
    prompt: string,
    aspectRatio: string = '16:9',
    images: string[] = [],
  ): Promise<{ videoUrl: string; taskId: string }> {
    console.log('[JimengVideoProvider] Creating video task...', { prompt: prompt.substring(0, 100), aspectRatio, imagesCount: images.length });
    
    // Step 1: Create video task
    const createResponse = await this.createVideoTask({
      model: 'jimeng-video-3.0',
      prompt,
      aspect_ratio: aspectRatio,
      size: '1080P',
      images,
    });
    
    console.log('[JimengVideoProvider] Task created:', createResponse.id);
    
    // Step 2: Poll for completion
    const result = await this.pollForCompletion(createResponse.id);
    
    if (!result.video_url) {
      throw new Error(`Video generation failed: ${result.error || 'No video URL returned'}`);
    }
    
    console.log('[JimengVideoProvider] Video completed:', result.video_url);
    return { videoUrl: result.video_url, taskId: result.id };
  }

  private async createVideoTask(request: CreateVideoRequest): Promise<CreateVideoResponse> {
    const url = `${this.baseUrl}/v1/video/create`;
    console.log('[JimengVideoProvider] POST', url, JSON.stringify(request));
    
    const response = await axios.post<CreateVideoResponse>(url, request, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      timeout: this.timeoutMs,
      httpsAgent: this.httpsAgent,
    });
    
    if (!response.data?.id) {
      throw new Error(`Failed to create video task: ${JSON.stringify(response.data)}`);
    }
    
    return response.data;
  }

  private async queryVideoStatus(taskId: string): Promise<QueryVideoResponse> {
    const url = `${this.baseUrl}/v1/video/query?id=${encodeURIComponent(taskId)}`;
    
    const response = await axios.get<QueryVideoResponse>(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      timeout: this.timeoutMs,
      httpsAgent: this.httpsAgent,
    });
    
    return response.data;
  }

  private async pollForCompletion(taskId: string): Promise<QueryVideoResponse> {
    let attempts = 0;
    
    while (attempts < this.maxPollAttempts) {
      attempts++;
      
      const status = await this.queryVideoStatus(taskId);
      const progressStr = status.progress !== undefined ? `${status.progress}%` : 'N/A';
      console.log(`[JimengVideoProvider] Poll #${attempts}: status=${status.status}, progress=${progressStr}`);
      
      if (status.status === 'completed') {
        return status;
      }
      
      if (status.status === 'failed') {
        throw new Error(`Video generation failed: ${status.error || 'Unknown error'}`);
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
    }
    
    throw new Error(`Video generation timeout after ${this.maxPollAttempts} poll attempts`);
  }
}
