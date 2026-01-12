/**
 * 资产控制器
 * @module asset
 */

import {
  Controller,
  Get,
  Delete,
  Post,
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
    @Query('confirmToken') confirmToken: string | undefined,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<null>> {
    await this.assetService.hardDelete(id, confirmToken, user);
    return {
      success: true,
      data: null,
      message: 'Asset hard deleted successfully',
    };
  }

  /**
   * 下载资产
   * GET /api/assets/:id/download
   */
  @Get(':id/download')
  async download(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<{ url: string }>> {
    const asset = await this.assetService.findOne(id, user);
    return {
      success: true,
      data: { url: asset.url },
      message: 'Asset download url ready',
    };
  }

  /**
   * 资产加入垃圾桶
   * POST /api/assets/:id/trash
   */
  @Post(':id/trash')
  async trash(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<Asset>> {
    const data = await this.assetService.trash(id, user);
    return {
      success: true,
      data,
      message: 'Asset trashed successfully',
    };
  }

  /**
   * 恢复资产
   * POST /api/assets/:id/restore
   */
  @Post(':id/restore')
  async restore(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<Asset>> {
    const data = await this.assetService.restore(id, user);
    return {
      success: true,
      data,
      message: 'Asset restored successfully',
    };
  }
}
