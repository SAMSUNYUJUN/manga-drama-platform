/**
 * 存储服务接口定义
 * @module storage
 */

export interface UploadOptions {
  contentType?: string;
  folder?: string;
  isPublic?: boolean;
}

export interface IStorageService {
  /**
   * 上传 Buffer 到存储
   */
  uploadBuffer(buffer: Buffer, filename: string, options?: UploadOptions): Promise<string>;

  /**
   * 从远程 URL 上传到存储
   */
  uploadRemoteFile(fileUrl: string, filename?: string, options?: UploadOptions): Promise<string>;

  /**
   * 从本地文件上传到存储
   */
  uploadFile(localPath: string, options?: UploadOptions): Promise<string>;

  /**
   * 删除文件
   */
  delete(path: string): Promise<void>;

  /**
   * 获取文件访问 URL
   */
  getUrl(path: string): string;

  /**
   * 获取文件的文本内容
   */
  getTextContent(urlOrPath: string): Promise<string>;
}
