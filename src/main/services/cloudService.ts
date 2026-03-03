import { LoggerService } from './loggerService';
import { ConfigService } from './configService';
import { GoogleDriveProvider } from './googleDriveProvider';
import { DropboxProvider } from './dropboxProvider';

export interface CloudFile {
  id: string;
  name: string;
  size: number;
  modifiedTime: string;
  provider: 'google' | 'dropbox';
}

export interface CloudStatus {
  connected: boolean;
  email?: string;
  lastSync?: string;
}

export type CloudProgressCallback = (progress: number, message: string) => void;

export interface CloudProvider {
  readonly name: string;
  authenticate(): Promise<void>;
  isAuthenticated(): boolean;
  disconnect(): void;
  getStatus(): CloudStatus;
  upload(filePath: string, remoteName: string, onProgress?: CloudProgressCallback): Promise<string>;
  download(remoteId: string, localPath: string, onProgress?: CloudProgressCallback): Promise<void>;
  list(folder: string): Promise<CloudFile[]>;
  delete(remoteId: string): Promise<void>;
}

export class CloudService {
  private providers: Map<string, CloudProvider> = new Map();

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
  ) {
    this.providers.set('google', new GoogleDriveProvider(config, logger));
    this.providers.set('dropbox', new DropboxProvider(config, logger));
  }

  getProvider(name: 'google' | 'dropbox'): CloudProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Unknown cloud provider: ${name}`);
    }
    return provider;
  }

  async authenticate(providerName: 'google' | 'dropbox'): Promise<void> {
    const provider = this.getProvider(providerName);
    await provider.authenticate();
    this.logger.info(`Authenticated with ${providerName}`);
  }

  disconnect(providerName: 'google' | 'dropbox'): void {
    const provider = this.getProvider(providerName);
    provider.disconnect();
    this.logger.info(`Disconnected from ${providerName}`);
  }

  getStatus(providerName: 'google' | 'dropbox'): CloudStatus {
    return this.getProvider(providerName).getStatus();
  }

  async upload(
    filePath: string,
    providerName: 'google' | 'dropbox',
    onProgress?: CloudProgressCallback,
  ): Promise<string> {
    const provider = this.getProvider(providerName);
    const folder = this.config.get('cloudBackupFolder');
    const fileName = require('path').basename(filePath);
    return provider.upload(filePath, `${folder}/${fileName}`, onProgress);
  }

  async download(
    remoteId: string,
    localPath: string,
    providerName: 'google' | 'dropbox',
    onProgress?: CloudProgressCallback,
  ): Promise<void> {
    const provider = this.getProvider(providerName);
    await provider.download(remoteId, localPath, onProgress);
  }

  async list(providerName: 'google' | 'dropbox'): Promise<CloudFile[]> {
    const provider = this.getProvider(providerName);
    const folder = this.config.get('cloudBackupFolder');
    return provider.list(folder);
  }

  async delete(remoteId: string, providerName: 'google' | 'dropbox'): Promise<void> {
    const provider = this.getProvider(providerName);
    await provider.delete(remoteId);
  }
}
