import { NextResponse } from 'next/server';

import { API_URL } from '../../../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../../../lib/auth-session';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const accessToken = await getAccessTokenFromCookies();
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: { message: 'Sign in to view history attachments.' } }, { status: 401 });
  }

  const { id, attachmentId } = await params;
  const upstream = await fetch(`${API_URL}/history/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}/view`, {
    method: 'GET',
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!upstream.ok) {
    const message = upstream.status === 410 ? 'Image expired after retention window.' : 'Unable to load history attachment.';
    return NextResponse.json({ ok: false, error: { message } }, { status: upstream.status || 500 });
  }

  const bytes = await upstream.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': upstream.headers.get('content-disposition') ?? 'inline',
      'Cache-Control': 'private, max-age=60',
    },
  });
}
