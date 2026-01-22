/**
 * 漫剧生产工作台类型定义
 */

// 第一步：剧本拆解输出格式
export interface ScriptAnalysisCharacter {
  人物姓名: string;
  性别: string;
  外貌特征描写: string;
}

export interface ScriptAnalysisScene {
  地点名称: string;
  环境氛围描写: string;
}

export interface ScriptAnalysisProp {
  道具名称: string;
  道具描写: string;
}

export interface ScriptAnalysisResult {
  人物: ScriptAnalysisCharacter[];
  场景: ScriptAnalysisScene[];
  道具: ScriptAnalysisProp[];
}

// 第二步：镜头语言转译输出格式
export interface ShotItem {
  镜头编号: number;
  时长秒: number;
  出现人物: string[];
  出现场景: string;
  道具名称: string[];
  镜头内容概述: string;
  视频Prompt: string;
}

export interface ShotLanguageResult {
  镜头列表: ShotItem[];
}

// 第三步：定妆照相关
export type CostumePhotoType = 'character' | 'scene' | 'prop';

export interface CostumePhotoItem {
  id?: string;
  type: CostumePhotoType;
  name: string;
  description: string;
  images: string[]; // 生成的5张图片URL
  failedImages?: string[]; // 生成失败的占位
  selectedImage?: string; // 用户选中保存的图片
  savedToSpace?: boolean; // 是否已保存到资产空间
  savedImage?: string;
  savedPath?: string;
  isGenerating?: boolean;
  regeneratingImages?: string[];
}

// 第四步：分镜关键帧
export interface KeyframeShotItem {
  id: string;
  shotNumber: number;
  duration: number;
  frameInfo: any;
  frameInfoText?: string;
  references: string[];
  images: string[];
  failedImages: string[];
  isGenerating: boolean;
  savedImage?: string;
  savedPath?: string;
}

// 第五步：关键帧转视频
export interface ShotVideoItem {
  shotNumber: number;
  duration: number;
  frameInfoText: string;
  selectedImage?: string;
  uploadedFile?: { name?: string; size?: number; type?: string } | null;
  savedVideoUrl?: string;
  savedPath?: string;
  seconds?: 10 | 15;
  jobId?: string;
  progress?: number;
  status?: string;
  isGenerating?: boolean;
}

// 工作台状态
export interface WorkbenchState {
  spaceId?: number;
  spaceName?: string;
  currentStep: 1 | 2 | 3 | 4 | 5;
  // 第一步数据
  scriptContent?: string;
  scriptFileName?: string;
  scriptAnalysisResult?: ScriptAnalysisResult;
  scriptAnalysisSavedPath?: string;
  scriptAnalysisEditedJson?: string;
  scriptAnalysisHasExisting?: boolean;
  // 第二步数据
  shotLanguageResult?: ShotLanguageResult;
  shotLanguageSavedPath?: string;
  shotLanguageEditedJson?: string;
  shotLanguageHasExisting?: boolean;
  // 第三步数据
  costumePhotos?: CostumePhotoItem[];
  // 第四步数据
  keyframeShots?: KeyframeShotItem[];
  // 第五步数据
  shotVideos?: ShotVideoItem[];
  videoSeconds?: 10 | 15;
}

// API请求/响应类型
export interface RunToolRequest {
  toolName: string;
  inputs: Record<string, any>;
}

export interface RunToolResponse {
  success: boolean;
  result?: any;
  error?: string;
}

export interface SaveToSpaceRequest {
  spaceId: number;
  fileName: string;
  content: string;  // JSON string or image URL
  contentType: 'json' | 'image';
}

export interface SaveToSpaceResponse {
  success: boolean;
  path?: string;
  error?: string;
}
