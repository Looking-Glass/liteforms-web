"use client";

import { useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  Box3,
  Clock,
  Color,
  DirectionalLight,
  GridHelper,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer
} from "three";
import type { Object3D } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { VRM } from "@pixiv/three-vrm";
import { getVrmExpressionDebugSummaries } from "@/lib/avatar/vrmExpressionController";
import { getMissingVrm0MouthMorphTargets } from "@/lib/avatar/morphTargetController";
import { avatarLipSyncEventName } from "@/lib/avatar/lipSyncEvents";
import type { AvatarLipSyncFrame } from "@/lib/avatar/lipSyncEvents";
import { VrmRuntimeAnimator } from "@/lib/avatar/vrmRuntimeAnimator";

type AvatarSceneProps = {
  modelUrl?: string;
};

const DEFAULT_MODEL_URL = "/models/lobsterEdit.vrm";

export function AvatarScene({ modelUrl = DEFAULT_MODEL_URL }: AvatarSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vrmRef = useRef<VRM | undefined>(undefined);
  const warnedMissingMorphsRef = useRef(new Set<string>());
  const [status, setStatus] = useState("Loading avatar");

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let animationFrame = 0;
    let disposed = false;
    let currentVrm: VRM | undefined;
    let runtimeAnimator: VrmRuntimeAnimator | undefined;

    const scene = new Scene();
    scene.background = new Color("#15130f");

    const camera = new PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 1.2, 3);

    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = "srgb";
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
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

    const grid = new GridHelper(4, 20, "#3a362d", "#25211a");
    grid.position.y = -0.02;
    scene.add(grid);

    const resize = () => {
      const { clientWidth, clientHeight } = container;

      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / Math.max(clientHeight, 1);
      camera.updateProjectionMatrix();
    };

    const frameModel = (object: Object3D) => {
      const bounds = new Box3().setFromObject(object);
      const size = bounds.getSize(new Vector3());
      const center = bounds.getCenter(new Vector3());
      const maxAxis = Math.max(size.x, size.y, size.z);
      const scale = maxAxis > 0 ? 1.8 / maxAxis : 1;

      object.scale.setScalar(scale);
      object.position.sub(center.multiplyScalar(scale));
      object.position.y += size.y * scale * 0.5 - 0.05;

      controls.target.set(0, Math.max(0.75, size.y * scale * 0.45), 0);
      camera.position.set(0, controls.target.y + 0.25, 3);
      controls.update();
    };

    resize();
    window.addEventListener("resize", resize);
    const onLipSyncFrame = (event: Event) => {
      const frame = (event as CustomEvent<AvatarLipSyncFrame>).detail;
      runtimeAnimator?.setLipSyncFrame(frame);
    };
    window.addEventListener(avatarLipSyncEventName, onLipSyncFrame);

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) {
          return;
        }

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
      },
      undefined,
      () => {
        if (!disposed) {
          setStatus("Avatar failed to load");
        }
      }
    );

    const clock = new Clock();
    const animate = () => {
      const delta = clock.getDelta();

      controls.update();
      runtimeAnimator?.update(delta);
      currentVrm?.update(delta);
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener(avatarLipSyncEventName, onLipSyncFrame);
      runtimeAnimator?.dispose();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      vrmRef.current = undefined;
    };
  }, [modelUrl]);

  return (
    <div className="avatar-scene" ref={containerRef}>
      {status ? <div className="avatar-scene-status">{status}</div> : null}
    </div>
  );
}
