import React, { useState, useEffect } from 'react';
import { Play, Square, Clock, Calendar } from 'lucide-react';
import { BackupConfig } from '../types';

interface SchedulerTabProps {
  config: BackupConfig;
  onConfigChange: (config: BackupConfig) => void;
  onShowNotification: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const SchedulerTab: React.FC<SchedulerTabProps> = ({ config, onConfigChange, onShowNotification }) => {
  const [schedulerStatus, setSchedulerStatus] = useState<{
    running: boolean;
    nextRun?: Date;
  }>({ running: false });
  const [localConfig, setLocalConfig] = useState(config);

  useEffect(() => {
    checkSchedulerStatus();
    const interval = setInterval(checkSchedulerStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const checkSchedulerStatus = async () => {
    const status = await window.electron.scheduler.getStatus();
    setSchedulerStatus(status);
  };

  const handleToggleScheduler = async () => {
    if (schedulerStatus.running) {
      await window.electron.scheduler.stop();
      onShowNotification('Scheduler stopped', 'info');
    } else {
      await window.electron.scheduler.start();
      onShowNotification('Scheduler started', 'success');
    }
    checkSchedulerStatus();
  };

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    const newConfig = {
      ...localConfig,
      [name]: type === 'checkbox' ? checked : 
              type === 'number' ? Number(value) : 
              value
    };
    
    setLocalConfig(newConfig);
    onConfigChange(newConfig);
  };

  const getNextRunText = () => {
    if (!schedulerStatus.nextRun) return 'Not scheduled';
    
    try {
      const nextRun = new Date(schedulerStatus.nextRun);
      
      // Check if the date is valid
      if (isNaN(nextRun.getTime())) {
        return 'Schedule pending...';
      }
      
      const now = new Date();
      const diff = nextRun.getTime() - now.getTime();
      
      if (diff < 0) return 'Running soon...';
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hours > 0) {
        return `In ${hours} hour${hours > 1 ? 's' : ''} ${minutes > 0 ? ` ${minutes} minute${minutes !== 1 ? 's' : ''}` : ''}`;
      }
      return `In ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } catch (error) {
      console.error('Error calculating next run time:', error);
      return 'Schedule error';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="card">
        <h2 className="text-2xl font-semibold mb-6 flex items-center">
          <Clock className="mr-3 text-wow-blue" size={28} />
          Backup Scheduler
        </h2>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className={`p-4 rounded-lg ${schedulerStatus.running ? 'bg-green-900/20 border border-green-600/30' : 'bg-gray-900/20 border border-gray-600/30'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Status</span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${schedulerStatus.running ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'}`}>
                  {schedulerStatus.running ? 'Running' : 'Stopped'}
                </span>
              </div>
              {schedulerStatus.running && schedulerStatus.nextRun && (
                <div className="text-sm text-gray-400">
                  <div className="flex items-center space-x-2">
                    <Calendar size={14} />
                    <span>Next backup: {getNextRunText()}</span>
                  </div>
                  <div className="mt-1 text-xs">
                    {(() => {
                      try {
                        const nextRun = new Date(schedulerStatus.nextRun);
                        return isNaN(nextRun.getTime()) ? 'Calculating next run time...' : nextRun.toLocaleString();
                      } catch (error) {
                        return 'Schedule pending...';
                      }
                    })()}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleToggleScheduler}
              className={`w-full flex items-center justify-center space-x-2 ${
                schedulerStatus.running ? 'btn-danger' : 'btn-success'
              }`}
            >
              {schedulerStatus.running ? (
                <>
                  <Square size={18} />
                  <span>Stop Scheduler</span>
                </>
              ) : (
                <>
                  <Play size={18} />
                  <span>Start Scheduler</span>
                </>
              )}
            </button>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-medium">Schedule Settings</h3>
            
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="schedulerEnabled"
                name="schedulerEnabled"
                checked={localConfig.schedulerEnabled}
                onChange={handleConfigChange}
                className="w-4 h-4 text-wow-blue"
              />
              <label htmlFor="schedulerEnabled" className="text-sm">
                Enable automatic backups
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Interval</label>
                <input
                  type="number"
                  name="scheduleInterval"
                  value={localConfig.scheduleInterval}
                  onChange={handleConfigChange}
                  min="1"
                  max="999"
                  className="input-field"
                  disabled={!localConfig.schedulerEnabled}
                />
              </div>
              <div>
                <label className="label">Unit</label>
                <select
                  name="scheduleUnit"
                  value={localConfig.scheduleUnit}
                  onChange={handleConfigChange}
                  className="input-field"
                  disabled={!localConfig.schedulerEnabled}
                >
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
            </div>

            <p className="text-xs text-gray-400">
              Backup will run every {localConfig.scheduleInterval} {localConfig.scheduleUnit}
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-medium mb-4">Schedule Information</h3>
        <div className="space-y-2 text-sm">
          <p className="text-gray-400">
            When enabled, the scheduler will automatically create backups at the specified interval.
          </p>
          <p className="text-gray-400">
            The scheduler runs independently of the main application and will continue even if you close the window (when "Run in Background" is enabled).
          </p>
          <p className="text-gray-400">
            You can still run manual backups while the scheduler is active.
          </p>
        </div>
      </div>

      <div className="card bg-blue-900/20 border-blue-600/30">
        <h3 className="text-lg font-medium mb-2 text-blue-400">Tips</h3>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>• Set a reasonable interval based on how often you play</li>
          <li>• Daily backups are recommended for active players</li>
          <li>• The scheduler will skip backups if WoW is running</li>
          <li>• Check the Logs tab to see scheduler activity</li>
        </ul>
      </div>
    </div>
  );
};

export default SchedulerTab;