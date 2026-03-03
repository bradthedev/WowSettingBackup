import Store from 'electron-store';
import { randomUUID } from 'crypto';
import { LoggerService } from './loggerService';

export interface BackupHistoryItem {
  id: string;
  name: string;
  path: string;
  size: number;
  date: string;
  type: 'manual' | 'scheduled' | 'pre-restore';
  status: 'success' | 'failed';
  duration: number;
}

interface HistoryStore {
  backups: BackupHistoryItem[];
}

export class BackupHistoryService {
  private store: Store<HistoryStore>;

  constructor(private logger: LoggerService) {
    this.store = new Store<HistoryStore>({
      name: 'wow-backup-history',
      defaults: { backups: [] },
    });
  }

  getAll(): BackupHistoryItem[] {
    return this.store.get('backups');
  }

  add(entry: Omit<BackupHistoryItem, 'id'>): BackupHistoryItem {
    const item: BackupHistoryItem = { id: randomUUID(), ...entry };
    const backups = this.getAll();
    backups.unshift(item);
    this.store.set('backups', backups);
    this.logger.info('Backup history entry added', { id: item.id, name: item.name });
    return item;
  }

  remove(id: string): void {
    const backups = this.getAll().filter((b) => b.id !== id);
    this.store.set('backups', backups);
    this.logger.info('Backup history entry removed', { id });
  }

  cleanup(retentionDays: number): number {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const backups = this.getAll();
    const kept = backups.filter((b) => new Date(b.date).getTime() > cutoff);
    const removed = backups.length - kept.length;
    if (removed > 0) {
      this.store.set('backups', kept);
      this.logger.info('Cleaned up old backup history', { removed, kept: kept.length });
    }
    return removed;
  }
}
