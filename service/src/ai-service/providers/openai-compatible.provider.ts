/**
 * OpenAI-compatible provider
 * @module ai-service/providers
 */

import axios, { AxiosResponse } from 'axios';
import * as https from 'https';
import * as http from 'http';

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
  private readonly httpAgent: http.Agent;
  private readonly httpsAgent: https.Agent;

  constructor(options: ProviderOptions) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
    this.retryCount = options.retryCount;
    
    // Create agents with longer timeouts for slow networks
    // Force IPv4 to avoid ETIMEDOUT issues on some networks
    this.httpAgent = new http.Agent({
      keepAlive: true,
      timeout: this.timeoutMs,
    });
    this.httpsAgent = new https.Agent({
      keepAlive: true,
      timeout: this.timeoutMs,
      family: 4, // Force IPv4
    });
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
        httpAgent: this.httpAgent,
        httpsAgent: this.httpsAgent,
        maxRedirects: 5,
        validateStatus: (status) => status < 500,
      }),
    );
  }

  private async requestWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let delayMs = 2000;
    
    while (true) {
      try {
        const startTime = Date.now();
        const result = await fn();
        const duration = Date.now() - startTime;
        
        if (attempt > 0) {
          console.log(`[OpenAICompatibleProvider] Request succeeded on attempt ${attempt + 1}, duration: ${duration}ms`);
        } else {
          console.log(`[OpenAICompatibleProvider] Request succeeded, duration: ${duration}ms`);
        }
        return result;
      } catch (error: any) {
        attempt += 1;
        const errorMsg = error?.message || 'Unknown error';
        const errorCode = error?.code || error?.response?.status || 'N/A';
        const errorDetails = {
          message: errorMsg,
          code: errorCode,
          errno: error?.errno,
          syscall: error?.syscall,
          hostname: error?.hostname,
          address: error?.address,
          responseStatus: error?.response?.status,
          responseData: error?.response?.data ? JSON.stringify(error?.response?.data).substring(0, 200) : undefined,
        };
        console.log(`[OpenAICompatibleProvider] Attempt ${attempt} failed:`, JSON.stringify(errorDetails));
        
        if (attempt > this.retryCount) {
          console.log(`[OpenAICompatibleProvider] Max retries (${this.retryCount}) exceeded, throwing error`);
          throw error;
        }
        
        console.log(`[OpenAICompatibleProvider] Retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2;
      }
    }
  }
}
