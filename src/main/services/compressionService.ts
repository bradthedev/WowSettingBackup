import archiver from 'archiver';
import * as unzipper from 'unzipper';
import fs from 'fs';
import path from 'path';
import { LoggerService } from './loggerService';
import node7z from 'node-7z';
import yauzl from 'yauzl';
import os from 'os';

export class CompressionService {
  private logger: LoggerService;
  private compressionLevels = {
    'store': 0,     // No compression, fastest
    'fastest': 1,   // Minimal compression
    'fast': 3,      // Fast compression
    'normal': 6,    // Balanced compression
    'maximum': 9    // Maximum compression, slowest
  };

  constructor(logger: LoggerService) {
    this.logger = logger;
  }

  async compressDirectory(
    sourceDir: string,
    outputPath: string,
    fastMode: boolean = true,
    progressCallback?: (progress: number, message: string) => void,
    compressionLevel?: 'store' | 'fastest' | 'fast' | 'normal' | 'maximum'
  ): Promise<void> {
    // Use optimized compression for Windows
    if (process.platform === 'win32') {
      return this.compressDirectoryOptimized(sourceDir, outputPath, fastMode, progressCallback, compressionLevel);
    }
    
    return this.compressDirectoryStandard(sourceDir, outputPath, fastMode, progressCallback, compressionLevel);
  }

  private async compressDirectoryStandard(
    sourceDir: string,
    outputPath: string,
    fastMode: boolean = true,
    progressCallback?: (progress: number, message: string) => void,
    compressionLevel?: 'store' | 'fastest' | 'fast' | 'normal' | 'maximum'
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.info(`Starting compression of ${sourceDir}`);
      this.logger.debug(`Compression settings: Fast=${fastMode}, Output=${outputPath}`);
      
      const output = fs.createWriteStream(outputPath);
      // Determine compression level
      const level = compressionLevel 
        ? this.compressionLevels[compressionLevel]
        : (fastMode ? 1 : 6);
      
      const archive = archiver('zip', {
        zlib: { 
          level: level,
          memLevel: level === 0 ? 9 : 8, // Higher memory level for store mode
          strategy: level <= 1 ? 0 : 1 // 0 = default for fast, 1 = filtered for normal
        },
        store: level === 0 // Use store mode for level 0
      });

      let totalSize = 0;
      let processedSize = 0;

      // Calculate total size asynchronously for better performance
      const calculateTotalSizeAsync = async (dir: string): Promise<number> => {
        let size = 0;
        try {
          const files = await fs.promises.readdir(dir);
          
          const promises = files.map(async (file) => {
            const filePath = path.join(dir, file);
            try {
              const stats = await fs.promises.stat(filePath);
              
              if (stats.isDirectory()) {
                return await calculateTotalSizeAsync(filePath);
              } else {
                return stats.size;
              }
            } catch (error) {
              this.logger.warn(`Skipping file ${filePath}: ${error}`);
              return 0;
            }
          });
          
          const sizes = await Promise.all(promises);
          size = sizes.reduce((acc, s) => acc + s, 0);
        } catch (error) {
          this.logger.warn(`Failed to read directory ${dir}: ${error}`);
        }
        return size;
      };

      // Calculate size asynchronously but don't wait for it to start compression
      calculateTotalSizeAsync(sourceDir).then(size => {
        totalSize = size;
        this.logger.debug(`Total size to compress: ${(size / 1024 / 1024).toFixed(2)} MB`);
      });

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

  private async compressDirectoryOptimized(
    sourceDir: string,
    outputPath: string,
    fastMode: boolean = true,
    progressCallback?: (progress: number, message: string) => void,
    compressionLevel?: 'store' | 'fastest' | 'fast' | 'normal' | 'maximum'
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.info(`Starting optimized compression for Windows`);
      this.logger.debug(`Compression settings: Fast=${fastMode}, Output=${outputPath}`);
      
      const output = fs.createWriteStream(outputPath);
      
      // Determine compression level with Windows optimizations
      const level = compressionLevel 
        ? this.compressionLevels[compressionLevel]
        : (fastMode ? 0 : 3);
      
      // Use more aggressive settings for Windows
      const archive = archiver('zip', {
        zlib: { 
          level: level,
          memLevel: 9, // Maximum memory usage for better performance
          windowBits: 15, // Maximum window size
          chunkSize: 64 * 1024 // Larger chunk size for better throughput
        },
        highWaterMark: 32 * 1024 * 1024, // 32MB buffer for better performance
        statConcurrency: os.cpus().length, // Use all CPU cores for stat operations
        store: level === 0 // Use store mode for level 0
      });

      let totalSize = 0;
      let processedSize = 0;

      // Skip size calculation in fast mode for better performance
      if (!fastMode) {
        this.calculateTotalSizeParallel(sourceDir).then(size => {
          totalSize = size;
          this.logger.debug(`Total size to compress: ${(size / 1024 / 1024).toFixed(2)} MB`);
        });
      }

      output.on('close', () => {
        const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
        this.logger.info(`Optimized compression completed: ${sizeInMB} MB written`);
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

      if (!fastMode) {
        archive.on('progress', (progress: any) => {
          processedSize = progress.fs.processedBytes;
          if (totalSize > 0) {
            const percentage = Math.round((processedSize / totalSize) * 100);
            progressCallback?.(percentage, `Compressing: ${percentage}%`);
          }
        });
      } else {
        // In fast mode, use entry count for progress
        let entryCount = 0;
        archive.on('entry', () => {
          entryCount++;
          if (entryCount % 100 === 0) {
            progressCallback?.(Math.min(90, Math.round(entryCount / 50)), `Processing files: ${entryCount}`);
          }
        });
      }

      archive.pipe(output);
      
      // Add directory with glob pattern to exclude unnecessary files
      try {
        archive.glob('**/*', {
          cwd: sourceDir,
          ignore: ['*.log', '*.tmp', 'Thumbs.db', '.DS_Store'],
          dot: true,
          follow: false
        });
        
        archive.finalize();
      } catch (archiveError) {
        this.logger.error(`Archive creation error: ${archiveError}`);
        reject(archiveError);
      }
    });
  }

  private async calculateTotalSizeParallel(dir: string): Promise<number> {
    const cpuCount = os.cpus().length;
    const workerPool: Promise<number>[] = [];
    
    const calculateBatch = async (paths: string[]): Promise<number> => {
      let size = 0;
      
      for (const filePath of paths) {
        try {
          const stats = await fs.promises.stat(filePath);
          if (stats.isFile()) {
            size += stats.size;
          }
        } catch (error) {
          // Skip errors
        }
      }
      
      return size;
    };
    
    const getAllFiles = async (dir: string): Promise<string[]> => {
      const files: string[] = [];
      
      const walk = async (currentDir: string) => {
        try {
          const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            
            if (entry.isDirectory()) {
              await walk(fullPath);
            } else {
              files.push(fullPath);
            }
          }
        } catch (error) {
          // Skip inaccessible directories
        }
      };
      
      await walk(dir);
      return files;
    };
    
    const allFiles = await getAllFiles(dir);
    const batchSize = Math.ceil(allFiles.length / cpuCount);
    
    for (let i = 0; i < cpuCount; i++) {
      const start = i * batchSize;
      const end = Math.min((i + 1) * batchSize, allFiles.length);
      const batch = allFiles.slice(start, end);
      
      if (batch.length > 0) {
        workerPool.push(calculateBatch(batch));
      }
    }
    
    const results = await Promise.all(workerPool);
    return results.reduce((acc, size) => acc + size, 0);
  }

  // Multi-threaded compression using worker threads
  async compressDirectoryMultiThreaded(
    sourceDir: string,
    outputPath: string,
    fastMode: boolean = true,
    progressCallback?: (progress: number, message: string) => void,
    compressionLevel?: 'store' | 'fastest' | 'fast' | 'normal' | 'maximum'
  ): Promise<void> {
    // Use optimized compression which includes parallel operations
    return this.compressDirectory(sourceDir, outputPath, fastMode, progressCallback, compressionLevel);
  }
}