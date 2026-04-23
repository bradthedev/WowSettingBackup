import React, { useEffect, useState } from 'react';
import type {
  AppConfig,
  MountStatus,
  ProgressEvent,
  SyncAvailableInfo,
  ThemePreference
} from '../shared/types';
import { BackupView } from './views/BackupView';
import { UploadView } from './views/UploadView';
import { DownloadView } from './views/DownloadView';
import { SettingsView } from './views/SettingsView';
import { ProgressPanel } from './components/ProgressPanel';

type Tab = 'backup' | 'upload' | 'download' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'backup', label: 'Backup' },
  { id: 'upload', label: 'Upload' },
  { id: 'download', label: 'Restore' },
  { id: 'settings', label: 'Settings' }
];

export function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('backup');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [mount, setMount] = useState<MountStatus>({ mounted: false });
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [syncItems, setSyncItems] = useState<SyncAvailableInfo[]>([]);
  const [syncApplying, setSyncApplying] = useState<string | null>(null);
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('dark');

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
      if (e.phase === 'done' || e.phase === 'error') {
        setTimeout(() => {
          setEvents((prev) => prev.filter((p) => p.id !== e.id));
        }, 6000);
      }
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

    const offSync = window.api.onSyncAvailable((items) => {
      setSyncItems((prev) => {
        const existing = new Set(prev.map((i) => i.remoteName));
        const incoming = items.filter((i) => !existing.has(i.remoteName));
        return incoming.length > 0 ? [...prev, ...incoming] : prev;
      });
    });
    const offSyncApplied = window.api.onSyncApplied((info) => {
      setSyncItems((prev) => prev.filter((i) => i.remoteName !== info.remoteName));
    });

    const offTheme = window.api.onThemeResolved((t) => setResolvedTheme(t));

    return () => {
      off();
      clearInterval(mountPoll);
      offAvailable();
      offProgress();
      offDownloaded();
      offSync();
      offSyncApplied();
      offTheme();
    };
  }, []);

  // Apply the resolved theme to the document root so CSS vars swap.
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  async function setThemePref(pref: ThemePreference): Promise<void> {
    await window.api.setConfig({ theme: pref });
    await refreshConfig();
  }

  if (!config) {
    return (
      <div className="app">
        <div style={{ padding: 32 }} className="muted">
          Loading…
        </div>
      </div>
    );
  }

  const themePref: ThemePreference = config.theme ?? 'system';

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">WoW Settings Backup</h1>
        <div className="app-header__spacer" />
        <div className={`mount-chip ${mount.mounted ? 'mount-chip--ok' : ''}`}>
          <span className="mount-chip__dot" />
          {mount.mounted ? 'Share mounted' : 'Share offline'}
        </div>
        <button
          className="small ghost"
          onClick={async () => {
            if (mount.mounted) setMount(await window.api.smbUnmount());
            else if (config.smb.host && config.smb.share)
              setMount(await window.api.smbMount());
          }}
          disabled={!config.smb.host || !config.smb.share}
          title={mount.mounted ? 'Unmount share' : 'Mount share'}
        >
          {mount.mounted ? 'Unmount' : 'Mount'}
        </button>
        <div className="theme-toggle" role="group" aria-label="Theme">
          {(['light', 'system', 'dark'] as ThemePreference[]).map((p) => (
            <button
              key={p}
              aria-pressed={themePref === p}
              onClick={() => setThemePref(p)}
              title={`Theme: ${p}`}
            >
              {p === 'light' ? 'Light' : p === 'dark' ? 'Dark' : 'Auto'}
            </button>
          ))}
        </div>
      </header>

      <main className="main">
        {updateVersion && (
          <div className={`update-banner ${updateReady ? 'update-banner--ready' : ''}`}>
            {updateReady ? (
              <>
                Update {updateVersion} downloaded —{' '}
                <button
                  className="update-banner__btn"
                  onClick={() => window.api.installUpdate()}
                >
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

        {syncItems.map((item) => (
          <div key={item.remoteName} className="sync-banner">
            <span className="sync-banner__label">
              Newer {item.flavor === 'unknown' ? '' : <code>{item.flavor}</code>} backup
              from <strong>{item.sourceHostname}</strong> (
              {new Date(item.createdAtIso).toLocaleString()}) is available.
            </span>
            <button
              className="sync-banner__btn sync-banner__btn--primary"
              disabled={syncApplying === item.remoteName}
              onClick={async () => {
                setSyncApplying(item.remoteName);
                try {
                  await window.api.applySyncBackup(item);
                  setSyncItems((prev) =>
                    prev.filter((i) => i.remoteName !== item.remoteName)
                  );
                } catch (err) {
                  console.error('Sync apply failed:', err);
                } finally {
                  setSyncApplying(null);
                }
              }}
            >
              {syncApplying === item.remoteName ? 'Restoring…' : 'Download & Restore'}
            </button>
            <button
              className="sync-banner__btn"
              disabled={syncApplying === item.remoteName}
              onClick={async () => {
                await window.api.dismissSyncBackup(item);
                setSyncItems((prev) =>
                  prev.filter((i) => i.remoteName !== item.remoteName)
                );
              }}
            >
              Dismiss
            </button>
          </div>
        ))}

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

      <nav className="nav-dock" aria-label="Primary">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-dock__btn ${tab === t.id ? 'nav-dock__btn--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
