/**
 * Parse script DTO
 * @module script/dto
 */

import { IsOptional, IsInt, IsObject, IsString } from 'class-validator';

export class ParseScriptDto {
  @IsOptional()
  @IsInt()
  scriptAssetId?: number;

  @IsOptional()
  @IsString()
  scriptText?: string;

  @IsOptional()
  @IsObject()
  config?: {
    maxDuration?: number;
    style?: string;
  };
}
