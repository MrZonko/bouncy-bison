/*
 * Bouncy Bison asset worker — GENERATED at deploy time by scripts/packAssets.mjs
 * from scripts/sw.template.js. Do not edit the generated sw.js.
 *
 * The published site ships its art as one encrypted pack. This worker fetches
 * the pack once, decrypts it, and answers the game's asset requests from
 * memory at the URLs the game already uses, so the site carries no browsable
 * art. The JS and CSS bundles and the pack itself pass straight through.
 *
 * Obfuscation, not security: the key is right here, and what the GPU draws can
 * be captured. It stops the download-the-folder case, nothing more.
 */
const PACK_KEY_HEX = "a693b673eb0c43a7f49e9c087e291558e08af332d03f968badfafb2f3ac0fe9d";
const PACK_URL = "/bouncy-bison/assets/game-7a64c1e8c75d.pack";
const SCOPE = "/bouncy-bison/";
const PACKED_DIRS = ["spine","entities","environment","ui","vfx"];

// A new deploy means a new worker (new key, new pack URL): take over at once,
// including pages already open, so a returning tester never mixes the two.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

let filesPromise = null;

/** Fetch and decrypt the pack once per worker lifetime; retry after a failure. */
function openPack() {
  if (!filesPromise) {
    filesPromise = (async () => {
      const response = await fetch(PACK_URL);
      if (!response.ok) throw new Error(`asset pack: HTTP ${response.status}`);
      const raw = new Uint8Array(await response.arrayBuffer());
      const iv = raw.subarray(0, 12);
      const cipher = raw.subarray(12);
      const keyBytes = new Uint8Array(PACK_KEY_HEX.match(/../g).map((pair) => parseInt(pair, 16)));
      const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
      const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher));
      const magic = String.fromCharCode(plain[0], plain[1], plain[2], plain[3]);
      if (magic !== "BBPK") throw new Error("asset pack: bad header");
      const indexLength = new DataView(plain.buffer, plain.byteOffset, plain.byteLength).getUint32(4, true);
      const index = JSON.parse(new TextDecoder().decode(plain.subarray(8, 8 + indexLength)));
      const payload = plain.subarray(8 + indexLength);
      const files = new Map();
      for (const entry of index) {
        files.set(entry.path, { bytes: payload.subarray(entry.offset, entry.offset + entry.length), type: entry.type });
      }
      return files;
    })().catch((error) => {
      filesPromise = null;
      throw error;
    });
  }
  return filesPromise;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(`${SCOPE}assets/`)) return;
  const rel = decodeURIComponent(url.pathname.slice(SCOPE.length));
  const dir = rel.split("/")[1];
  if (!PACKED_DIRS.includes(dir)) return; // the bundles, the pack: not ours
  event.respondWith(
    (async () => {
      const files = await openPack();
      const file = files.get(rel);
      if (!file) return new Response(`not in the asset pack: ${rel}`, { status: 404 });
      return new Response(file.bytes, { headers: { "Content-Type": file.type, "Cache-Control": "no-store" } });
    })(),
  );
});
