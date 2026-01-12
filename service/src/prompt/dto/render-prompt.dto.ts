/**
 * Render prompt DTO
 * @module prompt/dto
 */

import { IsInt, IsObject } from 'class-validator';

export class RenderPromptDto {
  @IsInt()
  templateVersionId: number;

  @IsObject()
  variables: Record<string, string>;
}
