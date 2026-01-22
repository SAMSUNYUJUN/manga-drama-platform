import { Injectable } from '@nestjs/common';

export interface ProgressState {
  jobId: string;
  taskId?: string;
  status: string;
  progress?: number;
  updatedAt: number;
  error?: string;
}

@Injectable()
export class ProgressTrackerService {
  private readonly states = new Map<string, ProgressState>();

  set(state: ProgressState) {
    const next: ProgressState = {
      ...state,
      updatedAt: Date.now(),
    };
    this.states.set(state.jobId, next);
  }

  get(jobId: string): ProgressState | undefined {
    return this.states.get(jobId);
  }

  clear(jobId: string) {
    this.states.delete(jobId);
  }
}
