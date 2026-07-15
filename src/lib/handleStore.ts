const DATABASE_NAME = 'glamour-viewer'
const STORE_NAME = 'private-handles'
const HANDLE_KEY = 'sqpack-directory'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const request = operation(transaction.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
  })
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await withStore('readwrite', (store) => store.put(handle, HANDLE_KEY))
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  return withStore('readonly', (store) => store.get(HANDLE_KEY))
}

export async function forgetDirectoryHandle(): Promise<void> {
  await withStore('readwrite', (store) => store.delete(HANDLE_KEY))
}
