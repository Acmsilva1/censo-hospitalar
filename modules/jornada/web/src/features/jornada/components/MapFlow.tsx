import { useMemo, useEffect, useState } from 'react'
import ReactFlow, { Background, Edge, MarkerType, applyNodeChanges, applyEdgeChanges } from 'reactflow'
import type { EdgeChange, NodeChange } from 'reactflow'
import 'reactflow/dist/style.css'
import SectorBackgroundNode from './SectorBackgroundNode'
import PatientWalkingNode from './PatientWalkingNode'

const nodeTypes = {
  sector: SectorBackgroundNode,
  patient: PatientWalkingNode
}

type StepInfo = { step: string; label: string; time: string | null; minutes: number | null; type: string }

interface MapFlowProps {
  activeStep: string
  journey?: any
  onStepClick?: (step: StepInfo) => void
}

const SECTOR_DEFINITIONS = [
  // Coluna 1: Entrada
  { id: 'ENTRADA',    label: 'PORTARIA / SENHA', icon: <span className="text-3xl">🏢</span>,                                                    position: { x: 200,  y: 180 }, sourcePosition: 'bottom', targetPosition: 'top' },
  { id: 'TRIAGEM',   label: 'CLASSIFICAÇÃO',    icon: <span className="text-3xl animate-pulse">🩺</span>,                                       position: { x: 200,  y: 520 }, sourcePosition: 'right',  targetPosition: 'top' },

  // Coluna 2: Núcleo
  { id: 'CONSULTA',  label: 'CONSULTÓRIO',       icon: <span className="text-3xl">👨‍⚕️</span>,                                                  position: { x: 620,  y: 520 }, sourcePosition: 'right',  targetPosition: 'left' },

  // Coluna Auxiliar (Ações)
  { id: 'LABORATORIO', label: 'LABORATÓRIO',     icon: <span className="text-3xl animate-spin" style={{ animationDuration: '8s' }}>🧪</span>,   position: { x: 620,  y: 180 }, sourcePosition: 'right',  targetPosition: 'bottom' },
  { id: 'IMAGEM',    label: 'RX / TC / US',      icon: <span className="text-3xl animate-spin" style={{ animationDuration: '5s' }}>☢️</span>,   position: { x: 420,  y: 780 }, sourcePosition: 'right',  targetPosition: 'top' },
  { id: 'MEDICACAO', label: 'MEDICAÇÃO',         icon: <span className="text-3xl animate-bounce" style={{ animationDuration: '4s' }}>💊</span>, position: { x: 820,  y: 780 }, sourcePosition: 'right',  targetPosition: 'top' },

  // Coluna 3: Reavaliação e Desfechos
  { id: 'REAVALIACAO', label: 'REAVALIAÇÃO',    icon: <span className="text-3xl">🔄</span>,                                                    position: { x: 900,  y: 220 }, sourcePosition: 'right',  targetPosition: 'left' },
  { id: 'ALTA',      label: 'ALTA MÉDICA',       icon: <span className="text-3xl">🏠</span>,                                                    position: { x: 1150, y: 320 }, sourcePosition: 'right',  targetPosition: 'left' },
  { id: 'INTERNACAO', label: 'INTERNAÇÃO',      icon: <span className="text-3xl">🏥</span>,                                                    position: { x: 1150, y: 600 }, sourcePosition: 'right',  targetPosition: 'left' },
]

export default function MapFlow({ activeStep, journey, onStepClick }: MapFlowProps) {
  const [nodes, setNodes] = useState<any[]>([])
  const [edges, setEdges] = useState<Edge[]>([])

  const stepMap = useMemo(() => {
    const map: Record<string, StepInfo> = {}
    if (journey?.steps) {
      for (const s of journey.steps) map[s.step] = s
    }
    return map
  }, [journey])

  useEffect(() => {
    setNodes((prev) => {
      const dims = new Map(
        prev.map((n) => [n.id, { width: n.width, height: n.height } as const])
      )
      const withDims = (id: string, node: any) => {
        const d = dims.get(id)
        if (d?.width != null && d?.height != null) {
          return { ...node, width: d.width, height: d.height }
        }
        return node
      }

      // 1. Criar Nodes (preserva width/height medidos pelo React Flow → evita nós “a sumir” ao recalcular)
      const newNodes: any[] = SECTOR_DEFINITIONS.map((def) =>
        withDims(def.id, {
          id: def.id,
          type: 'sector',
          position: def.position,
          data: {
            label: def.label,
            icon: def.icon,
            active: def.id === activeStep,
            stepData: stepMap[def.id] ?? null,
            onStepClick,
            journey: journey,
            yPos: def.position.y,
            xPos: def.position.x,
          },
          sourcePosition: def.sourcePosition,
          targetPosition: def.targetPosition,
        })
      )

      if (activeStep) {
        const activeDef = SECTOR_DEFINITIONS.find((d) => d.id === activeStep)
        if (activeDef) {
          newNodes.push(
            withDims('patient_ghost', {
              id: 'patient_ghost',
              type: 'patient',
              position: { x: activeDef.position.x + 96, y: activeDef.position.y + 65 },
              data: {},
            })
          )
        }
      }

      return newNodes
    })

    // 2. Lógica Inteligente de Edges (Setas)
    const newEdges: Edge[] = []
    
    const BLUE = '#3B82F6'
    const RED = '#EF4444'
    const YELLOW = '#EAB308'
    const LILAC = '#D946EF'

    const addPath = (id: string, source: string, target: string, color: string, sourceHandle?: string, targetHandle?: string, type: string = 'smoothstep') => {
      newEdges.push({
        id, source, target,
        sourceHandle, targetHandle,
        type,
        className: 'edge-pulse-main',
        style: { strokeWidth: 3, stroke: color, filter: `drop-shadow(0 0 6px ${color}66)` },
        markerEnd: { type: MarkerType.ArrowClosed, color: color }
      })
    }

    const has = (stepId: string) => !!(stepMap[stepId] || activeStep === stepId)

    // Fluxo Inicial (Azul)
    addPath('e-ent-tri', 'ENTRADA', 'TRIAGEM', BLUE, 'source-bottom', 'target-top')
    addPath('e-tri-con', 'TRIAGEM', 'CONSULTA', BLUE, 'source-right', 'target-left', 'straight')

    // Requests (Vermelho - RETAS DO HUB)
    if (has('LABORATORIO')) addPath('e-con-lab', 'CONSULTA', 'LABORATORIO', RED, 'source-top', 'target-bottom', 'straight')
    if (has('IMAGEM'))      addPath('e-con-img', 'CONSULTA', 'IMAGEM', RED, 'source-bottom', 'target-top', 'straight')
    if (has('MEDICACAO'))   addPath('e-con-med', 'CONSULTA', 'MEDICACAO', RED, 'source-bottom', 'target-top', 'straight')

    // Returns / Reavaliação (Amarelo)
    if (has('REAVALIACAO')) {
      if (has('LABORATORIO')) addPath('e-lab-rea', 'LABORATORIO', 'REAVALIACAO', YELLOW)
      if (has('IMAGEM'))      addPath('e-img-rea', 'IMAGEM', 'REAVALIACAO', YELLOW)
      if (has('MEDICACAO'))   addPath('e-med-rea', 'MEDICACAO', 'REAVALIACAO', YELLOW)
      
      // Se caiu na reavaliação sem exames/meds (ex: observação clínica)
      if (!has('LABORATORIO') && !has('IMAGEM') && !has('MEDICACAO')) {
        addPath('e-con-rea', 'CONSULTA', 'REAVALIACAO', BLUE)
      }
      
      // Loop de Reavaliação -> Consultório (Mencionado no diagrama)
      addPath('e-rea-con', 'REAVALIACAO', 'CONSULTA', BLUE)
    }

    // Saída (Final - LILÁS SEMPRE DO HUB OU REAVAL)
    const finalStep = has('ALTA') ? 'ALTA' : (has('INTERNACAO') ? 'INTERNACAO' : null)
    if (finalStep) {
      if (has('REAVALIACAO')) {
        addPath('e-rea-final', 'REAVALIACAO', finalStep, LILAC, 'source-right', 'target-left', 'straight')
      } else {
        // Agora o desfecho sai SEMPRE do Consultório de forma direta, mesmo se teve exames
        addPath('e-con-final', 'CONSULTA', finalStep, LILAC, 'source-right', 'target-left', 'straight')
      }
    }

    setEdges(newEdges)
  }, [activeStep, stepMap, onStepClick, journey])

  return (
    <div className="absolute inset-0 top-16 bg-[#1a1c2e] overflow-hidden" style={{
      backgroundImage: 'radial-gradient(circle at 50% 50%, #202b4d 0%, #1a1c2e 100%)'
    }}>
      <style>{`
        .react-flow__pane { 
          margin-top: 20px;
          background: radial-gradient(circle at 0% 0%, rgba(45, 224, 185, 0.05) 0%, transparent 40%),
                      radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.05) 0%, transparent 40%);
        }
        
        .react-flow__pane::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          opacity: 0.02;
          pointer-events: none;
        }

        .react-flow__node { transition: z-index 0s !important; }
        .react-flow__node:hover { z-index: 10000 !important; }
        .react-flow__viewport { overflow: visible !important; }

        /* Cursor Nativo do Sistema */
        .react-flow__pane {
          cursor: grab !important;
        }

        .react-flow__pane:active {
          cursor: grabbing !important;
        }

        /* Nós e edges mantêm cursor padrão */
        .react-flow__node, .react-flow__edge, .react-flow__edge-path {
          cursor: default !important;
        }

        @keyframes edge-breath {
          0%   { opacity: 0.5; stroke-dashoffset: 20; }
          50%  { opacity: 0.9; stroke-dashoffset: 0; }
          100% { opacity: 0.5; stroke-dashoffset: -20; }
        }
        .edge-pulse-main {
          stroke-dasharray: 10;
          animation: edge-breath 3s infinite linear;
        }
      `}</style>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={(changes: NodeChange[]) => {
          setNodes((nds) => applyNodeChanges(changes, nds))
        }}
        onEdgesChange={(changes: EdgeChange[]) => {
          setEdges((eds) => applyEdgeChanges(changes, eds))
        }}
        fitView
        fitViewOptions={{
          padding: 0.15,
          includeHiddenNodes: true,
          duration: 400,
        }}
        key={`flow-${journey?.NR_ATENDIMENTO || 'none'}`}
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        style={{ width: '100%', height: '100%' }}
        onNodeClick={(_, node) => {
          if (node.data?.stepData) onStepClick?.(node.data.stepData);
        }}
      >
        <Background color="rgba(255,255,255,0.03)" gap={20} size={1} />
      </ReactFlow>
    </div>
  )
}
