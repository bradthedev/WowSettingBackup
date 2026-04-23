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
 * Compute a best-effort ISO string for the next occurrence of a schedule,
 * starting from `from` (defaults to now).
 */
export function computeNextRun(
  schedule: ScheduleConfig,
  from: Date = new Date()
): string | undefined {
  switch (schedule.mode) {
    case 'interval': {
      const h = Math.round(schedule.intervalHours);
      if (h < 1 || h > 24) return undefined;
      const nowHour = from.getHours();
      const passedBlocks = Math.floor(nowHour / h);
      let nextHour = (passedBlocks + 1) * h;
      const next = new Date(from);
      next.setSeconds(0, 0);
      next.setMinutes(0);
      if (nextHour >= 24) {
        next.setDate(next.getDate() + 1);
        next.setHours(nextHour % 24);
      } else {
        next.setHours(nextHour);
      }
      return next.toISOString();
    }
    case 'daily': {
      const parts = schedule.dailyTime.split(':');
      const hh = parseInt(parts[0], 10);
      const mm = parseInt(parts[1], 10);
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return undefined;
      const next = new Date(from);
      next.setHours(hh, mm, 0, 0);
      if (next <= from) next.setDate(next.getDate() + 1);
      return next.toISOString();
    }
    case 'custom':
      return undefined; // Would need cron-parser to compute accurately
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
  nextRunIso = computeNextRun(freshCfg.schedule, runStart) ?? null;

  console.log('[scheduler] Running scheduled backup...');
  emitProgress({
    id: `scheduled-${runStart.getTime()}`,
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
            result.errors.push({ flavor: backup.flavor, message: `Auto-upload failed: ${err.message}` })
          );
        }
      }
    }

    if (result.errors.length > 0) {
      console.warn('[scheduler] Completed with errors:', result.errors);
    } else {
      console.log(`[scheduler] Done (${result.created.length} backup(s) created).`);
    }
  } catch (err) {
    console.error('[scheduler] Backup failed:', err);
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
    console.error('[scheduler] Invalid cron expression:', expr);
    return;
  }

  // Restore persisted state so lastRunIso survives app restarts
  const state = loadState();
  lastRunIso = state.lastRunIso;
  nextRunIso = computeNextRun(cfg.schedule) ?? null;

  console.log(
    `[scheduler] Starting schedule (${cfg.schedule.mode}): "${expr}" — next run: ${nextRunIso ?? 'unknown'}`
  );

  task = cron.schedule(expr, () => {
    runScheduledBackup().catch(console.error);
  });

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
    task.stop();
    task = null;
    nextRunIso = null;
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

/** Returns the current scheduler status for display in the UI. */
export function getSchedulerStatus(): SchedulerStatus {
  return {
    running: task !== null,
    lastRunIso: lastRunIso ?? undefined,
    nextRunIso: nextRunIso ?? undefined
  };
}
