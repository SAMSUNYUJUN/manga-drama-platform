/**
 * Workflow node run entity
 * @module database/entities/workflow-node-run
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
import { NodeRunStatus, WorkflowNodeType } from '@shared/constants';
import { WorkflowRun } from './workflow-run.entity';

@Entity('workflow_node_runs')
export class NodeRun {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  workflowRunId: number;

  @Column({ type: 'varchar', length: 64 })
  nodeId: string;

  @Column({ type: 'varchar', length: 50 })
  nodeType: WorkflowNodeType;

  @Column({ type: 'varchar', length: 20 })
  status: NodeRunStatus;

  @Column({ type: 'text', nullable: true })
  inputJson?: string | null;

  @Column({ type: 'text', nullable: true })
  outputJson?: string | null;

  @Column({ type: 'text', nullable: true })
  error?: string | null;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'datetime', nullable: true })
  startedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  endedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => WorkflowRun, (run) => run.nodeRuns, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflowRunId' })
  workflowRun: WorkflowRun;

  get input(): Record<string, any> | undefined {
    return this.inputJson ? JSON.parse(this.inputJson) : undefined;
  }

  set input(value: Record<string, any> | undefined) {
    this.inputJson = value ? JSON.stringify(value) : null;
  }

  get output(): Record<string, any> | undefined {
    return this.outputJson ? JSON.parse(this.outputJson) : undefined;
  }

  set output(value: Record<string, any> | undefined) {
    this.outputJson = value ? JSON.stringify(value) : null;
  }
}
