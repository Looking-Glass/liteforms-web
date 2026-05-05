"use client";

import { useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  Box3,
  Clock,
  Color,
  DirectionalLight,
  MOUSE,
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
import {
  configureRendererShadows,
  configureLightShadow,
  setMeshShadowFlags,
} from "@/lib/avatar/shadowSetup";
import {
  computeModelFraming,
  computeModelFramingMatchHeight,
  computeModelSceneHeight,
} from "@/lib/avatar/modelFraming";
import { repairMorphTargetDictionaries } from "@/lib/avatar/vrmMorphTargetRepair";
import type { GltfMeshDef } from "@/lib/avatar/vrmMorphTargetRepair";
import {
  HldShadowCompositor,
  extractSilhouetteFromWebGL,
  hasOpaqueSilhouettePixels,
} from "@/lib/avatar/hldShadowCompositor";
import {
  isLookingGlassDeviceConnected,
  openHldHologramWindow,
} from "@/lib/avatar/hologramWindow";
import { computeHldCameraInitialPosition } from "@/lib/avatar/hldCameraControls";

type AvatarSceneProps = {
  modelUrl?: string;
};

const DEFAULT_MODEL_URL = "/models/lobsterEdit.vrm";
const DEFAULT_IDLE_ANIMATION_URL = "/animations/idle_loop.vrma";
const ALCOVE_URL = "/models/Alcove.glb";
const HLD_FALLBACK_ASPECT = 9 / 16;
const PREVIEW_CAMERA_INITIAL_POSITION = new Vector3(0, 1.2, 3);
const LOOKING_GLASS_CAMERA_CENTER = new Vector3(-0.071, 0.856, 6.234);
const LOOKING_GLASS_FOCAL_TARGET = new Vector3(0.003, 0.877, 0.234);

// Singleton guard: the LKG polyfill overrides navigator.xr globally and must
// only be constructed once per page lifetime.
let lkgInitialized = false;
const hldShadowCompositor = new HldShadowCompositor();

// Cached promise for the lobster model's framed scene height (Y-axis, scene units).
// Populated the first time it is needed; reused across all subsequent model loads.
let _lobsterSceneHeightPromise: Promise<number> | null = null;

function ensureLobsterSceneHeight(): Promise<number> {
  if (_lobsterSceneHeightPromise) return _lobsterSceneHeightPromise;
  _lobsterSceneHeightPromise = new Promise<number>((resolve) => {
    const refLoader = new GLTFLoader();
    refLoader.register((parser) => new VRMLoaderPlugin(parser));
    refLoader.load(
      DEFAULT_MODEL_URL,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) {
          resolve(1.0);
          return;
        }
        VRMUtils.rotateVRM0(vrm);
        const bounds = new Box3().setFromObject(vrm.scene);
        resolve(computeModelSceneHeight(bounds.getSize(new Vector3()), 1.8));
      },
      undefined,
      () => resolve(1.0)
    );
  });
  return _lobsterSceneHeightPromise;
}

type AvatarDebugWindow = Window & {
  setHologramTarget?: (x: number, y: number, z: number) => void;
  setHologramFocalTarget?: (x: number, y: number, z: number) => void;
  setHologramCameraPosition?: (x: number, y: number, z: number) => void;
  setHologramPose?: (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => void;
  getHologramTarget?: () => { x: number; y: number; z: number };
  getHologramCameraPosition?: () => { x: number; y: number; z: number };
  setPreviewTarget?: (x: number, y: number, z: number) => void;
  getPreviewTarget?: () => { x: number; y: number; z: number };
  setKeyLightPosition?: (x: number, y: number, z: number) => void;
  setFillLightPosition?: (x: number, y: number, z: number) => void;
  setAmbientIntensity?: (intensity: number) => void;
};

export function AvatarScene({ modelUrl = DEFAULT_MODEL_URL }: AvatarSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vrmRef = useRef<VRM | undefined>(undefined);
  const idleAnimatorRef = useRef<VrmIdleAnimator | undefined>(undefined);
  const loaderRef = useRef<GLTFLoader | undefined>(undefined);
  const warnedMissingMorphsRef = useRef(new Set<string>());
  const [status, setStatus] = useState("Loading avatar");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Mutable refs shared between async setup and the sync cleanup closure
    let disposed = false;
    let renderer: WebGLRenderer | undefined;
    let shadowCanvas: HTMLCanvasElement | undefined;
    let hldPopup: Window | null = null;
    let hldPopupCanvas: HTMLCanvasElement | undefined;
    let hldPopupUnloadListener: (() => void) | undefined;
    let hldPopupResizeListener: (() => void) | undefined;
    let vrButton: HTMLElement | undefined;
    let controls: OrbitControls | undefined;
    let environmentObject: Object3D | undefined;
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
    let exitHldFallback: (() => void) | undefined;
    let isHldFallbackActive = false;
    let standardCameraPosition = PREVIEW_CAMERA_INITIAL_POSITION.clone();
    let standardTarget = new Vector3(0, 1, 0);

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

      renderer = new WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });

      win.XRWebGLBinding = savedBinding;

      configureRendererShadows(renderer);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = "srgb";
      renderer.xr.enabled = true;
      renderer.setClearColor(0xffffff, 0);
      shadowCanvas = document.createElement("canvas");
      shadowCanvas.className = "avatar-scene-shadow-canvas";
      shadowCanvas.setAttribute("aria-hidden", "true");
      shadowCanvas.hidden = true;
      container.appendChild(shadowCanvas);
      renderer.domElement.classList.add("avatar-scene-webgl-canvas");
      renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());
      container.appendChild(renderer.domElement);

      const scene = new Scene();
      scene.background = new Color("#15130f");
      const hldCameraPosition = computeHldCameraInitialPosition(PREVIEW_CAMERA_INITIAL_POSITION);
      const hldInitialCameraPosition = new Vector3(
        hldCameraPosition.x,
        hldCameraPosition.y,
        hldCameraPosition.z
      );

      let lockedPhi = Math.PI / 2;
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
        camera.position.copy(standardCameraPosition);
        controls!.target.copy(standardTarget);
        camera.lookAt(controls!.target);
        lockPolarAngle(camera, controls!);
        controls!.update();
      };

      const camera = new PerspectiveCamera(30, 1, 0.1, 100);
      camera.position.copy(PREVIEW_CAMERA_INITIAL_POSITION);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = false;
      controls.enablePan = false;
      controls.enableRotate = true;
      controls.mouseButtons.RIGHT = MOUSE.PAN;
      controls.minDistance = 1;
      controls.maxDistance = 6;
      controls.target.set(0, 1, 0);
      lockPolarAngle(camera, controls);

      controls.addEventListener("change", () => {
        enforceLockedPolarAngle(camera, controls!);
      });

      const lkgConfigChangeListener = () => {};
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
      };

      const applyHologramTarget = (x: number, y: number, z: number) => {
        LookingGlassConfig.updateViewControls({ targetX: x, targetY: y, targetZ: z });
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
      const applyKeyLightPosition = (x: number, y: number, z: number) => {
        keyLight.position.set(x, y, z);
        console.log(`[Key Light] position set to (${x}, ${y}, ${z})`);
      };
      debugWindow.setKeyLightPosition = applyKeyLightPosition;
      const applyFillLightPosition = (x: number, y: number, z: number) => {
        fillLight.position.set(x, y, z);
        console.log(`[Fill Light] position set to (${x}, ${y}, ${z})`);
      };
      debugWindow.setFillLightPosition = applyFillLightPosition;
      const applyAmbientIntensity = (intensity: number) => {
        ambientLight.intensity = intensity;
        console.log(`[Ambient Light] intensity set to ${intensity}`);
      };
      debugWindow.setAmbientIntensity = applyAmbientIntensity;
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
        if (debugWindow.setKeyLightPosition === applyKeyLightPosition) {
          delete debugWindow.setKeyLightPosition;
        }
        if (debugWindow.setFillLightPosition === applyFillLightPosition) {
          delete debugWindow.setFillLightPosition;
        }
        if (debugWindow.setAmbientIntensity === applyAmbientIntensity) {
          delete debugWindow.setAmbientIntensity;
        }
      };

      const ambientLight = new AmbientLight("#fff6e5", 1.2);
      const keyLight = new DirectionalLight("#ffffff", 2.4);
      keyLight.position.set(0.5, 0.5, 2);
      configureLightShadow(keyLight);
      const fillLight = new DirectionalLight("#70d6c5", 1.0);
      fillLight.position.set(-2, 0.5, 3);
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
        let clientWidth = container.clientWidth;
        let clientHeight = container.clientHeight;
        if (isHldFallbackActive) {
          clientHeight = container.clientHeight;
          clientWidth = Math.round(clientHeight * HLD_FALLBACK_ASPECT);
          if (clientWidth > container.clientWidth) {
            clientWidth = container.clientWidth;
            clientHeight = Math.round(clientWidth / HLD_FALLBACK_ASPECT);
          }
        }
        renderer!.setSize(clientWidth, clientHeight, false);
        if (shadowCanvas) {
          const dpr = Math.min(window.devicePixelRatio, 2);
          shadowCanvas.width = Math.max(1, Math.floor(clientWidth * dpr));
          shadowCanvas.height = Math.max(1, Math.floor(clientHeight * dpr));
        }
        camera.aspect = clientWidth / Math.max(clientHeight, 1);
        camera.updateProjectionMatrix();
      };
      resizeListener = resize;
      resize();
      window.addEventListener("resize", resize);

      // Start resolving the lobster reference height as early as possible so it
      // is likely ready by the time the imported VRM finishes loading.
      const referenceHeightPromise =
        modelUrl !== DEFAULT_MODEL_URL ? ensureLobsterSceneHeight() : null;

      const frameModel = async (object: Object3D) => {
        let framing;
        if (referenceHeightPromise !== null) {
          const referenceHeight = await referenceHeightPromise;
          framing = computeModelFramingMatchHeight(object, referenceHeight);
        } else {
          framing = computeModelFraming(object, 1.8);
          // Cache the lobster height now that we have it, so subsequent
          // imported VRM loads skip the background fetch entirely.
          _lobsterSceneHeightPromise ??= Promise.resolve(
            computeModelSceneHeight(
              new Box3().setFromObject(object).getSize(new Vector3()),
              1.8
            )
          );
        }
        object.scale.setScalar(framing.scale);
        object.position.copy(framing.position);
        controls!.target.copy(framing.cameraTarget);
        standardTarget.copy(framing.cameraTarget);
        if (!isHldFallbackActive) {
          standardCameraPosition.copy(PREVIEW_CAMERA_INITIAL_POSITION);
          camera.position.copy(standardCameraPosition);
        }
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
      loaderRef.current = loader;

      loader.load(
        modelUrl,
        async (gltf) => {
          if (disposed) return;

          const loadedVrm = gltf.userData.vrm as VRM | undefined;
          if (!loadedVrm) {
            setStatus("Avatar failed to load");
            return;
          }

          // THREE.js GLTFLoader reads morph target names from mesh.extras.targetNames,
          // but many VRM 0.x files store them on each primitive's extras instead.
          // Repair the morphTargetDictionary before the animator reads it.
          const gltfJson = (gltf as { parser?: { json?: { meshes?: GltfMeshDef[] } } }).parser?.json;
          if (gltfJson?.meshes) {
            repairMorphTargetDictionaries(loadedVrm.scene, gltfJson.meshes);
          }

          currentVrm = loadedVrm;
          vrmRef.current = loadedVrm;
          VRMUtils.rotateVRM0(loadedVrm);
          scene.add(loadedVrm.scene);
          setMeshShadowFlags(loadedVrm.scene, true, false);
          runtimeAnimator?.dispose();
          runtimeAnimator = new VrmRuntimeAnimator(loadedVrm);
          await frameModel(loadedVrm.scene);
          if (disposed) return;

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
          LookingGlassConfig.updateViewControls(focalPoint);

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

          void loadEnvironmentGlb(ALCOVE_URL, loader, scene, loadedVrm.scene).then((envScene) => {
            environmentObject = envScene;
            environmentObject.visible = !isHldFallbackActive;
          });

          void loadVrmAnimationClip(DEFAULT_IDLE_ANIMATION_URL, loadedVrm, loader).then((clip) => {
            if (disposed || !clip) return;
            idleAnimator?.dispose();
            idleAnimatorRef.current?.dispose();
            idleAnimator = new VrmIdleAnimator(loadedVrm, clip);
            idleAnimatorRef.current = idleAnimator;
          });
        },
        undefined,
        () => {
          if (!disposed) setStatus("Avatar failed to load");
        }
      );

      const setVrButtonLabel = (label: string) => {
        if (vrButton) vrButton.innerHTML = label;
      };

      const applyHldFallbackMode = (active: boolean) => {
        isHldFallbackActive = active;
        container.classList.toggle("avatar-scene--hld", active);
        scene.background = active ? null : new Color("#15130f");
        if (shadowCanvas) shadowCanvas.hidden = !active;
        if (environmentObject) environmentObject.visible = !active;

        renderer!.xr.enabled = !active;
        controls!.enablePan = active;
        controls!.enableRotate = !active;
        controls!.mouseButtons.LEFT = MOUSE.ROTATE;
        controls!.mouseButtons.RIGHT = MOUSE.PAN;

        if (active) {
          standardCameraPosition.copy(camera.position);
          standardTarget.copy(controls!.target);
          camera.position.copy(hldInitialCameraPosition);
          camera.lookAt(controls!.target);
          lockPolarAngle(camera, controls!);
          setVrButtonLabel("Make it boring");
        } else {
          restorePreviewCamera();
          setVrButtonLabel("Hologram-iphy");
        }

        resize();
      };

      const removeHldPopupListener = () => {
        if (hldPopup && hldPopupUnloadListener) {
          hldPopup.removeEventListener("beforeunload", hldPopupUnloadListener);
        }
        if (hldPopup && hldPopupResizeListener) {
          hldPopup.removeEventListener("resize", hldPopupResizeListener);
        }
        hldPopupUnloadListener = undefined;
        hldPopupResizeListener = undefined;
      };

      exitHldFallback = () => {
        if (!isHldFallbackActive) return;
        removeHldPopupListener();
        const popupToClose = hldPopup;
        hldPopup = null;
        hldPopupCanvas = undefined;
        applyHldFallbackMode(false);
        if (popupToClose && !popupToClose.closed) {
          popupToClose.close();
        }
      };

      const styleHldPopupDocument = (popup: Window) => {
        popup.document.title = "Liteforms HLD Hologram";
        popup.document.body.style.background = "#ffffff";
        popup.document.body.style.margin = "0";
        popup.document.body.style.overflow = "hidden";
        popup.document.body.style.width = "100vw";
        popup.document.body.style.height = "100vh";
        popup.document.body.innerHTML = "";

        hldPopupCanvas = popup.document.createElement("canvas");
        hldPopupCanvas.style.position = "fixed";
        hldPopupCanvas.style.left = "50%";
        hldPopupCanvas.style.top = "50%";
        hldPopupCanvas.style.transform = "translate(-50%, -50%)";
        hldPopupCanvas.style.width = "min(100vw, calc(100vh * 9 / 16))";
        hldPopupCanvas.style.height = "min(100vh, calc(100vw * 16 / 9))";
        hldPopupCanvas.style.aspectRatio = "9 / 16";
        hldPopupCanvas.style.background = "#ffffff";
        hldPopupCanvas.addEventListener("contextmenu", (event) => event.preventDefault());
        const forwardPointerEvent = (event: PointerEvent) => {
          if (!renderer) return;
          event.preventDefault();
          const sourceRect = hldPopupCanvas!.getBoundingClientRect();
          const targetRect = renderer.domElement.getBoundingClientRect();
          const xRatio = sourceRect.width > 0 ? (event.clientX - sourceRect.left) / sourceRect.width : 0;
          const yRatio = sourceRect.height > 0 ? (event.clientY - sourceRect.top) / sourceRect.height : 0;
          renderer.domElement.dispatchEvent(new PointerEvent(event.type, {
            bubbles: true,
            cancelable: true,
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            isPrimary: event.isPrimary,
            button: event.button,
            buttons: event.buttons,
            clientX: targetRect.left + xRatio * targetRect.width,
            clientY: targetRect.top + yRatio * targetRect.height,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
          }));
        };
        const forwardWheelEvent = (event: WheelEvent) => {
          if (!renderer) return;
          event.preventDefault();
          renderer.domElement.dispatchEvent(new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            deltaZ: event.deltaZ,
            deltaMode: event.deltaMode,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
          }));
        };
        hldPopupCanvas.addEventListener("pointerdown", forwardPointerEvent);
        hldPopupCanvas.addEventListener("pointermove", forwardPointerEvent);
        hldPopupCanvas.addEventListener("pointerup", forwardPointerEvent);
        hldPopupCanvas.addEventListener("pointercancel", forwardPointerEvent);
        hldPopupCanvas.addEventListener("wheel", forwardWheelEvent, { passive: false });
        popup.document.body.appendChild(hldPopupCanvas);
      };

      const enterHldFallback = async () => {
        if (isHldFallbackActive) {
          exitHldFallback?.();
          return;
        }

        const popup = await openHldHologramWindow(window);
        if (disposed) return;
        hldPopup = popup;
        if (hldPopup) {
          styleHldPopupDocument(hldPopup);
          hldPopupUnloadListener = () => {
            hldPopup = null;
            hldPopupCanvas = undefined;
            applyHldFallbackMode(false);
          };
          hldPopupResizeListener = resize;
          hldPopup.addEventListener("beforeunload", hldPopupUnloadListener);
          hldPopup.addEventListener("resize", hldPopupResizeListener);
        }

        applyHldFallbackMode(true);
      };

      let isLkgSessionActive = false;
      // 3. Add VRButton after polyfill has set navigator.xr, so VRButton's
      //    isSessionSupported query finds the LKG device.
      vrButton = VRButton.createButton(renderer);
      document.body.appendChild(vrButton);
      vrButton.addEventListener(
        "click",
        (event) => {
          if (isHldFallbackActive) {
            event.preventDefault();
            event.stopImmediatePropagation();
              exitHldFallback?.();
              return;
          }
          if (isLookingGlassDeviceConnected(LookingGlassConfig)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          void enterHldFallback();
        },
        { capture: true }
      );

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
      const lkgButtonTextMap: Record<string, string> = {
        "ENTER VR": "Hologram-iphy",
        "ENTER LOOKING GLASS": "Hologram-iphy",
        "VR NOT SUPPORTED": "Hologram-iphy",
        "EXIT VR": "Make it boring",
        "EXIT LOOKING GLASS": "Make it boring",
      };
      vrButtonTextObserver = new MutationObserver(() => {
        if (!vrButton) return;
        const current = vrButton.innerHTML.trim();
        if (isHldFallbackActive) {
          if (current !== "Make it boring") vrButton.innerHTML = "Make it boring";
          return;
        }

        if (current === "EXIT LOOKING GLASS" || current === "EXIT VR") {
          isLkgSessionActive = true;
          const sw = LookingGlassConfig.calibration.screenW.value;
          const sh = LookingGlassConfig.calibration.screenH.value;
          container.style.aspectRatio = `${sw} / ${sh}`;
          container.style.maxHeight = `${Math.floor(window.innerHeight * 0.85)}px`;
          resize();
        } else if (current === "ENTER LOOKING GLASS" || current === "ENTER VR") {
          isLkgSessionActive = false;
          container.style.aspectRatio = "";
          container.style.maxHeight = "";
          restorePreviewCamera();
          resize();
        }

          const override = lkgButtonTextMap[current];
          if (override) {
            vrButton!.innerHTML = override;
            if (current === "VR NOT SUPPORTED") {
              (vrButton as HTMLButtonElement).disabled = false;
              vrButton.style.cursor = "pointer";
            }
          }
        });
      vrButtonTextObserver.observe(vrButton, { childList: true, subtree: true, characterData: true });
      // Apply immediately in case the button already has text
      const initialText = vrButton.innerHTML.trim();
      if (lkgButtonTextMap[initialText]) {
        vrButton.innerHTML = lkgButtonTextMap[initialText];
        if (initialText === "VR NOT SUPPORTED") {
          (vrButton as HTMLButtonElement).disabled = false;
          vrButton.style.cursor = "pointer";
        }
      }

      renderer.xr.addEventListener("sessionend", restorePreviewCamera);
      xrSessionEndCleanup = () => {
        renderer?.xr.removeEventListener("sessionend", restorePreviewCamera);
      };

      const drawHldShadow = () => {
        if (!shadowCanvas || !renderer) return;
        const ctx = shadowCanvas.getContext("2d");
        if (!ctx) return;

        const width = renderer.domElement.width;
        const height = renderer.domElement.height;
        if (width <= 0 || height <= 0) return;
        if (shadowCanvas.width !== width) shadowCanvas.width = width;
        if (shadowCanvas.height !== height) shadowCanvas.height = height;

        ctx.clearRect(0, 0, width, height);
        const gl = renderer.getContext();
        let silhouette = extractSilhouetteFromWebGL(gl, width, height, 60, false, 0.95);
        if (!hasOpaqueSilhouettePixels(silhouette)) {
          silhouette = extractSilhouetteFromWebGL(gl, width, height, 60, true, 0.95);
          if (!hasOpaqueSilhouettePixels(silhouette)) return;
        }

        hldShadowCompositor.drawShadowOnly(ctx, width, height, silhouette, {
          shadowY: 37,
          shadowX: 0,
          shadowSkew: 95,
          shadowPerspective: 50,
          shadowOpacity: 0.6,
          shadowBlur: 10,
          horizontalBlur: 0,
          scale: 1,
        });
      };

      const mirrorHldPopup = () => {
        if (!hldPopupCanvas || !renderer || !shadowCanvas) return;
        const sourceCanvas = renderer.domElement;
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;
        if (width <= 0 || height <= 0) return;
        if (hldPopupCanvas.width !== width) hldPopupCanvas.width = width;
        if (hldPopupCanvas.height !== height) hldPopupCanvas.height = height;

        const ctx = hldPopupCanvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(shadowCanvas, 0, 0, width, height);
        ctx.drawImage(sourceCanvas, 0, 0, width, height);
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

        idleAnimatorRef.current?.update(delta);
        runtimeAnimator?.update(delta);
        currentVrm?.update(delta);
        renderer!.render(scene, camera);
        if (isHldFallbackActive) {
          drawHldShadow();
          mirrorHldPopup();
        }
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
      exitHldFallback?.();
      container.style.aspectRatio = "";
      container.style.maxHeight = "";
      idleAnimator?.dispose();
      idleAnimatorRef.current = undefined;
      loaderRef.current = undefined;
      runtimeAnimator?.dispose();
      controls?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
      shadowCanvas?.remove();
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
