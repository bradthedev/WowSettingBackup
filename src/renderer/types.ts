export interface BackupConfig {
  wowVersion: string;
  wowPath: string;
  tempDir: string;
  backupDir: string;
  backupRetention: number;
  verboseLogging: boolean;
  fastCompression: boolean;
  schedulerEnabled: boolean;
  scheduleInterval: number;
  scheduleUnit: 'minutes' | 'hours' | 'days';
  minimizeToTray: boolean;
  runInBackground: boolean;
  use7zip: boolean;
  compressionThreads: number;
}

export interface BackupHistoryItem {
  id: string;
  name: string;
  path: string;
  size: number;
  sizeFormatted: string;
  date: Date;
  type: 'manual' | 'scheduled';
  status: 'completed' | 'failed';
  duration?: number;
  filesCount?: number;
  version?: string;
}