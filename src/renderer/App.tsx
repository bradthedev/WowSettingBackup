import React, { useState } from 'react';
import { TitleBar } from './components/TitleBar';
import { Dashboard } from './components/Dashboard';
import { BackupTab } from './components/BackupTab';
import { CloudTab } from './components/CloudTab';
import { SyncTab } from './components/SyncTab';
import { SettingsTab } from './components/SettingsTab';
import { LogsTab } from './components/LogsTab';
import type { TabId } from './types';

const TABS: { id: TabId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'backup', label: 'Backup' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'sync', label: 'Sync' },
  { id: 'settings', label: 'Settings' },
  { id: 'logs', label: 'Logs' },
];

export function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  return (
    <div className="flex flex-col h-screen">
      <TitleBar />
      <nav className="flex border-b border-wow-border bg-wow-dark-light px-4 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab-button ${activeTab === tab.id ? 'tab-button-active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="flex-1 overflow-y-auto p-6">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'backup' && <BackupTab />}
        {activeTab === 'cloud' && <CloudTab />}
        {activeTab === 'sync' && <SyncTab />}
        {activeTab === 'settings' && <SettingsTab />}
        {activeTab === 'logs' && <LogsTab />}
      </main>
    </div>
  );
}
