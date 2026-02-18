export interface FileWithPreview extends File {
  preview: string;
}

export interface ProcessingResult {
  phase1: string;
  phase2: string;
  phase3: string;
  phase4: string;
}

export enum ProcessingState {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}