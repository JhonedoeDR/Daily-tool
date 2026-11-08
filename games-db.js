/* ゲーム機能の画像を端末内のIndexedDBに保存する */
(function () {
  const DB_NAME = 'daily-tool-games';
  const DB_VERSION = 1;
  const STORE = 'images';
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDBを開けませんでした'));
    });
  }
  async function withStore(mode, callback) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let request;
      try { request = callback(store); } catch (error) { db.close(); reject(error); return; }
      tx.oncomplete = () => { db.close(); resolve(request ? request.result : undefined); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || (request && request.error) || new Error('保存に失敗しました')); };
    });
  }
  window.LMGameDB = {
    putImage: (key, blob) => withStore('readwrite', (store) => store.put(blob, key)),
    getImage: (key) => withStore('readonly', (store) => store.get(key)),
    deleteImage: (key) => withStore('readwrite', (store) => store.delete(key)),
  };
})();
