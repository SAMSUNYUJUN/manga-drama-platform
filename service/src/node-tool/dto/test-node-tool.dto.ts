/**
 * Test node tool DTO
 * @module node-tool/dto
 */

import { IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class TestNodeToolDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  promptTemplateVersionId?: number;

  /** System prompt version ID (for LLM nodes) */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
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
  @Type(() => Number)
  maxTokens?: number;

  /** LLM temperature (default: 0.7) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  @Type(() => Number)
  temperature?: number;

  @IsOptional()
  @ValidateIf((_, value) => typeof value === 'string')
  @IsString()
  @ValidateIf((_, value) => typeof value === 'object')
  @IsObject()
  inputs?: Record<string, any> | string;

  /** Output definitions for determining how to save output (e.g., json, list<json>) */
  @IsOptional()
  outputs?: { key: string; name?: string; type: string }[];
}
