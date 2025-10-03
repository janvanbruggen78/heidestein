// utils/routeExport.ts
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
type P = { latitude?: number; longitude?: number; lat?: number; lon?: number; ts?: number; time?: string | number };

function normPoint(p: P) {
  const lat = (p.latitude ?? p.lat) as number;
  const lon = (p.longitude ?? p.lon) as number;
  let ts: number | undefined;
  if (typeof p.ts === 'number') ts = p.ts;
  else if (typeof p.time === 'number') ts = p.time;
  else if (typeof p.time === 'string') ts = Date.parse(p.time);
  return { lat, lon, ts };
}

function toISO(ts?: number) {
  return Number.isFinite(ts!) ? new Date(ts!).toISOString() : undefined;
}

export function buildGPX(name: string, segments: P[][]) {
  const head =
`<?xml version="1.0" encoding="utf8"?>` +
`<gpx version="1.1" creator="Heidestein" xmlns="http://www.topografix.com/GPX/1/1">` +
`<trk><name>${escapeXml(name)}</name>`;
const trksegs = segments.map(seg => {
  if (!seg?.length) return `<trkseg/>`;
  const pts = seg.map(p => {
    const { lat, lon, ts } = normPoint(p);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
    const time = toISO(ts);
    return `<trkpt lat="${lat}" lon="${lon}">${time ? `<time>${time}</time>` : ''}</trkpt>`;
  }).join('');
  return `<trkseg>${pts}</trkseg>`;
}).join('');
const tail = `</trk></gpx>`;
return head + trksegs + tail;
}

export function buildSVG(
  segments: P[][],
  width = 1024,
  height = 1754,
  margin = 24,
  text?: {
    title?: string;
    subtitle?: string;
    fontFamily?: string;   // defaults to 'serif'
    color?: string;        // defaults to '#111'
    titleSize?: number;    // defaults to 36
    subtitleSize?: number; // defaults to 24
  }
  ) {
  // Flatten + bbox
  const pts = segments
  .flat()
  .map(normPoint)
  .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));

  if (!pts.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`;
  }

  const minLat = Math.min(...pts.map(p => p.lat));
  const maxLat = Math.max(...pts.map(p => p.lat));
  const minLon = Math.min(...pts.map(p => p.lon));
  const maxLon = Math.max(...pts.map(p => p.lon));

  const w = width - margin * 2;
  const h = height - margin * 2;

  const sx = w / Math.max(1e-9, (maxLon - minLon));
  const sy = h / Math.max(1e-9, (maxLat - minLat));
  const s = Math.min(sx, sy);

  const ox = margin + (w - s * (maxLon - minLon)) / 2;
  const oy = margin + (h - s * (maxLat - minLat)) / 2;

  const mapX = (lon: number) => ox + (lon - minLon) * s;
  const mapY = (lat: number) => oy + (maxLat - lat) * s; // invert y

  const paths = segments.map(seg => {
    const ns = seg
    .map(normPoint)
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (!ns.length) return '';
    const d = ns.map((p, i) => `${i ? 'L' : 'M'}${mapX(p.lon)} ${mapY(p.lat)}`).join(' ');
    return `<path d="${d}" fill="none" stroke="black" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');

  // Optional bottom-left text (title + subtitle)
  let textSvg = '';
  if (text && (text.title || text.subtitle)) {
    const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));

    const color = text.color ?? '#111';
    const font = text.fontFamily ?? 'serif';
    const titleSize = text.titleSize ?? 36;
    const subtitleSize = text.subtitleSize ?? 24;

    const yBottom = height - margin;
    const gap = 4; // small spacing between lines

    const hasSub = Boolean(text.subtitle);
    const titleY = hasSub ? (yBottom - (subtitleSize + gap)) : (yBottom - 2);
    const subtitleY = yBottom;

    const titleLine = text.title
    ? `<text x="${margin}" y="${titleY}" text-anchor="start" dominant-baseline="baseline" font-family="${font}" font-size="${titleSize}" fill="${color}">${esc(text.title)}</text>`
    : '';
    const subLine = text.subtitle
    ? `<text x="${margin}" y="${subtitleY}" text-anchor="start" dominant-baseline="baseline" font-family="${font}" font-size="${subtitleSize}" fill="${color}">${esc(text.subtitle)}</text>`
    : '';

    textSvg = titleLine + subLine;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${paths}${textSvg}</svg>`;
}


function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c] as string));
}

export async function saveAndShare(content: string, filename: string, mime: string) {
  const uri = FileSystem.cacheDirectory! + filename; // share from cache; no SAF needed
  await FileSystem.writeAsStringAsync(uri, content, { encoding: "utf8"});
  // iOS needs correct extension; Android 13+ likes a proper MIME
  await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: filename });
  return uri;
}
