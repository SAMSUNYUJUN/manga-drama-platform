/**
 * 资产实体
 * @module database/entities/asset
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AssetStatus, AssetType } from '@shared/constants';
import { AssetMetadata } from '@shared/types';
import { Task } from './task.entity';
import { TaskVersion } from './task-version.entity';
import { AssetSpace } from './asset-space.entity';

@Entity('assets')
export class Asset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  taskId?: number | null;

  @Column({ type: 'int', nullable: true })
  spaceId?: number | null;

  @Column({ type: 'int', nullable: true })
  versionId?: number | null;

  @Column({ type: 'varchar', length: 50 })
  type: AssetType;

  @Column({ type: 'varchar', length: 20, default: AssetStatus.ACTIVE })
  status: AssetStatus;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ type: 'int', nullable: true })
  filesize: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mimeType: string;

  @Column({ type: 'text', nullable: true })
  metadataJson: string | null;

  @Column({ type: 'int', nullable: true })
  replacedById: number | null;

  @Column({ type: 'datetime', nullable: true })
  trashedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // 关系
  @ManyToOne(() => Task, (task) => task.assets, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'taskId' })
  task?: Task;

  @ManyToOne(() => AssetSpace, (space) => space.assets, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'spaceId' })
  space?: AssetSpace;

  @ManyToOne(() => TaskVersion, (version) => version.assets, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'versionId' })
  version: TaskVersion;

  // 虚拟属性：metadata
  get metadata(): AssetMetadata | undefined {
    return this.metadataJson ? JSON.parse(this.metadataJson) : undefined;
  }

  set metadata(value: AssetMetadata | undefined) {
    this.metadataJson = value ? JSON.stringify(value) : null;
  }
}
