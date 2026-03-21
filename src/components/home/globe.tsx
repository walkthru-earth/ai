/**
 * Cinematic Earth globe — adapted from dataarts/webgl-globe.
 * Uses exact same coordinate conventions as the original.
 */

import { Stars, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { basePath } from "@/lib/utils";

/* ── Lat/lng → 3D (webgl-globe formula) ──────────────────────── */

export function latLngToVec3(lat: number, lng: number, radius = 1): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((180 - lng) * Math.PI) / 180;
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/* ── Shaders ─────────────────────────────────────────────────── */

const earthVertex = `
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vUv = uv;
  }
`;

const earthFragment = `
  uniform sampler2D uTexture;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vec3 diffuse = texture2D(uTexture, vUv).xyz;
    float intensity = 1.05 - dot(vNormal, vec3(0.0, 0.0, 1.0));
    vec3 atmosphere = vec3(0.3, 0.6, 1.0) * pow(intensity, 3.0);
    gl_FragColor = vec4(diffuse + atmosphere, uOpacity);
  }
`;

const atmosphereVertex = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// NOTE: must declare `varying vec3 vNormal` — previous version was missing this!
const atmosphereFragment = `
  varying vec3 vNormal;
  uniform float uOpacity;
  void main() {
    float intensity = pow(0.8 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 12.0);
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0) * intensity * uOpacity;
  }
`;

/* ── Globe ───────────────────────────────────────────────────── */

interface GlobeProps {
  lat?: number;
  lng?: number;
  zoomProgress: number;
  fadeProgress: number;
  accentColor?: string;
}

export function Globe({ lat, lng, zoomProgress, fadeProgress, accentColor = "#22d3ee" }: GlobeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const highlightRef = useRef<THREE.Mesh>(null);
  const loggedZoomRef = useRef(false);

  const earthMap = useTexture(`${basePath}/world.jpg`);

  // H3 highlight — raw latLngToVec3 output, NO extra rotation.
  // The mesh's rotation.y=PI aligns the texture with these coordinates
  // (same relationship as the original webgl-globe: points in scene space + mesh.rotation.y = PI).
  const userPos = useMemo(() => {
    if (lat == null || lng == null) return null;
    const pos = latLngToVec3(lat, lng, 1.02);
    console.log("[Globe] H3 position (raw, NO PI correction):", {
      lat,
      lng,
      pos: `(${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)})`,
    });
    return pos;
  }, [lat, lng]);

  // Globe rotation to face user's location toward camera (+Z).
  //
  // With mesh rotation.y = PI, the texture maps as:
  //   lng=90  → +Z (faces camera)
  //   lng=0   → -X
  //   lng=-90 → -Z (away from camera)
  //
  // To show any longitude L facing camera: rotate group by (90 - L) degrees.
  //   lng=90 → rotate 0°  (already at +Z) ✓
  //   lng=0  → rotate 90° (bring from -X to +Z) ✓
  //   lng=31 → rotate 59° ✓
  const targetRotY = useMemo(() => {
    if (lng == null) return 0;
    const angle = THREE.MathUtils.degToRad(90 - lng);
    console.log("[Globe] targetRotY:", { lng, formulaDeg: (90 - lng).toFixed(1), angleRad: angle.toFixed(4) });
    return angle;
  }, [lng]);

  const targetRotX = useMemo(() => {
    if (lat == null) return 0;
    // Tilt down to show user's latitude (negative because Y rotation tilts globe)
    const tilt = -THREE.MathUtils.degToRad(lat) * 0.35;
    console.log("[Globe] targetRotX:", { lat, tiltDeg: (-lat * 0.35).toFixed(1) });
    return tilt;
  }, [lat]);

  useEffect(() => {
    console.log("[Globe] Mounted:", { lat, lng, accentColor });
  }, [lat, lng, accentColor]);

  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 48, 32), []);
  const hexGeo = useMemo(() => new THREE.CylinderGeometry(0.08, 0.08, 0.015, 6, 1), []);

  const earthUniforms = useMemo(
    () => ({
      uTexture: { value: earthMap },
      uOpacity: { value: 1.0 },
    }),
    [earthMap],
  );

  const atmosphereUniforms = useMemo(() => ({ uOpacity: { value: 1.0 } }), []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    if (zoomProgress < 0.01) {
      // Idle rotation
      groupRef.current.rotation.y += delta * 0.08;
    } else {
      // Zoom: lerp to face user's location
      const speed = Math.min(delta * 2.5 * zoomProgress, 0.06);
      groupRef.current.rotation.y += (targetRotY - groupRef.current.rotation.y) * speed;
      groupRef.current.rotation.x += (targetRotX - groupRef.current.rotation.x) * speed;

      if (!loggedZoomRef.current && zoomProgress > 0.5) {
        loggedZoomRef.current = true;
        console.log("[Globe] Zoom halfway — rotation:", {
          x: groupRef.current.rotation.x.toFixed(3),
          y: groupRef.current.rotation.y.toFixed(3),
          targetY: targetRotY.toFixed(3),
          targetX: targetRotX.toFixed(3),
        });
      }
    }

    // Opacity
    const opacity = Math.max(0, 1 - fadeProgress);
    earthUniforms.uOpacity.value = opacity;
    atmosphereUniforms.uOpacity.value = opacity;

    // H3 highlight
    if (highlightRef.current) {
      const visible = zoomProgress > 0.2 && fadeProgress < 0.8;
      highlightRef.current.visible = visible;
      if (visible) {
        const pulse = 1 + Math.sin(Date.now() * 0.004) * 0.3;
        highlightRef.current.scale.setScalar(pulse * Math.min(zoomProgress * 2, 1));
        highlightRef.current.lookAt(0, 0, 0);
        highlightRef.current.rotateX(Math.PI / 2);
      }
    }
  });

  if (fadeProgress >= 1) return null;

  return (
    <>
      <Stars radius={80} depth={50} count={3000} factor={3} saturation={0} fade speed={0.3} />

      <group ref={groupRef}>
        {/* Earth — mesh rotation.y=PI aligns texture with latLngToVec3 coordinates */}
        <mesh geometry={sphereGeo} rotation={[0, Math.PI, 0]}>
          <shaderMaterial
            vertexShader={earthVertex}
            fragmentShader={earthFragment}
            uniforms={earthUniforms}
            transparent
          />
        </mesh>

        {/* H3 cell highlight — bright white hex + colored glow ring */}
        {userPos && (
          <>
            <mesh ref={highlightRef} geometry={hexGeo} position={userPos} visible={false}>
              <meshBasicMaterial color="#ffffff" transparent opacity={1} toneMapped={false} />
            </mesh>
            <mesh position={userPos} scale={1.8}>
              <ringGeometry args={[0.06, 0.1, 6]} />
              <meshBasicMaterial
                color={accentColor}
                transparent
                opacity={0.9}
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            </mesh>
          </>
        )}

        {/* Atmosphere — BackSide + AdditiveBlending */}
        <mesh geometry={sphereGeo} scale={1.1}>
          <shaderMaterial
            vertexShader={atmosphereVertex}
            fragmentShader={atmosphereFragment}
            uniforms={atmosphereUniforms}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            transparent
          />
        </mesh>
      </group>
    </>
  );
}
