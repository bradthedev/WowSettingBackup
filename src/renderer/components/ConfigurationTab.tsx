import React, { useState, useEffect } from 'react';
import { FolderOpen, Save } from 'lucide-react';
import { BackupConfig } from '../types';

interface ConfigurationTabProps {
  config: BackupConfig;
  onSave: (config: BackupConfig) => void;
  onShowNotification: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const ConfigurationTab: React.FC<ConfigurationTabProps> = ({ config, onSave, onShowNotification }) => {
  const [formData, setFormData] = useState<BackupConfig>(config);

  useEffect(() => {
    setFormData(config);
  }, [config]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : 
              type === 'number' ? Number(value) : 
              value
    }));
  };

  const handleSelectDirectory = async (field: keyof BackupConfig) => {
    const path = await window.electron.dialog.selectDirectory();
    if (path) {
      setFormData(prev => ({ ...prev, [field]: path }));
    }
  };

  const handleSave = () => {
    onSave(formData);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">WoW Installation</h2>
        
        <div className="space-y-4">
          <div>
            <label className="label">WoW Version</label>
            <select
              name="wowVersion"
              value={formData.wowVersion}
              onChange={handleInputChange}
              className="input-field"
            >
              <option value="_retail_">Retail</option>
              <option value="_classic_">Classic</option>
              <option value="_classic_era_">Classic Era</option>
              <option value="_ptr_">PTR</option>
              <option value="_beta_">Beta</option>
            </select>
          </div>

          <div>
            <label className="label">WoW Installation Path</label>
            <div className="flex space-x-2">
              <input
                type="text"
                name="wowPath"
                value={formData.wowPath}
                onChange={handleInputChange}
                className="input-field"
                placeholder="C:\Program Files (x86)\World of Warcraft"
              />
              <button
                onClick={() => handleSelectDirectory('wowPath')}
                className="btn-secondary flex items-center"
              >
                <FolderOpen size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Backup Settings</h2>
        
        <div className="space-y-4">
          <div>
            <label className="label">Backup Destination</label>
            <div className="flex space-x-2">
              <input
                type="text"
                name="backupDir"
                value={formData.backupDir}
                onChange={handleInputChange}
                className="input-field"
              />
              <button
                onClick={() => handleSelectDirectory('backupDir')}
                className="btn-secondary flex items-center"
              >
                <FolderOpen size={18} />
              </button>
            </div>
          </div>

          <div>
            <label className="label">Temporary Directory</label>
            <div className="flex space-x-2">
              <input
                type="text"
                name="tempDir"
                value={formData.tempDir}
                onChange={handleInputChange}
                className="input-field"
              />
              <button
                onClick={() => handleSelectDirectory('tempDir')}
                className="btn-secondary flex items-center"
              >
                <FolderOpen size={18} />
              </button>
            </div>
          </div>

          <div>
            <label className="label">Backup Retention (days)</label>
            <input
              type="number"
              name="backupRetention"
              value={formData.backupRetention}
              onChange={handleInputChange}
              min="1"
              max="365"
              className="input-field"
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Compression Settings</h2>
        
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="fastCompression"
              name="fastCompression"
              checked={formData.fastCompression}
              onChange={handleInputChange}
              className="w-4 h-4 text-wow-blue"
            />
            <label htmlFor="fastCompression" className="text-sm">
              Fast Compression (larger files, faster backup)
            </label>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="use7zip"
              name="use7zip"
              checked={formData.use7zip}
              onChange={handleInputChange}
              className="w-4 h-4 text-wow-blue"
            />
            <label htmlFor="use7zip" className="text-sm">
              Use 7-Zip if available (Windows only)
            </label>
          </div>

          <div>
            <label className="label">Compression Threads</label>
            <input
              type="number"
              name="compressionThreads"
              value={formData.compressionThreads}
              onChange={handleInputChange}
              min="1"
              max="32"
              className="input-field"
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Application Settings</h2>
        
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="verboseLogging"
              name="verboseLogging"
              checked={formData.verboseLogging}
              onChange={handleInputChange}
              className="w-4 h-4 text-wow-blue"
            />
            <label htmlFor="verboseLogging" className="text-sm">
              Verbose Logging
            </label>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="minimizeToTray"
              name="minimizeToTray"
              checked={formData.minimizeToTray}
              onChange={handleInputChange}
              className="w-4 h-4 text-wow-blue"
            />
            <label htmlFor="minimizeToTray" className="text-sm">
              Minimize to System Tray
            </label>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="runInBackground"
              name="runInBackground"
              checked={formData.runInBackground}
              onChange={handleInputChange}
              className="w-4 h-4 text-wow-blue"
            />
            <label htmlFor="runInBackground" className="text-sm">
              Keep Running in Background
            </label>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="btn-primary flex items-center space-x-2"
        >
          <Save size={18} />
          <span>Save Configuration</span>
        </button>
      </div>
    </div>
  );
};

export default ConfigurationTab;