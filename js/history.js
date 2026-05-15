const DB_NAME = "interview-assistant-db";
const STORE_NAME = "interviews";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

function withStore(mode, callback) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const result = callback(store);
      if (result && typeof result.onsuccess !== "undefined") {
        result.onsuccess = (event) => resolve(event.target.result);
        result.onerror = (event) => reject(event.target.error);
      } else {
        tx.oncomplete = () => resolve();
        tx.onerror = (event) => reject(event.target.error);
      }
    });
  });
}

export async function saveInterview(record) {
  return withStore("readwrite", (store) => store.add(record));
}

export async function getAllInterviews() {
  return withStore("readonly", (store) => store.getAll());
}

export async function deleteInterview(id) {
  return withStore("readwrite", (store) => store.delete(id));
}
