import { Report, ReportImage, ServerReport, ChaosConfig } from '../types';
import { getServerUrl } from './storage';
import { CONFIG } from '../constants/config';

export class ApiError extends Error {
  statusCode?: number;
  isTransient: boolean;

  constructor(message: string, statusCode?: number, isTransient = true) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isTransient = isTransient;
  }
}

/**
 * Fetch wrapper with custom timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = CONFIG.REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new ApiError(`Request timed out after ${timeoutMs}ms (2G slow link or dropped connection)`, undefined, true);
    }
    // Socket / TCP connection dropped
    throw new ApiError(`Network connection failed: ${err.message || 'Dropped socket'}`, undefined, true);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Register report metadata on the server (Step 1 of two-phase upload)
 * Strictly idempotent: server returns 200/201 without duplicating.
 */
export async function apiRegisterReport(report: Report): Promise<any> {
  const baseUrl = await getServerUrl();
  const url = `${baseUrl}/api/reports`;

  const payload = {
    id: report.id,
    description: report.description,
    expectedImagesCount: report.images.length,
    imageIds: report.images.map(img => img.id),
    createdAt: report.createdAt
  };

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const isTransient = res.status >= 500 || res.status === 429 || res.status === 408;
    let errorText = `Server error HTTP ${res.status}`;
    try {
      const json = await res.json();
      if (json.error) errorText = json.error;
    } catch (e) {}
    throw new ApiError(errorText, res.status, isTransient);
  }

  return res.json();
}

/**
 * Upload an individual image for a report (Step 2 of two-phase upload)
 * Atomic per-image upload ensures that progress on a bad link is never lost!
 */
export async function apiUploadImage(
  reportId: string,
  image: ReportImage,
  index: number,
  totalImages: number,
  onProgress?: (ratio: number) => void
): Promise<any> {
  const baseUrl = await getServerUrl();
  const url = `${baseUrl}/api/reports/${reportId}/images`;

  // Verify ceiling before sending
  if (image.compressedSize > CONFIG.MAX_FILE_SIZE_BYTES) {
    throw new ApiError(
      `Image exceeds 5 MB ceiling (${(image.compressedSize / 1024 / 1024).toFixed(2)} MB)`,
      413,
      false // Terminal error: never retry an over-ceiling file
    );
  }

  // Create multipart/form-data
  const formData = new FormData();
  formData.append('imageId', image.id);
  formData.append('index', String(index));
  formData.append('originalSize', String(image.originalSize));
  formData.append('compressedSize', String(image.compressedSize));
  formData.append('file', {
    uri: image.localUri,
    type: image.mimeType || 'image/jpeg',
    name: `${image.id}.jpg`
  } as any);

  // Use XMLHttpRequest to track granular upload progress
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.timeout = CONFIG.REQUEST_TIMEOUT_MS;

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const ratio = event.loaded / event.total;
          onProgress(ratio);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          resolve(json);
        } catch (e) {
          resolve({ success: true });
        }
      } else {
        const isTransient = xhr.status >= 500 || xhr.status === 429 || xhr.status === 408;
        let errMsg = `Upload failed with HTTP ${xhr.status}`;
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed.error) errMsg = parsed.error;
        } catch (e) {}
        reject(new ApiError(errMsg, xhr.status, isTransient));
      }
    };

    xhr.onerror = () => {
      reject(new ApiError('Upload connection dropped (network failure)', undefined, true));
    };

    xhr.ontimeout = () => {
      reject(new ApiError(`Upload timed out after ${CONFIG.REQUEST_TIMEOUT_MS}ms on slow link`, undefined, true));
    };

    xhr.onabort = () => {
      reject(new ApiError('Upload aborted', undefined, true));
    };

    xhr.send(formData);
  });
}

/**
 * Fetch reports directly from the server (Review Screen)
 * Requirement: "Show what the server holds — fetched from it, not read back out of local state."
 */
export async function apiFetchServerReports(): Promise<ServerReport[]> {
  const baseUrl = await getServerUrl();
  const url = `${baseUrl}/api/reports`;

  const res = await fetchWithTimeout(url, { method: 'GET' }, 15000);
  if (!res.ok) {
    throw new ApiError(`Failed to fetch server reports: HTTP ${res.status}`, res.status, true);
  }
  const data = await res.json();
  return data.reports || [];
}

/**
 * Reset server storage (Chaos / Start Over)
 */
export async function apiResetServer(): Promise<void> {
  const baseUrl = await getServerUrl();
  const url = `${baseUrl}/api/reset`;
  await fetchWithTimeout(url, { method: 'POST' }, 10000);
}

/**
 * Fetch Chaos configuration
 */
export async function apiGetChaosConfig(): Promise<ChaosConfig> {
  const baseUrl = await getServerUrl();
  const url = `${baseUrl}/api/chaos`;
  const res = await fetchWithTimeout(url, { method: 'GET' }, 8000);
  return res.json();
}

/**
 * Update Chaos configuration
 */
export async function apiUpdateChaosConfig(config: Partial<ChaosConfig>): Promise<ChaosConfig> {
  const baseUrl = await getServerUrl();
  const url = `${baseUrl}/api/chaos`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  }, 8000);
  const data = await res.json();
  return data.chaos;
}

/**
 * Test server connectivity
 */
export async function apiCheckHealth(): Promise<boolean> {
  try {
    const baseUrl = await getServerUrl();
    const url = `${baseUrl}/api/health`;
    const res = await fetchWithTimeout(url, { method: 'GET' }, 5000);
    return res.ok;
  } catch (e) {
    return false;
  }
}
