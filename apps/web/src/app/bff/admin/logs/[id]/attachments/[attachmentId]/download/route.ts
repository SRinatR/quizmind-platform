import { NextResponse } from 'next/server';

import { API_URL } from '../../../../../../../../lib/api';
import { getAccessTokenFromCookies } from '../../../../../../../../lib/auth-session';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const accessToken = await getAccessTokenFromCookies();
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: { message: 'Sign in to download admin log attachments.' } }, { status: 401 });
  }

  const { id, attachmentId } = await params;
  const upstream = await fetch(`${API_URL}/admin/logs/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}/download`, {
    method: 'GET',
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!upstream.ok) {
    const message = upstream.status === 410 ? 'Image expired after retention window.' : 'Unable to download admin log attachment.';
    return NextResponse.json({ ok: false, error: { message } }, { status: upstream.status || 500 });
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  const disposition = upstream.headers.get('content-disposition') ?? 'attachment';
  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'content-disposition': disposition,
      'cache-control': 'private, max-age=60',
    },
  });
}
