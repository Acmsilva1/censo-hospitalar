import { useMemo, useRef, memo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

type Bed = {
  id: string;
  status?: string;
  patientId?: string | null;
};

type Sector = {
  name: string;
  occupied: number;
  total: number;
  beds: Bed[];
};

type Props = {
  sectors: Sector[];
};

function isBedOccupied(bed: Bed) {
  const status = String(bed.status || '').toUpperCase();
  return Boolean(bed.patientId) || status.includes('OCUPADO') || status.includes('RESERVADO');
}

function SpriteLabel({ text, position, scale = 1, color = '#ffffff', bg = '#0f293e' }: { text: string; position: [number, number, number]; scale?: number; color?: string; bg?: string }) {
  const material = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (bg !== 'transparent') {
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.roundRect(0, 0, canvas.width, canvas.height, 32);
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#35d3ff';
        ctx.stroke();
      }
      
      ctx.font = '700 48px Manrope, Segoe UI, sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  }, [text, color, bg]);

  return <sprite position={position} scale={[2.8 * scale, 0.7 * scale, 1]} material={material} />;
}

function BedModel({ bed, position }: { bed: Bed; position: [number, number, number] }) {
  const occupied = isBedOccupied(bed);
  const pulseRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    if (occupied && pulseRef.current) {
      // Pulso leve azul para leitos ocupados (conforme solicitado)
      const wave = 0.6 + (Math.sin(clock.elapsedTime * 2.5) + 1) * 0.4;
      pulseRef.current.emissiveIntensity = wave;
    }
  });

  return (
    <group position={position}>
      {/* Cama frame */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.7, 0.3, 1.5]} />
        <meshStandardMaterial color="#c0cad5" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Colchão */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[0.65, 0.12, 1.45]} />
        <meshStandardMaterial 
          ref={pulseRef}
          color={occupied ? '#3b82f6' : '#22c55e'} // Azul ocupado, Verde livre
          emissive={occupied ? '#60a5fa' : '#4ade80'} 
          emissiveIntensity={occupied ? 0.8 : 0.2}
          roughness={0.8} 
        />
      </mesh>
      {/* Travesseiro */}
      <mesh position={[0, 0.45, -0.5]}>
        <boxGeometry args={[0.4, 0.08, 0.25]} />
        <meshStandardMaterial color="#ffffff" roughness={0.9} />
      </mesh>
      {/* Label do leito */}
      <SpriteLabel text={bed.id} position={[0, 1.1, 0]} scale={0.4} bg="transparent" color="#ffffff" />
    </group>
  );
}

function SectorBlock({ sector, position, size }: { sector: Sector; position: [number, number, number]; size: [number, number] }) {
  const [w, d] = size;
  const beds = sector.beds;
  const count = Math.max(1, beds.length);
  const cols = Math.ceil(Math.sqrt(count));
  const spacingX = 1.6;
  const spacingZ = 2.4;
  const startX = -((cols - 1) * spacingX) / 2;
  const startZ = -((Math.ceil(count / cols) - 1) * spacingZ) / 2;

  return (
    <group position={position}>
      {/* Tapete/Chão do setor interno */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w - 0.4, d - 0.4]} />
        <meshStandardMaterial color="#1a2e3f" roughness={0.8} />
      </mesh>
      
      {/* Título do Setor */}
      <SpriteLabel text={sector.name} position={[0, 2.2, -d/2 + 0.6]} scale={1.2} />

      {/* Vidro ao redor (simulando paredes translúcidas) */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[w - 0.4, 1.6, d - 0.4]} />
        <meshPhysicalMaterial 
          color="#aee6ff" 
          transmission={0.85} 
          opacity={0.3} 
          transparent 
          roughness={0.08} 
          ior={1.4} 
          thickness={0.5} 
        />
      </mesh>

      {/* Leitos */}
      {beds.map((bed, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        return <BedModel key={bed.id} bed={bed} position={[startX + c * spacingX, 0, startZ + r * spacingZ]} />;
      })}
    </group>
  );
}

function ProceduralFloorFoundation({ w, d }: { w: number, d: number }) {
  // Recria a mesma base cinza/azulada da visão externa do prédio
  return (
    <group position={[0, -0.2, 0]}>
      {/* Base maior inferior */}
      <mesh position={[0, -0.4, 0]}>
        <boxGeometry args={[w + 1.2, 0.28, d + 1.2]} />
        <meshStandardMaterial color="#9eb3c1" roughness={0.84} metalness={0.02} />
      </mesh>
      {/* Base intermediária */}
      <mesh position={[0, -0.15, 0]}>
        <boxGeometry args={[w + 0.8, 0.15, d + 0.8]} />
        <meshStandardMaterial color="#8ea4b4" roughness={0.8} metalness={0.02} />
      </mesh>
      {/* Laje principal */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[w + 0.4, 0.1, d + 0.4]} />
        <meshStandardMaterial color="#a7b2bc" roughness={0.72} metalness={0.06} />
      </mesh>
    </group>
  );
}

export const HospitalFloorInterior3D = memo(function HospitalFloorInterior3D({ sectors }: Props) {
  const n = Math.max(1, sectors.length);
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  
  const maxBeds = Math.max(...sectors.map(s => s.beds.length), 4);
  const sectorDim = Math.max(6, Math.ceil(Math.sqrt(maxBeds)) * 2.2);
  
  const totalWidth = sectorDim * cols;
  const totalDepth = sectorDim * rows;

  return (
    <div className="vh-canvas-wrap" style={{ flex: 1, minHeight: '560px', width: '100%' }}>
      <Canvas camera={{ position: [0, Math.max(14, totalWidth * 0.7), Math.max(16, totalDepth * 0.8)], fov: 36 }}>
        <color attach="background" args={['#6ea9d0']} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[10, 20, 10]} intensity={1.4} />
        <pointLight position={[-10, 15, -10]} intensity={0.6} color="#d5f3ff" />
        <hemisphereLight args={['#e7f7ff', '#5d89aa', 0.8]} />

        <group rotation={[0.02, -0.18, 0]}>
          {/* Fundação procedural imitando o exterior do prédio */}
          <ProceduralFloorFoundation w={totalWidth} d={totalDepth} />

          {/* Setores e camas construídos sobre a laje */}
          <group position={[0, 0.05, 0]}>
            {sectors.map((sector, i) => {
              const c = i % cols;
              const r = Math.floor(i / cols);
              const x = -totalWidth / 2 + sectorDim / 2 + c * sectorDim;
              const z = -totalDepth / 2 + sectorDim / 2 + r * sectorDim;
              return <SectorBlock key={sector.name} sector={sector} position={[x, 0, z]} size={[sectorDim, sectorDim]} />;
            })}
          </group>
        </group>
      </Canvas>
    </div>
  );
});
