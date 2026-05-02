import { memo, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─── Tipos ───────────────────────────────────────────────────────────────────
type PSSector = {
  name: string;
  occupied: number;
  total: number;
};

type Props = {
  sectors: PSSector[];
  floorName?: string;
};

// ─── Mapeamento de ícones por nome de setor ───────────────────────────────────
const SECTOR_ICON_MAP: Record<string, string> = {
  triagem:      '/setor_triagem.png',
  consulta:     '/setor_consulta.png',
  laboratório:  '/setor_laboratorio.png',
  laboratorio:  '/setor_laboratorio.png',
  exames:       '/setor_exames.png',
  exame:        '/setor_exames.png',
  medicação:    '/setor_medicacao.png',
  medicacao:    '/setor_medicacao.png',
  reavaliação:  '/setor_reavaliacao.png',
  reavaliacao:  '/setor_reavaliacao.png',
};

function resolveIcon(name: string): string {
  const key = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const k of Object.keys(SECTOR_ICON_MAP)) {
    const kn = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (key.includes(kn)) return SECTOR_ICON_MAP[k];
  }
  return '/setor_consulta.png'; // fallback ícone médico genérico
}

// Hook para carregar a imagem e aplicar máscara radial para esconder o fundo artificial (xadrez/branco)
import { useState, useEffect } from 'react';
function useIconTexture(url: string) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = url;
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // 1. Canvas temporário para criar a imagem com bordas transparentes (vignette)
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 512; tempCanvas.height = 512;
      const tCtx = tempCanvas.getContext('2d')!;
      
      tCtx.drawImage(img, 0, 0, 512, 512);
      
      // Aplica máscara radial (mantém o centro opaco, apaga as bordas onde está o xadrez)
      tCtx.globalCompositeOperation = 'destination-in';
      const grad = tCtx.createRadialGradient(256, 256, 120, 256, 256, 240);
      grad.addColorStop(0, 'rgba(0,0,0,1)'); // Centro totalmente visível
      grad.addColorStop(1, 'rgba(0,0,0,0)'); // Bordas apagadas
      tCtx.fillStyle = grad;
      tCtx.fillRect(0, 0, 512, 512);

      // 2. Canvas final com o fundo azul escuro da UI
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = 512; finalCanvas.height = 512;
      const fCtx = finalCanvas.getContext('2d')!;
      
      fCtx.fillStyle = '#0a1d2e'; // Azul escuro sólido combinando com a base
      fCtx.fillRect(0, 0, 512, 512);
      
      // Desenha a imagem processada por cima
      fCtx.globalCompositeOperation = 'source-over';
      fCtx.drawImage(tempCanvas, 0, 0);

      // 3. Cria a textura do Three.js
      const tex = new THREE.CanvasTexture(finalCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      setTexture(tex);
    };
  }, [url]);

  return texture;
}

function occupancyColor(pct: number): { color: string; emissive: string } {
  if (pct >= 90) return { color: '#dc2626', emissive: '#f87171' }; // vermelho crítico
  if (pct >= 70) return { color: '#d97706', emissive: '#fbbf24' }; // amarelo alerta
  return { color: '#16a34a', emissive: '#4ade80' };                 // verde OK
}

// ─── Label Sprite (Canvas 2D → Texture → Sprite) ─────────────────────────────
function SpriteLabel({
  text, position, scale = 1, color = '#ffffff', bg = '#0f293e',
}: {
  text: string; position: [number, number, number]; scale?: number; color?: string; bg?: string;
}) {
  const material = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    if (bg !== 'transparent') {
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(0, 0, canvas.width, canvas.height, 32);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#35d3ff';
      ctx.stroke();
    }
    ctx.font = '700 44px Manrope, Segoe UI, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  }, [text, color, bg]);

  return <sprite position={position} scale={[3.2 * scale, 0.8 * scale, 1]} material={material} />;
}

// Label grande com glow para nome do setor
function SectorNameLabel({
  text, position, scale = 1,
}: { text: string; position: [number, number, number]; scale?: number }) {
  const material = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    // Fundo com gradiente
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#0d3a52');
    grad.addColorStop(1, '#0a2535');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 36);
    ctx.fill();
    // Borda brilhante ciano
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#22d3ee';
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 18;
    ctx.stroke();
    // Texto
    ctx.shadowBlur = 0;
    ctx.font = 'bold 72px Manrope, Segoe UI, sans-serif';
    ctx.fillStyle = '#f0faff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  }, [text]);
  return <sprite position={position} scale={[5.2 * scale, 1.3 * scale, 1]} material={material} />;
}

// Label percentual com cor de status e brilho forte
function PctLabel({
  text, position, scale = 1, pctColor,
}: { text: string; position: [number, number, number]; scale?: number; pctColor: string }) {
  const material = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 560; canvas.height = 140;
    const ctx = canvas.getContext('2d')!;
    // Fundo semi-transparente escuro
    ctx.fillStyle = 'rgba(5,20,32,0.82)';
    ctx.beginPath();
    ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 30);
    ctx.fill();
    // Borda colorida por status com glow
    ctx.lineWidth = 6;
    ctx.strokeStyle = pctColor;
    ctx.shadowColor = pctColor;
    ctx.shadowBlur = 24;
    ctx.stroke();
    // Texto grande e brilhante
    ctx.shadowBlur = 12;
    ctx.shadowColor = pctColor;
    ctx.font = 'bold 78px Manrope, Segoe UI, sans-serif';
    ctx.fillStyle = pctColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  }, [text, pctColor]);
  return <sprite position={position} scale={[4.6 * scale, 1.15 * scale, 1]} material={material} />;
}

// ─── Bloco de Setor do PS ─────────────────────────────────────────────────────
function PSSectorBlock({
  sector, position, size, isBottomHalf,
}: {
  sector: PSSector;
  position: [number, number, number];
  size: [number, number];
  isBottomHalf: boolean;
}) {
  const [w, d] = size;
  const pct = sector.total > 0 ? Math.round((sector.occupied / sector.total) * 100) : 0;
  const { color, emissive } = occupancyColor(pct);
  const pulseRef = useRef<THREE.MeshStandardMaterial>(null);

  // Pulso de alerta quando crítico
  useFrame(({ clock }) => {
    if (pct >= 70 && pulseRef.current) {
      const wave = 0.4 + (Math.sin(clock.elapsedTime * 2.2) + 1) * 0.35;
      pulseRef.current.emissiveIntensity = wave;
    }
  });

  // Textura do ícone processada via Canvas para fundo perfeito
  const iconTexture = useIconTexture(resolveIcon(sector.name));

  // Materiais: topo escuro com ícone limpo, laterais com cor de ocupação
  const sideColor = color;
  
  const topMat = useMemo(() => {
    if (!iconTexture) return new THREE.MeshStandardMaterial({ color: '#0a1d2e' });
    return new THREE.MeshStandardMaterial({
      map: iconTexture,
      roughness: 0.8,
      metalness: 0.1,
    });
  }, [iconTexture]);

  const sideMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: sideColor,
    roughness: 0.4,
    metalness: 0.25,
  }), [sideColor]);

  const bottomMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1e3a4a',
    roughness: 0.9,
  }), []);

  // Array de 6 materiais: dir, esq, TOPO, baixo, frente, trás
  const materials = [sideMat, sideMat, topMat, bottomMat, sideMat, sideMat];

  const labelZ = isBottomHalf ? d / 2 + 0.4 : -d / 2 - 0.4;

  return (
    <group position={position}>
      {/* Chão do setor */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w - 0.5, d - 0.5]} />
        <meshStandardMaterial color="#1a2e3f" roughness={0.85} />
      </mesh>

      {/* Bloco principal — metade da altura para melhor visibilidade */}
      <mesh position={[0, 0.9, 0]} material={materials}>
        <boxGeometry args={[w - 3.0, 1.7, d - 3.0]} />
      </mesh>

      {/* Halo pulsante de status ao redor da base */}
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w - 0.3, d - 0.3]} />
        <meshStandardMaterial
          ref={pulseRef}
          color={color}
          emissive={emissive}
          emissiveIntensity={pct >= 70 ? 0.6 : 0.1}
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>

      {/* Vidro envoltório transparente */}
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[w - 2.8, 1.8, d - 2.8]} />
        <meshStandardMaterial
          color="#aee6ff"
          opacity={0.12}
          transparent
          roughness={0.08}
          metalness={0.1}
          depthWrite={false}
        />
      </mesh>

      {/* Label grande: Nome do setor */}
      <SectorNameLabel
        text={sector.name}
        position={[0, 3.2, labelZ]}
        scale={Math.max(1.0, w * 0.11)}
      />

      {/* Label percentual brilhante */}
      <PctLabel
        text={`${pct}%  ${sector.occupied}/${sector.total}`}
        position={[0, 1.5, labelZ]}
        scale={Math.max(0.95, w * 0.10)}
        pctColor={pct >= 90 ? '#f87171' : pct >= 70 ? '#fbbf24' : '#4ade80'}
      />
    </group>
  );
}

// ─── Fundação procedural (mesma lógica do prédio base) ────────────────────────
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

// ─── Componente principal exportado ──────────────────────────────────────────
export const PSFloorView3D = memo(function PSFloorView3D({ sectors, floorName }: Props) {
  // Setores padrão do PS quando API não retorna setores específicos
  const resolvedSectors: PSSector[] = sectors.length > 0
    ? sectors
    : [
        { name: 'Triagem',      occupied: 0, total: 0 },
        { name: 'Consulta',     occupied: 0, total: 0 },
        { name: 'Laboratório',  occupied: 0, total: 0 },
        { name: 'Exames',       occupied: 0, total: 0 },
        { name: 'Medicação',    occupied: 0, total: 0 },
        { name: 'Reavaliação',  occupied: 0, total: 0 },
      ];

  const n = resolvedSectors.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);

  // Setores ligeiramente menores com gap amplo entre eles
  const sectorW = 10;
  const sectorD = 9;
  const totalWidth = sectorW * cols;
  const totalDepth = sectorD * rows;

  const maxDim = Math.max(totalWidth, totalDepth);
  const camY = Math.max(16, maxDim * 0.78);
  const camZ = Math.max(20, maxDim * 1.05);

  return (
    <div style={{ flex: 1, minHeight: '560px', width: '100%' }}>
      <Canvas camera={{ position: [0, camY, camZ], fov: 36 }}>
        <color attach="background" args={['#6ea9d0']} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[10, 22, 10]} intensity={1.5} />
        <pointLight position={[-10, 18, -10]} intensity={0.7} color="#d5f3ff" />
        <hemisphereLight args={['#e7f7ff', '#5d89aa', 0.9]} />

        <group rotation={[0.08, -0.3, 0]} position={[0, 0.5, 0]}>
          {/* Fundação procedural */}
          <ProceduralFoundation w={totalWidth} d={totalDepth} />

          {/* Setores do PS */}
          <group position={[0, 0.05, 0]}>
            {resolvedSectors.map((sector, i) => {
              const c = i % cols;
              const r = Math.floor(i / cols);
              const x = -totalWidth / 2 + sectorW / 2 + c * sectorW;
              const z = -totalDepth / 2 + sectorD / 2 + r * sectorD;
              const isBottomHalf = r >= rows / 2;
              return (
                <PSSectorBlock
                  key={sector.name + i}
                  sector={sector}
                  position={[x, 0, z]}
                  size={[sectorW, sectorD]}
                  isBottomHalf={isBottomHalf}
                />
              );
            })}
          </group>
        </group>
      </Canvas>

      {/* Legenda de status (fora do Canvas, sobre o canvas via absolute) */}
      <div style={{
        position: 'absolute', bottom: 12, right: 16,
        display: 'flex', gap: 10, background: 'rgba(10,28,42,0.75)',
        borderRadius: 10, padding: '6px 14px', backdropFilter: 'blur(6px)',
        fontSize: 11, color: '#e0f7ff', pointerEvents: 'none',
      }}>
        <span>🟢 &lt;70%</span>
        <span>🟡 70–90%</span>
        <span>🔴 &gt;90%</span>
      </div>
    </div>
  );
});
