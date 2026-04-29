import { Mesh, PCFSoftShadowMap } from "three";
import type { DirectionalLight, Object3D, WebGLRenderer } from "three";

export function configureRendererShadows(renderer: WebGLRenderer): void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
}

export function configureLightShadow(light: DirectionalLight): void {
  light.castShadow = true;
  light.shadow.mapSize.width = 2048;
  light.shadow.mapSize.height = 2048;
  light.shadow.camera.left = -3;
  light.shadow.camera.right = 3;
  light.shadow.camera.top = 3;
  light.shadow.camera.bottom = -3;
  light.shadow.camera.near = 0.1;
  light.shadow.camera.far = 20;
  // Negative bias pulls the shadow receiver surface away from the shadow map
  // depth, preventing self-shadowing acne on flat/low-angle geometry.
  light.shadow.bias = -0.003;
  // Normal-bias offsets the shadow origin along the surface normal, reducing
  // acne on curved surfaces (lobster body, alcove curved walls).
  light.shadow.normalBias = 0.02;
}

export function setMeshShadowFlags(
  root: Object3D,
  cast: boolean,
  receive: boolean
): void {
  root.traverse((obj) => {
    if (obj instanceof Mesh) {
      obj.castShadow = cast;
      obj.receiveShadow = receive;
    }
  });
}
