/**
 * Type definitions for Field Reports
 * Meaningfully and strictly typed
 */

export type ImageUploadStatus =
  | 'pending'        // Stored locally in persistent directory, waiting for queue
  | 'compressing'    // Undergoing resizing/compression
  | 'compressed'     // Sized under 5 MB ceiling, ready to send
  | 'uploading'      // In flight over the network
  | 'uploaded'       // Confirmed received by server (idempotent)
  | 'failed';        // Encountered transient or terminal error

export interface ReportImage {
  id: string;              // Unique UUID for this image
  localUri: string;        // Persistent file URI on device disk
  originalSize: number;    // Size in bytes when picked (could be 18+ MB)
  compressedSize: number;  // Size in bytes after compression (guaranteed < 5 MB)
  width?: number;
  height?: number;
  mimeType: string;
  status: ImageUploadStatus;
  uploadedBytes: number;
  totalBytes: number;
  remoteUrl?: string;
  error?: string;
}

export type ReportDeliveryStatus =
  | 'draft'          // Being composed, not yet submitted
  | 'queued'         // Submitted locally, saved to disk, awaiting worker
  | 'processing'     // Actively compressing or uploading images
  | 'delivered'      // Confirmed landed on the server
  | 'failed';        // Stopped due to fatal error or max retries reached

export interface Report {
  id: string;                    // Idempotency key (UUID)
  description: string;           // Non-blank description
  createdAt: number;             // Timestamp when created locally
  updatedAt: number;             // Timestamp of last state change
  images: ReportImage[];         // 1 to 5 images
  status: ReportDeliveryStatus;
  retryCount: number;            // Number of retry attempts made
  maxRetries: number;            // Maximum automatic retries (e.g. 10)
  nextRetryAt?: number;          // Timestamp for exponential backoff retry
  lastError?: string;            // Human-readable reason for last failure
  isTerminalError?: boolean;     // If true, fatal (do not auto-retry)
}

export interface ServerReportImage {
  imageId: string;
  filename: string;
  url: string;
  size: number;
  originalSize: number;
  compressedSize: number;
  index: number;
  uploadedAt: number;
}

export interface ServerReport {
  id: string;
  description: string;
  expectedImagesCount: number;
  images: ServerReportImage[];
  status: 'pending_images' | 'delivered';
  createdAt: number;
  receivedAt: number;
  completedAt?: number;
}

export interface ChaosConfig {
  latencyMs: number;
  dropRate: number;
  failRate: number;
  blackHole: boolean;
  enforce5MbCeiling: boolean;
  rateLimit: boolean;
}

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;                  // 'wifi', 'cellular', 'none', etc.
  details?: {
    cellularGeneration?: '2g' | '3g' | '4g' | '5g' | null;
  };
}
