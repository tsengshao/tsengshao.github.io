import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.argv[2] || "http://127.0.0.1:4323/";
await fs.mkdir("artifacts/visualization", { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 768 : 844 }, deviceScaleFactor: width === 1440 ? 2 : 1, reducedMotion: "reduce", isMobile: width <= 600, hasTouch: width <= 600 });
    const page = await context.newPage();
    const failures = [];
    const packages = [];
    let mobileRendererURL;
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("requestfailed", (request) => {
      // Offscreen research media and unloaded YouTube players cancel pending requests.
      if (request.failure()?.errorText === "net::ERR_ABORTED" && (request.resourceType() === "media" || request.url().startsWith("https://www.youtube-nocookie.com/embed/"))) return;
      failures.push(`${request.url()}: ${request.failure()?.errorText}`);
    });
    page.on("request", (request) => {
      if (request.url().includes(".vvmweb")) packages.push(request.url());
      if (/local-renderer\.[^/]+\.js/.test(request.url())) mobileRendererURL = request.url();
    });
    const youtubeRequests = [];
    await page.route("https://www.youtube-nocookie.com/embed/**", (route) => {
      youtubeRequests.push(route.request().url());
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>YouTube test player</title><body style='margin:0;background:#000;color:white'>YouTube test player</body>" });
    });
    await page.goto(origin);
    assert.equal(youtubeRequests.length, 0, "Offscreen YouTube entries must not contact YouTube");
    assert.equal(await page.locator("[data-youtube]").getAttribute("src"), null);
    assert.equal(packages.length, 0, "3D package must not load above the gallery");
    const card = page.locator("[data-visualization]").first();
    const home = async () => {
      const canvas = card.locator("[data-canvas]");
      await canvas.focus();
      await page.keyboard.press("Home");
      // The keyboard focus outline is UI decoration, not part of the scene.
      await canvas.evaluate((element) => element.blur());
    };
    await card.scrollIntoViewIfNeeded();
    await page.waitForSelector('[data-visualization][data-state="ready"]', { timeout: 60000 });
    assert.equal(packages.length, 1, "The single-frame package should load once");
    assert.ok(packages[0].includes("taiwanvvm-1500.vvmweb"));
    const geometry = await page.evaluate(() => {
      const gallery = document.querySelector("[data-visualization-gallery]").getBoundingClientRect();
      const container = document.querySelector(".visualization-section .container");
      const box = container.getBoundingClientRect();
      const sectionHeight = document.querySelector("#visualization").getBoundingClientRect().height;
      const availableHeight = innerHeight - document.querySelector(".navbar").getBoundingClientRect().height;
      const viewport = document.querySelector("[data-visualization-viewport]").getBoundingClientRect();
      const views = document.querySelector(".visualization-views").getBoundingClientRect();
      const zoom = document.querySelector(".visualization-zoom").getBoundingClientRect();
      const legendElement = document.querySelector("[data-legend]");
      const legend = legendElement.getBoundingClientRect();
      const video = document.querySelector('[data-kind="youtube"] [data-visualization-viewport]').getBoundingClientRect();
      const sceneCard = document.querySelector('[data-kind="scene"]').getBoundingClientRect();
      const videoCard = document.querySelector('[data-kind="youtube"]').getBoundingClientRect();
      const horizontal = (selector, allowWrap = false) => {
        const buttons = [...document.querySelectorAll(`${selector} button`)].map((button) => button.getBoundingClientRect());
        return buttons.every((button, i) => !i || (button.left > buttons[i - 1].right && Math.abs(button.y + button.height / 2 - (buttons[i - 1].y + buttons[i - 1].height / 2)) < 1) || (allowWrap && button.top > buttons[i - 1].bottom && button.left <= buttons[i - 1].left));
      };
      return {
        width: viewport.width, sectionHeight, availableHeight,
        equalFrames: Math.abs(viewport.height - video.height) < 1 && Math.abs(viewport.width - video.width) < 1 && Math.abs(viewport.width / viewport.height - 16 / 9) < 0.01,
        arranged: innerWidth >= 1000 ? Math.abs(viewport.top - video.top) < 1 && sceneCard.right < videoCard.left : Math.abs(viewport.left - video.left) < 1 && sceneCard.bottom < videoCard.top,
        outsideControls: views.top >= viewport.bottom && zoom.top >= viewport.bottom && views.right < zoom.left,
        legendPlacement: legend.left >= viewport.left && legend.right <= viewport.right && legend.top >= viewport.top && legend.bottom <= viewport.bottom && Math.abs(viewport.right - legend.right - 12) < 1 && Math.abs(legend.top - viewport.top - 12) < 1,
        legendTransparent: getComputedStyle(legendElement).backgroundColor === "rgba(0, 0, 0, 0)",
        legendPassThrough: Boolean(document.elementFromPoint(legend.left + 5, legend.top + 5)?.closest("[data-visualization-viewport]")),
        controlsAligned: horizontal(".visualization-views", true) && horizontal(".visualization-zoom"),
        centered: Math.abs(gallery.x + gallery.width / 2 - (box.x + box.width / 2)) < 1,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.ok(geometry.centered);
    assert.equal(geometry.overflow, false);
    assert.ok(geometry.equalFrames, "Both media frames must have the same height and 16:9 ratio");
    assert.ok(geometry.arranged, "Media must be side by side on wide screens and stacked on narrow screens");
    assert.ok(geometry.outsideControls);
    assert.ok(geometry.legendPlacement, "Legend must be inside the image's upper-right");
    assert.ok(geometry.legendTransparent);
    assert.ok(geometry.legendPassThrough, "Mobile legend must not intercept scene gestures");
    assert.ok(geometry.controlsAligned);
    assert.equal(await card.locator(".visualization-touch-help").isVisible(), width <= 600);
    const help = await card.locator(".visualization-help").innerText();
    assert.ok(width <= 600 ? help.includes("Two-finger drag to pan") && help.includes("Pinch to zoom") && !help.includes("Shift") : help.includes("Shift-drag to pan") && !help.includes("Two-finger"));
    assert.equal(await page.evaluate(() => {
      const section = document.querySelector("#visualization");
      return getComputedStyle(section).backgroundColor !== getComputedStyle(section.previousElementSibling).backgroundColor;
    }), true, "Gallery should have a different section background from Research");
    assert.equal(await card.locator("figcaption").textContent(), "TaiwanVVMex Simulation");
    assert.equal(await page.locator("#visualization-title").textContent(), "Visualization");
    assert.equal(await page.locator(".visualization-heading p").textContent(), "I enjoy creating scientific visualizations.");
    assert.equal(await page.locator("[data-visualization]").count(), 2);
    assert.equal(await page.locator("[data-experiment], [aria-roledescription=carousel], [aria-roledescription=slide]").count(), 0);
    assert.equal(await page.locator("[data-visualization][hidden]").count(), 0);
    assert.ok(!(await card.innerText()).includes("Afternoon Thunderstorm"));
    assert.ok(!(await card.innerText()).includes("15:00"));
    assert.equal(await card.locator("[data-reset]").count(), 0, "Reset button should be absent");
    const plus = await card.locator('[data-zoom="in"]').boundingBox();
    const minus = await card.locator('[data-zoom="out"]').boundingBox();
    assert.ok(minus.x + minus.width < plus.x, "Minus left, plus right at every width");
    assert.equal(await card.locator("[data-zoom-value]").textContent(), "1×");
    assert.equal(await card.locator('[data-view="top"]').getAttribute("aria-pressed"), "true", "Top should be the initial view");
    await page.evaluate(() => { const bar = document.querySelector("astro-dev-toolbar"); if (bar) bar.style.display = "none"; });
    await page.locator("#visualization").screenshot({ path: `artifacts/visualization/gallery-${width}.png` });
    const viewport = card.locator("[data-visualization-viewport]");
    const rendered = card.locator("[data-canvas]");
    const defaultImage = await rendered.screenshot();
    if (width === 1440) await card.locator("[data-canvas]").screenshot({ path: "artifacts/visualization/default-view.png" });
    await card.locator('[data-view="north"]').click();
    assert.equal(await card.locator("[data-zoom-value]").textContent(), "1×");
    assert.equal(await card.locator('[data-view="north"]').getAttribute("aria-pressed"), "true");
    const north = await rendered.screenshot();
    assert.notEqual(Buffer.compare(defaultImage, north), 0, "North must differ from default Top");
    await viewport.screenshot({ path: `artifacts/visualization/north-${width}.png` });
    await card.locator('[data-zoom="in"]').click();
    await card.locator('[data-view="north"]').click();
    assert.equal(await card.locator("[data-zoom-value]").textContent(), "1×", "North must reset absolute zoom, not accumulate it");
    await card.locator('[data-view="southwest"]').click();
    assert.equal(await card.locator("[data-zoom-value]").textContent(), "1.7×");
    const southwest = await rendered.screenshot();
    assert.notEqual(Buffer.compare(defaultImage, southwest), 0, "Southwest must differ from default Top");
    assert.notEqual(Buffer.compare(north, southwest), 0, "North and Southwest must show different directions");
    await viewport.screenshot({ path: `artifacts/visualization/southwest-${width}.png` });
    await card.locator('[data-view="top"]').click();
    assert.equal(await card.locator("[data-zoom-value]").textContent(), "1×");
    assert.equal(await card.locator('[data-view="top"]').getAttribute("aria-pressed"), "true");
    assert.notEqual(Buffer.compare(southwest, await rendered.screenshot()), 0, "Top view must change rendered pixels");
    await viewport.screenshot({ path: `artifacts/visualization/top-${width}.png` });
    await card.locator('[data-view="south"]').click();
    assert.equal(await card.locator("[data-zoom-value]").textContent(), "1.2×");
    await viewport.screenshot({ path: `artifacts/visualization/south-${width}.png` });
    await card.locator('[data-zoom="in"]').click();
    await page.waitForFunction(() => document.querySelector("[data-zoom-value]").value === "1.4×");
    await home();
    assert.equal(await card.locator("[data-zoom-value]").textContent(), "1×");
    assert.equal(await card.locator('[data-view="top"]').getAttribute("aria-pressed"), "true");
    const canvas = card.locator("[data-canvas]");
    const pointerBounds = await canvas.boundingBox();
    await page.mouse.move(pointerBounds.x + pointerBounds.width / 2, pointerBounds.y + pointerBounds.height / 2);
    await page.mouse.wheel(0, -100);
    await page.waitForFunction(() => document.querySelector("[data-zoom-value]").value !== "1×");
    await home();
    await canvas.focus();
    await page.keyboard.press("ArrowLeft");
    assert.notEqual(Buffer.compare(defaultImage, await rendered.screenshot()), 0, "Keyboard rotation must change rendered pixels");
    await page.keyboard.press("Home");
    const bounds = await canvas.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.52, { steps: 8 });
    await page.mouse.up();
    assert.notEqual(Buffer.compare(defaultImage, await rendered.screenshot()), 0, "Pointer rotation must change rendered pixels");
    await home();
    await page.keyboard.down("Shift");
    await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + bounds.height * 0.55, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    assert.notEqual(Buffer.compare(defaultImage, await rendered.screenshot()), 0, "Shift-drag must move the scene");
    await home();
    assert.equal(Buffer.compare(defaultImage, await rendered.screenshot()), 0, "Home must restore Top after panning");
    if (width === 390) {
      assert.ok(mobileRendererURL);
      await page.evaluate(async (url) => {
        const { LocalRenderer } = await import(url);
        const applyPose = LocalRenderer.prototype.applyPose;
        LocalRenderer.prototype.applyPose = function (pose) {
          window.__mobileViewer = this;
          return applyPose.call(this, pose);
        };
      }, mobileRendererURL);
      await home();
      const touchCamera = () => page.evaluate(() => ({ camera: window.__mobileViewer.stats().camera, zoom: window.__mobileViewer.getZoom() }));
      const cdp = await context.newCDPSession(page);
      const x = bounds.x + bounds.width / 2;
      const y = bounds.y + bounds.height / 2;
      const beforePan = await touchCamera();
      const scrollBefore = await page.evaluate(() => scrollY);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x - 35, y, id: 1 }, { x: x + 35, y, id: 2 }] });
      for (let step = 1; step <= 8; step++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 35 + step * 7, y: y + step * 3, id: 1 }, { x: x + 35 + step * 7, y: y + step * 3, id: 2 }] });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      const afterPan = await touchCamera();
      const movement = afterPan.camera.position.map((value, i) => value - beforePan.camera.position[i]);
      assert.ok(Math.hypot(...movement) > 1, "Two-finger dragging must move the scene");
      for (let i = 0; i < 3; i++) {
        assert.ok(Math.abs(movement[i] - (afterPan.camera.focalPoint[i] - beforePan.camera.focalPoint[i])) < 1e-6, "Touch pan must translate camera and focus equally");
        assert.ok(Math.abs(afterPan.camera.viewUp[i] - beforePan.camera.viewUp[i]) < 1e-8, "Touch pan must preserve orientation");
      }
      assert.ok(Math.abs(afterPan.zoom - beforePan.zoom) < 1e-8, "Parallel two-finger pan must not zoom");
      assert.equal(await page.evaluate(() => scrollY), scrollBefore, "Scene touch gestures must not scroll the page");
      assert.notEqual(Buffer.compare(defaultImage, await rendered.screenshot()), 0);
      await home();
      assert.equal(Buffer.compare(defaultImage, await rendered.screenshot()), 0, "Home must restore Top after touch pan");

      const beforePinch = await touchCamera();
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x - 35, y, id: 1 }, { x: x + 35, y, id: 2 }] });
      for (let spread = 40; spread <= 70; spread += 5) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - spread, y, id: 1 }, { x: x + spread, y, id: 2 }] });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForFunction(() => document.querySelector("[data-zoom-value]").value !== "1×");
      const afterPinch = await touchCamera();
      assert.ok(afterPinch.zoom > beforePinch.zoom, "Spreading fingers must zoom in");
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(afterPinch.camera.focalPoint[i] - beforePinch.camera.focalPoint[i]) < 1e-6, "Centered pinch must not pan");
      await home();
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
      for (let step = 1; step <= 8; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + step * 5, y: y + step * 2, id: 1 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      assert.notEqual(Buffer.compare(defaultImage, await rendered.screenshot()), 0, "One-finger drag must still rotate after two-finger gestures");
      await home();
      assert.equal(Buffer.compare(defaultImage, await rendered.screenshot()), 0);
      await cdp.detach();
      console.log("[check-visualization] Touch: two-finger pan preserves orientation/zoom, pinch zooms, one-finger rotation and Home restore passed");
    }
    const video = page.locator('[data-visualization][data-kind="youtube"]');
    const frame = video.locator("[data-youtube]");
    const videoSource = "https://www.youtube-nocookie.com/embed/Z440GYvxCAs";
    await video.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector("[data-youtube]").hasAttribute("src"));
    assert.equal(await frame.getAttribute("src"), videoSource);
    await page.frameLocator("[data-youtube]").getByText("YouTube test player").waitFor();
    assert.equal(await card.isVisible(), true);
    assert.equal(await video.isVisible(), true);
    assert.equal(await video.locator("figcaption").textContent(), "genesis");
    assert.equal(await frame.getAttribute("title"), "genesis — YouTube video");
    assert.equal(await video.locator("[data-canvas], [data-view], [data-zoom], [data-legend]").count(), 0, "Videos must not show 3D controls");
    assert.equal(await video.locator("a").getAttribute("href"), "https://www.youtube.com/watch?v=Z440GYvxCAs");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator("#visualization").screenshot({ path: `artifacts/visualization/video-${width}.png` });
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForFunction(() => !document.querySelector("[data-youtube]").hasAttribute("src"));
    const previousRequests = youtubeRequests.length;
    await video.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector("[data-youtube]").hasAttribute("src"));
    await page.frameLocator("[data-youtube]").getByText("YouTube test player").waitFor();
    assert.equal(youtubeRequests.length, previousRequests + 1, "Returning to the video must reload its player");
    await card.scrollIntoViewIfNeeded();
    assert.equal(await card.getAttribute("data-state"), "ready", "Scrolling back must preserve the ready 3D scene");
    assert.equal(packages.length, 1, "Scrolling back must not fetch the scene again");
    assert.deepEqual(failures, []);
    console.log(`[check-visualization] ${width}px: equal-height frames, responsive grid, in-image legend, controls, lazy YouTube unload/reload, retained scene, pan/rotation/zoom passed (embed stubbed)`);
    if (width === 1440) {
      for (const size of [{ width: 1440, height: 720 }, { width: 1366, height: 768 }, { width: 1000, height: 768 }, { width: 999, height: 768 }, { width: 768, height: 844 }, { width: 600, height: 844 }]) {
        await page.setViewportSize(size);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await home();
        const layout = await page.evaluate(() => {
          const [scene, video] = [...document.querySelectorAll("[data-visualization-viewport]")].map((element) => element.getBoundingClientRect());
          const [sceneCard, videoCard] = [...document.querySelectorAll("[data-visualization]")].map((element) => element.getBoundingClientRect());
          const views = document.querySelector(".visualization-views").getBoundingClientRect();
          const zoom = document.querySelector(".visualization-zoom").getBoundingClientRect();
          return {
            equal: Math.abs(scene.height - video.height) < 1,
            arranged: innerWidth >= 1000 ? Math.abs(scene.top - video.top) < 1 && sceneCard.right < videoCard.left : Math.abs(scene.left - video.left) < 1 && sceneCard.bottom < videoCard.top,
            overflow: document.documentElement.scrollWidth > innerWidth,
            controls: views.right < zoom.left && views.top >= scene.bottom && zoom.top >= scene.bottom,
          };
        });
        assert.ok(layout.equal && layout.arranged && layout.controls && !layout.overflow, `Responsive layout at ${size.width}px: ${JSON.stringify(layout)}`);
        await page.locator("#visualization").screenshot({ path: `artifacts/visualization/layout-${size.width}.png` });
        console.log(`[check-visualization] ${size.width}×${size.height}: equal-height ${size.width >= 1000 ? "columns" : "stack"}, no overflow or overlapping controls`);
      }
    }
    await context.close();
  }
  // A short mobile viewport exposes the scene while the next media frame is offscreen.
  // Observe each frame independently, rather than loading everything in the section.
  const shortContext = await browser.newContext({ viewport: { width: 390, height: 400 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  let shortVideoRequests = 0;
  await shortContext.route("https://www.youtube-nocookie.com/embed/**", (route) => {
    shortVideoRequests++;
    return route.fulfill({ contentType: "text/html", body: "YouTube test player" });
  });
  const shortPage = await shortContext.newPage();
  await shortPage.goto(origin);
  const showScene = () => shortPage.evaluate(() => {
    const frame = document.querySelector('[data-kind="scene"] [data-visualization-viewport]');
    scrollTo(0, scrollY + frame.getBoundingClientRect().top - 100);
  });
  await showScene();
  await shortPage.waitForSelector('[data-kind="scene"][data-state="ready"]', { timeout: 60000 });
  assert.equal(await shortPage.locator("[data-youtube]").getAttribute("src"), null, "Offscreen video must stay unloaded while the scene is visible");
  assert.equal(shortVideoRequests, 0);
  await shortPage.locator('[data-view="south"]').click();
  await shortPage.locator('[data-kind="youtube"]').scrollIntoViewIfNeeded();
  await shortPage.waitForFunction(() => document.querySelector("[data-youtube]").hasAttribute("src"));
  await shortPage.frameLocator("[data-youtube]").getByText("YouTube test player").waitFor();
  await showScene();
  await shortPage.waitForFunction(() => !document.querySelector("[data-youtube]").hasAttribute("src"));
  assert.equal(await shortPage.locator("[data-zoom-value]").textContent(), "1.2×", "Scrolling between media must preserve scene zoom");
  assert.equal(await shortPage.locator('[data-view="south"]').getAttribute("aria-pressed"), "true");
  await shortPage.locator('[data-kind="youtube"]').scrollIntoViewIfNeeded();
  await shortPage.waitForFunction(() => document.querySelector("[data-youtube]").hasAttribute("src"));
  await shortPage.evaluate(() => dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  assert.equal(await shortPage.locator("[data-youtube]").getAttribute("src"), null);
  await shortPage.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await shortPage.waitForFunction(() => document.querySelector("[data-youtube]").hasAttribute("src"));
  await shortContext.close();
  console.log("[check-visualization] Short mobile viewport: independent loading/unloading, retained camera and cached-page lifecycle events passed");

  // A real insecure HTTP origin, without browser flags or mocking Web Crypto.
  // Proxy only this isolated test hostname to the local production preview.
  const upstream = new URL(origin);
  const upstreamURL = (value) => {
    const url = new URL(value);
    url.protocol = upstream.protocol;
    url.host = upstream.host;
    return url.href;
  };
  const httpURL = new URL(origin);
  httpURL.protocol = "http:";
  httpURL.hostname = "gallery-http.test";
  httpURL.port = "";
  const httpContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  await httpContext.route("https://www.youtube-nocookie.com/embed/**", (route) => route.fulfill({ contentType: "text/html", body: "YouTube test player" }));
  await httpContext.route("http://gallery-http.test/**", async (route) => {
    const response = await route.fetch({ url: upstreamURL(route.request().url()) });
    await route.fulfill({ response });
  });
  const httpPage = await httpContext.newPage();
  const httpErrors = [];
  httpPage.on("pageerror", (error) => httpErrors.push(error.message));
  httpPage.on("console", (message) => { if (message.type() === "error") httpErrors.push(message.text()); });
  await httpPage.goto(httpURL.href);
  assert.deepEqual(await httpPage.evaluate(() => ({ secure: isSecureContext, subtle: Boolean(globalThis.crypto?.subtle) })), { secure: false, subtle: false });
  await httpPage.locator("#visualization").scrollIntoViewIfNeeded();
  await httpPage.waitForSelector('[data-visualization][data-state="ready"]', { timeout: 60000 });
  await httpPage.locator('[data-view="north"]').click();
  assert.equal(await httpPage.locator("[data-zoom-value]").textContent(), "1×");
  await httpPage.locator('[data-zoom="in"]').click();
  await httpPage.waitForFunction(() => document.querySelector("[data-zoom-value]").value === "1.2×");
  assert.deepEqual(httpErrors, [], "Valid scenes must load without errors on LAN-style HTTP");
  await httpPage.locator("#visualization").screenshot({ path: "artifacts/visualization/gallery-http-mobile.png" });
  console.log("[check-visualization] Insecure mobile HTTP: no Web Crypto, scene loaded, North and zoom passed");

  // Do not fix HTTP by skipping integrity checks: wrong SHA-256 must still fail.
  await httpPage.route("**/*.vvmweb", async (route) => {
    const response = await route.fetch({ url: upstreamURL(route.request().url()) });
    const body = await response.body();
    const length = body.readUInt32LE(8);
    const manifest = JSON.parse(body.subarray(12, 12 + length).toString());
    for (const asset of Object.values(manifest.assets)) asset.sha256 = "0".repeat(64);
    const encoded = Buffer.from(JSON.stringify(manifest));
    const prefix = Buffer.from(body.subarray(0, 12));
    prefix.writeUInt32LE(encoded.length, 8);
    await route.fulfill({ status: 200, contentType: "application/octet-stream", body: Buffer.concat([prefix, encoded, body.subarray(12 + length)]) });
  });
  await httpPage.reload();
  await httpPage.locator("#visualization").scrollIntoViewIfNeeded();
  await httpPage.waitForSelector('[data-visualization][data-state="error"]', { timeout: 60000 });
  assert.ok(httpErrors.some((message) => message.includes("SHA-256 驗證失敗")), "Insecure HTTP must reject mismatched SHA-256");
  assert.equal(await httpPage.locator("[data-retry]").isVisible(), true);
  assert.equal(await httpPage.locator(".visualization-preview").isVisible(), true);
  await httpContext.close();
  console.log("[check-visualization] Insecure HTTP rejects wrong SHA-256 and retains preview/retry");

  // A failed package request must retain a usable preview and offer a retry.
  const page = await browser.newPage({ reducedMotion: "no-preference" });
  await page.route("https://www.youtube-nocookie.com/embed/**", (route) => route.fulfill({ contentType: "text/html", body: "YouTube test player" }));
  let rendererURL;
  page.on("request", (request) => {
    if (/local-renderer\.[^/]+\.js/.test(request.url())) rendererURL = request.url();
  });
  await page.route("**/*.vvmweb", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto(origin);
  await page.locator("#visualization").scrollIntoViewIfNeeded();
  await page.waitForSelector('[data-visualization][data-state="error"]');
  assert.equal(await page.locator("[data-retry]").isVisible(), true);
  await page.unroute("**/*.vvmweb");
  await page.locator("[data-retry]").click();
  await page.waitForSelector('[data-visualization][data-state="ready"]', { timeout: 60000 });
  console.log("[check-visualization] Failed-load preview and retry passed");

  // Observe actual camera frames in this isolated test page. Reduced-motion tests
  // above deliberately bypass animation and cannot catch the Top pole snap.
  assert.ok(rendererURL, "Renderer module should be observable in the static preview");
  await page.evaluate(async (url) => {
    const module = await import(url);
    const Renderer = module.LocalRenderer;
    const applyPose = Renderer.prototype.applyPose;
    window.__cameraSamples = [];
    Renderer.prototype.applyPose = function (pose) {
      window.__cameraTestViewer = this;
      window.__cameraSamples.push({ position: [...pose.position], focalPoint: [...pose.focalPoint], viewUp: [...pose.viewUp], time: performance.now() });
      return applyPose.call(this, pose);
    };
  }, rendererURL);
  const animated = page.locator("[data-visualization]").first();
  const transitions = [];
  for (const from of ["north", "southwest", "south"]) {
    await animated.locator(`[data-view="${from}"]`).click();
    await page.waitForFunction(() => window.__cameraTestViewer && !window.__cameraTestViewer.stats().transitioning);
    const start = await page.evaluate(() => window.__cameraTestViewer.stats().camera);
    const actualZoom = await page.evaluate(() => window.__cameraTestViewer.getZoom());
    assert.ok(Math.abs(actualZoom - (from === "southwest" ? 1.7 : from === "south" ? 1.2 : 1)) < 1e-8, `${from} must use the intended absolute camera zoom`);
    await page.evaluate(() => { window.__cameraSamples = []; });
    await animated.locator('[data-view="top"]').click();
    await page.waitForFunction(() => window.__cameraSamples.length >= 3 && !window.__cameraTestViewer.stats().transitioning);
    const samples = await page.evaluate(() => window.__cameraSamples);
    const nearTop = samples.filter(({ position, focalPoint }) => {
      const back = position.map((value, i) => value - focalPoint[i]);
      return back[2] / Math.hypot(...back) > 0.99;
    });
    let largestStep = 0;
    for (let i = 1; i < nearTop.length; i++) {
      const dot = nearTop[i - 1].viewUp.reduce((sum, value, j) => sum + value * nearTop[i].viewUp[j], 0);
      largestStep = Math.max(largestStep, Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI);
    }
    assert.ok(nearTop.length >= 2);
    assert.ok(largestStep < 15, `${from} → Top snaps ${largestStep}° near the pole`);
    const final = samples.at(-1);
    assert.ok(Math.abs(final.position[0] - final.focalPoint[0]) < 1e-6);
    assert.ok(Math.abs(final.position[1] - final.focalPoint[1]) < 1e-6);
    assert.ok(Math.abs(final.viewUp[1] - 1) < 1e-8);
    const height = await page.evaluate(() => window.__cameraTestViewer.navigationBounds[5] - window.__cameraTestViewer.navigationBounds[4]);
    if (from === "south" || from === "southwest") {
      const fraction = from === "south" ? 1 / 3 : 1 / 4;
      for (let axis = 0; axis < 3; axis++) {
        const framingLift = axis === 2 ? height * fraction : 0;
        const pan = -start.viewUp[axis] * height * fraction;
        assert.ok(Math.abs(start.focalPoint[axis] - final.focalPoint[axis] - framingLift - pan) < 1e-6, `${from} must pan the scene upward without changing its fitted direction`);
      }
      const back = start.position.map((value, axis) => value - start.focalPoint[axis]);
      if (from === "south") assert.ok(Math.abs(back[0]) < 1e-6 && back[1] < 0 && Math.abs(back[2] / -back[1] - 0.85) < 1e-8, "South must retain its original tilted-down direction");
      else assert.ok(back[0] < 0 && back[1] < 0 && back[2] > 0 && Math.abs(back[0] / back[1] - Math.sqrt(3)) < 1e-8, "Southwest must retain its westward tilted-down direction");
    } else {
      assert.ok(Math.abs(start.focalPoint[2] - final.focalPoint[2]) < 1e-6, "North must retain the bounds-center height");
    }
    if (from === "north") assert.ok(Math.abs(start.position[2] - start.focalPoint[2]) < 1e-6, "North must be level, not tilted down");
    transitions.push({ from, frames: samples.length, nearTopFrames: nearTop.length, largestStep, samples });
    console.log(`[check-visualization] Animated ${from} → Top: ${samples.length} frames, largest near-pole screen-up step ${largestStep.toFixed(2)}°`);
  }
  const beforePan = await page.evaluate(() => window.__cameraTestViewer.stats().camera);
  const panBounds = await animated.locator("[data-canvas]").boundingBox();
  await page.keyboard.down("Shift");
  await page.mouse.move(panBounds.x + panBounds.width / 2, panBounds.y + panBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(panBounds.x + panBounds.width / 2 + 60, panBounds.y + panBounds.height / 2 + 25, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  const afterPan = await page.evaluate(() => window.__cameraTestViewer.stats().camera);
  const movement = afterPan.position.map((value, i) => value - beforePan.position[i]);
  assert.ok(Math.hypot(...movement) > 1);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(movement[i] - (afterPan.focalPoint[i] - beforePan.focalPoint[i])) < 1e-6, "Pan should translate camera and focus equally");
    assert.ok(Math.abs(afterPan.viewUp[i] - beforePan.viewUp[i]) < 1e-8, "Pan must preserve orientation");
  }
  await animated.locator("[data-canvas]").focus();
  await page.keyboard.press("Home");
  await page.waitForFunction(() => !window.__cameraTestViewer.stats().transitioning);
  const restored = await page.evaluate(() => window.__cameraTestViewer.stats().camera);
  assert.ok(Math.hypot(...restored.position.map((value, i) => value - beforePan.position[i])) < 1e-6);
  await fs.writeFile("artifacts/visualization/top-transitions.json", JSON.stringify(transitions, null, 2));
  console.log("[check-visualization] Shift-pan translates camera/focus without rotation; animated Home restores Top");
} finally {
  await browser.close();
}
