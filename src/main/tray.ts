import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron';
import zlib from 'node:zlib';
import { loadConfig } from './config';
import { runBackup } from './backup';
import { mountShare, mountStatus } from './smb';
import { uploadBackup } from './remote';

// ---------------------------------------------------------------------------
// Minimal PNG generator (no external deps)
// ---------------------------------------------------------------------------

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

/** Creates a solid-color N×N PNG as a Buffer (RGBA, no interlace). */
function solidColorPng(size: number, r: number, g: number, b: number, a: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);  // bit depth = 8
  ihdr.writeUInt8(6, 9);  // color type = RGBA
  // bytes 10-12 stay 0: compression=0, filter=0, interlace=0

  // Raw image data: one filter byte per scanline + RGBA for each pixel
  const scanlineSize = 1 + size * 4;
  const raw = Buffer.alloc(size * scanlineSize);
  for (let y = 0; y < size; y++) {
    const base = y * scanlineSize;
    raw[base] = 0; // filter = None
    for (let x = 0; x < size; x++) {
      const p = base + 1 + x * 4;
      raw[p] = r; raw[p + 1] = g; raw[p + 2] = b; raw[p + 3] = a;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function buildTrayIcon(): Electron.NativeImage {
  let png: Buffer;
  if (process.platform === 'darwin') {
    // macOS template image: solid black, system handles light/dark rendering.
    png = solidColorPng(16, 0, 0, 0, 255);
  } else {
    // Windows / Linux: gold to match the app accent colour.
    png = solidColorPng(16, 244, 196, 48, 255);
  }
  const img = nativeImage.createFromBuffer(png);
  if (process.platform === 'darwin') img.setTemplateImage(true);
  return img;
}

// ---------------------------------------------------------------------------
// Tray lifecycle
// ---------------------------------------------------------------------------

let tray: Tray | null = null;

/**
 * Run a backup with optional auto-upload, exactly like the IPC handler does.
 * Used by the tray "Run Backup Now" menu item.
 */
async function performBackupNow(): Promise<void> {
  const cfg = loadConfig();
  const result = await runBackup(cfg.enabledFlavors);
  if (!cfg.smb.autoUploadAfterBackup || result.created.length === 0) return;

  const status = await mountStatus();
  const mount = status.mounted ? status : await mountShare();
  if (!mount.mounted) return;

  for (const backup of result.created) {
    await uploadBackup(backup.path).catch((err: Error) =>
      console.error('[tray] Auto-upload failed:', err.message)
    );
  }
}

function buildContextMenu(win: BrowserWindow): Electron.Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        win.show();
        if (process.platform === 'darwin') app.focus();
      }
    },
    {
      label: 'Run Backup Now',
      click: () => {
        performBackupNow().catch((err: Error) =>
          console.error('[tray] Backup failed:', err.message)
        );
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);
}

/** Create the system tray icon and wire up window show/hide behaviour. */
export function setupTray(win: BrowserWindow): void {
  tray = new Tray(buildTrayIcon());
  tray.setToolTip('WoW Settings Backup');

  const menu = buildContextMenu(win);
  tray.setContextMenu(menu);

  // Left-click toggles the window on all platforms.
  tray.on('click', () => {
    if (win.isVisible() && win.isFocused()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });

  // On Windows a double-click also shows the window.
  tray.on('double-click', () => {
    win.show();
    win.focus();
  });
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
