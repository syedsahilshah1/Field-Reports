import * as RNFS from '@dr.pogodin/react-native-fs';

/**
 * File System Service
 * Ensures captured & selected photos are immediately copied from temporary cache
 * into app-private, persistent document storage so they survive force-quits and OS cache sweeps.
 */

const PERSISTENT_DIR = `${RNFS.DocumentDirectoryPath}/field_reports_storage`;

/**
 * Ensures the persistent reports directory exists
 */
export async function ensureDirectoryExists(): Promise<string> {
  const exists = await RNFS.exists(PERSISTENT_DIR);
  if (!exists) {
    await RNFS.mkdir(PERSISTENT_DIR);
  }
  return PERSISTENT_DIR;
}

/**
 * Copies a source image (cache or content URI) to persistent app storage.
 * Returns the persistent file path.
 */
export async function copyToPersistentStorage(sourceUri: string, id: string): Promise<{ persistentUri: string; size: number }> {
  await ensureDirectoryExists();

  const fileName = `${id}.jpg`;
  const destinationPath = `${PERSISTENT_DIR}/${fileName}`;

  // If source URI has file:// prefix, strip it for RNFS methods
  const cleanSource = sourceUri.startsWith('file://') ? sourceUri.replace('file://', '') : sourceUri;

  try {
    // Copy file
    await RNFS.copyFile(cleanSource, destinationPath);

    // Get stat to verify file was copied and get exact byte size
    const stat = await RNFS.stat(destinationPath);
    return {
      persistentUri: `file://${destinationPath}`,
      size: Number(stat.size) || 0
    };
  } catch (err) {
    console.warn(`[FileSystem] copyFile failed for ${sourceUri}, trying fallback read/write`, err);
    // Fallback: If copyFile fails on content:// or special URI, read in base64 and write
    const base64Data = await RNFS.readFile(cleanSource, 'base64');
    await RNFS.writeFile(destinationPath, base64Data, 'base64');
    const stat = await RNFS.stat(destinationPath);
    return {
      persistentUri: `file://${destinationPath}`,
      size: Number(stat.size) || 0
    };
  }
}

/**
 * Gets exact file size in bytes from disk
 */
export async function getFileSizeBytes(fileUri: string): Promise<number> {
  try {
    const cleanPath = fileUri.replace('file://', '');
    const exists = await RNFS.exists(cleanPath);
    if (!exists) return 0;
    const stat = await RNFS.stat(cleanPath);
    return Number(stat.size) || 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Deletes a single image file from disk
 */
export async function deleteImageFile(fileUri: string): Promise<void> {
  try {
    const cleanPath = fileUri.replace('file://', '');
    const exists = await RNFS.exists(cleanPath);
    if (exists) {
      await RNFS.unlink(cleanPath);
    }
  } catch (e) {
    console.warn(`[FileSystem] Failed to delete file ${fileUri}`, e);
  }
}

/**
 * Start Over Blast Radius: Wipes all local persistent images from disk
 */
export async function wipePersistentImageStorage(): Promise<void> {
  try {
    const exists = await RNFS.exists(PERSISTENT_DIR);
    if (exists) {
      await RNFS.unlink(PERSISTENT_DIR);
      await RNFS.mkdir(PERSISTENT_DIR);
    }
  } catch (e) {
    console.warn('[FileSystem] Failed to wipe persistent storage', e);
  }
}
