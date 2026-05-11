import { Vector3 } from "three";
import type { Object3D } from "three";

const WORLD_UP_AXIS = new Vector3(0, 1, 0);
const DRAG_ROTATION_RADIANS_PER_PIXEL = 0.006;

type RotatableModelProvider = () => Object3D | undefined;

export function createModelDragRotationController(getModel: RotatableModelProvider) {
  let activePointerId: number | null = null;
  let lastClientX = 0;

  const stopDrag = (event: Pick<PointerEvent, "pointerId">) => {
    if (event.pointerId === activePointerId) {
      activePointerId = null;
    }
  };

  return {
    onPointerDown(event: Pick<PointerEvent, "button" | "clientX" | "pointerId" | "preventDefault">) {
      if (event.button !== 0) return;

      activePointerId = event.pointerId;
      lastClientX = event.clientX;
      event.preventDefault();
    },

    onPointerMove(event: Pick<PointerEvent, "buttons" | "clientX" | "pointerId" | "preventDefault">) {
      if (event.pointerId !== activePointerId) return;
      if ((event.buttons & 1) !== 1) {
        activePointerId = null;
        return;
      }

      const deltaX = event.clientX - lastClientX;
      lastClientX = event.clientX;

      const model = getModel();
      if (model && deltaX !== 0) {
        model.rotateOnWorldAxis(WORLD_UP_AXIS, deltaX * DRAG_ROTATION_RADIANS_PER_PIXEL);
      }
      event.preventDefault();
    },

    onPointerUp: stopDrag,
    onPointerCancel: stopDrag,
  };
}
