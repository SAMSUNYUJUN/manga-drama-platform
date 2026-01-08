/**
 * 资产控制器
 * @module asset
 */

import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { AssetService } from './asset.service';
import { QueryAssetDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../common/decorators';
import { User, Asset } from '../database/entities';
import { ApiResponse, PaginatedResponse } from '@shared/types';

@Controller('assets')
@UseGuards(JwtAuthGuard)
export class AssetController {
  constructor(private readonly assetService: AssetService) {}

  /**
   * 获取资产列表
   * GET /api/assets
   */
  @Get()
  async findAll(
    @Query() queryDto: QueryAssetDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<PaginatedResponse<Asset>>> {
    const data = await this.assetService.findAll(queryDto, user);
    return {
      success: true,
      data,
      message: 'Assets retrieved successfully',
    };
  }

  /**
   * 获取资产详情
   * GET /api/assets/:id
   */
  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<Asset>> {
    const data = await this.assetService.findOne(id, user);
    return {
      success: true,
      data,
      message: 'Asset retrieved successfully',
    };
  }

  /**
   * 删除资产
   * DELETE /api/assets/:id
   */
  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<null>> {
    await this.assetService.remove(id, user);
    return {
      success: true,
      data: null,
      message: 'Asset deleted successfully',
    };
  }
}
