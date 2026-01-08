import { AssetType } from '../constants/enums';
export interface Asset {
    id: number;
    taskId: number;
    versionId?: number;
    type: AssetType;
    url: string;
    filename: string;
    filesize?: number;
    mimeType?: string;
    metadata?: AssetMetadata;
    createdAt: Date;
}
export interface AssetMetadata {
    index?: number;
    duration?: number;
    prompt?: string;
    aiRequestId?: string;
    retryCount?: number;
    originalAssetId?: number;
    width?: number;
    height?: number;
    status?: string;
    [key: string]: any;
}
export interface QueryAssetDto {
    taskId?: number;
    versionId?: number;
    type?: AssetType;
    page?: number;
    limit?: number;
}
export interface FileUploadResponse {
    url: string;
    filename: string;
    size: number;
}
