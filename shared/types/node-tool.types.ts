/**
 * Node tool types
 * @module shared/types/node-tool
 */

import type { WorkflowVariable } from './workflow.types';

export const IMAGE_ASPECT_RATIOS = ['2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const;
export type ImageAspectRatio = typeof IMAGE_ASPECT_RATIOS[number];

/** Doubao Seedream 模型特定配置 */
export interface DoubaoSeedreamConfig {
  /** 图像尺寸，方式1: "1K"/"2K"/"4K"，方式2: "2048x2048" 格式 */
  size?: string;
  /** 组图功能: "auto" | "disabled" */
  sequential_image_generation?: 'auto' | 'disabled';
  /** 组图最大数量（当 sequential_image_generation="auto" 时有效） */
  max_images?: number;
  /** 水印 */
  watermark?: boolean;
  /** 流式输出 */
  stream?: boolean;
  /** 响应格式: "url" | "b64_json" */
  response_format?: 'url' | 'b64_json';
}

/** Sora 视频模型配置 */
export interface SoraVideoConfig {
  /** 输出分辨率，如 1280x720；默认使用参考图尺寸 */
  size?: string;
  /** 视频时长，需小于 15 秒 */
  seconds?: number;
}

/** Gemini 图片模型配置 */
export interface GeminiImageConfig {
  imageConfig?: {
    aspectRatio?: string;
    imageSize?: string;
  };
}

/** 模型特定配置联合类型 */
export type ModelSpecificConfig = DoubaoSeedreamConfig | SoraVideoConfig | GeminiImageConfig;

export interface NodeTool {
  id: number;
  name: string;
  description?: string | null;
  promptTemplateVersionId?: number | null;
  /** System prompt version ID (for LLM nodes) */
  systemPromptVersionId?: number | null;
  model?: string | null;
  imageAspectRatio?: string | null;
  /** LLM max tokens (default: 8000) */
  maxTokens?: number | null;
  /** LLM temperature (default: 0.7) */
  temperature?: number | null;
  /** 模型特定配置（如 doubao-seedream 的参数） */
  modelConfig?: ModelSpecificConfig | null;
  inputs: WorkflowVariable[];
  outputs: WorkflowVariable[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NodeToolTestResult {
  renderedPrompt: string;
  renderedSystemPrompt?: string;
  outputText: string;
  mediaUrls?: string[];
  parsedJson?: any;
  /** Saved asset info for json/list<json> outputs */
  savedAssets?: {
    id: number;
    url: string;
    filename: string;
    type: string; // 'workflow_test' | 'task_execution'
    mimeType: string;
  }[];
  missingVariables: string[];
  durationMs: number;
  error?: string;
}
