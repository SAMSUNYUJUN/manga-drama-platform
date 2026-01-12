/**
 * Trash cleanup scheduler
 * @module asset/trash-cleanup
 */

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TrashService } from './trash.service';

@Injectable()
export class TrashCleanupService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly trashService: TrashService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.trashService.cleanupExpiredTrash().catch(() => null);
    }, 10 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}
