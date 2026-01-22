/**
 * LLM 剧本解析服务
 * @module ai-service
 */

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ParsedScript {
  title: string;
  scenes: {
    index: number;
    duration: number;
    description: string;
    characters: string[];
    dialogue: string;
    visualPrompt: string;
    sceneType: 'indoor' | 'outdoor';
  }[];
  characters: {
    name: string;
    description: string;
    designPrompt: string;
  }[];
}

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  // API settings are now managed via admin UI at /admin/providers
  // This service is deprecated - use AiOrchestratorService instead
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.model = 'deepseek-chat'; // Default model, actual settings from admin UI
  }

  async parseScript(scriptText: string): Promise<ParsedScript> {
    // This method is deprecated - API settings are now managed via admin UI at /admin/providers
    // Please use AiOrchestratorService.parseScript() instead
    throw new HttpException(
      'LLM API 未配置。请在 /admin/providers 配置 LLM 服务商，并使用 AiOrchestratorService',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
