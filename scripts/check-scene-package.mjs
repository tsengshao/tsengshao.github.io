import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { ScenePackage, sha256Hex } from "../src/lib/vvm/scene-package.ts";

const referenceHash = (data) => createHash("sha256").update(data).digest("hex");
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
const setCrypto = (value) => Object.defineProperty(globalThis, "crypto", { value, configurable: true });
const vectors = [
  new Uint8Array(),
  new TextEncoder().encode("abc"),
  new TextEncoder().encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
  // Hash only the supplied view, not the surrounding buffer.
  new Uint8Array([0xff, 97, 98, 99, 0xff]).subarray(1, 4),
  ...[1, 55, 56, 63, 64, 65, 127, 128, 129, 1024, 1_048_576].map((length) =>
    Uint8Array.from({ length }, (_, i) => (i * 131 + 17) & 255)),
];
const good = new TextEncoder().encode("verified scene asset");
const goodHash = referenceHash(good);
const badHash = "0".repeat(64);
const altered = good.slice();
altered[0] ^= 1;

async function fixture(raw, { key = goodHash, hash = goodHash, rawLength = raw.length } = {}) {
  const compressed = gzipSync(raw);
  const manifest = new TextEncoder().encode(JSON.stringify({
    format: "vvmex-scene-v2",
    frames: [{ index: 0, time: 54000 }],
    assets: { [key]: { offset: 0, length: compressed.length, rawLength, sha256: hash, compression: "gzip" } },
  }));
  const prefix = new Uint8Array(12);
  prefix.set(new TextEncoder().encode("VVMWEB2\n"));
  new DataView(prefix.buffer).setUint32(8, manifest.length, true);
  return ScenePackage.open(new Blob([prefix, manifest, compressed]));
}

try {
  const published = new Blob([await readFile(new URL("../public/media/visualizations/taiwanvvm-1500.vvmweb", import.meta.url))]);
  for (const [mode, crypto] of [["Web Crypto", webcrypto], ["no subtle (LAN HTTP)", {}], ["no crypto", undefined]]) {
    setCrypto(crypto);
    for (const data of vectors) {
      const original = data.slice();
      assert.equal(await sha256Hex(data), referenceHash(data), `${mode}: SHA-256 mismatch for ${data.length} bytes`);
      assert.deepEqual(data, original, "Hashing must not mutate the input");
    }
    assert.deepEqual(await (await fixture(good)).asset(goodHash), good);
    await assert.rejects((await fixture(altered)).asset(goodHash), /SHA-256/);
    await assert.rejects((await fixture(good, { hash: badHash })).asset(goodHash), /SHA-256/);
    await assert.rejects((await fixture(good, { key: badHash })).asset(badHash), /SHA-256/);
    await assert.rejects((await fixture(good, { rawLength: good.length + 1 })).asset(goodHash), /資源長度不符/);

    const source = await ScenePackage.open(published);
    for (const key of Object.keys(source.manifest.assets)) await source.asset(key);
    console.log(`[check-scene] ${mode}: ${vectors.length} hash vectors, corruption/hash/key/length rejection, and all ${Object.keys(source.manifest.assets).length} published assets passed`);
  }
  setCrypto({ subtle: { digest: async () => { throw new Error("Native digest failed"); } } });
  await assert.rejects(sha256Hex(good), /Native digest failed/, "Native verification errors must not silently downgrade");
} finally {
  if (originalCrypto) Object.defineProperty(globalThis, "crypto", originalCrypto);
  else delete globalThis.crypto;
}
