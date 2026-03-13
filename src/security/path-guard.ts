import path from 'node:path';

export function validatePath(filePath: string, rootDir: string): string {
  if (filePath.includes('\0')) {
    throw new Error('Path contains null byte — rejected');
  }

  const resolved = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(rootDir, filePath);

  const normalizedRoot = path.resolve(rootDir);

  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error(`Path "${filePath}" resolves outside allowed directory "${rootDir}"`);
  }

  return resolved;
}

export function isPathAllowed(filePath: string, allowedPaths: string[]): boolean {
  const resolved = path.resolve(filePath);
  return allowedPaths.some((allowed) => {
    const normalizedAllowed = path.resolve(allowed);
    return resolved.startsWith(normalizedAllowed + path.sep) || resolved === normalizedAllowed;
  });
}

/**
 * Parses the ALLOWED_PATHS config string (comma-separated) into an array.
 * Returns empty array if undefined/empty (no additional restriction).
 */
export function parseAllowedPaths(raw?: string): string[] {
  if (!raw || raw.trim() === '') return [];
  return raw.split(',').map((p) => p.trim()).filter(Boolean);
}
