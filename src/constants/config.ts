import { Platform } from 'react-native';

/**
 * Global Configuration for Field Reports
 */

// Android emulator maps 10.0.2.2 to the host machine's localhost
export const DEFAULT_API_URL = Platform.select({
  android: 'http://10.0.2.2:3001',
  ios: 'http://localhost:3001',
  default: 'http://localhost:3001'
});

export const CONFIG = {
  // Constraints from test brief
  MIN_IMAGES: 1,
  MAX_IMAGES: 5,
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 5.0 MB Hard ceiling at destination

  // Target image compression settings
  TARGET_MAX_WIDTH: 2048,
  TARGET_MAX_HEIGHT: 2048,
  TARGET_QUALITY: 0.82, // High clarity JPEG, yields ~600KB–1.2MB

  // 2G Resilient Retry & Backoff Policy
  MAX_RETRIES: 10,
  BASE_RETRY_DELAY_MS: 2000,   // Initial delay 2s
  MAX_RETRY_DELAY_MS: 30000,   // Maximum delay cap 30s
  BACKOFF_MULTIPLIER: 2,       // Exponential 2s, 4s, 8s, 16s, 30s
  JITTER_PERCENT: 0.25,        // +/- 25% randomized jitter to avoid thundering herd

  // Network request timeouts (generous for 2G networks)
  REQUEST_TIMEOUT_MS: 60000,   // 60 seconds per image upload chunk

  // Storage keys
  STORAGE_REPORTS_KEY: '@field_reports:queue_v1',
  STORAGE_SERVER_URL_KEY: '@field_reports:server_url',
  STORAGE_DRAFT_KEY: '@field_reports:draft_report',
};
