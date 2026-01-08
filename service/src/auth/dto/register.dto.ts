/**
 * 注册DTO
 * @module auth/dto
 */

import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { USERNAME_RULES, PASSWORD_RULES } from '@shared/constants';

export class RegisterDto {
  @IsString()
  @MinLength(USERNAME_RULES.MIN_LENGTH)
  @MaxLength(USERNAME_RULES.MAX_LENGTH)
  username: string;

  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsString()
  @MinLength(PASSWORD_RULES.MIN_LENGTH)
  @MaxLength(PASSWORD_RULES.MAX_LENGTH)
  password: string;
}
