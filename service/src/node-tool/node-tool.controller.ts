/**
 * Node tool controller
 * @module node-tool
 */

import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Logger, Delete } from '@nestjs/common';
import { NodeToolService } from './node-tool.service';
import { ApiResponse } from '@shared/types';
import { CreateNodeToolDto, UpdateNodeToolDto, TestNodeToolDto } from './dto';
import { Roles } from '../common/decorators';
import { UserRole } from '@shared/constants';
import { NodeTool } from '../database/entities';

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
      model: tool.model,
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
  async testTool(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TestNodeToolDto,
  ): Promise<ApiResponse<any>> {
    this.logger.log(`[node-tools/${id}/test] hit`);
    try {
      const data = await this.nodeToolService.testToolById(id, dto.inputs);
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
  async testToolConfig(
    @Body() dto: TestNodeToolDto,
  ): Promise<ApiResponse<any>> {
    this.logger.log(
      `[node-tools/test] hit promptVersion=${dto.promptTemplateVersionId ?? 'none'}`,
    );
    try {
      const data = await this.nodeToolService.testToolConfig(dto);
      return { success: true, data, message: 'Node tool test completed' };
    } catch (error: any) {
      this.logger.error('[node-tools/test] failed', error?.stack || String(error));
      throw error;
    }
  }
}
