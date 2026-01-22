import { Injectable, BadRequestException, NotFoundException, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { NodeTool } from '../database/entities/node-tool.entity';
import { AssetSpace } from '../database/entities/asset-space.entity';
import { Asset } from '../database/entities/asset.entity';
import { NodeToolService } from '../node-tool/node-tool.service';
import type { IStorageService } from '../storage/storage.interface';
import { AssetStatus, AssetType } from '@shared/constants';
import { ProgressTrackerService } from '../ai-service/progress-tracker.service';
import * as mammoth from 'mammoth';
import * as WordExtractor from 'word-extractor';
import * as path from 'path';

@Injectable()
export class WorkbenchService {
  private readonly logger = new Logger(WorkbenchService.name);

  constructor(
    @InjectRepository(NodeTool)
    private readonly nodeToolRepository: Repository<NodeTool>,
    @InjectRepository(AssetSpace)
    private readonly spaceRepository: Repository<AssetSpace>,
    @InjectRepository(Asset)
    private readonly assetRepository: Repository<Asset>,
    private readonly nodeToolService: NodeToolService,
    @Inject('IStorageService')
    private readonly storageService: IStorageService,
    private readonly progressTracker: ProgressTrackerService,
  ) {}

  /**
   * 根据工具名称查找工具
   */
  async findToolByName(name: string): Promise<NodeTool | null> {
    return this.nodeToolRepository.findOne({
      where: { name, enabled: true },
    });
  }

  /**
   * 执行节点工具
   */
  async runTool(
    toolName: string,
    inputs: Record<string, any>,
    files?: Express.Multer.File[],
    modelConfig?: Record<string, any>,
    spaceId?: number,
    user?: any,
  ): Promise<any> {
    this.logger.log(`[Workbench] Running tool: ${toolName}`);
    this.logger.log(`[Workbench] Inputs: ${JSON.stringify(Object.keys(inputs))}`);

    const tool = await this.findToolByName(toolName);
    if (!tool) {
      throw new NotFoundException(`Tool "${toolName}" not found or not enabled`);
    }

    try {
      const payload = {
        promptTemplateVersionId: tool.promptTemplateVersionId ?? undefined,
        systemPromptVersionId: tool.systemPromptVersionId ?? undefined,
        model: tool.model ?? undefined,
        imageAspectRatio: tool.imageAspectRatio ?? undefined,
        maxTokens: tool.maxTokens ?? undefined,
        temperature: tool.temperature ?? undefined,
        modelConfig: modelConfig ?? (tool.modelConfig as any) ?? undefined,
        inputs,
        outputs: tool.outputs || [],
        spaceId,
      };

      const result = files && files.length > 0
        ? await this.nodeToolService.testToolConfigWithFiles(payload, files, user)
        : await this.nodeToolService.testToolConfig(payload, user);
      
      this.logger.log(`[Workbench] Tool ${toolName} completed successfully`);
      return result;
    } catch (error: any) {
      this.logger.error(`[Workbench] Tool ${toolName} failed: ${error.message}`);
      throw new BadRequestException(`Tool execution failed: ${error.message}`);
    }
  }

  /**
   * 保存JSON到资产空间
   */
  async saveJsonToSpace(
    spaceId: number,
    fileName: string,
    content: any,
    userId: number,
  ): Promise<string> {
    this.logger.log(`[Workbench] Saving JSON to space ${spaceId}: ${fileName}`);

    const space = await this.spaceRepository.findOne({ where: { id: spaceId } });
    if (!space) {
      throw new NotFoundException(`Asset space ${spaceId} not found`);
    }

    const jsonString = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    const buffer = Buffer.from(jsonString, 'utf-8');
    
    const prefix = this.extractStepPrefix(fileName);
    const existingAssets = prefix ? await this.findExistingStepAssets(spaceId, prefix) : [];

    const folder = `asset-spaces/${spaceId}/workbench`;
    const storedUrl = await this.storageService.uploadBuffer(buffer, fileName, {
      folder,
      contentType: 'application/json',
      isPublic: false,
    });

    await this.assetRepository.save(
      this.assetRepository.create({
        taskId: null,
        versionId: null,
        spaceId: space.id,
        type: AssetType.TASK_EXECUTION,
        status: AssetStatus.ACTIVE,
        url: storedUrl,
        filename: fileName,
        filesize: buffer.length,
        mimeType: 'application/json',
        metadataJson: JSON.stringify({ source: 'workbench' }),
      }),
    );

    if (existingAssets.length) {
      await this.removeAssets(existingAssets);
      this.logger.log(`[Workbench] Removed ${existingAssets.length} existing assets for prefix "${prefix}" in space ${spaceId}`);
    }
    
    this.logger.log(`[Workbench] JSON saved to: ${storedUrl}`);
    return storedUrl;
  }

  /**
   * 保存图片到资产空间
   */
  async saveImageToSpace(
    spaceId: number,
    fileName: string,
    imageUrl: string,
    userId: number,
  ): Promise<string> {
    const sanitizedFileName = fileName.replace(/[\\/]/g, '-');
    this.logger.log(`[Workbench] Saving image to space ${spaceId}: ${sanitizedFileName}`);

    const space = await this.spaceRepository.findOne({ where: { id: spaceId } });
    if (!space) {
      throw new NotFoundException(`Asset space ${spaceId} not found`);
    }

    const prefix = this.extractStepPrefix(sanitizedFileName);
    const existingAssets = prefix ? await this.findExistingStepAssets(spaceId, prefix) : [];
    const folder = `asset-spaces/${spaceId}/workbench/costume-photos`;
    const mimeType = this.getImageMimeType(sanitizedFileName, imageUrl);

    // Use uploadRemoteFile for HTTP URLs, uploadBuffer for data URIs
    let storedUrl: string;
    let fileSize: number | undefined;
    if (imageUrl.startsWith('data:')) {
      // Handle base64 data URI
      const parsed = this.parseDataUri(imageUrl);
      if (!parsed) {
        throw new BadRequestException('Invalid image data URI');
      }
      const imageBuffer = parsed.buffer;
      fileSize = imageBuffer.length;
      storedUrl = await this.storageService.uploadBuffer(imageBuffer, sanitizedFileName, {
        folder,
        contentType: parsed.mimeType || mimeType,
        isPublic: false,
      });
    } else {
      // Handle HTTP URL - use uploadRemoteFile
      storedUrl = await this.storageService.uploadRemoteFile(imageUrl, sanitizedFileName, {
        folder,
        contentType: mimeType,
        isPublic: false,
      });
    }

    await this.assetRepository.save(
      this.assetRepository.create({
        taskId: null,
        versionId: null,
        spaceId: space.id,
        type: AssetType.TASK_EXECUTION,
        status: AssetStatus.ACTIVE,
        url: storedUrl,
        filename: fileName,
        filesize: fileSize,
        mimeType,
        metadataJson: JSON.stringify({ source: 'workbench', kind: 'costume-photo' }),
      }),
    );

    if (existingAssets.length) {
      await this.removeAssets(existingAssets);
      this.logger.log(`[Workbench] Removed ${existingAssets.length} existing costume photo assets for prefix "${prefix}" in space ${spaceId}`);
    }
    
    this.logger.log(`[Workbench] Image saved to: ${storedUrl}`);
    return storedUrl;
  }

  /**
   * 保存视频到资产空间
   */
  async saveVideoToSpace(
    spaceId: number,
    fileName: string,
    videoUrl: string,
    userId: number,
  ): Promise<string> {
    const sanitizedFileName = fileName.replace(/[\\/]/g, '-');
    this.logger.log(`[Workbench] Saving video to space ${spaceId}: ${sanitizedFileName}`);

    const space = await this.spaceRepository.findOne({ where: { id: spaceId } });
    if (!space) {
      throw new NotFoundException(`Asset space ${spaceId} not found`);
    }

    const prefix = this.extractStepPrefix(sanitizedFileName);
    const existingAssets = prefix ? await this.findExistingStepAssets(spaceId, prefix) : [];
    const folder = `asset-spaces/${spaceId}/workbench/videos`;

    let storedUrl: string;
    let fileSize: number | undefined;
    let mimeType = 'video/mp4';

    if (videoUrl.startsWith('data:')) {
      const parsed = this.parseDataUri(videoUrl);
      if (!parsed) {
        throw new BadRequestException('Invalid video data URI');
      }
      mimeType = parsed.mimeType || mimeType;
      const buffer = parsed.buffer;
      fileSize = buffer.length;
      storedUrl = await this.storageService.uploadBuffer(buffer, sanitizedFileName, {
        folder,
        contentType: mimeType,
        isPublic: false,
      });
    } else {
      storedUrl = await this.storageService.uploadRemoteFile(videoUrl, sanitizedFileName, {
        folder,
        contentType: mimeType,
        isPublic: false,
      });
    }

    await this.assetRepository.save(
      this.assetRepository.create({
        taskId: null,
        versionId: null,
        spaceId: space.id,
        type: AssetType.TASK_EXECUTION,
        status: AssetStatus.ACTIVE,
        url: storedUrl,
        filename: sanitizedFileName,
        filesize: fileSize,
        mimeType,
        metadataJson: JSON.stringify({ source: 'workbench', kind: 'keyframe-video' }),
      }),
    );

    if (existingAssets.length) {
      await this.removeAssets(existingAssets);
      this.logger.log(`[Workbench] Removed ${existingAssets.length} existing keyframe video assets for prefix "${prefix}" in space ${spaceId}`);
    }
    
    this.logger.log(`[Workbench] Video saved to: ${storedUrl}`);
    return storedUrl;
  }

  /**
   * 从资产空间读取文件内容
   */
  async readFileFromSpace(spaceId: number, filePath: string): Promise<string> {
    this.logger.log(`[Workbench] Reading file from space ${spaceId}: ${filePath}`);

    const space = await this.spaceRepository.findOne({ where: { id: spaceId } });
    if (!space) {
      throw new NotFoundException(`Asset space ${spaceId} not found`);
    }

    const content = await this.storageService.getTextContent(filePath);
    if (content === null) {
      throw new NotFoundException(`File not found: ${filePath}`);
    }

    return content;
  }

  /**
   * 列出资产空间中的文件
   * Note: This method is not used in current implementation. File listing
   * should be done through the AssetSpace service if needed.
   */
  async listSpaceFiles(spaceId: number, folder?: string): Promise<any[]> {
    const space = await this.spaceRepository.findOne({ where: { id: spaceId } });
    if (!space) {
      throw new NotFoundException(`Asset space ${spaceId} not found`);
    }

    // IStorageService doesn't have listFiles method
    // Return empty array for now - file listing should be done through asset service
    this.logger.warn(`[Workbench] listSpaceFiles not implemented for IStorageService`);
    return [];
  }

  /**
   * 验证JSON格式是否符合剧本拆解格式
   * 支持多种可能的字段名（AI 生成可能存在不一致）
   */
  validateScriptAnalysisFormat(json: any): { valid: boolean; error?: string } {
    if (!json || typeof json !== 'object') {
      return { valid: false, error: 'JSON must be an object' };
    }

    if (!Array.isArray(json['人物'])) {
      return { valid: false, error: 'Missing or invalid "人物" array' };
    }

    if (!Array.isArray(json['场景'])) {
      return { valid: false, error: 'Missing or invalid "场景" array' };
    }

    if (!Array.isArray(json['道具'])) {
      return { valid: false, error: 'Missing or invalid "道具" array' };
    }

    // 验证人物格式 - 支持多种字段名
    for (const char of json['人物']) {
      const name = char['人物姓名'] || char['姓名'] || char['名字'] || char['name'];
      const gender = char['性别'] || char['gender'];
      const appearance = char['外貌特征描写'] || char['外貌特征'] || char['外貌描写'] || char['外貌'] || char['appearance'];
      
      if (typeof name !== 'string') {
        return { valid: false, error: '人物缺少姓名字段（人物姓名/姓名/名字）' };
      }
      if (typeof gender !== 'string') {
        return { valid: false, error: `人物"${name}"缺少性别字段` };
      }
      if (typeof appearance !== 'string') {
        return { valid: false, error: `人物"${name}"缺少外貌特征描写字段` };
      }
    }

    // 验证场景格式 - 支持多种字段名
    for (const scene of json['场景']) {
      const location = scene['地点名称'] || scene['地点'] || scene['名称'] || scene['location'];
      const atmosphere = scene['环境氛围描写'] || scene['环境氛围'] || scene['氛围描写'] || scene['环境描写'] || scene['atmosphere'];
      
      if (typeof location !== 'string') {
        return { valid: false, error: '场景缺少地点字段（地点名称/地点/名称）' };
      }
      if (typeof atmosphere !== 'string') {
        return { valid: false, error: `场景"${location}"缺少环境氛围描写字段` };
      }
    }

    // 验证道具格式 - 支持多种字段名
    for (const prop of json['道具']) {
      const name = prop['道具名称'] || prop['名称'] || prop['道具'] || prop['name'];
      const description = prop['道具描写'] || prop['描写'] || prop['Description'] || prop['description'] || prop['重要物品描写'];
      
      if (typeof name !== 'string') {
        return { valid: false, error: '道具缺少名称字段（道具名称/名称/道具）' };
      }
      if (typeof description !== 'string') {
        return { valid: false, error: `道具"${name}"缺少描写字段（道具描写/描写/Description）` };
      }
    }

    return { valid: true };
  }

  /**
   * 验证JSON格式是否符合镜头语言格式
   */
  validateShotLanguageFormat(json: any): { valid: boolean; error?: string } {
    if (!json || typeof json !== 'object') {
      return { valid: false, error: 'JSON must be an object' };
    }

    if (!Array.isArray(json['镜头列表'])) {
      return { valid: false, error: 'Missing or invalid "镜头列表" array' };
    }

    for (const shot of json['镜头列表']) {
      if (typeof shot['镜头编号'] !== 'number') {
        return { valid: false, error: 'Invalid "镜头编号" - must be a number' };
      }
      if (typeof shot['时长秒'] !== 'number') {
        return { valid: false, error: 'Invalid "时长秒" - must be a number' };
      }
      if (!Array.isArray(shot['出现人物'])) {
        return { valid: false, error: 'Invalid "出现人物" - must be an array' };
      }
      if (typeof shot['出现场景'] !== 'string') {
        return { valid: false, error: 'Invalid "出现场景" - must be a string' };
      }
      if (!Array.isArray(shot['道具名称'])) {
        return { valid: false, error: 'Invalid "道具名称" - must be an array' };
      }
      if (typeof shot['镜头内容概述'] !== 'string') {
        return { valid: false, error: 'Invalid "镜头内容概述" - must be a string' };
      }
      if (typeof shot['视频Prompt'] !== 'string') {
        return { valid: false, error: 'Invalid "视频Prompt" - must be a string' };
      }
    }

    return { valid: true };
  }

  /**
   * 生成带时间戳的文件名
   */
  generateFileName(prefix: string, extension: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${prefix}_${timestamp}.${extension}`;
  }

  /**
   * 解析文档文件 (支持 .doc, .docx, .txt)
   */
  async parseDocument(file: Express.Multer.File): Promise<string> {
    const fileName = file.originalname.toLowerCase();
    const fileBuffer = file.buffer;

    this.logger.log(`[Workbench] Parsing document: ${fileName}, size: ${fileBuffer.length} bytes`);

    try {
      if (fileName.endsWith('.docx')) {
        // 解析 .docx 文件
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        this.logger.log(`[Workbench] Parsed .docx, text length: ${result.value.length}`);
        return result.value;
      } else if (fileName.endsWith('.doc')) {
        // 解析旧版 .doc 文件
        const extractor = new WordExtractor();
        const extracted = await extractor.extract(fileBuffer);
        const text = extracted.getBody();
        this.logger.log(`[Workbench] Parsed .doc, text length: ${text.length}`);
        return text;
      } else if (fileName.endsWith('.txt')) {
        // 纯文本文件，直接转换
        const text = fileBuffer.toString('utf-8');
        this.logger.log(`[Workbench] Parsed .txt, text length: ${text.length}`);
        return text;
      } else {
        throw new BadRequestException(`不支持的文件格式: ${fileName}。支持的格式: .doc, .docx, .txt`);
      }
    } catch (error: any) {
      this.logger.error(`[Workbench] Failed to parse document: ${error.message}`);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`文档解析失败: ${error.message}`);
    }
  }

  getProgress(jobId: string) {
    return this.progressTracker.get(jobId);
  }

  private parseDataUri(imageUrl: string): { mimeType: string; buffer: Buffer } | null {
    if (!imageUrl.startsWith('data:')) return null;
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return {
      mimeType: match[1],
      buffer: Buffer.from(match[2], 'base64'),
    };
  }

  private getImageMimeType(fileName: string, imageUrl: string): string {
    if (imageUrl.startsWith('data:')) {
      const match = imageUrl.match(/^data:([^;]+);base64,/);
      if (match) return match[1];
    }
    const ext = path.extname(fileName || '').toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      case '.bmp':
        return 'image/bmp';
      default:
        return 'image/png';
    }
  }

  private extractStepPrefix(fileName: string): string | null {
    const match = fileName.match(/^(.+)_\d{4}-\d{2}-\d{2}T/);
    return match ? match[1] : null;
  }

  private async findExistingStepAssets(spaceId: number, prefix: string): Promise<Asset[]> {
    return await this.assetRepository.find({
      where: {
        spaceId,
        filename: Like(`${prefix}_%`),
      },
    });
  }

  private async removeAssets(assets: Asset[]) {
    for (const asset of assets) {
      try {
        await this.storageService.delete(asset.url);
      } catch (error: any) {
        this.logger.warn(`[Workbench] Failed to delete old asset file ${asset.url}: ${error?.message || error}`);
      }
      await this.assetRepository.remove(asset);
    }
  }
}
