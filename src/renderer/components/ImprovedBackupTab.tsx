import React, { useState, useEffect } from 'react';
import { 
  Play, 
  RotateCcw, 
  FolderOpen, 
  Archive,
  Calendar,
  Clock,
  HardDrive,
  CheckCircle,
  AlertCircle,
  Download,
  Upload,
  Trash2,
  Search,
  XCircle
} from 'lucide-react';
import { BackupConfig, BackupHistoryItem } from '../types';

interface ImprovedBackupTabProps {
  config: BackupConfig;
  onShowNotification: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  setIsLoading: (loading: boolean) => void;
}

const ImprovedBackupTab: React.FC<ImprovedBackupTabProps> = ({ 
  config, 
  onShowNotification, 
  setIsLoading 
}) => {
  const [selectedBackup, setSelectedBackup] = useState<string>('');
  const [backupHistory, setBackupHistory] = useState<BackupHistoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState<'create' | 'restore' | 'history'>('create');

  useEffect(() => {
    loadBackupHistory();
  }, []);

  const loadBackupHistory = async () => {
    try {
      const history = await window.electron.backupHistory.get();
      // Convert date strings back to Date objects
      const processedHistory = history.map(item => ({
        ...item,
        date: new Date(item.date)
      }));
      setBackupHistory(processedHistory);
    } catch (error) {
      console.error('Failed to load backup history:', error);
      onShowNotification('Failed to load backup history', 'error');
    }
  };

  const handleRunBackup = async () => {
    setIsLoading(true);
    try {
      const result = await window.electron.backup.run();
      if (result.success) {
        onShowNotification('Backup created successfully!', 'success');
        loadBackupHistory();
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

  const handleRestoreFromHistory = (backup: BackupHistoryItem) => {
    if (backup.status === 'failed' || !backup.path) {
      onShowNotification('Cannot restore failed backup', 'error');
      return;
    }
    setSelectedBackup(backup.path);
    setActiveView('restore');
  };

  const handleDeleteBackup = async (backup: BackupHistoryItem, deleteFile: boolean = false) => {
    try {
      const success = await window.electron.backupHistory.delete(backup.id, deleteFile);
      if (success) {
        onShowNotification(`Backup ${deleteFile ? 'and file' : ''} deleted successfully`, 'success');
        loadBackupHistory(); // Reload the history
      } else {
        onShowNotification('Failed to delete backup', 'error');
      }
    } catch (error) {
      console.error('Failed to delete backup:', error);
      onShowNotification('Failed to delete backup', 'error');
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

  const filteredBackups = backupHistory.filter(backup =>
    backup.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderCreateView = () => (
    <div className="space-y-6">
      <div className="card">
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-wow-blue to-wow-blue-dark rounded-full flex items-center justify-center">
            <Upload className="text-white" size={32} />
          </div>
          <h2 className="text-2xl font-semibold">Create New Backup</h2>
          <p className="text-gray-400 max-w-md mx-auto">
            Create a secure backup of your WoW addons, settings, and screenshots. 
            This process typically takes 1-2 minutes.
          </p>
        </div>

        <div className="mt-8 grid md:grid-cols-3 gap-4">
          <div className="bg-dark-bg rounded-lg p-4 text-center">
            <Archive className="mx-auto mb-2 text-blue-400" size={24} />
            <div className="font-medium">Interface</div>
            <div className="text-sm text-gray-400">Addons & UI</div>
          </div>
          <div className="bg-dark-bg rounded-lg p-4 text-center">
            <HardDrive className="mx-auto mb-2 text-green-400" size={24} />
            <div className="font-medium">WTF</div>
            <div className="text-sm text-gray-400">Settings & Config</div>
          </div>
          <div className="bg-dark-bg rounded-lg p-4 text-center">
            <Calendar className="mx-auto mb-2 text-purple-400" size={24} />
            <div className="font-medium">Screenshots</div>
            <div className="text-sm text-gray-400">Images & Media</div>
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <button
            onClick={handleRunBackup}
            className="btn-primary flex items-center space-x-3 px-8 py-4 text-lg"
          >
            <Play size={24} />
            <span>Create Backup Now</span>
          </button>
        </div>
      </div>
    </div>
  );

  const renderRestoreView = () => (
    <div className="space-y-6">
      <div className="card">
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-green-600 to-green-700 rounded-full flex items-center justify-center">
            <Download className="text-white" size={32} />
          </div>
          <h2 className="text-2xl font-semibold">Restore Backup</h2>
          <p className="text-gray-400 max-w-md mx-auto">
            Restore your WoW installation from a previous backup. 
            This will replace your current addons and settings.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <div>
            <label className="label">Selected Backup File</label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={selectedBackup}
                onChange={(e) => setSelectedBackup(e.target.value)}
                className="input-field flex-1 font-mono text-sm"
                placeholder="Choose a backup file..."
                readOnly
              />
              <button
                onClick={handleSelectBackupFile}
                className="btn-secondary flex items-center space-x-2 px-4"
              >
                <FolderOpen size={18} />
                <span>Browse</span>
              </button>
            </div>
          </div>

          {selectedBackup && (
            <div className="bg-yellow-600/20 border border-yellow-600/30 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="text-yellow-400 mt-0.5" size={20} />
                <div>
                  <div className="font-medium text-yellow-300">Important Notice</div>
                  <div className="text-sm text-yellow-200 mt-1">
                    This will replace your current WoW addons and settings. 
                    Make sure WoW is closed before proceeding.
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-center pt-4">
            <button
              onClick={handleRestore}
              disabled={!selectedBackup}
              className={`flex items-center space-x-3 px-8 py-4 text-lg rounded-lg transition-all ${
                selectedBackup 
                  ? 'bg-green-600 hover:bg-green-700 text-white' 
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              <RotateCcw size={24} />
              <span>Restore Backup</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderHistoryView = () => (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">Backup History</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10 w-64"
              placeholder="Search backups..."
            />
          </div>
        </div>

        <div className="space-y-3">
          {filteredBackups.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Archive size={48} className="mx-auto mb-4 opacity-50" />
              <p>No backups found</p>
            </div>
          ) : (
            filteredBackups.map((backup) => (
              <div
                key={backup.id}
                className="bg-dark-bg rounded-lg p-4 flex items-center justify-between hover:bg-dark-border/50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${
                      backup.type === 'manual' ? 'bg-blue-400' : 'bg-green-400'
                    }`} />
                    {backup.status === 'failed' && (
                      <XCircle size={16} className="text-red-400" />
                    )}
                    {backup.status === 'completed' && (
                      <CheckCircle size={16} className="text-green-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className={`font-medium ${backup.status === 'failed' ? 'text-red-400' : ''}`}>
                        {backup.name}
                      </span>
                      {backup.version && (
                        <span className="text-xs bg-gray-700 px-2 py-1 rounded">
                          {backup.version}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-400 flex items-center space-x-4">
                      <span className="flex items-center space-x-1">
                        <Calendar size={14} />
                        <span>{backup.date.toLocaleDateString()}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <Clock size={14} />
                        <span>{backup.date.toLocaleTimeString()}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <HardDrive size={14} />
                        <span>{backup.sizeFormatted}</span>
                      </span>
                      {backup.filesCount && (
                        <span className="flex items-center space-x-1">
                          <Archive size={14} />
                          <span>{backup.filesCount.toLocaleString()} files</span>
                        </span>
                      )}
                      {backup.duration && (
                        <span className="flex items-center space-x-1">
                          <Clock size={14} />
                          <span>{Math.round(backup.duration / 1000)}s</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {backup.status === 'completed' && backup.path && (
                    <button
                      onClick={() => handleRestoreFromHistory(backup)}
                      className="btn-secondary flex items-center space-x-2 px-3 py-1 text-sm"
                    >
                      <RotateCcw size={14} />
                      <span>Restore</span>
                    </button>
                  )}
                  <button 
                    onClick={() => handleDeleteBackup(backup, false)}
                    className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                    title="Remove from history"
                  >
                    <Trash2 size={16} />
                  </button>
                  {backup.status === 'completed' && backup.path && (
                    <button 
                      onClick={() => handleDeleteBackup(backup, true)}
                      className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                      title="Delete backup file and remove from history"
                    >
                      <XCircle size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">
      {/* Navigation */}
      <div className="mb-8">
        <div className="flex space-x-1 bg-dark-surface rounded-lg p-1">
          {[
            { id: 'create', label: 'Create Backup', icon: Upload },
            { id: 'restore', label: 'Restore Backup', icon: Download },
            { id: 'history', label: 'Backup History', icon: Archive },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id as any)}
                className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all ${
                  activeView === tab.id
                    ? 'bg-wow-blue text-white'
                    : 'text-gray-400 hover:text-white hover:bg-dark-border'
                }`}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {activeView === 'create' && renderCreateView()}
      {activeView === 'restore' && renderRestoreView()}
      {activeView === 'history' && renderHistoryView()}
    </div>
  );
};

export default ImprovedBackupTab;