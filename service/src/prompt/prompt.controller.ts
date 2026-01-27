/**
 * Prompt controller
 * @module prompt
 */

import { Controller, Post, Get, Patch, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { PromptService } from './prompt.service';
import { ApiResponse, PromptTemplate, PromptTemplateVersion } from '@shared/types';
import { CreatePromptTemplateDto, CreatePromptTemplateVersionDto, UpdatePromptTemplateVersionDto, RenderPromptDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { Roles } from '../common/decorators';
import { UserRole } from '@shared/constants';

@Controller('prompts')
@UseGuards(JwtAuthGuard)
export class PromptController {
  constructor(private readonly promptService: PromptService) {}

  private toVersionResponse(version: any) {
    return {
      id: version.id,
      templateId: version.templateId,
      version: version.version,
      name: version.name ?? null,
      content: version.content,
      variables: version.variables || [],
      createdAt: version.createdAt,
    };
  }

  /**
   * 创建Prompt模板
   * POST /api/prompts
   */
  @Post()
  @Roles(UserRole.ADMIN)
  async createTemplate(
    @Body() dto: CreatePromptTemplateDto,
  ): Promise<ApiResponse<PromptTemplate>> {
    const data = await this.promptService.createTemplate(dto);
    return { success: true, data, message: 'Prompt template created' };
  }

  /**
   * 获取模板列表
   * GET /api/prompts
   */
  @Get()
  async listTemplates(): Promise<ApiResponse<PromptTemplate[]>> {
    const data = await this.promptService.listTemplates();
    return { success: true, data, message: 'Prompt templates retrieved' };
  }

  /**
   * 获取模板详情
   * GET /api/prompts/:id
   */
  @Get(':id')
  async getTemplate(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<PromptTemplate>> {
    const data = await this.promptService.getTemplate(id);
    return { success: true, data, message: 'Prompt template retrieved' };
  }

  /**
   * 删除Prompt模板
   * DELETE /api/prompts/:id
   */
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async deleteTemplate(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<{ id: number }>> {
    await this.promptService.deleteTemplate(id);
    return { success: true, data: { id }, message: 'Prompt template deleted' };
  }

  /**
   * 创建模板版本
   * POST /api/prompts/:id/versions
   */
  @Post(':id/versions')
  @Roles(UserRole.ADMIN)
  async createVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePromptTemplateVersionDto,
  ): Promise<ApiResponse<PromptTemplateVersion>> {
    const data = await this.promptService.createVersion(id, dto);
    return {
      success: true,
      data: this.toVersionResponse(data),
      message: 'Prompt template version created',
    };
  }

  /**
   * 获取模板版本列表
   * GET /api/prompts/:id/versions
   */
  @Get(':id/versions')
  async listVersions(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<PromptTemplateVersion[]>> {
    const data = await this.promptService.listVersions(id);
    return {
      success: true,
      data: data.map((version) => this.toVersionResponse(version)),
      message: 'Prompt template versions retrieved',
    };
  }

  /**
   * 获取模板版本详情
   * GET /api/prompts/:id/versions/:versionId
   */
  @Get(':id/versions/:versionId')
  async getVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
  ): Promise<ApiResponse<PromptTemplateVersion>> {
    const data = await this.promptService.getVersion(id, versionId);
    return {
      success: true,
      data: this.toVersionResponse(data),
      message: 'Prompt template version retrieved',
    };
  }

  /**
   * 更新模板版本
   * PATCH /api/prompts/:id/versions/:versionId
   */
  @Patch(':id/versions/:versionId')
  @Roles(UserRole.ADMIN)
  async updateVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @Body() dto: UpdatePromptTemplateVersionDto,
  ): Promise<ApiResponse<PromptTemplateVersion>> {
    const data = await this.promptService.updateVersion(id, versionId, dto);
    return {
      success: true,
      data: this.toVersionResponse(data),
      message: 'Prompt template version updated',
    };
  }

  /**
   * 删除模板版本
   * DELETE /api/prompts/:id/versions/:versionId
   */
  @Delete(':id/versions/:versionId')
  @Roles(UserRole.ADMIN)
  async deleteVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
  ): Promise<ApiResponse<{ id: number }>> {
    await this.promptService.deleteVersion(id, versionId);
    return { success: true, data: { id: versionId }, message: 'Prompt template version deleted' };
  }

  /**
   * 渲染Prompt
   * POST /api/prompts/render
   */
  @Post('render')
  async render(
    @Body() dto: RenderPromptDto,
  ): Promise<ApiResponse<{ rendered: string; missingVariables: string[] }>> {
    const data = await this.promptService.renderPrompt(dto);
    return { success: true, data, message: 'Prompt rendered' };
  }
}
