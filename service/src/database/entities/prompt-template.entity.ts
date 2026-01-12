/**
 * Prompt template entity
 * @module database/entities/prompt-template
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { PromptTemplateVersion } from './prompt-template-version.entity';

@Entity('prompt_templates')
export class PromptTemplate {
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

  @OneToMany(() => PromptTemplateVersion, (version) => version.template)
  versions: PromptTemplateVersion[];
}
