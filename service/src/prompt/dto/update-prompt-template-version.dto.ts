/**
 * Update prompt template version DTO
 * @module prompt/dto
 */

import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdatePromptTemplateVersionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;
}
