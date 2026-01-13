/**
 * Workflow template entity
 * @module database/entities/workflow-template
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { WorkflowTemplateVersion } from './workflow-template-version.entity';
import { AssetSpace } from './asset-space.entity';

@Entity('workflow_templates')
export class WorkflowTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'int', nullable: true })
  spaceId?: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => WorkflowTemplateVersion, (version) => version.template)
  versions: WorkflowTemplateVersion[];

  @ManyToOne(() => AssetSpace, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'spaceId' })
  space?: AssetSpace;
}
