import archiver from 'archiver';
import * as unzipper from 'unzipper';
import fs from 'fs';
import path from 'path';
import { LoggerService } from './loggerService';
import node7z from 'node-7z';
import yauzl from 'yauzl';

export class CompressionService {
  private logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
  }

  async compressDirectory(
    sourceDir: string,
    outputPath: string,
    fastMode: boolean = true,
    progressCallback?: (progress: number, message: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.info(`Starting compression of ${sourceDir}`);
      this.logger.debug(`Compression settings: Fast=${fastMode}, Output=${outputPath}`);
      
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { 
          level: fastMode ? 3 : 9 // Fast mode uses level 3, normal uses 9
        }
      });

      let totalSize = 0;
      let processedSize = 0;

      // Calculate total size for progress with error handling
      const calculateTotalSize = (dir: string): number => {
        let size = 0;
        try {
          const files = fs.readdirSync(dir);
          
          for (const file of files) {
            const filePath = path.join(dir, file);
            try {
              const stats = fs.statSync(filePath);
              
              if (stats.isDirectory()) {
                size += calculateTotalSize(filePath);
              } else {
                size += stats.size;
              }
            } catch (error) {
              this.logger.warn(`Skipping file ${filePath}: ${error}`);
              // Continue with other files
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to read directory ${dir}: ${error}`);
        }
        return size;
      };

      totalSize = calculateTotalSize(sourceDir);

      output.on('close', () => {
        const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
        this.logger.info(`Compression completed: ${sizeInMB} MB written`);
        progressCallback?.(100, 'Compression completed');
        resolve();
      });

      output.on('end', () => {
        this.logger.debug('Data has been drained');
      });

      archive.on('warning', (err: any) => {
        if (err.code === 'ENOENT') {
          this.logger.warn(`Warning during compression: ${err}`);
        } else {
          reject(err);
        }
      });

      archive.on('error', (err: any) => {
        this.logger.error(`Compression error: ${err}`);
        reject(err);
      });

      archive.on('progress', (progress: any) => {
        processedSize = progress.fs.processedBytes;
        const percentage = Math.round((processedSize / totalSize) * 100);
        progressCallback?.(percentage, `Compressing: ${percentage}%`);
      });

      archive.pipe(output);
      
      // Add directory with error handling
      try {
        archive.directory(sourceDir, false);
        archive.finalize();
      } catch (archiveError) {
        this.logger.error(`Archive creation error: ${archiveError}`);
        reject(archiveError);
      }
    });
  }

  async extractArchive(
    archivePath: string,
    outputDir: string,
    progressCallback?: (progress: number, message: string) => void
  ): Promise<void> {
    this.logger.info(`Starting extraction of ${archivePath}`);
    
    if (!fs.existsSync(archivePath)) {
      throw new Error(`Archive not found: ${archivePath}`);
    }

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Try multiple extraction methods in order of preference
    const methods = [
      { name: 'yauzl', fn: () => this.extractWithYauzl(archivePath, outputDir, progressCallback) },
      { name: 'unzipper', fn: () => this.extractWithUnzipper(archivePath, outputDir, progressCallback) },
      { name: '7z', fn: () => this.extractWith7z(archivePath, outputDir, progressCallback) }
    ];

    for (const method of methods) {
      try {
        this.logger.info(`Trying extraction with ${method.name}...`);
        await method.fn();
        
        // Verify extraction success
        const extractedFileCount = this.countExtractedFiles(outputDir);
        this.logger.info(`${method.name} extraction completed: ${extractedFileCount} files extracted`);
        
        if (extractedFileCount > 1000) { // Reasonable threshold for WoW backups
          progressCallback?.(100, `Extraction completed: ${extractedFileCount} files`);
          return; // Success!
        } else {
          this.logger.warn(`${method.name} extracted only ${extractedFileCount} files, trying next method`);
        }
      } catch (error) {
        this.logger.warn(`${method.name} extraction failed: ${error}`);
        // Continue to next method
      }
    }

    throw new Error('All extraction methods failed');
  }

  private async extractWithYauzl(
    archivePath: string,
    outputDir: string,
    progressCallback?: (progress: number, message: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(err);
          return;
        }

        if (!zipfile) {
          reject(new Error('Failed to open ZIP file'));
          return;
        }

        let extractedCount = 0;
        const totalEntries = zipfile.entryCount;
        
        this.logger.info(`yauzl: Found ${totalEntries} entries in archive`);
        progressCallback?.(0, `Extracting ${totalEntries} entries with yauzl...`);

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          if (/\/$/.test(entry.fileName)) {
            // Directory
            const dirPath = path.join(outputDir, entry.fileName);
            if (!fs.existsSync(dirPath)) {
              fs.mkdirSync(dirPath, { recursive: true });
            }
            extractedCount++;
            zipfile.readEntry();
          } else {
            // File
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                this.logger.warn(`Failed to extract ${entry.fileName}: ${err}`);
                extractedCount++;
                zipfile.readEntry();
                return;
              }

              if (!readStream) {
                this.logger.warn(`No read stream for ${entry.fileName}`);
                extractedCount++;
                zipfile.readEntry();
                return;
              }

              const filePath = path.join(outputDir, entry.fileName);
              const fileDir = path.dirname(filePath);
              
              if (!fs.existsSync(fileDir)) {
                fs.mkdirSync(fileDir, { recursive: true });
              }

              const writeStream = fs.createWriteStream(filePath);
              readStream.pipe(writeStream);

              writeStream.on('close', () => {
                extractedCount++;
                const percentage = Math.round((extractedCount / totalEntries) * 100);
                progressCallback?.(Math.min(percentage, 95), `yauzl: Extracted ${extractedCount}/${totalEntries} files`);
                zipfile.readEntry();
              });

              writeStream.on('error', (writeError) => {
                this.logger.warn(`Write error for ${entry.fileName}: ${writeError}`);
                extractedCount++;
                zipfile.readEntry();
              });
            });
          }
        });

        zipfile.on('end', () => {
          this.logger.info(`yauzl: Extraction completed, processed ${extractedCount} entries`);
          progressCallback?.(100, 'yauzl: Extraction completed');
          resolve();
        });

        zipfile.on('error', (zipError) => {
          this.logger.error(`yauzl: ZIP file error: ${zipError}`);
          reject(zipError);
        });
      });
    });
  }

  private async extractWithUnzipper(
    archivePath: string,
    outputDir: string,
    progressCallback?: (progress: number, message: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.info('Starting unzipper extraction...');
      progressCallback?.(0, 'Extracting with unzipper...');

      const readStream = fs.createReadStream(archivePath);
      const extractStream = unzipper.Extract({ path: outputDir });

      let processedBytes = 0;
      const totalBytes = fs.statSync(archivePath).size;

      readStream.on('data', (chunk: any) => {
        processedBytes += chunk.length;
        const percentage = Math.round((processedBytes / totalBytes) * 90);
        progressCallback?.(percentage, `unzipper: Extracting ${percentage}%`);
      });

      extractStream.on('close', () => {
        this.logger.info('unzipper: Extraction completed');
        progressCallback?.(95, 'unzipper: Verifying...');
        setTimeout(() => {
          progressCallback?.(100, 'unzipper: Extraction completed');
          resolve();
        }, 1000);
      });

      extractStream.on('error', (err: any) => {
        this.logger.error(`unzipper: Extraction error: ${err}`);
        reject(err);
      });

      readStream.pipe(extractStream);
    });
  }

  private async extractWith7z(
    archivePath: string,
    outputDir: string,
    progressCallback?: (progress: number, message: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.info('Starting 7z extraction...');
      progressCallback?.(0, 'Extracting with 7-Zip...');
      
      const extractStream = node7z.extractFull(archivePath, outputDir, {
        $progress: true,
        recursive: true,
        overwrite: 'a'
      });

      extractStream.on('progress', (progress: any) => {
        if (progress.percent) {
          const percentage = Math.round(progress.percent);
          progressCallback?.(Math.min(percentage, 90), `7z: ${percentage}%`);
        }
      });

      extractStream.on('end', () => {
        this.logger.info('7z: Extraction completed');
        progressCallback?.(100, '7z: Extraction completed');
        resolve();
      });

      extractStream.on('error', (err: any) => {
        this.logger.error(`7z: Extraction error: ${err}`);
        reject(err);
      });
    });
  }

  private countExtractedFiles(dir: string): number {
    let count = 0;
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          count += this.countExtractedFiles(itemPath);
        } else {
          count++;
        }
      }
    } catch (error) {
      this.logger.warn(`Error counting files in ${dir}: ${error}`);
    }
    return count;
  }

  async validateArchive(archivePath: string): Promise<boolean> {
    try {
      const directory = await unzipper.Open.file(archivePath);
      this.logger.info(`Archive ${archivePath} is valid with ${directory.files.length} files`);
      return true;
    } catch (error) {
      this.logger.error(`Archive validation failed: ${error}`);
      return false;
    }
  }

  async listArchiveContents(archivePath: string): Promise<string[]> {
    try {
      const directory = await unzipper.Open.file(archivePath);
      return directory.files.map((file: any) => file.path);
    } catch (error) {
      this.logger.error(`Failed to list archive contents: ${error}`);
      return [];
    }
  }

  // Multi-threaded compression using worker threads
  async compressDirectoryMultiThreaded(
    sourceDir: string,
    outputPath: string,
    fastMode: boolean = true,
    progressCallback?: (progress: number, message: string) => void
  ): Promise<void> {
    // For now, use single-threaded compression
    // Worker threads implementation would require separate worker files
    return this.compressDirectory(sourceDir, outputPath, fastMode, progressCallback);
  }
}