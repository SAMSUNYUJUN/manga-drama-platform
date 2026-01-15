/**
 * Script service
 * @module script
 */

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset, Task, TaskVersion, User } from '../database/entities';
import { AssetStatus, AssetType, TaskStage, UserRole } from '@shared/constants';
import type { IStorageService } from '../storage/storage.interface';
import { Inject } from '@nestjs/common';
import { ParseScriptDto } from './dto';
import { AiOrchestratorService } from '../ai-service/orchestrator.service';
import axios from 'axios';

@Injectable()
export class ScriptService {
  constructor(
    private readonly aiService: AiOrchestratorService,
    @Inject('IStorageService') private readonly storageService: IStorageService,
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    @InjectRepository(TaskVersion)
    private versionRepository: Repository<TaskVersion>,
    @InjectRepository(Asset)
    private assetRepository: Repository<Asset>,
  ) {}

  async uploadScript(
    taskId: number,
    versionId: number,
    file: Express.Multer.File,
    user: User,
  ): Promise<Asset> {
    const { task, version } = await this.ensureTaskAccess(taskId, versionId, user);

    const folder = this.buildAssetFolder(task.userId, taskId, versionId, AssetType.TASK_EXECUTION);
    const filename = this.buildFilename('script', file.originalname);
    const url = await this.storageService.uploadBuffer(file.buffer, filename, {
      folder,
      contentType: file.mimetype,
      isPublic: false,
    });

    const asset = this.assetRepository.create({
      taskId,
      versionId,
      type: AssetType.TASK_EXECUTION,
      status: AssetStatus.ACTIVE,
      url,
      filename: file.originalname,
      filesize: file.size,
      mimeType: file.mimetype,
      metadataJson: JSON.stringify({ originalFilename: file.originalname }),
    });

    const saved = await this.assetRepository.save(asset);
    await this.updateStage(task, version, TaskStage.SCRIPT_UPLOADED);
    return saved;
  }

  async parseScript(
    taskId: number,
    versionId: number,
    body: ParseScriptDto,
    user: User,
  ): Promise<Asset> {
    const { task, version } = await this.ensureTaskAccess(taskId, versionId, user);

    let scriptText = body.scriptText;
    if (!scriptText) {
      let scriptAsset: Asset | null = null;
      if (body.scriptAssetId) {
        scriptAsset = await this.assetRepository.findOne({
          where: { id: body.scriptAssetId, taskId, versionId },
        });
      } else {
        scriptAsset = await this.assetRepository.findOne({
          where: { taskId, versionId, type: AssetType.TASK_EXECUTION, status: AssetStatus.ACTIVE },
          order: { createdAt: 'DESC' },
        });
      }
      if (!scriptAsset) {
        throw new NotFoundException('Script asset not found');
      }
      scriptText = await this.fetchScriptText(scriptAsset.url);
    }

    const result = await this.aiService.parseScript(scriptText, body.config);
    const folder = this.buildAssetFolder(task.userId, taskId, versionId, AssetType.TASK_EXECUTION);
    const filename = this.buildFilename('storyboard', 'storyboard.json');
    const jsonBuffer = Buffer.from(JSON.stringify(result, null, 2));
    const url = await this.storageService.uploadBuffer(jsonBuffer, filename, {
      folder,
      contentType: 'application/json',
      isPublic: false,
    });

    const asset = this.assetRepository.create({
      taskId,
      versionId,
      type: AssetType.TASK_EXECUTION,
      status: AssetStatus.ACTIVE,
      url,
      filename,
      filesize: jsonBuffer.length,
      mimeType: 'application/json',
      metadataJson: JSON.stringify({ source: 'parseScript' }),
    });

    const saved = await this.assetRepository.save(asset);
    await this.updateStage(task, version, TaskStage.STORYBOARD_GENERATED);
    return saved;
  }

  async getScripts(taskId: number, versionId: number, user: User): Promise<Asset[]> {
    await this.ensureTaskAccess(taskId, versionId, user);
    return await this.assetRepository.find({
      where: [
        { taskId, versionId, type: AssetType.TASK_EXECUTION },
        { taskId, versionId, type: AssetType.TASK_EXECUTION },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  private async ensureTaskAccess(taskId: number, versionId: number, user: User) {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }
    if (task.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only access your own tasks');
    }
    const version = await this.versionRepository.findOne({
      where: { id: versionId, taskId },
    });
    if (!version) {
      throw new NotFoundException(`TaskVersion with ID ${versionId} not found`);
    }
    return { task, version };
  }

  private buildAssetFolder(userId: number, taskId: number, versionId: number, type: AssetType): string {
    return `users/${userId}/tasks/${taskId}/versions/${versionId}/${type}`;
  }

  private buildFilename(prefix: string, originalName: string): string {
    const ext = originalName.includes('.') ? originalName.split('.').pop() : 'txt';
    return `${prefix}_${Date.now()}.${ext}`;
  }

  private async fetchScriptText(url: string): Promise<string> {
    const response = await axios.get<string>(url, { responseType: 'text' });
    return response.data;
  }

  private async updateStage(task: Task, version: TaskVersion, stage: TaskStage) {
    version.stage = stage;
    await this.versionRepository.save(version);
    task.stage = stage;
    await this.taskRepository.save(task);
  }
}
