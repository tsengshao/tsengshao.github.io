import type { LocalRenderer } from "./vvm/local-renderer";
import type { Preset } from "./vvm/camera-navigation";

type Controller = { hide: () => void; dispose: () => void; load: () => Promise<void> };

function youtubeController(card: HTMLElement): Controller {
  const frame = card.querySelector<HTMLIFrameElement>("[data-youtube]")!;
  const stop = () => {
    frame.removeAttribute("src");
    card.dataset.state = "idle";
  };
  return {
    load: async () => {
      if (frame.hasAttribute("src")) return;
      frame.src = frame.dataset.src!;
      card.dataset.state = "embedded";
    },
    hide: stop,
    dispose: stop,
  };
}

function sceneController(card: HTMLElement): Controller {
  const host = card.querySelector<HTMLElement>("[data-canvas]")!;
  const status = card.querySelector<HTMLElement>("[data-load-status]")!;
  const retry = card.querySelector<HTMLButtonElement>("[data-retry]")!;
  const zoomValue = card.querySelector<HTMLOutputElement>("[data-zoom-value]")!;
  const legend = card.querySelector<HTMLElement>("[data-legend]")!;
  const buttons = card.querySelectorAll<HTMLButtonElement>("[data-view], [data-zoom]");
  const initialZoom = Number(card.dataset.defaultZoom);
  const initialView = card.dataset.defaultView as Preset;
  const events = new AbortController();
  let pending: AbortController | undefined;
  let viewer: LocalRenderer | undefined;
  let loading = false;
  let dead = false;
  let syncFrame = 0;

  const currentZoom = () => {
    return viewer?.getZoom() ?? initialZoom;
  };
  const syncZoom = () => {
    cancelAnimationFrame(syncFrame);
    syncFrame = requestAnimationFrame(() => { zoomValue.value = `${Number(currentZoom().toFixed(1))}×`; });
  };
  const selectView = (preset: Preset, animate = true, zoom = preset === "southwest" ? 1.7 : preset === "south" ? 1.2 : 1) => {
    viewer?.selectPreset(preset, animate, zoom);
    card.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.view === preset));
    });
    zoomValue.value = `${zoom}×`;
  };
  const setZoom = (factor: number) => {
    viewer?.setZoom(Math.max(0.5, Math.min(8, currentZoom() * factor)));
    syncZoom();
  };
  const markCustomView = () => card.querySelectorAll("[data-view]").forEach((button) => button.setAttribute("aria-pressed", "false"));
  const renderLegend = () => {
    const rain = viewer?.legends(0).find((item) => item.arrayName === "rain");
    if (!rain) return;
    const title = document.createElement("span");
    title.textContent = "Rain (mm/h)";
    const scale = document.createElement("div");
    scale.className = "legend-scale";
    const gradient = document.createElement("div");
    gradient.className = "legend-gradient";
    gradient.style.background = rain.gradient;
    scale.append(gradient);
    for (const value of [rain.max, 30, 10, rain.min]) {
      if (value < rain.min || value > rain.max) continue;
      const tick = document.createElement("span");
      tick.className = "legend-tick";
      tick.textContent = String(value);
      tick.style.bottom = `${(value - rain.min) / (rain.max - rain.min) * 100}%`;
      scale.append(tick);
    }
    legend.replaceChildren(title, scale);
    legend.hidden = false;
  };
  const load = async () => {
    if (dead || viewer || loading) return;
    loading = true;
    pending = new AbortController();
    card.dataset.state = "loading";
    host.setAttribute("aria-busy", "true");
    status.textContent = "Loading 3D scene…";
    retry.hidden = true;
    try {
      const [{ LocalRenderer }, { ScenePackage }, response] = await Promise.all([
        import("./vvm/local-renderer"),
        import("./vvm/scene-package"),
        fetch(card.dataset.scene!, { signal: pending.signal }),
      ]);
      if (!response.ok) throw new Error(`Scene request failed: ${response.status}`);
      const source = await ScenePackage.open(await response.blob());
      if (dead || pending.signal.aborted) return;
      const context = document.createElement("canvas");
      const gl = context.getContext("webgl2");
      if (!gl) throw new Error("WebGL is unavailable");
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      viewer = new LocalRenderer(host, source, { cacheFrames: 1, maxPixelRatio: 1.5, maxPixels: 1_500_000 });
      viewer.setBackground(null);
      await viewer.show(0, true);
      if (dead || pending.signal.aborted) { viewer?.delete(); viewer = undefined; return; }
      selectView(initialView, false, initialZoom);
      viewer.onInteraction = syncZoom;
      renderLegend();
      buttons.forEach((button) => { button.disabled = false; });
      host.setAttribute("aria-hidden", "false");
      card.dataset.state = "ready";
      status.textContent = "";
    } catch (error) {
      viewer?.delete();
      viewer = undefined;
      if (dead || pending?.signal.aborted) return;
      console.error("[visualization] Could not load scene", error);
      card.dataset.state = "error";
      status.textContent = "3D unavailable. Preview shown.";
      retry.hidden = false;
    } finally {
      loading = false;
      host.removeAttribute("aria-busy");
    }
  };

  buttons.forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.view) selectView(button.dataset.view as Preset);
    else setZoom(button.dataset.zoom === "in" ? 1.2 : 1 / 1.2);
  }, { signal: events.signal }));
  retry.addEventListener("click", () => void load(), { signal: events.signal });
  host.addEventListener("pointerdown", markCustomView, { signal: events.signal });
  host.addEventListener("wheel", syncZoom, { passive: true, signal: events.signal });
  host.addEventListener("keydown", (event) => {
    if (!viewer || event.altKey || event.ctrlKey || event.metaKey) return;
    const turns: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, 5], ArrowDown: [0, -5] };
    if (turns[event.key]) { viewer.rotate(...turns[event.key]); markCustomView(); }
    else if (["+", "="].includes(event.key)) setZoom(1.2);
    else if (["-", "−"].includes(event.key)) setZoom(1 / 1.2);
    else if (event.key === "Home") selectView(initialView, true, initialZoom);
    else return;
    event.preventDefault();
  }, { signal: events.signal });

  return {
    load,
    hide: () => viewer?.cancelTransition(),
    dispose: () => {
      dead = true;
      pending?.abort();
      events.abort();
      cancelAnimationFrame(syncFrame);
      viewer?.delete();
      viewer = undefined;
    },
  };
}

export function initializeVisualizationGalleries() {
  document.querySelectorAll<HTMLElement>("[data-visualization-gallery]:not([data-ready])").forEach((gallery) => {
    gallery.dataset.ready = "true";
    const cards = [...gallery.querySelectorAll<HTMLElement>("[data-visualization]")];
    const items = cards.map((card) => ({
      viewport: card.querySelector<HTMLElement>("[data-visualization-viewport]")!,
      kind: card.dataset.kind,
      controller: card.dataset.kind === "youtube" ? youtubeController(card) : sceneController(card),
    }));
    const controllers = new Map(items.map(({ viewport, controller }) => [viewport, controller]));
    // Preload each scene independently; videos only load while their own frame is visible.
    const preload = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) void controllers.get(entry.target as HTMLElement)?.load();
    }, { rootMargin: "240px 0px" });
    const visibility = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const controller = controllers.get(entry.target as HTMLElement)!;
        if (entry.isIntersecting) void controller.load();
        else controller.hide();
      }
    });
    const observe = () => items.forEach(({ viewport, kind }) => {
      if (kind === "scene") preload.observe(viewport);
      visibility.observe(viewport);
    });
    observe();
    // A restored back/forward-cache page needs fresh visibility callbacks.
    window.addEventListener("pageshow", (event) => {
      if (!event.persisted) return;
      preload.disconnect();
      visibility.disconnect();
      observe();
    });
    // Preserve back/forward-cache pages; release GPU resources when leaving for good.
    window.addEventListener("pagehide", (event) => {
      if (event.persisted) { controllers.forEach((controller) => controller.hide()); return; }
      preload.disconnect();
      visibility.disconnect();
      controllers.forEach((controller) => controller.dispose());
    });
  });
}
