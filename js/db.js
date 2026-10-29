/* bangumi-staff-analyzer IndexedDB 封装
 * 存储：api_cache（API 响应缓存）、person_tags（用户对 staff 的标记）、
 *       groups（自定义分组）、settings（设置项）
 */
(function () {
  const DB_NAME = 'bangumi-staff-analyzer';
  const DB_VERSION = 1;
  const STORES = {
    cache: 'api_cache',
    tags: 'person_tags',
    groups: 'groups',
    settings: 'settings'
  };

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('当前浏览器不支持 IndexedDB，无法保存数据'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORES.cache)) {
          db.createObjectStore(STORES.cache, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORES.tags)) {
          db.createObjectStore(STORES.tags, { keyPath: 'personId' });
        }
        if (!db.objectStoreNames.contains(STORES.groups)) {
          db.createObjectStore(STORES.groups, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(STORES.settings)) {
          db.createObjectStore(STORES.settings, { keyPath: 'key' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function reqToPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function get(store, key) {
    return open().then(function (db) {
      const tx = db.transaction(store, 'readonly');
      return reqToPromise(tx.objectStore(store).get(key));
    });
  }

  function put(store, value) {
    return open().then(function (db) {
      const tx = db.transaction(store, 'readwrite');
      return reqToPromise(tx.objectStore(store).put(value));
    });
  }

  function getAll(store) {
    return open().then(function (db) {
      const tx = db.transaction(store, 'readonly');
      return reqToPromise(tx.objectStore(store).getAll());
    });
  }

  function remove(store, key) {
    return open().then(function (db) {
      const tx = db.transaction(store, 'readwrite');
      return reqToPromise(tx.objectStore(store).delete(key));
    });
  }

  function clear(store) {
    return open().then(function (db) {
      const tx = db.transaction(store, 'readwrite');
      return reqToPromise(tx.objectStore(store).clear());
    });
  }

  // Remove results saved by older versions; new results and API responses stay in memory.
  function discardSavedResults() {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction([STORES.cache, STORES.settings], 'readwrite');
        tx.objectStore(STORES.cache).clear();
        const settings = tx.objectStore(STORES.settings);
        settings.delete('compare-workspace-v1');
        settings.delete('team-workspace-v1');
        tx.oncomplete = resolve;
        tx.onabort = function () { reject(tx.error); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  Staff.db = { STORES: STORES, open: open, get: get, put: put, getAll: getAll, remove: remove, clear: clear, discardSavedResults: discardSavedResults };
})();
