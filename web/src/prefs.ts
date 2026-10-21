// Per-viewer conveniences (heat mode, quake layer). Storage can be missing or blocked
// (private windows, embedded previews), so every access is wrapped and failure is silent.

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered; nothing else depends on it.
  }
}
