import { Dropbox } from 'dropbox';
import { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { ConfigService } from './configService';
import { LoggerService } from './loggerService';
import type { CloudProvider, CloudFile, CloudStatus, CloudProgressCallback } from './cloudService';

const DROPBOX_CLIENT_ID = process.env.DROPBOX_CLIENT_ID ?? '';
const DROPBOX_CLIENT_SECRET = process.env.DROPBOX_CLIENT_SECRET ?? '';
const REDIRECT_URI = 'http://localhost:8977/callback';

export class DropboxProvider implements CloudProvider {
  readonly name = 'Dropbox';
  private dbx: Dropbox | null = null;
  private userEmail: string | null = null;

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
  ) {
    const tokens = this.config.get('dropboxTokens');
    if (tokens?.accessToken) {
      this.dbx = new Dropbox({ accessToken: tokens.accessToken });
    }
  }

  async authenticate(): Promise<void> {
    const dbxAuth = new Dropbox({
      clientId: DROPBOX_CLIENT_ID,
      clientSecret: DROPBOX_CLIENT_SECRET,
    });

    const authUrl = await (dbxAuth as unknown as {
      auth: { getAuthenticationUrl: (uri: string, state: string, type: string) => Promise<string> };
    }).auth.getAuthenticationUrl(REDIRECT_URI, 'state', 'code');

    const code = await this.openAuthWindow(authUrl as string);

    const tokenResponse = await (dbxAuth as unknown as {
      auth: { getAccessTokenFromCode: (uri: string, code: string) => Promise<{ result: { access_token: string; refresh_token?: string } }> };
    }).auth.getAccessTokenFromCode(REDIRECT_URI, code);

    const { access_token, refresh_token } = tokenResponse.result;

    this.config.update({
      dropboxEnabled: true,
      dropboxTokens: {
        accessToken: access_token,
        refreshToken: refresh_token ?? '',
      },
    });

    this.dbx = new Dropbox({ accessToken: access_token });

    // Get user info
    const account = await this.dbx.usersGetCurrentAccount();
    this.userEmail = account.result.email;

    this.logger.info('Dropbox authenticated', { email: this.userEmail });
  }

  isAuthenticated(): boolean {
    return this.dbx !== null;
  }

  disconnect(): void {
    if (this.dbx) {
      this.dbx.authTokenRevoke().catch(() => {});
    }
    this.dbx = null;
    this.userEmail = null;
    this.config.update({
      dropboxEnabled: false,
      dropboxTokens: undefined,
    });
  }

  getStatus(): CloudStatus {
    return {
      connected: this.isAuthenticated(),
      email: this.userEmail ?? undefined,
    };
  }

  async upload(filePath: string, remoteName: string, onProgress?: CloudProgressCallback): Promise<string> {
    if (!this.dbx) throw new Error('Not authenticated with Dropbox');

    const fileSize = fs.statSync(filePath).size;
    const remotePath = `/${remoteName}`;

    onProgress?.(0, 'Uploading to Dropbox...');

    // For files > 150MB, use upload sessions
    const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
    if (fileSize > 150 * 1024 * 1024) {
      return this.uploadLarge(filePath, remotePath, fileSize, onProgress);
    }

    const contents = fs.readFileSync(filePath);
    const res = await this.dbx.filesUpload({
      path: remotePath,
      contents,
      mode: { '.tag': 'overwrite' },
    });

    onProgress?.(100, 'Upload complete');
    this.logger.info('Uploaded to Dropbox', { path: remotePath, size: fileSize });
    return res.result.id;
  }

  async download(remoteId: string, localPath: string, onProgress?: CloudProgressCallback): Promise<void> {
    if (!this.dbx) throw new Error('Not authenticated with Dropbox');

    onProgress?.(0, 'Downloading from Dropbox...');

    const res = await this.dbx.filesDownload({ path: remoteId });
    const fileBlob = (res.result as unknown as { fileBinary: Buffer }).fileBinary;
    fs.writeFileSync(localPath, fileBlob);

    onProgress?.(100, 'Download complete');
    this.logger.info('Downloaded from Dropbox', { remoteId, localPath });
  }

  async list(folder: string): Promise<CloudFile[]> {
    if (!this.dbx) throw new Error('Not authenticated with Dropbox');

    try {
      const res = await this.dbx.filesListFolder({ path: `/${folder}` });
      return res.result.entries
        .filter((e): e is typeof e & { '.tag': 'file' } => e['.tag'] === 'file')
        .map((f) => ({
          id: f.id ?? f.path_lower ?? '',
          name: f.name,
          size: (f as unknown as { size: number }).size ?? 0,
          modifiedTime: (f as unknown as { server_modified: string }).server_modified ?? '',
          provider: 'dropbox' as const,
        }));
    } catch (err: unknown) {
      // Folder doesn't exist yet
      const error = err as { status?: number };
      if (error.status === 409) return [];
      throw err;
    }
  }

  async delete(remoteId: string): Promise<void> {
    if (!this.dbx) throw new Error('Not authenticated with Dropbox');
    await this.dbx.filesDeleteV2({ path: remoteId });
    this.logger.info('Deleted from Dropbox', { remoteId });
  }

  private async uploadLarge(
    filePath: string,
    remotePath: string,
    fileSize: number,
    onProgress?: CloudProgressCallback,
  ): Promise<string> {
    if (!this.dbx) throw new Error('Not authenticated');

    const CHUNK_SIZE = 8 * 1024 * 1024;
    const fd = fs.openSync(filePath, 'r');
    let offset = 0;

    // Start session
    const firstChunk = Buffer.alloc(Math.min(CHUNK_SIZE, fileSize));
    fs.readSync(fd, firstChunk, 0, firstChunk.length, 0);
    offset += firstChunk.length;

    const startRes = await this.dbx.filesUploadSessionStart({
      close: false,
      contents: firstChunk,
    });
    const sessionId = startRes.result.session_id;

    // Append chunks
    while (offset < fileSize - CHUNK_SIZE) {
      const chunk = Buffer.alloc(CHUNK_SIZE);
      fs.readSync(fd, chunk, 0, CHUNK_SIZE, offset);
      await this.dbx.filesUploadSessionAppendV2({
        cursor: { session_id: sessionId, offset },
        close: false,
        contents: chunk,
      });
      offset += CHUNK_SIZE;
      onProgress?.(Math.round((offset / fileSize) * 100), 'Uploading...');
    }

    // Finish
    const remaining = fileSize - offset;
    const lastChunk = Buffer.alloc(remaining);
    fs.readSync(fd, lastChunk, 0, remaining, offset);
    fs.closeSync(fd);

    const finishRes = await this.dbx.filesUploadSessionFinish({
      cursor: { session_id: sessionId, offset },
      commit: { path: remotePath, mode: { '.tag': 'overwrite' } },
      contents: lastChunk,
    });

    onProgress?.(100, 'Upload complete');
    return finishRes.result.id;
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
