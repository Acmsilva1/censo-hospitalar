import { Canvas } from '@react-three/fiber';
import { memo, useMemo } from 'react';
import * as THREE from 'three';

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

const bandColor: Record<Band, string> = {
  low: '#24d7b2',
  mid: '#f3c65f',
  high: '#f67b46',
};

function windowCount(total: number) {
  if (total <= 8) return 8;
  if (total <= 16) return 12;
  if (total <= 28) return 16;
  return 20;
}

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
    return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  }, [bg, fg, text]);

  return <sprite position={position} scale={[2.8 * scale, 0.7 * scale, 1]} material={material} />;
}

function Floor3D({
  floor,
  y,
  onSelect,
  selected,
}: {
  floor: BuildingFloor3D;
  y: number;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const color = bandColor[floor.band];
  const floorNumber = extractFloorNumber(floor.label);
  const slots = windowCount(floor.occupied + floor.free);
  const lit = Math.max(1, Math.round((slots * floor.pct) / 100));

  const windows = useMemo(() => {
    return Array.from({ length: slots }).map((_, i) => {
      const col = i % 10;
      const row = Math.floor(i / 10);
      const x = -2.2 + col * 0.48;
      const z = 1.41;
      const yLocal = -0.14 - row * 0.2;
      const active = i < lit;
      return { key: `${floor.id}-w-${i}`, x, y: yLocal, z, active };
    });
  }, [floor.id, slots, lit]);

  return (
    <group position={[0, y, 0]} onClick={(e) => { e.stopPropagation(); onSelect(floor.id); }}>
      <mesh>
        <boxGeometry args={[5.4, 0.9, 2.8]} />
        <meshStandardMaterial color={selected ? '#2f6486' : '#2a587a'} roughness={0.36} metalness={0.3} />
      </mesh>

      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[5.5, 0.08, 2.9]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 0.4 : 0.25} />
      </mesh>

      <mesh position={[0, 0.08, 1.42]}>
        <planeGeometry args={[5.1, 0.55]} />
        <meshStandardMaterial color="#234e6c" roughness={0.18} metalness={0.55} />
      </mesh>
      <mesh position={[0, 0.08, -1.42]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[5.1, 0.55]} />
        <meshStandardMaterial color="#214b68" roughness={0.18} metalness={0.55} />
      </mesh>

      {[-2.2, -1.1, 0, 1.1, 2.2].map((x) => (
        <mesh key={`${floor.id}-col-${x}`} position={[x, 0.08, 1.425]}>
          <boxGeometry args={[0.03, 0.55, 0.04]} />
          <meshStandardMaterial color="#315d7a" />
        </mesh>
      ))}

      {windows.map((w) => (
        <mesh key={w.key} position={[w.x, w.y, w.z]}>
          <boxGeometry args={[0.38, 0.14, 0.02]} />
          <meshStandardMaterial
            color={w.active ? color : '#0a1a27'}
            emissive={w.active ? color : '#000000'}
            emissiveIntensity={w.active ? (selected ? 1.25 : 0.95) : 0}
          />
        </mesh>
      ))}
      {windows.map((w) => (
        <mesh key={`${w.key}-back`} position={[w.x, w.y, -w.z]}>
          <boxGeometry args={[0.38, 0.14, 0.02]} />
          <meshStandardMaterial
            color={w.active ? color : '#0a1a27'}
            emissive={w.active ? color : '#000000'}
            emissiveIntensity={w.active ? (selected ? 1.0 : 0.7) : 0}
          />
        </mesh>
      ))}

      {/* Identificador externo do andar (compacto) */}
      <mesh position={[2.72, 0.18, 0]}>
        <boxGeometry args={[0.18, 0.4, 2.5]} />
        <meshStandardMaterial color={selected ? '#8fdfff' : '#3c7da3'} emissive={selected ? '#8fdfff' : '#000000'} emissiveIntensity={selected ? 0.22 : 0} />
      </mesh>
      <SceneLabel text={`${floorNumber}º`} position={[2.88, 0.2, 0.8]} scale={0.47} bg="#0b2238ee" />
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
  const offset = (ordered.length - 1) * 0.52;
  const totalHeight = (Math.max(1, ordered.length) - 1) * 1.03;
  const bannerText = (unitName || 'UNIDADE').replace(/\s*-\s*PS.*$/i, '').slice(0, 26);

  return (
    <div className="vh-canvas-wrap">
      <Canvas camera={{ position: [8.7, 5.6, 8.3], fov: 35 }}>
        <color attach="background" args={['#6ea9d0']} />
        <fog attach="fog" args={['#6ea9d0', 16, 42]} />
        <ambientLight intensity={1.05} />
        <directionalLight position={[10, 16, 8]} intensity={1.55} />
        <pointLight position={[-7, 5, 6]} color="#d5f3ff" intensity={1.1} />
        <pointLight position={[7, 3, -6]} color="#a9d4ff" intensity={0.8} />
        <hemisphereLight args={['#e7f7ff', '#5d89aa', 0.6]} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.45, 0]}>
          <planeGeometry args={[56, 56]} />
          <meshStandardMaterial color="#7ba9c6" roughness={0.94} metalness={0.02} />
        </mesh>

        <mesh position={[0, 8.5, -18]}>
          <sphereGeometry args={[20, 32, 32]} />
          <meshStandardMaterial color="#8bc3e8" emissive="#8bc3e8" emissiveIntensity={0.12} side={1} />
        </mesh>
        <mesh position={[10, 9.8, -14]}>
          <sphereGeometry args={[2.4, 18, 18]} />
          <meshStandardMaterial color="#eaf7ff" emissive="#eaf7ff" emissiveIntensity={0.6} />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.6, -2.437, 0.4]}>
          <planeGeometry args={[13.6, 11.6]} />
          <meshStandardMaterial color="#c3d4df" />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.6, -2.435, 0.4]}>
          <planeGeometry args={[11.0, 9.0]} />
          <meshStandardMaterial color="#9bb8cc" />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.6, -2.43, -7.8]}>
          <planeGeometry args={[36, 3.0]} />
          <meshStandardMaterial color="#4f6f84" />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[9.4, -2.43, 0.8]}>
          <planeGeometry args={[3.0, 29]} />
          <meshStandardMaterial color="#516f83" />
        </mesh>

        {[-14, -10, -6, -2, 2, 6, 10, 14].map((x) => (
          <mesh key={`lane-h-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, -2.425, -7.8]}>
            <planeGeometry args={[1.6, 0.08]} />
            <meshStandardMaterial color="#d8e8f4" emissive="#d8e8f4" emissiveIntensity={0.25} />
          </mesh>
        ))}

        {[-10, -6, -2, 2, 6, 10].map((z) => (
          <mesh key={`lane-v-${z}`} rotation={[-Math.PI / 2, 0, 0]} position={[9.4, -2.425, z]}>
            <planeGeometry args={[0.08, 1.5]} />
            <meshStandardMaterial color="#d8e8f4" emissive="#d8e8f4" emissiveIntensity={0.25} />
          </mesh>
        ))}

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-5.8, -2.432, 1.1]}>
          <planeGeometry args={[4.4, 8.8]} />
          <meshStandardMaterial color="#8faec4" />
        </mesh>
        {[-2.5, -1.1, 0.3, 1.7, 3.1].map((z, i) => (
          <mesh key={`park-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[-5.8, -2.426, z]}>
            <planeGeometry args={[3.8, 0.05]} />
            <meshStandardMaterial color="#d7e6f2" />
          </mesh>
        ))}

        {[
          [-10.2, -2.0, -8.3, 2.6, 2.2, 2.6],
          [-6.8, -2.0, -9.5, 3.2, 1.8, 2.3],
          [-11.4, -2.0, 7.8, 2.8, 2.4, 2.6],
          [10.6, -2.0, -8.2, 2.8, 2.6, 2.8],
          [9.6, -2.0, 7.7, 3.0, 2.1, 2.4],
          [0, -2.0, -12, 4.6, 2.8, 2.8],
          [0, -2.0, 11.5, 4.2, 2.3, 2.6],
        ].map((b, i) => (
          <mesh key={`city-${i}`} position={[b[0], b[1], b[2]]}>
            <boxGeometry args={[b[3], b[4], b[5]]} />
            <meshStandardMaterial color="#86aac4" roughness={0.58} metalness={0.15} />
          </mesh>
        ))}

        <CarLowPoly x={8.5} y={-2.08} z={-6.2} color="#e35d6a" />
        <CarLowPoly x={10.2} y={-2.08} z={4.2} color="#4ea6ff" rotY={Math.PI / 2} />
        <CarLowPoly x={-5.9} y={-2.08} z={-0.1} color="#ffd166" rotY={Math.PI / 2} />
        <CarLowPoly x={-5.9} y={-2.08} z={2.7} color="#5dd39e" rotY={Math.PI / 2} />

        <TreeLowPoly x={-14} y={-2.05} z={4} />
        <TreeLowPoly x={-13} y={-2.05} z={-3} />
        <TreeLowPoly x={14} y={-2.05} z={5} />
        <TreeLowPoly x={13} y={-2.05} z={-2} />
        <TreeLowPoly x={4} y={-2.05} z={-14} />
        <TreeLowPoly x={-4} y={-2.05} z={14} />
        <TreeLowPoly x={-8.5} y={-2.05} z={8.5} scale={0.95} />
        <TreeLowPoly x={11.5} y={-2.05} z={-10.2} scale={0.95} />

        <group rotation={[0.03, -0.24, 0]} position={[0.6, -offset, 0.35]}>
          {ordered.map((floor, idx) => (
            <Floor3D
              key={floor.id}
              floor={floor}
              y={idx * 1.03}
              onSelect={onSelectFloor}
              selected={selectedFloorId === floor.id}
            />
          ))}

          {/* Perfil do edifício no topo para dar acabamento */}
          <mesh position={[0, totalHeight + 0.52, 0]}>
            <boxGeometry args={[5.7, 0.12, 3.05]} />
            <meshStandardMaterial color="#9ad9d1" metalness={0.2} roughness={0.35} />
          </mesh>
        </group>

        {/* Placa lateral grande (estilo hotel/cinema) */}
        <group position={[-1.15, -2.08, 4.55]} rotation={[0, -0.02, 0]}>
          <mesh position={[0, 0.95, 0]}>
            <boxGeometry args={[0.18, 1.75, 0.18]} />
            <meshStandardMaterial color="#3f5f78" metalness={0.25} roughness={0.45} />
          </mesh>
          <mesh position={[0, 1.86, 0]}>
            <boxGeometry args={[0.54, 0.14, 0.54]} />
            <meshStandardMaterial color="#23445f" metalness={0.22} roughness={0.42} />
          </mesh>
          <mesh position={[1.18, 1.86, 0]}>
            <boxGeometry args={[2.15, 0.82, 0.12]} />
            <meshStandardMaterial color="#112f49" emissive="#112f49" emissiveIntensity={0.28} />
          </mesh>
          <mesh position={[1.18, 1.86, 0.08]}>
            <boxGeometry args={[2.0, 0.7, 0.02]} />
            <meshStandardMaterial color="#4fc3f7" emissive="#4fc3f7" emissiveIntensity={0.35} />
          </mesh>
          <SceneLabel
            text={bannerText}
            position={[1.18, 1.86, 0.1]}
            scale={0.56}
            bg="#0f3756f2"
            fg="#f3fbff"
          />
        </group>
      </Canvas>
    </div>
  );
});
