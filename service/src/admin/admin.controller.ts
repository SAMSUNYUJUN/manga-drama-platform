/**
 * Admin controller
 * @module admin
 */

import { Controller, Get, Post, Patch, Delete, Param, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ApiResponse, ProviderConfig, GlobalConfig } from '@shared/types';
import { CreateProviderDto, UpdateProviderDto, UpdateGlobalConfigDto } from './dto';
import { Roles } from '../common/decorators';
import { UserRole } from '@shared/constants';
import { RolesGuard } from '../auth/guards';

@Controller('admin')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * 获取Provider列表
   * GET /api/admin/providers
   */
  @Get('providers')
  async listProviders(): Promise<ApiResponse<ProviderConfig[]>> {
    const data = await this.adminService.listProviders();
    return { success: true, data, message: 'Providers retrieved' };
  }

  /**
   * 创建Provider
   * POST /api/admin/providers
   */
  @Post('providers')
  async createProvider(
    @Body() dto: CreateProviderDto,
  ): Promise<ApiResponse<ProviderConfig>> {
    const data = await this.adminService.createProvider(dto);
    return { success: true, data, message: 'Provider created' };
  }

  /**
   * 更新Provider
   * PATCH /api/admin/providers/:id
   */
  @Patch('providers/:id')
  async updateProvider(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProviderDto,
  ): Promise<ApiResponse<ProviderConfig>> {
    const data = await this.adminService.updateProvider(id, dto);
    return { success: true, data, message: 'Provider updated' };
  }

  /**
   * 启用Provider
   * POST /api/admin/providers/:id/enable
   */
  @Post('providers/:id/enable')
  async enableProvider(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<ProviderConfig>> {
    const data = await this.adminService.enableProvider(id);
    return { success: true, data, message: 'Provider enabled' };
  }

  /**
   * 禁用Provider
   * POST /api/admin/providers/:id/disable
   */
  @Post('providers/:id/disable')
  async disableProvider(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<ProviderConfig>> {
    const data = await this.adminService.disableProvider(id);
    return { success: true, data, message: 'Provider disabled' };
  }

  /**
   * 删除Provider
   * DELETE /api/admin/providers/:id
   */
  @Delete('providers/:id')
  async deleteProvider(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<null>> {
    await this.adminService.deleteProvider(id);
    return { success: true, data: null, message: 'Provider deleted' };
  }

  /**
   * 获取全局配置
   * GET /api/admin/config
   */
  @Get('config')
  async getConfig(): Promise<ApiResponse<GlobalConfig>> {
    const data = await this.adminService.getGlobalConfig();
    return { success: true, data, message: 'Global config retrieved' };
  }

  /**
   * 更新全局配置
   * PATCH /api/admin/config
   */
  @Patch('config')
  async updateConfig(
    @Body() dto: UpdateGlobalConfigDto,
  ): Promise<ApiResponse<GlobalConfig>> {
    const data = await this.adminService.updateGlobalConfig(dto);
    return { success: true, data, message: 'Global config updated' };
  }
}
