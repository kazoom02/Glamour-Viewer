interface FileDescriptor {
  name: string
  size: number
}

export interface DirectorySummary {
  fileCount: number
  totalBytes: number
  relevantFiles: number
}

export function summarizeFiles(files: File[]): Promise<DirectorySummary> {
  const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' })
  const descriptors: FileDescriptor[] = files.map(({ name, size }) => ({ name, size }))

  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<DirectorySummary>) => {
      resolve(event.data)
      worker.terminate()
    }
    worker.onerror = (event) => {
      reject(new Error(event.message || 'The directory worker failed.'))
      worker.terminate()
    }
    worker.postMessage(descriptors)
  })
}
