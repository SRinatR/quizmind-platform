import { promisify } from 'node:util';
import { inflateRaw } from 'node:zlib';

import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpException,
  Inject,
  Post,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { parseBearerToken } from '@quizmind/auth';
import { type AiProvider, type AiProxyContentBlock, type ApiSuccess } from '@quizmind/contracts';

import { AiProxyService } from '../ai/ai-proxy.service';
import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { ExtensionControlService } from './extension-control.service';

/** Minimal multer file type (avoids @types/multer dependency). */
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const inflateRawAsync = promisify(inflateRaw);

const ALLOWED_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',
  'text/csv',
  'application/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',
  'text/csv',
  'application/csv',
]);

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const EXTENSION_MIME_MAP: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

const KNOWN_AI_PROVIDERS = new Set<AiProvider>(['openai', 'anthropic', 'openrouter', 'polza', 'internal']);

function ok<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

function resolveMimeFromFilename(filename: string, declaredMime: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MIME_MAP[ext] ?? declaredMime;
}

function isTextMime(mime: string): boolean {
  return TEXT_MIME_TYPES.has(mime) || mime.startsWith('text/');
}

function isImageMime(mime: string): boolean {
  return IMAGE_MIME_TYPES.has(mime);
}

/**
 * Basic PDF text extraction using BT/ET operator scanning.
 * Works for text-based PDFs; returns placeholder for scanned/encrypted PDFs.
 */
function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const textParts: string[] = [];
  const btEtRegex = /BT([\s\S]*?)ET/g;
  let match: RegExpExecArray | null;

  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1];

    const tjRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const decoded = tjMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\');
      if (decoded.trim()) textParts.push(decoded);
    }

    const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
    let tjArrayMatch: RegExpExecArray | null;
    while ((tjArrayMatch = tjArrayRegex.exec(block)) !== null) {
      const innerMatches = tjArrayMatch[1].match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/g) ?? [];
      for (const m of innerMatches) {
        const decoded = m
          .slice(1, -1)
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\');
        if (decoded.trim()) textParts.push(decoded);
      }
    }
  }

  const result = textParts.join(' ').replace(/\s{2,}/g, ' ').trim();
  return result || '[PDF text extraction yielded no readable text for this document.]';
}

/**
 * Extract text from DOCX (ZIP with word/document.xml) using built-in zlib.
 * DOCX files are ZIP archives; word/document.xml contains the main body text
 * inside <w:t> elements.
 */
async function extractDocxText(buffer: Buffer): Promise<string> {
  const LOCAL_FILE_HEADER_SIG = 0x04034b50;
  let offset = 0;
  const xmlChunks: string[] = [];

  while (offset + 30 < buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== LOCAL_FILE_HEADER_SIG) break;

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const fileName = buffer.subarray(offset + 30, offset + 30 + fileNameLength).toString('utf8');
    const dataOffset = offset + 30 + fileNameLength + extraLength;
    const data = buffer.subarray(dataOffset, dataOffset + compressedSize);

    if (fileName === 'word/document.xml') {
      try {
        const xmlBuffer: Buffer =
          compressionMethod === 8
            ? await inflateRawAsync(data)
            : Buffer.from(data);
        const xml = xmlBuffer.toString('utf8');
        const wTMatches = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [];
        xmlChunks.push(...wTMatches.map((m) => m.replace(/<[^>]+>/g, '')));
      } catch {
        // decompression failed; text stays empty
      }
      break;
    }

    const nextOffset = dataOffset + compressedSize;
    if (nextOffset <= offset) break; // safety guard against infinite loop
    offset = nextOffset;
  }

  const result = xmlChunks.join(' ').replace(/\s{2,}/g, ' ').trim();
  return result || '[DOCX text extraction yielded no readable text for this document.]';
}

type InstallationSessionSnapshot = Awaited<ReturnType<ExtensionControlService['resolveInstallationSession']>>;

function buildInstallationRuntimeSession(
  installationSession: InstallationSessionSnapshot,
): CurrentSessionSnapshot {
  return {
    personaKey: 'extension-installation',
    personaLabel: 'Extension Installation',
    notes: ['installation-session'],
    user: {
      id: installationSession.installation.userId,
      email: `installation+${installationSession.installation.userId}@quizmind.local`,
    },
    principal: {
      userId: installationSession.installation.userId,
      email: `installation+${installationSession.installation.userId}@quizmind.local`,
      systemRoles: [],
      entitlements: [],
      featureFlags: [],
    },
    permissions: [],
  };
}

@Controller()
export class ExtensionFileUploadController {
  constructor(
    @Inject(ExtensionControlService)
    private readonly extensionControlService: ExtensionControlService,
    @Inject(AiProxyService)
    private readonly aiProxyService: AiProxyService,
  ) {}

  /**
   * POST /extension/ai/upload
   *
   * Accepts a multipart/form-data upload with:
   * - file       (required) — the file to analyze
   * - prompt     (optional) — instruction text; defaults to a generic analyze prompt
   * - model      (optional) — override model; defaults to workspace policy default
   * - provider   (optional) — override provider; defaults to workspace policy default
   *
   * Returns the same normalized response shape as /extension/ai/answer plus fileInfo.
   */
  @Post('extension/ai/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        const mime = resolveMimeFromFilename(file.originalname, file.mimetype);
        if (ALLOWED_MIME_TYPES.has(mime)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Unsupported file type "${file.originalname}". Allowed types: txt, md, json, csv, pdf, docx, png, jpg, jpeg, webp.`,
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadAndAnswer(
    @UploadedFile() file: MulterFile | undefined,
    @Body() body: Record<string, string>,
    @Headers('authorization') authorization?: string,
  ) {
    if (!file) {
      throw new BadRequestException('A file must be attached as multipart field "file".');
    }

    const accessToken = parseBearerToken(authorization);
    if (!accessToken) {
      throw new UnauthorizedException('Missing installation bearer token.');
    }

    const installationSession = await this.extensionControlService.resolveInstallationSession(accessToken);
    const workspaceId = installationSession.installation.workspaceId;

    if (!workspaceId) {
      throw new UnauthorizedException(
        'Installation is not bound to a workspace yet. Reconnect from extension settings.',
      );
    }

    const mime = resolveMimeFromFilename(file.originalname, file.mimetype);

    if (!ALLOWED_MIME_TYPES.has(mime)) {
      throw new BadRequestException(
        `Unsupported file type "${file.originalname}". Allowed types: txt, md, json, csv, pdf, docx, png, jpg, jpeg, webp.`,
      );
    }

    const session = buildInstallationRuntimeSession(installationSession);
    const promptText =
      typeof body.prompt === 'string' && body.prompt.trim()
        ? body.prompt.trim()
        : 'Analyze the following content and provide a helpful response.';
    const model =
      typeof body.model === 'string' && body.model.trim() ? body.model.trim() : undefined;
    const providerRaw =
      typeof body.provider === 'string' && body.provider.trim() ? body.provider.trim() : undefined;
    const provider: AiProvider | undefined =
      providerRaw && KNOWN_AI_PROVIDERS.has(providerRaw as AiProvider)
        ? (providerRaw as AiProvider)
        : undefined;

    let contentType: 'text' | 'image';
    let messageContent: string | AiProxyContentBlock[];

    try {
      if (isImageMime(mime)) {
        contentType = 'image';
        const base64 = file.buffer.toString('base64');
        messageContent = [
          { type: 'text' as const, text: promptText },
          {
            type: 'image_url' as const,
            image_url: { url: `data:${mime};base64,${base64}`, detail: 'auto' as const },
          },
        ];
      } else if (isTextMime(mime)) {
        contentType = 'text';
        const textContent = file.buffer.toString('utf8');
        messageContent = `${promptText}\n\n---\n\n${textContent}`;
      } else if (mime === 'application/pdf') {
        contentType = 'text';
        const extracted = extractPdfText(file.buffer);
        messageContent = `${promptText}\n\n---\n\n${extracted}`;
      } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        contentType = 'text';
        const extracted = await extractDocxText(file.buffer);
        messageContent = `${promptText}\n\n---\n\n${extracted}`;
      } else {
        throw new BadRequestException(
          `File type "${mime}" is allowed but has no extraction handler. This is a configuration error.`,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        `Failed to process file "${file.originalname}": ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    const proxyResult = await this.aiProxyService.proxyForCurrentSession(session, {
      workspaceId,
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      messages: [{ role: 'user', content: messageContent }],
      stream: false,
    });

    const upstreamResponse =
      proxyResult.response && typeof proxyResult.response === 'object'
        ? (proxyResult.response as Record<string, unknown>)
        : {};
    const choices = Array.isArray(upstreamResponse.choices) ? upstreamResponse.choices : [];
    const usage =
      upstreamResponse.usage && typeof upstreamResponse.usage === 'object'
        ? upstreamResponse.usage
        : proxyResult.usage;

    this.logUploadRequest({
      installationId: installationSession.installation.installationId,
      workspaceId,
      originalName: file.originalname,
      mimeType: mime,
      sizeBytes: file.size,
      contentType,
      model: proxyResult.model,
    });

    return ok({
      id:
        typeof upstreamResponse.id === 'string' && upstreamResponse.id.trim()
          ? upstreamResponse.id
          : proxyResult.requestId,
      model: proxyResult.model,
      provider: proxyResult.provider,
      keySource: proxyResult.keySource,
      choices,
      ...(usage ? { usage } : {}),
      quota: proxyResult.quota,
      fileInfo: {
        originalName: file.originalname,
        mimeType: mime,
        sizeBytes: file.size,
        contentType,
      },
    });
  }

  private logUploadRequest(input: {
    installationId: string;
    workspaceId: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    contentType: 'text' | 'image';
    model: string;
  }): void {
    console.info(
      JSON.stringify({
        eventType: 'extension.file_upload_answered',
        installationId: input.installationId,
        workspaceId: input.workspaceId,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        contentType: input.contentType,
        model: input.model,
        occurredAt: new Date().toISOString(),
      }),
    );
  }
}
