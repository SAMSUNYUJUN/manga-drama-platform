/**
 * 漫剧生产工作台服务
 * @module services/workbench
 */

import api from './api';
import type { ApiResponse } from '@shared/types/api.types';
import type { 
  ScriptAnalysisResult, 
  ShotLanguageResult,
} from '@shared/types/workbench.types';

/**
 * 执行节点工具
 */
export const runTool = async (
  toolName: string,
  inputs: Record<string, any>,
  files?: File[],
  options?: {
    modelConfig?: Record<string, any>;
    spaceId?: number;
    namedFiles?: Record<string, File | File[]>;
  },
): Promise<any> => {
  if ((files && files.length > 0) || options?.namedFiles) {
    const formData = new FormData();
    formData.append('toolName', toolName);
    formData.append('inputs', JSON.stringify(inputs));
    if (options?.modelConfig) {
      formData.append('modelConfig', JSON.stringify(options.modelConfig));
    }
    if (options?.spaceId) {
      formData.append('spaceId', String(options.spaceId));
    }
    if (options?.namedFiles) {
      Object.entries(options.namedFiles).forEach(([field, value]) => {
        if (Array.isArray(value)) {
          value.forEach((file) => formData.append(field, file));
        } else {
          formData.append(field, value);
        }
      });
    } else if (files) {
      files.forEach((file, index) => {
        formData.append(`file_${index}`, file);
      });
    }
    
    const response = await api.post<ApiResponse<any>>('/workbench/run-tool', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000, // 10 minutes
    });
    return response.data.data;
  }
  
  const response = await api.post<ApiResponse<any>>('/workbench/run-tool', {
    toolName,
    inputs,
    modelConfig: options?.modelConfig,
    spaceId: options?.spaceId,
  }, { timeout: 600000 });
  return response.data.data;
};

/**
 * 执行剧本拆解工具
 */
export const runScriptAnalysis = async (
  scriptContent: string,
  file?: File,
): Promise<ScriptAnalysisResult> => {
  // 使用 Novel_Text 作为参数名，与 prompt 模板中的 {{Novel_Text}} 变量匹配
  const inputs = { Novel_Text: scriptContent };
  const result = await runTool('剧本拆解自动化', inputs, file ? [file] : undefined);
  
  // Parse the result if it's a string
  if (result?.outputText) {
    try {
      return JSON.parse(result.outputText);
    } catch {
      throw new Error('Failed to parse script analysis result');
    }
  }
  
  if (result?.parsedJson) {
    return result.parsedJson;
  }
  
  throw new Error('No valid result from script analysis');
};

/**
 * 执行镜头语言转译工具
 */
export const runShotLanguage = async (
  scriptContent: string,
  analysisResult: ScriptAnalysisResult,
): Promise<ShotLanguageResult> => {
  const inputs = {
    Novel_Text: scriptContent,
    Character_Scene_JSON: JSON.stringify(analysisResult),
  };
  const result = await runTool('镜头语言转译', inputs);
  
  if (result?.outputText) {
    try {
      return JSON.parse(result.outputText);
    } catch {
      throw new Error('Failed to parse shot language result');
    }
  }
  
  if (result?.parsedJson) {
    return result.parsedJson;
  }
  
  throw new Error('No valid result from shot language translation');
};

/**
 * 执行定妆照生成工具
 */
export const runCostumePhoto = async (
  inputType: '人物' | '场景' | '道具',
  description: string,
): Promise<string[]> => {
  const inputs = {
    Input_Type: inputType,
    Description: description,
  };
  
  const result = await runTool('定妆照', inputs);
  
  // Extract image URLs from result
  if (result?.images && Array.isArray(result.images)) {
    return result.images;
  }
  
  if (result?.mediaUrls && Array.isArray(result.mediaUrls)) {
    return result.mediaUrls;
  }
  
  // If single image
  if (result?.url) {
    return [result.url];
  }
  
  return [];
};

/**
 * 批量生成定妆照（每个元素生成5张）
 */
export const runCostumePhotoBatch = async (
  inputType: '人物' | '场景' | '道具',
  description: string,
  count: number = 3,
): Promise<string[]> => {
  const promises = Array.from({ length: count }, () => 
    runCostumePhoto(inputType, description)
  );
  
  const results = await Promise.allSettled(promises);
  const images: string[] = [];
  
  results.forEach((result) => {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      images.push(...result.value);
    }
  });
  
  return images;
};

/**
 * 分镜关键帧生成
 */
export const runKeyframeShots = async (
  frameInfo: string,
  referenceImages: string[],
): Promise<string[]> => {
  const inputs = {
    Frame_Info: frameInfo,
    Reference_Images: referenceImages,
  };

  const result = await runTool('分镜头关键帧', inputs);

  if (result?.images && Array.isArray(result.images)) {
    return result.images;
  }

  if (result?.mediaUrls && Array.isArray(result.mediaUrls)) {
    return result.mediaUrls;
  }

  if (result?.url) {
    return [result.url];
  }

  return [];
};

/**
 * 保存JSON到资产空间
 */
export const saveJsonToSpace = async (
  spaceId: number,
  fileName: string,
  content: any,
): Promise<string> => {
  const response = await api.post<ApiResponse<{ path: string }>>(
    `/workbench/save-json/${spaceId}`,
    { fileName, content },
  );
  return response.data.data!.path;
};

/**
 * 保存图片到资产空间
 */
export const saveImageToSpace = async (
  spaceId: number,
  fileName: string,
  imageUrl: string,
): Promise<string> => {
  const response = await api.post<ApiResponse<{ path: string }>>(
    `/workbench/save-image/${spaceId}`,
    { fileName, imageUrl },
  );
  return response.data.data!.path;
};

/**
 * 保存视频到资产空间
 */
export const saveVideoToSpace = async (
  spaceId: number,
  fileName: string,
  videoUrl: string,
): Promise<string> => {
  const response = await api.post<ApiResponse<{ path: string }>>(
    `/workbench/save-video/${spaceId}`,
    { fileName, videoUrl },
  );
  return response.data.data!.path;
};

/**
 * 获取异步进度
 */
export const getProgress = async (jobId: string): Promise<any | null> => {
  const response = await api.get<ApiResponse<any>>(`/workbench/progress/${jobId}`);
  return response.data.data || null;
};

/**
 * 验证剧本拆解JSON格式
 */
export const validateScriptAnalysis = async (
  content: any,
): Promise<{ valid: boolean; error?: string }> => {
  const response = await api.post<ApiResponse<{ valid: boolean; error?: string }>>(
    '/workbench/validate/script-analysis',
    { content },
  );
  return response.data.data!;
};

/**
 * 验证镜头语言JSON格式
 */
export const validateShotLanguage = async (
  content: any,
): Promise<{ valid: boolean; error?: string }> => {
  const response = await api.post<ApiResponse<{ valid: boolean; error?: string }>>(
    '/workbench/validate/shot-language',
    { content },
  );
  return response.data.data!;
};

/**
 * 生成带时间戳的文件名
 */
export const generateFileName = (prefix: string, extension: string = 'json'): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}_${timestamp}.${extension}`;
};

/**
 * 解析文档文件 (支持 .doc, .docx, .txt)
 */
export const parseDocument = async (
  file: File,
): Promise<{ text: string; fileName: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await api.post<ApiResponse<{ text: string; fileName: string }>>(
    '/workbench/parse-document',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000, // 1 minute
    },
  );
  return response.data.data!;
};

export default {
  runTool,
  runScriptAnalysis,
  runShotLanguage,
  runCostumePhoto,
  runCostumePhotoBatch,
  runKeyframeShots,
  saveJsonToSpace,
  saveImageToSpace,
  saveVideoToSpace,
  validateScriptAnalysis,
  validateShotLanguage,
  generateFileName,
  parseDocument,
  getProgress,
};
