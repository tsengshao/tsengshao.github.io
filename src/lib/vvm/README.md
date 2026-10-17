# TaiwanVVMex renderer

The six TypeScript modules here were copied from the neighboring `Paraview-VVMex/viewer/lib/` project (2026-10-17), at the owner's request. They retain its vtk.js geometry hydration, SHA-256 asset checks, fixed-pivot Z-up camera math, drag inertia, pitch return, and reduced-motion handling.

Website adaptations:

- `scene-package.ts` retains length, SHA-256 and content-addressed-key checks, preferring native Web Crypto and lazily importing `@noble/hashes` when `crypto.subtle` is absent. This supports LAN HTTP phone previews without bypassing verification. Unexpected native digest errors still fail closed.
- `camera-navigation.ts` adds a level North view and tilted southwest/south views, with Southwest 15° farther west than the original direction at the same elevation. Continuous upright yaw/pitch interpolation uses screen-up to determine yaw at the Top pole, avoiding the former late ~90° screen-up switch. Free-camera interpolation remains available separately.
- `local-renderer.ts` fits the website viewport, frames the bounds while retaining the ground rotation pivot, supports Shift-left-drag panning, and accepts absolute magnification during preset changes. South/Southwest frame around a center raised by 1/3 and 1/4 of the bounds height respectively. Both then pan the scene upward by translating camera and focus opposite screen-up by the same respective distances, preserving orientation and the selected zoom; the entry's default view is Top.
- `camera-manipulators.ts` uses the same projection zoom for wheel, pinch and buttons, and retains native two-finger panning even while upright. Pan translates camera and focus together without rotating or zooming; rotation still uses the Taiwan pivot.
- `../visualization.ts` connects the engine to the Astro gallery, lazy-loads one frame, resets Southwest to 1.7×, South to 1.2× and Top/North to 1×, provides keyboard controls and resource cleanup, and renders a compact rainfall legend instead of the original full-screen overlay. Mobile overlays the transparent legend at upper-right, shows touch-specific instructions, and places − to the left and + to the right of the zoom value.

`npm run check:camera` covers continuity into/out of Top, panned poses, exact endpoints and interrupted transitions. The browser check also exercises actual animated frames with reduced motion disabled, Shift-panning, and Home restoration.

`npm run check:scene` covers native/missing Web Crypto, standard and boundary hash vectors, non-zero-offset byte views, corruption/hash/key/length rejection, and every published asset. The browser check adds a real insecure HTTP origin and verifies both successful mobile loading and rejection of wrong hashes with preview/retry retained.

The engine dependencies follow the source project: vtk.js 36.11.2 and gl-matrix 3.4.3; fflate uses patched version 0.8.3. The website adds pinned `@noble/hashes` 2.4.0 for the SHA-256 fallback. No React UI or source-project build environment is required.
