import { app } from 'electron';
import cron, { ScheduledTask } from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config';
import { runBackup } from './backup';
import { mountShare, mountStatus } from './smb';
import { uploadBackup } from './remote';
import { emitProgress } from './progress';
import type { ScheduleConfig, SchedulerStatus } from '../shared/types';

// ---------------------------------------------------------------------------
// Persistent state
// ---------------------------------------------------------------------------

interface SchedulerState {
  lastRunIso: string | null;
}

function stateFilePath(): string {
  return path.join(app.getPath('userData'), 'scheduler-state.json');
}

function loadState(): SchedulerState {
  try {
    const raw = fs.readFileSync(stateFilePath(), 'utf-8');
    return JSON.parse(raw) as SchedulerState;
  } catch {
    return { lastRunIso: null };
  }
}

function saveState(state: SchedulerState): void {
  try {
    fs.writeFileSync(stateFilePath(), JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('[scheduler] Failed to save state:', err);
  }
}

// ---------------------------------------------------------------------------
// In-memory runtime state
// ---------------------------------------------------------------------------

let task: ScheduledTask | null = null;
let lastRunIso: string | null = null;
let nextRunIso: string | null = null;
let currentCron: string | null = null;
let lastError: string | null = null;
let lastErrorIso: string | null = null;

// ---------------------------------------------------------------------------
// Cron expression helpers
// ---------------------------------------------------------------------------

/**
 * Convert the user-facing schedule config into a standard 5-field cron expression.
 * Returns null if the config produces an invalid expression.
 */
export function scheduleToCron(schedule: ScheduleConfig): string | null {
  switch (schedule.mode) {
    case 'interval': {
      const h = Math.round(schedule.intervalHours);
      if (h < 1 || h > 24) return null;
      if (h === 24) return '0 0 * * *';
      return `0 */${h} * * *`;
    }
    case 'daily': {
      const parts = schedule.dailyTime.split(':');
      const hh = parseInt(parts[0], 10);
      const mm = parseInt(parts[1], 10);
      if (
        !Number.isFinite(hh) || hh < 0 || hh > 23 ||
        !Number.isFinite(mm) || mm < 0 || mm > 59
      ) return null;
      return `${mm} ${hh} * * *`;
    }
    case 'custom':
      return schedule.cronExpression.trim() || null;
  }
}

/**
 * Returns the expected minimum interval (ms) between scheduled runs.
 * Used to decide whether a catch-up backup is overdue.
 */
function expectedIntervalMs(schedule: ScheduleConfig): number | null {
  switch (schedule.mode) {
    case 'interval': return schedule.intervalHours * 3600 * 1000;
    case 'daily':    return 24 * 3600 * 1000;
    case 'custom':   return null; // can't determine without cron-parser
  }
}

// ---------------------------------------------------------------------------
// Backup execution (shared by cron task and catch-up)
// ---------------------------------------------------------------------------

async function runScheduledBackup(): Promise<void> {
  const runStart = new Date();
  lastRunIso = runStart.toISOString();
  saveState({ lastRunIso });

  const freshCfg = loadConfig();
  // After the run, pull the next-run estimate directly from the task if we have one.
  refreshNextRun();

  console.log('[scheduler] Running scheduled backup...');
  const progressId = `scheduled-${runStart.getTime()}`;
  emitProgress({
    id: progressId,
    phase: 'start',
    label: 'Scheduled backup starting'
  });

  try {
    const result = await runBackup(freshCfg.enabledFlavors);

    if (freshCfg.smb.autoUploadAfterBackup && result.created.length > 0) {
      const status = await mountStatus();
      const mount = status.mounted ? status : await mountShare();
      if (mount.mounted) {
        for (const backup of result.created) {
          await uploadBackup(backup.path).catch((err: Error) =>
            result.errors.push({
              flavor: backup.flavor,
              message: `Auto-upload failed: ${err.message}`
            })
          );
        }
      } else {
        result.errors.push({
          flavor: 'unknown',
          message: `Auto-upload skipped: ${mount.message ?? 'share not mounted'}`
        });
      }
    }

    if (result.errors.length > 0) {
      const summary = result.errors
        .map((e) => `${e.flavor}: ${e.message}`)
        .join('; ');
      lastError = summary;
      lastErrorIso = new Date().toISOString();
      console.warn('[scheduler] Completed with errors:', result.errors);
      emitProgress({
        id: progressId,
        phase: 'error',
        label: 'Scheduled backup completed with errors',
        message: summary
      });
    } else {
      lastError = null;
      lastErrorIso = null;
      console.log(`[scheduler] Done (${result.created.length} backup(s) created).`);
      emitProgress({
        id: progressId,
        phase: 'done',
        label: `Scheduled backup complete — ${result.created.length} file(s)`,
        ratio: 1
      });
    }
  } catch (err) {
    const msg = (err as Error).message;
    lastError = msg;
    lastErrorIso = new Date().toISOString();
    console.error('[scheduler] Backup failed:', err);
    emitProgress({
      id: progressId,
      phase: 'error',
      label: 'Scheduled backup failed',
      message: msg
    });
  } finally {
    refreshNextRun();
  }
}

function refreshNextRun(): void {
  if (!task) {
    nextRunIso = null;
    return;
  }
  try {
    const next = task.getNextRun();
    nextRunIso = next ? next.toISOString() : null;
  } catch {
    nextRunIso = null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Start (or restart) the scheduler using the current config. */
export function startScheduler(): void {
  stopScheduler();

  const cfg = loadConfig();
  if (!cfg.schedule.enabled) return;

  const expr = scheduleToCron(cfg.schedule);
  if (!expr || !cron.validate(expr)) {
    const msg = `Invalid cron expression: ${expr ?? '(none)'}`;
    console.error('[scheduler]', msg);
    lastError = msg;
    lastErrorIso = new Date().toISOString();
    return;
  }

  // Restore persisted state so lastRunIso survives app restarts
  const state = loadState();
  lastRunIso = state.lastRunIso;
  currentCron = expr;

  console.log(`[scheduler] Starting schedule (${cfg.schedule.mode}): "${expr}"`);

  task = cron.schedule(
    expr,
    async () => {
      await runScheduledBackup().catch(console.error);
    },
    { name: 'wow-scheduled-backup' }
  );

  // node-cron v4 requires explicit start() — the constructor does NOT auto-start.
  try {
    const maybePromise = task.start();
    if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
      (maybePromise as Promise<void>).catch((err) =>
        console.error('[scheduler] start() rejected:', err)
      );
    }
  } catch (err) {
    console.error('[scheduler] Failed to start task:', err);
    lastError = (err as Error).message;
    lastErrorIso = new Date().toISOString();
    task = null;
    return;
  }

  refreshNextRun();
  console.log(
    `[scheduler] Started. Next run: ${nextRunIso ?? 'unknown'}`
  );

  // ---------- Catch-up: run immediately if a backup was missed ----------
  const interval = expectedIntervalMs(cfg.schedule);
  if (interval !== null && lastRunIso !== null) {
    const elapsed = Date.now() - new Date(lastRunIso).getTime();
    if (elapsed > interval) {
      console.log(
        `[scheduler] Backup overdue by ${Math.round((elapsed - interval) / 60_000)} min — running catch-up.`
      );
      // Small delay so the app window and renderer are ready before progress events fire
      setTimeout(() => runScheduledBackup().catch(console.error), 3000);
    }
  } else if (interval !== null && lastRunIso === null) {
    // First-ever run with the scheduler enabled — kick off immediately
    console.log('[scheduler] No previous run found — running initial backup.');
    setTimeout(() => runScheduledBackup().catch(console.error), 3000);
  }
}

/** Stop the active scheduler, if any. */
export function stopScheduler(): void {
  if (task) {
    try {
      const maybePromise = task.stop();
      if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
        (maybePromise as Promise<void>).catch(() => {});
      }
    } catch (err) {
      console.error('[scheduler] Error stopping task:', err);
    }
    task = null;
    nextRunIso = null;
    currentCron = null;
    console.log('[scheduler] Stopped.');
  }
}

/**
 * Apply an updated config to the scheduler.
 * Starts, stops, or restarts as required.
 */
export function updateScheduler(): void {
  const cfg = loadConfig();
  if (!cfg.schedule.enabled) {
    stopScheduler();
    return;
  }
  startScheduler();
}

/** Run a scheduled backup immediately, outside of the cron schedule. */
export async function runScheduledBackupNow(): Promise<void> {
  await runScheduledBackup();
}

/** Returns the current scheduler status for display in the UI. */
export function getSchedulerStatus(): SchedulerStatus {
  return {
    running: task !== null,
    lastRunIso: lastRunIso ?? undefined,
    nextRunIso: nextRunIso ?? undefined,
    cronExpression: currentCron ?? undefined,
    lastError: lastError ?? undefined,
    lastErrorIso: lastErrorIso ?? undefined
  };
}
