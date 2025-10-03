// utils/format.ts
export function formatDistance(meters: number, unitSystem: 'metric' | 'imperial') {
  const factor = unitSystem === 'metric' ? 1000 : 1609.34;
  const label = unitSystem === 'metric' ? 'km' : 'mi';
  return `${(meters / factor).toFixed(2)} ${label}`;
}

export function formatSpeed(ms: number | null, unitSystem: 'metric' | 'imperial') {
  if (ms == null  || isNaN(ms)) return '–';
  if (unitSystem === 'metric') {
    return `${(ms * 3.6).toFixed(1)} km/h`;
  } else {
    return `${(ms * 2.23694).toFixed(1)} mph`;
  }
}

export function formatPace(meters: number, durationMs: number, unitSystem: 'metric' | 'imperial') {
  if (meters < 1 || durationMs <= 0) return '–';

  const factor = unitSystem === 'metric' ? 1000 : 1609.34;
  const unit = unitSystem === 'metric' ? '/km' : '/mi';
  const distUnits = meters / factor;

  const min = (durationMs / 60000) / distUnits;
  const whole = Math.floor(min);
  const sec = String(Math.round((min - whole) * 60)).padStart(2, '0');
  return `${whole}:${sec} ${unit}`;
}

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function formatTitle({ trackId, label, startTs }: { trackId: string; label?: string | null; startTs: number }) {
  // prefer explicit label; otherwise human timestamp
  if (label && label.trim() !== "") return label.trim();
  return startTs // TODO - Add date formatter
}

