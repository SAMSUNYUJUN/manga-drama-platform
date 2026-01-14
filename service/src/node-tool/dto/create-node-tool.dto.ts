/**
 * Create node tool DTO
 * @module node-tool/dto
 */

import { IsArray, IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateNodeToolDto {
  @IsString()
  name: string;

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
  @IsString()
  imageAspectRatio?: string;

  @IsArray()
  inputs: any[];

  @IsArray()
  outputs: any[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
