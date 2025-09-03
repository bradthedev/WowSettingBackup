import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Clock, 
  HardDrive, 
  Activity,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Settings,
  Play,
  RotateCcw
} from 'lucide-react';
import { BackupConfig } from '../types';

interface DashboardProps {
  config: BackupConfig;
  onShowNotification: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  setIsLoading: (loading: boolean) => void;
  onNavigateToTab: (tabIndex: number) => void;
}

interface SystemStatus {
  lastBackup?: Date;
  nextScheduledBackup?: Date;
  backupCount: number;
  totalBackups: number;
  successfulBackups: number;
  failedBackups: number;
  totalSize: string;
  diskSpace: {
    used: string;
    available: string;
  };
  wowInstallationValid: boolean;
  schedulerRunning: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  config, 
  onShowNotification, 
  setIsLoading,
  onNavigateToTab 
}) => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    backupCount: 0,
    totalBackups: 0,
    successfulBackups: 0,
    failedBackups: 0,
    totalSize: '0 B',
    diskSpace: { used: '0 GB', available: '0 GB' },
    wowInstallationValid: false,
    schedulerRunning: false
  });

  useEffect(() => {
    loadSystemStatus();
  }, []);

  const loadSystemStatus = async () => {
    try {
      // Get backup history stats
      const stats = await window.electron.backupHistory.getStats();
      
      // Get scheduler status
      const schedulerStatus = await window.electron.scheduler.getStatus();
      
      // Check WoW installation validity
      const wowPathValid = config.wowPath && config.wowPath.length > 0;
      
      // Calculate disk space (simplified - would need actual disk space API)
      const diskSpace = {
        used: stats.totalSizeFormatted || '0 B',
        available: 'N/A' // Would need actual disk space calculation
      };
      
      setSystemStatus({
        backupCount: stats.totalBackups,
        totalBackups: stats.totalBackups,
        successfulBackups: stats.successfulBackups,
        failedBackups: stats.failedBackups,
        totalSize: stats.totalSizeFormatted,
        diskSpace,
        wowInstallationValid: wowPathValid,
        schedulerRunning: schedulerStatus.running,
        lastBackup: stats.lastBackupDate ? new Date(stats.lastBackupDate) : undefined,
        nextScheduledBackup: schedulerStatus.nextRun ? new Date(schedulerStatus.nextRun) : undefined
      });
    } catch (error) {
      console.error('Failed to load system status:', error);
      onShowNotification('Failed to load system status', 'error');
    }
  };

  const handleQuickBackup = async () => {
    setIsLoading(true);
    try {
      const result = await window.electron.backup.run();
      if (result.success) {
        onShowNotification('Quick backup completed successfully!', 'success');
        loadSystemStatus(); // Refresh status
      } else {
        onShowNotification(result.error || 'Backup failed', 'error');
      }
    } catch (error) {
      onShowNotification('Failed to run backup', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = () => {
    if (!systemStatus.wowInstallationValid) return 'text-red-400';
    if (!systemStatus.lastBackup) return 'text-yellow-400';
    const daysSinceBackup = systemStatus.lastBackup ? 
      Math.floor((Date.now() - systemStatus.lastBackup.getTime()) / (1000 * 60 * 60 * 24)) : 999;
    if (daysSinceBackup > 7) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getStatusMessage = () => {
    if (!systemStatus.wowInstallationValid) return 'WoW installation not found';
    if (!systemStatus.lastBackup) return 'No backups created yet';
    const daysSinceBackup = systemStatus.lastBackup ? 
      Math.floor((Date.now() - systemStatus.lastBackup.getTime()) / (1000 * 60 * 60 * 24)) : 999;
    if (daysSinceBackup === 0) return 'Backed up today';
    if (daysSinceBackup === 1) return 'Last backup yesterday';
    if (daysSinceBackup > 7) return `Last backup ${daysSinceBackup} days ago`;
    return `Last backup ${daysSinceBackup} days ago`;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">WoW Backup Manager</h1>
        <p className="text-gray-400">Protect your World of Warcraft addons and settings</p>
      </div>

      {/* Status Overview */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold flex items-center">
            <Activity className="mr-3 text-wow-blue" size={24} />
            System Status
          </h2>
          <div className={`flex items-center space-x-2 ${getStatusColor()}`}>
            {systemStatus.wowInstallationValid && systemStatus.lastBackup ? 
              <CheckCircle size={20} /> : 
              <AlertTriangle size={20} />
            }
            <span className="font-medium">{getStatusMessage()}</span>
          </div>
        </div>

        <div className="grid md:grid-cols-5 gap-4">
          <div className="bg-dark-bg rounded-lg p-4 text-center">
            <Shield className="mx-auto mb-2 text-wow-blue" size={24} />
            <div className="text-2xl font-bold">{systemStatus.totalBackups}</div>
            <div className="text-sm text-gray-400">Total Backups</div>
          </div>
          
          <div className="bg-dark-bg rounded-lg p-4 text-center">
            <CheckCircle className="mx-auto mb-2 text-green-400" size={24} />
            <div className="text-2xl font-bold">{systemStatus.successfulBackups}</div>
            <div className="text-sm text-gray-400">Successful</div>
          </div>
          
          <div className="bg-dark-bg rounded-lg p-4 text-center">
            <AlertTriangle className="mx-auto mb-2 text-red-400" size={24} />
            <div className="text-2xl font-bold">{systemStatus.failedBackups}</div>
            <div className="text-sm text-gray-400">Failed</div>
          </div>
          
          <div className="bg-dark-bg rounded-lg p-4 text-center">
            <HardDrive className="mx-auto mb-2 text-purple-400" size={24} />
            <div className="text-lg font-bold">{systemStatus.totalSize}</div>
            <div className="text-sm text-gray-400">Storage Used</div>
          </div>
          
          <div className="bg-dark-bg rounded-lg p-4 text-center">
            <Calendar className="mx-auto mb-2 text-yellow-400" size={24} />
            <div className="text-lg font-bold">
              {systemStatus.lastBackup ? 
                systemStatus.lastBackup.toLocaleDateString() : 
                'Never'
              }
            </div>
            <div className="text-sm text-gray-400">Last Backup</div>
          </div>
        </div>
        
        {/* Additional Status Row */}
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <div className="bg-dark-bg rounded-lg p-4 text-center">
            <Clock className="mx-auto mb-2 text-blue-400" size={24} />
            <div className="text-lg font-bold">
              {systemStatus.nextScheduledBackup ? 
                systemStatus.nextScheduledBackup.toLocaleDateString() : 
                'Not Scheduled'
              }
            </div>
            <div className="text-sm text-gray-400">Next Backup</div>
          </div>
          
          <div className="bg-dark-bg rounded-lg p-4 text-center">
            <Activity className={`mx-auto mb-2 ${systemStatus.schedulerRunning ? 'text-green-400' : 'text-gray-400'}`} size={24} />
            <div className="text-lg font-bold">
              {systemStatus.schedulerRunning ? 'Running' : 'Stopped'}
            </div>
            <div className="text-sm text-gray-400">Auto Backup</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-6">Quick Actions</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <button
            onClick={handleQuickBackup}
            className="group bg-gradient-to-r from-wow-blue to-wow-blue-dark rounded-lg p-6 text-left transition-all hover:shadow-lg hover:shadow-wow-blue/20"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center mb-2">
                  <Play className="mr-2" size={20} />
                  <h3 className="font-semibold">Create Backup</h3>
                </div>
                <p className="text-sm text-blue-100">
                  Backup your addons and settings now
                </p>
              </div>
              <div className="bg-white/20 rounded-full p-2 group-hover:bg-white/30 transition-colors">
                <Play size={16} />
              </div>
            </div>
          </button>

          <button
            onClick={() => onNavigateToTab(1)}
            className="group bg-gradient-to-r from-green-600 to-green-700 rounded-lg p-6 text-left transition-all hover:shadow-lg hover:shadow-green-500/20"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center mb-2">
                  <RotateCcw className="mr-2" size={20} />
                  <h3 className="font-semibold">Restore Backup</h3>
                </div>
                <p className="text-sm text-green-100">
                  Restore from previous backup
                </p>
              </div>
              <div className="bg-white/20 rounded-full p-2 group-hover:bg-white/30 transition-colors">
                <RotateCcw size={16} />
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Configuration Status */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-6 flex items-center">
          <Settings className="mr-3 text-wow-blue" size={24} />
          Configuration Status
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-dark-bg rounded-lg">
            <div className="flex items-center">
              {systemStatus.wowInstallationValid ? (
                <CheckCircle className="mr-3 text-green-400" size={18} />
              ) : (
                <AlertTriangle className="mr-3 text-red-400" size={18} />
              )}
              <span>WoW Installation Path</span>
            </div>
            <span className="text-sm text-gray-400 font-mono">
              {config.wowPath || 'Not set'}
            </span>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-dark-bg rounded-lg">
            <div className="flex items-center">
              <CheckCircle className="mr-3 text-green-400" size={18} />
              <span>Backup Directory</span>
            </div>
            <span className="text-sm text-gray-400 font-mono">
              {config.backupDir || 'Not set'}
            </span>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-dark-bg rounded-lg">
            <div className="flex items-center">
              {config.schedulerEnabled ? (
                <CheckCircle className="mr-3 text-green-400" size={18} />
              ) : (
                <AlertTriangle className="mr-3 text-yellow-400" size={18} />
              )}
              <span>Automatic Backups</span>
            </div>
            <span className="text-sm text-gray-400">
              {config.schedulerEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-dark-border">
          <button
            onClick={() => onNavigateToTab(0)}
            className="btn-secondary w-full"
          >
            Configure Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;