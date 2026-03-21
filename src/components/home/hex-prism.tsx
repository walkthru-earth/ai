/**
 * 3D hexagonal prism that extracts from the globe surface.
 * Cursor-reactive, color-transitioning, bloom-ready.
 */

import { Float } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { latLngToVec3 } from "./globe";

/* ── Shared cursor state ─────────────────────────────────────── */

const cursor = { x: 0, y: 0 };

export function useCursorTracker() {
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      cursor.x = (e.clientX / window.innerWidth) * 2 - 1;
      cursor.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
}

/* ── Hex Prism ───────────────────────────────────────────────── */

interface HexPrismProps {
  /** Color of the hex surface */
  color: string;
  /** Emissive glow color */
  emissive: string;
  /** User latitude for surface position */
  lat?: number;
  /** User longitude for surface position */
  lng?: number;
  /** 0 = on globe surface (invisible), 1 = fully extracted at center */
  extractionProgress: number;
  /** Whether the hex is visible */
  visible?: boolean;
}

export function HexPrism({ color, emissive, lat, lng, extractionProgress, visible = true }: HexPrismProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const mainMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const glowMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const targetColor = useRef(new THREE.Color(color));
  const targetEmissive = useRef(new THREE.Color(emissive));
  targetColor.current.set(color);
  targetEmissive.current.set(emissive);

  // Globe surface position
  const surfacePos = useMemo(() => {
    if (lat == null || lng == null) return new THREE.Vector3(0, 0, 1.1);
    return latLngToVec3(lat, lng, 1.1);
  }, [lat, lng]);

  const centerPos = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  const geometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 0.55, 6, 1), []);

  useFrame((_, delta) => {
    if (!groupRef.current || !visible) return;

    // Eased extraction progress
    const eased =
      extractionProgress < 0.5
        ? 4 * extractionProgress * extractionProgress * extractionProgress
        : 1 - (-2 * extractionProgress + 2) ** 3 / 2;

    // Position: lerp from surface to center
    groupRef.current.position.lerpVectors(surfacePos, centerPos, eased);

    // Scale: tiny on surface → full size at center
    const scale = THREE.MathUtils.lerp(0.05, 1, eased);
    groupRef.current.scale.setScalar(scale);

    // Rotation: auto-spin + cursor tilt
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.12;
      const tiltX = 0.4 + cursor.y * 0.15;
      const tiltZ = cursor.x * -0.1;
      meshRef.current.rotation.x += (tiltX - meshRef.current.rotation.x) * delta * 3;
      meshRef.current.rotation.z += (tiltZ - meshRef.current.rotation.z) * delta * 3;
    }
    if (glowRef.current && meshRef.current) {
      glowRef.current.rotation.copy(meshRef.current.rotation);
    }

    // Color lerp
    const speed = delta * 2.5;
    if (mainMatRef.current) mainMatRef.current.color.lerp(targetColor.current, speed);
    if (glowMatRef.current) {
      glowMatRef.current.color.lerp(targetEmissive.current, speed);
      glowMatRef.current.emissive.lerp(targetEmissive.current, speed);
    }
  });

  if (!visible || extractionProgress <= 0) return null;

  return (
    <group ref={groupRef}>
      <Float speed={1.5} rotationIntensity={0.1} floatIntensity={0.3} floatingRange={[-0.04, 0.04]}>
        {/* Main glass prism — brighter for visibility */}
        <mesh ref={meshRef} geometry={geometry} rotation={[0.4, 0, 0]}>
          <meshPhysicalMaterial
            ref={mainMatRef}
            color={color}
            transparent
            opacity={0.7}
            roughness={0.05}
            metalness={0.2}
            clearcoat={1}
            clearcoatRoughness={0.05}
            envMapIntensity={0.8}
          />
        </mesh>

        {/* Inner glow (bloom trigger: emissiveIntensity > 1) */}
        <mesh ref={glowRef} geometry={geometry} scale={0.85} rotation={[0.4, 0, 0]}>
          <meshStandardMaterial
            ref={glowMatRef}
            color={emissive}
            emissive={emissive}
            emissiveIntensity={3}
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>

        {/* Wireframe */}
        <mesh geometry={geometry} scale={1.004} rotation={[0.4, 0, 0]}>
          <meshBasicMaterial color="white" wireframe transparent opacity={0.06} />
        </mesh>
      </Float>
    </group>
  );
}

/* ── Cursor-following light ──────────────────────────────────── */

export function CursorLight({ emissive }: { emissive: string }) {
  const lightRef = useRef<THREE.PointLight>(null);
  const targetColor = useRef(new THREE.Color(emissive));
  targetColor.current.set(emissive);

  useFrame((_, delta) => {
    if (!lightRef.current) return;
    lightRef.current.position.x += (cursor.x * 4 - lightRef.current.position.x) * delta * 4;
    lightRef.current.position.y += (cursor.y * 3 - lightRef.current.position.y) * delta * 4;
    lightRef.current.color.lerp(targetColor.current, delta * 2.5);
  });

  return <pointLight ref={lightRef} position={[0, 0, 3]} intensity={0.5} distance={10} decay={2} color={emissive} />;
}
