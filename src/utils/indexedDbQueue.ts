export interface BulkQueueLogEntry {
  id: string;
  time: string;
  ma_tk: string;
  folderName?: string;
  status: "success" | "error" | "skip" | "info";
  message: string;
}

export interface BulkFailedRecord {
  ma_tk: string;
  ten_thu_muc_goc: string;
  address: string;
  error: string;
  time: string;
}

export interface BulkImportPersistedSession {
  id: string; // "active_session"
  parentFolderName: string;
  totalCount: number;
  completedMaTks: string[];
  skippedMaTks: string[];
  failedRecords: BulkFailedRecord[];
  logs: BulkQueueLogEntry[];
  updateExisting: boolean;
  updatedAt: string;
}

const DB_NAME = "nguonnha_bulk_import_db";
const DB_VERSION = 1;
const STORE_NAME = "import_sessions";
const SESSION_KEY = "active_session";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB không khả dụng trên trình duyệt này"));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBulkSessionToIndexedDB(
  session: Omit<BulkImportPersistedSession, "id" | "updatedAt">
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({
        ...session,
        id: SESSION_KEY,
        updatedAt: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn("Không thể lưu tiến độ vào IndexedDB:", err);
  }
}

export async function loadBulkSessionFromIndexedDB(): Promise<BulkImportPersistedSession | null> {
  try {
    const db = await openDb();
    const result = await new Promise<BulkImportPersistedSession | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(SESSION_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch (err) {
    console.warn("Không thể đọc tiến độ từ IndexedDB:", err);
    return null;
  }
}

export async function clearBulkSessionInIndexedDB(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(SESSION_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn("Không thể xóa tiến độ trong IndexedDB:", err);
  }
}
