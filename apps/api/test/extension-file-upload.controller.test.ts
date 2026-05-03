import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException, UnauthorizedException } from '@nestjs/common';

import { ExtensionFileUploadController } from '../src/extension/extension-file-upload.controller';

function createController(overrides?: { response?: Record<string, unknown> }) {
  const extensionControlService = {
    async resolveInstallationSession() {
      return {
        installation: {
          installationId: 'inst_1',
          userId: 'user_1',
          workspaceId: 'ws_1',
        },
      };
    },
  };

  const aiProxyService = {
    async proxyForCurrentSession(_session: unknown, _request: Record<string, unknown>) {
      return {
        requestId: 'req_1',
        provider: 'openai',
        model: 'openai/gpt-4o-mini',
        keySource: 'platform',
        quota: { key: 'q', limit: 1, consumed: 1, remaining: 0, decremented: true },
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        response: overrides?.response ?? {
          id: 'chatcmpl_1',
          choices: [{ message: { role: 'assistant', content: 'ok' } }],
        },
      };
    },
  };

  const aiHistoryService = {
    persistContent() {
      return Promise.resolve();
    },
  };

  return new ExtensionFileUploadController(extensionControlService as any, aiProxyService as any, aiHistoryService as any);
}

test('uploadAndAnswer returns fileInfo for text upload', async () => {
  const controller = createController();
  const response = await controller.uploadAndAnswer(
    {
      fieldname: 'file',
      originalname: 'notes.txt',
      encoding: '7bit',
      mimetype: 'text/plain',
      size: 5,
      buffer: Buffer.from('hello', 'utf8'),
    },
    { prompt: 'Summarize' },
    'Bearer token',
  );

  assert.equal(response.ok, true);
  assert.equal((response.data as any).fileInfo.contentType, 'text');
  assert.equal((response.data as any).choices[0].message.content, 'ok');
});

test('uploadAndAnswer handles image upload as image content type', async () => {
  const controller = createController();
  const response = await controller.uploadAndAnswer(
    {
      fieldname: 'file',
      originalname: 'image.webp',
      encoding: '7bit',
      mimetype: 'application/octet-stream',
      size: 6,
      buffer: Buffer.from('abcdef', 'utf8'),
    },
    { prompt: 'Describe image' },
    'Bearer token',
  );

  assert.equal((response.data as any).fileInfo.mimeType, 'image/webp');
  assert.equal((response.data as any).fileInfo.contentType, 'image');
});

test('uploadAndAnswer normalizes answer-only upstream response into choices', async () => {
  const controller = createController({ response: { id: 'r2', answer: 'normalized answer' } });
  const response = await controller.uploadAndAnswer(
    {
      fieldname: 'file',
      originalname: 'data.csv',
      encoding: '7bit',
      mimetype: 'text/csv',
      size: 3,
      buffer: Buffer.from('a,b', 'utf8'),
    },
    {},
    'Bearer token',
  );

  assert.equal((response.data as any).choices[0].message.content, 'normalized answer');
});

test('uploadAndAnswer rejects missing file', async () => {
  const controller = createController();
  await assert.rejects(() => controller.uploadAndAnswer(undefined, {}, 'Bearer token'), BadRequestException);
});

test('uploadAndAnswer rejects missing bearer token', async () => {
  const controller = createController();
  await assert.rejects(
    () =>
      controller.uploadAndAnswer(
        {
          fieldname: 'file',
          originalname: 'notes.md',
          encoding: '7bit',
          mimetype: 'text/markdown',
          size: 5,
          buffer: Buffer.from('hello', 'utf8'),
        },
        {},
        undefined,
      ),
    UnauthorizedException,
  );
});

test('uploadAndAnswer rejects unsupported file type', async () => {
  const controller = createController();
  await assert.rejects(
    () =>
      controller.uploadAndAnswer(
        {
          fieldname: 'file',
          originalname: 'archive.zip',
          encoding: '7bit',
          mimetype: 'application/zip',
          size: 12,
          buffer: Buffer.from('x', 'utf8'),
        },
        {},
        'Bearer token',
      ),
    BadRequestException,
  );
});
