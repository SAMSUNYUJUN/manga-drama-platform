/**
 * 资产空间控制器
 * @module asset/asset-space
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AssetSpaceService } from './asset-space.service';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../common/decorators';
import { User, AssetSpace, Asset } from '../database/entities';
import { ApiResponse } from '@shared/types';
import { CreateAssetSpaceDto } from './dto';

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 100) * 1024 * 1024;

@Controller('asset-spaces')
@UseGuards(JwtAuthGuard)
export class AssetSpaceController {
  constructor(private readonly spaceService: AssetSpaceService) {}

  /**
   * 获取资产空间列表
   * GET /api/asset-spaces
   */
  @Get()
  async list(@CurrentUser() user: User): Promise<ApiResponse<AssetSpace[]>> {
    const data = await this.spaceService.listSpaces(user);
    return {
      success: true,
      data,
      message: 'Asset spaces retrieved successfully',
    };
  }

  /**
   * 获取资产空间详情
   * GET /api/asset-spaces/:id
   */
  @Get(':id')
  async get(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<AssetSpace>> {
    const data = await this.spaceService.getSpace(id, user);
    return {
      success: true,
      data,
      message: 'Asset space retrieved successfully',
    };
  }

  /**
   * 创建资产空间
   * POST /api/asset-spaces
   */
  @Post()
  async create(
    @Body() dto: CreateAssetSpaceDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<AssetSpace>> {
    const data = await this.spaceService.createSpace(dto, user);
    return {
      success: true,
      data,
      message: 'Asset space created successfully',
    };
  }

  /**
   * 删除资产空间（同时删除空间内资产）
   * DELETE /api/asset-spaces/:id
   */
  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<null>> {
    await this.spaceService.deleteSpace(id, user);
    return {
      success: true,
      data: null,
      message: 'Asset space deleted successfully',
    };
  }

  /**
   * 上传资产到空间
   * POST /api/asset-spaces/:id/upload
   */
  @Post(':id/upload')
  @UseInterceptors(FilesInterceptor('files', 20, { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: User,
  ): Promise<ApiResponse<Asset[]>> {
    const data = await this.spaceService.uploadAssets(id, files, user);
    return {
      success: true,
      data,
      message: 'Assets uploaded successfully',
    };
  }
}
