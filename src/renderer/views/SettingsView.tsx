import React, { useEffect, useState } from 'react';
import type { AppConfig, RetentionMode, ScheduleMode, SchedulerStatus } from '../../shared/types';

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

  useEffect(() => {
    window.api.getSchedulerStatus().then(setSchedulerStatus).catch(() => {});
  }, []);

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

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>WoW</h2>
        <div className="field">
          <label>Install root (contains _retail_, _classic_, …)</label>
          <div className="row">
            <input
              type="text"
              className="grow"
              value={draft.wowInstallRoot}
              onChange={(e) =>
                setDraft({ ...draft, wowInstallRoot: e.target.value })
              }
            />
            <button onClick={() => pick('wowInstallRoot')}>Browse…</button>
          </div>
        </div>

        <div className="field">
          <label>Local backup folder</label>
          <div className="row">
            <input
              type="text"
              className="grow"
              value={draft.localBackupDir}
              onChange={(e) =>
                setDraft({ ...draft, localBackupDir: e.target.value })
              }
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
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>SMB share</h2>
        <p className="muted">
          The app uses your OS’s native SMB client to mount the share. On macOS
          this is <code>mount_smbfs</code>; on Windows it uses{' '}
          <code>net use</code>; on Linux it uses <code>mount -t cifs</code>{' '}
          (cifs-utils required). Credentials are stored in{' '}
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
                setDraft({
                  ...draft,
                  smb: { ...draft.smb, share: e.target.value }
                })
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
                navigator.platform.startsWith('Win')
                  ? 'Z:'
                  : '/Volumes/wowbackups'
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
        </div>

        <div className="checkbox-row">
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
            Auto-upload new backups to the mounted share after backup completes
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
            <span
              className={`status ${testResult.startsWith('Mounted') ? 'ok' : 'bad'}`}
            >
              {testResult}
            </span>
          )}
        </div>
      </div>

      <div className="row">
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        <button onClick={() => setDraft(config)} disabled={saving}>
          Reset
        </button>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Scheduled backups</h2>
        <p className="muted">
          Automatically run backups on a schedule while the app is open.
          Use the same flavors selected in the Backup tab.
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
                      {h === 1 ? 'Every hour' : h === 24 ? 'Every 24 hours (midnight)' : `Every ${h} hours`}
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
                <label>Cron expression (5-field, e.g. <code>0 */6 * * *</code>)</label>
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
                <div className="muted" style={{ fontSize: '0.85em', lineHeight: 1.6 }}>
                  <div>
                    Active:{' '}
                    <span className={schedulerStatus.running ? 'status ok' : 'status bad'}>
                      {schedulerStatus.running ? 'running' : 'stopped'}
                    </span>
                  </div>
                  {schedulerStatus.lastRunIso && (
                    <div>Last run: {new Date(schedulerStatus.lastRunIso).toLocaleString()}</div>
                  )}
                  {schedulerStatus.nextRunIso && (
                    <div>Next run: {new Date(schedulerStatus.nextRunIso).toLocaleString()}</div>
                  )}
                  {!schedulerStatus.nextRunIso && schedulerStatus.running && draft.schedule.mode === 'custom' && (
                    <div>Next run: depends on cron expression</div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
