/**
 * LLM 剧本解析服务
 * @module ai-service
 */

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

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
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('LLM_API_KEY')!;
    this.baseUrl = this.configService.get<string>('LLM_API_BASE_URL', 'https://api.openai.com/v1');
    this.model = this.configService.get<string>('LLM_MODEL', 'gpt-4');
  }

  async parseScript(scriptText: string): Promise<ParsedScript> {
    if (!this.apiKey) {
      throw new HttpException('LLM API 密钥未配置', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const systemPrompt = `你是一个专业的漫剧分镜师。你的任务是将剧本解析为多个分镜场景。要求：每个场景不超过15秒；生成适合AI绘画的视觉提示词；输出格式为纯JSON。`;
    
    const userPrompt = `请解析以下剧本：\n\n${scriptText}\n\n输出JSON格式包含 title, scenes, characters。`;

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        },
      );

      const content = response.data.choices[0].message.content;
      return JSON.parse(content) as ParsedScript;
    } catch (error) {
      this.logger.error(`LLM 剧本解析失败: ${error.message}`);
      throw new HttpException(`剧本解析服务异常: ${error.message}`, HttpStatus.BAD_GATEWAY);
    }
  }
}
