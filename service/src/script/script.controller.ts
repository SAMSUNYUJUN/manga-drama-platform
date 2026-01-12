/**
 * Script controller
 * @module script
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ScriptService } from './script.service';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../common/decorators';
import { User, Asset } from '../database/entities';
import { ApiResponse } from '@shared/types';
import { ParseScriptDto } from './dto';

@Controller('tasks/:taskId/versions/:versionId/script')
@UseGuards(JwtAuthGuard)
export class ScriptController {
  constructor(private readonly scriptService: ScriptService) {}

  /**
   * 上传剧本
   * POST /api/tasks/:taskId/versions/:versionId/script/upload
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async upload(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<Asset>> {
    const data = await this.scriptService.uploadScript(taskId, versionId, file, user);
    return {
      success: true,
      data,
      message: 'Script uploaded successfully',
    };
  }

  /**
   * 解析剧本
   * POST /api/tasks/:taskId/versions/:versionId/script/parse
   */
  @Post('parse')
  async parse(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @Body() body: ParseScriptDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<Asset>> {
    const data = await this.scriptService.parseScript(taskId, versionId, body, user);
    return {
      success: true,
      data,
      message: 'Script parsed successfully',
    };
  }

  /**
   * 获取剧本相关资产
   * GET /api/tasks/:taskId/versions/:versionId/script
   */
  @Get()
  async getScripts(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<Asset[]>> {
    const data = await this.scriptService.getScripts(taskId, versionId, user);
    return {
      success: true,
      data,
      message: 'Script assets retrieved successfully',
    };
  }
}
