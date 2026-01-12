/**
 * Node test DTO
 * @module workflow/dto
 */

import { IsObject, IsOptional, IsString } from 'class-validator';

export class NodeTestDto {
  @IsString()
  nodeType: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @IsOptional()
  @IsObject()
  inputs?: Record<string, any>;
}
