/** Angles are radians internally; public configuration angles are degrees. No DOM or VTK dependency. */
export const ORBIT_DEFAULTS = {
  sensitivity: 1,
  damping: 0.95,
  maxInertiaDuration: 2000,
  pitchLimit: 20,
  returnDuration: 400,
  snapEnabled: true,
  snapAngles: [0, 90, 180, 270],
  snapThreshold: 15,
  snapDuration: 350,
  alwaysSnap: false,
};
export type OrbitOptions = typeof ORBIT_DEFAULTS;
export type OrbitClock = {
  now: () => number;
  request: (callback: (time: number) => void) => number;
  cancel: (id: number) => void;
  reducedMotion: () => boolean;
};
const rad = Math.PI / 180;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
/** Invert x(t) to evaluate cubic-bezier(.08, .6, .4, 1), including exact endpoints. */
export function pitchEase(x: number) {
  if (x <= 0 || x >= 1) return clamp(x, 0, 1);
  let low = 0,
    high = 1;
  const bezier = (t: number, a: number, b: number) =>
    3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  for (let i = 0; i < 24; i++) {
    const t = (low + high) / 2;
    if (bezier(t, 0.08, 0.4) < x) low = t;
    else high = t;
  }
  return bezier((low + high) / 2, 0.6, 1);
}
export function snapDelta(yaw: number, options: OrbitOptions) {
  if (!options.snapEnabled || !options.snapAngles.length) return 0;
  const deltas = options.snapAngles.map((angle) =>
    Math.atan2(Math.sin(angle * rad - yaw), Math.cos(angle * rad - yaw)),
  );
  const nearest = deltas.reduce((a, b) => (Math.abs(a) <= Math.abs(b) ? a : b));
  return options.alwaysSnap ||
    Math.abs(nearest) <= options.snapThreshold * rad + 1e-12
    ? nearest
    : 0;
}
export function validateOrbitOptions(options: OrbitOptions) {
  const finite = [
    'sensitivity',
    'damping',
    'maxInertiaDuration',
    'pitchLimit',
    'returnDuration',
    'snapThreshold',
    'snapDuration',
  ] as const;
  if (
    finite.some((key) => !Number.isFinite(options[key]) || options[key] < 0) ||
    options.sensitivity === 0 ||
    options.damping <= 0 ||
    options.damping >= 1 ||
    options.pitchLimit > 89 ||
    options.snapThreshold > 180 ||
    !Array.isArray(options.snapAngles) ||
    options.snapAngles.some((a) => !Number.isFinite(a))
  )
    throw Error('Invalid orbit configuration');
}
/** One finite RAF chain for release motion; input always writes immediately. */
export class OrbitMotion {
  options: OrbitOptions;
  private frame = 0;
  private dragging = false;
  private basePitch: number | undefined;
  private yaw = 0;
  private pitch = 0;
  private samples: { time: number; yaw: number }[] = [];
  private moved = false;
  lastRelease: {
    velocity: number;
    inertiaDuration: number;
    inertiaAngle: number;
    snapAngle: number;
    basePitch: number;
  } | null = null;
  phase: 'idle' | 'drag' | 'inertia' | 'return' | 'snap' = 'idle';
  constructor(
    private read: () => { yaw: number; pitch: number },
    private turn: (yawDelta: number, pitchDelta: number) => void,
    private clock: OrbitClock,
    options: Partial<OrbitOptions> = {},
  ) {
    this.options = {
      ...ORBIT_DEFAULTS,
      ...options,
      snapAngles: [...(options.snapAngles || ORBIT_DEFAULTS.snapAngles)],
    };
    validateOrbitOptions(this.options);
  }
  configure(options: Partial<OrbitOptions>) {
    const next = { ...this.options, ...options };
    validateOrbitOptions(next);
    this.cancel();
    this.options = { ...next, snapAngles: [...next.snapAngles] };
  }
  /** Retain baseline on a re-grab; reset it only for external camera changes. */
  cancel(rebase = false) {
    this.clock.cancel(this.frame);
    this.frame = 0;
    this.dragging = false;
    this.phase = 'idle';
    if (rebase) this.basePitch = undefined;
  }
  begin() {
    this.cancel();
    const current = this.read();
    this.yaw = current.yaw;
    this.pitch = current.pitch;
    this.basePitch ??= this.pitch;
    this.samples = [{ time: this.clock.now(), yaw: this.yaw }];
    this.moved = false;
    this.dragging = true;
    this.phase = 'drag';
  }
  move(yaw: number, pitch: number) {
    if (!this.dragging) return;
    const limit = this.options.pitchLimit * rad;
    const target = clamp(
      this.pitch + pitch * this.options.sensitivity,
      Math.max(-89.5 * rad, this.basePitch! - limit),
      Math.min(Math.PI / 2, this.basePitch! + limit),
    );
    const deltaYaw = yaw * this.options.sensitivity;
    this.turn(deltaYaw, target - this.pitch);
    this.yaw += deltaYaw;
    this.pitch = target;
    this.moved ||= Math.abs(yaw) + Math.abs(pitch) > 0;
    const time = this.clock.now();
    this.samples.push({ time, yaw: this.yaw });
    this.samples = this.samples.filter((sample) => time - sample.time <= 80);
  }
  end(allowRelease = true) {
    if (!this.dragging) return;
    this.dragging = false;
    if (!allowRelease || !this.moved) {
      this.cancel();
      return;
    }
    const started = this.clock.now();
    const last = this.samples.at(-1)!;
    const first = this.samples.find((sample) => last.time - sample.time >= 8);
    // Holding still before release must not fling stale velocity.
    let velocity =
      first && started - last.time < 80
        ? ((last.yaw - first.yaw) / Math.max(8, started - first.time)) * 1000
        : 0;
    const fromPitch = this.pitch,
      base = this.basePitch!;
    const startYaw = this.yaw;
    const o = this.options;
    if (this.clock.reducedMotion()) {
      this.turn(snapDelta(this.yaw, o), base - this.pitch);
      this.cancel();
      return;
    }
    const lambda = -60 * Math.log(o.damping);
    const speedFloor = 0.005; // rad/s; no long-lived invisible render loop
    const inertiaSeconds = Math.min(
      o.maxInertiaDuration / 1000,
      Math.abs(velocity) > speedFloor
        ? Math.log(Math.abs(velocity) / speedFloor) / lambda
        : 0,
    );
    if (!inertiaSeconds) velocity = 0;
    const restYaw =
      startYaw + (velocity / lambda) * (1 - Math.exp(-lambda * inertiaSeconds));
    const snap = snapDelta(restYaw, o);
    this.lastRelease = {
      velocity,
      inertiaDuration: inertiaSeconds * 1000,
      inertiaAngle: restYaw - startYaw,
      snapAngle: snap,
      basePitch: base,
    };
    const snapStart = inertiaSeconds * 1000;
    const snapTime = Math.abs(snap) > 1e-10 ? o.snapDuration : 0;
    const finish = Math.max(o.returnDuration, snapStart + snapTime);
    const step = (now: number) => {
      const elapsed = Math.max(0, now - started);
      const seconds = Math.min(elapsed / 1000, inertiaSeconds);
      const snapProgress =
        elapsed < snapStart
          ? 0
          : snapTime
            ? clamp((elapsed - snapStart) / snapTime, 0, 1)
            : 1;
      const yaw =
        startYaw +
        (velocity / lambda) * (1 - Math.exp(-lambda * seconds)) +
        snap * easeOut(snapProgress);
      const pitch =
        fromPitch +
        (base - fromPitch) *
          pitchEase(o.returnDuration ? elapsed / o.returnDuration : 1);
      this.turn(yaw - this.yaw, pitch - this.pitch);
      this.yaw = yaw;
      this.pitch = pitch;
      this.phase =
        elapsed < snapStart ? 'inertia' : snapProgress < 1 ? 'snap' : 'return';
      if (elapsed >= finish) {
        this.frame = 0;
        this.phase = 'idle';
      } else this.frame = this.clock.request(step);
    };
    this.frame = this.clock.request(step);
  }
}
