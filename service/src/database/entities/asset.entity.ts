/**
 * 资产实体
 * @module database/entities
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Task } from './task.entity';
import { TaskVersion } from './task-version.entity';

export enum AssetType {
  ORIGINAL_SCRIPT = 'original_script',
  STORYBOARD_SCRIPT = 'storyboard_script',
  CHARACTER_DESIGN = 'character_design',
  SCENE_IMAGE = 'scene_image',
  KEYFRAME_IMAGE = 'keyframe_image',
  STORYBOARD_VIDEO = 'storyboard_video',
  FINAL_VIDEO = 'final_video',
}

@Entity('assets')
@Index(['taskId', 'type'])
@Index(['versionId'])
export class Asset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  @Index()
  taskId: number;

  @Column({ type: 'int', nullable: true })
  versionId: number;

  @Column({ type: 'varchar', length: 50 })
  @Index()
  type: AssetType;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ type: 'int', nullable: true })
  filesize: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mimeType: string;

  @Column({ type: 'text', nullable: true })
  metadata: string; // JSON string

  @CreateDateColumn({ type: 'datetime' })
  @Index()
  createdAt: Date;

  // 关系
  @ManyToOne(() => Task, (task) => task.assets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: Task;

  @ManyToOne(() => TaskVersion, (version) => version.assets, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'versionId' })
  version: TaskVersion;
}
