/**
 * AI service shared types
 * @module ai-service/types
 */

export interface InputAssetFile {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  /** 原始来源 URL，便于日志记录 */
  sourceUrl?: string;
}
