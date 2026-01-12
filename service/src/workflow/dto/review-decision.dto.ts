/**
 * Review decision DTO
 * @module workflow/dto
 */

import { IsArray, IsOptional, IsString } from 'class-validator';

export class ReviewDecisionDto {
  @IsArray()
  approvedAssetIds: number[];

  @IsArray()
  rejectedAssetIds: number[];

  @IsOptional()
  @IsString()
  reason?: string;
}
