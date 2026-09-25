// localStorage can be unavailable (private windows, sandboxed iframes). Never let that crash the game.
const memory = new Map();

export function storageGet(key) {
  try {
    const v = window.localStorage.getItem(key);
    return v ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export function storageSet(key, value) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function storageRemove(key) {
  memory.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function storageGetJSON(key, fallback = null) {
  const raw = storageGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function storageSetJSON(key, obj) {
  return storageSet(key, JSON.stringify(obj));
}
