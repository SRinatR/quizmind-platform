import fs from 'node:fs/promises';
import path from 'node:path';

import { Injectable } from '@nestjs/common';

/** Local filesystem blob store for AI request history heavy content.
 *  Blob dir is controlled by HISTORY_BLOB_DIR env var (default: <cwd>/data/history).
 *  Blob keys are explicit and storage-backend agnostic so S3-compatible backends
 *  can be added later without changing call sites.
 */

export function resolveHistoryBlobDir(): string {
  return process.env['HISTORY_BLOB_DIR'] ?? path.join(process.cwd(), 'data', 'history');
}

function toStoragePath(dir: string, blobKey: string) {
  const normalized = blobKey.trim().replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
    throw new Error(`Invalid history blob key: ${blobKey}`);
  }
  return path.join(dir, normalized);
}

async function tryUnlink(p: string): Promise<void> {
  try {
    await fs.unlink(p);
  } catch {
    // ignore ENOENT / already deleted
  }
}

@Injectable()
export class HistoryBlobService {
  private readonly dir = resolveHistoryBlobDir();

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  private async ensureParentDir(blobKey: string): Promise<void> {
    await this.ensureDir();
    await fs.mkdir(path.dirname(toStoragePath(this.dir, blobKey)), { recursive: true });
  }

  async writeJson(blobKey: string, payload: unknown): Promise<void> {
    await this.ensureParentDir(blobKey);
    await fs.writeFile(toStoragePath(this.dir, blobKey), JSON.stringify(payload), 'utf8');
  }

  async writeBinary(blobKey: string, buffer: Buffer): Promise<void> {
    await this.ensureParentDir(blobKey);
    await fs.writeFile(toStoragePath(this.dir, blobKey), buffer);
  }

  async readJson(blobKey: string): Promise<unknown | null> {
    try {
      const raw = await fs.readFile(toStoragePath(this.dir, blobKey), 'utf8');
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  async readBinary(blobKey: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(toStoragePath(this.dir, blobKey));
    } catch {
      return null;
    }
  }

  async deleteByKey(blobKey: string): Promise<void> {
    await tryUnlink(toStoragePath(this.dir, blobKey));
  }

  async writePrompt(requestId: string, messages: unknown): Promise<string> {
    const key = `requests/${requestId}/prompt.json`;
    await this.writeJson(key, messages);
    return key;
  }

  async writeResponse(requestId: string, response: unknown): Promise<string> {
    const key = `requests/${requestId}/response.json`;
    await this.writeJson(key, response);
    return key;
  }

  async writeFileContent(requestId: string, buffer: Buffer): Promise<string> {
    const key = `requests/${requestId}/file.bin`;
    await this.writeBinary(key, buffer);
    return key;
  }

  async writeAttachmentContent(requestId: string, attachmentId: string, buffer: Buffer): Promise<string> {
    const key = `requests/${requestId}/attachments/${attachmentId}.bin`;
    await this.writeBinary(key, buffer);
    return key;
  }

  async readPrompt(requestId: string): Promise<unknown | null> {
    return this.readJson(`requests/${requestId}/prompt.json`);
  }

  async readResponse(requestId: string): Promise<unknown | null> {
    return this.readJson(`requests/${requestId}/response.json`);
  }

  async deleteAllForRequest(requestId: string): Promise<void> {
    await this.ensureDir();
    await Promise.all([
      this.deleteByKey(`requests/${requestId}/prompt.json`),
      this.deleteByKey(`requests/${requestId}/response.json`),
      this.deleteByKey(`requests/${requestId}/file.bin`),
    ]);
  }
}
