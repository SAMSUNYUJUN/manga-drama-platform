/**
 * Storyboard shot entity
 * @module database/entities/storyboard-shot
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { StoryboardMessage } from './storyboard-message.entity';

@Entity('storyboard_shots')
export class StoryboardShot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'int' })
  spaceId: number;

  @Column({ type: 'int' })
  userId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => StoryboardMessage, (msg) => msg.shot, { cascade: true })
  messages: StoryboardMessage[];
}
