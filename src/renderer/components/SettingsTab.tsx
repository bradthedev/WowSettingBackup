import React, { useState, useEffect, useCallback } from 'react';
import type { AppConfig } from '../types';

const WOW_VERSIONS = [
  { value: '_retail_', label: 'Retail' },
  { value: '_classic_', label: 'Classic' },
  { value: '_classic_era_', label: 'Classic Era' },
  { value: '_ptr_', label: 'PTR' },
  { value: '_beta_', label: 'Beta' },
] as const;

export function SettingsTab(): React.ReactElement {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    window.electronAPI.config.get().then(setConfig);
  }, []);

  const showMessage = useCallback((text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  const saveConfig = useCallback(async (updates: Partial<AppConfig>) => {
    setSaving(true);
    try {
      await window.electronAPI.config.save(updates);
      setConfig((prev) => prev ? { ...prev, ...updates } : prev);
      showMessage('Settings saved', 'success');
    } catch {
      showMessage('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }, [showMessage]);

  const handleSelectWowPath = useCallback(async () => {
    const selected = await window.electronAPI.config.selectDirectory();
    if (selected) {
      await saveConfig({ wowPath: selected });
    }
  }, [saveConfig]);

  const handleDetectWowPath = useCallback(async () => {
    const detected = await window.electronAPI.config.detectWowPath();
    if (detected) {
      await saveConfig({ wowPath: detected });
    } else {
      showMessage('Could not auto-detect WoW path', 'error');
    }
  }, [saveConfig, showMessage]);

  const handleSelectBackupDir = useCallback(async () => {
    const selected = await window.electronAPI.config.selectDirectory();
    if (selected) {
      await saveConfig({ backupDir: selected });
    }
  }, [saveConfig]);

  if (!config) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-wow-text-muted">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-wow-gold">Settings</h1>

      {message && (
        <div className={`px-4 py-2 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-red-900/30 text-red-400 border border-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* WoW Path */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-wow-text">World of Warcraft</h2>

        <div>
          <label className="block text-sm text-wow-text-muted mb-1">Installation Path</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={config.wowPath}
              readOnly
              className="input-field flex-1"
            />
            <button onClick={handleSelectWowPath} className="btn-secondary" disabled={saving}>
              Browse
            </button>
            <button onClick={handleDetectWowPath} className="btn-secondary" disabled={saving}>
              Detect
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-wow-text-muted mb-1">WoW Version</label>
          <select
            value={config.wowVersion}
            onChange={(e) => saveConfig({ wowVersion: e.target.value as AppConfig['wowVersion'] })}
            className="input-field"
            disabled={saving}
          >
            {WOW_VERSIONS.map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Backup Settings */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-wow-text">Backup</h2>

        <div>
          <label className="block text-sm text-wow-text-muted mb-1">Backup Directory</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={config.backupDir}
              readOnly
              className="input-field flex-1"
            />
            <button onClick={handleSelectBackupDir} className="btn-secondary" disabled={saving}>
              Browse
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-wow-text-muted mb-1">
            Backup Retention (days)
          </label>
          <input
            type="number"
            value={config.backupRetention}
            onChange={(e) => saveConfig({ backupRetention: parseInt(e.target.value, 10) || 30 })}
            className="input-field w-32"
            min={1}
            max={365}
            disabled={saving}
          />
        </div>

        <div>
          <label className="block text-sm text-wow-text-muted mb-1">
            Compression Level (1=fast, 16=max)
          </label>
          <input
            type="range"
            value={config.compressionLevel}
            onChange={(e) => saveConfig({ compressionLevel: parseInt(e.target.value, 10) })}
            className="w-48"
            min={1}
            max={16}
            disabled={saving}
          />
          <span className="ml-2 text-sm text-wow-text-muted">{config.compressionLevel}</span>
        </div>
      </div>

      {/* Scheduler */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-wow-text">Scheduled Backups</h2>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.schedulerEnabled}
              onChange={async (e) => {
                const enabled = e.target.checked;
                await saveConfig({ schedulerEnabled: enabled });
                if (enabled) {
                  await window.electronAPI.scheduler.start();
                } else {
                  await window.electronAPI.scheduler.stop();
                }
              }}
              className="w-4 h-4 accent-wow-gold"
              disabled={saving}
            />
            <span className="text-sm text-wow-text">Enable scheduled backups</span>
          </label>
        </div>

        {config.schedulerEnabled && (
          <div>
            <label className="block text-sm text-wow-text-muted mb-1">
              Interval (minutes)
            </label>
            <input
              type="number"
              value={config.schedulerIntervalMinutes}
              onChange={(e) => saveConfig({ schedulerIntervalMinutes: parseInt(e.target.value, 10) || 60 })}
              className="input-field w-32"
              min={1}
              max={1440}
              disabled={saving}
            />
          </div>
        )}
      </div>

      {/* General */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-wow-text">General</h2>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.minimizeToTray}
              onChange={(e) => saveConfig({ minimizeToTray: e.target.checked })}
              className="w-4 h-4 accent-wow-gold"
              disabled={saving}
            />
            <span className="text-sm text-wow-text">Minimize to system tray</span>
          </label>
        </div>

        <div>
          <label className="block text-sm text-wow-text-muted mb-1">Device Name</label>
          <input
            type="text"
            value={config.deviceName}
            onChange={(e) => saveConfig({ deviceName: e.target.value })}
            className="input-field w-64"
            disabled={saving}
          />
        </div>
      </div>
    </div>
  );
}
