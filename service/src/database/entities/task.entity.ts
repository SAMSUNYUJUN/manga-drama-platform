/**
 * 任务实体
 * @module database/entities/task
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
} from 'typeorm';
import { TaskStatus, TaskStage } from '@shared/constants';
import { User } from './user.entity';
import { TaskVersion } from './task-version.entity';
import { Asset } from './asset.entity';

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 20, default: TaskStatus.PENDING })
  status: TaskStatus;

  @Column({ type: 'varchar', length: 50, nullable: true })
  stage: TaskStage;

  @Column({ type: 'int', nullable: true })
  currentVersionId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
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
