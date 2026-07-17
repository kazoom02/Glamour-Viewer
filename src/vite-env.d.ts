/// <reference types="vite/client" />

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}

// The async directory iterator lives in the DOM.AsyncIterable lib, which this
// project does not include. Declare the one method we use so a directory can be
// walked to locate the sqpack folder within a broad pick.
interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemHandle>
}

interface Window {
  showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
}
