/**
 * Create prompt template DTO
 * @module prompt/dto
 */

import { IsOptional, IsString } from 'class-validator';

export class CreatePromptTemplateDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  content?: string;
}
