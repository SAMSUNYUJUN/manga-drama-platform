/**
 * Workflow template entity
 * @module database/entities/workflow-template
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { WorkflowTemplateVersion } from './workflow-template-version.entity';

@Entity('workflow_templates')
export class WorkflowTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => WorkflowTemplateVersion, (version) => version.template)
  versions: WorkflowTemplateVersion[];
}
