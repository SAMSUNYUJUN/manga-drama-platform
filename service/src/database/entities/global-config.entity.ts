/**
 * Global config entity
 * @module database/entities/global-config
 */

import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('global_configs')
export class GlobalConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  defaultLlmProviderId?: number | null;

  @Column({ type: 'int', nullable: true })
  defaultImageProviderId?: number | null;

  @Column({ type: 'int', nullable: true })
  defaultVideoProviderId?: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  defaultLlmModel?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  defaultImageModel?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  defaultVideoModel?: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
