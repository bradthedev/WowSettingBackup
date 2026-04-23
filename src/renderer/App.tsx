import React, { useEffect, useState } from 'react';
import type { AppConfig, MountStatus, ProgressEvent } from '../shared/types';
import { BackupView } from './views/BackupView';
import { UploadView } from './views/UploadView';
import { DownloadView } from './views/DownloadView';
import { SettingsView } from './views/SettingsView';
import { ProgressPanel } from './components/ProgressPanel';

type Tab = 'backup' | 'upload' | 'download' | 'settings';

export function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('backup');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [mount, setMount] = useState<MountStatus>({ mounted: false });
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updateReady, setUpdateReady] = useState(false);

  async function refreshConfig(): Promise<void> {
    setConfig(await window.api.getConfig());
  }

  async function refreshMount(): Promise<void> {
    setMount(await window.api.smbStatus());
  }

  useEffect(() => {
    refreshConfig();
    refreshMount();
    const off = window.api.onProgress((e) => {
      setEvents((prev) => {
        const idx = prev.findIndex((p) => p.id === e.id);
        if (idx === -1) return [e, ...prev].slice(0, 8);
        const next = prev.slice();
        next[idx] = e;
        return next;
      });
    });
    const mountPoll = setInterval(refreshMount, 5000);

    const offAvailable = window.api.onUpdateAvailable((v) => {
      setUpdateVersion(v);
      setUpdateProgress(0);
    });
    const offProgress = window.api.onUpdateProgress((p) => setUpdateProgress(p));
    const offDownloaded = window.api.onUpdateDownloaded((v) => {
      setUpdateVersion(v);
      setUpdateProgress(null);
      setUpdateReady(true);
    });

    return () => {
      off();
      clearInterval(mountPoll);
      offAvailable();
      offProgress();
      offDownloaded();
    };
  }, []);

  if (!config) {
    return (
      <div style={{ padding: 32 }} className="muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>WoW Settings Backup</h1>
        <button
          className={`nav-btn ${tab === 'backup' ? 'active' : ''}`}
          onClick={() => setTab('backup')}
        >
          Backup
        </button>
        <button
          className={`nav-btn ${tab === 'upload' ? 'active' : ''}`}
          onClick={() => setTab('upload')}
        >
          Upload
        </button>
        <button
          className={`nav-btn ${tab === 'download' ? 'active' : ''}`}
          onClick={() => setTab('download')}
        >
          Download / Restore
        </button>
        <button
          className={`nav-btn ${tab === 'settings' ? 'active' : ''}`}
          onClick={() => setTab('settings')}
        >
          Settings
        </button>

        <div style={{ marginTop: 'auto' }}>
          <div className="muted" style={{ marginBottom: 4 }}>
            Remote share
          </div>
          <span className={`status ${mount.mounted ? 'ok' : 'bad'}`}>
            {mount.mounted ? 'Mounted' : 'Not mounted'}
          </span>
          {mount.mountPath && (
            <div className="muted" style={{ marginTop: 4, wordBreak: 'break-all' }}>
              {mount.mountPath}
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="small"
              onClick={async () => {
                setMount(await window.api.smbMount());
              }}
              disabled={!config.smb.host || !config.smb.share}
            >
              Mount
            </button>
            <button
              className="small"
              onClick={async () => {
                setMount(await window.api.smbUnmount());
              }}
              disabled={!mount.mounted}
            >
              Unmount
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        {updateVersion && (
          <div className={`update-banner ${updateReady ? 'update-banner--ready' : ''}`}>
            {updateReady ? (
              <>
                Update {updateVersion} downloaded —{' '}
                <button className="update-banner__btn" onClick={() => window.api.installUpdate()}>
                  Restart to install
                </button>
              </>
            ) : (
              <>
                Downloading update {updateVersion}…
                {updateProgress !== null && (
                  <span className="update-banner__progress">
                    <span style={{ width: `${updateProgress}%` }} />
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'backup' && (
          <BackupView config={config} onConfigChange={refreshConfig} />
        )}
        {tab === 'upload' && <UploadView mounted={mount.mounted} />}
        {tab === 'download' && <DownloadView mounted={mount.mounted} />}
        {tab === 'settings' && (
          <SettingsView config={config} onConfigChange={refreshConfig} />
        )}

        <ProgressPanel events={events} />
      </main>
    </div>
  );
}
