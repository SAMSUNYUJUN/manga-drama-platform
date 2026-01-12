/**
 * Prompt template version entity
 * @module database/entities/prompt-template-version
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PromptTemplate } from './prompt-template.entity';

@Entity('prompt_template_versions')
export class PromptTemplateVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  templateId: number;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  name?: string | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text' })
  variablesJson: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => PromptTemplate, (template) => template.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'templateId' })
  template: PromptTemplate;

  get variables(): string[] {
    return this.variablesJson ? JSON.parse(this.variablesJson) : [];
  }

  set variables(value: string[]) {
    this.variablesJson = JSON.stringify(value || []);
  }
}
