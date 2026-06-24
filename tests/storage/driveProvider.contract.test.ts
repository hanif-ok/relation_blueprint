// DriveProvider conformance test — proves INTERFACE PARITY with the InMemoryProvider.
//
// It runs the SAME assertions the InMemoryProvider conformance test runs (idempotent
// ensureFolder, immutable-new-file writeFile, in-place overwriteFile, byte round-trip, list/
// delete/stat), but against a real `DriveProvider` whose `fetch` is backed by a tiny in-memory
// fake Drive REST server. No live credential, no network: the contract is what matters, and the
// sync engine consumes exactly this contract.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DriveProvider } from '@/storage/drive/DriveProvider';
import type { StorageProvider } from '@/storage/StorageProvider';
import { __resetForTests as resetAuth } from '@/storage/drive/auth';

// ---- A minimal in-memory fake Drive REST backend behind `fetch` ----------------------------

interface FakeFile {
  id: string;
  name: string;
  parents: string[];
  mimeType: string;
  bytes: Uint8Array;
  modifiedTime: string;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function installFakeDrive() {
  const files = new Map<string, FakeFile>();
  let seq = 0;
  const newId = () => `drive-id-${++seq}`;

  async function multipartBytes(req: RequestInit): Promise<{ name: string; parents: string[]; content: Uint8Array }> {
    // The provider sends a Blob multipart body. Parse the JSON metadata part + the raw content.
    const blob = req.body as Blob;
    const buf = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder('latin1').decode(buf);
    const metaMatch = text.match(/\{[^]*?\}/);
    const meta = metaMatch ? (JSON.parse(metaMatch[0]) as { name: string; parents?: string[] }) : { name: 'unknown' };
    // Content is the bytes between the 2nd blank line and the trailing boundary.
    const parts = text.split('\r\n\r\n');
    // parts[0]=preamble+meta-header, parts[1]=meta+content-header, parts[2]=content+closing
    const contentSection = parts[2] ?? '';
    const endIdx = contentSection.lastIndexOf('\r\n--');
    const contentStr = endIdx >= 0 ? contentSection.slice(0, endIdx) : contentSection;
    // Recover the exact byte offset to preserve binary fidelity.
    const headerLen = text.indexOf(contentStr);
    const content = buf.slice(headerLen, headerLen + contentStr.length);
    return { name: meta.name, parents: meta.parents ?? [], content };
  }

  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();

    // --- files.list (folder search OR list-in-parent) ---
    if (url.startsWith('https://www.googleapis.com/drive/v3/files?q=') && method === 'GET') {
      const q = decodeURIComponent(new URL(url).searchParams.get('q') ?? '');
      const nameMatch = q.match(/name='((?:[^'\\]|\\.)*)'/);
      const wantName = nameMatch ? nameMatch[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\') : null;
      const wantsFolder = q.includes(`mimeType='${FOLDER_MIME}'`);
      const parentMatch = q.match(/'([^']+)' in parents/);
      const wantParent = parentMatch ? parentMatch[1] : null;
      const out = [...files.values()].filter((f) => {
        if (wantName !== null && f.name !== wantName) return false;
        if (wantsFolder && f.mimeType !== FOLDER_MIME) return false;
        if (wantParent && !f.parents.includes(wantParent)) return false;
        return true;
      });
      return jsonResponse({
        files: out.map((f) => ({
          id: f.id,
          name: f.name,
          size: String(f.bytes.length),
          modifiedTime: f.modifiedTime,
          mimeType: f.mimeType,
        })),
      });
    }

    // --- files.create folder (metadata only) ---
    if (url.startsWith('https://www.googleapis.com/drive/v3/files?fields=id') && method === 'POST') {
      const meta = JSON.parse((init!.body as string) ?? '{}') as { name: string; parents?: string[]; mimeType?: string };
      const id = newId();
      files.set(id, {
        id,
        name: meta.name,
        parents: meta.parents ?? [],
        mimeType: meta.mimeType ?? 'application/octet-stream',
        bytes: new Uint8Array(),
        modifiedTime: new Date().toISOString(),
      });
      return jsonResponse({ id });
    }

    // --- multipart create (new immutable file) ---
    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart') && method === 'POST') {
      const { name, parents, content } = await multipartBytes(init!);
      const id = newId();
      files.set(id, {
        id,
        name,
        parents,
        mimeType: 'application/octet-stream',
        bytes: content,
        modifiedTime: new Date().toISOString(),
      });
      return jsonResponse({ id });
    }

    // --- overwrite (PATCH ...uploadType=media) ---
    if (url.includes('/upload/drive/v3/files/') && url.includes('uploadType=media') && method === 'PATCH') {
      const id = decodeURIComponent(url.split('/upload/drive/v3/files/')[1].split('?')[0]);
      const f = files.get(id);
      if (!f) return new Response('not found', { status: 404 });
      const blob = init!.body as Blob;
      f.bytes = new Uint8Array(await blob.arrayBuffer());
      f.modifiedTime = new Date().toISOString();
      return jsonResponse({ id });
    }

    // --- readFile (alt=media) ---
    if (url.includes('/drive/v3/files/') && url.includes('alt=media') && method === 'GET') {
      const id = decodeURIComponent(url.split('/drive/v3/files/')[1].split('?')[0]);
      const f = files.get(id);
      if (!f) return new Response('not found', { status: 404 });
      return new Response(f.bytes.slice().buffer as ArrayBuffer, { status: 200 });
    }

    // --- stat (files.get metadata) ---
    if (url.includes('/drive/v3/files/') && url.includes('fields=id,name') && method === 'GET') {
      const id = decodeURIComponent(url.split('/drive/v3/files/')[1].split('?')[0]);
      const f = files.get(id);
      if (!f) return new Response('not found', { status: 404 });
      return jsonResponse({
        id: f.id,
        name: f.name,
        size: String(f.bytes.length),
        modifiedTime: f.modifiedTime,
        mimeType: f.mimeType,
      });
    }

    // --- delete ---
    if (url.match(/\/drive\/v3\/files\/[^?]+$/) && method === 'DELETE') {
      const id = decodeURIComponent(url.split('/drive/v3/files/')[1]);
      files.delete(id);
      // Real Drive returns 204; jsdom's Response rejects a 204 with a body, so use 200 here.
      return new Response('', { status: 200 });
    }

    return new Response(`unhandled: ${method} ${url}`, { status: 500 });
  });

  vi.stubGlobal('fetch', fetchImpl);
  return { files, fetchImpl };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

// ---- Token: make getValidToken() always succeed by stubbing env + a live GIS grant ---------

function installValidToken() {
  // Minimal GIS fake that hands back a long-lived token so authHeader() never trips.
  (globalThis as unknown as { window: Window }).window = globalThis as unknown as Window;
  (globalThis as unknown as { google: unknown }).google = {
    accounts: {
      oauth2: {
        initTokenClient(config: { callback: (r: { access_token: string; expires_in: number }) => void }) {
          return {
            requestAccessToken() {
              config.callback({ access_token: 'contract-token', expires_in: 3599 });
            },
          };
        },
        revoke(_t: string, done?: () => void) {
          done?.();
        },
      },
    },
  };
}

// ---- The shared conformance suite, parameterised over a provider factory -------------------

describe('DriveProvider conformance (StorageProvider interface parity)', () => {
  let provider: StorageProvider;

  beforeEach(async () => {
    resetAuth();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'contract-client.apps.googleusercontent.com');
    installFakeDrive();
    installValidToken();
    const { connect } = await import('@/storage/drive/auth');
    await connect();
    provider = new DriveProvider();
  });

  it('ensureFolder is idempotent — same name+parent returns the same id', async () => {
    const a = await provider.ensureFolder('Relation Blueprint');
    const b = await provider.ensureFolder('Relation Blueprint');
    expect(a).toBe(b);
  });

  it('ensureFolder distinguishes folders by name and parent', async () => {
    const root = await provider.ensureFolder('Relation Blueprint');
    const childA = await provider.ensureFolder('entities', root);
    const childB = await provider.ensureFolder('media', root);
    expect(childA).not.toBe(childB);
    expect(childA).not.toBe(root);
  });

  it('writeFile returns a NEW distinct id on every call (immutable-new-file)', async () => {
    const folder = await provider.ensureFolder('Relation Blueprint');
    const id1 = await provider.writeFile('people-000.json', folder, new Blob(['v1']), 'application/json');
    const id2 = await provider.writeFile('people-000.json', folder, new Blob(['v2']), 'application/json');
    expect(id1).not.toBe(id2);
  });

  it('readFile round-trips the exact bytes written', async () => {
    const folder = await provider.ensureFolder('Relation Blueprint');
    const payload = new Uint8Array([1, 2, 3, 250, 255]);
    const id = await provider.writeFile('blob', folder, new Blob([payload]), 'application/octet-stream');
    expect(await bytesOf(await provider.readFile(id))).toEqual(payload);
  });

  it('overwriteFile replaces content in place at a fixed id', async () => {
    const folder = await provider.ensureFolder('Relation Blueprint');
    const id = await provider.writeFile('manifest.json', folder, new Blob(['v1']), 'application/json');
    await provider.overwriteFile(id, new Blob(['v2']), 'application/json');
    expect(await (await provider.readFile(id)).text()).toBe('v2');
  });

  it('list returns the files written into a folder', async () => {
    const folder = await provider.ensureFolder('Relation Blueprint');
    await provider.writeFile('a.json', folder, new Blob(['a']), 'application/json');
    await provider.writeFile('b.json', folder, new Blob(['bb']), 'application/json');
    const names = (await provider.list(folder)).map((e) => e.name).sort();
    expect(names).toEqual(['a.json', 'b.json']);
  });

  it('delete removes a file so it no longer lists', async () => {
    const folder = await provider.ensureFolder('Relation Blueprint');
    const id = await provider.writeFile('gone.json', folder, new Blob(['x']), 'application/json');
    await provider.delete(id);
    expect((await provider.list(folder)).some((e) => e.id === id)).toBe(false);
  });

  it('stat reports the size and a modifiedAt for a file', async () => {
    const folder = await provider.ensureFolder('Relation Blueprint');
    const id = await provider.writeFile('sized', folder, new Blob(['abcde']), 'text/plain');
    const entry = await provider.stat(id);
    expect(entry.size).toBe(5);
    expect(typeof entry.modifiedAt).toBe('number');
  });

  it('a 401 throws TokenExpiredError and fires the expiry path', async () => {
    const folder = await provider.ensureFolder('Relation Blueprint');
    // Force the next fetch to 401.
    (globalThis.fetch as unknown as { mockResolvedValueOnce: (r: Response) => void }).mockResolvedValueOnce(
      new Response('unauthorized', { status: 401 }),
    );
    const { TokenExpiredError } = await import('@/storage/drive/auth');
    await expect(provider.list(folder)).rejects.toBeInstanceOf(TokenExpiredError);
  });
});
