/**
 * Test node tool DTO
 * @module node-tool/dto
 */

import { IsInt, IsObject, IsOptional, IsString } from 'class-validator';

export class TestNodeToolDto {
  @IsOptional()
  @IsInt()
  promptTemplateVersionId?: number;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsObject()
  inputs?: Record<string, any>;
}
