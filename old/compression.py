"""
Shared compression utilities for WoW Backup Manager
"""

import os
import zipfile
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed


class CompressionManager:
    """Handles all compression and decompression operations using Python's zipfile with multithreading"""
    
    def __init__(self, fast_compression=True, logger=None):
        self.fast_compression = fast_compression
        self.logger = logger or logging.getLogger(__name__)
        # Optimize thread count based on CPU cores and operation type
        self.compression_threads = min(8, os.cpu_count() or 4)
        self.extraction_threads = min(6, os.cpu_count() or 4)
    
    def compress_directory(self, temp_dir, archive_path, progress_callback=None):
        """
        Compress a directory to a ZIP archive using Python's zipfile module
        
        Args:
            temp_dir: Directory to compress
            archive_path: Output ZIP file path
            progress_callback: Optional function to call with progress updates
            
        Returns:
            bool: True if compression succeeded
        """
        self.logger.info("🗜️ Starting compression process...")
        if progress_callback:
            progress_callback(70, "Starting compression...")
            
        # Use Python zipfile for reliable ZIP creation
        return self._zipfile_compression(temp_dir, archive_path, progress_callback)
    
    def decompress_archive(self, archive_path, extract_dir, progress_callback=None):
        """
        Extract a ZIP archive to a directory with multithreaded extraction
        
        Args:
            archive_path: ZIP file to extract
            extract_dir: Directory to extract files to
            progress_callback: Optional function to call with progress updates
            
        Returns:
            bool: True if decompression succeeded
        """
        self.logger.info(f"📦 Starting decompression of: {os.path.basename(archive_path)}")
        
        try:
            if not os.path.exists(archive_path):
                self.logger.error(f"❌ Archive not found: {archive_path}")
                return False
                
            if progress_callback:
                progress_callback(10, "Starting decompression...")
                
            # Create extraction directory if it doesn't exist
            os.makedirs(extract_dir, exist_ok=True)
            self.logger.info(f"📁 Created extraction directory: {extract_dir}")
            
            with zipfile.ZipFile(archive_path, 'r') as zipf:
                # Get list of files for progress tracking
                file_list = zipf.infolist()
                total_files = len(file_list)
                
                self.logger.info(f"🔍 Found {total_files} files to extract")
                
                if progress_callback:
                    progress_callback(20, f"Extracting {total_files} files with multithreading...")
                
                # Thread-safe counter for progress
                extraction_lock = threading.Lock()
                extracted_count = [0]
                
                def update_extraction_progress():
                    with extraction_lock:
                        extracted_count[0] += 1
                        if progress_callback and total_files > 0:
                            # Update progress from 20% to 90% based on files extracted
                            progress_value = 20 + int((extracted_count[0] / total_files) * 70)
                            progress_callback(progress_value, f"Extracted {extracted_count[0]}/{total_files} files")
                            
                        # Log progress periodically
                        if extracted_count[0] % 100 == 0 or extracted_count[0] == total_files:
                            self.logger.info(f"⚡ Extraction progress: {extracted_count[0]}/{total_files} files")
                
                def extract_file(file_info):
                    """Extract a single file - runs in a thread"""
                    try:
                        # Extract the file
                        zipf.extract(file_info, extract_dir)
                        update_extraction_progress()
                        return True
                    except Exception as e:
                        self.logger.warning(f"⚠️ Failed to extract {file_info.filename}: {e}")
                        update_extraction_progress()  # Still update progress
                        return False
                
                self.logger.info(f"🚀 Starting multithreaded extraction using {self.extraction_threads} threads")
                
                # Use ThreadPoolExecutor for parallel extraction
                with ThreadPoolExecutor(max_workers=self.extraction_threads,
                                      thread_name_prefix="Extractor") as executor:
                    # Submit all extraction tasks
                    future_to_file = {executor.submit(extract_file, file_info): file_info 
                                    for file_info in file_list}
                    
                    # Wait for completion
                    failed_files = 0
                    for future in as_completed(future_to_file):
                        try:
                            success = future.result()
                            if not success:
                                failed_files += 1
                        except Exception as e:
                            file_info = future_to_file[future]
                            self.logger.error(f"❌ Thread error extracting {file_info.filename}: {e}")
                            failed_files += 1
                
                if progress_callback:
                    progress_callback(90, "Decompression completed")
                
                if failed_files > 0:
                    self.logger.warning(f"⚠️ Extraction completed with {failed_files} failed files out of {total_files}")
                else:
                    self.logger.info(f"✅ Successfully extracted {total_files} files using {self.extraction_threads} threads")
                
            return True
            
        except zipfile.BadZipFile:
            self.logger.error(f"❌ Invalid or corrupted ZIP file: {archive_path}")
            return False
        except Exception as e:
            self.logger.error(f"❌ Decompression failed: {e}")
            return False
    
    def list_archive_contents(self, archive_path):
        """
        List the contents of a ZIP archive without extracting
        
        Args:
            archive_path: ZIP file to examine
            
        Returns:
            list: List of file info dictionaries, or None if failed
        """
        try:
            if not os.path.exists(archive_path):
                self.logger.error(f"Archive not found: {archive_path}")
                return None
                
            contents = []
            with zipfile.ZipFile(archive_path, 'r') as zipf:
                for info in zipf.infolist():
                    contents.append({
                        'filename': info.filename,
                        'size': info.file_size,
                        'compressed_size': info.compress_size,
                        'modified_date': info.date_time,
                        'is_directory': info.is_dir()
                    })
            
            self.logger.info(f"Listed {len(contents)} items in archive: {archive_path}")
            return contents
            
        except zipfile.BadZipFile:
            self.logger.error(f"Invalid or corrupted ZIP file: {archive_path}")
            return None
        except Exception as e:
            self.logger.error(f"Failed to list archive contents: {e}")
            return None
    
    def validate_archive(self, archive_path):
        """
        Validate that a ZIP archive is not corrupted
        
        Args:
            archive_path: ZIP file to validate
            
        Returns:
            bool: True if archive is valid
        """
        self.logger.info(f"🔍 Validating archive: {os.path.basename(archive_path)}")
        
        try:
            if not os.path.exists(archive_path):
                self.logger.error(f"❌ Archive not found: {archive_path}")
                return False
                
            with zipfile.ZipFile(archive_path, 'r') as zipf:
                # Test the ZIP file integrity
                bad_file = zipf.testzip()
                if bad_file:
                    self.logger.error(f"❌ Corrupted file in archive: {bad_file}")
                    return False
                
            self.logger.info(f"✅ Archive validation successful: {os.path.basename(archive_path)}")
            return True
            
        except zipfile.BadZipFile:
            self.logger.error(f"❌ Invalid ZIP file format: {archive_path}")
            return False
        except Exception as e:
            self.logger.error(f"❌ Archive validation failed: {e}")
            return False

    def _zipfile_compression(self, temp_dir, archive_path, progress_callback=None):
        """Compress using Python zipfile with optimized multithreading for maximum performance"""
        try:
            self.logger.info("🔍 Scanning files for compression...")
            if progress_callback:
                progress_callback(75, "Scanning files for compression...")
                
            # Use stronger compression now that we have multithreading
            # Fast mode: level 3 (good balance), Normal mode: level 9 (maximum compression)
            compression_level = 3 if self.fast_compression else 9
            compression_mode = "Fast" if self.fast_compression else "Maximum"
            
            self.logger.info(f"🗜️ Using {compression_mode} compression (level {compression_level})")
            
            # Fast file collection using os.walk with early optimization
            files_to_compress = []
            total_size = 0
            
            # Collect files with size information for better processing
            for root, dirs, files in os.walk(temp_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    try:
                        file_size = os.path.getsize(file_path)
                        arc_path = os.path.relpath(file_path, temp_dir)
                        files_to_compress.append((file_path, arc_path, file_size))
                        total_size += file_size
                    except (OSError, IOError) as e:
                        self.logger.warning(f"⚠️ Skipping inaccessible file: {file_path} ({e})")
                        continue
            
            total_files = len(files_to_compress)
            if total_files == 0:
                self.logger.warning("⚠️ No files found to compress")
                return True
            
            # Sort by size (larger files first) for better thread utilization
            files_to_compress.sort(key=lambda x: x[2], reverse=True)
            
            self.logger.info(f"📊 Found {total_files} files ({total_size:,} bytes = {total_size/1024/1024:.1f} MB)")
            self.logger.info(f"🚀 Starting compression with {self.compression_threads} threads")
            
            if progress_callback:
                progress_callback(78, f"Compressing {total_files} files ({total_size // 1024:,} KB)...")
            
            # Thread-safe progress tracking
            progress_lock = threading.Lock()
            processed_count = [0]
            processed_size = [0]
            
            def update_progress():
                with progress_lock:
                    processed_count[0] += 1
                    if progress_callback and total_files > 0:
                        # More granular progress updates
                        progress_value = 78 + int((processed_count[0] / total_files) * 7)
                        size_mb = processed_size[0] // (1024 * 1024)
                        progress_callback(progress_value, f"Compressed {processed_count[0]}/{total_files} files ({size_mb} MB)")
                    
                    # Log progress every 50 files or at completion
                    if processed_count[0] % 50 == 0 or processed_count[0] == total_files:
                        size_mb = processed_size[0] // (1024 * 1024)
                        self.logger.info(f"⚡ Compression progress: {processed_count[0]}/{total_files} files ({size_mb} MB processed)")
            
            # Create ZIP file with optimized thread-safe writing
            zip_lock = threading.Lock()
            
            with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED, 
                               compresslevel=compression_level, allowZip64=True) as zipf:
                
                def compress_file(file_info):
                    """Compress a single file - optimized for performance"""
                    file_path, arc_path, file_size = file_info
                    try:
                        # Read and compress file data in worker thread
                        with open(file_path, 'rb') as f:
                            file_data = f.read()
                        
                        # Thread-safe ZIP writing with minimal lock time
                        with zip_lock:
                            zipf.writestr(arc_path, file_data)
                        
                        # Update progress tracking
                        with progress_lock:
                            processed_size[0] += file_size
                        
                        update_progress()
                        return True
                        
                    except Exception as e:
                        self.logger.warning(f"⚠️ Failed to compress {file_path}: {e}")
                        update_progress()
                        return False
                
                # Process files using optimized ThreadPoolExecutor
                with ThreadPoolExecutor(max_workers=self.compression_threads, 
                                      thread_name_prefix="Compressor") as executor:
                    
                    # Submit tasks in batches to avoid memory issues with large file sets
                    batch_size = 100
                    completed_files = 0
                    failed_files = 0
                    
                    for i in range(0, len(files_to_compress), batch_size):
                        batch = files_to_compress[i:i + batch_size]
                        
                        # Submit batch of compression tasks
                        future_to_file = {executor.submit(compress_file, file_info): file_info 
                                        for file_info in batch}
                        
                        # Process batch results
                        for future in as_completed(future_to_file):
                            try:
                                success = future.result()
                                completed_files += 1
                                if not success:
                                    failed_files += 1
                            except Exception as e:
                                file_info = future_to_file[future]
                                self.logger.error(f"❌ Thread error compressing {file_info[0]}: {e}")
                                failed_files += 1
            
            if progress_callback:
                progress_callback(85, f"Compression completed - {self.compression_threads} threads used")
            
            # Log final statistics
            final_size = os.path.getsize(archive_path)
            compression_ratio = (1 - final_size / total_size) * 100 if total_size > 0 else 0
            
            if failed_files > 0:
                self.logger.warning(f"⚠️ Compression completed with {failed_files} failed files")
            
            self.logger.info(f"✅ Compression complete: {total_files} files")
            self.logger.info(f"📊 Size: {total_size:,} → {final_size:,} bytes ({compression_ratio:.1f}% compression)")
            self.logger.info(f"💾 Final archive: {os.path.basename(archive_path)} ({final_size/1024/1024:.1f} MB)")
            
            return True
            
        except Exception as e:
            self.logger.error(f"❌ Compression failed: {e}")
            return False
