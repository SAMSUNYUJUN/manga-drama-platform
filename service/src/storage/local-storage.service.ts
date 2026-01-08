/**
 * 本地文件存储服务实现
 * @module storage
 */

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs-extra';
import * as path from 'path';
import axios from 'axios';
import { IStorageService, UploadOptions } from './storage.interface';

@Injectable()
export class LocalStorageService implements IStorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.uploadDir = this.configService.get<string>('LOCAL_STORAGE_PATH') || './storage/uploads';
    this.baseUrl = this.configService.get<string>('LOCAL_STORAGE_URL') || 'http://localhost:3001/uploads';
    fs.ensureDirSync(this.uploadDir);
  }

  private getLocalPath(filename: string, folder?: string): { fullPath: string; relativePath: string } {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const relativePath = folder ? `${folder}/${date}` : date;
    const fullPath = path.join(this.uploadDir, relativePath);
    fs.ensureDirSync(fullPath);
    return {
      fullPath: path.join(fullPath, filename),
      relativePath: `${relativePath}/${filename}`,
    };
  }

  async uploadBuffer(buffer: Buffer, filename: string, options?: UploadOptions): Promise<string> {
    try {
      const { fullPath, relativePath } = this.getLocalPath(filename, options?.folder);
      await fs.writeFile(fullPath, buffer);
      return this.getUrl(relativePath);
    } catch (error) {
      this.logger.error(`本地上传失败: ${error.message}`);
      throw new HttpException('存储上传失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async uploadRemoteFile(fileUrl: string, filename?: string, options?: UploadOptions): Promise<string> {
    try {
      const response = await axios.get<ArrayBuffer>(fileUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      let actualFilename = filename;
      if (!actualFilename) {
        actualFilename = path.basename(new URL(fileUrl).pathname) || `file_${Date.now()}`;
      }

      return await this.uploadBuffer(Buffer.from(response.data), actualFilename, options);
    } catch (error) {
      this.logger.error(`远程下载上传失败: ${error.message}`);
      throw new HttpException('存储上传失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async uploadFile(localPath: string, options?: UploadOptions): Promise<string> {
    try {
      const filename = path.basename(localPath);
      const { fullPath, relativePath } = this.getLocalPath(filename, options?.folder);
      await fs.copy(localPath, fullPath);
      return this.getUrl(relativePath);
    } catch (error) {
      this.logger.error(`本地文件拷贝失败: ${error.message}`);
      throw new HttpException('存储上传失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async delete(filePath: string): Promise<void> {
    try {
      const relativePath = filePath.replace(this.baseUrl + '/', '');
      const fullPath = path.join(this.uploadDir, relativePath);
      await fs.remove(fullPath);
    } catch (error) {
      this.logger.error(`本地文件删除失败: ${error.message}`);
    }
  }

  getUrl(relativePath: string): string {
    if (relativePath.startsWith('http')) return relativePath;
    return `${this.baseUrl}/${relativePath.replace(/\\/g, '/')}`;
  }
}
