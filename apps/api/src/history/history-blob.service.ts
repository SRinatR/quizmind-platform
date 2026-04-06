import fs from 'node:fs/promises';
import path from 'node:path';

import { Injectable } from '@nestjs/common';

/** Local filesystem blob store for AI request history heavy content.
 *  Blob dir is controlled by HISTORY_BLOB_DIR env var (default: <cwd>/data/history).
 *  Each request produces up to three files:
 *    {requestId}.prompt.json   – serialised prompt messages array
 *    {requestId}.response.json – raw provider response object
 *    {requestId}.file.bin      – raw uploaded file bytes (uploads only)
 */

export function resolveHistoryBlobDir(): string {
  return process.env['HISTORY_BLOB_DIR'] ?? path.join(process.cwd(), 'data', 'history');
}

function promptPath(dir: string, requestId: string) {
  return path.join(dir, `${requestId}.prompt.json`);
}

function responsePath(dir: string, requestId: string) {
  return path.join(dir, `${requestId}.response.json`);
}

function filePath(dir: string, requestId: string) {
  return path.join(dir, `${requestId}.file.bin`);
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

  async writePrompt(requestId: string, messages: unknown): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(promptPath(this.dir, requestId), JSON.stringify(messages), 'utf8');
  }

  async writeResponse(requestId: string, response: unknown): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(responsePath(this.dir, requestId), JSON.stringify(response), 'utf8');
  }

  async writeFileContent(requestId: string, buffer: Buffer): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(filePath(this.dir, requestId), buffer);
  }

  async readPrompt(requestId: string): Promise<unknown | null> {
    try {
      const raw = await fs.readFile(promptPath(this.dir, requestId), 'utf8');
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  async readResponse(requestId: string): Promise<unknown | null> {
    try {
      const raw = await fs.readFile(responsePath(this.dir, requestId), 'utf8');
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  async deleteAllForRequest(requestId: string): Promise<void> {
    await Promise.all([
      tryUnlink(promptPath(this.dir, requestId)),
      tryUnlink(responsePath(this.dir, requestId)),
      tryUnlink(filePath(this.dir, requestId)),
    ]);
  }
}
