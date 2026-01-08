/**
 * 任务实体
 * @module database/entities
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { TaskVersion } from './task-version.entity';
import { Asset } from './asset.entity';

export enum TaskStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum TaskStage {
  SCRIPT_UPLOADED = 'SCRIPT_UPLOADED',
  STORYBOARD_GENERATED = 'STORYBOARD_GENERATED',
  CHARACTER_DESIGNED = 'CHARACTER_DESIGNED',
  SCENE_GENERATED = 'SCENE_GENERATED',
  KEYFRAME_GENERATING = 'KEYFRAME_GENERATING',
  KEYFRAME_COMPLETED = 'KEYFRAME_COMPLETED',
  VIDEO_GENERATING = 'VIDEO_GENERATING',
  VIDEO_COMPLETED = 'VIDEO_COMPLETED',
  FINAL_COMPOSING = 'FINAL_COMPOSING',
  COMPLETED = 'COMPLETED',
}

@Entity('tasks')
@Index(['userId', 'createdAt'])
export class Task {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  @Index()
  userId: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 20, default: TaskStatus.PENDING })
  @Index()
  status: TaskStatus;

  @Column({ type: 'varchar', length: 50, nullable: true })
  stage: TaskStage;

  @Column({ type: 'int', nullable: true })
  currentVersionId: number;

  @CreateDateColumn({ type: 'datetime' })
  @Index()
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;

  // 关系
  @ManyToOne(() => User, (user) => user.tasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => TaskVersion, (version) => version.task)
  versions: TaskVersion[];

  @OneToMany(() => Asset, (asset) => asset.task)
  assets: Asset[];

  @ManyToOne(() => TaskVersion, { nullable: true })
  @JoinColumn({ name: 'currentVersionId' })
  currentVersion: TaskVersion;
}
