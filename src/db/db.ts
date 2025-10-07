//TODO - Add versioning/upgrade strategy (PRAGMA)
import * as SQLite from "expo-sqlite";
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';


type DB = SQLite.SQLiteDatabase;

let _dbPromise: Promise<DB> | null = null;

export type TrackMeta = {
  track_id: string;
  started_at: number;
  ended_at: number | null;
  label: string | null;
};

export function getDb(): Promise<DB> {
  if (_dbPromise) return _dbPromise;

  _dbPromise = (async () => {
    // If you want to “version-bump” during development without migrations,
    // change the filename to force a fresh DB, e.g. "heidestein_v2.db".
    const db = await SQLite.openDatabaseAsync("heidestein_v3.db");

    // Pragmas (best-effort; ignore errors on web polyfill)
    try { await db.execAsync("PRAGMA journal_mode = WAL;"); } catch {}
    try { await db.execAsync("PRAGMA foreign_keys = ON;"); } catch {}

    await createSchemaIfNeeded(db);
    return db;
  })();

  return _dbPromise;
}

async function safeExec(db: DB, sql: string) {
  try {
    await db.execAsync(sql);
  } catch (e) {
    console.error("[DB] SQL failed:", sql, "\n→", e);
    throw e;
  }
}

async function createSchemaIfNeeded(db: DB) {
  try {
    console.log('createSchema');
    await safeExec(db, "BEGIN IMMEDIATE;");
    await safeExec(db, `
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY NOT NULL,
        distance REAL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER
      );
    `);
    await safeExec(db, `
      CREATE INDEX IF NOT EXISTS idx_tracks_started_at
      ON tracks(started_at);
    `);
    await safeExec(db, `
      CREATE TABLE IF NOT EXISTS points (
        track_id TEXT NOT NULL,
        segment_index INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        altitude REAL,
        accuracy REAL,
        speed REAL,
        PRIMARY KEY (track_id, segment_index, ts),
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );
    `);
    await safeExec(db, `
      CREATE INDEX IF NOT EXISTS idx_points_track_seg_ts
      ON points(track_id, segment_index, ts);
    `);
    await safeExec(db, `
      CREATE TABLE IF NOT EXISTS track_labels (
        track_id TEXT PRIMARY KEY NOT NULL,
        label TEXT
      );
    `);
    await safeExec(db, `
      CREATE INDEX IF NOT EXISTS idx_track_labels_track
      ON track_labels(track_id);
    `);
    await safeExec(db, "COMMIT;");
  } catch (e) {
    await db.execAsync("ROLLBACK;");
    throw e;
  }
}

export async function createTrack(customId?: string) {
  const db = await getDb();
  const id = customId ?? new Date().toISOString();
  const createdAt = Date.now();
  await db.runAsync(
    `INSERT INTO tracks (id, started_at, distance) VALUES (?, ?, 0)`,
    [id, createdAt]
  );
  return id;
}

export async function finalizeTrack(id: string): Promise<void> {
  const db = await getDb();
  const endedAt = Date.now();
  await db.runAsync(
    `UPDATE tracks SET ended_at = ? WHERE id = ?`,
    [endedAt, id]
  );
}

export async function listTracks(): Promise<TrackMeta[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TrackMeta>(
    `SELECT t.id AS track_id, t.started_at, t.ended_at, l.label
     FROM tracks t
     LEFT JOIN track_labels l ON l.track_id = t.id
     ORDER BY 
       CASE WHEN t.ended_at IS NULL THEN 1 ELSE 0 END,
       COALESCE(t.ended_at, t.started_at) DESC`
  );
  return rows ?? [];
}

/** Returns next segment index for a track (0-based). */
export async function newSegmentIndex(trackId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ nextSeg: number }>(
    `SELECT COALESCE(MAX(segment_index), -1) + 1 AS nextSeg
     FROM points WHERE track_id = ?`,
    [trackId]
  );
  return row?.nextSeg ?? 0;
}


export type LatLngTs = {
  latitude: number;
  longitude: number;
  ts: number;
  altitude?: number | null;
  accuracy?: number | null;
  speed?: number | null;
};

export type TrackPoint = {
    segment_index: number;
    ts: number;
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
    speed: number | null;
  };

  export type TrackSegment = {
    segment_index: number;
    points: Omit<TrackPoint, "segment_index">[];
  };

export async function appendPoint(
  trackId: string,
  segmentIndex: number,
  p: LatLngTs
  ): Promise<void> {
  const db = await getDb();
  const {
    latitude,
    longitude,
    ts,
    altitude = null,
    accuracy = null,
    speed = null,
  } = p;

  await db.runAsync(
    `INSERT OR IGNORE INTO points
       (track_id, segment_index, ts, latitude, longitude, altitude, accuracy, speed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [trackId, segmentIndex, ts, latitude, longitude, altitude, accuracy, speed]
    );
}

export async function getTrackMeta(trackId: string): Promise<TrackMeta | null> {
  const db = await getDb();
  return (
    await db.getFirstAsync<TrackMeta>(
      `SELECT t.id AS track_id,
              t.distance AS distance,
              t.started_at,
              t.ended_at,
              l.label
       FROM tracks t
       LEFT JOIN track_labels l ON l.track_id = t.id
       WHERE t.id = ?
      LIMIT 1`,
      [trackId]
      )
    ) ?? null;
}

export async function loadTrackPoints(trackId: string) {
  const db = await getDb();
  const segments = await db.getAllAsync<{ segment_index: number }>(
    `SELECT DISTINCT segment_index
       FROM points
      WHERE track_id = ?
      ORDER BY segment_index ASC`,
    [trackId]
  );

  const out: Array<Array<{ latitude: number; longitude: number; ts: number }>> = [];
  for (const row of segments) {
    const pts = await db.getAllAsync<{ latitude: number; longitude: number; ts: number }>(
      `SELECT latitude, longitude, ts
         FROM points
        WHERE track_id = ? AND segment_index = ?
        ORDER BY ts ASC, rowid ASC`,
      [trackId, row.segment_index]
    );
    out.push(pts);
  }
  if (out.length === 0) out.push([]);
  return out;
}

export async function getTrackLabel(trackId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ label: string | null }>(
`SELECT label FROM track_labels WHERE track_id = ? LIMIT 1`,
[trackId]
);
  return row?.label ?? null;
}

export async function setTrackLabel(trackId: string, label: string | null): Promise<void> {
  const db = await getDb();
  const clean = (label ?? "").trim();
  if (!clean) {
    await db.runAsync(`DELETE FROM track_labels WHERE track_id = ?`, [trackId]);
    return;
  }
  const trimmed = clean.slice(0, 120);
  await db.runAsync(
    `INSERT INTO track_labels (track_id, label)
     VALUES (?, ?)
    ON CONFLICT(track_id) DO UPDATE SET label = excluded.label`,
    [trackId, trimmed]
    );
}

export async function deleteTrack(trackId: string): Promise<void> {
  const db = await getDb();
  try {
    await db.execAsync("BEGIN IMMEDIATE;");

    // Be robust across platforms:
    // 1) Explicitly delete children for web polyfills (FKs may not be enforced)
    await db.runAsync(`DELETE FROM points WHERE track_id = ?`, [trackId]);
    await db.runAsync(`DELETE FROM track_labels WHERE track_id = ?`, [trackId]);

    // 2) Delete the parent row (on native SQLite this would also cascade points)
    await db.runAsync(`DELETE FROM tracks WHERE id = ?`, [trackId]);

    await db.execAsync("COMMIT;");
  } catch (e) {
    try { await db.execAsync("ROLLBACK;"); } catch {}
    console.log("[DB] deleteTrack failed", e);
    throw e;
  }
}

export async function exportDatabase(): Promise<void> {
  const src = await getMainDbPath();

  // Make a timestamped copy to cache first
  const stamp = new Date().toISOString().replace(/[:-]/g, '').replace(/\..+/, '').replace('T', '-');
  const tmpUri = `${FileSystem.cacheDirectory}heidestein-${stamp}.db`;
  await FileSystem.copyAsync({ from: src, to: tmpUri });

  if (Platform.OS === 'android') {
    const { StorageAccessFramework } = FileSystem as any;
    const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm.granted) return;
    const destUri = await StorageAccessFramework.createFileAsync(
      perm.directoryUri,
      `heidestein-${stamp}`,
      'application/octet-stream'
    );
    const base64 = await FileSystem.readAsStringAsync(tmpUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await StorageAccessFramework.writeAsStringAsync(destUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } else {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(tmpUri, { dialogTitle: 'Export Heidestein Database' });
    }
  }
}

export async function importDatabase(): Promise<void> {
  const pick = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (pick.canceled) return;
  const pickedUri = pick.assets?.[0]?.uri;
  if (!pickedUri) throw new Error('No document selected.');

  const sqliteDir = `${FileSystem.documentDirectory}SQLite/`;
  try {
    await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });
  } catch {}

  const destUri = `${sqliteDir}import.db`;
  await FileSystem.copyAsync({ from: pickedUri, to: destUri });

  const attachPath = stripFileScheme(destUri);
  const db = await getDb();

  await db.execAsync(`ATTACH DATABASE ${sqlQuotePath(attachPath)} AS importdb`);

  const tables: Array<{ name: string }> =
    await db.getAllAsync(`SELECT name FROM importdb.sqlite_master WHERE type='table'`);

  const required = new Set(['tracks', 'points', 'track_labels']);
  const present = new Set(tables.map(t => t.name));

  for (const t of required) {
    if (!present.has(t)) {
      await db.execAsync('DETACH DATABASE importdb');
      throw new Error(
        `Backup is missing table "${t}". Make sure you selected a Heidestein backup (.db).`
      );
    }
  }
  try {
    await db.execAsync('BEGIN IMMEDIATE; PRAGMA foreign_keys=ON;');

    await db.execAsync(`
      INSERT OR IGNORE INTO tracks (id, started_at, ended_at)
      SELECT id, started_at, ended_at FROM importdb.tracks;
    `);

    await db.execAsync(`
      INSERT OR REPLACE INTO track_labels (track_id, label)
      SELECT track_id, label FROM importdb.track_labels;
    `);

    await db.execAsync(`
      INSERT OR IGNORE INTO points
        (track_id, segment_index, ts, latitude, longitude, altitude, accuracy, speed)
      SELECT track_id, segment_index, ts, latitude, longitude, altitude, accuracy, speed
      FROM importdb.points;
    `);

    await db.execAsync('COMMIT;');
  } catch (e) {
    await db.execAsync('ROLLBACK;');
    throw e;
  } finally {
    await db.execAsync('DETACH DATABASE importdb');
  }
}

// ---------- Utils ----------

async function getMainDbPath(): Promise<string> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ name: string; file: string }>('PRAGMA database_list');
  const main = rows?.find((r) => r.name === 'main' && r.file);
  if (!main?.file) throw new Error('Could not resolve SQLite main database file path.');
  return main.file.startsWith('file://') ? main.file : `file://${main.file}`;
}

function pathForAttach(uri: string): string {
  return uri.startsWith('file://') ? uri.replace('file://', '') : uri;
}

async function copyToCacheTemp(srcUri: string, name = 'import.db'): Promise<string> {
  const tmp = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.copyAsync({ from: srcUri, to: tmp });
  return tmp;
}

function stripFileScheme(uri: string) {
  return uri.startsWith('file://') ? uri.slice(7) : uri;
}

function sqlQuotePath(p: string) {
  return `'${p.replace(/'/g, "''")}'`;
}

export function haversine(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
  ) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude);
  const la2 = toRad(b.latitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(la1) * Math.cos(la2) * sinDLon * sinDLon;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}