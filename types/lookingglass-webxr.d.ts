declare module "@lookingglass/webxr" {
  type CalibrationValue = {
    value: number;
  };

  type LookingGlassCalibration = {
    screenW: CalibrationValue;
    screenH: CalibrationValue;
    serial: string;
  };

  type LookingGlassViewControls = {
    targetX: number;
    targetY: number;
    targetZ: number;
    targetDiam: number;
    trackballX: number;
    trackballY: number;
    fovy: number;
    viewCone: number;
    numViews: number;
  };

  type LookingGlassConfigSingleton = LookingGlassViewControls & {
    calibration: LookingGlassCalibration;
    addEventListener(
      type: "on-config-changed",
      callback: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions
    ): void;
    removeEventListener(
      type: "on-config-changed",
      callback: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions
    ): void;
    updateViewControls(value: Partial<LookingGlassViewControls>): void;
  };

  export class LookingGlassWebXRPolyfill {
    constructor(cfg?: Partial<LookingGlassViewControls>);
    update(cfg: Partial<LookingGlassViewControls>): void;
  }

  export const LookingGlassConfig: LookingGlassConfigSingleton;
}
