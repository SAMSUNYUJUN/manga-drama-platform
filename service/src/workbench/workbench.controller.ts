import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  ParseIntPipe,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators';
import { WorkbenchService } from './workbench.service';
import { ApiResponse } from '@shared/types/api.types';

@Controller('workbench')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkbenchController {
  private readonly logger = new Logger(WorkbenchController.name);

  constructor(private readonly workbenchService: WorkbenchService) {}

  /**
   * 执行节点工具
   */
  @Post('run-tool')
  @UseInterceptors(AnyFilesInterceptor())
  async runTool(
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: any,
  ): Promise<ApiResponse<any>> {
    const { toolName, inputs, modelConfig, spaceId } = body;
    
    if (!toolName) {
      throw new BadRequestException('toolName is required');
    }

    // Parse inputs if it's a string
    let parsedInputs = inputs;
    if (typeof inputs === 'string') {
      try {
        parsedInputs = JSON.parse(inputs);
      } catch {
        parsedInputs = {};
      }
    }
    let parsedModelConfig = modelConfig;
    if (typeof modelConfig === 'string') {
      try {
        parsedModelConfig = JSON.parse(modelConfig);
      } catch (error) {
        this.logger.warn(`[workbench/run-tool] Failed to parse modelConfig, using raw value. err=${error}`);
      }
    }

    this.logger.log(`[workbench/run-tool] Tool: ${toolName}, User: ${user.id}`);

    const result = await this.workbenchService.runTool(
      toolName, 
      parsedInputs || {}, 
      files, 
      parsedModelConfig, 
      spaceId ? Number(spaceId) : undefined,
      user,
    );
    return { success: true, data: result, message: 'Tool executed successfully' };
  }

  /**
   * 保存JSON到资产空间
   */
  @Post('save-json/:spaceId')
  async saveJson(
    @Param('spaceId', ParseIntPipe) spaceId: number,
    @Body() body: { fileName: string; content: any },
    @CurrentUser() user: any,
  ): Promise<ApiResponse<{ path: string }>> {
    const { fileName, content } = body;

    if (!fileName) {
      throw new BadRequestException('fileName is required');
    }

    if (!content) {
      throw new BadRequestException('content is required');
    }

    this.logger.log(`[workbench/save-json] Space: ${spaceId}, File: ${fileName}`);

    const path = await this.workbenchService.saveJsonToSpace(spaceId, fileName, content, user.id);
    return { success: true, data: { path }, message: 'JSON saved successfully' };
  }

  /**
   * 保存图片到资产空间
   */
  @Post('save-image/:spaceId')
  async saveImage(
    @Param('spaceId', ParseIntPipe) spaceId: number,
    @Body() body: { fileName: string; imageUrl: string },
    @CurrentUser() user: any,
  ): Promise<ApiResponse<{ path: string }>> {
    const { fileName, imageUrl } = body;

    if (!fileName) {
      throw new BadRequestException('fileName is required');
    }

    if (!imageUrl) {
      throw new BadRequestException('imageUrl is required');
    }

    this.logger.log(`[workbench/save-image] Space: ${spaceId}, File: ${fileName}`);

    const path = await this.workbenchService.saveImageToSpace(spaceId, fileName, imageUrl, user.id);
    return { success: true, data: { path }, message: 'Image saved successfully' };
  }

  /**
   * 保存视频到资产空间
   */
  @Post('save-video/:spaceId')
  async saveVideo(
    @Param('spaceId', ParseIntPipe) spaceId: number,
    @Body() body: { fileName: string; videoUrl: string },
    @CurrentUser() user: any,
  ): Promise<ApiResponse<{ path: string }>> {
    const { fileName, videoUrl } = body;

    if (!fileName) {
      throw new BadRequestException('fileName is required');
    }

    if (!videoUrl) {
      throw new BadRequestException('videoUrl is required');
    }

    this.logger.log(`[workbench/save-video] Space: ${spaceId}, File: ${fileName}`);

    const path = await this.workbenchService.saveVideoToSpace(spaceId, fileName, videoUrl, user.id);
    return { success: true, data: { path }, message: 'Video saved successfully' };
  }

  /**
   * 验证剧本拆解JSON格式
   */
  @Post('validate/script-analysis')
  async validateScriptAnalysis(
    @Body() body: { content: any },
  ): Promise<ApiResponse<{ valid: boolean; error?: string }>> {
    const { content } = body;

    let json = content;
    if (typeof content === 'string') {
      try {
        json = JSON.parse(content);
      } catch {
        return { 
          success: true, 
          data: { valid: false, error: 'Invalid JSON string' },
          message: 'Validation completed',
        };
      }
    }

    const result = this.workbenchService.validateScriptAnalysisFormat(json);
    return { success: true, data: result, message: 'Validation completed' };
  }

  /**
   * 验证镜头语言JSON格式
   */
  @Post('validate/shot-language')
  async validateShotLanguage(
    @Body() body: { content: any },
  ): Promise<ApiResponse<{ valid: boolean; error?: string }>> {
    const { content } = body;

    let json = content;
    if (typeof content === 'string') {
      try {
        json = JSON.parse(content);
      } catch {
        return { 
          success: true, 
          data: { valid: false, error: 'Invalid JSON string' },
          message: 'Validation completed',
        };
      }
    }

    const result = this.workbenchService.validateShotLanguageFormat(json);
    return { success: true, data: result, message: 'Validation completed' };
  }

  /**
   * 读取资产空间中的文件
   */
  @Get('space/:spaceId/file')
  async readFile(
    @Param('spaceId', ParseIntPipe) spaceId: number,
    @Body() body: { filePath: string },
    @CurrentUser() user: any,
  ): Promise<ApiResponse<{ content: string }>> {
    const { filePath } = body;

    if (!filePath) {
      throw new BadRequestException('filePath is required');
    }

    const content = await this.workbenchService.readFileFromSpace(spaceId, filePath);
    return { success: true, data: { content }, message: 'File read successfully' };
  }

  /**
   * 列出资产空间中的文件
   */
  @Get('space/:spaceId/files')
  async listFiles(
    @Param('spaceId', ParseIntPipe) spaceId: number,
    @Body() body: { folder?: string },
    @CurrentUser() user: any,
  ): Promise<ApiResponse<any[]>> {
    const files = await this.workbenchService.listSpaceFiles(spaceId, body?.folder);
    return { success: true, data: files, message: 'Files listed successfully' };
  }

  /**
   * 生成带时间戳的文件名
   */
  @Get('generate-filename')
  async generateFileName(
    @Body() body: { prefix: string; extension: string },
  ): Promise<ApiResponse<{ fileName: string }>> {
    const { prefix, extension } = body;
    const fileName = this.workbenchService.generateFileName(prefix || 'file', extension || 'json');
    return { success: true, data: { fileName }, message: 'Filename generated' };
  }

  /**
   * 查询异步生成进度（Sora 视频）
   */
  @Get('progress/:jobId')
  async getProgress(
    @Param('jobId') jobId: string,
  ): Promise<ApiResponse<any>> {
    const state = this.workbenchService.getProgress(jobId);
    return { success: true, data: state || null, message: 'Progress fetched' };
  }

  /**
   * 解析文档文件 (支持 .doc, .docx, .txt)
   */
  @Post('parse-document')
  @UseInterceptors(FileInterceptor('file'))
  async parseDocument(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ): Promise<ApiResponse<{ text: string; fileName: string }>> {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    this.logger.log(`[workbench/parse-document] File: ${file.originalname}, User: ${user.id}`);

    const text = await this.workbenchService.parseDocument(file);
    return { 
      success: true, 
      data: { text, fileName: file.originalname }, 
      message: 'Document parsed successfully' 
    };
  }
}
