import React, { useState } from 'react';
import { Play, RotateCcw, FolderOpen, Archive } from 'lucide-react';
import { BackupConfig } from '../types';

interface BackupTabProps {
  config: BackupConfig;
  onShowNotification: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  setIsLoading: (loading: boolean) => void;
}

const BackupTab: React.FC<BackupTabProps> = ({ config, onShowNotification, setIsLoading }) => {
  const [selectedBackup, setSelectedBackup] = useState<string>('');

  const handleRunBackup = async () => {
    setIsLoading(true);
    try {
      const result = await window.electron.backup.run();
      if (result.success) {
        onShowNotification('Backup completed successfully!', 'success');
      } else {
        onShowNotification(result.error || 'Backup failed', 'error');
      }
    } catch (error) {
      onShowNotification('Failed to run backup', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectBackupFile = async () => {
    const file = await window.electron.dialog.selectFile([
      { name: 'Backup Files', extensions: ['zip'] }
    ]);
    if (file) {
      setSelectedBackup(file);
    }
  };

  const handleRestore = async () => {
    if (!selectedBackup) {
      onShowNotification('Please select a backup file first', 'warning');
      return;
    }

    setIsLoading(true);
    try {
      const result = await window.electron.backup.restore(selectedBackup);
      if (result.success) {
        onShowNotification('Restore completed successfully!', 'success');
      } else {
        onShowNotification(result.error || 'Restore failed', 'error');
      }
    } catch (error) {
      onShowNotification('Failed to restore backup', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="card">
        <h2 className="text-2xl font-semibold mb-6 flex items-center">
          <Archive className="mr-3 text-wow-blue" size={28} />
          Backup Operations
        </h2>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Create Backup</h3>
            <p className="text-sm text-gray-400">
              Create a new backup of your WoW addons and settings. This will backup:
            </p>
            <ul className="list-disc list-inside text-sm text-gray-400 space-y-1">
              <li>Interface folder (Addons)</li>
              <li>WTF folder (Settings)</li>
              <li>Screenshots folder</li>
            </ul>
            <div className="pt-2">
              <button
                onClick={handleRunBackup}
                className="btn-primary flex items-center space-x-2 w-full justify-center"
              >
                <Play size={18} />
                <span>Run Backup Now</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-medium">Restore Backup</h3>
            <p className="text-sm text-gray-400">
              Restore your WoW addons and settings from a previous backup.
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Select Backup File</label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={selectedBackup}
                    readOnly
                    className="input-field"
                    placeholder="No file selected"
                  />
                  <button
                    onClick={handleSelectBackupFile}
                    className="btn-secondary flex items-center"
                  >
                    <FolderOpen size={18} />
                  </button>
                </div>
              </div>
              <button
                onClick={handleRestore}
                className="btn-success flex items-center space-x-2 w-full justify-center"
                disabled={!selectedBackup}
              >
                <RotateCcw size={18} />
                <span>Restore Backup</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-medium mb-4">Current Configuration</h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">WoW Version:</span>
            <span className="ml-2">{config.wowVersion}</span>
          </div>
          <div>
            <span className="text-gray-400">Backup Location:</span>
            <span className="ml-2 text-xs">{config.backupDir}</span>
          </div>
          <div>
            <span className="text-gray-400">Compression:</span>
            <span className="ml-2">{config.fastCompression ? 'Fast' : 'Normal'}</span>
          </div>
          <div>
            <span className="text-gray-400">Retention:</span>
            <span className="ml-2">{config.backupRetention} days</span>
          </div>
        </div>
      </div>

      <div className="card bg-yellow-900/20 border-yellow-600/30">
        <h3 className="text-lg font-medium mb-2 text-yellow-500">Important Notes</h3>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>• Ensure WoW is closed before running backup or restore operations</li>
          <li>• Backups older than {config.backupRetention} days will be automatically deleted</li>
          <li>• Existing files will be backed up before restore (with .backup extension)</li>
        </ul>
      </div>
    </div>
  );
};

export default BackupTab;