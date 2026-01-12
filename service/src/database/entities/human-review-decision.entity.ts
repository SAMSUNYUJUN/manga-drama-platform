/**
 * Human review decision entity
 * @module database/entities/human-review-decision
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { HumanReviewDecision } from '@shared/constants';
import { NodeRun } from './workflow-node-run.entity';
import { User } from './user.entity';
import { Asset } from './asset.entity';

@Entity('human_review_decisions')
export class HumanReviewDecisionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  nodeRunId: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'int' })
  assetId: number;

  @Column({ type: 'varchar', length: 20 })
  decision: HumanReviewDecision;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => NodeRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nodeRunId' })
  nodeRun: NodeRun;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Asset, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assetId' })
  asset: Asset;
}
