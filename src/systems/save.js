import { storageGetJSON, storageSetJSON, storageRemove } from '../core/storage.js';

export const SAVE_KEY = 'new-york-minute-save-v1';
export const SETTINGS_KEY = 'new-york-minute-settings-v1';
export const SAVE_VERSION = 1;

export function loadSave() {
  const s = storageGetJSON(SAVE_KEY);
  if (!s || s.version !== SAVE_VERSION) return null;
  return s;
}

export function writeSave(data) {
  return storageSetJSON(SAVE_KEY, { ...data, version: SAVE_VERSION, savedAt: Date.now() });
}

export function deleteSave() {
  storageRemove(SAVE_KEY);
}

export const DEFAULT_SETTINGS = {
  quality: 'auto',
  timeSpeed: 'normal',
  pauseInMenus: true,
  sensitivity: 1,
  invertY: false,
  showFps: false,
  music: true,
  volMaster: 0.8,
  volAmbience: 0.7,
  volSfx: 0.8,
  volMusic: 0.35,
  autoCamera: false,
  units: 'imperial',
};

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...(storageGetJSON(SETTINGS_KEY) || {}) };
}

export function saveSettings(s) {
  storageSetJSON(SETTINGS_KEY, s);
}
