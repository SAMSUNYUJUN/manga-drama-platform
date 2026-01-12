/**
 * OpenAI-compatible provider
 * @module ai-service/providers
 */

import axios, { AxiosResponse } from 'axios';

interface ProviderOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  retryCount: number;
}

export class OpenAICompatibleProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly retryCount: number;

  constructor(options: ProviderOptions) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
    this.retryCount = options.retryCount;
  }

  async chatCompletions(payload: Record<string, any>): Promise<AxiosResponse<any>> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
    return await this.requestWithRetry(() =>
      axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: this.timeoutMs,
      }),
    );
  }

  private async requestWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let delayMs = 2000;
    while (true) {
      try {
        return await fn();
      } catch (error) {
        attempt += 1;
        if (attempt > this.retryCount) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2;
      }
    }
  }
}
