/**
 * 即梦视频生成服务
 * @module ai-service
 */

import { Injectable, Logger, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { JiMengSigner, SignParams } from '../../common/utils/jimeng-signer';
import type { IStorageService } from '../../storage/storage.interface';

export interface SoraGenerateParams {
  prompt: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  duration?: number;
  fps?: number;
  resolution?: string;
}

@Injectable()
export class SoraService {
  private readonly logger = new Logger(SoraService.name);
  private readonly API_BASE_URL = 'https://visual.volcengineapi.com';
  private readonly SUBMIT_ACTION = 'CVSync2AsyncSubmitTask';
  private readonly QUERY_ACTION = 'CVSync2AsyncGetResult';
  private readonly VERSION = '2022-08-31';
  
  // 默认使用首帧图生视频
  private readonly I2V_REQ_KEY = 'jimeng_i2v_first_v30_1080';
  private readonly I2V_FIRST_TAIL_REQ_KEY = 'jimeng_i2v_first_tail_v30_1080';
  private readonly T2V_REQ_KEY = 'jimeng_t2v_v30_1080p';

  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject('IStorageService') private readonly storageService: IStorageService,
  ) {
    this.accessKeyId = this.configService.get<string>('JIMENG_ACCESS_KEY_ID')!;
    this.secretAccessKey = this.configService.get<string>('JIMENG_SECRET_ACCESS_KEY')!;
  }

  async generateVideo(params: SoraGenerateParams): Promise<string> {
    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new HttpException('即梦 API 密钥未配置', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const isFirstTail = !!(params.firstFrameUrl && params.lastFrameUrl);
    const isImageToVideo = !!params.firstFrameUrl;
    
    const reqKey = isFirstTail 
      ? this.I2V_FIRST_TAIL_REQ_KEY 
      : (isImageToVideo ? this.I2V_REQ_KEY : this.T2V_REQ_KEY);

    const apiRequest: any = {
      req_key: reqKey,
      prompt: params.prompt,
      aspect_ratio: params.resolution === '1080p' ? '16:9' : '9:16',
    };

    if (isFirstTail) {
      apiRequest.image_urls = [params.firstFrameUrl, params.lastFrameUrl];
    } else if (isImageToVideo) {
      apiRequest.image_urls = [params.firstFrameUrl];
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
      this.logger.error(`即梦视频生成提交失败: ${error.message}`);
      throw new HttpException(`AI 服务请求失败: ${error.message}`, HttpStatus.BAD_GATEWAY);
    }
  }

  async queryTask(taskId: string, reqKey?: string): Promise<any> {
    // 注意：查询时需要正确的 req_key，建议在任务记录中保存提交时的 reqKey
    const queryRequest = { 
      req_key: reqKey || this.I2V_REQ_KEY, 
      task_id: taskId 
    };
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
      this.logger.error(`即梦视频任务查询失败: ${error.message}`);
      throw new HttpException(`AI 服务状态查询失败: ${error.message}`, HttpStatus.BAD_GATEWAY);
    }
  }
}
