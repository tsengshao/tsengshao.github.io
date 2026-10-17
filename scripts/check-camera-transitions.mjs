import assert from "node:assert/strict";
import { centerOf, interpolateUprightPose, orbit, presetPose, subtract, unit } from "../src/lib/vvm/camera-navigation.ts";

const bounds = [-173254, 129044, -180000, 180000, 931, 190853];
const focus = centerOf(bounds);
const pivot = [-2000, 0, 0];
const poses = Object.fromEntries(["top", "north", "southwest", "south"].map((name) => [name, presetPose(name, focus, bounds, 1.6)]));
const northDirection = subtract(poses.north.position, poses.north.focalPoint);
assert.ok(Math.abs(northDirection[0]) < 1e-8 && northDirection[1] > 0 && Math.abs(northDirection[2]) < 1e-8, "North must look horizontally from due north");
const southwestDirection = subtract(poses.southwest.position, poses.southwest.focalPoint);
assert.ok(southwestDirection[0] < 0 && southwestDirection[1] < 0 && southwestDirection[2] > 0);
assert.ok(Math.abs(southwestDirection[0] / southwestDirection[1] - Math.sqrt(3)) < 1e-8, "Southwest should be 15° farther west (210° azimuth)");
poses.turned = orbit(poses.southwest, pivot, 2.3, 0.12, true);
poses.panned = { ...poses.south, position: poses.south.position.map((v, i) => v + [20000, -10000, 5000][i]), focalPoint: poses.south.focalPoint.map((v, i) => v + [20000, -10000, 5000][i]) };
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.reduce((sum, v, i) => sum + v * b[i], 0)))) * 180 / Math.PI;
let maximumStep = 0;
for (const [name, from] of Object.entries(poses)) {
  for (const [destination, to] of Object.entries(poses)) {
    assert.deepEqual(interpolateUprightPose(from, to, 0), from);
    assert.deepEqual(interpolateUprightPose(from, to, 1), to);
    let previous = from;
    for (let i = 1; i <= 1000; i++) {
      const pose = interpolateUprightPose(from, to, i / 1000);
      const back = unit(subtract(pose.position, pose.focalPoint));
      const step = angle(previous.viewUp, pose.viewUp);
      maximumStep = Math.max(maximumStep, step);
      assert.ok(step < 0.5, `${name} → ${destination}: screen-up jumps ${step}° at ${i / 1000}`);
      assert.ok(Math.abs(Math.hypot(...pose.viewUp) - 1) < 1e-8);
      assert.ok(Math.abs(back.reduce((sum, v, j) => sum + v * pose.viewUp[j], 0)) < 1e-8);
      assert.ok([...pose.position, ...pose.focalPoint, ...pose.viewUp].every(Number.isFinite));
      previous = pose;
    }
  }
}
// Interrupting a Top transition starts the next one from the exact displayed pose.
const interrupted = interpolateUprightPose(poses.southwest, poses.top, 0.995);
const first = interpolateUprightPose(interrupted, poses.south, 0.001);
assert.ok(angle(interrupted.viewUp, first.viewUp) < 0.5);
console.log(`[check-camera] ${Object.keys(poses).length ** 2} sampled transitions (including level North, Top and pan), endpoints, orthonormal orientation and interruption passed; largest screen-up step ${maximumStep.toFixed(3)}° / 0.001 progress`);
