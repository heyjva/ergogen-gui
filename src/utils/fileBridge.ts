/**
 * fileBridge.ts
 *
 * Small client for the local "save-helper" server that lets the GUI read and
 * write a real config.yaml file on disk. This is required because Firefox / Zen
 * (and other non-Chromium browsers) do NOT implement the writable File System
 * Access API (showSaveFilePicker / createWritable). Instead of writing files
 * directly from the browser, the editor makes normal fetch() calls to a tiny
 * localhost Node server (see scripts/save-server.mjs) which performs the
 * privileged file read/write.
 *
 * The helper base URL can be overridden with the VITE_SAVE_HELPER_URL env var;
 * it defaults to http://localhost:3001.
 */

const HELPER_URL: string =
  (import.meta.env?.VITE_SAVE_HELPER_URL as string | undefined)?.replace(
    /\/$/,
    ''
  ) || 'http://localhost:3001';

type FileBridgeStatus = {
  available: boolean;
  path?: string;
  error?: string;
};

/**
 * Checks whether the local save-helper server is running and which file it owns.
 */
export const checkFileBridge = async (): Promise<FileBridgeStatus> => {
  try {
    const res = await fetch(`${HELPER_URL}/health`, { method: 'GET' });
    if (!res.ok) return { available: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { available: true, path: data.path };
  } catch (e) {
    return { available: false, error: (e as Error).message };
  }
};

/**
 * Reads the current contents of the config file from disk via the helper.
 * Returns null if the helper is unavailable.
 */
export const readConfigFromFile = async (): Promise<string | null> => {
  try {
    const res = await fetch(`${HELPER_URL}/config`, { method: 'GET' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
};

/**
 * Writes the given contents to the config file on disk via the helper.
 * Throws on failure so the caller can surface an error to the user.
 */
export const writeConfigToFile = async (contents: string): Promise<string> => {
  const res = await fetch(`${HELPER_URL}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: contents,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  const data = await res.json().catch(() => ({}));
  return (data.path as string) || 'config file';
};
