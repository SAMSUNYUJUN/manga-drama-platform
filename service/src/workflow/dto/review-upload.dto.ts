/**
 * Review upload DTO
 * @module workflow/dto
 */

import { IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ReviewUploadDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  replaceAssetId?: number;

  @IsOptional()
  @IsString()
  assetType?: string;
}
