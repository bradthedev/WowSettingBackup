import React, { useState } from 'react';
import type { AppConfig } from '../../shared/types';

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
          <label>Retention (backups kept per flavor)</label>
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
    </>
  );
}
