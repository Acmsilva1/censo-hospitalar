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

// Carrega uma vez, compartilhado entre todas as camas
const bedTexture = new THREE.TextureLoader().load('/cama.png');


function BedModel({ bed, position }: { bed: Bed; position: [number, number, number] }) {
  const occupied = isBedOccupied(bed);
  const color = occupied ? '#dc2626' : '#16a34a'; // Vermelho ocupado, Verde livre
  const emissive = occupied ? '#ef4444' : '#4ade80';

  const pulseMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const pulseMeshRef = useRef<THREE.Mesh>(null);

  // Cria materiais para cada face do BoxGeometry [dir, esq, cima, baixo, frente, tras]
  const materials = useMemo(() => [
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 }),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 }),
    new THREE.MeshStandardMaterial({ // TOPO — textura da cama
      map: bedTexture,
      emissive: new THREE.Color(emissive),
      emissiveIntensity: 0.3,
      roughness: 0.6,
    }),
    new THREE.MeshStandardMaterial({ color: '#555', roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 }),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 }),
  ], [color, emissive]);

  // Pulso de alerta intermediário e suave em volta da cama
  useFrame(({ clock }) => {
    const wave = (Math.sin(clock.elapsedTime * 2.5) + 1) / 2; // 0 a 1
    if (pulseMatRef.current) {
      pulseMatRef.current.emissiveIntensity = 0.5 + wave * 0.8;
      pulseMatRef.current.opacity = 0.15 + wave * 0.15;
    }
    if (pulseMeshRef.current) {
      const s = 1.0 + wave * 0.02;
      pulseMeshRef.current.scale.set(s, s, s);
    }
  });

  return (
    <group position={position}>
      {/* Caixa da cama principal */}
      <mesh position={[0, 0.15, 0]} material={materials}>
        <boxGeometry args={[0.75, 0.28, 1.55]} />
      </mesh>

      {/* Aura pulsante de status ao redor do leito (verde ou vermelho) */}
      <mesh ref={pulseMeshRef} position={[0, 0.15, 0]}>
        <boxGeometry args={[0.82, 0.32, 1.62]} />
        <meshStandardMaterial
          ref={pulseMatRef}
          color={color}
          emissive={emissive}
          emissiveIntensity={1.0}
          transparent
          opacity={0.3}
          depthWrite={false}
        />
      </mesh>

      {/* Número do leito */}
      <SpriteLabel text={bed.id} position={[0, 0.85, 0]} scale={0.38} bg="transparent" color="#ffffff" />
    </group>
  );
}




function SectorBlock({ sector, position, size, isBottomHalf }: { sector: Sector; position: [number, number, number]; size: [number, number]; isBottomHalf: boolean }) {
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
      
      {/* Título do Setor empurrado para fora da caixa de vidro e alinhado ao topo para não cortar */}
      <SpriteLabel 
        text={sector.name} 
        position={[0, 1.6, isBottomHalf ? d/2 + 1.2 : -d/2 - 1.2]} 
        scale={Math.max(1.2, w * 0.15)} 
      />

      {/* Vidro ao redor — opacity simples para nao bloquear renders internos */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[w - 0.4, 1.6, d - 0.4]} />
        <meshStandardMaterial 
          color="#aee6ff" 
          opacity={0.18} 
          transparent 
          roughness={0.08}
          metalness={0.1}
          depthWrite={false}
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

  const maxDim = Math.max(totalWidth, totalDepth);
  const camY = Math.max(14, maxDim * 0.85);
  const camZ = Math.max(18, maxDim * 1.15);

  return (
    <div className="vh-canvas-wrap" style={{ flex: 1, minHeight: '560px', width: '100%' }}>
      <Canvas camera={{ position: [0, camY, camZ], fov: 36 }}>
        <color attach="background" args={['#6ea9d0']} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[10, 20, 10]} intensity={1.4} />
        <pointLight position={[-10, 15, -10]} intensity={0.6} color="#d5f3ff" />
        <hemisphereLight args={['#e7f7ff', '#5d89aa', 0.8]} />

        <group rotation={[0.08, -0.3, 0]} position={[0, 1.8, 0]}>
          {/* Fundação procedural imitando o exterior do prédio */}
          <ProceduralFloorFoundation w={totalWidth} d={totalDepth} />

          {/* Setores e camas construídos sobre a laje */}
          <group position={[0, 0.05, 0]}>
            {sectors.map((sector, i) => {
              const c = i % cols;
              const r = Math.floor(i / cols);
              const x = -totalWidth / 2 + sectorDim / 2 + c * sectorDim;
              const z = -totalDepth / 2 + sectorDim / 2 + r * sectorDim;
              const isBottomHalf = r >= rows / 2;
              return <SectorBlock key={sector.name} sector={sector} position={[x, 0, z]} size={[sectorDim, sectorDim]} isBottomHalf={isBottomHalf} />;
            })}
          </group>
        </group>
      </Canvas>
    </div>
  );
});
