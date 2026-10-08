/* Minimal promise-based IndexedDB key/value store (offline cache of the user's data). */
import { APP_DB } from '../../../shared/brand';

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(APP_DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('kv'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(d => new Promise<T>((resolve, reject) => {
    const tx = d.transaction('kv', mode);
    const req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => resolve(req.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}
export const idbGet = <T>(key: string) => run<T | undefined>('readonly', s => s.get(key));
export const idbSet = (key: string, value: unknown) => run<void>('readwrite', s => s.put(value, key));
export const idbDel = (key: string) => run<void>('readwrite', s => s.delete(key));
