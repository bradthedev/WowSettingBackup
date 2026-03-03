import { createReadStream, createWriteStream, readFileSync, writeFileSync, statSync, readdirSync, mkdirSync } from 'fs';
import { stat, readdir } from 'fs/promises';
import path from 'path';
import { PassThrough } from 'stream';
import tar from 'tar-stream';
import { compressFrame, decompressFrame } from 'lz4-napi';
import { LoggerService } from './loggerService';

export type ProgressCallback = (progress: number, message: string) => void;

export class CompressionService {
  constructor(private logger: LoggerService) {}

  async compress(
    sourcePaths: string[],
    outputPath: string,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    this.logger.info('Starting compression', { sourcePaths, outputPath });

    let totalFiles = 0;
    let processedFiles = 0;

    for (const sourcePath of sourcePaths) {
      totalFiles += await this.countFiles(sourcePath);
    }

    // Step 1: Create tar archive in memory
    onProgress?.(0, 'Creating archive...');
    const tarBuffer = await this.createTarBuffer(sourcePaths, () => {
      processedFiles++;
      const progress = totalFiles > 0 ? (processedFiles / totalFiles) * 50 : 0;
      onProgress?.(progress, `Archiving: ${processedFiles}/${totalFiles} files`);
    });

    // Step 2: Compress with LZ4
    onProgress?.(50, 'Compressing with LZ4...');
    const compressed = await compressFrame(tarBuffer);

    // Step 3: Write to output
    onProgress?.(90, 'Writing file...');
    writeFileSync(outputPath, compressed);

    const outputSize = statSync(outputPath).size;
    this.logger.info('Compression complete', {
      outputPath,
      outputSize,
      tarSize: tarBuffer.length,
      totalFiles,
      ratio: `${((outputSize / tarBuffer.length) * 100).toFixed(1)}%`,
    });
    onProgress?.(100, 'Compression complete');
  }

  async decompress(
    archivePath: string,
    outputDir: string,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    this.logger.info('Starting decompression', { archivePath, outputDir });

    // Step 1: Read and decompress LZ4
    onProgress?.(0, 'Reading compressed file...');
    const compressed = readFileSync(archivePath);

    onProgress?.(20, 'Decompressing LZ4...');
    const tarBuffer = await decompressFrame(compressed);

    // Step 2: Extract tar
    onProgress?.(50, 'Extracting files...');
    let extractedFiles = 0;

    await new Promise<void>((resolve, reject) => {
      const extract = tar.extract();
      const bufferStream = new PassThrough();

      extract.on('entry', (header, stream, next) => {
        const filePath = path.join(outputDir, header.name);

        if (header.type === 'directory') {
          mkdirSync(filePath, { recursive: true });
          stream.resume();
          next();
        } else {
          const dir = path.dirname(filePath);
          mkdirSync(dir, { recursive: true });

          const fileOutput = createWriteStream(filePath);
          stream.pipe(fileOutput);
          stream.on('end', () => {
            extractedFiles++;
            onProgress?.(50 + (extractedFiles * 50 / Math.max(extractedFiles, 1)), `Extracted: ${extractedFiles} files`);
            next();
          });
        }
      });

      extract.on('finish', resolve);
      extract.on('error', reject);

      bufferStream.end(tarBuffer);
      bufferStream.pipe(extract);
    });

    this.logger.info('Decompression complete', { outputDir, extractedFiles });
    onProgress?.(100, 'Extraction complete');
  }

  private async createTarBuffer(
    sourcePaths: string[],
    onFile: () => void,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const pack = tar.pack();
      const chunks: Buffer[] = [];

      pack.on('data', (chunk: Buffer) => chunks.push(chunk));
      pack.on('end', () => resolve(Buffer.concat(chunks)));
      pack.on('error', reject);

      (async () => {
        for (const sourcePath of sourcePaths) {
          const baseName = path.basename(sourcePath);
          await this.packDirectory(pack, sourcePath, baseName, onFile);
        }
        pack.finalize();
      })().catch(reject);
    });
  }

  private async packDirectory(
    pack: ReturnType<typeof tar.pack>,
    dirPath: string,
    prefix: string,
    onFile: () => void,
  ): Promise<void> {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const entryName = path.join(prefix, entry.name);

      if (entry.isDirectory()) {
        pack.entry({ name: entryName + '/', size: 0, type: 'directory' });
        await this.packDirectory(pack, fullPath, entryName, onFile);
      } else if (entry.isFile()) {
        const fileStat = statSync(fullPath);
        const entryStream = pack.entry({
          name: entryName,
          size: fileStat.size,
          type: 'file',
          mtime: fileStat.mtime,
        });

        await new Promise<void>((resolve, reject) => {
          const readStream = createReadStream(fullPath);
          readStream.pipe(entryStream);
          entryStream.on('finish', () => {
            onFile();
            resolve();
          });
          entryStream.on('error', reject);
          readStream.on('error', reject);
        });
      }
    }
  }

  private async countFiles(dirPath: string): Promise<number> {
    let count = 0;
    const s = await stat(dirPath);
    if (!s.isDirectory()) return 1;

    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += await this.countFiles(path.join(dirPath, entry.name));
      } else if (entry.isFile()) {
        count++;
      }
    }
    return count;
  }
}
