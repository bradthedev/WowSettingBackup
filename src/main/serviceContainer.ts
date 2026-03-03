import { LoggerService } from './services/loggerService';
import { ConfigService } from './services/configService';
import { CompressionService } from './services/compressionService';
import { BackupHistoryService } from './services/backupHistoryService';
import { BackupService } from './services/backupService';
import { SchedulerService } from './services/schedulerService';
import { CloudService } from './services/cloudService';
import { DiscoveryService } from './services/discoveryService';
import { SyncServerService } from './services/syncServerService';
import { SyncClientService } from './services/syncClientService';

export class ServiceContainer {
  readonly logger: LoggerService;
  readonly config: ConfigService;
  readonly compression: CompressionService;
  readonly backupHistory: BackupHistoryService;
  readonly backup: BackupService;
  readonly scheduler: SchedulerService;
  readonly cloud: CloudService;
  readonly discovery: DiscoveryService;
  readonly syncServer: SyncServerService;
  readonly syncClient: SyncClientService;

  constructor() {
    this.logger = new LoggerService();
    this.config = new ConfigService();
    this.compression = new CompressionService(this.logger);
    this.backupHistory = new BackupHistoryService(this.logger);
    this.backup = new BackupService(this.config, this.compression, this.backupHistory, this.logger);
    this.scheduler = new SchedulerService(this.backup, this.config, this.logger);
    this.cloud = new CloudService(this.config, this.logger);
    this.discovery = new DiscoveryService(this.config, this.logger);
    this.syncServer = new SyncServerService(this.config, this.backupHistory, this.logger);
    this.syncClient = new SyncClientService(this.config, this.backup, this.logger);
    this.logger.info('Service container initialized');
  }
}

let container: ServiceContainer | null = null;

export function getContainer(): ServiceContainer {
  if (!container) {
    container = new ServiceContainer();
  }
  return container;
}
