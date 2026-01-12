/**
 * Workflow controller
 * @module workflow
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WorkflowTemplateService } from './workflow-template.service';
import { WorkflowRunService } from './workflow-run.service';
import { WorkflowValidationService } from './workflow-validation.service';
import {
  CreateWorkflowTemplateDto,
  CreateWorkflowTemplateVersionDto,
  StartWorkflowRunDto,
  ReviewDecisionDto,
  ReviewUploadDto,
  CreateWorkflowRunDto,
  ValidateWorkflowDto,
  HumanSelectDto,
  NodeTestDto,
} from './dto';
import { ApiResponse } from '@shared/types';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../common/decorators';
import { User, WorkflowTemplateVersion } from '../database/entities';
import { normalizeWorkflowVersion } from './workflow-utils';

@Controller()
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(
    private readonly templateService: WorkflowTemplateService,
    private readonly runService: WorkflowRunService,
    private readonly validationService: WorkflowValidationService,
  ) {}

  private toTemplateVersionResponse(version: WorkflowTemplateVersion) {
    const normalized = normalizeWorkflowVersion(version.nodes || [], version.edges || []);
    return {
      id: version.id,
      templateId: version.templateId,
      version: version.version,
      nodes: normalized.nodes,
      edges: normalized.edges,
      metadata: version.metadata,
      createdAt: version.createdAt,
    };
  }

  // Workflow Templates
  @Post('workflows/templates')
  async createTemplate(
    @Body() dto: CreateWorkflowTemplateDto,
  ): Promise<ApiResponse<any>> {
    const data = await this.templateService.createTemplate(dto);
    return { success: true, data, message: 'Workflow template created' };
  }

  @Get('workflows/templates')
  async listTemplates(): Promise<ApiResponse<any>> {
    const data = await this.templateService.listTemplates();
    return { success: true, data, message: 'Workflow templates retrieved' };
  }

  @Get('workflows/templates/:id')
  async getTemplate(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<any>> {
    const data = await this.templateService.getTemplate(id);
    return { success: true, data, message: 'Workflow template retrieved' };
  }

  @Post('workflows/templates/:id/versions')
  async createTemplateVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateWorkflowTemplateVersionDto,
  ): Promise<ApiResponse<any>> {
    const validation = this.validationService.validate(dto.nodes || [], dto.edges || []);
    if (!validation.ok) {
      throw new BadRequestException({ message: 'Workflow validation failed', errors: validation.errors });
    }
    const normalized = normalizeWorkflowVersion(dto.nodes || [], dto.edges || []);
    const data = await this.templateService.createVersion(id, {
      ...dto,
      nodes: normalized.nodes,
      edges: normalized.edges,
    });
    return {
      success: true,
      data: this.toTemplateVersionResponse(data),
      message: 'Workflow template version created',
    };
  }

  @Get('workflows/templates/:id/versions')
  async listTemplateVersions(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<any>> {
    const data = await this.templateService.listVersions(id);
    return {
      success: true,
      data: data.map((version) => this.toTemplateVersionResponse(version)),
      message: 'Workflow template versions retrieved',
    };
  }

  @Get('workflows/templates/:id/versions/:versionId')
  async getTemplateVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
  ): Promise<ApiResponse<any>> {
    const data = await this.templateService.getVersion(id, versionId);
    return {
      success: true,
      data: this.toTemplateVersionResponse(data),
      message: 'Workflow template version retrieved',
    };
  }

  @Get('workflows/versions/:id/validate')
  async validateTemplateVersion(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiResponse<any>> {
    const version = await this.templateService.getVersionById(id);
    const result = this.validationService.validate(version.nodes || [], version.edges || []);
    return { success: true, data: result, message: 'Workflow validation completed' };
  }

  @Post('workflows/validate')
  async validatePayload(
    @Body() dto: ValidateWorkflowDto,
  ): Promise<ApiResponse<any>> {
    const result = this.validationService.validate(dto.nodes || [], dto.edges || []);
    return { success: true, data: result, message: 'Workflow validation completed' };
  }

  // Workflow Runs
  @Post('tasks/:taskId/versions/:versionId/workflow/run')
  async startRun(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @Body() dto: StartWorkflowRunDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const data = await this.runService.startRun(taskId, versionId, dto, user);
    return { success: true, data, message: 'Workflow run started' };
  }

  @Post('workflow-runs')
  async createRun(
    @Body() dto: CreateWorkflowRunDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const data = await this.runService.createRun(dto, user);
    return { success: true, data, message: 'Workflow run created' };
  }

  @Get('workflow-runs/:runId')
  async getRunById(
    @Param('runId', ParseIntPipe) runId: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const data = await this.runService.getRunById(runId, user);
    return { success: true, data, message: 'Workflow run retrieved' };
  }

  @Get('tasks/:taskId/versions/:versionId/workflow/run')
  async getRun(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const data = await this.runService.getRun(taskId, versionId, user);
    return { success: true, data, message: 'Workflow run retrieved' };
  }

  @Post('workflow/runs/:runId/cancel')
  async cancelRun(
    @Param('runId', ParseIntPipe) runId: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const data = await this.runService.cancelRun(runId, user);
    return { success: true, data, message: 'Workflow run cancelled' };
  }

  @Post('workflow/runs/:runId/retry')
  async retryRun(
    @Param('runId', ParseIntPipe) runId: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const data = await this.runService.retryRun(runId, user);
    return { success: true, data, message: 'Workflow run retried' };
  }

  @Get('workflow/runs/:runId/nodes')
  async listNodeRuns(
    @Param('runId', ParseIntPipe) runId: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const data = await this.runService.listNodeRuns(runId, user);
    return { success: true, data, message: 'Workflow node runs retrieved' };
  }

  @Post('workflow-runs/:runId/actions/human-select')
  async humanSelect(
    @Param('runId', ParseIntPipe) runId: number,
    @Body() dto: HumanSelectDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const data = await this.runService.submitHumanSelect(runId, dto, user);
    return { success: true, data, message: 'Human selection submitted' };
  }

  // Human Review
  @Get('workflow/node-runs/:nodeRunId/review/assets')
  async getReviewAssets(
    @Param('nodeRunId', ParseIntPipe) nodeRunId: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const data = await this.runService.getReviewAssets(nodeRunId, user);
    return { success: true, data, message: 'Review assets retrieved' };
  }

  @Post('workflow/node-runs/:nodeRunId/review/decision')
  async submitReviewDecision(
    @Param('nodeRunId', ParseIntPipe) nodeRunId: number,
    @Body() dto: ReviewDecisionDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const data = await this.runService.submitReviewDecision(nodeRunId, dto, user);
    return { success: true, data, message: 'Review decision submitted' };
  }

  @Post('workflow/node-runs/:nodeRunId/review/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadReviewAsset(
    @Param('nodeRunId', ParseIntPipe) nodeRunId: number,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ReviewUploadDto,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const data = await this.runService.uploadReviewAsset(nodeRunId, file, dto, user);
    return { success: true, data, message: 'Review asset uploaded' };
  }

  @Post('workflow/node-runs/:nodeRunId/review/continue')
  async continueReview(
    @Param('nodeRunId', ParseIntPipe) nodeRunId: number,
    @CurrentUser() user: User,
  ): Promise<ApiResponse<any>> {
    const data = await this.runService.continueReview(nodeRunId, user);
    return { success: true, data, message: 'Workflow resumed' };
  }

  @Post('workflows/node-test')
  async nodeTest(
    @Body() dto: NodeTestDto,
  ): Promise<ApiResponse<any>> {
    const data = await this.runService.testNode(dto);
    return { success: true, data, message: 'Node test completed' };
  }
}
