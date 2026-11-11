import { useEffect, useRef } from "react";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Model } from "./core/types";
export default function Preview3D({ model }: { model: Model }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0, 0);
    el.appendChild(renderer.domElement);
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(35, 1, 0.1, 1000);
    camera.position.set(100, 150, 220);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 160;
    controls.maxDistance = 430;
    const group = new T.Group();
    group.rotation.set(Math.PI, 0, 0);
    scene.add(group);
    for (const mesh of model.meshes) {
      const g = new T.BufferGeometry();
      g.setAttribute(
        "position",
        new T.Float32BufferAttribute(mesh.vertices.flat(), 3),
      );
      g.setIndex(mesh.triangles.flat());
      g.computeVertexNormals();
      const material = new T.MeshStandardMaterial({
        color: mesh.colour,
        roughness: 0.85,
        metalness: 0,
        flatShading: true,
      });
      group.add(new T.Mesh(g, material));
    }
    scene.add(new T.HemisphereLight(0xffffff, 0x8b96a1, 3));
    const light = new T.DirectionalLight(0xffffff, 3);
    light.position.set(-80, 100, 180);
    scene.add(light);
    const size = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const obs = new ResizeObserver(size);
    obs.observe(el);
    size();
    let frame = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      cancelAnimationFrame(frame);
      obs.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof T.Mesh) {
          o.geometry.dispose();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [model]);
  return (
    <div
      className="three-preview"
      ref={host}
      aria-label="Rotate the card to inspect its flat face and thickness"
    />
  );
}
