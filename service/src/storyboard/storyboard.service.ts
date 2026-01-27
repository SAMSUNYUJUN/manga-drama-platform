import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoryboardShot, StoryboardMessage, AssetSpace, NodeTool, Asset } from '../database/entities';
import { User } from '../database/entities/user.entity';
import { NodeToolService } from '../node-tool/node-tool.service';
import { AssetService } from '../asset/asset.service';
import { AssetType, UserRole } from '@shared/constants';
import type { IStorageService } from '../storage/storage.interface';

type GeneratePayload = {
  model: string;
  prompt: string;
  imageUrls?: string[];
  files?: any[];
  user: User;
  shotId: number;
};

@Injectable()
export class StoryboardService {
  private readonly locks = new Set<number>();

  constructor(
    @InjectRepository(StoryboardShot) private readonly shotRepo: Repository<StoryboardShot>,
    @InjectRepository(StoryboardMessage) private readonly messageRepo: Repository<StoryboardMessage>,
    @InjectRepository(AssetSpace) private readonly spaceRepo: Repository<AssetSpace>,
    @InjectRepository(NodeTool) private readonly toolRepo: Repository<NodeTool>,
    private readonly nodeToolService: NodeToolService,
    private readonly assetService: AssetService,
    @Inject('IStorageService') private readonly storageService: IStorageService,
  ) {}

  async listShots(user: User) {
    const shots = await this.shotRepo.find({ where: { userId: user.id }, order: { createdAt: 'DESC' } });
    const ids = shots.map((s) => s.id);
    const countsRaw = ids.length
      ? await this.messageRepo
          .createQueryBuilder('msg')
          .select('msg.shotId', 'shotId')
          .addSelect('COUNT(1)', 'cnt')
          .where('msg.shotId IN (:...ids)', { ids })
          .groupBy('msg.shotId')
          .getRawMany()
      : [];
    const countMap = new Map<number, number>(countsRaw.map((r: any) => [Number(r.shotId), Number(r.cnt)]));
    return shots.map((shot) => ({ ...shot, messageCount: countMap.get(shot.id) || 0 }));
  }

  async createShot(title: string, spaceId: number, user: User) {
    if (!spaceId) throw new BadRequestException('spaceId required');
    const space = await this.spaceRepo.findOne({ where: { id: spaceId } });
    if (!space) throw new BadRequestException('资产空间不存在');
    if (space.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('无权使用该资产空间');
    }
    const shot = this.shotRepo.create({ title: title?.trim() || '未命名分镜', spaceId, userId: user.id });
    return await this.shotRepo.save(shot);
  }

  async deleteShot(id: number, user: User) {
    const shot = await this.shotRepo.findOne({ where: { id } });
    if (!shot) throw new NotFoundException('分镜不存在');
    if (shot.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('无权限删除该分镜');
    }
    await this.shotRepo.delete(id);
    return { id };
  }

  async deleteMessage(id: number, user: User) {
    const message = await this.messageRepo.findOne({ where: { id } });
    if (!message) throw new NotFoundException('记录不存在');
    const shot = await this.shotRepo.findOne({ where: { id: message.shotId } });
    if (!shot) throw new NotFoundException('分镜不存在');
    if (shot.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('无权限删除该记录');
    }
    await this.messageRepo.delete(id);
    return { id };
  }

  async saveMessageAssets(messageId: number, spaceId: number, user: User) {
    const message = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException('记录不存在');
    const shot = await this.shotRepo.findOne({ where: { id: message.shotId } });
    if (!shot) throw new NotFoundException('分镜不存在');
    if (shot.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('无权限保存该记录');
    }
    const urls: string[] = message.mediaUrlsJson ? JSON.parse(message.mediaUrlsJson) : [];
    if (!urls.length) throw new BadRequestException('该记录没有可保存的媒体');
    const prefix = `msg${message.id}_${Date.now()}`;
    return await this.saveAssets(urls, spaceId, this.detectProviderType(message.model), prefix);
  }

  async listMessages(shotId: number, user: User) {
    await this.ensureShotAccessible(shotId, user);
    return await this.messageRepo.find({ where: { shotId }, order: { createdAt: 'ASC' } });
  }

  async generate(payload: GeneratePayload) {
    const { shotId, user } = payload;
    const shot = await this.ensureShotAccessible(shotId, user);
    let normalizedUrls: string[] | undefined = payload.imageUrls;

    if (this.locks.has(shotId)) {
      throw new ConflictException('当前分镜正在生成，请稍后再试');
    }
    this.locks.add(shotId);
    try {
      const existingCount = await this.messageRepo.count({ where: { shotId } });
      if (existingCount >= 5) {
        throw new BadRequestException('该分镜已达到 5 次生成上限，请新建分镜');
      }

      const { toolId, providerType } = this.pickTool(payload.model, payload.files, payload.imageUrls);
      normalizedUrls = this.normalizeImageUrls(providerType, payload.imageUrls);
      const tool = await this.toolRepo.findOne({ where: { id: toolId } });
      if (!tool) {
        throw new BadRequestException('对应节点工具未找到');
      }

      const inputs = this.buildInputs(tool, payload.prompt, normalizedUrls);

      const start = Date.now();
      const result = payload.files?.length
        ? await this.nodeToolService.testToolByIdWithFiles(toolId, inputs, payload.files, user, shot.spaceId)
        : await this.nodeToolService.testToolById(toolId, inputs, user, shot.spaceId);

      const durationMs = Date.now() - start;
      const mediaUrls: string[] = this.extractMediaUrls(result);

      const prefix = `shot${shot.id}_${Date.now()}`;
      const savedAssets = await this.saveAssets(mediaUrls, shot.spaceId, providerType, prefix);

      const message = this.messageRepo.create({
        shotId,
        model: payload.model,
        prompt: payload.prompt,
        inputImagesJson: JSON.stringify(normalizedUrls || []),
        mediaUrlsJson: JSON.stringify(mediaUrls),
        status: 'completed',
        durationMs,
      });
      await this.messageRepo.save(message);

      return { message, assets: savedAssets, mediaUrls, durationMs };
    } catch (error) {
      const message = this.messageRepo.create({
        shotId,
        model: payload.model,
        prompt: payload.prompt,
        inputImagesJson: JSON.stringify(normalizedUrls || []),
        mediaUrlsJson: null,
        status: 'failed',
        error: error?.message || 'failed',
      });
      await this.messageRepo.save(message);
      throw error;
    } finally {
      this.locks.delete(shotId);
    }
  }

  private extractMediaUrls(result: any): string[] {
    if (Array.isArray(result?.mediaUrls) && result.mediaUrls.length) return result.mediaUrls;
    const text = result?.outputText;
    if (typeof text === 'string' && /^https?:\/\//i.test(text.trim())) return [text.trim()];
    return [];
  }

  private async saveAssets(
    urls: string[],
    spaceId: number,
    providerType: 'image' | 'video',
    prefix: string,
  ): Promise<Asset[]> {
    const assets: Asset[] = [];
    for (let i = 0; i < urls.length; i += 1) {
      const url = urls[i];
      const isDataUri = url.startsWith('data:');
      const { filename, mimeType } = this.extractMimeAndFilename(url, providerType, `${prefix}_${i + 1}`);
      let storedUrl: string;
      if (isDataUri) {
        const parsed = this.parseDataUri(url);
        storedUrl = await this.storageService.uploadBuffer(Buffer.from(parsed.base64, 'base64'), filename, {
          contentType: parsed.mimeType,
          folder: 'storyboard',
        });
      } else {
        storedUrl = await this.storageService.uploadRemoteFile(url, filename, {
          contentType: mimeType,
          folder: 'storyboard',
        });
      }
      const asset = await this.assetService.createAsset({
        spaceId,
        url: storedUrl,
        filename,
        type: AssetType.WORKFLOW_TEST,
        mimeType,
      });
      assets.push(asset);
    }
    return assets;
  }

  private ensureShotAccessible = async (shotId: number, user: User) => {
    const shot = await this.shotRepo.findOne({ where: { id: shotId } });
    if (!shot) throw new NotFoundException('分镜不存在');
    if (shot.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('无权限访问该分镜');
    }
    return shot;
  };

  private pickTool(model: string, files?: any[], imageUrls?: string[]) {
    const hasImage = (files && files.length > 0) || (imageUrls && imageUrls.length > 0);
    const key = model.toLowerCase();
    if (key.includes('nano')) return { toolId: hasImage ? 21 : 5, providerType: 'image' as const };
    if (key.includes('jimeng') || key.includes('极梦') || key.includes('seedream'))
      return { toolId: hasImage ? 20 : 19, providerType: 'image' as const };
    if (key.includes('veo')) return { toolId: hasImage ? 10 : 9, providerType: 'video' as const };
    if (key.includes('sora')) return { toolId: hasImage ? 22 : 23, providerType: 'video' as const };
    throw new BadRequestException('不支持的模型');
  }

  private buildInputs(tool: NodeTool, prompt: string, imageUrls?: string[]) {
    const inputs: Record<string, any> = {};
    inputs['text'] = prompt;
    const urls = imageUrls || [];
    const assetRefs = tool.inputs.filter((i) => i.type.startsWith('asset_ref'));
    assetRefs.forEach((ref, idx) => {
      if (urls[idx]) inputs[ref.key] = urls[idx];
    });
    // asset_file input_reference (video/image)
    const fileInput = tool.inputs.find((i) => i.type === 'asset_file');
    if (fileInput && urls[0]) {
      inputs[fileInput.key] = urls[0];
    }
    return inputs;
  }

  private normalizeImageUrls(providerType: 'image' | 'video', urls?: string[]) {
    if (!urls || !urls.length) return [];
    if (providerType === 'video') {
      return [urls[0]];
    }
    return urls.slice(0, 5);
  }

  private detectProviderType(model: string): 'image' | 'video' {
    const key = this.normalizeModelKey(model);
    if (key.includes('veo') || key.includes('sora')) return 'video';
    return 'image';
  }

  private normalizeModelKey(model?: string): string {
    if (!model) return '';
    return model.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private extractMimeAndFilename(url: string, providerType: 'image' | 'video', fallbackBase: string) {
    if (url.startsWith('data:')) {
      const parsed = this.parseDataUri(url);
      const extFromMime = parsed.mimeType.split('/')[1] || (providerType === 'video' ? 'mp4' : 'png');
      return {
        filename: `output.${extFromMime}`,
        mimeType: parsed.mimeType,
      };
    }
    const cleanUrl = url.split('?')[0];
    const name = cleanUrl.split('/').pop() || '';
    const ext = name.split('.').pop()?.toLowerCase();
    const mimeByExt =
      ext === 'png'
        ? 'image/png'
        : ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'webp'
        ? 'image/webp'
        : ext === 'mp4'
        ? 'video/mp4'
        : ext === 'webm'
        ? 'video/webm'
        : providerType === 'video'
        ? 'video/mp4'
        : 'image/png';
    const filename =
      name ||
      (providerType === 'video'
        ? `output.${mimeByExt === 'video/webm' ? 'webm' : 'mp4'}`
        : `output.${mimeByExt === 'image/webp' ? 'webp' : 'png'}`);
    return { filename, mimeType: mimeByExt };
  }

  private parseDataUri(dataUri: string): { mimeType: string; base64: string } {
    const match = dataUri.match(/^data:(.*?);base64,(.+)$/);
    if (!match) {
      throw new BadRequestException('无效的 data URI');
    }
    const mimeType = match[1] || 'application/octet-stream';
    const base64 = match[2];
    return { mimeType, base64 };
  }
}
