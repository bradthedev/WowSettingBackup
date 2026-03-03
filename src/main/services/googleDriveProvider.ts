import { google, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { ConfigService } from './configService';
import { LoggerService } from './loggerService';
import type { CloudProvider, CloudFile, CloudStatus, CloudProgressCallback } from './cloudService';

// These would be set from environment or a config file in production
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const REDIRECT_URI = 'http://localhost:8976/callback';

export class GoogleDriveProvider implements CloudProvider {
  readonly name = 'Google Drive';
  private oauth2Client: OAuth2Client;
  private drive: drive_v3.Drive | null = null;
  private userEmail: string | null = null;

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      REDIRECT_URI,
    );

    // Restore tokens from config
    const tokens = this.config.get('googleDriveTokens');
    if (tokens) {
      this.oauth2Client.setCredentials({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expiry_date: tokens.expiryDate,
      });
      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    }
  }

  async authenticate(): Promise<void> {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email'],
      prompt: 'consent',
    });

    const code = await this.openAuthWindow(authUrl);
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    this.config.update({
      googleDriveEnabled: true,
      googleDriveTokens: {
        accessToken: tokens.access_token ?? '',
        refreshToken: tokens.refresh_token ?? '',
        expiryDate: tokens.expiry_date ?? undefined,
      },
    });

    this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });

    // Get user email
    const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    this.userEmail = userInfo.data.email ?? null;

    this.logger.info('Google Drive authenticated', { email: this.userEmail });
  }

  isAuthenticated(): boolean {
    return this.drive !== null && this.oauth2Client.credentials.access_token !== undefined;
  }

  disconnect(): void {
    this.oauth2Client.revokeCredentials().catch(() => {});
    this.drive = null;
    this.userEmail = null;
    this.config.update({
      googleDriveEnabled: false,
      googleDriveTokens: undefined,
    });
  }

  getStatus(): CloudStatus {
    return {
      connected: this.isAuthenticated(),
      email: this.userEmail ?? undefined,
    };
  }

  async upload(filePath: string, remoteName: string, onProgress?: CloudProgressCallback): Promise<string> {
    if (!this.drive) throw new Error('Not authenticated with Google Drive');

    const fileName = path.basename(remoteName);
    const folderName = path.dirname(remoteName);
    const fileSize = fs.statSync(filePath).size;

    onProgress?.(0, 'Finding or creating folder...');
    const folderId = await this.getOrCreateFolder(folderName);

    onProgress?.(10, 'Uploading...');
    const res = await this.drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: 'application/octet-stream',
        body: fs.createReadStream(filePath),
      },
      fields: 'id',
    });

    onProgress?.(100, 'Upload complete');
    const fileId = res.data.id;
    if (!fileId) throw new Error('Upload returned no file ID');

    this.logger.info('Uploaded to Google Drive', { fileId, fileName, fileSize });
    return fileId;
  }

  async download(remoteId: string, localPath: string, onProgress?: CloudProgressCallback): Promise<void> {
    if (!this.drive) throw new Error('Not authenticated with Google Drive');

    onProgress?.(0, 'Downloading...');
    const res = await this.drive.files.get(
      { fileId: remoteId, alt: 'media' },
      { responseType: 'stream' },
    );

    const dest = fs.createWriteStream(localPath);
    await new Promise<void>((resolve, reject) => {
      (res.data as NodeJS.ReadableStream)
        .pipe(dest)
        .on('finish', () => {
          onProgress?.(100, 'Download complete');
          resolve();
        })
        .on('error', reject);
    });

    this.logger.info('Downloaded from Google Drive', { remoteId, localPath });
  }

  async list(folder: string): Promise<CloudFile[]> {
    if (!this.drive) throw new Error('Not authenticated with Google Drive');

    const folderId = await this.findFolder(folder);
    if (!folderId) return [];

    const res = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, size, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
    });

    return (res.data.files ?? []).map((f) => ({
      id: f.id ?? '',
      name: f.name ?? '',
      size: parseInt(f.size ?? '0', 10),
      modifiedTime: f.modifiedTime ?? '',
      provider: 'google' as const,
    }));
  }

  async delete(remoteId: string): Promise<void> {
    if (!this.drive) throw new Error('Not authenticated with Google Drive');
    await this.drive.files.delete({ fileId: remoteId });
    this.logger.info('Deleted from Google Drive', { remoteId });
  }

  private async findFolder(name: string): Promise<string | null> {
    if (!this.drive) return null;
    const res = await this.drive.files.list({
      q: `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id)',
      pageSize: 1,
    });
    return res.data.files?.[0]?.id ?? null;
  }

  private async getOrCreateFolder(name: string): Promise<string> {
    const existing = await this.findFolder(name);
    if (existing) return existing;

    if (!this.drive) throw new Error('Not authenticated');
    const res = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });

    const id = res.data.id;
    if (!id) throw new Error('Failed to create folder');
    return id;
  }

  private openAuthWindow(authUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      authWindow.loadURL(authUrl);

      authWindow.webContents.on('will-redirect', (_event, url) => {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');
        if (code) {
          resolve(code);
          authWindow.close();
        }
        const error = urlObj.searchParams.get('error');
        if (error) {
          reject(new Error(`OAuth error: ${error}`));
          authWindow.close();
        }
      });

      authWindow.on('closed', () => {
        reject(new Error('Auth window closed'));
      });
    });
  }
}
