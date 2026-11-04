import ImageResizer from '@bam.tech/react-native-image-resizer';
import { CONFIG } from '../constants/config';
import { getFileSizeBytes } from './fileSystem';

export interface CompressionResult {
  uri: string;
  size: number;
  width: number;
  height: number;
  originalSize: number;
  compressionRatio: number; // e.g. 0.15 (85% smaller)
}

/**
 * Image Processing Pipeline
 * Guaranteed 5 MB ceiling enforcement with progressive quality reduction.
 * Does not block the main thread.
 */
export async function processAndCompressImage(
  sourceUri: string,
  originalSizeBytes: number
): Promise<CompressionResult> {
  const CEILING_BYTES = CONFIG.MAX_FILE_SIZE_BYTES; // 5 MB

  let currentWidth = CONFIG.TARGET_MAX_WIDTH;   // 2048
  let currentHeight = CONFIG.TARGET_MAX_HEIGHT; // 2048
  let currentQuality = Math.round(CONFIG.TARGET_QUALITY * 100); // 82

  let pass = 1;
  let compressedUri = sourceUri;
  let compressedSize = originalSizeBytes;
  let finalWidth = currentWidth;
  let finalHeight = currentHeight;

  // Even if original is under 5MB, on 2G networks an 4.5MB image takes 40+ seconds to upload!
  // Resizing huge camera photos (e.g. 18MB) to 2048px maintains pristine visual fidelity
  // while cutting file size down to ~800KB, making 2G delivery fast and dependable.
  while (pass <= 4) {
    try {
      const response = await ImageResizer.createResizedImage(
        sourceUri,
        currentWidth,
        currentHeight,
        'JPEG',
        currentQuality,
        0, // rotation
        undefined, // outputPath
        false, // keepExif
        { mode: 'contain', onlyScaleDown: true }
      );

      const size = response.size || (await getFileSizeBytes(response.uri));
      compressedUri = response.uri;
      compressedSize = size;
      finalWidth = response.width;
      finalHeight = response.height;

      // If comfortably under the 5 MB ceiling, we're done!
      if (compressedSize <= CEILING_BYTES) {
        break;
      }

      // If somehow still > 5 MB, progressively scale down
      pass++;
      currentQuality = Math.max(50, currentQuality - 15);
      currentWidth = Math.round(currentWidth * 0.8);
      currentHeight = Math.round(currentHeight * 0.8);
    } catch (err) {
      console.warn(`[ImagePipeline] Compression pass ${pass} failed:`, err);
      // If native resizer fails, verify if original is under ceiling
      if (originalSizeBytes <= CEILING_BYTES) {
        return {
          uri: sourceUri,
          size: originalSizeBytes,
          width: 0,
          height: 0,
          originalSize: originalSizeBytes,
          compressionRatio: 1.0
        };
      }
      throw new Error(`Failed to compress image under 5 MB ceiling: ${String(err)}`);
    }
  }

  // Safety invariant check
  if (compressedSize > CEILING_BYTES) {
    throw new Error(
      `Image size (${(compressedSize / 1024 / 1024).toFixed(2)} MB) still exceeds 5 MB ceiling after 4 compression passes.`
    );
  }

  const compressionRatio = compressedSize / (originalSizeBytes || compressedSize);

  return {
    uri: compressedUri,
    size: compressedSize,
    width: finalWidth,
    height: finalHeight,
    originalSize: originalSizeBytes,
    compressionRatio
  };
}
