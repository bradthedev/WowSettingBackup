import Store from "electron-store";
import fs from "fs";
import path from "path";
import { ConfigService } from "./configService";
import { LoggerService } from "./loggerService";

export interface BackupHistoryItem {
    id: string;
    name: string;
    path: string;
    size: number;
    sizeFormatted: string;
    date: Date;
    type: "manual" | "scheduled";
    status: "completed" | "failed";
    duration?: number; // in milliseconds
    filesCount?: number;
    version?: string; // WoW version at time of backup
}

export class BackupHistoryService {
    private store: Store<{ backupHistory: BackupHistoryItem[] }>;
    private logger: LoggerService;
    private configService: ConfigService;

    constructor(logger: LoggerService, configService: ConfigService) {
        this.logger = logger;
        this.configService = configService;
        this.store = new Store<{ backupHistory: BackupHistoryItem[] }>({
            name: "backup-history",
            defaults: {
                backupHistory: [],
            },
        });
    }

    /**
     * Add a new backup to the history
     */
    addBackupEntry(
        backupPath: string,
        type: "manual" | "scheduled" = "manual",
        duration?: number,
        filesCount?: number
    ): void {
        try {
            if (!fs.existsSync(backupPath)) {
                this.logger.warn(
                    `Cannot add backup to history: file does not exist: ${backupPath}`
                );
                return;
            }

            const stats = fs.statSync(backupPath);
            const fileName = path.basename(backupPath);
            const config = this.configService.getConfig();

            const backupItem: BackupHistoryItem = {
                id: this.generateId(),
                name: fileName,
                path: backupPath,
                size: stats.size,
                sizeFormatted: this.formatFileSize(stats.size),
                date: new Date(),
                type,
                status: "completed",
                duration,
                filesCount,
                version: config.wowVersion,
            };

            const history = this.getHistory();
            history.unshift(backupItem); // Add to beginning for newest first

            // Keep only the most recent entries based on config
            const maxHistoryItems = 100; // Keep last 100 backups
            const trimmedHistory = history.slice(0, maxHistoryItems);

            this.store.set("backupHistory", trimmedHistory);
            this.logger.info(
                `Added backup to history: ${fileName} (${backupItem.sizeFormatted})`
            );
            this.logger.debug(`Backup history entry details:`, backupItem);
        } catch (error) {
            this.logger.error(`Failed to add backup to history: ${error}`);
        }
    }

    /**
     * Mark a backup as failed in history
     */
    addFailedBackupEntry(
        backupName: string,
        type: "manual" | "scheduled" = "manual",
        duration?: number
    ): void {
        try {
            const config = this.configService.getConfig();

            const backupItem: BackupHistoryItem = {
                id: this.generateId(),
                name: backupName,
                path: "", // No path for failed backups
                size: 0,
                sizeFormatted: "0 B",
                date: new Date(),
                type,
                status: "failed",
                duration,
                version: config.wowVersion,
            };

            const history = this.getHistory();
            history.unshift(backupItem);

            const maxHistoryItems = 100;
            const trimmedHistory = history.slice(0, maxHistoryItems);

            this.store.set("backupHistory", trimmedHistory);
            this.logger.info(`Added failed backup to history: ${backupName}`);
        } catch (error) {
            this.logger.error(
                `Failed to add failed backup to history: ${error}`
            );
        }
    }

    /**
     * Get all backup history
     */
    getHistory(): BackupHistoryItem[] {
        return this.store.get("backupHistory", []);
    }

    /**
     * Get backup history by scanning the backup directory and merging with stored metadata
     */
    getValidatedHistory(): BackupHistoryItem[] {
        const storedHistory = this.getHistory();
        const config = this.configService.getConfig();
        const backupDir = config.backupDir;

        // Create a map of stored history by filename for quick lookup
        const storedByName = new Map<string, BackupHistoryItem>();
        for (const item of storedHistory) {
            if (item.name) {
                storedByName.set(item.name, item);
            }
        }

        const discoveredBackups: BackupHistoryItem[] = [];

        try {
            if (!fs.existsSync(backupDir)) {
                this.logger.debug(
                    `Backup directory does not exist: ${backupDir}`
                );
                return storedHistory.filter((item) => item.status === "failed"); // Keep failed entries only
            }

            const files = fs.readdirSync(backupDir);
            const backupFiles = files.filter(
                (f) => f.startsWith("WoW-Backup-") && f.endsWith(".zip")
            );

            for (const fileName of backupFiles) {
                const filePath = path.join(backupDir, fileName);

                try {
                    const stats = fs.statSync(filePath);
                    const storedItem = storedByName.get(fileName);

                    if (storedItem && storedItem.status === "completed") {
                        // Use stored metadata but update path and verify file
                        discoveredBackups.push({
                            ...storedItem,
                            path: filePath,
                            size: stats.size,
                            sizeFormatted: this.formatFileSize(stats.size),
                        });
                    } else {
                        // File exists but no stored metadata - create basic entry
                        const backupItem: BackupHistoryItem = {
                            id: this.generateId(),
                            name: fileName,
                            path: filePath,
                            size: stats.size,
                            sizeFormatted: this.formatFileSize(stats.size),
                            date: stats.mtime, // Use file modification time as backup date
                            type: "manual", // Default to manual since we don't know
                            status: "completed",
                            version: config.wowVersion, // Current version as fallback
                        };

                        discoveredBackups.push(backupItem);
                        this.logger.debug(
                            `Discovered untracked backup file: ${fileName}`
                        );
                    }
                } catch (error) {
                    this.logger.warn(
                        `Failed to read backup file stats: ${fileName} - ${error}`
                    );
                }
            }

            // Add failed backups from stored history (they have no files)
            const failedBackups = storedHistory.filter(
                (item) => item.status === "failed"
            );
            discoveredBackups.push(...failedBackups);

            // Sort by date (newest first)
            discoveredBackups.sort(
                (a, b) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime()
            );

            // Update the stored history with discovered backups
            this.store.set("backupHistory", discoveredBackups);

            this.logger.debug(
                `Discovered ${backupFiles.length} backup files in ${backupDir}`
            );
            return discoveredBackups;
        } catch (error) {
            this.logger.error(`Failed to scan backup directory: ${error}`);
            // Return stored history as fallback
            return storedHistory.filter(
                (item) =>
                    item.status === "failed" ||
                    (item.path && fs.existsSync(item.path))
            );
        }
    }

    /**
     * Get backup by ID
     */
    getBackupById(id: string): BackupHistoryItem | null {
        const history = this.getHistory();
        return history.find((item) => item.id === id) || null;
    }

    /**
     * Delete a backup from history and optionally from disk
     */
    deleteBackup(id: string, deleteFile: boolean = false): boolean {
        try {
            const history = this.getHistory();
            const backupIndex = history.findIndex((item) => item.id === id);

            if (backupIndex === -1) {
                this.logger.warn(`Backup not found in history: ${id}`);
                return false;
            }

            const backup = history[backupIndex];

            if (deleteFile && backup.path && fs.existsSync(backup.path)) {
                fs.unlinkSync(backup.path);
                this.logger.info(`Deleted backup file: ${backup.path}`);
            }

            history.splice(backupIndex, 1);
            this.store.set("backupHistory", history);

            this.logger.info(`Removed backup from history: ${backup.name}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to delete backup: ${error}`);
            return false;
        }
    }

    /**
     * Clear all history
     */
    clearHistory(): void {
        this.store.set("backupHistory", []);
        this.logger.info("Cleared backup history");
    }

    /**
     * Get statistics about backups
     */
    getStats(): {
        totalBackups: number;
        totalSize: number;
        totalSizeFormatted: string;
        successfulBackups: number;
        failedBackups: number;
        lastBackupDate?: Date;
    } {
        const history = this.getValidatedHistory();
        const successful = history.filter(
            (item) => item.status === "completed"
        );
        const failed = history.filter((item) => item.status === "failed");
        const totalSize = successful.reduce((sum, item) => sum + item.size, 0);

        return {
            totalBackups: history.length,
            totalSize,
            totalSizeFormatted: this.formatFileSize(totalSize),
            successfulBackups: successful.length,
            failedBackups: failed.length,
            lastBackupDate: history.length > 0 ? history[0].date : undefined,
        };
    }

    private generateId(): string {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    private formatFileSize(bytes: number): string {
        if (bytes === 0) return "0 B";

        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }
}
