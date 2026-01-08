/**
 * 任务版本实体
 * @module database/entities/task-version
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { TaskStage } from '@shared/constants';
import { TaskVersionMetadata } from '@shared/types';
import { Task } from './task.entity';
import { Asset } from './asset.entity';

@Entity('task_versions')
export class TaskVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  taskId: number;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar', length: 50 })
  stage: TaskStage;

  @Column({ type: 'text', nullable: true })
  metadataJson: string | null;

  @CreateDateColumn()
  createdAt: Date;

  // 关系
  @ManyToOne(() => Task, (task) => task.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: Task;

  @OneToMany(() => Asset, (asset) => asset.version)
  assets: Asset[];

  // 虚拟属性：metadata
  get metadata(): TaskVersionMetadata | undefined {
    return this.metadataJson ? JSON.parse(this.metadataJson) : undefined;
  }

  set metadata(value: TaskVersionMetadata | undefined) {
    this.metadataJson = value ? JSON.stringify(value) : null;
  }
}
