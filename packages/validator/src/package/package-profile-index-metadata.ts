import { promises as fs } from 'node:fs';
import path from 'node:path';

export const SD_LOADER_INDEX_FILENAME = 'sdloader-profile-index.json';

export async function invalidatePackageProfileIndex(cachePath: string): Promise<void> {
  try {
    await fs.unlink(path.join(cachePath, SD_LOADER_INDEX_FILENAME));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
  }
}
