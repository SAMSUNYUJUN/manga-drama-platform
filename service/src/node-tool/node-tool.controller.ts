/**
 * Node tool controller
 * @module node-tool
 */

import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Logger, Delete, UseInterceptors, UploadedFiles, BadRequestException } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { NodeToolService } from './node-tool.service';
import { ApiResponse } from '@shared/types';
import { CreateNodeToolDto, UpdateNodeToolDto } from './dto';
import { Roles } from '../common/decorators';
import { UserRole } from '@shared/constants';
import { NodeTool, User } from '../database/entities';
import { CurrentUser } from '../common/decorators';

@Controller()
export class NodeToolController {
  private readonly logger = new Logger(NodeToolController.name);

  constructor(private readonly nodeToolService: NodeToolService) {}

  private toToolResponse(tool: NodeTool) {
    return {
      id: tool.id,
      name: tool.name,
      description: tool.description,
      promptTemplateVersionId: tool.promptTemplateVersionId,
      systemPromptVersionId: tool.systemPromptVersionId,
      model: tool.model,
      imageAspectRatio: tool.imageAspectRatio,
      maxTokens: tool.maxTokens,
      temperature: tool.temperature,
      modelConfig: tool.modelConfig,
      enabled: tool.enabled,
      inputs: tool.inputs || [],
      outputs: tool.outputs || [],
      createdAt: tool.createdAt,
      updatedAt: tool.updatedAt,
    };
  }

  @Get('node-tools')
  async listTools(
    @Query('enabled') enabled?: string,
  ): Promise<ApiResponse<any>> {
    const flag = enabled === undefined ? undefined : enabled === 'true';
    const data = (await this.nodeToolService.listTools(flag)).map((tool) => this.toToolResponse(tool));
    return { success: true, data, message: 'Node tools retrieved' };
  }

  @Get('node-tools/:id')
  async getTool(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<any>> {
    const data = this.toToolResponse(await this.nodeToolService.getTool(id));
    return { success: true, data, message: 'Node tool retrieved' };
  }

  @Post('node-tools')
  @Roles(UserRole.ADMIN)
  async createTool(
    @Body() dto: CreateNodeToolDto,
  ): Promise<ApiResponse<any>> {
    const data = this.toToolResponse(await this.nodeToolService.createTool(dto));
    return { success: true, data, message: 'Node tool created' };
  }

  @Patch('node-tools/:id')
  @Roles(UserRole.ADMIN)
  async updateTool(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNodeToolDto,
  ): Promise<ApiResponse<any>> {
    const data = this.toToolResponse(await this.nodeToolService.updateTool(id, dto));
    return { success: true, data, message: 'Node tool updated' };
  }

  @Delete('node-tools/:id')
  @Roles(UserRole.ADMIN)
  async deleteTool(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<{ id: number }>> {
    this.logger.log(`[node-tools/${id}] delete`);
    try {
      await this.nodeToolService.deleteTool(id);
      return { success: true, data: { id }, message: 'Node tool deleted' };
    } catch (error: any) {
      this.logger.error(`[node-tools/${id}] delete failed`, error?.stack || String(error));
      throw error;
    }
  }

  @Post('node-tools/:id/test')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(AnyFilesInterceptor())
  async testTool(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @UploadedFiles() files: any[],
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    this.logger.log(`[node-tools/${id}/test] hit`);
    try {
      const inputs = this.parseInputs(dto?.inputs);
      const spaceId = this.toOptionalNumber(dto?.spaceId);
      const data = files?.length
        ? await this.nodeToolService.testToolByIdWithFiles(id, inputs, files, user, spaceId)
        : await this.nodeToolService.testToolById(id, inputs, user, spaceId);
      return { success: true, data, message: 'Node tool test completed' };
    } catch (error: any) {
      this.logger.error(
        `[node-tools/${id}/test] failed`,
        error?.stack || String(error),
      );
      throw error;
    }
  }

  @Post('node-tools/test')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(AnyFilesInterceptor())
  async testToolConfig(
    @Body() dto: any,
    @UploadedFiles() files: any[],
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const promptVersionId = this.toPromptVersionId(dto?.promptTemplateVersionId);
    const systemPromptVersionId = this.toPromptVersionId(dto?.systemPromptVersionId);
    const maxTokens = dto?.maxTokens ? Number(dto.maxTokens) : undefined;
    const temperature = dto?.temperature !== undefined ? Number(dto.temperature) : undefined;
    const outputs = this.parseOutputs(dto?.outputs);
    const modelConfig = this.parseJson(dto?.modelConfig);
    const spaceId = this.toOptionalNumber(dto?.spaceId);
    this.logger.log(
      `[node-tools/test] hit promptVersion=${promptVersionId ?? 'none'} systemPromptVersion=${systemPromptVersionId ?? 'none'} maxTokens=${maxTokens ?? 'default'} temperature=${temperature ?? 'default'} imageAspectRatio=${dto?.imageAspectRatio ?? '16:9'} outputs=${outputs?.length ?? 0} modelConfig=${modelConfig ? JSON.stringify(modelConfig) : 'none'}`,
    );
    try {
      const inputs = this.parseInputs(dto?.inputs);
      const imageAspectRatio = dto?.imageAspectRatio || undefined;
      const data = files?.length
        ? await this.nodeToolService.testToolConfigWithFiles(
            { 
              promptTemplateVersionId: promptVersionId, 
              systemPromptVersionId, 
              model: dto?.model, 
              imageAspectRatio, 
              maxTokens,
              temperature,
              modelConfig,
              inputs,
              outputs,
              spaceId,
            },
            files,
            user,
          )
        : await this.nodeToolService.testToolConfig({
            promptTemplateVersionId: promptVersionId,
            systemPromptVersionId,
            model: dto?.model,
            imageAspectRatio,
            maxTokens,
            temperature,
            modelConfig,
            inputs,
            outputs,
            spaceId,
          }, user);
      return { success: true, data, message: 'Node tool test completed' };
    } catch (error: any) {
      this.logger.error('[node-tools/test] failed', error?.stack || String(error));
      throw error;
    }
  }

  private parseInputs(raw: any): Record<string, any> {
    if (!raw) return {};
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        throw new BadRequestException('Invalid inputs JSON');
      }
    }
    if (typeof raw === 'object') {
      return raw;
    }
    return {};
  }

  private parseJson(raw: any): Record<string, any> | undefined {
    if (!raw) return undefined;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return undefined;
      }
    }
    if (typeof raw === 'object') {
      return raw;
    }
    return undefined;
  }

  private parseOutputs(raw: any): { key: string; name?: string; type: string }[] | undefined {
    if (!raw) return undefined;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    }
    if (Array.isArray(raw)) {
      return raw;
    }
    return undefined;
  }

  private toPromptVersionId(raw: any): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }

  private toOptionalNumber(raw: any): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }
}
