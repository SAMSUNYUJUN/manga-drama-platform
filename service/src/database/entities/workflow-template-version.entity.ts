/**
 * Workflow template version entity
 * @module database/entities/workflow-template-version
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { WorkflowTemplate } from './workflow-template.entity';
import { WorkflowRun } from './workflow-run.entity';

@Entity('workflow_template_versions')
export class WorkflowTemplateVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  templateId: number;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'text' })
  nodesJson: string;

  @Column({ type: 'text' })
  edgesJson: string;

  @Column({ type: 'text', nullable: true })
  metadataJson?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => WorkflowTemplate, (template) => template.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'templateId' })
  template: WorkflowTemplate;

  @OneToMany(() => WorkflowRun, (run) => run.templateVersion)
  runs: WorkflowRun[];

  get nodes(): any[] {
    return this.nodesJson ? JSON.parse(this.nodesJson) : [];
  }

  set nodes(value: any[]) {
    this.nodesJson = JSON.stringify(value || []);
  }

  get edges(): any[] {
    return this.edgesJson ? JSON.parse(this.edgesJson) : [];
  }

  set edges(value: any[]) {
    this.edgesJson = JSON.stringify(value || []);
  }

  get metadata(): Record<string, any> | undefined {
    return this.metadataJson ? JSON.parse(this.metadataJson) : undefined;
  }

  set metadata(value: Record<string, any> | undefined) {
    this.metadataJson = value ? JSON.stringify(value) : null;
  }
}
