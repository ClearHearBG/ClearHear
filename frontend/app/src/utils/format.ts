export function formatFrequency(frequency: number): string {
  if (frequency >= 1000) {
    const value = frequency / 1000;
    return `${Number.isInteger(value) ? value : value.toFixed(1)} kHz`;
  }

  return `${frequency} Hz`;
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatRelative(iso: string): string {
  const diffMinutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export function formatRange(lowRangeHz: number | null, highRangeHz: number | null): string {
  if (!lowRangeHz || !highRangeHz) {
    return 'Mapping in progress';
  }

  return `${formatFrequency(lowRangeHz)} - ${formatFrequency(highRangeHz)}`;
}
