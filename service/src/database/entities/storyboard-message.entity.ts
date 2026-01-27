/**
 * Storyboard message entity
 * @module database/entities/storyboard-message
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { StoryboardShot } from './storyboard-shot.entity';

@Entity('storyboard_messages')
export class StoryboardMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  shotId: number;

  @Column({ type: 'varchar', length: 120 })
  model: string;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ type: 'text', nullable: true })
  inputImagesJson?: string | null;

  @Column({ type: 'text', nullable: true })
  mediaUrlsJson?: string | null;

  @Column({ type: 'varchar', length: 20, default: 'completed' })
  status: 'completed' | 'failed' | 'running';

  @Column({ type: 'int', nullable: true })
  durationMs?: number | null;

  @Column({ type: 'text', nullable: true })
  error?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => StoryboardShot, (shot) => shot.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shotId' })
  shot: StoryboardShot;
}
