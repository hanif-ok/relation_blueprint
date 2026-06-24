// JSON-safe base64 codec for media bytes in the backup bundle. Photos live in the `media`
// table as raw bytes; the export embeds them as base64 strings so the whole database is one
// self-contained JSON file. Correctness here is load-bearing: a lossy codec would silently
// corrupt photos and defeat the round-trip safety net (Pitfall 6).
//
// Chunked encode avoids a call-stack overflow on `String.fromCharCode(...bigArray)` for large
// photos. `atob`/`btoa` exist in browsers and modern Node (jsdom test env included).

const CHUNK = 0x8000; // 32K chars per fromCharCode call — safely under arg-count limits.

/** Encode raw bytes to a standard base64 string (no data-URL prefix). */
export function bytesToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += CHUNK) {
    binary += String.fromCharCode(...view.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Decode a base64 string back to the exact original bytes (ArrayBuffer). */
export function base64ToBytes(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out.buffer;
}
