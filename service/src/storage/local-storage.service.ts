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
    const configuredPath = this.configService.get<string>('LOCAL_STORAGE_PATH') || '../storage/uploads';
    this.uploadDir = path.resolve(process.cwd(), configuredPath);
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
      if (!/^https?:\/\//i.test(fileUrl)) {
        throw new HttpException('无效的资源链接', HttpStatus.BAD_REQUEST);
      }
      const maxAttempts = 3;
      let lastError: any;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const response = await axios.get<ArrayBuffer>(fileUrl, {
            responseType: 'arraybuffer',
            timeout: 300000,
            maxRedirects: 5,
            headers: {
              'User-Agent': 'Mozilla/5.0',
              Accept: '*/*',
            },
          });

          let actualFilename = filename;
          if (!actualFilename) {
            try {
              actualFilename = path.basename(new URL(fileUrl).pathname) || `file_${Date.now()}`;
            } catch {
              actualFilename = `file_${Date.now()}`;
            }
          }

          const contentType = (response.headers['content-type'] as string) || options?.contentType;
          return await this.uploadBuffer(Buffer.from(response.data), actualFilename, { ...options, contentType });
        } catch (error) {
          lastError = error;
          const status = error?.response?.status;
          const code = error?.code;
          const shouldRetry =
            status === 429 || status >= 500 ||
            ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNABORTED'].includes(code);
          if (!shouldRetry || attempt === maxAttempts) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }
      throw lastError;
    } catch (error) {
      const message = error?.message || '未知错误';
      const status = error?.response?.status;
      const code = error?.code;
      this.logger.error(`远程下载上传失败: ${message} ${status ? `status=${status}` : ''} ${code ? `code=${code}` : ''} url=${fileUrl}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(`存储上传失败: ${message}`, HttpStatus.INTERNAL_SERVER_ERROR);
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

  async getTextContent(urlOrPath: string): Promise<string> {
    try {
      // 如果是完整 URL，需要转换为本地路径
      let localPath: string;
      if (urlOrPath.startsWith('http')) {
        // 从 URL 中提取相对路径
        const baseUrlWithoutProtocol = this.baseUrl.replace(/^https?:\/\/[^/]+/, '');
        const relativePath = urlOrPath.replace(this.baseUrl, '').replace(/^\//, '');
        localPath = path.join(this.uploadDir, relativePath);
      } else {
        localPath = path.join(this.uploadDir, urlOrPath);
      }
      
      const content = await fs.readFile(localPath, 'utf-8');
      return content;
    } catch (error) {
      this.logger.error(`读取文件内容失败: ${error.message}`);
      throw new Error(`Failed to read file content: ${error.message}`);
    }
  }
}
