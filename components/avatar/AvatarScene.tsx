"use client";

import { useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  Box3,
  Clock,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer
} from "three";
import type { Object3D } from "three";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { VRM } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin } from "@pixiv/three-vrm-animation";
import { getVrmExpressionDebugSummaries } from "@/lib/avatar/vrmExpressionController";
import { getMissingVrm0MouthMorphTargets } from "@/lib/avatar/morphTargetController";
import { avatarLipSyncEventName } from "@/lib/avatar/lipSyncEvents";
import type { AvatarLipSyncFrame } from "@/lib/avatar/lipSyncEvents";
import { VrmRuntimeAnimator } from "@/lib/avatar/vrmRuntimeAnimator";
import { loadVrmAnimationClip, VrmIdleAnimator } from "@/lib/avatar/vrmAnimationLoader";
import {
  computeLookingGlassCameraArrayState,
  computeLookingGlassFocalPoint,
  withLookingGlassCameraPose,
  withLookingGlassTarget,
} from "@/lib/avatar/lookingGlassIntegration";
import type { LookingGlassFocalPoint } from "@/lib/avatar/lookingGlassIntegration";
import { loadEnvironmentGlb } from "@/lib/avatar/environmentLoader";

type AvatarSceneProps = {
  modelUrl?: string;
};

const DEFAULT_MODEL_URL = "/models/lobsterEdit.vrm";
const DEFAULT_IDLE_ANIMATION_URL = "/animations/idle_loop.vrma";
const ALCOVE_URL = "/models/Alcove.glb";
const PREVIEW_CAMERA_INITIAL_POSITION = new Vector3(0, 1.2, 3);
const LOOKING_GLASS_CAMERA_CENTER = new Vector3(-0.071, 0.856, 6.234);
const LOOKING_GLASS_FOCAL_TARGET = new Vector3(0.003, 0.877, 0.234);

// Singleton guard: the LKG polyfill overrides navigator.xr globally and must
// only be constructed once per page lifetime.
let lkgInitialized = false;

type AvatarDebugWindow = Window & {
  setHologramTarget?: (x: number, y: number, z: number) => void;
  setHologramFocalTarget?: (x: number, y: number, z: number) => void;
  setHologramCameraPosition?: (x: number, y: number, z: number) => void;
  setHologramPose?: (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => void;
  getHologramTarget?: () => { x: number; y: number; z: number };
  getHologramCameraPosition?: () => { x: number; y: number; z: number };
  setPreviewTarget?: (x: number, y: number, z: number) => void;
  getPreviewTarget?: () => { x: number; y: number; z: number };
};

export function AvatarScene({ modelUrl = DEFAULT_MODEL_URL }: AvatarSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vrmRef = useRef<VRM | undefined>(undefined);
  const warnedMissingMorphsRef = useRef(new Set<string>());
  const [status, setStatus] = useState("Loading avatar");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Mutable refs shared between async setup and the sync cleanup closure
    let disposed = false;
    let renderer: WebGLRenderer | undefined;
    let vrButton: HTMLElement | undefined;
    let controls: OrbitControls | undefined;
    let currentVrm: VRM | undefined;
    let runtimeAnimator: VrmRuntimeAnimator | undefined;
    let idleAnimator: VrmIdleAnimator | undefined;
    let resizeListener: (() => void) | undefined;
    let lipSyncListener: ((event: Event) => void) | undefined;
    let lkgControlsObserver: MutationObserver | undefined;
    let vrButtonTextObserver: MutationObserver | undefined;
    let lkgConfigChangeCleanup: (() => void) | undefined;
    let debugWindowCleanup: (() => void) | undefined;
    let xrSessionEndCleanup: (() => void) | undefined;

    void import("@lookingglass/webxr").then(({ LookingGlassWebXRPolyfill, LookingGlassConfig }) => {
      if (disposed) return;

      // 1. Init the polyfill once — overrides navigator.xr with the LKG device.
      if (!lkgInitialized) {
        new LookingGlassWebXRPolyfill();
        lkgInitialized = true;
      }

      // 2. Three.js r150+ checks `typeof XRWebGLBinding !== 'undefined'` at
      //    WebGLRenderer construction to decide which XR layer type to use.
      //    The LKG polyfill only supports XRWebGLLayer (not XRWebGLBinding /
      //    projection layers), so we temporarily hide the native binding to
      //    force Three.js onto the XRWebGLLayer code path.
      const win = window as unknown as Record<string, unknown>;
      const savedBinding = win.XRWebGLBinding;
      win.XRWebGLBinding = undefined;

      renderer = new WebGLRenderer({ antialias: true, alpha: false });

      win.XRWebGLBinding = savedBinding;

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = "srgb";
      renderer.xr.enabled = true;
      container.appendChild(renderer.domElement);

      const scene = new Scene();
      scene.background = new Color("#15130f");

      let lockedPhi = Math.PI / 2;
      const radiansToDegrees = (radians: number) => radians * 180 / Math.PI;
      const formatVector = (v: { x: number; y: number; z: number }) =>
        `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;

      const lockPolarAngle = (cam: PerspectiveCamera, ctrl: OrbitControls) => {
        const dy = cam.position.y - ctrl.target.y;
        const dxz = Math.sqrt(
          (cam.position.x - ctrl.target.x) ** 2 +
          (cam.position.z - ctrl.target.z) ** 2
        );
        lockedPhi = Math.atan2(dxz, dy);
        ctrl.minPolarAngle = lockedPhi;
        ctrl.maxPolarAngle = lockedPhi;
      };

      const enforceLockedPolarAngle = (cam: PerspectiveCamera, ctrl: OrbitControls) => {
        const t = ctrl.target;
        const offset = cam.position.clone().sub(t);
        const r = offset.length();
        if (r <= 0) return;

        const theta = Math.atan2(offset.x, offset.z);
        cam.position.set(
          t.x + r * Math.sin(lockedPhi) * Math.sin(theta),
          t.y + r * Math.cos(lockedPhi),
          t.z + r * Math.sin(lockedPhi) * Math.cos(theta)
        );
        cam.lookAt(t);
        ctrl.minPolarAngle = lockedPhi;
        ctrl.maxPolarAngle = lockedPhi;
      };

      const restorePreviewCamera = () => {
        camera.position.copy(PREVIEW_CAMERA_INITIAL_POSITION);
        camera.lookAt(controls!.target);
        lockPolarAngle(camera, controls!);
        controls!.update();
      };

      const camera = new PerspectiveCamera(30, 1, 0.1, 100);
      camera.position.copy(PREVIEW_CAMERA_INITIAL_POSITION);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = false;
      controls.enablePan = false;
      controls.minDistance = 1;
      controls.maxDistance = 6;
      controls.target.set(0, 1, 0);
      lockPolarAngle(camera, controls);

      controls.addEventListener("change", () => {
        enforceLockedPolarAngle(camera, controls!);
        const p = camera.position;
        const r = camera.rotation;
        const dist = p.distanceTo(controls!.target);
        console.log(
          "[Preview Camera]",
          `pos=(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`,
          `rot=(${(r.x * 180 / Math.PI).toFixed(1)}°, ${(r.y * 180 / Math.PI).toFixed(1)}°, ${(r.z * 180 / Math.PI).toFixed(1)}°)`,
          `orbitDist=${dist.toFixed(3)}`,
          `target=(${controls!.target.x.toFixed(3)}, ${controls!.target.y.toFixed(3)}, ${controls!.target.z.toFixed(3)})`
        );
      });

      let lastLookingGlassCameraLog = "";
      const logLookingGlassCamera = () => {
        const cameraArrayState = computeLookingGlassCameraArrayState({
          targetX: LookingGlassConfig.targetX,
          targetY: LookingGlassConfig.targetY,
          targetZ: LookingGlassConfig.targetZ,
          targetDiam: LookingGlassConfig.targetDiam,
          trackballX: LookingGlassConfig.trackballX,
          trackballY: LookingGlassConfig.trackballY,
          fovy: LookingGlassConfig.fovy,
          viewCone: LookingGlassConfig.viewCone,
          numViews: LookingGlassConfig.numViews,
        });
        const r = cameraArrayState.rotationRadians;
        const logParts = [
          `centerPos=${formatVector(cameraArrayState.centerPosition)}`,
          `rot=(${radiansToDegrees(r.x).toFixed(1)}deg, ${radiansToDegrees(r.y).toFixed(1)}deg, ${radiansToDegrees(r.z).toFixed(1)}deg)`,
          `orbitDist=${cameraArrayState.orbitDistance.toFixed(3)}`,
          `target=${formatVector(cameraArrayState.target)}`,
          `lkgTrackball=(${radiansToDegrees(LookingGlassConfig.trackballX).toFixed(1)}deg, ${radiansToDegrees(LookingGlassConfig.trackballY).toFixed(1)}deg)`,
          `firstView=${formatVector(cameraArrayState.firstViewPosition)}`,
          `lastView=${formatVector(cameraArrayState.lastViewPosition)}`,
        ];
        const signature = logParts.join("|");
        if (signature === lastLookingGlassCameraLog) return;

        lastLookingGlassCameraLog = signature;
        console.log("[Camera]", ...logParts);
      };
      const lkgConfigChangeListener = () => logLookingGlassCamera();
      LookingGlassConfig.addEventListener("on-config-changed", lkgConfigChangeListener);
      lkgConfigChangeCleanup = () => {
        LookingGlassConfig.removeEventListener("on-config-changed", lkgConfigChangeListener);
      };
      const currentLookingGlassFocalPoint = (): LookingGlassFocalPoint => ({
        targetX: LookingGlassConfig.targetX,
        targetY: LookingGlassConfig.targetY,
        targetZ: LookingGlassConfig.targetZ,
        targetDiam: LookingGlassConfig.targetDiam,
        trackballX: LookingGlassConfig.trackballX,
        trackballY: LookingGlassConfig.trackballY,
        fovy: LookingGlassConfig.fovy,
      });
      const currentLookingGlassCameraState = () =>
        computeLookingGlassCameraArrayState({
          ...currentLookingGlassFocalPoint(),
          viewCone: LookingGlassConfig.viewCone,
          numViews: LookingGlassConfig.numViews,
        });
      const updateLookingGlassCameraPose = (position: Vector3, target: Vector3) => {
        LookingGlassConfig.updateViewControls(
          withLookingGlassCameraPose(currentLookingGlassFocalPoint(), position, target)
        );
        logLookingGlassCamera();
      };

      const applyHologramTarget = (x: number, y: number, z: number) => {
        LookingGlassConfig.updateViewControls({ targetX: x, targetY: y, targetZ: z });
        logLookingGlassCamera();
      };
      const applyHologramFocalTarget = (x: number, y: number, z: number) => {
        updateLookingGlassCameraPose(
          currentLookingGlassCameraState().centerPosition,
          new Vector3(x, y, z)
        );
      };
      const applyHologramCameraPosition = (x: number, y: number, z: number) => {
        updateLookingGlassCameraPose(
          new Vector3(x, y, z),
          currentLookingGlassCameraState().target
        );
      };
      const applyHologramPose = (
        px: number,
        py: number,
        pz: number,
        tx: number,
        ty: number,
        tz: number
      ) => {
        updateLookingGlassCameraPose(new Vector3(px, py, pz), new Vector3(tx, ty, tz));
      };

      const applyPreviewTarget = (x: number, y: number, z: number) => {
        controls!.target.set(x, y, z);
        camera.lookAt(controls!.target);
        logLookingGlassCamera();
      };

      const debugWindow = window as AvatarDebugWindow;
      debugWindow.setHologramTarget = applyHologramTarget;
      debugWindow.setHologramFocalTarget = applyHologramFocalTarget;
      debugWindow.setHologramCameraPosition = applyHologramCameraPosition;
      debugWindow.setHologramPose = applyHologramPose;
      const getHologramTarget = () => {
        return {
          x: LookingGlassConfig.targetX,
          y: LookingGlassConfig.targetY,
          z: LookingGlassConfig.targetZ,
        };
      };
      debugWindow.getHologramTarget = getHologramTarget;
      const getHologramCameraPosition = () => {
        const position = currentLookingGlassCameraState().centerPosition;
        return { x: position.x, y: position.y, z: position.z };
      };
      debugWindow.getHologramCameraPosition = getHologramCameraPosition;
      debugWindow.setPreviewTarget = applyPreviewTarget;
      const getPreviewTarget = () => {
        const target = controls!.target;
        return { x: target.x, y: target.y, z: target.z };
      };
      debugWindow.getPreviewTarget = getPreviewTarget;
      debugWindowCleanup = () => {
        if (debugWindow.setHologramTarget === applyHologramTarget) {
          delete debugWindow.setHologramTarget;
        }
        if (debugWindow.setHologramFocalTarget === applyHologramFocalTarget) {
          delete debugWindow.setHologramFocalTarget;
        }
        if (debugWindow.setHologramCameraPosition === applyHologramCameraPosition) {
          delete debugWindow.setHologramCameraPosition;
        }
        if (debugWindow.setHologramPose === applyHologramPose) {
          delete debugWindow.setHologramPose;
        }
        if (debugWindow.getHologramTarget === getHologramTarget) {
          delete debugWindow.getHologramTarget;
        }
        if (debugWindow.getHologramCameraPosition === getHologramCameraPosition) {
          delete debugWindow.getHologramCameraPosition;
        }
        if (debugWindow.setPreviewTarget === applyPreviewTarget) {
          delete debugWindow.setPreviewTarget;
        }
        if (debugWindow.getPreviewTarget === getPreviewTarget) {
          delete debugWindow.getPreviewTarget;
        }
      };

      const ambientLight = new AmbientLight("#fff6e5", 1.8);
      const keyLight = new DirectionalLight("#ffffff", 2.4);
      keyLight.position.set(2, 3, 4);
      const fillLight = new DirectionalLight("#70d6c5", 0.9);
      fillLight.position.set(-3, 2, 2);
      scene.add(ambientLight, keyLight, fillLight);

      // Suppress the Looking Glass Controls panel that the polyfill appends to document.body
      lkgControlsObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if ((node as HTMLElement).id === "LookingGlassWebXRControls") {
              (node as HTMLElement).remove();
            }
          }
        }
      });
      lkgControlsObserver.observe(document.body, { childList: true });

      const resize = () => {
        const { clientWidth, clientHeight } = container;
        renderer!.setSize(clientWidth, clientHeight, false);
        camera.aspect = clientWidth / Math.max(clientHeight, 1);
        camera.updateProjectionMatrix();
      };
      resizeListener = resize;
      resize();
      window.addEventListener("resize", resize);

      const frameModel = (object: Object3D) => {
        const bounds = new Box3().setFromObject(object);
        const size = bounds.getSize(new Vector3());
        const center = bounds.getCenter(new Vector3());
        const maxAxis = Math.max(size.x, size.y, size.z);
        const scale = maxAxis > 0 ? 1.8 / maxAxis : 1;

        object.scale.setScalar(scale);
        object.position.sub(center.multiplyScalar(scale));
        object.position.y += size.y * scale * 0.5 - 0.05;

        controls!.target.set(0, Math.max(0.75, size.y * scale * 0.45), 0);
        camera.position.copy(PREVIEW_CAMERA_INITIAL_POSITION);
        controls!.update();
        lockPolarAngle(camera, controls!);
      };

      const onLipSyncFrame = (event: Event) => {
        const frame = (event as CustomEvent<AvatarLipSyncFrame>).detail;
        runtimeAnimator?.setLipSyncFrame(frame);
      };
      lipSyncListener = onLipSyncFrame;
      window.addEventListener(avatarLipSyncEventName, onLipSyncFrame);

      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

      loader.load(
        modelUrl,
        (gltf) => {
          if (disposed) return;

          const loadedVrm = gltf.userData.vrm as VRM | undefined;
          if (!loadedVrm) {
            setStatus("Avatar failed to load");
            return;
          }

          currentVrm = loadedVrm;
          vrmRef.current = loadedVrm;
          VRMUtils.rotateVRM0(loadedVrm);
          scene.add(loadedVrm.scene);
          runtimeAnimator?.dispose();
          runtimeAnimator = new VrmRuntimeAnimator(loadedVrm);
          frameModel(loadedVrm.scene);

          // Update the holographic focal plane so the lobster is centred on
          // the convergence point. LookingGlassConfig is the exported singleton;
          // updateLookingGlassConfig is not in the built bundle.
          const focalPoint: LookingGlassFocalPoint = withLookingGlassTarget(
            withLookingGlassCameraPose(
              computeLookingGlassFocalPoint(loadedVrm.scene),
              LOOKING_GLASS_CAMERA_CENTER,
              LOOKING_GLASS_FOCAL_TARGET
            ),
            LOOKING_GLASS_FOCAL_TARGET
          );
          console.log(
            "[LKG config BEFORE update]",
            `trackballX=${(LookingGlassConfig.trackballX * 180 / Math.PI).toFixed(2)}°`,
            `trackballY=${(LookingGlassConfig.trackballY * 180 / Math.PI).toFixed(2)}°`,
            `targetDiam=${LookingGlassConfig.targetDiam?.toFixed(3)}`
          );
          LookingGlassConfig.updateViewControls(focalPoint);
          console.log(
            "[LKG config AFTER update]",
            `trackballX=${(LookingGlassConfig.trackballX * 180 / Math.PI).toFixed(2)}°`,
            `target=(${focalPoint.targetX.toFixed(3)}, ${focalPoint.targetY.toFixed(3)}, ${focalPoint.targetZ.toFixed(3)})`,
            `targetDiam=${focalPoint.targetDiam.toFixed(3)}`
          );

          logLookingGlassCamera();

          const expressionSummaries = getVrmExpressionDebugSummaries(loadedVrm.expressionManager);
          const missingVrm0MouthMorphs = getMissingVrm0MouthMorphTargets(loadedVrm.scene);

          if (expressionSummaries.length > 0) {
            console.debug(`Liteforms avatar expressions: ${expressionSummaries.join(", ")}`);
          }
          for (const targetName of missingVrm0MouthMorphs) {
            if (!warnedMissingMorphsRef.current.has(targetName)) {
              warnedMissingMorphsRef.current.add(targetName);
              console.warn(`Liteforms avatar lip sync: missing VRM 0.0 mouth morph target ${targetName}.`);
            }
          }
          setStatus("");

          void loadEnvironmentGlb(ALCOVE_URL, loader, scene, loadedVrm.scene);

          void loadVrmAnimationClip(DEFAULT_IDLE_ANIMATION_URL, loadedVrm, loader).then((clip) => {
            if (disposed || !clip) return;
            idleAnimator?.dispose();
            idleAnimator = new VrmIdleAnimator(loadedVrm, clip);
          });
        },
        undefined,
        () => {
          if (!disposed) setStatus("Avatar failed to load");
        }
      );

      // 3. Add VRButton after polyfill has set navigator.xr, so VRButton's
      //    isSessionSupported query finds the LKG device.
      vrButton = VRButton.createButton(renderer);
      document.body.appendChild(vrButton);

      // Override the VRButton text. The LKG polyfill asynchronously rewrites
      // innerHTML to "ENTER/EXIT LOOKING GLASS"; watch for those mutations and
      // replace with our own labels.
      //
      // Also use these mutations as the reliable session-start/end signal: the
      // polyfill sets the button text *after* it has finalised the calibration,
      // so LookingGlassConfig.calibration.screenW/H already hold the correct
      // device dimensions at that point. We match the container to those
      // dimensions so that the canvas (which the polyfill also forces to
      // screenW×screenH every frame) displays without distortion.
      let isLkgSessionActive = false;
      const lkgButtonTextMap: Record<string, string> = {
        "ENTER VR": "Hologramiphy",
        "ENTER LOOKING GLASS": "Hologramiphy",
        "EXIT VR": "Make it boring",
        "EXIT LOOKING GLASS": "Make it boring",
      };
      vrButtonTextObserver = new MutationObserver(() => {
        if (!vrButton) return;
        const current = vrButton.innerHTML.trim();

        if (current === "EXIT LOOKING GLASS" || current === "EXIT VR") {
          isLkgSessionActive = true;
          const sw = LookingGlassConfig.calibration.screenW.value;
          const sh = LookingGlassConfig.calibration.screenH.value;
          container.style.aspectRatio = `${sw} / ${sh}`;
          container.style.maxHeight = `${Math.floor(window.innerHeight * 0.85)}px`;
          resize();
          logLookingGlassCamera();
        } else if (current === "ENTER LOOKING GLASS" || current === "ENTER VR") {
          isLkgSessionActive = false;
          container.style.aspectRatio = "";
          container.style.maxHeight = "";
          restorePreviewCamera();
          resize();
        }

        const override = lkgButtonTextMap[current];
        if (override) vrButton!.innerHTML = override;
      });
      vrButtonTextObserver.observe(vrButton, { childList: true, subtree: true, characterData: true });
      // Apply immediately in case the button already has text
      const initialText = vrButton.innerHTML.trim();
      if (lkgButtonTextMap[initialText]) vrButton.innerHTML = lkgButtonTextMap[initialText];

      renderer.xr.addEventListener("sessionend", restorePreviewCamera);
      xrSessionEndCleanup = () => {
        renderer?.xr.removeEventListener("sessionend", restorePreviewCamera);
      };

      // 4. Use renderer.setAnimationLoop — required for WebXR sessions.
      //    During an active LKG session the polyfill forces appCanvas.width/height
      //    to screenW/screenH every frame (inside blitTextureToDefaultFramebuffer).
      //    Keep the container's aspect-ratio in sync with those canvas dimensions
      //    each frame so the inline view is never distorted.
      const clock = new Clock();
      renderer.setAnimationLoop(() => {
        if (isLkgSessionActive) {
          const canvas = renderer!.domElement;
          const aspect = `${canvas.width} / ${canvas.height}`;
          if (container.style.aspectRatio !== aspect) {
            container.style.aspectRatio = aspect;
          }
        }
        const delta = clock.getDelta();
        controls!.update();

        // Enforce horizontal-only orbit: allow azimuth (theta) to change freely
        // but snap camera back to the locked elevation (phi) every frame.
        enforceLockedPolarAngle(camera, controls!);

        idleAnimator?.update(delta);
        runtimeAnimator?.update(delta);
        currentVrm?.update(delta);
        renderer!.render(scene, camera);
      });
    });

    return () => {
      disposed = true;
      renderer?.setAnimationLoop(null);
      if (resizeListener) window.removeEventListener("resize", resizeListener);
      if (lipSyncListener) window.removeEventListener(avatarLipSyncEventName, lipSyncListener);
      lkgControlsObserver?.disconnect();
      vrButtonTextObserver?.disconnect();
      lkgConfigChangeCleanup?.();
      debugWindowCleanup?.();
      xrSessionEndCleanup?.();
      container.style.aspectRatio = "";
      container.style.maxHeight = "";
      idleAnimator?.dispose();
      runtimeAnimator?.dispose();
      controls?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
      vrButton?.remove();
      vrmRef.current = undefined;
    };
  }, [modelUrl]);

  return (
    <div className="avatar-scene" ref={containerRef}>
      {status ? <div className="avatar-scene-status">{status}</div> : null}
    </div>
  );
}
