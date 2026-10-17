import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

// Curate a single frame without changing coordinates, textures, or scientific arrays.
const [inputPath, outputPath = "public/media/visualizations/taiwanvvm-1500.vvmweb"] = process.argv.slice(2);
if (!inputPath) throw new Error("Usage: node scripts/prepare-visualization.mjs /path/to/animation.vvmweb [output.vvmweb]");
if (path.resolve(inputPath) === path.resolve(outputPath)) throw new Error("Input and output must differ");
const file = fs.readFileSync(inputPath);
if (file.subarray(0, 8).toString() !== "VVMWEB2\n") throw new Error("Expected a VVMWEB2 package");
const length = file.readUInt32LE(8);
if (length > 64 * 1024 * 1024 || length + 12 > file.length) throw new Error("Invalid manifest length");
const original = JSON.parse(file.subarray(12, 12 + length));
if (original.format !== "vvmex-scene-v2") throw new Error("Unsupported scene format");
const selected = original.frames.find((frame) => frame.time === 54000);
if (!selected || !selected.scene.annotations?.some(({ text }) => text === "Time = 15:00")) {
  throw new Error("No verified 15:00 frame (54000 seconds) found");
}
const frame = structuredClone(selected);
// Time and legend are accessible HTML, independent of viewport dimensions/background.
delete frame.scene.overlay;
const keys = new Set();
function collect(value) {
  if (typeof value === "string" && original.assets[value]) keys.add(value);
  else if (value && typeof value === "object") Object.values(value).forEach(collect);
}
collect(frame);
const blocks = [];
const assets = {};
let offset = 0;
for (const key of keys) {
  const asset = original.assets[key];
  const start = 12 + length + asset.offset;
  if (asset.compression !== "gzip" || start < 12 + length || start + asset.length > file.length) throw new Error(`Invalid asset ${key}`);
  const block = file.subarray(start, start + asset.length);
  const raw = gunzipSync(block);
  if (raw.length !== asset.rawLength || createHash("sha256").update(raw).digest("hex") !== key || asset.sha256 !== key) throw new Error(`Asset verification failed: ${key}`);
  assets[key] = { ...asset, offset };
  blocks.push(block);
  offset += block.length;
}
const manifest = {
  ...original,
  complete: true,
  initialTime: frame.time,
  frames: [frame],
  assets,
  orientationAxes: { ...original.orientationAxes, OrientationAxesVisibility: ["0"] },
  websiteSelection: { time: frame.time, label: "15:00", originalIndex: frame.index, sourceSha256: createHash("sha256").update(file).digest("hex") },
};
const json = Buffer.from(JSON.stringify(manifest));
const header = Buffer.alloc(12);
header.write("VVMWEB2\n");
header.writeUInt32LE(json.length, 8);
const output = Buffer.concat([header, json, ...blocks]);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output);
console.log(`[prepare-visualization] 15:00, ${keys.size} verified assets, ${output.length} bytes → ${outputPath}`);
