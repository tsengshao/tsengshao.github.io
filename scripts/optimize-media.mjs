import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourceRoot = path.join(root, "media", "source");
const readyRoot = path.join(root, "media", "ready");

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".tif", ".tiff"]);
const motionExtensions = new Set([".gif", ".mov", ".mp4", ".m4v", ".avi", ".webm", ".mkv"]);

const imageMaxWidth = Number(process.env.MEDIA_IMAGE_MAX_WIDTH || 3200);
const imageQuality = Number(process.env.MEDIA_IMAGE_QUALITY || 88);
const imageLosslessMaxBytes = Number(process.env.MEDIA_IMAGE_LOSSLESS_MAX_BYTES || 1024 ** 2);
const videoMaxWidth = Number(process.env.MEDIA_VIDEO_MAX_WIDTH || 1920);
const videoMaxHeight = Number(process.env.MEDIA_VIDEO_MAX_HEIGHT || 1080);
const videoCrf = Number(process.env.MEDIA_VIDEO_CRF || 24);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error?.code === "ENOENT") {
    throw new Error(`Missing required command: ${command}`);
  }

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} failed${details ? `:\n${details}` : ""}`);
  }

  return result.stdout?.trim() || "";
}

async function collectFiles(directory) {
  const files = [];

  async function visit(current) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      if (entry.isFile()) files.push(fullPath);
    }
  }

  await visit(directory);
  return files.sort();
}

function imageWidth(inputPath) {
  const output = run(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width",
      "-of", "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ],
    { capture: true },
  );

  const width = Number(output);
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(`Unable to read image width: ${path.relative(root, inputPath)}`);
  }
  return width;
}

function replaceExtension(relativePath, extension) {
  return relativePath.slice(0, -path.extname(relativePath).length) + extension;
}

async function ensureUniqueOutput(outputPath, outputs) {
  const normalized = path.normalize(outputPath);
  if (outputs.has(normalized)) {
    throw new Error(`Multiple source files map to ${path.relative(root, outputPath)}`);
  }
  outputs.add(normalized);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
}

async function optimizeImage(inputPath, relativePath, outputs) {
  const outputPath = path.join(readyRoot, "figures", replaceExtension(relativePath, ".webp"));
  await ensureUniqueOutput(outputPath, outputs);

  const sourceStats = await fs.stat(inputPath);
  const useLossless = path.extname(inputPath).toLowerCase() === ".png"
    && sourceStats.size <= imageLosslessMaxBytes;
  const args = useLossless
    ? ["-quiet", "-mt", "-lossless", "-z", "9"]
    : ["-quiet", "-mt", "-m", "6", "-q", String(imageQuality)];
  if (imageWidth(inputPath) > imageMaxWidth) {
    args.push("-resize", String(imageMaxWidth), "0");
  }
  args.push(inputPath, "-o", outputPath);
  run("cwebp", args);
  return outputPath;
}

async function optimizeMotion(inputPath, relativePath, category, outputs) {
  const outputPath = path.join(readyRoot, category, replaceExtension(relativePath, ".mp4"));
  await ensureUniqueOutput(outputPath, outputs);

  const scale = [
    `w='min(${videoMaxWidth},iw)'`,
    `h='min(${videoMaxHeight},ih)'`,
    "force_original_aspect_ratio=decrease",
    "force_divisible_by=2",
  ].join(":");

  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", inputPath,
    "-map", "0:v:0", "-map", "0:a?",
    "-vf", `scale=${scale}`,
    "-c:v", "libx264", "-preset", "slow", "-crf", String(videoCrf),
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "128k",
    outputPath,
  ]);
  return outputPath;
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

async function main() {
  if (![imageMaxWidth, imageQuality, imageLosslessMaxBytes, videoMaxWidth, videoMaxHeight, videoCrf].every(Number.isFinite)) {
    throw new Error("Media optimization settings must be numeric.");
  }

  await fs.rm(readyRoot, { recursive: true, force: true });
  await Promise.all([
    fs.mkdir(path.join(sourceRoot, "figures"), { recursive: true }),
    fs.mkdir(path.join(sourceRoot, "videos"), { recursive: true }),
    fs.mkdir(path.join(sourceRoot, "animations"), { recursive: true }),
  ]);

  const outputs = new Set();
  const completed = [];

  const figureRoot = path.join(sourceRoot, "figures");
  for (const inputPath of await collectFiles(figureRoot)) {
    const extension = path.extname(inputPath).toLowerCase();
    if (!imageExtensions.has(extension)) {
      console.warn(`[media] skipped unsupported image: ${path.relative(root, inputPath)}`);
      continue;
    }
    const relativePath = path.relative(figureRoot, inputPath);
    completed.push(await optimizeImage(inputPath, relativePath, outputs));
  }

  for (const category of ["videos", "animations"]) {
    const categoryRoot = path.join(sourceRoot, category);
    for (const inputPath of await collectFiles(categoryRoot)) {
      const extension = path.extname(inputPath).toLowerCase();
      if (!motionExtensions.has(extension)) {
        console.warn(`[media] skipped unsupported motion file: ${path.relative(root, inputPath)}`);
        continue;
      }
      const relativePath = path.relative(categoryRoot, inputPath);
      completed.push(await optimizeMotion(inputPath, relativePath, category, outputs));
    }
  }

  if (completed.length === 0) {
    console.log("[media] no supported source files found under media/source");
    return;
  }

  console.log("[media] optimized files:");
  for (const outputPath of completed) {
    const stats = await fs.stat(outputPath);
    console.log(`- ${path.relative(root, outputPath)} (${humanSize(stats.size)})`);
  }
  console.log("[media] review media/ready, then manually copy approved files to public/media");
}

main().catch((error) => {
  console.error(`[media] ${error?.stack || error}`);
  console.error("Install local tools on macOS with: brew install ffmpeg webp");
  process.exitCode = 1;
});
