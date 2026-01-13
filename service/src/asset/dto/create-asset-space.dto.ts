/**
 * Create asset space DTO
 * @module asset/dto
 */

import { IsOptional, IsString } from 'class-validator';

export class CreateAssetSpaceDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
