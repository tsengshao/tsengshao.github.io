import { OrbitMotion, type OrbitOptions } from './orbit-motion';
/* oxlint-disable typescript/no-explicit-any -- vtk.js dynamic set() and lifecycle objects lack a common static interface */
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import { hydrate } from './hydrate';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkTexture from '@kitware/vtk.js/Rendering/Core/Texture';
import vtkCTF from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkLight from '@kitware/vtk.js/Rendering/Core/Light';
import vtkStyle from '@kitware/vtk.js/Interaction/Style/InteractorStyleManipulator';
import vtkPan from '@kitware/vtk.js/Interaction/Manipulators/MouseCameraTrackballPanManipulator';
import vtkAxes from '@kitware/vtk.js/Rendering/Core/AxesActor';
import vtkMarker from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
import {
  createOrbitManipulator,
  createGestureManipulator,
  createZoomManipulator,
} from './camera-manipulators';
import { ScenePackage, type Legend } from './scene-package';
import {
  centerOf,
  validBounds,
  validPoint,
  presetPose,
  orbit,
  interpolatePose,
  interpolateUprightPose,
  type Vec3,
  type Bounds,
  elevation,
  azimuth,
  type Preset,
  type CameraPose,
} from './camera-navigation';
// Exported VTK descriptors are dynamic; only typed-array constructors below are accepted.
type Frame = {
  actors: any[];
  resources: any[];
  overlay?: HTMLImageElement;
  overlayURL?: string;
};
export class LocalRenderer {
  window = vtkGenericRenderWindow.newInstance({ listenWindowResize: false });
  renderer = this.window.getRenderer();
  style = vtkStyle.newInstance();
  private frames = new Map<number, Frame>();
  private textures = new Map<string, any>();
  private current: Frame | null = null;
  private observer: ResizeObserver;
  private dead = false;
  private backgroundOverride: number[] | null = null;
  private displayedIndex = 0;
  private resizeCanvas: () => void = () => {};
  private overlay = document.createElement('div');
  private axes: any;
  private marker: any;
  private uprightEnabled = true;
  private transition = 0;
  private zoomReference = { viewAngle: 30, parallelScale: 1 };
  private motion: OrbitMotion;
  private pointers = new Set<number>();
  private readonly pointerDown = (event: PointerEvent) => {
    this.pointers.add(event.pointerId);
    this.interrupt();
  };
  private readonly pointerUp = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
  };
  private readonly pointerCancel = (event: PointerEvent) => {
    if (this.pointers.delete(event.pointerId)) this.motion.cancel();
  };
  private readonly blur = () => {
    this.pointers.clear();
    this.cancelTransition();
  };
  private navigationPivot: Vec3 = [0, 0, 0];
  private navigationBounds: Bounds = [-1, 1, -1, 1, 0, 1];
  onInteraction?: () => void;
  centerDescription = '';
  private readonly interrupt = () => {
    this.cancelTransition();
    this.onInteraction?.();
  };
  private readonly onVisibility = () => {
    if (document.hidden) this.cancelTransition();
  };
  constructor(
    private host: HTMLElement,
    public source: ScenePackage,
    private options = {
      cacheFrames: 3,
      maxPixelRatio: 1,
      maxPixels: 2_100_000,
    },
  ) {
    this.window.setContainer(host);
    this.overlay.className = 'native-overlay';
    host.appendChild(this.overlay);
    const axesSettings = source.manifest.orientationAxes;
    if (axesSettings?.OrientationAxesVisibility?.[0] === '1') {
      this.axes = vtkAxes.newInstance();
      this.axes.setConfig({ ...this.axes.getConfig(), recenter: false });
      for (const axis of ['X', 'Y', 'Z'])
        this.axes['set' + axis + 'AxisColor'](
          axesSettings['OrientationAxes' + axis + 'Color'].map(
            (x) => Number(x) * 255,
          ),
        );
      this.marker = vtkMarker.newInstance({
        actor: this.axes,
        interactor: this.window.getInteractor(),
      });
      this.marker.setViewportCorner('BOTTOM_LEFT');
      this.marker.setViewportSize(0.15);
      this.marker.setMinPixelSize(40);
      this.marker.setMaxPixelSize(200);
      this.marker.setEnabled(true);
    }
    const orbitBy = (yaw: number, pitch: number) =>
      this.applyPose(
        orbit(this.readPose(), this.pivot(), yaw, pitch, this.uprightEnabled, [
          (-89.5 * Math.PI) / 180,
          Math.PI / 2,
        ]),
      );
    this.motion = new OrbitMotion(
      () => {
        const pose = this.readPose();
        return {
          yaw: azimuth(pose),
          pitch: elevation(pose),
        };
      },
      orbitBy,
      {
        now: () => performance.now(),
        request: (step) => requestAnimationFrame(step),
        cancel: (id) => cancelAnimationFrame(id),
        reducedMotion: () =>
          window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      },
    );
    this.style.addMouseManipulator(
      createOrbitManipulator(
        () => this.uprightEnabled,
        (yaw, pitch) => this.motion.move(yaw, pitch),
        () => this.motion.begin(),
        () => this.motion.end(this.pointers.size === 0),
      ),
    );
    this.style.addMouseManipulator(createZoomManipulator((factor) => this.zoom(factor)));
    this.style.addMouseManipulator(vtkPan.newInstance({ button: 1, shift: true }));
    this.style.addGestureManipulator(
      createGestureManipulator(() => this.uprightEnabled, orbitBy, (factor) => this.zoom(factor)),
    );
    for (const event of ['wheel', 'keydown']) {
      host.addEventListener(event, this.interrupt, { capture: true });
    }
    host.addEventListener('pointerdown', this.pointerDown, true);
    host.addEventListener('pointerup', this.pointerUp, true);
    host.addEventListener('pointercancel', this.pointerCancel, true);
    host.addEventListener('lostpointercapture', this.pointerCancel, true);
    window.addEventListener('blur', this.blur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.window.getInteractor().setInteractorStyle(this.style);
    const resize = () => {
      const parent = host.parentElement!;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      host.style.width = width + 'px';
      host.style.height = height + 'px';
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        this.options.maxPixelRatio,
        Math.sqrt(this.options.maxPixels / Math.max(1, width * height)),
      );
      this.window
        .getApiSpecificRenderWindow()
        .setSize(
          Math.max(1, Math.floor(width * ratio)),
          Math.max(1, Math.floor(height * ratio)),
        );
      this.marker?.updateViewport();
      this.window.getRenderWindow().render();
    };
    this.resizeCanvas = resize;
    this.observer = new ResizeObserver(resize);
    this.observer.observe(host.parentElement!);
    resize();
  }
  private async texture(key: string, settings: any) {
    if (this.textures.has(key)) return this.textures.get(key);
    const raw = await this.source.asset(key);
    const url = URL.createObjectURL(
      new Blob([raw.slice().buffer], { type: 'image/png' }),
    );
    const image = new Image();
    try {
      image.src = url;
      await image.decode();
    } finally {
      URL.revokeObjectURL(url);
    }
    const texture = vtkTexture.newInstance({
      interpolate: settings?.interpolate ?? true,
      repeat: settings?.repeat ?? true,
    });
    texture.setImage(image);
    if (this.dead) {
      (texture as any).delete();
      throw Error('載入已結束');
    }
    this.textures.set(key, texture);
    return texture;
  }
  private async build(index: number) {
    const frame: Frame = { actors: [], resources: [] };
    try {
      const scene = this.source.manifest.frames[index].scene;
      for (const item of scene.scene) {
        const data = await hydrate(this.source, item.dataset);
        frame.resources.push(data);
        const mapper = vtkMapper.newInstance();
        frame.resources.push(mapper);
        mapper.setInputData(data);
        mapper.set(item.mapper);
        const field = item.mapper.colorByArrayName;
        const config = field ? scene.lookupTables?.[field] : undefined;
        if (config) {
          const { nodes, ...settings } = config;
          const lut = vtkCTF.newInstance(settings);
          frame.resources.push(lut);
          for (const n of nodes)
            lut.addRGBPointLong(n[0], n[1], n[2], n[3], n[4], n[5]);
          mapper.setLookupTable(lut);
        }
        const actor = vtkActor.newInstance();
        frame.resources.push(actor);
        actor.setMapper(mapper);
        actor.set(item.actor);
        actor.getProperty().set(item.property);
        if (item.actorRotation)
          actor.rotateWXYZ(
            item.actorRotation[0],
            item.actorRotation[1],
            item.actorRotation[2],
            item.actorRotation[3],
          );
        if (item.texture)
          actor.addTexture(
            await this.texture(item.texture, item.textureSettings),
          );
        frame.actors.push(actor);
      }
      if (scene.overlay) {
        const raw = await this.source.asset(scene.overlay);
        frame.overlayURL = URL.createObjectURL(
          new Blob([raw.slice().buffer], { type: 'image/png' }),
        );
        frame.overlay = new Image();
        frame.overlay.alt = 'ParaView 原始時間註記與雨量色階';
        frame.overlay.src = frame.overlayURL;
        await frame.overlay.decode();
      }
      return frame;
    } catch (e) {
      this.disposeFrame(frame);
      throw e;
    }
  }
  async show(index: number, reset = false) {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.source.manifest.frames.length
    )
      throw Error('時間索引無效');
    let frame = this.frames.get(index);
    if (!frame) frame = await this.build(index);
    if (this.dead) {
      this.disposeFrame(frame);
      return;
    }
    if (this.current)
      for (const a of this.current.actors) this.renderer.removeActor(a);
    this.current = frame;
    this.overlay.replaceChildren(...(frame.overlay ? [frame.overlay] : []));
    for (const a of frame.actors) this.renderer.addActor(a);
    this.frames.delete(index);
    this.frames.set(index, frame);
    while (this.frames.size > Math.max(1, this.options.cacheFrames)) {
      const key = this.frames.keys().next().value!;
      this.disposeFrame(this.frames.get(key)!);
      this.frames.delete(key);
    }
    const scene = this.source.manifest.frames[index].scene;
    this.displayedIndex = index;
    this.renderer.setBackground(this.backgroundOverride || scene.background);
    if (reset) {
      this.renderer.removeAllLights();
      for (const settings of scene.lights || []) {
        const { diffuseColor, ...base } = settings;
        const light = vtkLight.newInstance();
        const lightType = settings.lightType
          ? ({ 1: 'HeadLight', 2: 'CameraLight', 3: 'SceneLight' } as any)[
              settings.lightType
            ]
          : undefined;
        light.set({
          ...base,
          color: diffuseColor || [1, 1, 1],
          lightType,
          switch: !!settings.switch,
        });
        this.renderer.addLight(light);
      }
      this.initializeNavigation();
      this.selectPreset('overview', false);
    } else this.window.getRenderWindow().render();
  }
  setBackground(hex: string | null) {
    if (hex !== null && !/^#[0-9a-f]{6}$/i.test(hex))
      throw Error('背景色必須是 #RRGGBB');
    this.backgroundOverride =
      hex === null
        ? null
        : [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    this.renderer.setBackground(
      this.backgroundOverride ||
        this.source.manifest.frames[this.displayedIndex].scene.background,
    );
    this.window.getRenderWindow().render();
  }
  setQuality(pixelRatio: number) {
    this.options.maxPixelRatio = pixelRatio;
    this.options.maxPixels = 2_100_000 * pixelRatio * pixelRatio;
    this.resizeCanvas();
  }
  private pivot(): Vec3 {
    return [...this.style.getCenterOfRotation()] as Vec3;
  }
  private readPose(): CameraPose {
    const camera = this.renderer.getActiveCamera();
    return {
      position: [...camera.getPosition()] as Vec3,
      focalPoint: [...camera.getFocalPoint()] as Vec3,
      viewUp: [...camera.getViewUp()] as Vec3,
      viewAngle: camera.getViewAngle(),
      parallelScale: camera.getParallelScale(),
      parallelProjection: camera.getParallelProjection(),
    };
  }
  private applyPose(pose: CameraPose) {
    this.renderer.getActiveCamera().set(pose);
    this.renderer.resetCameraClippingRange();
    this.renderer.updateLightsGeometryToFollowCamera();
    this.window.getRenderWindow().render();
  }
  private initializeNavigation() {
    const { manifest } = this.source;
    const domain = manifest.navigation?.domainBounds;
    if (domain !== undefined && !validBounds(domain))
      throw Error('navigation.domainBounds 必須是有效的 world-space bounds');
    if (validBounds(domain)) {
      this.navigationBounds = domain;
    } else {
      // Bounds are only for framing, NEVER used to infer a domain or moving pivot.
      const boxes = manifest.frames.flatMap((frame) =>
        frame.scene.scene.flatMap((item) => {
          const identity =
            !item.actorRotation?.[0] &&
            (!item.actor.position ||
              (item.actor.position as number[]).every((v) => v === 0)) &&
            (!item.actor.scale ||
              (item.actor.scale as number[]).every((v) => v === 1));
          return identity && validBounds(item.statistics?.bounds)
            ? [item.statistics.bounds]
            : [];
        }),
      );
      const currentBounds = this.renderer.computeVisiblePropBounds();
      if (validBounds(currentBounds)) boxes.push(currentBounds);
      if (!boxes.length) throw Error('場景沒有可用的取景範圍');
      this.navigationBounds = [...boxes[0]];
      for (const box of boxes)
        for (let axis = 0; axis < 3; axis++) {
          this.navigationBounds[axis * 2] = Math.min(
            this.navigationBounds[axis * 2],
            box[axis * 2],
          );
          this.navigationBounds[axis * 2 + 1] = Math.max(
            this.navigationBounds[axis * 2 + 1],
            box[axis * 2 + 1],
          );
        }
    }
    const requestedPivot = manifest.navigation?.pivot;
    if (requestedPivot !== undefined && !validPoint(requestedPivot))
      throw Error('navigation.pivot 必須是有效的 world-space XYZ 座標');
    if (requestedPivot) {
      this.navigationPivot = [...requestedPivot];
      this.centerDescription = '資料包指定旋轉中心';
    } else if (manifest.dataset === 'taiwanvvm_4km_MUSCL') {
      const items = manifest.frames[this.displayedIndex].scene.scene;
      const terrainIndex = items.findIndex(
        (item) => item.name === 'TextureMaptoPlane1' && item.texture,
      );
      const terrainBounds = this.current?.actors[terrainIndex]?.getBounds();
      if (!validBounds(terrainBounds))
        throw Error(
          '找不到台灣地形 TextureMaptoPlane1；請提供 navigation.pivot，不能猜測台灣中心',
        );
      const center = centerOf(terrainBounds);
      this.navigationPivot = [center[0], center[1], 0];
      this.centerDescription = '台灣地形水平中心 · Z = 0';
    } else {
      const bounds = this.renderer.computeVisiblePropBounds();
      if (!validBounds(bounds))
        throw Error('無法取得模型中心；請提供 navigation.pivot');
      this.navigationPivot = centerOf(bounds);
      this.centerDescription = '可見模型中心（未指定地理中心）';
    }
    this.style.setCenterOfRotation(this.navigationPivot);
  }
  cancelTransition() {
    this.motion?.cancel();
    cancelAnimationFrame(this.transition);
    this.transition = 0;
  }
  private moveTo(
    target: CameraPose,
    animate = true,
    keepHorizon = this.uprightEnabled,
  ) {
    this.cancelTransition();
    if (
      !animate ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      this.applyPose(target);
      return;
    }
    const from = this.readPose();
    const pivot = this.pivot();
    const started = performance.now();
    const step = (now: number) => {
      if (this.dead) return;
      // Critically damped response: settles without bounce, no idle render loop.
      const time = Math.min((now - started) / 1000, 1);
      const progress = 1 - (1 + 18 * time) * Math.exp(-18 * time);
      const done = progress > 0.999;
      const pose = keepHorizon
        ? interpolateUprightPose(from, target, done ? 1 : progress)
        : interpolatePose(from, target, pivot, done ? 1 : progress);
      this.applyPose(pose);
      this.transition = done ? 0 : requestAnimationFrame(step);
    };
    this.transition = requestAnimationFrame(step);
  }
  selectPreset(preset: Preset, animate = true, magnification = 1) {
    this.motion.cancel(true);
    const keepHorizon = this.uprightEnabled;
    this.uprightEnabled = true;
    this.style.setCenterOfRotation(this.navigationPivot);
    const [width, height] = this.window.getApiSpecificRenderWindow().getSize();
    const framingCenter = centerOf(this.navigationBounds);
    // Lift the look-at point toward the cloud column, not the rotation pivot.
    const focusLift = preset === 'south' ? 1 / 3 : preset === 'southwest' ? 1 / 4 : 0;
    framingCenter[2] += (this.navigationBounds[5] - this.navigationBounds[4]) * focusLift;
    const target = presetPose(
      preset,
      // Frame the complete bounds centrally; rotation still uses the ground pivot.
      framingCenter,
      this.navigationBounds,
      width / height,
    );
    this.zoomReference = {
      viewAngle: target.viewAngle,
      parallelScale: target.parallelScale,
    };
    target.viewAngle = (2 * Math.atan(Math.tan(target.viewAngle * Math.PI / 360) / magnification) * 180) / Math.PI;
    target.parallelScale /= magnification;
    if (preset === 'south' || preset === 'southwest') {
      // Move the scene upward on screen, preserving the fitted angle and scale.
      // A pan moves camera and focus together opposite to the camera's screen-up.
      const shift = (this.navigationBounds[5] - this.navigationBounds[4]) * focusLift;
      for (let axis = 0; axis < 3; axis++) {
        target.position[axis] -= target.viewUp[axis] * shift;
        target.focalPoint[axis] -= target.viewUp[axis] * shift;
      }
    }
    this.moveTo(target, animate, keepHorizon);
  }
  setUpright(enabled: boolean) {
    this.motion.cancel(true);
    this.cancelTransition();
    this.uprightEnabled = enabled;
    if (enabled) {
      this.style.setCenterOfRotation(this.navigationPivot);
      this.moveTo(
        orbit(this.readPose(), this.pivot(), 0, 0, true),
        true,
        false,
      );
    }
  }
  reset(index: number) {
    this.motion.cancel(true);
    this.cancelTransition();
    this.uprightEnabled = false;
    const scene = this.source.manifest.frames[index].scene;
    this.style.setCenterOfRotation(scene.centerOfRotation as Vec3);
    // Exact PVSM restore is intentionally immediate, including its clipping range.
    this.renderer.getActiveCamera().set(scene.camera);
    const restored = this.readPose();
    this.zoomReference = {
      viewAngle: restored.viewAngle,
      parallelScale: restored.parallelScale,
    };
    this.renderer.updateLightsGeometryToFollowCamera();
    this.window.getRenderWindow().render();
  }
  fit() {
    this.selectPreset('overview');
  }
  zoom(factor: number) {
    this.setZoom(this.getZoom() * factor);
  }
  getZoom() {
    const camera = this.renderer.getActiveCamera();
    return camera.getParallelProjection()
      ? this.zoomReference.parallelScale / camera.getParallelScale()
      : Math.tan(this.zoomReference.viewAngle * Math.PI / 360) / Math.tan(camera.getViewAngle() * Math.PI / 360);
  }
  /** Absolute projection magnification relative to the selected preset, never cumulative. */
  setZoom(magnification: number) {
    if (!Number.isFinite(magnification) || magnification <= 0)
      throw Error('縮放倍率必須是正數');
    magnification = Math.max(0.5, Math.min(8, magnification));
    this.cancelTransition();
    const pose = this.readPose();
    const reference = this.zoomReference;
    // Perspective magnification is proportional to 1 / tan(fov / 2), not 1 / fov.
    pose.viewAngle =
      (2 *
        Math.atan(
          Math.tan((reference.viewAngle * Math.PI) / 360) / magnification,
        ) *
        180) /
      Math.PI;
    pose.parallelScale = reference.parallelScale / magnification;
    this.applyPose(pose);
    this.onInteraction?.();
  }
  rotate(degrees: number, pitchDegrees = 0) {
    this.motion.cancel(true);
    this.cancelTransition();
    this.applyPose(
      orbit(
        this.readPose(),
        this.pivot(),
        (degrees * Math.PI) / 180,
        (pitchDegrees * Math.PI) / 180,
        this.uprightEnabled,
      ),
    );
  }
  configureOrbit(options: Partial<OrbitOptions>) {
    this.motion.configure(options);
  }
  legends(
    index: number,
  ): Array<Legend & { min: number; max: number; gradient: string }> {
    const scene = this.source.manifest.frames[index].scene;
    if (scene.overlay) return [];
    const result: Array<
      Legend & { min: number; max: number; gradient: string }
    > = [];
    for (const legend of this.source.manifest.legends) {
      const config = scene.lookupTables?.[legend.arrayName];
      if (!config) continue;
      const { nodes, ...settings } = config;
      const lut = vtkCTF.newInstance(settings);
      for (const n of nodes)
        lut.addRGBPointLong(n[0], n[1], n[2], n[3], n[4], n[5]);
      const min = nodes[0][0],
        max = nodes[nodes.length - 1][0],
        rgb = [0, 0, 0];
      const stops = [];
      for (let i = 0; i <= 100; i++) {
        lut.getColor(min + ((max - min) * i) / 100, rgb);
        stops.push(
          `rgb(${rgb.map((x) => Math.round(x * 255)).join(',')}) ${i}%`,
        );
      }
      lut.delete();
      result.push({
        ...legend,
        min,
        max,
        gradient: `linear-gradient(to top,${stops.join(',')})`,
      });
    }
    return result;
  }
  stats() {
    const camera = this.renderer.getActiveCamera();
    return {
      orbitPhase: this.motion.phase,
      lastOrbitRelease: this.motion.lastRelease,
      orbitOptions: { ...this.motion.options },
      upright: this.uprightEnabled,
      pivot: this.pivot(),
      transitioning: this.transition !== 0,
      centerDescription: this.centerDescription,
      background: Array.from(this.renderer.getBackground()),
      canvasSize: this.window.getApiSpecificRenderWindow().getSize(),
      cachedFrames: this.frames.size,
      textures: this.textures.size,
      actors: this.current?.actors.length || 0,
      camera: {
        position: Array.from(camera.getPosition()),
        focalPoint: Array.from(camera.getFocalPoint()),
        viewUp: Array.from(camera.getViewUp()),
        viewAngle: camera.getViewAngle(),
      },
    };
  }
  private disposeFrame(frame: Frame) {
    if (frame.overlayURL) URL.revokeObjectURL(frame.overlayURL);
    for (const r of [...frame.resources].reverse()) r.delete();
  }
  delete() {
    this.dead = true;
    this.cancelTransition();
    for (const event of ['wheel', 'keydown'])
      this.host.removeEventListener(event, this.interrupt, true);
    this.host.removeEventListener('pointerdown', this.pointerDown, true);
    this.host.removeEventListener('pointerup', this.pointerUp, true);
    this.host.removeEventListener('pointercancel', this.pointerCancel, true);
    this.host.removeEventListener(
      'lostpointercapture',
      this.pointerCancel,
      true,
    );
    window.removeEventListener('blur', this.blur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.onInteraction = undefined;
    this.observer.disconnect();
    this.marker?.setEnabled(false);
    this.marker?.delete();
    this.axes?.delete();
    this.overlay.remove();
    this.renderer.removeAllActors();
    for (const f of this.frames.values()) this.disposeFrame(f);
    this.frames.clear();
    for (const t of this.textures.values()) t.delete();
    this.textures.clear();
    this.window.delete();
    this.style.delete();
  }
}
