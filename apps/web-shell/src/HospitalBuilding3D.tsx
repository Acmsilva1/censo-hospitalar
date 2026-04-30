import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { memo, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

type Band = 'low' | 'mid' | 'high';

export type BuildingFloor3D = {
  id: string;
  label: string;
  pct: number;
  occupied: number;
  free: number;
  band: Band;
};

type Props = {
  floors: BuildingFloor3D[];
  onSelectFloor: (id: string) => void;
  selectedFloorId?: string;
  unitName?: string;
};

type HoverInfo = {
  floor: BuildingFloor3D;
  y: number;
  sx: number;
  sy: number;
};

// Ajustes rápidos de cena (edite aqui)
const SCENE_TUNE = {
  building: {
    position: [0.55, 0, 0.28] as [number, number, number],
    rotationY: -0.18,
    modelOffset: [0.25, -0.3, 0.08] as [number, number, number],
    modelRotationY: -0.14,
    modelScale: 2.32,
    floorStep: 0.88,
  },
  marker: {
    x: 2.15,
    z: 0.56,
    scale: 0.36,
    railX: 2.02,
    railZ: 0.1,
  },
  sign: {
    position: [2.05, -2.08, 3.85] as [number, number, number],
    rotationY: -0.08,
    labelScale: 0.54,
  },
};
const USE_IMPORTED_MODEL = false;

function extractFloorNumber(label: string) {
  const m = label.match(/^(\d+)/);
  return m?.[1] || '?';
}

function SceneLabel({
  text,
  position,
  scale = 1,
  bg = '#10293fdd',
  fg = '#ffffff',
}: {
  text: string;
  position: [number, number, number];
  scale?: number;
  bg?: string;
  fg?: string;
}) {
  const material = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = bg;
      ctx.strokeStyle = '#8fdfff';
      ctx.lineWidth = 6;
      const r = 20;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(canvas.width - r, 0);
      ctx.quadraticCurveTo(canvas.width, 0, canvas.width, r);
      ctx.lineTo(canvas.width, canvas.height - r);
      ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - r, canvas.height);
      ctx.lineTo(r, canvas.height);
      ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.font = '700 42px Manrope, Segoe UI, sans-serif';
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false });
  }, [bg, fg, text]);

  return <sprite position={position} scale={[2.8 * scale, 0.7 * scale, 1]} material={material} />;
}

function PlainTextLabel({
  text,
  position,
  scale = 1,
  color = '#0a5a28',
}: {
  text: string;
  position: [number, number, number];
  scale?: number;
  color?: string;
}) {
  const material = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = '800 46px Manrope, Segoe UI, sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false });
  }, [color, text]);

  return <sprite position={position} scale={[2.4 * scale, 0.55 * scale, 1]} material={material} />;
}

function getUnitShortName(unitName?: string) {
  const t = (unitName || '').toUpperCase();
  if (t.includes('VILA VELHA') || t.includes('PS VV')) return 'Vila Velha';
  if (t.includes('VITORIA')) return 'Vitoria';
  if (t.includes('GUTIERREZ')) return 'Gutierrez';
  if (t.includes('PAMPULHA')) return 'Pampulha';
  if (t.includes('BARRA DA TIJUCA')) return 'Barra';
  if (t.includes('BOTAFOGO')) return 'Botafogo';
  if (t.includes('CAMPO GRANDE')) return 'Campo Grande';
  if (t.includes('TAGUATINGA')) return 'Taguatinga';
  if (t.includes('SIG')) return 'SIG';
  return 'Unidade';
}

function UnitSign({ unitName }: { unitName?: string }) {
  const shortName = getUnitShortName(unitName);
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (!groupRef.current) return;
    const target = new THREE.Vector3(camera.position.x, groupRef.current.position.y, camera.position.z);
    groupRef.current.lookAt(target);
  });

  const faceMaterial = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // base transparent
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // frame
      ctx.fillStyle = '#123c2b';
      ctx.beginPath();
      const r0 = 110;
      ctx.moveTo(r0, 70);
      ctx.lineTo(canvas.width - r0, 70);
      ctx.quadraticCurveTo(canvas.width - 70, 70, canvas.width - 70, r0);
      ctx.lineTo(canvas.width - 70, canvas.height - r0);
      ctx.quadraticCurveTo(canvas.width - 70, canvas.height - 70, canvas.width - r0, canvas.height - 70);
      ctx.lineTo(r0, canvas.height - 70);
      ctx.quadraticCurveTo(70, canvas.height - 70, 70, canvas.height - r0);
      ctx.lineTo(70, r0);
      ctx.quadraticCurveTo(70, 70, r0, 70);
      ctx.closePath();
      ctx.fill();

      // inner panel
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      const r1 = 92;
      ctx.moveTo(r1, 98);
      ctx.lineTo(canvas.width - r1, 98);
      ctx.quadraticCurveTo(canvas.width - 98, 98, canvas.width - 98, r1);
      ctx.lineTo(canvas.width - 98, canvas.height - r1);
      ctx.quadraticCurveTo(canvas.width - 98, canvas.height - 98, canvas.width - r1, canvas.height - 98);
      ctx.lineTo(r1, canvas.height - 98);
      ctx.quadraticCurveTo(98, canvas.height - 98, 98, canvas.height - r1);
      ctx.lineTo(98, r1);
      ctx.quadraticCurveTo(98, 98, r1, 98);
      ctx.closePath();
      ctx.fill();

      // top accent + icon area
      ctx.fillStyle = '#dff2e7';
      ctx.fillRect(170, 165, 684, 120);
      ctx.fillStyle = '#0f8a38';
      ctx.beginPath();
      ctx.arc(512, 225, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(497, 226);
      ctx.lineTo(509, 240);
      ctx.lineTo(530, 211);
      ctx.stroke();

      // text
      ctx.fillStyle = '#0a1f14';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '1000 82px Manrope, Segoe UI, sans-serif';
      ctx.fillText('Medsenior', canvas.width / 2, 420);
      ctx.font = '1000 98px Manrope, Segoe UI, sans-serif';
      ctx.fillText(shortName, canvas.width / 2, 555);

      // subtle bottom glow line
      ctx.fillStyle = '#cdecd9';
      ctx.fillRect(185, 735, 654, 16);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.08,
      side: THREE.DoubleSide,
      roughness: 0.3,
      metalness: 0.12,
    });
  }, [shortName]);

  return (
    <group ref={groupRef} position={[-2.2, -2.08, 3.35]}>
      <mesh position={[0, 0.56, 0]}>
        <planeGeometry args={[1.22, 1.42]} />
        <primitive object={faceMaterial} attach="material" />
      </mesh>
      <mesh position={[0, -0.11, -0.03]}>
        <boxGeometry args={[0.76, 0.11, 0.28]} />
        <meshStandardMaterial color="#1d2b38" roughness={0.7} metalness={0.08} />
      </mesh>
    </group>
  );
}
function ImportedBuilding() {
  const gltf = useLoader(GLTFLoader, '/models/predio.glb', (loader) => {
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    loader.setDRACOLoader(draco);
  });
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  return (
    <group
      position={SCENE_TUNE.building.modelOffset}
      rotation={[0, SCENE_TUNE.building.modelRotationY, 0]}
      scale={[SCENE_TUNE.building.modelScale, SCENE_TUNE.building.modelScale, SCENE_TUNE.building.modelScale]}
    >
      <primitive object={scene} />
    </group>
  );
}

function ProceduralHospital({ floorsCount }: { floorsCount: number }) {
  const levels = Math.max(1, floorsCount);
  const baseY = -0.72;
  return (
    <group position={[0.1, 0.14, 0.02]}>
      {/* Fundação alinhada ao solo */}
      <mesh position={[0.12, baseY, -0.04]}>
        <boxGeometry args={[5.3, 0.28, 2.72]} />
        <meshStandardMaterial color="#9eb3c1" roughness={0.84} metalness={0.02} />
      </mesh>
      <mesh position={[0.14, baseY + 0.18, -0.06]}>
        <boxGeometry args={[5.05, 0.08, 2.5]} />
        <meshStandardMaterial color="#8ea4b4" roughness={0.8} metalness={0.02} />
      </mesh>
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[5.5, 0.34, 3.0]} />
        <meshStandardMaterial color="#a7b2bc" roughness={0.72} metalness={0.06} />
      </mesh>

      {/* Portaria frontal */}
      <mesh position={[0.05, -0.45, 1.58]}>
        <boxGeometry args={[2.4, 0.22, 0.28]} />
        <meshStandardMaterial color="#adb8c2" roughness={0.34} metalness={0.12} />
      </mesh>
      <mesh position={[0.05, -0.62, 1.64]}>
        <boxGeometry args={[2.05, 0.4, 0.09]} />
        <meshStandardMaterial color="#0a2033" emissive="#0a2033" emissiveIntensity={0.22} roughness={0.18} metalness={0.32} />
      </mesh>
      <mesh position={[0.05, -0.62, 1.69]}>
        <boxGeometry args={[1.1, 0.24, 0.03]} />
        <meshStandardMaterial color="#d8eaf7" roughness={0.16} metalness={0.42} />
      </mesh>
      <mesh position={[-0.26, -0.62, 1.72]}>
        <boxGeometry args={[0.34, 0.24, 0.02]} />
        <meshStandardMaterial color="#c2ccd5" roughness={0.18} metalness={0.45} />
      </mesh>
      <mesh position={[0.36, -0.62, 1.72]}>
        <boxGeometry args={[0.34, 0.24, 0.02]} />
        <meshStandardMaterial color="#c2ccd5" roughness={0.18} metalness={0.45} />
      </mesh>
      <mesh position={[0.05, -0.78, 1.48]}>
        <boxGeometry args={[1.9, 0.06, 0.72]} />
        <meshStandardMaterial color="#c8d7e2" roughness={0.86} metalness={0.03} />
      </mesh>
      <mesh position={[0.05, -0.75, 1.82]}>
        <boxGeometry args={[1.25, 0.03, 0.28]} />
        <meshStandardMaterial color="#e6eff6" roughness={0.82} metalness={0.04} />
      </mesh>

      {Array.from({ length: levels }).map((_, i) => {
        const y = i * 0.88 + 0.3;
        const isTopLevel = i === levels - 1;
        return (
          <group key={`level-${i}`} position={[0, y, 0]}>
            {/* Laje branca */}
            <mesh position={[0, 0.34, 0]}>
              <boxGeometry args={[5.42, 0.1, 2.97]} />
              <meshStandardMaterial
                color={isTopLevel ? '#0a0d12' : '#b4bec8'}
                emissive={isTopLevel ? '#0a0d12' : '#000000'}
                emissiveIntensity={isTopLevel ? 0.25 : 0}
                roughness={isTopLevel ? 0.62 : 0.34}
                metalness={isTopLevel ? 0.08 : 0.12}
              />
            </mesh>
            <mesh position={[0, 0.27, 0]}>
              <boxGeometry args={[5.24, 0.08, 2.82]} />
              <meshStandardMaterial
                color={isTopLevel ? '#121821' : '#9ca8b3'}
                roughness={isTopLevel ? 0.7 : 0.4}
                metalness={isTopLevel ? 0.04 : 0.08}
              />
            </mesh>
            {/* Faixa de vidro frontal */}
            <mesh position={[0, 0.02, 1.37]}>
              <boxGeometry args={[5.02, 0.52, 0.06]} />
              <meshStandardMaterial color="#0f4f7a" emissive="#0c416a" emissiveIntensity={0.24} roughness={0.12} metalness={0.45} />
            </mesh>
            {/* Faixa de vidro lateral */}
            <mesh position={[2.47, 0.02, 0]} rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={[2.55, 0.52, 0.06]} />
              <meshStandardMaterial color="#0f4f7a" emissive="#0c416a" emissiveIntensity={0.22} roughness={0.12} metalness={0.45} />
            </mesh>
            {/* Pilares frontais */}
            {[-2.15, -0.72, 0.72, 2.15].map((x) => (
              <mesh key={`pillar-${i}-${x}`} position={[x, 0.02, 1.32]}>
                <boxGeometry args={[0.08, 0.52, 0.12]} />
                <meshStandardMaterial color="#aab4bf" roughness={0.4} metalness={0.12} />
              </mesh>
            ))}
            {/* Montantes de vidro para realismo */}
            {[-2.2, -1.5, -0.8, -0.1, 0.6, 1.3, 2.0].map((x) => (
              <mesh key={`mullion-f-${i}-${x}`} position={[x, 0.02, 1.39]}>
                <boxGeometry args={[0.03, 0.5, 0.02]} />
                <meshStandardMaterial color="#c4d6e2" roughness={0.25} metalness={0.35} />
              </mesh>
            ))}
            {[-0.9, -0.2, 0.5].map((z) => (
              <mesh key={`mullion-s-${i}-${z}`} position={[2.49, 0.02, z]} rotation={[0, Math.PI / 2, 0]}>
                <boxGeometry args={[0.03, 0.5, 0.02]} />
                <meshStandardMaterial color="#c4d6e2" roughness={0.25} metalness={0.35} />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* Cobertura integrada ao último pavimento */}
      <mesh position={[0, levels * 0.88 + 0.39, 0]}>
        <boxGeometry args={[5.44, 0.1, 2.98]} />
        <meshStandardMaterial color="#edf4fa" roughness={0.32} metalness={0.14} />
      </mesh>
      <mesh position={[0.08, levels * 0.88 + 0.45, -0.04]}>
        <boxGeometry args={[4.9, 0.03, 2.5]} />
        <meshStandardMaterial color="#d6e2eb" roughness={0.42} metalness={0.08} />
      </mesh>

      {/* Colunas da cobertura para evitar efeito de peça solta */}
      {[
        [-2.25, 0, 1.18],
        [-0.75, 0, 1.18],
        [0.75, 0, 1.18],
        [2.25, 0, 1.18],
        [-2.25, 0, -1.18],
        [-0.75, 0, -1.18],
        [0.75, 0, -1.18],
        [2.25, 0, -1.18],
      ].map((p, idx) => (
        <mesh key={`roof-col-${idx}`} position={[p[0], levels * 0.88 + 0.17, p[2]]}>
          <boxGeometry args={[0.08, 0.48, 0.08]} />
          <meshStandardMaterial color="#dce7ef" roughness={0.36} metalness={0.18} />
        </mesh>
      ))}
      {[
        [-2.25, 0, 1.18],
        [-0.75, 0, 1.18],
        [0.75, 0, 1.18],
        [2.25, 0, 1.18],
        [-2.25, 0, -1.18],
        [-0.75, 0, -1.18],
        [0.75, 0, -1.18],
        [2.25, 0, -1.18],
      ].map((p, idx) => (
        <mesh key={`roof-cap-${idx}`} position={[p[0], levels * 0.88 + 0.305, p[2]]}>
          <boxGeometry args={[0.2, 0.05, 0.2]} />
          <meshStandardMaterial color="#020406" emissive="#020406" emissiveIntensity={0.25} roughness={0.82} metalness={0.04} />
        </mesh>
      ))}
      {[
        [-2.25, 0, 1.18],
        [-0.75, 0, 1.18],
        [0.75, 0, 1.18],
        [2.25, 0, 1.18],
        [-2.25, 0, -1.18],
        [-0.75, 0, -1.18],
        [0.75, 0, -1.18],
        [2.25, 0, -1.18],
      ].map((p, idx) => (
        <mesh key={`roof-ring-${idx}`} position={[p[0], levels * 0.88 + 0.21, p[2]]}>
          <boxGeometry args={[0.14, 0.08, 0.14]} />
          <meshStandardMaterial color="#000000" emissive="#000000" emissiveIntensity={0.38} roughness={0.9} metalness={0.02} />
        </mesh>
      ))}

    </group>
  );
}

function FloorMarker({
  floor,
  y,
  onSelect,
  selected,
  onHoverStart,
  onHoverEnd,
  floorNumber,
}: {
  floor: BuildingFloor3D;
  y: number;
  onSelect: (id: string) => void;
  selected: boolean;
  onHoverStart: (floor: BuildingFloor3D, y: number, sx: number, sy: number) => void;
  onHoverEnd: () => void;
  floorNumber: number;
}) {
  const pulseRef = useRef<THREE.Mesh>(null);
  const isFirstFloor = floorNumber === 1;
  const markerY = isFirstFloor ? 0.1 : 0.02;

  useFrame((state) => {
    if (!pulseRef.current) return;
    const t = state.clock.elapsedTime;
    const wave = 0.6 + (Math.sin(t * 2.8) + 1) * 0.25;
    pulseRef.current.scale.setScalar(wave);
  });

  return (
    <group
      position={[0, y, 0]}
      onClick={(e) => { e.stopPropagation(); onSelect(floor.id); }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHoverStart(floor, y, e.clientX, e.clientY);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHoverEnd();
      }}
    >
      <mesh position={[SCENE_TUNE.marker.railX + 0.02, markerY, 1.39]}>
        <boxGeometry args={[0.06, 0.16, 0.26]} />
        <meshStandardMaterial color={selected ? '#8fdfff' : '#3c7da3'} emissive={selected ? '#8fdfff' : '#000000'} emissiveIntensity={selected ? 0.16 : 0} />
      </mesh>
      <mesh position={[SCENE_TUNE.marker.railX + 0.1, markerY, 1.38]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial
          color={selected ? '#ffe56a' : '#ffd34d'}
          emissive={selected ? '#ffe56a' : '#ffcc33'}
          emissiveIntensity={selected ? 1.05 : 0.75}
        />
      </mesh>
      <mesh ref={pulseRef} position={[SCENE_TUNE.marker.railX + 0.1, markerY, 1.38]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#ffe56a" emissive="#ffd43b" emissiveIntensity={1.3} transparent opacity={0.28} />
      </mesh>
      <mesh
        position={[SCENE_TUNE.marker.railX + 0.1, markerY, 1.38]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(floor.id);
        }}
      >
        <sphereGeometry args={[0.22, 14, 14]} />
        <meshBasicMaterial transparent opacity={0.01} depthWrite={false} />
      </mesh>
      {floorNumber > 1 && <Digit3D number={floorNumber} position={[SCENE_TUNE.marker.railX - 0.24, markerY + 0.01, 1.39]} />}
    </group>
  );
}

function Digit3D({ number, position }: { number: number; position: [number, number, number] }) {
  const n = Math.max(1, Math.min(9, number));
  const segmentsByDigit: Record<number, string[]> = {
    1: ['tr', 'br'],
    2: ['t', 'tr', 'm', 'bl', 'b'],
    3: ['t', 'tr', 'm', 'br', 'b'],
    4: ['tl', 'tr', 'm', 'br'],
    5: ['t', 'tl', 'm', 'br', 'b'],
    6: ['t', 'tl', 'm', 'bl', 'br', 'b'],
    7: ['t', 'tr', 'br'],
    8: ['t', 'tl', 'tr', 'm', 'bl', 'br', 'b'],
    9: ['t', 'tl', 'tr', 'm', 'br', 'b'],
  };
  const on = new Set(segmentsByDigit[n] || segmentsByDigit[1]);
  const seg = {
    t: { p: [0, 0.06, 0], s: [0.12, 0.02, 0.02] },
    m: { p: [0, 0, 0], s: [0.12, 0.02, 0.02] },
    b: { p: [0, -0.06, 0], s: [0.12, 0.02, 0.02] },
    tl: { p: [-0.05, 0.03, 0], s: [0.02, 0.06, 0.02] },
    tr: { p: [0.05, 0.03, 0], s: [0.02, 0.06, 0.02] },
    bl: { p: [-0.05, -0.03, 0], s: [0.02, 0.06, 0.02] },
    br: { p: [0.05, -0.03, 0], s: [0.02, 0.06, 0.02] },
  } as const;

  return (
    <group position={position}>
      <mesh position={[0, 0, -0.002]}>
        <boxGeometry args={[0.16, 0.16, 0.02]} />
        <meshStandardMaterial color="#1b7fb1" emissive="#0f4765" emissiveIntensity={0.25} />
      </mesh>
      {Object.entries(seg).map(([k, v]) =>
        on.has(k) ? (
          <mesh key={k} position={v.p as [number, number, number]}>
            <boxGeometry args={v.s as [number, number, number]} />
            <meshStandardMaterial color="#ffffff" emissive="#bfeaff" emissiveIntensity={0.35} />
          </mesh>
        ) : null
      )}
    </group>
  );
}

function TreeLowPoly({ x, y, z, scale = 1 }: { x: number; y: number; z: number; scale?: number }) {
  return (
    <group position={[x, y, z]} scale={scale}>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.07, 0.1, 0.7, 8]} />
        <meshStandardMaterial color="#6b4b2e" />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <sphereGeometry args={[0.36, 12, 12]} />
        <meshStandardMaterial color="#4f8e67" />
      </mesh>
    </group>
  );
}

function CarLowPoly({
  x,
  y,
  z,
  color,
  rotY = 0,
}: {
  x: number;
  y: number;
  z: number;
  color: string;
  rotY?: number;
}) {
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.09, 0]}>
        <boxGeometry args={[1.08, 0.16, 0.56]} />
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.22} />
      </mesh>
      <mesh position={[0.05, 0.2, 0]}>
        <boxGeometry args={[0.56, 0.16, 0.46]} />
        <meshStandardMaterial color="#dbeafe" roughness={0.15} metalness={0.35} />
      </mesh>
      <mesh position={[-0.44, 0.1, 0]}>
        <boxGeometry args={[0.12, 0.12, 0.52]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0.44, 0.1, 0]}>
        <boxGeometry args={[0.12, 0.12, 0.52]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      {[
        [-0.34, 0.03, -0.21],
        [0.34, 0.03, -0.21],
        [-0.34, 0.03, 0.21],
        [0.34, 0.03, 0.21],
      ].map((w, wi) => (
        <mesh key={`wheel-${x}-${z}-${wi}`} position={[w[0], w[1], w[2]]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.06, 12]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      ))}
    </group>
  );
}

export const HospitalBuilding3D = memo(function HospitalBuilding3D({ floors, onSelectFloor, selectedFloorId, unitName }: Props) {
  const ordered = [...floors];
  const offset = (ordered.length - 1) * (SCENE_TUNE.building.floorStep / 2);
  const totalHeight = (Math.max(1, ordered.length) - 1) * SCENE_TUNE.building.floorStep;
  const [hoveredFloor, setHoveredFloor] = useState<HoverInfo | null>(null);
  const hoverHideTimer = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  function showTooltip(floor: BuildingFloor3D, y: number, clientX: number, clientY: number) {
    if (hoverHideTimer.current) {
      window.clearTimeout(hoverHideTimer.current);
      hoverHideTimer.current = null;
    }
    const rect = wrapRef.current?.getBoundingClientRect();
    const sx = rect ? clientX - rect.left : 0;
    const sy = rect ? clientY - rect.top : 0;
    setHoveredFloor({ floor, y, sx, sy });
  }

  function hideTooltipDelayed() {
    if (hoverHideTimer.current) window.clearTimeout(hoverHideTimer.current);
    hoverHideTimer.current = window.setTimeout(() => {
      setHoveredFloor(null);
      hoverHideTimer.current = null;
    }, 180);
  }

  return (
    <div className="vh-canvas-wrap" ref={wrapRef}>
      <Canvas camera={{ position: [8.3, 4.9, 7.2], fov: 34 }}>
        <color attach="background" args={['#6ea9d0']} />
        <fog attach="fog" args={['#6ea9d0', 16, 42]} />
        <ambientLight intensity={1.05} />
        <directionalLight position={[10, 16, 8]} intensity={1.55} />
        <pointLight position={[-7, 5, 6]} color="#d5f3ff" intensity={1.1} />
        <pointLight position={[7, 3, -6]} color="#a9d4ff" intensity={0.8} />
        <hemisphereLight args={['#e7f7ff', '#5d89aa', 0.6]} />
        <pointLight position={[3.2, 1.8, 2.4]} color="#8fdfff" intensity={0.35} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.45, 0]}>
          <planeGeometry args={[56, 56]} />
          <meshStandardMaterial color="#7ba9c6" roughness={0.94} metalness={0.02} />
        </mesh>

        <mesh position={[0, 8.5, -18]}>
          <sphereGeometry args={[20, 32, 32]} />
          <meshStandardMaterial color="#8bc3e8" emissive="#8bc3e8" emissiveIntensity={0.12} side={1} />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.6, -2.437, 0.4]}>
          <planeGeometry args={[13.6, 11.6]} />
          <meshStandardMaterial color="#c3d4df" />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.6, -2.435, 0.4]}>
          <planeGeometry args={[11.0, 9.0]} />
          <meshStandardMaterial color="#9bb8cc" />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.6, -2.434, 0.4]}>
          <planeGeometry args={[10.2, 8.2]} />
          <meshStandardMaterial color="#b8cad8" />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.6, -2.43, -7.8]}>
          <planeGeometry args={[36, 3.0]} />
          <meshStandardMaterial color="#4f6f84" />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[9.4, -2.43, 0.8]}>
          <planeGeometry args={[3.0, 29]} />
          <meshStandardMaterial color="#516f83" />
        </mesh>

        <CarLowPoly x={8.5} y={-2.08} z={-6.2} color="#e35d6a" />
        <CarLowPoly x={10.2} y={-2.08} z={4.2} color="#4ea6ff" rotY={Math.PI / 2} />
        <CarLowPoly x={-5.9} y={-2.08} z={-0.1} color="#ffd166" rotY={Math.PI / 2} />
        <CarLowPoly x={-5.9} y={-2.08} z={2.7} color="#5dd39e" rotY={Math.PI / 2} />

        <TreeLowPoly x={-3.35} y={-2.05} z={1.75} />
        <TreeLowPoly x={14} y={-2.05} z={5} />
        <TreeLowPoly x={13} y={-2.05} z={-2} />
        <UnitSign unitName={unitName} />

        {/* Entorno com volume leve para mais realismo */}
        <mesh position={[-6.7, -1.72, -4.8]}>
          <boxGeometry args={[2.4, 2.8, 2.2]} />
          <meshStandardMaterial color="#7f9eb3" roughness={0.6} metalness={0.08} />
        </mesh>
        <mesh position={[-8.6, -1.55, -4.7]}>
          <boxGeometry args={[1.1, 3.2, 2.0]} />
          <meshStandardMaterial color="#8ba9bc" roughness={0.58} metalness={0.08} />
        </mesh>
        <mesh position={[10.7, -1.85, -3.8]}>
          <boxGeometry args={[3.3, 2.4, 2.8]} />
          <meshStandardMaterial color="#88a7bc" roughness={0.6} metalness={0.07} />
        </mesh>

        <group
          rotation={[0.02, SCENE_TUNE.building.rotationY, 0]}
          position={[SCENE_TUNE.building.position[0], -offset + SCENE_TUNE.building.position[1], SCENE_TUNE.building.position[2]]}
        >
          {USE_IMPORTED_MODEL ? (
            <ImportedBuilding />
          ) : (
            <ProceduralHospital floorsCount={ordered.length} />
          )}

          {ordered.map((floor, idx) => (
            <FloorMarker
              key={floor.id}
              floor={floor}
              y={idx * SCENE_TUNE.building.floorStep}
              onSelect={onSelectFloor}
              selected={selectedFloorId === floor.id}
              onHoverStart={(f, y, sx, sy) => showTooltip(f, y, sx, sy)}
              onHoverEnd={hideTooltipDelayed}
              floorNumber={idx + 1}
            />
          ))}

          <mesh position={[0, totalHeight + 0.42, 0]}>
            <boxGeometry args={[5.7, 0.08, 3.05]} />
            <meshStandardMaterial color="#9ad9d1" metalness={0.2} roughness={0.35} />
          </mesh>
        </group>

      </Canvas>
      {hoveredFloor && (
        <div
          className="vh-floor-tooltip"
          style={{
            left: `${Math.min(Math.max(hoveredFloor.sx + 14, 12), 780)}px`,
            top: `${Math.min(Math.max(hoveredFloor.sy - 18, 12), 520)}px`,
          }}
          onMouseEnter={() => {
            if (hoverHideTimer.current) {
              window.clearTimeout(hoverHideTimer.current);
              hoverHideTimer.current = null;
            }
          }}
          onMouseLeave={hideTooltipDelayed}
        >
          <div className="vh-floor-tooltip-line" />
          <div className="vh-floor-tooltip-card">
            <strong>{hoveredFloor.floor.label}</strong>
            <span>{hoveredFloor.floor.pct}% ocupacao</span>
            <button onClick={() => onSelectFloor(hoveredFloor.floor.id)}>Entrar</button>
          </div>
        </div>
      )}
    </div>
  );
});










