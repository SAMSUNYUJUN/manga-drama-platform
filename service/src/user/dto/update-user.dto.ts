/**
 * 更新用户DTO
 * @module user/dto
 */

import { IsEmail, IsString, IsEnum, IsOptional, MinLength, MaxLength } from 'class-validator';
import { UserRole } from '@shared/constants';
import { PASSWORD_RULES } from '@shared/constants';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(PASSWORD_RULES.MIN_LENGTH)
  @MaxLength(PASSWORD_RULES.MAX_LENGTH)
  password?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
