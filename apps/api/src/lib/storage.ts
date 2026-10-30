import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'

// Files are saved under a "key" such as rider-docs/<riderId>/<uuid>.jpg.
// The database stores the key, never a public URL, because rider documents are private.
// Local disk is fine for development. Before launch, write an S3/R2 version of this
// interface and export it instead; local disk is lost on most hosting platforms.
export interface Storage {
  save(prefix: string, data: Buffer, ext: string): Promise<string>
  read(key: string): Promise<Buffer>
  remove(key: string): Promise<void>
}

class LocalStorage implements Storage {
  private root = path.resolve(config.UPLOAD_DIR)

  private resolve(key: string) {
    const full = path.resolve(this.root, key)
    if (!full.startsWith(this.root + path.sep)) throw new Error('Invalid storage key')
    return full
  }

  async save(prefix: string, data: Buffer, ext: string) {
    const key = `${prefix}/${crypto.randomUUID()}${ext}`
    const full = this.resolve(key)
    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, data)
    return key
  }

  async read(key: string) {
    return fs.readFile(this.resolve(key))
  }

  async remove(key: string) {
    await fs.rm(this.resolve(key), { force: true })
  }
}

export const storage: Storage = new LocalStorage()
