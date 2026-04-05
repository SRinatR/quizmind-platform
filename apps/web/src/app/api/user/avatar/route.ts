import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';

import { getAccessTokenFromCookies } from '../../../../lib/auth-session';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'avatars');
// Canvas-resized output is ~20–50 KB; allow up to 500 KB base64 (~375 KB binary)
const MAX_BASE64_LEN = 500_000;

interface ErrorPayload {
  ok: false;
  error: { message: string };
}

function err(message: string, status = 400) {
  return NextResponse.json<ErrorPayload>({ ok: false, error: { message } }, { status });
}

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromCookies();
  if (!accessToken) {
    return err('Sign in to upload an avatar.', 401);
  }

  const body = (await request.json().catch(() => null)) as
    | { dataUrl?: unknown }
    | null;

  const dataUrl = body?.dataUrl;
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return err('Invalid image data.');
  }

  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    return err('Malformed data URL.');
  }

  const header = dataUrl.slice(0, commaIdx);   // e.g. "data:image/jpeg;base64"
  const base64 = dataUrl.slice(commaIdx + 1);

  if (base64.length > MAX_BASE64_LEN) {
    return err('Image is too large. Please choose a smaller image.');
  }

  const ext = header.includes('png') ? 'png' : 'jpg';
  const buffer = Buffer.from(base64, 'base64');

  // Content-addressed filename: same bytes → same URL (natural dedup)
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 24);
  const filename = `${hash}.${ext}`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(join(UPLOAD_DIR, filename), buffer);

  // Use the configured public app URL — never derive from request.url because
  // the server may bind on 0.0.0.0 which is not a browser-reachable origin.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const url = `${appUrl}/uploads/avatars/${filename}`;

  return NextResponse.json({ ok: true, url });
}
