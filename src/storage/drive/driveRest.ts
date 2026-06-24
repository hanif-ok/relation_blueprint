// driveRest — raw `fetch` wrappers over the Google Drive REST v3 API (RESEARCH ## Pattern 2
// ## Code Examples, all verified). No SDK: GIS gives us a bearer token and Drive's REST
// endpoints are CORS-enabled, so we call them directly from the SPA.
//
// Atomicity contract (the sync engine relies on it):
//   - createFile  -> POST .../upload/drive/v3/files?uploadType=multipart  (NEW immutable file)
//   - overwriteFile -> PATCH .../upload/drive/v3/files/<id>?uploadType=media  (manifest ONLY)
//   - ensureFolder -> find-or-create the VISIBLE "Relation Blueprint" folder
//   - readFile -> GET .../files/<id>?alt=media
//   - list / stat -> files.list / files.get metadata
//
// Every call attaches `Authorization: Bearer <getValidToken()>`. A 401 calls `markExpired()`
// (so the Reconnect banner fires) and throws `TokenExpiredError` — never a silent retry, never
// an auto-popped consent dialog (T-06-03).

import { getValidToken, markExpired, TokenExpiredError } from './auth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** A minimal Drive file resource as returned by files.get / files.list. */
export interface DriveFile {
  id: string;
  name: string;
  size?: string;
  modifiedTime?: string;
  mimeType?: string;
}

/** Resolve the bearer token or fail fast — a missing token is an expiry/reconnect event. */
function authHeader(): string {
  const value = getValidToken();
  if (!value) {
    markExpired();
    throw new TokenExpiredError('No valid Drive access token — reconnect required');
  }
  return `Bearer ${value}`;
}

/** Run a fetch, mapping a 401 to TokenExpiredError (+ expiry event) and other !ok to an Error. */
async function driveFetch(input: string, init: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    markExpired();
    throw new TokenExpiredError();
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Drive REST ${res.status} ${res.statusText}: ${body}`);
  }
  return res;
}

/** Quote a value for a Drive `q` query, escaping single quotes/backslashes (injection-safe). */
function quoteQ(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Idempotently ensure a VISIBLE folder named `name` exists under `parentId` (Drive root when
 * omitted) and return its id. Searches first (so a reconnect reuses the same folder), creates
 * only if absent. Never the hidden appDataFolder (T-06-02 / SETUP.md).
 */
export async function ensureFolder(name: string, parentId?: string): Promise<string> {
  const clauses = [
    `name='${quoteQ(name)}'`,
    `mimeType='${FOLDER_MIME}'`,
    'trashed=false',
    parentId ? `'${quoteQ(parentId)}' in parents` : null,
  ].filter(Boolean);
  const q = clauses.join(' and ');
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;

  const found = (await (await driveFetch(url, { headers: { Authorization: authHeader() } })).json()) as {
    files?: DriveFile[];
  };
  if (found.files && found.files.length > 0) return found.files[0].id;

  const metadata: Record<string, unknown> = { name, mimeType: FOLDER_MIME };
  if (parentId) metadata.parents = [parentId];
  const created = (await (
    await driveFetch(`${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    })
  ).json()) as DriveFile;
  return created.id;
}

/**
 * Create a NEW immutable file (metadata + content in a single multipart/related request) and
 * return its id. Each call creates a distinct file even with the same name — the immutable-
 * new-file semantic the atomic manifest swap relies on.
 */
export async function createFile(
  name: string,
  parentId: string,
  body: Blob,
  contentType: string,
): Promise<string> {
  const boundary = `rb_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  // Set mimeType on the file resource so Drive does not sniff/guess it. Shards are JSON and
  // media blobs have no filename extension, so an omitted mimeType would leave Drive assigning
  // an unexpected type that surfaces through stat/list filtering (WR-04).
  const metadata = JSON.stringify({ name, parents: [parentId], mimeType: contentType });
  const bodyBuffer = await body.arrayBuffer();

  // Assemble the multipart body as a Blob so binary content survives intact.
  const multipart = new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    metadata,
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${contentType}\r\n\r\n`,
    bodyBuffer,
    `\r\n--${boundary}--\r\n`,
  ]);

  const res = await driveFetch(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipart,
  });
  const created = (await res.json()) as DriveFile;
  return created.id;
}

/**
 * Overwrite the content of an existing file IN PLACE. This is the SINGLE atomic commit point
 * (the manifest) — everything else uses `createFile` to stay immutable (prohibition: never use
 * overwriteFile for shard/media files).
 */
export async function overwriteFile(fileId: string, body: Blob, contentType: string): Promise<void> {
  await driveFetch(`${DRIVE_UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media`, {
    method: 'PATCH',
    headers: { Authorization: authHeader(), 'Content-Type': contentType },
    body,
  });
}

/** List the files/folders directly inside `folderId`. */
export async function list(folderId: string): Promise<DriveFile[]> {
  const q = `'${quoteQ(folderId)}' in parents and trashed=false`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,modifiedTime,mimeType)&spaces=drive`;
  const json = (await (await driveFetch(url, { headers: { Authorization: authHeader() } })).json()) as {
    files?: DriveFile[];
  };
  return json.files ?? [];
}

/** Read the raw bytes of a file as a Blob. */
export async function readFile(fileId: string): Promise<Blob> {
  const res = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: authHeader() },
  });
  return res.blob();
}

/** Return metadata for a single file id. */
export async function stat(fileId: string): Promise<DriveFile> {
  const res = await driveFetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name,size,modifiedTime,mimeType`,
    { headers: { Authorization: authHeader() } },
  );
  return (await res.json()) as DriveFile;
}

/** Delete a file by id. */
export async function deleteFile(fileId: string): Promise<void> {
  await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { Authorization: authHeader() },
  });
}
