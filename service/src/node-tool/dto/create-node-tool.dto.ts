/**
 * Create node tool DTO
 * @module node-tool/dto
 */

import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateNodeToolDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  promptTemplateVersionId?: number;

  /** System prompt version ID (for LLM nodes) */
  @IsOptional()
  @IsInt()
  systemPromptVersionId?: number;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  imageAspectRatio?: string;

  /** LLM max tokens (default: 1000) */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(128000)
  maxTokens?: number;

  /** LLM temperature (default: 0.7) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsArray()
  inputs: any[];

  @IsArray()
  outputs: any[];

  /** 模型特定配置（如 doubao-seedream 的参数） */
  @IsOptional()
  modelConfig?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
