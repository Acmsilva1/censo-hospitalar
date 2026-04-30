// App.js - React + React Flow + Tailwind
import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';

// Componente de Nó Customizado (O "Card" da sua imagem)
const PatientNode = ({ data }) => {
    const statusColor = data.status === 'critical' ? 'bg-red-500' : 'bg-green-500';

    return (
        <div className={`p-4 rounded-xl shadow-lg border-2 ${data.status === 'critical' ? 'border-red-600' : 'border-gray-200'} bg-white min-w-[120px]`}>
            {data.delay && <div className="text-[10px] text-gray-400 text-center mb-1">{data.delay}</div>}
            <Handle type="target" position={Position.Left} className="w-2 h-2" />
            <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full ${statusColor} flex items-center justify-center text-white mb-2`}>
                    {/* Aqui entrariam os ícones da sua imagem */}
                    <span className="text-xs">✓</span>
                </div>
                <div className="text-sm font-bold text-gray-700">{data.label}</div>
                <div className="text-lg font-mono font-bold text-gray-900">{data.time}</div>
            </div>
            <Handle type="source" position={Position.Right} className="w-2 h-2" />
        </div>
    );
};

const nodeTypes = { custom: PatientNode };

export default function JourneyMap() {
    // Em um cenário real, os dados viriam do TanStack Query batendo no seu Node
    const { nodes, edges } = useMemo(() => ({
        nodes: [ /* dados vindos da API */],
        edges: [ /* dados vindos da API */]
    }), []);

    return (
        <div className="h-screen w-full bg-gray-50 p-8">
            <header className="mb-8 flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold">ABADIA A P</h1>
                    <p className="text-gray-500">Atendimento: 862702 | RJ - PS BARRA DA TIJUCA</p>
                </div>
                <div className="text-4xl font-bold text-gray-400">112,11 min</div>
            </header>

            <div className="h-[600px] border rounded-3xl bg-white overflow-hidden">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    fitView
                >
                    <Background color="#f1f5f9" gap={20} />
                    <Controls />
                </ReactFlow>
            </div>
        </div>
    );
}