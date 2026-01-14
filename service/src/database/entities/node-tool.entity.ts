/**
 * Node tool entity
 * @module database/entities/node-tool
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import type { WorkflowVariable } from '@shared/types/workflow.types';

@Entity('node_tools')
export class NodeTool {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'int', nullable: true })
  promptTemplateVersionId?: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  model?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, default: '16:9' })
  imageAspectRatio?: string | null;

  @Column({ type: 'text' })
  inputsJson: string;

  @Column({ type: 'text' })
  outputsJson: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get inputs(): WorkflowVariable[] {
    return this.inputsJson ? JSON.parse(this.inputsJson) : [];
  }

  set inputs(value: WorkflowVariable[]) {
    this.inputsJson = JSON.stringify(value || []);
  }

  get outputs(): WorkflowVariable[] {
    return this.outputsJson ? JSON.parse(this.outputsJson) : [];
  }

  set outputs(value: WorkflowVariable[]) {
    this.outputsJson = JSON.stringify(value || []);
  }
}
