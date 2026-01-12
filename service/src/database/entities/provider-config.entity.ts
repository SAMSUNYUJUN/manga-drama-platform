/**
 * Provider config entity
 * @module database/entities/provider-config
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ProviderType } from '@shared/constants';

@Entity('provider_configs')
export class ProviderConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  type: ProviderType;

  @Column({ type: 'varchar', length: 500 })
  baseUrl: string;

  @Column({ type: 'text' })
  apiKey: string;

  @Column({ type: 'int', nullable: true })
  timeoutMs?: number | null;

  @Column({ type: 'int', nullable: true })
  retryCount?: number | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'text' })
  modelsJson: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get models(): string[] {
    return this.modelsJson ? JSON.parse(this.modelsJson) : [];
  }

  set models(value: string[]) {
    this.modelsJson = JSON.stringify(value || []);
  }
}
