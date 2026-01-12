/**
 * Trash asset entity
 * @module database/entities/trash-asset
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Asset } from './asset.entity';

@Entity('trash_assets')
export class TrashAsset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  assetId?: number | null;

  @Column({ type: 'int', nullable: true })
  originRunId?: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  originNodeId?: string | null;

  @Column({ type: 'text', nullable: true })
  metadataJson?: string | null;

  @Column({ type: 'datetime' })
  expireAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Asset, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assetId' })
  asset?: Asset;

  get metadata(): Record<string, any> | undefined {
    return this.metadataJson ? JSON.parse(this.metadataJson) : undefined;
  }

  set metadata(value: Record<string, any> | undefined) {
    this.metadataJson = value ? JSON.stringify(value) : null;
  }
}
