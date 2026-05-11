import { Group } from "three";
import { describe, expect, it } from "vitest";
import { createModelDragRotationController } from "./modelDragRotation";

function event(overrides: Partial<PointerEvent>): PointerEvent {
  return {
    button: 0,
    buttons: 1,
    clientX: 0,
    pointerId: 1,
    preventDefault: () => {},
    ...overrides,
  } as PointerEvent;
}

describe("model drag rotation controller", () => {
  it("rotates the model around the world up axis while the left button is dragged", () => {
    const model = new Group();
    const controller = createModelDragRotationController(() => model);

    controller.onPointerDown(event({ clientX: 10 }));
    controller.onPointerMove(event({ clientX: 60 }));

    expect(model.rotation.y).toBeCloseTo(0.3);
  });

  it("ignores non-left-button pointer drags", () => {
    const model = new Group();
    const controller = createModelDragRotationController(() => model);

    controller.onPointerDown(event({ button: 2, buttons: 2, clientX: 10 }));
    controller.onPointerMove(event({ buttons: 2, clientX: 60 }));

    expect(model.rotation.y).toBe(0);
  });

  it("stops rotating after the pointer is released", () => {
    const model = new Group();
    const controller = createModelDragRotationController(() => model);

    controller.onPointerDown(event({ clientX: 10 }));
    controller.onPointerUp(event({}));
    controller.onPointerMove(event({ clientX: 60 }));

    expect(model.rotation.y).toBe(0);
  });
});
