/**
 * Single 3D hexagonal prism — fixed background element.
 * Color smoothly lerps on section change. Reacts to cursor movement.
 */

import { Float } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/* ── Shared cursor state (avoids re-renders) ─────────────────── */

const cursor = { x: 0, y: 0 };

function useCursorTracker() {
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      cursor.x = (e.clientX / window.innerWidth) * 2 - 1;
      cursor.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
}

/* ── Cursor-reactive light ───────────────────────────────────── */

function CursorLight({ emissive }: { emissive: string }) {
  const lightRef = useRef<THREE.PointLight>(null);
  const targetColor = useRef(new THREE.Color(emissive));
  targetColor.current.set(emissive);

  useFrame((_, delta) => {
    if (!lightRef.current) return;
    // Light follows cursor with smooth lerp
    const tx = cursor.x * 4;
    const ty = cursor.y * 3;
    lightRef.current.position.x += (tx - lightRef.current.position.x) * delta * 4;
    lightRef.current.position.y += (ty - lightRef.current.position.y) * delta * 4;
    lightRef.current.color.lerp(targetColor.current, delta * 2.5);
  });

  return <pointLight ref={lightRef} position={[0, 0, 3]} intensity={0.6} distance={10} decay={2} color={emissive} />;
}

/* ── Hex Prism ───────────────────────────────────────────────── */

function HexPrism({ color, emissive }: { color: string; emissive: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const mainMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const glowMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const targetColor = useRef(new THREE.Color(color));
  const targetEmissive = useRef(new THREE.Color(emissive));
  targetColor.current.set(color);
  targetEmissive.current.set(emissive);

  const geometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 0.55, 6, 1), []);

  useFrame((_, delta) => {
    if (!meshRef.current || !glowRef.current) return;

    // Slow auto-rotation
    meshRef.current.rotation.y += delta * 0.12;
    glowRef.current.rotation.y += delta * 0.12;

    // Cursor-reactive tilt (subtle)
    const targetRotX = 0.4 + cursor.y * 0.15;
    const targetRotZ = cursor.x * -0.1;
    meshRef.current.rotation.x += (targetRotX - meshRef.current.rotation.x) * delta * 3;
    meshRef.current.rotation.z += (targetRotZ - meshRef.current.rotation.z) * delta * 3;
    glowRef.current.rotation.x = meshRef.current.rotation.x;
    glowRef.current.rotation.z = meshRef.current.rotation.z;

    // Smooth color transitions
    const speed = delta * 2.5;
    if (mainMatRef.current) {
      mainMatRef.current.color.lerp(targetColor.current, speed);
    }
    if (glowMatRef.current) {
      glowMatRef.current.color.lerp(targetEmissive.current, speed);
      glowMatRef.current.emissive.lerp(targetEmissive.current, speed);
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.15} floatIntensity={0.35} floatingRange={[-0.06, 0.06]}>
      <group>
        {/* Main prism — clearcoat glass */}
        <mesh ref={meshRef} geometry={geometry} rotation={[0.4, 0, 0]}>
          <meshPhysicalMaterial
            ref={mainMatRef}
            color={color}
            transparent
            opacity={0.5}
            roughness={0.08}
            metalness={0.2}
            clearcoat={1}
            clearcoatRoughness={0.05}
            envMapIntensity={0.8}
          />
        </mesh>

        {/* Inner glow */}
        <mesh ref={glowRef} geometry={geometry} scale={0.85} rotation={[0.4, 0, 0]}>
          <meshStandardMaterial
            ref={glowMatRef}
            color={emissive}
            emissive={emissive}
            emissiveIntensity={0.6}
            transparent
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Wireframe edges */}
        <mesh geometry={geometry} scale={1.003} rotation={[0.4, 0, 0]}>
          <meshBasicMaterial color="white" wireframe transparent opacity={0.07} />
        </mesh>
      </group>
    </Float>
  );
}

/* ── Rim Highlight (edge glow from cursor direction) ─────────── */

function RimHighlight({ emissive }: { emissive: string }) {
  const ref = useRef<THREE.SpotLight>(null);
  const targetColor = useRef(new THREE.Color(emissive));
  targetColor.current.set(emissive);

  useFrame((_, delta) => {
    if (!ref.current) return;
    // Spotlight moves opposite to cursor for rim-light effect
    ref.current.position.x += (-cursor.x * 5 - ref.current.position.x) * delta * 3;
    ref.current.position.y += (-cursor.y * 4 - ref.current.position.y) * delta * 3;
    ref.current.color.lerp(targetColor.current, delta * 2.5);
  });

  return (
    <spotLight
      ref={ref}
      position={[0, 0, 5]}
      intensity={0.4}
      angle={0.5}
      penumbra={1}
      distance={12}
      color={emissive}
      target-position={[0, 0, 0]}
    />
  );
}

/* ── Scene ───────────────────────────────────────────────────── */

export interface HexSceneProps {
  color: string;
  emissive: string;
  className?: string;
}

function SceneContent({ color, emissive }: { color: string; emissive: string }) {
  useCursorTracker();

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[3, 5, 4]} intensity={0.6} />
      <CursorLight emissive={emissive} />
      <RimHighlight emissive={emissive} />
      <HexPrism color={color} emissive={emissive} />
    </>
  );
}

export function HexScene({ color, emissive, className = "" }: HexSceneProps) {
  return (
    <div className={`pointer-events-none select-none ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 3.2], fov: 42 }}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        dpr={[1, 1.5]}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <SceneContent color={color} emissive={emissive} />
        </Suspense>
      </Canvas>
    </div>
  );
}
