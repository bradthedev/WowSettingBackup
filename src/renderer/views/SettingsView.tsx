import React, { useEffect, useState } from 'react';
import type {
  AppConfig,
  RetentionMode,
  ScheduleMode,
  SchedulerStatus,
  ThemePreference
} from '../../shared/types';

type SectionId = 'wow' | 'storage' | 'share' | 'sync' | 'schedule' | 'appearance';

function Section({
  id,
  title,
  open,
  onToggle,
  children
}: {
  id: SectionId;
  title: string;
  open: boolean;
  onToggle: (id: SectionId) => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="card">
      <button
        className="collapse-header"
        aria-expanded={open}
        onClick={() => onToggle(id)}
      >
        <h2>{title}</h2>
        <span className="collapse-header__chevron">›</span>
      </button>
      {open && <div style={{ paddingTop: 6 }}>{children}</div>}
    </div>
  );
}

export function SettingsView({
  config,
  onConfigChange
}: {
  config: AppConfig;
  onConfigChange: () => Promise<void>;
}): JSX.Element {
  const [draft, setDraft] = useState<AppConfig>(config);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [open, setOpen] = useState<Record<SectionId, boolean>>({
    wow: true,
    storage: true,
    share: false,
    sync: false,
    schedule: false,
    appearance: false
  });

  function toggleSection(id: SectionId): void {
    setOpen((o) => ({ ...o, [id]: !o[id] }));
  }

  useEffect(() => {
    window.api.getSchedulerStatus().then(setSchedulerStatus).catch(() => {});
    const t = setInterval(() => {
      window.api.getSchedulerStatus().then(setSchedulerStatus).catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, []);

  // Sync in coming config prop (e.g. after external theme change) so draft matches.
  useEffect(() => {
    setDraft(config);
  }, [config]);

  function refreshSchedulerStatus(): void {
    window.api.getSchedulerStatus().then(setSchedulerStatus).catch(() => {});
  }

  async function pick(
    key: 'wowInstallRoot' | 'localBackupDir' | 'mountPoint'
  ): Promise<void> {
    const dir = await window.api.pickDirectory();
    if (!dir) return;
    if (key === 'mountPoint') {
      setDraft({ ...draft, smb: { ...draft.smb, mountPoint: dir } });
    } else {
      setDraft({ ...draft, [key]: dir });
    }
  }

  async function save(): Promise<void> {
    setSaving(true);
    try {
      await window.api.setConfig(draft);
      await onConfigChange();
      refreshSchedulerStatus();
    } finally {
      setSaving(false);
    }
  }

  async function testMount(): Promise<void> {
    setTesting(true);
    setTestResult(null);
    try {
      await window.api.setConfig(draft);
      await onConfigChange();
      const res = await window.api.smbMount();
      setTestResult(
        res.mounted
          ? `Mounted at ${res.mountPath}`
          : `Failed: ${res.message ?? 'unknown error'}`
      );
    } catch (err) {
      setTestResult(`Failed: ${(err as Error).message}`);
    } finally {
      setTesting(false);
    }
  }

  async function setThemePref(pref: ThemePreference): Promise<void> {
    setDraft({ ...draft, theme: pref });
    // Apply immediately for snappy feedback; user can still hit Save for others.
    await window.api.setConfig({ theme: pref });
    await onConfigChange();
  }

  return (
    <>
      <Section id="wow" title="WoW install" open={open.wow} onToggle={toggleSection}>
        <div className="field">
          <label>Install root (contains _retail_, _classic_, …)</label>
          <div className="row">
            <input
              type="text"
              className="grow"
              value={draft.wowInstallRoot}
              onChange={(e) => setDraft({ ...draft, wowInstallRoot: e.target.value })}
            />
            <button onClick={() => pick('wowInstallRoot')}>Browse…</button>
          </div>
        </div>
      </Section>

      <Section
        id="storage"
        title="Local storage & retention"
        open={open.storage}
        onToggle={toggleSection}
      >
        <div className="field">
          <label>Local backup folder</label>
          <div className="row">
            <input
              type="text"
              className="grow"
              value={draft.localBackupDir}
              onChange={(e) => setDraft({ ...draft, localBackupDir: e.target.value })}
            />
            <button onClick={() => pick('localBackupDir')}>Browse…</button>
          </div>
        </div>

        <div className="field">
          <label>Retention strategy</label>
          <select
            value={draft.retentionMode ?? 'time-machine'}
            onChange={(e) =>
              setDraft({ ...draft, retentionMode: e.target.value as RetentionMode })
            }
          >
            <option value="time-machine">Time Machine (recommended)</option>
            <option value="count">Keep N most recent</option>
          </select>
        </div>

        {(draft.retentionMode ?? 'time-machine') === 'time-machine' ? (
          <p className="muted" style={{ marginTop: 0 }}>
            Keeps every backup from the last 7 days, one per week for the past
            month, one per month for the past year, and one per year beyond that.
          </p>
        ) : (
          <div className="field">
            <label>Backups to keep per flavor</label>
            <input
              type="number"
              min={1}
              max={999}
              value={draft.retentionCount}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  retentionCount: Math.max(1, Number(e.target.value) || 1)
                })
              }
            />
          </div>
        )}
      </Section>

      <Section
        id="share"
        title="SMB share"
        open={open.share}
        onToggle={toggleSection}
      >
        <p className="muted" style={{ marginTop: 0 }}>
          The app uses your OS's native SMB client. On macOS this is{' '}
          <code>mount_smbfs</code>; on Windows <code>net use</code>; on Linux{' '}
          <code>mount -t cifs</code>. Credentials are stored in{' '}
          <code>config.json</code> in your user-data folder.
        </p>

        <div className="row">
          <div className="field grow">
            <label>Host</label>
            <input
              type="text"
              placeholder="fileserver.local or 192.168.1.50"
              value={draft.smb.host}
              onChange={(e) =>
                setDraft({ ...draft, smb: { ...draft.smb, host: e.target.value } })
              }
            />
          </div>
          <div className="field grow">
            <label>Share name</label>
            <input
              type="text"
              placeholder="wowbackups"
              value={draft.smb.share}
              onChange={(e) =>
                setDraft({ ...draft, smb: { ...draft.smb, share: e.target.value } })
              }
            />
          </div>
        </div>

        <div className="row">
          <div className="field grow">
            <label>Username (optional)</label>
            <input
              type="text"
              value={draft.smb.username ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  smb: { ...draft.smb, username: e.target.value }
                })
              }
            />
          </div>
          <div className="field grow">
            <label>Password (optional)</label>
            <input
              type="password"
              value={draft.smb.password ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  smb: { ...draft.smb, password: e.target.value }
                })
              }
            />
          </div>
        </div>

        <div className="field">
          <label>Mount point</label>
          <div className="row">
            <input
              type="text"
              className="grow"
              placeholder={
                navigator.platform.startsWith('Win') ? 'Z:' : '/Volumes/wowbackups'
              }
              value={draft.smb.mountPoint ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  smb: { ...draft.smb, mountPoint: e.target.value }
                })
              }
            />
            <button onClick={() => pick('mountPoint')}>Browse…</button>
          </div>
        </div>

        <div className="checkbox-row">
          <label>
            <input
              type="checkbox"
              checked={draft.smb.autoMountOnLaunch}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  smb: { ...draft.smb, autoMountOnLaunch: e.target.checked }
                })
              }
            />
            Auto-mount share when the app starts
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.smb.autoUploadAfterBackup}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  smb: { ...draft.smb, autoUploadAfterBackup: e.target.checked }
                })
              }
            />
            Auto-upload new backups after they complete
          </label>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button
            onClick={testMount}
            disabled={testing || !draft.smb.host || !draft.smb.share}
          >
            {testing ? 'Testing…' : 'Test connection (mount now)'}
          </button>
          {testResult && (
            <span className={`chip ${testResult.startsWith('Mounted') ? 'chip--ok' : 'chip--bad'}`}>
              {testResult}
            </span>
          )}
        </div>
      </Section>

      <Section
        id="sync"
        title="Cross-machine sync"
        open={open.sync}
        onToggle={toggleSection}
      >
        <div className="checkbox-row">
          <label>
            <input
              type="checkbox"
              checked={draft.autoSyncFromRemote ?? false}
              onChange={(e) =>
                setDraft({ ...draft, autoSyncFromRemote: e.target.checked })
              }
            />
            Check remote share for newer backups from other machines
          </label>
        </div>

        {draft.autoSyncFromRemote && (
          <>
            <div className="field" style={{ marginTop: 10 }}>
              <label>Check frequency</label>
              <select
                value={draft.syncIntervalMinutes ?? 240}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    syncIntervalMinutes: Number(e.target.value)
                  })
                }
              >
                <option value={5}>Every 5 minutes</option>
                <option value={15}>Every 15 minutes</option>
                <option value={30}>Every 30 minutes</option>
                <option value={60}>Every hour</option>
                <option value={120}>Every 2 hours</option>
                <option value={240}>Every 4 hours</option>
                <option value={720}>Every 12 hours</option>
                <option value={1440}>Once a day</option>
              </select>
            </div>

            <div className="checkbox-row">
              <label>
                <input
                  type="checkbox"
                  checked={draft.autoInstallSyncBackup ?? false}
                  onChange={(e) =>
                    setDraft({ ...draft, autoInstallSyncBackup: e.target.checked })
                  }
                />
                Automatically download and restore newer backups without prompting
              </label>
            </div>
          </>
        )}
      </Section>

      <Section
        id="schedule"
        title="Scheduled backups"
        open={open.schedule}
        onToggle={toggleSection}
      >
        <p className="muted" style={{ marginTop: 0 }}>
          Automatically run backups on a schedule while the app is open. Uses the
          same flavors selected on the Backup tab.
        </p>

        <div className="checkbox-row">
          <label>
            <input
              type="checkbox"
              checked={draft.schedule.enabled}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  schedule: { ...draft.schedule, enabled: e.target.checked }
                })
              }
            />
            Enable automatic scheduled backups
          </label>
        </div>

        {draft.schedule.enabled && (
          <>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Schedule mode</label>
              <select
                value={draft.schedule.mode}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    schedule: {
                      ...draft.schedule,
                      mode: e.target.value as ScheduleMode
                    }
                  })
                }
              >
                <option value="interval">Every N hours</option>
                <option value="daily">Daily at a specific time</option>
                <option value="custom">Custom cron expression</option>
              </select>
            </div>

            {draft.schedule.mode === 'interval' && (
              <div className="field">
                <label>Interval (hours)</label>
                <select
                  value={draft.schedule.intervalHours}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      schedule: {
                        ...draft.schedule,
                        intervalHours: Number(e.target.value)
                      }
                    })
                  }
                >
                  {[1, 2, 3, 4, 6, 8, 12, 24].map((h) => (
                    <option key={h} value={h}>
                      {h === 1
                        ? 'Every hour'
                        : h === 24
                          ? 'Every 24 hours (midnight)'
                          : `Every ${h} hours`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {draft.schedule.mode === 'daily' && (
              <div className="field">
                <label>Run at (24-hour HH:MM)</label>
                <input
                  type="time"
                  value={draft.schedule.dailyTime}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      schedule: { ...draft.schedule, dailyTime: e.target.value }
                    })
                  }
                />
              </div>
            )}

            {draft.schedule.mode === 'custom' && (
              <div className="field">
                <label>
                  Cron expression (5-field, e.g. <code>0 */6 * * *</code>)
                </label>
                <input
                  type="text"
                  className="grow"
                  placeholder="0 */6 * * *"
                  value={draft.schedule.cronExpression}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      schedule: {
                        ...draft.schedule,
                        cronExpression: e.target.value
                      }
                    })
                  }
                />
              </div>
            )}

            {schedulerStatus && (
              <div className="field" style={{ marginTop: 8 }}>
                <label>Scheduler status</label>
                <div className="row" style={{ gap: 8 }}>
                  <span className={`chip ${schedulerStatus.running ? 'chip--ok' : 'chip--bad'}`}>
                    {schedulerStatus.running ? 'running' : 'stopped'}
                  </span>
                  {schedulerStatus.cronExpression && (
                    <span className="chip chip--muted">
                      cron <code>{schedulerStatus.cronExpression}</code>
                    </span>
                  )}
                </div>
                <div
                  className="muted"
                  style={{ fontSize: '0.85em', lineHeight: 1.6, marginTop: 8 }}
                >
                  {schedulerStatus.lastRunIso && (
                    <div>
                      Last run: {new Date(schedulerStatus.lastRunIso).toLocaleString()}
                    </div>
                  )}
                  {schedulerStatus.nextRunIso && (
                    <div>
                      Next run: {new Date(schedulerStatus.nextRunIso).toLocaleString()}
                    </div>
                  )}
                  {!schedulerStatus.nextRunIso &&
                    schedulerStatus.running &&
                    draft.schedule.mode === 'custom' && (
                      <div>Next run: depends on cron expression</div>
                    )}
                </div>
                {schedulerStatus.lastError && (
                  <div className="chip chip--bad" style={{ marginTop: 6 }}>
                    Last error
                    {schedulerStatus.lastErrorIso
                      ? ` (${new Date(schedulerStatus.lastErrorIso).toLocaleString()})`
                      : ''}
                    : {schedulerStatus.lastError}
                  </div>
                )}
                <div className="row" style={{ marginTop: 8 }}>
                  <button
                    className="small"
                    onClick={async () => {
                      try {
                        await window.api.runScheduledBackupNow();
                      } finally {
                        refreshSchedulerStatus();
                      }
                    }}
                  >
                    Run scheduled backup now
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      <Section
        id="appearance"
        title="Appearance"
        open={open.appearance}
        onToggle={toggleSection}
      >
        <div className="field">
          <label>Theme</label>
          <div className="theme-toggle" role="group" aria-label="Theme preference">
            {(['light', 'system', 'dark'] as ThemePreference[]).map((p) => (
              <button
                key={p}
                aria-pressed={(draft.theme ?? 'system') === p}
                onClick={() => setThemePref(p)}
              >
                {p === 'light' ? 'Light' : p === 'dark' ? 'Dark' : 'Auto'}
              </button>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            "Auto" follows your operating system. Theme changes apply instantly and
            persist across restarts.
          </p>
        </div>
      </Section>

      <div className="row" style={{ marginTop: 4 }}>
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        <button onClick={() => setDraft(config)} disabled={saving}>
          Reset
        </button>
      </div>
    </>
  );
}
