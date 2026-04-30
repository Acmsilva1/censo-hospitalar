import { useRef, useEffect, useState } from 'react'
import { getSmoothStepPath, getStraightPath, getBezierPath, EdgeProps, Position } from 'reactflow'

interface FootPos {
  x: number
  y: number
  angle: number
  isLeft: boolean
}

// Pé desenhado com dedos apontando +X — rotacionado pelo ângulo do caminho
function Foot({
  x, y, angle, isLeft, color,
  animBegin, animDur,
}: FootPos & { color: string; animBegin: string; animDur: string }) {
  const flipY = isLeft ? 1 : -1
  return (
    <g
      transform={`translate(${x},${y}) rotate(${angle}) scale(1,${flipY})`}
      fill={color}
      opacity={0}
    >
      {/* Dedos */}
      <ellipse cx="13"  cy="-5"  rx="1.7" ry="1.2" />
      <ellipse cx="14.5" cy="-3.2" rx="1.5" ry="1.1" />
      <ellipse cx="15"  cy="-0.5" rx="1.5" ry="1.2" />
      <ellipse cx="14.5" cy="2.5" rx="1.4" ry="1.1" />
      <ellipse cx="13"  cy="4.5" rx="1.3" ry="1.0" />
      {/* Planta */}
      <path d="M-7,-3.5 Q-9,0 -7,3.5 Q-3,6.5 3,5.5 Q9,4.5 12,1.5 Q14,-1.5 11,-4.5 Q7,-7 1,-6 Q-4,-5 -7,-3.5 Z" />
      {/* Calcanhar */}
      <ellipse cx="-8" cy="0" rx="4" ry="3.5" />

      {/* Animação de opacidade: aparece rápido, fica, some */}
      <animate
        attributeName="opacity"
        values="0;0;0.95;0.95;0;0"
        keyTimes="0;0.01;0.08;0.55;0.65;1"
        dur={animDur}
        begin={animBegin}
        repeatCount="indefinite"
        calcMode="linear"
      />
    </g>
  )
}

export default function FootprintEdge({
  id: _edgeId,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
}: EdgeProps) {
  const color = (style as any)?.stroke || '#3B82F6'
  const edgeType: string = data?.edgeType || 'smoothstep'
  const pathRef = useRef<SVGPathElement>(null)
  const [feet, setFeet] = useState<FootPos[]>([])

  let edgePath = ''
  if (edgeType === 'straight') {
    ;[edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  } else if (edgeType === 'bezier') {
    ;[edgePath] = getBezierPath({
      sourceX, sourceY,
      sourcePosition: sourcePosition as Position,
      targetX, targetY,
      targetPosition: targetPosition as Position,
    })
  } else {
    ;[edgePath] = getSmoothStepPath({
      sourceX, sourceY,
      sourcePosition: sourcePosition as Position,
      targetX, targetY,
      targetPosition: targetPosition as Position,
    })
  }

  // Calcular posições e ângulos ao longo do path
  useEffect(() => {
    const el = pathRef.current
    if (!el) return
    const total = el.getTotalLength()
    if (total < 10) return

    const N = 5 // número de pegadas — menos = menos lag
    const SIDE_OFFSET = 9 // pixels de separação entre pé esq/dir
    const result: FootPos[] = []

    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N
      const len = t * total
      const pt = el.getPointAtLength(len)

      // Tangente = direção do movimento
      const ptA = el.getPointAtLength(Math.max(0, len - 2))
      const ptB = el.getPointAtLength(Math.min(total, len + 2))
      const angle = Math.atan2(ptB.y - ptA.y, ptB.x - ptA.x) * (180 / Math.PI)

      // Vetor perpendicular ao caminho (90° em relação à tangente)
      const perpRad = Math.atan2(ptB.y - ptA.y, ptB.x - ptA.x) + Math.PI / 2
      const isLeft = i % 2 === 0
      const sign = isLeft ? -1 : 1  // esquerdo = -perp, direito = +perp

      result.push({
        x: pt.x + Math.cos(perpRad) * SIDE_OFFSET * sign,
        y: pt.y + Math.sin(perpRad) * SIDE_OFFSET * sign,
        angle,
        isLeft,
      })
    }
    setFeet(result)
  }, [edgePath])

  const N = feet.length
  const CYCLE = 7.0 // ciclo mais lento = sem lag + espaço entre pares
  const stepDelay = CYCLE / (N || 1) // delay entre cada pé

  return (
    <g>
      {/* Path invisível para medir comprimento */}
      <path ref={pathRef} d={edgePath} fill="none" stroke="none" />

      {/* Pegadas com animação de aparecer/sumir em sequência */}
      {feet.map((f, i) => (
        <Foot
          key={i}
          {...f}
          color={color}
          animBegin={`${(i * stepDelay).toFixed(2)}s`}
          animDur={`${CYCLE}s`}
        />
      ))}
    </g>
  )
}
