import { Report, ReportDeliveryStatus, ReportImage } from '../types';
import { CONFIG } from '../constants/config';
import {
  loadReportsFromStorage,
  saveReportsToStorage,
  upsertReportInStorage,
  deleteReportFromStorage,
  clearAllReportsFromStorage
} from './storage';
import { processAndCompressImage } from './imagePipeline';
import { apiRegisterReport, apiUploadImage, ApiError } from './apiClient';
import { checkNetworkState, subscribeNetworkChanges } from './network';
import { deleteImageFile, wipePersistentImageStorage } from './fileSystem';

type QueueListener = (reports: Report[]) => void;

/**
 * Headless Upload Queue Engine
 * 
 * Guarantees:
 * 1. Delivery Guarantees: Nothing lost to a force-quit, dropped socket, or lost response.
 * 2. Idempotency: Nothing lands twice.
 * 3. 2G Resilience: Incremental per-image upload ensures progress on a bad link is never lost.
 * 4. Resilient Retries: Exponential backoff with jitter for transient errors.
 * 5. Exercisable without rendering a screen.
 */
export class UploadQueueEngine {
  private queue: Report[] = [];
  private isProcessing = false;
  private isOnline = true;
  private listeners: Set<QueueListener> = new Set();
  private retryTimers: Map<string, any> = new Map();
  private initialized = false;

  constructor() {}

  /**
   * Initializes the engine: loads persisted queue, resumes incomplete uploads,
   * listens to network state transitions.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // 1. Load reports from persistent disk
    this.queue = await loadReportsFromStorage();

    // 2. Recovery on startup: If any report was left in 'processing' state when the app was killed,
    // revert it back to 'queued' so it automatically resumes.
    let needsPersist = false;
    for (const report of this.queue) {
      if (report.status === 'processing') {
        report.status = 'queued';
        needsPersist = true;
      }
      for (const img of report.images) {
        if (img.status === 'uploading' || img.status === 'compressing') {
          // Revert in-flight image status back to ready or pending
          img.status = img.compressedSize > 0 ? 'compressed' : 'pending';
          needsPersist = true;
        }
      }
    }
    if (needsPersist) {
      await saveReportsToStorage(this.queue);
    }

    // 3. Check initial network state
    const netState = await checkNetworkState();
    this.isOnline = Boolean(netState.isConnected);

    // 4. Subscribe to network state changes
    subscribeNetworkChanges((state) => {
      const wasOnline = this.isOnline;
      this.isOnline = Boolean(state.isConnected);

      console.log(`[QueueEngine] Network changed: ${this.isOnline ? 'Online' : 'Offline'} (${state.type})`);

      // If connection recovered, immediately process any queued or waiting reports
      if (!wasOnline && this.isOnline) {
        this.processNext();
      }
    });

    this.notifyListeners();

    // Kick off worker if online
    if (this.isOnline) {
      this.processNext();
    }
  }

  /**
   * Subscribes to queue updates
   */
  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener([...this.queue]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const snapshot = [...this.queue];
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (e) {
        console.error('[QueueEngine] Listener error:', e);
      }
    }
  }

  /**
   * Returns current snapshot of the queue
   */
  getQueue(): Report[] {
    return [...this.queue];
  }

  /**
   * Waits for active processing to conclude (useful for test assertions and headless scripts)
   */
  async waitForIdle(): Promise<void> {
    while (this.isProcessing) {
      await new Promise(r => setTimeout(r, 25));
    }
  }

  /**
   * Enqueues a new report.
   * Immediately persists to disk before triggering the upload worker.
   */
  async enqueue(report: Report): Promise<void> {
    // Ensure status is queued
    report.status = 'queued';
    report.retryCount = 0;
    report.updatedAt = Date.now();

    this.queue = await upsertReportInStorage(report);
    this.notifyListeners();

    // Trigger processing
    this.processNext();
  }

  /**
   * Manual retry for a failed or stuck report
   */
  async retryReport(reportId: string): Promise<void> {
    const report = this.queue.find(r => r.id === reportId);
    if (!report) return;

    // Clear any pending timer
    if (this.retryTimers.has(reportId)) {
      clearTimeout(this.retryTimers.get(reportId));
      this.retryTimers.delete(reportId);
    }

    report.status = 'queued';
    report.retryCount = 0;
    report.nextRetryAt = undefined;
    report.lastError = undefined;
    report.isTerminalError = false;
    report.updatedAt = Date.now();

    await upsertReportInStorage(report);
    this.notifyListeners();

    this.processNext();
  }

  /**
   * Delete a report and remove associated persistent image files
   */
  async deleteReport(reportId: string): Promise<void> {
    const report = this.queue.find(r => r.id === reportId);
    if (report) {
      for (const img of report.images) {
        await deleteImageFile(img.localUri);
      }
    }
    await deleteReportFromStorage(reportId);
    this.queue = this.queue.filter(r => r.id !== reportId);
    this.notifyListeners();
  }

  /**
   * Reset Start Over: Clears all local queue records and persistent image storage.
   */
  async resetAll(): Promise<void> {
    // Clear all retry timers
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();

    // Wipe storage
    await clearAllReportsFromStorage();
    await wipePersistentImageStorage();

    this.queue = [];
    this.notifyListeners();
  }

  /**
   * Core worker: picks next candidate and delivers it unattended
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing) return;
    if (!this.isOnline) {
      console.log('[QueueEngine] Worker idle: Device is offline');
      return;
    }

    const now = Date.now();
    // Candidate must be 'queued', or 'failed' but with a scheduled retry time that has arrived
    const candidate = this.queue.find(r => {
      if (r.status === 'queued') return true;
      if (r.status === 'failed' && !r.isTerminalError && r.nextRetryAt && r.nextRetryAt <= now) return true;
      return false;
    });

    if (!candidate) {
      // Check if there are future scheduled retries
      const nextPending = this.queue.find(r => r.status === 'failed' && !r.isTerminalError && r.nextRetryAt && r.nextRetryAt > now);
      if (nextPending && nextPending.nextRetryAt) {
        const delay = Math.max(100, nextPending.nextRetryAt - now);
        this.scheduleRetryTimer(nextPending.id, delay);
      }
      return;
    }

    this.isProcessing = true;
    try {
      await this.deliverReport(candidate);
    } catch (err) {
      console.error(`[QueueEngine] Unexpected error delivering report ${candidate.id}:`, err);
    } finally {
      this.isProcessing = false;
      // Continue processing next available report in queue
      this.processNext();
    }
  }

  /**
   * Delivers an individual report with idempotency and incremental image delivery
   */
  private async deliverReport(report: Report): Promise<void> {
    report.status = 'processing';
    report.updatedAt = Date.now();
    await upsertReportInStorage(report);
    this.notifyListeners();

    try {
      // Step 1: Register report metadata on the server (Idempotent)
      await apiRegisterReport(report);

      // Step 2: Process and upload each image incrementally
      const totalImages = report.images.length;

      for (let i = 0; i < totalImages; i++) {
        const img = report.images[i];

        // If this image was already confirmed uploaded, skip it! (Progress preservation)
        if (img.status === 'uploaded') {
          continue;
        }

        // Sub-step A: Compression (if not already compressed)
        if (img.status !== 'compressed') {
          img.status = 'compressing';
          this.notifyListeners();

          try {
            const comp = await processAndCompressImage(img.localUri, img.originalSize);
            img.localUri = comp.uri;
            img.compressedSize = comp.size;
            img.width = comp.width;
            img.height = comp.height;
            img.status = 'compressed';
            img.totalBytes = comp.size;
            await upsertReportInStorage(report);
            this.notifyListeners();
          } catch (compErr: any) {
            img.status = 'failed';
            img.error = compErr.message;
            throw new ApiError(`Image compression failed: ${compErr.message}`, undefined, false);
          }
        }

        // Sub-step B: Upload individual image chunk over network
        img.status = 'uploading';
        img.uploadedBytes = 0;
        this.notifyListeners();

        const uploadResult = await apiUploadImage(
          report.id,
          img,
          i,
          totalImages,
          (ratio) => {
            img.uploadedBytes = Math.round(ratio * img.totalBytes);
            this.notifyListeners();
          }
        );

        // Mark this image as uploaded
        img.status = 'uploaded';
        img.uploadedBytes = img.totalBytes;
        if (uploadResult && uploadResult.image && uploadResult.image.url) {
          img.remoteUrl = uploadResult.image.url;
        }
        await upsertReportInStorage(report);
        this.notifyListeners();
      }

      // Step 3: All images safely confirmed! Mark report delivered.
      report.status = 'delivered';
      report.updatedAt = Date.now();
      report.lastError = undefined;
      await upsertReportInStorage(report);
      this.notifyListeners();
      console.log(`[QueueEngine] Successfully delivered report ${report.id}!`);

    } catch (err: any) {
      await this.handleDeliveryError(report, err);
    }
  }

  /**
   * Robust Error Handling with Exponential Backoff + Jitter
   */
  private async handleDeliveryError(report: Report, err: any): Promise<void> {
    const isTransient = typeof err?.isTransient === 'boolean'
      ? err.isTransient
      : (err instanceof ApiError ? err.isTransient : true);
    const errorMsg = err.message || 'Unknown network error';

    console.warn(`[QueueEngine] Delivery error on report ${report.id}:`, errorMsg, { isTransient });

    report.lastError = errorMsg;
    report.updatedAt = Date.now();

    if (!isTransient) {
      // Fatal client error (e.g. 400 or payload permanently rejected)
      report.status = 'failed';
      report.isTerminalError = true;
      await upsertReportInStorage(report);
      this.notifyListeners();
      return;
    }

    // Transient error: Calculate exponential backoff with jitter
    report.retryCount = (report.retryCount || 0) + 1;

    if (report.retryCount > report.maxRetries) {
      report.status = 'failed';
      report.lastError = `Max retries (${report.maxRetries}) exceeded: ${errorMsg}`;
      await upsertReportInStorage(report);
      this.notifyListeners();
      return;
    }

    // Exponential delay formula: base * 2^(retryCount-1) capped at max, with +/- 25% jitter
    const exponentialBase = CONFIG.BASE_RETRY_DELAY_MS * Math.pow(CONFIG.BACKOFF_MULTIPLIER, report.retryCount - 1);
    const cappedDelay = Math.min(CONFIG.MAX_RETRY_DELAY_MS, exponentialBase);
    const jitter = 1 + (Math.random() * 2 - 1) * CONFIG.JITTER_PERCENT;
    const finalDelayMs = Math.round(cappedDelay * jitter);

    report.status = 'failed'; // Visible as retrying/paused
    report.nextRetryAt = Date.now() + finalDelayMs;
    await upsertReportInStorage(report);
    this.notifyListeners();

    // Schedule automatic wake-up
    this.scheduleRetryTimer(report.id, finalDelayMs);
  }

  private scheduleRetryTimer(reportId: string, delayMs: number): void {
    if (this.retryTimers.has(reportId)) {
      clearTimeout(this.retryTimers.get(reportId));
    }
    const timer = setTimeout(() => {
      this.retryTimers.delete(reportId);
      const report = this.queue.find(r => r.id === reportId);
      if (report && report.status === 'failed' && !report.isTerminalError) {
        report.status = 'queued';
        this.notifyListeners();
        this.processNext();
      }
    }, delayMs);
    this.retryTimers.set(reportId, timer);
  }
}

// Singleton instance for app runtime
export const queueEngine = new UploadQueueEngine();
