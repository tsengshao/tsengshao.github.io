/* oxlint-disable typescript/no-explicit-any -- vtk.js extend() exposes an untyped mutable API before newInstance freezes it. */
import macro from '@kitware/vtk.js/macros.js';
import vtkRotate from '@kitware/vtk.js/Interaction/Manipulators/MouseCameraTrackballRotateManipulator.js';
import vtkGesture from '@kitware/vtk.js/Interaction/Manipulators/GestureCameraManipulator.js';
import vtkZoom from '@kitware/vtk.js/Interaction/Manipulators/MouseCameraTrackballZoomManipulator.js';

type Orbit = (yaw: number, pitch: number) => void;
/** vtk.js freezes newInstance results: override callbacks inside extend only. */
export function createOrbitManipulator(
  locked: () => boolean,
  orbit: Orbit,
  begin: () => void,
  end: () => void,
) {
  return macro.newInstance((api: any, model: any, initial: any) => {
    vtkRotate.extend(api, model, initial);
    const freeDown = api.onButtonDown;
    const freeMove = api.onMouseMove;
    const freeUp = api.onButtonUp;
    let previous = { x: 0, y: 0 };
    api.onButtonDown = (
      interactor: any,
      renderer: any,
      position: { x: number; y: number },
    ) => {
      if (locked()) begin();
      previous = { ...position };
      freeDown(interactor, renderer, position);
    };
    api.onButtonUp = (...args: any[]) => {
      freeUp?.(...args);
      if (locked()) end();
    };
    api.onMouseMove = (
      interactor: any,
      renderer: any,
      position: { x: number; y: number },
    ) => {
      if (!position) return;
      if (!locked()) freeMove(interactor, renderer, position);
      else {
        const size = interactor.getView().getViewportSize(renderer);
        orbit(
          ((previous.x - position.x) / Math.max(1, size[0])) * Math.PI,
          ((previous.y - position.y) / Math.max(1, size[1])) * Math.PI,
        );
      }
      previous = { ...position };
    };
  }, 'VVMOrbitManipulator')({ button: 1 });
}
export function createGestureManipulator(locked: () => boolean, orbit: Orbit, zoom: (factor: number) => void) {
  return macro.newInstance((api: any, model: any, initial: any) => {
    vtkGesture.extend(api, model, initial);
    const freeRotate = api.onRotate;
    const startRotate = api.onStartRotate;
    const freePinch = api.onPinch;
    // Keep native two-finger pan: it translates camera and focus together,
    // preserving the viewing direction even when Z-up rotation is locked.
    let previousScale = 1;
    api.onStartPinch = (_interactor: any, scale: number) => { previousScale = scale; };
    api.onPinch = (interactor: any, renderer: any, scale: number) => {
      if (locked()) zoom(scale / previousScale);
      else freePinch(interactor, renderer, scale);
      previousScale = scale;
    };
    let previous = 0;
    api.onStartRotate = (interactor: any, angle: number) => {
      previous = angle;
      startRotate(interactor, angle);
    };
    api.onRotate = (interactor: any, renderer: any, angle: number) => {
      if (locked()) orbit(((angle - previous) * Math.PI) / 180, 0);
      else freeRotate(interactor, renderer, angle);
      previous = angle;
    };
  }, 'VVMGestureManipulator')();
}

/** Keep wheel, pinch and button magnification consistent without moving the pivot. */
export function createZoomManipulator(zoom: (factor: number) => void) {
  return macro.newInstance((api: any, model: any, initial: any) => {
    vtkZoom.extend(api, model, initial);
    let previousY = 0;
    api.onButtonDown = (_interactor: any, _renderer: any, position: { y: number }) => { previousY = position.y; };
    api.onMouseMove = (interactor: any, renderer: any, position: { y: number }) => {
      if (!position) return;
      const height = interactor.getView().getViewportSize(renderer)[1];
      zoom(Math.exp((position.y - previousY) * 3 / Math.max(1, height)));
      previousY = position.y;
    };
    api.onScroll = (_interactor: any, _renderer: any, delta: number) => { if (delta) zoom(Math.exp(-delta / 10)); };
  }, 'VVMZoomManipulator')({ button: 3, scrollEnabled: true });
}
