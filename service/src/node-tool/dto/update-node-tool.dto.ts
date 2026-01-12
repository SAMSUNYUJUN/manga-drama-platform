/**
 * Update node tool DTO
 * @module node-tool/dto
 */

import { IsArray, IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateNodeToolDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  promptTemplateVersionId?: number;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsArray()
  inputs?: any[];

  @IsOptional()
  @IsArray()
  outputs?: any[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
