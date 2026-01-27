import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UploadedFiles, UseInterceptors, BadRequestException } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { StoryboardService } from './storyboard.service';
import { CurrentUser } from '../common/decorators';
import { User } from '../database/entities';
import { ApiResponse } from '@shared/types';

@Controller('storyboard')
export class StoryboardController {
  constructor(private readonly storyboardService: StoryboardService) {}

  @Get('shots')
  async listShots(@CurrentUser() user: User): Promise<ApiResponse<any>> {
    const data = await this.storyboardService.listShots(user);
    return { success: true, data, message: 'ok' };
  }

  @Post('shots')
  async createShot(
    @Body('title') title: string,
    @Body('spaceId', ParseIntPipe) spaceId: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const data = await this.storyboardService.createShot(title, spaceId, user);
    return { success: true, data, message: 'created' };
  }

  @Delete('shots/:id')
  async deleteShot(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const data = await this.storyboardService.deleteShot(id, user);
    return { success: true, data, message: 'deleted' };
  }

  @Delete('messages/:id')
  async deleteMessage(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const data = await this.storyboardService.deleteMessage(id, user);
    return { success: true, data, message: 'deleted' };
  }

  @Post('messages/:id/save')
  async saveMessageAssets(
    @Param('id', ParseIntPipe) id: number,
    @Body('spaceId', ParseIntPipe) spaceId: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const data = await this.storyboardService.saveMessageAssets(id, spaceId, user);
    return { success: true, data, message: 'saved' };
  }

  @Get('shots/:id/messages')
  async listMessages(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const data = await this.storyboardService.listMessages(id, user);
    return { success: true, data, message: 'ok' };
  }

  @Post('shots/:id/generate')
  @UseInterceptors(AnyFilesInterceptor())
  async generate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @UploadedFiles() files: any[],
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const model = dto?.model;
    const prompt = dto?.prompt;
    if (!model) throw new BadRequestException('model is required');
    if (!prompt) throw new BadRequestException('prompt is required');
    const imageUrls = this.parseImageUrls(dto?.imageUrls);
    const data = await this.storyboardService.generate({
      shotId: id,
      model,
      prompt,
      imageUrls,
      files,
      user,
    });
    return { success: true, data, message: 'generated' };
  }

  private parseImageUrls(raw: any): string[] | undefined {
    if (!raw) return undefined;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // ignore
      }
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return undefined;
  }
}
