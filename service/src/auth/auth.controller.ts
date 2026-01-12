/**
 * 认证控制器
 * @module auth
 */

import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto';
import { JwtAuthGuard } from './guards';
import { Public, CurrentUser } from '../common/decorators';
import { User } from '../database/entities';
import { AuthResponse, ApiResponse } from '@shared/types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 用户注册
   * POST /api/auth/register
   */
  @Public()
  @Post('register')
  async register(@Body() registerDto: RegisterDto): Promise<ApiResponse<AuthResponse>> {
    const data = await this.authService.register(registerDto);
    return {
      success: true,
      data,
      message: 'Registration successful',
    };
  }

  /**
   * 用户登录
   * POST /api/auth/login
   */
  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto): Promise<ApiResponse<AuthResponse>> {
    const data = await this.authService.login(loginDto);
    return {
      success: true,
      data,
      message: 'Login successful',
    };
  }

  /**
   * 获取当前用户信息
   * GET /api/auth/profile
   */
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@CurrentUser() user: User): Promise<ApiResponse<User>> {
    const data = await this.authService.getProfile(user.id);
    return {
      success: true,
      data,
      message: 'Profile retrieved successfully',
    };
  }

  /**
   * 获取当前用户信息
   * GET /api/auth/me
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@CurrentUser() user: User): Promise<ApiResponse<User>> {
    const data = await this.authService.getProfile(user.id);
    return {
      success: true,
      data,
      message: 'Profile retrieved successfully',
    };
  }
}
