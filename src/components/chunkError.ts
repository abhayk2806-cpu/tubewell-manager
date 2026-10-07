// A lazy page whose code file cannot be downloaded (offline, or a new deploy replaced the files)
// makes the dynamic import reject. Browsers word it differently; these are the known messages.
const CHUNK_MESSAGES = [
  /failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /importing a module script failed/i, // Safari
  /unable to preload css/i, // Vite preload of a page's CSS
];

/** True when `error` is a failed download of a lazy page's code. */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'ChunkLoadError' || CHUNK_MESSAGES.some((re) => re.test(error.message));
}
