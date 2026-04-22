import { BrowserWindow } from 'electron';
import type { ProgressEvent } from '../shared/types';

export function emitProgress(e: ProgressEvent): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('progress', e);
  }
}

export function newProgressId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
