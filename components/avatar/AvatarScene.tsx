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
import { computeLookingGlassFocalPoint, computeLkgInlineViewSize, LKG_INLINE_ASPECT } from "@/lib/avatar/lookingGlassIntegration";

type AvatarSceneProps = {
  modelUrl?: string;
};

const DEFAULT_MODEL_URL = "/models/lobsterEdit.vrm";
const DEFAULT_IDLE_ANIMATION_URL = "/animations/idle_loop.vrma";

// Singleton guard: the LKG polyfill overrides navigator.xr globally and must
// only be constructed once per page lifetime.
let lkgInitialized = false;

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
    let isLkgPresenting = false;

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
      const win = window as Record<string, unknown>;
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

      const camera = new PerspectiveCamera(30, 1, 0.1, 100);
      camera.position.set(0, 1.2, 3);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.minDistance = 1;
      controls.maxDistance = 6;
      controls.target.set(0, 1, 0);

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
        if (isLkgPresenting) {
          const { width, height } = computeLkgInlineViewSize(clientWidth, clientHeight);
          renderer!.setSize(width, height, false);
          camera.aspect = LKG_INLINE_ASPECT;
        } else {
          renderer!.setSize(clientWidth, clientHeight, false);
          camera.aspect = clientWidth / Math.max(clientHeight, 1);
        }
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
        camera.position.set(0, controls!.target.y + 0.25, 3);
        controls!.update();
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
          LookingGlassConfig.updateViewControls(
            computeLookingGlassFocalPoint(loadedVrm.scene)
          );

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
      const lkgButtonTextMap: Record<string, string> = {
        "ENTER VR": "Hologramiphy",
        "ENTER LOOKING GLASS": "Hologramiphy",
        "EXIT VR": "Make it boring",
        "EXIT LOOKING GLASS": "Make it boring",
      };
      vrButtonTextObserver = new MutationObserver(() => {
        if (!vrButton) return;
        const current = vrButton.innerHTML.trim();
        const override = lkgButtonTextMap[current];
        if (override) vrButton.innerHTML = override;
      });
      vrButtonTextObserver.observe(vrButton, { childList: true, subtree: true, characterData: true });
      // Apply immediately in case the button already has text
      const initialText = vrButton.innerHTML.trim();
      if (lkgButtonTextMap[initialText]) vrButton.innerHTML = lkgButtonTextMap[initialText];

      // Update resize and camera aspect when entering/exiting a LKG XR session.
      renderer.xr.addEventListener("sessionstart", () => {
        isLkgPresenting = true;
        resize();
      });
      renderer.xr.addEventListener("sessionend", () => {
        isLkgPresenting = false;
        resize();
      });

      // 4. Use renderer.setAnimationLoop — required for WebXR sessions.
      const clock = new Clock();
      renderer.setAnimationLoop(() => {
        const delta = clock.getDelta();
        controls!.update();
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
