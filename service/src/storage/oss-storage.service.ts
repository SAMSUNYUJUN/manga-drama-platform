/**
 * 阿里云 OSS 存储服务实现
 * @module storage
 */

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OSS from 'ali-oss';
import axios from 'axios';
import * as path from 'path';
import { IStorageService, UploadOptions } from './storage.interface';

@Injectable()
export class OssStorageService implements IStorageService {
  private readonly logger = new Logger(OssStorageService.name);
  private ossClient: OSS | null = null;
  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly accessKeySecret: string;
  private readonly bucket: string;
  private readonly baseFolder: string;

  constructor(private configService: ConfigService) {
    this.region = this.configService.get<string>('OSS_REGION') || '';
    this.accessKeyId = this.configService.get<string>('OSS_ACCESS_KEY_ID') || '';
    this.accessKeySecret = this.configService.get<string>('OSS_ACCESS_KEY_SECRET') || '';
    this.bucket = this.configService.get<string>('OSS_BUCKET') || '';
    this.baseFolder = this.configService.get<string>('OSS_BASE_FOLDER') || 'manga-drama';
  }

  private initOSSClient(): OSS {
    if (!this.ossClient) {
      if (!this.accessKeyId || !this.accessKeySecret || !this.bucket || !this.region) {
        throw new HttpException('OSS 凭证未配置', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      this.ossClient = new OSS({
        region: this.region,
        accessKeyId: this.accessKeyId,
        accessKeySecret: this.accessKeySecret,
        bucket: this.bucket,
        secure: true,
      });
    }
    return this.ossClient!;
  }

  private getOssKey(filename: string, folder?: string): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const folderPath = folder ? `${folder}/` : '';
    return `${this.baseFolder}/${folderPath}${date}/${filename}`;
  }

  async uploadBuffer(buffer: Buffer, filename: string, options?: UploadOptions): Promise<string> {
    try {
      const client = this.initOSSClient();
      const ossKey = this.getOssKey(filename, options?.folder);
      
      const putOptions: OSS.PutObjectOptions = {};
      if (options?.contentType) {
        putOptions.headers = { 'Content-Type': options.contentType };
      }

      await client.put(ossKey, buffer, putOptions);
      
      if (options?.isPublic !== false) {
        await client.putACL(ossKey, 'public-read');
      }

      return this.getUrl(ossKey);
    } catch (error) {
      this.logger.error(`OSS Buffer 上传失败: ${error.message}`);
      throw new HttpException(`存储上传失败: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async uploadRemoteFile(fileUrl: string, filename?: string, options?: UploadOptions): Promise<string> {
    try {
      const response = await axios.get<ArrayBuffer>(fileUrl, {
        responseType: 'arraybuffer',
        timeout: 300000,
      });

      let actualFilename = filename;
      if (!actualFilename) {
        actualFilename = path.basename(new URL(fileUrl).pathname) || `file_${Date.now()}`;
      }

      const contentType = (response.headers['content-type'] as string) || options?.contentType;
      const buffer = Buffer.from(response.data);

      return await this.uploadBuffer(buffer, actualFilename, { ...options, contentType });
    } catch (error) {
      this.logger.error(`OSS 远程文件上传失败: ${error.message}`);
      throw new HttpException(`存储上传失败: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async uploadFile(localPath: string, options?: UploadOptions): Promise<string> {
    try {
      const client = this.initOSSClient();
      const filename = path.basename(localPath);
      const ossKey = this.getOssKey(filename, options?.folder);

      await client.put(ossKey, localPath);

      if (options?.isPublic !== false) {
        await client.putACL(ossKey, 'public-read');
      }

      return this.getUrl(ossKey);
    } catch (error) {
      this.logger.error(`OSS 本地文件上传失败: ${error.message}`);
      throw new HttpException(`存储上传失败: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async delete(path: string): Promise<void> {
    try {
      const client = this.initOSSClient();
      const ossKey = path.replace(/https?:\/\/[^\/]+\//, '');
      await client.delete(ossKey);
    } catch (error) {
      this.logger.error(`OSS 文件删除失败: ${error.message}`);
    }
  }

  getUrl(path: string): string {
    if (path.startsWith('http')) return path;
    return `https://${this.bucket}.${this.region}.aliyuncs.com/${path}`;
  }

  async getTextContent(urlOrPath: string): Promise<string> {
    try {
      const client = this.initOSSClient();
      // 从 URL 中提取 OSS key
      let ossKey: string;
      if (urlOrPath.startsWith('http')) {
        ossKey = urlOrPath.replace(/https?:\/\/[^\/]+\//, '');
      } else {
        ossKey = urlOrPath;
      }
      
      const result = await client.get(ossKey);
      // result.content 是 Buffer
      return result.content.toString('utf-8');
    } catch (error) {
      this.logger.error(`OSS 读取文件内容失败: ${error.message}`);
      throw new Error(`Failed to read file content from OSS: ${error.message}`);
    }
  }
}
