import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const root = process.cwd();
const host = "127.0.0.1";
const port = Number(process.env.CV_RENDER_PORT || 4329);
const origin = `http://${host}:${port}`;
const astroBin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "astro.cmd" : "astro");

const artifactDir = path.join(root, "artifacts", "cv");
const publicDir = path.join(root, "public", "downloads");
const selectedArtifact = path.join(artifactDir, "Shao-Yu-Tseng-CV-selected.pdf");
const fullArtifact = path.join(artifactDir, "Shao-Yu-Tseng-CV-full.pdf");
const publicSelected = path.join(publicDir, "Shao-Yu-Tseng-CV.pdf");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForServer(server, pathname = "/cv") {
  const deadline = Date.now() + 45_000;
  let lastError;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Astro exited before the CV renderer was ready (exit ${server.exitCode}).`);
    }

    try {
      const response = await fetch(`${origin}${pathname}`);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${origin}${pathname}: ${lastError?.message || "unknown error"}`);
}

async function stopServer(server) {
  if (server.exitCode !== null) return;

  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    delay(5_000),
  ]);

  if (server.exitCode === null) server.kill("SIGKILL");
}

async function renderPdf(browser, route, outputPath) {
  const page = await browser.newPage();
  await page.emulateMedia({ media: "print" });

  try {
    const response = await page.goto(`${origin}${route}`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });

    if (!response?.ok()) {
      throw new Error(`Unable to render ${route}: HTTP ${response?.status() ?? "unknown"}`);
    }

    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    });
  } finally {
    await page.close();
  }
}

async function main() {
  await Promise.all([
    fs.mkdir(artifactDir, { recursive: true }),
    fs.mkdir(publicDir, { recursive: true }),
  ]);

  const serverOutput = [];
  const server = spawn(astroBin, ["dev", "--ignore-lock", "--host", host, "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      ASTRO_DEV_BACKGROUND: "0",
      BASE_PATH: "/",
      SITE_URL: origin,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (chunk) => serverOutput.push(String(chunk)));
  server.stderr.on("data", (chunk) => serverOutput.push(String(chunk)));

  let browser;
  try {
    await waitForServer(server);
    browser = await chromium.launch({ headless: true });
    await renderPdf(browser, "/cv", selectedArtifact);
    await renderPdf(browser, "/cv/full", fullArtifact);
    await fs.copyFile(selectedArtifact, publicSelected);
  } catch (error) {
    const details = serverOutput.join("").trim();
    if (details) console.error(details);
    if (String(error?.message || error).includes("Executable doesn't exist")) {
      console.error("Install the PDF browser once with: npx playwright install chromium");
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    await stopServer(server);
  }

  const [selectedStats, fullStats] = await Promise.all([
    fs.stat(selectedArtifact),
    fs.stat(fullArtifact),
  ]);

  console.log(`[render-cv-pdfs] selected: ${path.relative(root, selectedArtifact)} (${selectedStats.size} bytes)`);
  console.log(`[render-cv-pdfs] full: ${path.relative(root, fullArtifact)} (${fullStats.size} bytes)`);
  console.log(`[render-cv-pdfs] public download: ${path.relative(root, publicSelected)}`);
}

main().catch((error) => {
  console.error(`[render-cv-pdfs] ${error?.stack || error}`);
  process.exitCode = 1;
});
