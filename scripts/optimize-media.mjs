import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const root = process.cwd();
const sourceRoot = path.join(root, "media", "source");
const readyRoot = path.join(root, "media", "ready");

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".tif", ".tiff"]);
const motionExtensions = new Set([".gif", ".mov", ".mp4", ".m4v", ".avi", ".webm", ".mkv"]);

const imageMaxWidth = Number(process.env.MEDIA_IMAGE_MAX_WIDTH || 3200);
const imageQuality = Number(process.env.MEDIA_IMAGE_QUALITY || 88);
const imageLosslessMaxBytes = Number(process.env.MEDIA_IMAGE_LOSSLESS_MAX_BYTES || 1024 ** 2);
const removeImageBackground = !["0", "false", "off"].includes(
  String(process.env.MEDIA_REMOVE_BACKGROUND || "true").toLowerCase(),
);
const backgroundTolerance = Number(process.env.MEDIA_BACKGROUND_TOLERANCE || 24);
const backgroundEdgeCoverage = Number(process.env.MEDIA_BACKGROUND_EDGE_COVERAGE || 0.9);
const videoMaxWidth = Number(process.env.MEDIA_VIDEO_MAX_WIDTH || 1920);
const videoMaxHeight = Number(process.env.MEDIA_VIDEO_MAX_HEIGHT || 1080);
const videoCrf = Number(process.env.MEDIA_VIDEO_CRF || 24);
const skipMotion = ["1", "true", "on"].includes(String(process.env.MEDIA_SKIP_MOTION || "false").toLowerCase());

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

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function colorDistance(data, offset, background) {
  const red = data[offset] - background[0];
  const green = data[offset + 1] - background[1];
  const blue = data[offset + 2] - background[2];
  return Math.sqrt(red * red + green * green + blue * blue);
}

function removeFlatEdgeBackground(data, width, height) {
  const pixelCount = width * height;
  const cornerSize = Math.max(2, Math.min(24, Math.round(Math.min(width, height) * 0.01)));
  const cornerPixels = [];
  let transparentCornerPixels = 0;

  const sampleCorner = (startX, startY) => {
    for (let y = startY; y < startY + cornerSize; y += 1) {
      for (let x = startX; x < startX + cornerSize; x += 1) {
        const offset = (y * width + x) * 4;
        if (data[offset + 3] <= 16) {
          transparentCornerPixels += 1;
          continue;
        }
        cornerPixels.push([data[offset], data[offset + 1], data[offset + 2]]);
      }
    }
  };

  sampleCorner(0, 0);
  sampleCorner(width - cornerSize, 0);
  sampleCorner(0, height - cornerSize);
  sampleCorner(width - cornerSize, height - cornerSize);

  const totalCornerPixels = cornerSize * cornerSize * 4;
  if (transparentCornerPixels / totalCornerPixels >= 0.6) {
    return { status: "already-transparent" };
  }
  if (cornerPixels.length < totalCornerPixels * 0.6) {
    return { status: "not-uniform" };
  }

  const background = [0, 1, 2].map((channel) => median(cornerPixels.map((pixel) => pixel[channel])));
  const edgeStep = Math.max(1, Math.floor((width * 2 + height * 2) / 8000));
  let matchingEdgePixels = 0;
  let sampledEdgePixels = 0;

  const sampleEdgePixel = (x, y) => {
    const offset = (y * width + x) * 4;
    sampledEdgePixels += 1;
    if (data[offset + 3] <= 16 || colorDistance(data, offset, background) <= backgroundTolerance) {
      matchingEdgePixels += 1;
    }
  };

  for (let x = 0; x < width; x += edgeStep) {
    sampleEdgePixel(x, 0);
    sampleEdgePixel(x, height - 1);
  }
  for (let y = edgeStep; y < height - 1; y += edgeStep) {
    sampleEdgePixel(0, y);
    sampleEdgePixel(width - 1, y);
  }

  const edgeCoverage = matchingEdgePixels / sampledEdgePixels;
  if (edgeCoverage < backgroundEdgeCoverage) {
    return { status: "not-uniform", background, edgeCoverage };
  }

  const queue = new Int32Array(pixelCount);
  const visited = new Uint8Array(pixelCount);
  let queueStart = 0;
  let queueEnd = 0;

  const canRemove = (pixelIndex) => {
    const offset = pixelIndex * 4;
    return data[offset + 3] <= 16 || colorDistance(data, offset, background) <= backgroundTolerance;
  };

  const enqueue = (pixelIndex) => {
    if (visited[pixelIndex] || !canRemove(pixelIndex)) return;
    visited[pixelIndex] = 1;
    queue[queueEnd] = pixelIndex;
    queueEnd += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  const solidRemovalDistance = backgroundTolerance * 0.35;
  let changedPixels = 0;

  while (queueStart < queueEnd) {
    const pixelIndex = queue[queueStart];
    queueStart += 1;
    const offset = pixelIndex * 4;
    const originalAlpha = data[offset + 3];
    const distance = colorDistance(data, offset, background);
    const alphaScale = distance <= solidRemovalDistance
      ? 0
      : (distance - solidRemovalDistance) / (backgroundTolerance - solidRemovalDistance);
    const nextAlpha = Math.round(originalAlpha * Math.max(0, Math.min(1, alphaScale)));
    if (nextAlpha < originalAlpha) {
      data[offset + 3] = nextAlpha;
      changedPixels += 1;
    }

    const x = pixelIndex % width;
    if (x > 0) enqueue(pixelIndex - 1);
    if (x < width - 1) enqueue(pixelIndex + 1);
    if (pixelIndex >= width) enqueue(pixelIndex - width);
    if (pixelIndex < pixelCount - width) enqueue(pixelIndex + width);
  }

  return {
    status: changedPixels > 0 ? "removed" : "unchanged",
    background,
    edgeCoverage,
    changedPixels,
  };
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
  const metadata = await sharp(inputPath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Unable to read image dimensions: ${path.relative(root, inputPath)}`);
  }

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "shaoyu-media-"));
  let conversionInput = inputPath;
  let conversionWidth = metadata.width;
  let background = { status: removeImageBackground ? "not-uniform" : "disabled" };

  try {
    if (removeImageBackground) {
      const pipeline = sharp(inputPath).rotate();
      if (metadata.width > imageMaxWidth) {
        pipeline.resize({ width: imageMaxWidth, withoutEnlargement: true });
      }
      const { data, info } = await pipeline
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      background = removeFlatEdgeBackground(data, info.width, info.height);
      if (background.status === "removed") {
        conversionInput = path.join(temporaryDirectory, "transparent.png");
        conversionWidth = info.width;
        await sharp(data, {
          raw: {
            width: info.width,
            height: info.height,
            channels: 4,
          },
        }).png({ compressionLevel: 9 }).toFile(conversionInput);
      }
    }

    const useLossless = path.extname(inputPath).toLowerCase() === ".png"
      && sourceStats.size <= imageLosslessMaxBytes;
    const args = useLossless
      ? ["-quiet", "-mt", "-lossless", "-z", "9"]
      : ["-quiet", "-mt", "-m", "6", "-q", String(imageQuality)];
    args.push("-alpha_q", "100");
    if (conversionWidth > imageMaxWidth) {
      args.push("-resize", String(imageMaxWidth), "0");
    }
    args.push(conversionInput, "-o", outputPath);
    run("cwebp", args);
    return { outputPath, background };
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
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
  return { outputPath };
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

async function main() {
  if (![imageMaxWidth, imageQuality, imageLosslessMaxBytes, backgroundTolerance, backgroundEdgeCoverage, videoMaxWidth, videoMaxHeight, videoCrf].every(Number.isFinite)) {
    throw new Error("Media optimization settings must be numeric.");
  }
  if (backgroundTolerance <= 0 || backgroundTolerance > 100) {
    throw new Error("MEDIA_BACKGROUND_TOLERANCE must be greater than 0 and at most 100.");
  }
  if (backgroundEdgeCoverage < 0 || backgroundEdgeCoverage > 1) {
    throw new Error("MEDIA_BACKGROUND_EDGE_COVERAGE must be between 0 and 1.");
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

  for (const category of skipMotion ? [] : ["videos", "animations"]) {
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
  for (const item of completed) {
    const { outputPath, background } = item;
    const stats = await fs.stat(outputPath);
    let backgroundSummary = "";
    if (background?.status === "removed") {
      const color = background.background.map((channel) => channel.toString(16).padStart(2, "0")).join("");
      backgroundSummary = `; removed edge background #${color}`;
    } else if (background?.status === "already-transparent") {
      backgroundSummary = "; source background already transparent";
    } else if (background?.status === "not-uniform") {
      backgroundSummary = "; preserved non-uniform edge background";
    } else if (background?.status === "disabled") {
      backgroundSummary = "; background removal disabled";
    }
    console.log(`- ${path.relative(root, outputPath)} (${humanSize(stats.size)}${backgroundSummary})`);
  }
  if (skipMotion) console.log("[media] motion optimization skipped by MEDIA_SKIP_MOTION");
  console.log("[media] review media/ready, then manually copy approved files to public/media");
}

main().catch((error) => {
  console.error(`[media] ${error?.stack || error}`);
  console.error("Install local tools on macOS with: brew install ffmpeg webp");
  process.exitCode = 1;
});
