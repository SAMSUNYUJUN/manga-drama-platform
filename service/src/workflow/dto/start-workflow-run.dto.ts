/**
 * Start workflow run DTO
 * @module workflow/dto
 */

import { IsInt, IsObject, IsOptional } from 'class-validator';

export class StartWorkflowRunDto {
  @IsInt()
  templateVersionId: number;

  @IsOptional()
  @IsObject()
  startInputs?: Record<string, any>;
}
