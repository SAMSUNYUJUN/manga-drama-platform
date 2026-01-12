/**
 * Create prompt template version DTO
 * @module prompt/dto
 */

import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePromptTemplateVersionDto {
  @IsString()
  content: string;

  @IsString()
  @IsNotEmpty()
  name: string;
}
