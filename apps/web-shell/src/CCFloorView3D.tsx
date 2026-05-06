import { memo, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

type CcRoom = {
  roomName: string;
  inRoomCount: number;
  waitingCount: number;
  completedCount: number;
};

type Props = {
  floorName?: string;
  rooms: CcRoom[];
};

function roomBusy(room: CcRoom) {
  return room.inRoomCount > 0;
}

function SpriteLabel({
  text,
  position,
  scale = 1,
  color = '#e9f7ff',
  bg = '#0f293e',
  border = '#35d3ff',
  fontPx = 42,
}: {
  text: string;
  position: [number, number, number];
  scale?: number;
  color?: string;
  bg?: string;
  border?: string;
  fontPx?: number;
}) {
  const material = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.SpriteMaterial();
    ctx.font = `800 ${fontPx}px Manrope, Segoe UI, sans-serif`;
    const metrics = ctx.measureText(text);
    canvas.width = Math.max(480, metrics.width + 80);
    canvas.height = 120;
    ctx.font = `800 ${fontPx}px Manrope, Segoe UI, sans-serif`;

    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, 26);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = border;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  }, [text, color, bg, border, fontPx]);

  const scaleX = Math.max(2.9, (text.length * 0.2) * scale);
  return <sprite position={position} scale={[scaleX, 0.72 * scale, 1]} material={material} />;
}

const stretcherTexture = new THREE.TextureLoader().load('/cama.png');
stretcherTexture.colorSpace = THREE.SRGBColorSpace;

function SurgicalRoomNode({
  room,
  position,
  labelSide,
}: {
  room: CcRoom;
  position: [number, number, number];
  labelSide: 'top' | 'bottom';
}) {
  const occupied = roomBusy(room);
  const baseColor = occupied ? '#facc15' : '#22c55e';
  const emissive = occupied ? '#fde047' : '#86efac';
  const pulseMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const pulseRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const wave = (Math.sin(clock.elapsedTime * 2.8) + 1) / 2;
    if (pulseMatRef.current) {
      pulseMatRef.current.emissiveIntensity = occupied ? 1.2 + wave * 1.9 : 0.45 + wave * 0.65;
      pulseMatRef.current.opacity = occupied ? 0.34 + wave * 0.46 : 0.16 + wave * 0.2;
    }
    if (pulseRef.current) {
      const s = occupied ? 1 + wave * 0.08 : 1 + wave * 0.05;
      pulseRef.current.scale.set(s, 1, s);
    }
  });

  const statusText = occupied ? 'Ocupada' : 'Livre';
  const statusColor = occupied ? '#fef08a' : '#bbf7d0';
  const labelZ = labelSide === 'top' ? -3.6 : 4.0;
  const detailZ = labelSide === 'top' ? -3.05 : 4.45;

  return (
    <group position={position}>
      {/* Base da sala */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.8, 3.8]} />
        <meshStandardMaterial color="#1c3a50" roughness={0.78} metalness={0.08} />
      </mesh>

      {/* Bloco retangular principal */}
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[3.8, 1.02, 2.8]} />
        <meshStandardMaterial
          color="#d8c7a6"
          emissive="#e7dcc8"
          emissiveIntensity={0.18}
          roughness={0.46}
          metalness={0.12}
        />
      </mesh>

      {/* Anel luminoso de status */}
      <mesh position={[0, 1.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.55, 1.75, 4]} />
        <meshStandardMaterial color={baseColor} emissive={emissive} emissiveIntensity={occupied ? 1.25 : 0.78} />
      </mesh>

      <mesh ref={pulseRef} position={[0, 0.62, 0]}>
        <boxGeometry args={[4.0, 1.1, 3.0]} />
        <meshStandardMaterial
          ref={pulseMatRef}
          color={baseColor}
          emissive={emissive}
          emissiveIntensity={0.8}
          transparent
          opacity={0.28}
          depthWrite={false}
        />
      </mesh>

      {/* Maca cirúrgica */}
      <mesh position={[0, 1.13, -0.22]}>
        <boxGeometry args={[1.2, 0.14, 0.65]} />
        <meshStandardMaterial
          map={stretcherTexture}
          color="#d8ecf8"
          roughness={0.42}
          metalness={0.16}
        />
      </mesh>
      <mesh position={[0, 1.04, -0.22]}>
        <boxGeometry args={[1.24, 0.03, 0.7]} />
        <meshStandardMaterial color="#8aa9bc" roughness={0.32} metalness={0.45} />
      </mesh>

      {/* Torre de equipamentos */}
      <mesh position={[0.95, 1.08, 0.2]}>
        <boxGeometry args={[0.35, 0.62, 0.35]} />
        <meshStandardMaterial color="#9fb6c6" roughness={0.26} metalness={0.34} />
      </mesh>
      <mesh position={[0.95, 1.46, 0.2]}>
        <boxGeometry args={[0.3, 0.12, 0.3]} />
        <meshStandardMaterial color="#1f3f56" emissive="#22d3ee" emissiveIntensity={0.25} />
      </mesh>

      {/* Figura médica simples */}
      <mesh position={[-0.92, 1.18, 0.12]}>
        <cylinderGeometry args={[0.1, 0.12, 0.44, 18]} />
        <meshStandardMaterial color="#ecfeff" roughness={0.45} />
      </mesh>
      <mesh position={[-0.92, 1.45, 0.12]}>
        <sphereGeometry args={[0.11, 18, 18]} />
        <meshStandardMaterial color="#fde68a" roughness={0.52} />
      </mesh>

      {/* Labels acima, no padrão do PS */}
      <SpriteLabel
        text={room.roomName}
        position={[0, 2.2, labelZ]}
        scale={0.9}
        color={statusColor}
        bg="#0e2b3f"
      />
      <SpriteLabel
        text={`${statusText.toUpperCase()}  |  ESPERA: ${room.waitingCount}  |  ENC: ${room.completedCount}`}
        position={[0, 1.75, detailZ]}
        scale={0.78}
        color="#111827"
        bg="#fde047"
        border="#f59e0b"
        fontPx={34}
      />
    </group>
  );
}

function ProceduralFoundation({ w, d }: { w: number; d: number }) {
  return (
    <group position={[0, -0.2, 0]}>
      <mesh position={[0, -0.4, 0]}>
        <boxGeometry args={[w + 1.2, 0.28, d + 1.2]} />
        <meshStandardMaterial color="#9eb3c1" roughness={0.84} metalness={0.02} />
      </mesh>
      <mesh position={[0, -0.15, 0]}>
        <boxGeometry args={[w + 0.8, 0.15, d + 0.8]} />
        <meshStandardMaterial color="#8ea4b4" roughness={0.8} metalness={0.02} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[w + 0.4, 0.1, d + 0.4]} />
        <meshStandardMaterial color="#a7b2bc" roughness={0.72} metalness={0.06} />
      </mesh>
    </group>
  );
}

export const CCFloorView3D = memo(function CCFloorView3D({ floorName, rooms }: Props) {
  const resolvedRooms = rooms.length > 0
    ? rooms
    : [{ roomName: 'SALA - 01', inRoomCount: 0, waitingCount: 0, completedCount: 0 }];

  const n = resolvedRooms.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const roomGap = 6.1;
  const totalWidth = cols * roomGap;
  const totalDepth = rows * roomGap;
  const maxDim = Math.max(totalWidth, totalDepth);
  const camY = Math.max(16, maxDim * 0.8);
  const camZ = Math.max(20, maxDim * 1.05);

  const occupiedCount = resolvedRooms.filter(roomBusy).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="vh-floor-summary">
        <strong>{floorName || 'Centro Cirurgico'}</strong>
        <span>{occupiedCount}/{resolvedRooms.length} salas ocupadas</span>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: '560px', position: 'relative' }}>
        <Canvas camera={{ position: [0, camY, camZ], fov: 36 }}>
          <color attach="background" args={['#5f666f']} />
          <ambientLight intensity={1.16} />
          <directionalLight position={[10, 22, 10]} intensity={1.45} />
          <pointLight position={[-10, 17, -10]} intensity={0.65} color="#d1d5db" />
          <hemisphereLight args={['#e2e8f0', '#475569', 0.7]} />

          <group rotation={[0.08, -0.3, 0]} position={[0, 0.6, 0]}>
            <ProceduralFoundation w={totalWidth} d={totalDepth} />
            {resolvedRooms.map((room, i) => {
              const c = i % cols;
              const r = Math.floor(i / cols);
              const x = -totalWidth / 2 + roomGap / 2 + c * roomGap;
              const z = -totalDepth / 2 + roomGap / 2 + r * roomGap;
              const labelSide: 'top' | 'bottom' = r === 0 ? 'top' : 'bottom';
              return (
                <SurgicalRoomNode
                  key={room.roomName}
                  room={room}
                  position={[x, 0.03, z]}
                  labelSide={labelSide}
                />
              );
            })}
          </group>
        </Canvas>

        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 16,
            display: 'flex',
            gap: 10,
            background: 'rgba(10,28,42,0.75)',
            borderRadius: 10,
            padding: '6px 14px',
            backdropFilter: 'blur(6px)',
            fontSize: 11,
            fontWeight: 800,
            color: '#e0f7ff',
            pointerEvents: 'none',
          }}
        >
          <span>🟢 Livre</span>
          <span>🟡 Ocupada</span>
        </div>
      </div>
    </div>
  );
});
