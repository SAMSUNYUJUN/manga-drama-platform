/**
 * Test node tool DTO
 * @module node-tool/dto
 */

import { IsInt, IsObject, IsOptional, IsString, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class TestNodeToolDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  promptTemplateVersionId?: number;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @ValidateIf((_, value) => typeof value === 'string')
  @IsString()
  @ValidateIf((_, value) => typeof value === 'object')
  @IsObject()
  inputs?: Record<string, any> | string;
}
