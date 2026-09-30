/*
 * PresendPresets — lightweight per-tool settings persistence.
 * Stores data in IndexedDB (falls back to localStorage if unavailable).
 * Everything stays on the user's device — nothing is ever sent anywhere.
 */
(function (global) {
  const DB_NAME = 'presend_presets';
  const DB_VERSION = 1;
  const STORE = 'settings';

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in global)) return reject(new Error('no-idb'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'toolId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getPreset(toolId) {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(toolId);
        req.onsuccess = () => resolve(req.result ? req.result.data : null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      try {
        const raw = localStorage.getItem('presend_preset_' + toolId);
        return raw ? JSON.parse(raw) : null;
      } catch (e2) {
        return null;
      }
    }
  }

  async function setPreset(toolId, data) {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).put({ toolId, data, updatedAt: Date.now() });
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      try {
        localStorage.setItem('presend_preset_' + toolId, JSON.stringify(data));
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  global.PresendPresets = { get: getPreset, set: setPreset };
})(window);
