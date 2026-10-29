// IndexedDB 저장소: ISS 좌표 기록 (timestamp(ms)를 key로 사용)
const DB_NAME = 'iss-tracker'
const STORE = 'positions'
export const RETENTION_MS = 4 * 60 * 60 * 1000 // 4시간

let dbPromise = null

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'timestamp' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function tx(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const result = fn(t.objectStore(STORE))
        t.oncomplete = () => resolve(result?.result ?? result)
        t.onerror = () => reject(t.error)
      }),
  )
}

export function savePosition(pos) {
  return tx('readwrite', (store) => store.put(pos))
}

// 4시간이 지난 좌표 자동 삭제
export function pruneOld(now = Date.now()) {
  return tx('readwrite', (store) => store.delete(IDBKeyRange.upperBound(now - RETENTION_MS)))
}

export function loadPositions(now = Date.now()) {
  return tx('readonly', (store) => store.getAll(IDBKeyRange.lowerBound(now - RETENTION_MS, true)))
}

export function clearPositions() {
  return tx('readwrite', (store) => store.clear())
}
