interface FileDescriptor {
  name: string
  size: number
}

const FFXIV_FILE = /\.(?:index2?|dat\d*)$/i

self.onmessage = (event: MessageEvent<FileDescriptor[]>) => {
  const files = event.data
  self.postMessage({
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    relevantFiles: files.filter((file) => FFXIV_FILE.test(file.name)).length,
  })
}
