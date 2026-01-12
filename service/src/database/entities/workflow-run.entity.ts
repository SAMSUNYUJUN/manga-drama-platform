/**
 * Workflow run entity
 * @module database/entities/workflow-run
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { WorkflowRunStatus } from '@shared/constants';
import { WorkflowTemplateVersion } from './workflow-template-version.entity';
import { Task } from './task.entity';
import { TaskVersion } from './task-version.entity';
import { NodeRun } from './workflow-node-run.entity';

@Entity('workflow_runs')
export class WorkflowRun {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  templateVersionId: number;

  @Column({ type: 'int' })
  taskId: number;

  @Column({ type: 'int' })
  taskVersionId: number;

  @Column({ type: 'varchar', length: 20 })
  status: WorkflowRunStatus;

  @Column({ type: 'varchar', length: 64, nullable: true })
  currentNodeId?: string | null;

  @Column({ type: 'text', nullable: true })
  error?: string | null;

  @Column({ type: 'text', nullable: true })
  inputJson?: string | null;

  @Column({ type: 'text', nullable: true })
  outputJson?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => WorkflowTemplateVersion, (version) => version.runs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'templateVersionId' })
  templateVersion: WorkflowTemplateVersion;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: Task;

  @ManyToOne(() => TaskVersion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskVersionId' })
  taskVersion: TaskVersion;

  @OneToMany(() => NodeRun, (nodeRun) => nodeRun.workflowRun)
  nodeRuns: NodeRun[];

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
