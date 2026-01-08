/**
 * 即梦图片生成服务
 * @module ai-service
 */

import { Injectable, Logger, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { JiMengSigner, SignParams } from '../../common/utils/jimeng-signer';
import type { IStorageService } from '../../storage/storage.interface';
import { imageSize } from 'image-size';

export interface JimengGenerateParams {
  prompt: string;
  width?: number;
  height?: number;
  style?: string;
  referenceImageUrls?: string[];
  returnUrl?: boolean;
}

@Injectable()
export class JimengService {
  private readonly logger = new Logger(JimengService.name);
  private readonly API_BASE_URL = 'https://visual.volcengineapi.com';
  private readonly SUBMIT_ACTION = 'CVSync2AsyncSubmitTask';
  private readonly QUERY_ACTION = 'CVSync2AsyncGetResult';
  private readonly VERSION = '2022-08-31';
  private readonly REQ_KEY = 'jimeng_t2i_v40';

  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject('IStorageService') private readonly storageService: IStorageService,
  ) {
    this.accessKeyId = this.configService.get<string>('JIMENG_ACCESS_KEY_ID')!;
    this.secretAccessKey = this.configService.get<string>('JIMENG_SECRET_ACCESS_KEY')!;
  }

  async generateImage(params: JimengGenerateParams): Promise<string> {
    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new HttpException('即梦 API 密钥未配置', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const apiRequest: any = {
      req_key: this.REQ_KEY,
      prompt: params.prompt,
      width: params.width || 1024,
      height: params.height || 1024,
      req_json: JSON.stringify({
        return_url: params.returnUrl !== false,
      }),
    };

    if (params.referenceImageUrls && params.referenceImageUrls.length > 0) {
      apiRequest.image_urls = params.referenceImageUrls.slice(0, 3);
    }

    const query = { Action: this.SUBMIT_ACTION, Version: this.VERSION };
    const body = JSON.stringify(apiRequest);
    const signParams: SignParams = {
      headers: {
        'Content-Type': 'application/json',
        'Host': 'visual.volcengineapi.com',
      },
      query,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      body,
    };

    const authorization = JiMengSigner.sign(signParams);
    const url = `${this.API_BASE_URL}?Action=${this.SUBMIT_ACTION}&Version=${this.VERSION}`;

    try {
      const response = await axios.post(url, body, {
        headers: { ...signParams.headers, Authorization: authorization },
        timeout: 30000,
      });

      if (response.data.code !== 10000) {
        throw new Error(response.data.message);
      }

      return response.data.data.task_id;
    } catch (error) {
      this.logger.error(`即梦图片生成提交失败: ${error.message}`);
      throw new HttpException(`AI 服务请求失败: ${error.message}`, HttpStatus.BAD_GATEWAY);
    }
  }

  async queryTask(taskId: string): Promise<any> {
    const queryRequest = { req_key: this.REQ_KEY, task_id: taskId };
    const query = { Action: this.QUERY_ACTION, Version: this.VERSION };
    const body = JSON.stringify(queryRequest);
    const signParams: SignParams = {
      headers: {
        'Content-Type': 'application/json',
        'Host': 'visual.volcengineapi.com',
      },
      query,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      body,
    };

    const authorization = JiMengSigner.sign(signParams);
    const url = `${this.API_BASE_URL}?Action=${this.QUERY_ACTION}&Version=${this.VERSION}`;

    try {
      const response = await axios.post(url, body, {
        headers: { ...signParams.headers, Authorization: authorization },
        timeout: 30000,
      });

      if (response.data.code !== 10000) {
        throw new Error(response.data.message);
      }

      return response.data.data;
    } catch (error) {
      this.logger.error(`即梦任务查询失败: ${error.message}`);
      throw new HttpException(`AI 服务状态查询失败: ${error.message}`, HttpStatus.BAD_GATEWAY);
    }
  }
}
