/** Pure camera math: Z-up orbiting, fixed-pivot presets and safe transitions. */
import { mat3, quat, vec3 } from 'gl-matrix';

export type Vec3 = [number, number, number];
export type Bounds = [number, number, number, number, number, number];
export type Preset = 'overview' | 'top' | 'x' | 'y' | 'north' | 'southwest' | 'south';
export type CameraPose = {
  position: Vec3;
  focalPoint: Vec3;
  viewUp: Vec3;
  viewAngle: number;
  parallelScale: number;
  parallelProjection: boolean;
};
export const MIN_ELEVATION = 0;
export const MAX_ELEVATION = (89.5 * Math.PI) / 180;
const Z: Vec3 = [0, 0, 1];
export const add = (a: Vec3, b: Vec3): Vec3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export const subtract = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const scale = (a: Vec3, n: number): Vec3 => [
  a[0] * n,
  a[1] * n,
  a[2] * n,
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const unit = (v: Vec3): Vec3 =>
  scale(v, 1 / Math.max(Math.hypot(...v), 1e-12));
const clamp = (v: number, low: number, high: number) =>
  Math.max(low, Math.min(high, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const centerOf = (b: Bounds): Vec3 => [
  (b[0] + b[1]) / 2,
  (b[2] + b[3]) / 2,
  (b[4] + b[5]) / 2,
];
export function validBounds(value: unknown): value is Bounds {
  return (
    Array.isArray(value) &&
    value.length === 6 &&
    value.every(Number.isFinite) &&
    value[0] <= value[1] &&
    value[2] <= value[3] &&
    value[4] <= value[5]
  );
}
export function validPoint(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
  );
}
export function elevation(pose: CameraPose) {
  return Math.asin(
    clamp(unit(subtract(pose.position, pose.focalPoint))[2], -1, 1),
  );
}
/** At a pole the screen-up vector carries yaw, since position cannot. */
export function azimuth(pose: CameraPose) {
  const back = unit(subtract(pose.position, pose.focalPoint));
  return Math.hypot(back[0], back[1]) < 1e-7
    ? Math.atan2(-pose.viewUp[1], -pose.viewUp[0])
    : Math.atan2(back[1], back[0]);
}
/** Project world Z onto the image plane; retain screen-up at a pole. */
export function upright(pose: CameraPose): CameraPose {
  const back = unit(subtract(pose.position, pose.focalPoint));
  const poleUp: Vec3 =
    Math.abs(dot(pose.viewUp, back)) < 0.99 ? pose.viewUp : [0, 1, 0];
  const reference: Vec3 = Math.abs(back[2]) > 0.999999 ? poleUp : Z;
  return {
    ...pose,
    viewUp: unit(subtract(reference, scale(back, dot(reference, back)))),
  };
}
function turn(v: Vec3, axis: Vec3, radians: number): Vec3 {
  return add(
    add(scale(v, Math.cos(radians)), scale(cross(axis, v), Math.sin(radians))),
    scale(axis, dot(axis, v) * (1 - Math.cos(radians))),
  );
}
/** Rotate position and focal point together: panning and focal distance survive. */
export function orbit(
  pose: CameraPose,
  pivot: Vec3,
  yaw: number,
  pitch: number,
  locked: boolean,
  pitchRange = [MIN_ELEVATION, MAX_ELEVATION],
): CameraPose {
  const axis = locked ? Z : unit(pose.viewUp);
  const spin = (point: Vec3) =>
    add(pivot, turn(subtract(point, pivot), axis, yaw));
  let result = {
    ...pose,
    position: spin(pose.position),
    focalPoint: spin(pose.focalPoint),
    viewUp: turn(pose.viewUp, axis, yaw),
  };
  if (locked) result = upright(result);
  const back = unit(subtract(result.position, result.focalPoint));
  const right = unit(cross(result.viewUp, back));
  const amount = locked
    ? clamp(elevation(result) + pitch, pitchRange[0], pitchRange[1]) -
      elevation(result)
    : pitch;
  const tilt = (point: Vec3) =>
    add(pivot, turn(subtract(point, pivot), right, -amount));
  result = {
    ...result,
    position: tilt(result.position),
    focalPoint: tilt(result.focalPoint),
    viewUp: turn(result.viewUp, right, -amount),
  };
  return locked ? upright(result) : result;
}
export function presetPose(
  preset: Preset,
  pivot: Vec3,
  bounds: Bounds,
  aspect: number,
): CameraPose {
  const direction: Vec3 =
    preset === 'top'
      ? [0, 0, 1]
      : preset === 'north'
        ? [0, 1, 0]
        : preset === 'southwest'
          // Shift 15° toward west while retaining the original elevation.
          ? unit([-Math.sqrt(3), -1, 0.85 * Math.SQRT2])
          : preset === 'south'
            ? unit([0, -1, 0.85])
            : preset === 'x'
              ? [1, 0, 0]
              : preset === 'y'
                ? [0, -1, 0]
                : unit([1, -1, 0.85]);
  // Fit projected corners instead of a bounding sphere: less empty space for flat domains.
  const basis = upright({
    position: direction,
    focalPoint: [0, 0, 0],
    viewUp: [0, 1, 0],
    viewAngle: 30,
    parallelScale: 1,
    parallelProjection: false,
  });
  const right = unit(cross(basis.viewUp, direction));
  const tanVertical = Math.tan(Math.PI / 12);
  const tanHorizontal = tanVertical * Math.max(aspect, 0.1);
  let distance = 1;
  let verticalExtent = 1;
  for (const x of [bounds[0], bounds[1]])
    for (const y of [bounds[2], bounds[3]])
      for (const z of [bounds[4], bounds[5]]) {
        const offset = subtract([x, y, z], pivot);
        const horizontal = Math.abs(dot(offset, right));
        const vertical = Math.abs(dot(offset, basis.viewUp));
        const depth = dot(offset, direction);
        distance = Math.max(
          distance,
          depth +
            1.08 * Math.max(horizontal / tanHorizontal, vertical / tanVertical),
        );
        verticalExtent = Math.max(
          verticalExtent,
          vertical,
          horizontal / Math.max(aspect, 0.1),
        );
      }
  return upright({
    position: add(pivot, scale(direction, distance)),
    focalPoint: [...pivot],
    viewUp: [0, 1, 0],
    viewAngle: 30,
    parallelScale: verticalExtent * 1.08,
    parallelProjection: false,
  });
}
function orientation(pose: CameraPose) {
  const back = unit(subtract(pose.position, pose.focalPoint));
  const right = unit(cross(pose.viewUp, back));
  const up = cross(back, right);
  return quat.normalize(
    quat.create(),
    quat.fromMat3(quat.create(), mat3.fromValues(...right, ...up, ...back)),
  );
}
/** Continuous Z-up orientation, including the exact top view where world Z is parallel to sight. */
export function interpolateUprightPose(
  from: CameraPose,
  to: CameraPose,
  t: number,
): CameraPose {
  if (t <= 0) return from;
  if (t >= 1) return to;
  // At a pole azimuth() derives yaw from screen-up, so the approach already
  // matches the final north-up orientation instead of snapping there at the end.
  const yawA = azimuth(from);
  const yawB = azimuth(to);
  const yaw = yawA + Math.atan2(Math.sin(yawB - yawA), Math.cos(yawB - yawA)) * t;
  const pitch = mix(elevation(from), elevation(to), t);
  const focalPoint = from.focalPoint.map((value, i) => mix(value, to.focalPoint[i], t)) as Vec3;
  const distance = mix(
    Math.hypot(...subtract(from.position, from.focalPoint)),
    Math.hypot(...subtract(to.position, to.focalPoint)),
    t,
  );
  const back: Vec3 = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
  return {
    position: add(focalPoint, scale(back, distance)),
    focalPoint,
    viewUp: [-Math.sin(pitch) * Math.cos(yaw), -Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch)],
    viewAngle: mix(from.viewAngle, to.viewAngle, t),
    parallelScale: mix(from.parallelScale, to.parallelScale, t),
    parallelProjection: to.parallelProjection,
  };
}
/** Orbit around the pivot during transitions, never cut straight through the model. */
export function interpolatePose(
  from: CameraPose,
  to: CameraPose,
  pivot: Vec3,
  t: number,
): CameraPose {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const a = subtract(from.position, pivot),
    b = subtract(to.position, pivot);
  const ra = Math.max(Math.hypot(...a), 1e-6),
    rb = Math.max(Math.hypot(...b), 1e-6);
  let yawA = Math.atan2(a[1], a[0]),
    yawB = Math.atan2(b[1], b[0]);
  if (Math.hypot(a[0], a[1]) < ra * 1e-7) yawA = -Math.PI / 2;
  if (Math.hypot(b[0], b[1]) < rb * 1e-7) yawB = -Math.PI / 2;
  const yaw =
    yawA + Math.atan2(Math.sin(yawB - yawA), Math.cos(yawB - yawA)) * t;
  const pitch = mix(
    Math.asin(clamp(a[2] / ra, -1, 1)),
    Math.asin(clamp(b[2] / rb, -1, 1)),
    t,
  );
  const position = add(
    pivot,
    scale(
      [
        Math.cos(pitch) * Math.cos(yaw),
        Math.cos(pitch) * Math.sin(yaw),
        Math.sin(pitch),
      ],
      mix(ra, rb, t),
    ),
  );
  const rotation = quat.slerp(
    quat.create(),
    orientation(from),
    orientation(to),
    t,
  );
  const interpolatedUp = Array.from(
    vec3.transformQuat(vec3.create(), [0, 1, 0], rotation),
  ) as Vec3;
  // Interpolate the look-at point directly so centred presets stay centred.
  const focalPoint = from.focalPoint.map((v, i) =>
    mix(v, to.focalPoint[i], t),
  ) as Vec3;
  const back = unit(subtract(position, focalPoint));
  const projectedUp = subtract(
    interpolatedUp,
    scale(back, dot(interpolatedUp, back)),
  );
  const up =
    Math.hypot(...projectedUp) > 1e-7
      ? unit(projectedUp)
      : upright({ ...to, position, focalPoint }).viewUp;
  return {
    position,
    focalPoint,
    viewUp: up,
    viewAngle: mix(from.viewAngle, to.viewAngle, t),
    parallelScale: mix(from.parallelScale, to.parallelScale, t),
    parallelProjection: to.parallelProjection,
  };
}
