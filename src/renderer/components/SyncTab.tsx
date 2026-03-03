import React, { useState, useEffect, useCallback } from 'react';
import { SyncHostView } from './SyncHostView';
import { SyncSlaveView } from './SyncSlaveView';
import type { DiscoveredHost, PairedDevice, RemoteBackup, SyncProgress } from '../types';

type SyncRole = 'host' | 'slave' | 'none';

export function SyncTab(): React.ReactElement {
  const [role, setRole] = useState<SyncRole>('none');

  // Host state
  const [hostActive, setHostActive] = useState(false);
  const [hostPort, setHostPort] = useState<number | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);

  // Slave state
  const [browsing, setBrowsing] = useState(false);
  const [hosts, setHosts] = useState<DiscoveredHost[]>([]);
  const [connected, setConnected] = useState(false);
  const [syncState, setSyncState] = useState('');
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [backupList, setBackupList] = useState<RemoteBackup[]>([]);

  useEffect(() => {
    window.electronAPI.config.get().then((cfg) => {
      setRole(cfg.syncRole);
    });
  }, []);

  // Listen for sync events
  useEffect(() => {
    const unsubHostFound = window.electronAPI.onSyncHostFound((host) => {
      setHosts((prev) => {
        if (prev.find((h) => h.id === host.id)) return prev;
        return [...prev, host];
      });
    });

    const unsubHostLost = window.electronAPI.onSyncHostLost((hostId) => {
      setHosts((prev) => prev.filter((h) => h.id !== hostId));
    });

    const unsubState = window.electronAPI.onSyncStateChange((state) => {
      setSyncState(state);
      if (state === 'connected') setConnected(true);
      if (state === 'disconnected') {
        setConnected(false);
        setBackupList([]);
      }
    });

    const unsubProgress = window.electronAPI.onSyncProgress((data) => {
      setProgress(data);
    });

    return () => {
      unsubHostFound();
      unsubHostLost();
      unsubState();
      unsubProgress();
    };
  }, []);

  const handleRoleChange = useCallback(async (newRole: SyncRole) => {
    // Clean up current role
    if (role === 'host' && hostActive) {
      await window.electronAPI.sync.stopHost();
      setHostActive(false);
    }
    if (role === 'slave' && browsing) {
      await window.electronAPI.sync.stopBrowsing();
      setBrowsing(false);
    }

    setRole(newRole);
    await window.electronAPI.config.save({ syncRole: newRole });
  }, [role, hostActive, browsing]);

  // Host handlers
  const handleStartHost = useCallback(async () => {
    const { port } = await window.electronAPI.sync.startHost();
    setHostPort(port);
    setHostActive(true);
    const devices = await window.electronAPI.sync.getPairedDevices();
    setPairedDevices(devices);
  }, []);

  const handleStopHost = useCallback(async () => {
    await window.electronAPI.sync.stopHost();
    setHostActive(false);
    setPin(null);
  }, []);

  const handleGeneratePin = useCallback(async () => {
    const { pin: newPin } = await window.electronAPI.sync.generatePin();
    setPin(newPin);
  }, []);

  const handleRevokeDevice = useCallback(async (id: string) => {
    await window.electronAPI.sync.revokeDevice(id);
    const devices = await window.electronAPI.sync.getPairedDevices();
    setPairedDevices(devices);
  }, []);

  // Slave handlers
  const handleStartBrowsing = useCallback(async () => {
    await window.electronAPI.sync.browseHosts();
    setBrowsing(true);
    setHosts([]);
  }, []);

  const handleStopBrowsing = useCallback(async () => {
    await window.electronAPI.sync.stopBrowsing();
    setBrowsing(false);
  }, []);

  const handleConnectToHost = useCallback(async (address: string) => {
    await window.electronAPI.sync.connectToHost(address);
  }, []);

  const handlePairWithPin = useCallback(async (pinValue: string) => {
    await window.electronAPI.sync.pairWithPin(pinValue);
  }, []);

  const handleRequestBackupList = useCallback(async () => {
    const list = await window.electronAPI.sync.requestBackupList();
    setBackupList(list);
  }, []);

  const handleStartTransfer = useCallback(async (backupId: string) => {
    await window.electronAPI.sync.startTransfer(backupId);
  }, []);

  const handleCancelTransfer = useCallback(async () => {
    await window.electronAPI.sync.cancelTransfer();
    setProgress(null);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-wow-gold">Sync</h1>

      {/* Role Selector */}
      <div className="card">
        <h2 className="text-sm font-medium text-wow-text-muted mb-3">Sync Role</h2>
        <div className="flex gap-3">
          {(['host', 'slave', 'none'] as SyncRole[]).map((r) => (
            <button
              key={r}
              onClick={() => handleRoleChange(r)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                role === r
                  ? 'bg-wow-blue text-white'
                  : 'bg-wow-dark-lighter text-wow-text-muted hover:text-wow-text border border-wow-border'
              }`}
            >
              {r === 'host' ? 'Host' : r === 'slave' ? 'Slave' : 'None'}
            </button>
          ))}
        </div>
        <p className="text-xs text-wow-text-muted mt-2">
          {role === 'host' && 'This machine serves backups to other machines on the network.'}
          {role === 'slave' && 'This machine syncs settings from a host machine.'}
          {role === 'none' && 'Peer sync is disabled.'}
        </p>
      </div>

      {/* Host View */}
      {role === 'host' && (
        <SyncHostView
          active={hostActive}
          port={hostPort}
          pin={pin}
          pairedDevices={pairedDevices}
          onStart={handleStartHost}
          onStop={handleStopHost}
          onGeneratePin={handleGeneratePin}
          onRevokeDevice={handleRevokeDevice}
        />
      )}

      {/* Slave View */}
      {role === 'slave' && (
        <SyncSlaveView
          browsing={browsing}
          hosts={hosts}
          connected={connected}
          syncState={syncState}
          progress={progress}
          backupList={backupList}
          onStartBrowsing={handleStartBrowsing}
          onStopBrowsing={handleStopBrowsing}
          onConnectToHost={handleConnectToHost}
          onPairWithPin={handlePairWithPin}
          onRequestBackupList={handleRequestBackupList}
          onStartTransfer={handleStartTransfer}
          onCancelTransfer={handleCancelTransfer}
        />
      )}
    </div>
  );
}
