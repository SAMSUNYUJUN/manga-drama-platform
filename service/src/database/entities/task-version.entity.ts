/**
 * 任务版本实体
 * @module database/entities
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Task, TaskStage } from './task.entity';
import { Asset } from './asset.entity';

@Entity('task_versions')
@Index(['taskId', 'version'], { unique: true })
export class TaskVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  @Index()
  taskId: number;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar', length: 50 })
  stage: TaskStage;

  @Column({ type: 'text', nullable: true })
  metadata: string; // JSON string

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  // 关系
  @ManyToOne(() => Task, (task) => task.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: Task;

  @OneToMany(() => Asset, (asset) => asset.version)
  assets: Asset[];
}
