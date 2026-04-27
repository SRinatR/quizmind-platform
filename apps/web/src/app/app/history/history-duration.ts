export function formatHistoryDuration(durationMs: number | null | undefined): string | null {
  if (durationMs == null) return null;
  if (durationMs === 0) return '0s';

  const roundedSeconds = Math.round((durationMs / 1000) * 10) / 10;
  const displaySeconds = Math.max(0.1, roundedSeconds);

  return `${displaySeconds.toFixed(1).replace(/\.0$/, '')}s`;
}
