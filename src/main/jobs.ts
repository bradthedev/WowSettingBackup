/**
 * Centralized status registry for all periodic background jobs.
 *
 * Each job (scheduler, remote-sync poll, updater check, SMB auto-mount)
 * reports its last-run timestamp, outcome, and (where known) next-run
 * timestamp here. The renderer pulls a snapshot via the `jobs:getStatus`
 * IPC for display in Settings, and is also notified of changes via the
 * `jobs:updated` channel so the UI can refresh live.
 */

import { BrowserWindow } from 'electron';
import type { JobId, JobRunResult, JobStatus } from '../shared/types';

interface JobInternal extends JobStatus {}

const JOB_LABELS: Record<JobId, string> = {
  'scheduler': 'Scheduled backup',
  'sync-poll': 'Remote sync poll',
  'updater-check': 'Update check',
  'auto-mount': 'SMB auto-mount'
};

const jobs = new Map<JobId, JobInternal>();

function init(id: JobId): JobInternal {
  let j = jobs.get(id);
  if (!j) {
    j = { id, label: JOB_LABELS[id], enabled: false };
    jobs.set(id, j);
  }
  return j;
}

function broadcast(): void {
  const snapshot = listJobs();
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('jobs:updated', snapshot);
  }
}

/** Mark a job as enabled/disabled (whether its timer is currently active). */
export function setJobEnabled(id: JobId, enabled: boolean): void {
  const j = init(id);
  j.enabled = enabled;
  broadcast();
}

/** Update the next-run estimate for a job (e.g. cron next-fire time). */
export function setJobNextRun(id: JobId, nextRunIso: string | null): void {
  const j = init(id);
  j.nextRunIso = nextRunIso ?? undefined;
  broadcast();
}

/** Record a completed run with its outcome and an optional human-readable detail. */
export function recordJobRun(
  id: JobId,
  result: JobRunResult,
  message?: string
): void {
  const j = init(id);
  j.lastRunIso = new Date().toISOString();
  j.lastResult = result;
  j.lastMessage = message;
  broadcast();
}

/** Returns a snapshot of all known jobs. */
export function listJobs(): JobStatus[] {
  // Always return a stable, predictable order for the UI.
  const order: JobId[] = ['scheduler', 'sync-poll', 'updater-check', 'auto-mount'];
  return order.map((id) => ({ ...init(id) }));
}
