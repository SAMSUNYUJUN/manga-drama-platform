import { TaskStatus, TaskStage } from '../constants/enums';
export interface Task {
    id: number;
    userId: number;
    title: string;
    description?: string;
    status: TaskStatus;
    stage?: TaskStage;
    currentVersionId?: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface TaskVersion {
    id: number;
    taskId: number;
    version: number;
    stage: TaskStage;
    metadata?: TaskVersionMetadata;
    createdAt: Date;
}
export interface TaskVersionMetadata {
    storyboardConfig?: {
        maxDuration?: number;
        sceneCount?: number;
    };
    generationConfig?: {
        imageStyle?: string;
        videoResolution?: string;
    };
    parentVersionId?: number;
    note?: string;
}
export interface CreateTaskDto {
    title: string;
    description?: string;
}
export interface UpdateTaskDto {
    title?: string;
    description?: string;
    status?: TaskStatus;
    stage?: TaskStage;
}
export interface CreateTaskVersionDto {
    note?: string;
    metadata?: TaskVersionMetadata;
}
export interface SwitchVersionDto {
    versionId: number;
}
export interface TaskDetail extends Task {
    currentVersion?: TaskVersion;
    user?: {
        id: number;
        username: string;
    };
    versions?: TaskVersion[];
}
