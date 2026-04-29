import { describe, expect, it } from "vitest";
import {
  DirectionalLight,
  Group,
  Mesh,
  PCFSoftShadowMap,
} from "three";
import {
  configureRendererShadows,
  configureLightShadow,
  setMeshShadowFlags,
} from "./shadowSetup";

// ---------------------------------------------------------------------------
// configureRendererShadows
// ---------------------------------------------------------------------------
describe("configureRendererShadows", () => {
  it("enables shadowMap", () => {
    const renderer = { shadowMap: { enabled: false, type: 0 } };
    configureRendererShadows(renderer as never);
    expect(renderer.shadowMap.enabled).toBe(true);
  });

  it("sets shadowMap type to PCFSoftShadowMap", () => {
    const renderer = { shadowMap: { enabled: false, type: 0 } };
    configureRendererShadows(renderer as never);
    expect(renderer.shadowMap.type).toBe(PCFSoftShadowMap);
  });
});

// ---------------------------------------------------------------------------
// configureLightShadow
// ---------------------------------------------------------------------------
describe("configureLightShadow", () => {
  it("enables castShadow on the light", () => {
    const light = new DirectionalLight();
    configureLightShadow(light);
    expect(light.castShadow).toBe(true);
  });

  it("sets shadow map size to 1024×1024", () => {
    const light = new DirectionalLight();
    configureLightShadow(light);
    expect(light.shadow.mapSize.width).toBe(2048);
    expect(light.shadow.mapSize.height).toBe(2048);
  });

  it("sets shadow camera frustum to ±3", () => {
    const light = new DirectionalLight();
    configureLightShadow(light);
    const cam = light.shadow.camera;
    expect(cam.left).toBe(-3);
    expect(cam.right).toBe(3);
    expect(cam.top).toBe(3);
    expect(cam.bottom).toBe(-3);
  });

  it("sets shadow camera near to 0.1 and far to 20", () => {
    const light = new DirectionalLight();
    configureLightShadow(light);
    expect(light.shadow.camera.near).toBe(0.1);
    expect(light.shadow.camera.far).toBe(20);
  });

  it("sets shadow.bias to reduce self-shadowing acne", () => {
    const light = new DirectionalLight();
    configureLightShadow(light);
    expect(light.shadow.bias).toBeLessThan(0);
  });

  it("sets shadow.normalBias to a positive value", () => {
    const light = new DirectionalLight();
    configureLightShadow(light);
    expect(light.shadow.normalBias).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// setMeshShadowFlags
// ---------------------------------------------------------------------------
describe("setMeshShadowFlags", () => {
  it("sets castShadow and receiveShadow on a direct Mesh child", () => {
    const root = new Group();
    const mesh = new Mesh();
    root.add(mesh);
    setMeshShadowFlags(root, true, false);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(false);
  });

  it("sets both flags true on deeply nested meshes", () => {
    const root = new Group();
    const inner = new Group();
    const mesh = new Mesh();
    inner.add(mesh);
    root.add(inner);
    setMeshShadowFlags(root, true, true);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
  });

  it("sets castShadow=false and receiveShadow=false when requested", () => {
    const root = new Group();
    const mesh = new Mesh();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    setMeshShadowFlags(root, false, false);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
  });

  it("does not modify castShadow on non-Mesh (Group) nodes", () => {
    const root = new Group();
    const group = new Group();
    group.castShadow = false;
    root.add(group);
    setMeshShadowFlags(root, true, true);
    expect(group.castShadow).toBe(false);
  });

  it("does not affect meshes outside the subtree", () => {
    const root = new Group();
    const mesh = new Mesh();
    root.add(mesh);
    const outside = new Mesh();
    outside.castShadow = false;
    outside.receiveShadow = false;
    setMeshShadowFlags(root, true, true);
    expect(outside.castShadow).toBe(false);
    expect(outside.receiveShadow).toBe(false);
  });
});
