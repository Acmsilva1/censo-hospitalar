import { useState } from 'react'
import { Handle, Position } from 'reactflow'
import { Clock, MousePointerClick, CheckCircle2 } from 'lucide-react'

function fmtMin(min: number | null | undefined) {
  if (min === null || min === undefined || isNaN(Number(min))) return null
  const v = Number(min)
  const h = Math.floor(v / 60)
  const m = Math.round(v % 60)
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

function fmtTime(dt: string | null | undefined) {
  if (!dt) return null
  try {
    return new Date(dt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch { return dt }
}

/** Início da permanência: senha / portaria (passo ENTRADA ou DT_ENTRADA na jornada). */
function getPortariaSenhaTime(journey: any): string | null | undefined {
  if (!journey) return null
  const entrada = Array.isArray(journey.steps)
    ? journey.steps.find((s: any) => s.step === 'ENTRADA')
    : null
  return entrada?.time ?? journey.DT_ENTRADA ?? null
}

export default function SectorBackgroundNode({ data }: any) {
  const [hovered, setHovered] = useState(false)
  const hasStep = !!data.stepData
  const isActive = data.active
  const isFinished = hasStep && !isActive
  const stepKey = data.stepData?.step
  const isAlta = stepKey === 'ALTA'
  const isInternacao = stepKey === 'INTERNACAO'
  
  const timeStr = hasStep ? fmtTime(data.stepData.time) : null
  const endTimeStr = hasStep && data.stepData.endTime ? fmtTime(data.stepData.endTime) : null
  const minutes = Math.round(Number(data.stepData?.minutes || 0))
  const slaLimit = Number(data.stepData?.slaLimit || 999)
  const slaAlert = Number(data.stepData?.slaAlert || 999)
  const hasNaoPadrao =
    stepKey === 'MEDICACAO' &&
    (data.stepData?.hasNaoPadrao === true ||
      (Array.isArray(data.stepData?.detail) &&
        data.stepData.detail.some((med: any) => String(med?.padrao ?? '').toUpperCase() === 'N')))
  
  const isOverMeta = hasStep && (minutes > slaLimit || hasNaoPadrao)
  const isOverAlert = hasStep && minutes >= slaAlert && minutes <= slaLimit
  
  const statusColor = isOverMeta ? '#EF4444' : isOverAlert ? '#EAB308' : null
  const statusClass = isOverMeta 
    ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-[pulse_2s_infinite]' 
    : isOverAlert 
      ? 'border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]' 
      : ''
  
  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: 'default' }}
    >
      {/* Handles dinâmicos para roteamento inteligente */}
      <Handle type="target" position={Position.Top} id="target-top" className="opacity-0 pointer-events-none" />
      <Handle type="target" position={Position.Bottom} id="target-bottom" className="opacity-0 pointer-events-none" />
      <Handle type="target" position={Position.Left} id="target-left" className="opacity-0 pointer-events-none" />
      <Handle type="target" position={Position.Right} id="target-right" className="opacity-0 pointer-events-none" />
      <Handle type="source" position={Position.Top} id="source-top" className="opacity-0 pointer-events-none" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" className="opacity-0 pointer-events-none" />
      <Handle type="source" position={Position.Left} id="source-left" className="opacity-0 pointer-events-none" />
      <Handle type="source" position={Position.Right} id="source-right" className="opacity-0 pointer-events-none" />

      {/* Node Card - FIXED GABARIT VISUAL */}
      <div className={`
        px-2 py-3 rounded-2xl w-40 min-h-[125px] flex flex-col items-center justify-between pb-2 pt-6
        border transition-all duration-500 relative backdrop-blur-md
        ${statusClass || (isActive
            ? 'border-dash-live shadow-[0_0_30px_rgba(45,224,185,0.3)] bg-dash-live/10'
            : isAlta
              ? 'border-amber-300/80 bg-amber-400/10 shadow-[0_0_24px_rgba(250,204,21,0.45)] animate-pulse'
              : isInternacao
                ? 'border-orange-300/80 bg-orange-500/10 shadow-[0_0_24px_rgba(249,115,22,0.45)] animate-pulse'
            : isFinished
              ? 'border-dash-live/30 bg-white/5 opacity-100 shadow-[0_0_15px_rgba(45,224,185,0.05)]'
              : 'border-app-border bg-black/40 opacity-40 grayscale-[0.5]')
        }
        ${hovered && hasStep ? 'scale-105 -translate-y-2 !opacity-100' : ''}
      `}>
        {/* SLA Badge - Compactado */}
        {isOverMeta && (
          <div className="absolute top-[-6px] left-1/2 -translate-x-1/2 bg-red-500 text-white text-[6px] font-black px-1.5 py-[1px] rounded-md z-20 animate-pulse shadow-sm whitespace-nowrap">
            META GERÊNCIA
          </div>
        )}
        {isOverAlert && (
          <div className="absolute top-[-6px] left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[6px] font-black px-1.5 py-[1px] rounded-md z-20 uppercase shadow-sm whitespace-nowrap">
            Meta Supervisão
          </div>
        )}
        {/* Animated Background Pulse for Active */}
        {(isActive || isAlta || isInternacao) && (
          <div className={`absolute inset-0 animate-pulse pointer-events-none ${
            isAlta
              ? 'bg-amber-300/10'
              : isInternacao
                ? 'bg-orange-400/10'
                : 'bg-dash-live/10'
          }`} />
        )}

        {/* Finished Checkmark */}
        {isFinished && (
          <div className={`absolute top-2 right-3 drop-shadow-[0_0_5px_rgba(45,224,185,0.8)] ${
            isAlta ? 'text-amber-300' : isInternacao ? 'text-orange-300' : 'text-dash-live'
          }`}>
            <CheckCircle2 size={16} strokeWidth={3} />
          </div>
        )}

        <div className="relative z-10 flex flex-col items-center gap-2 mt-2">
          <div className={`
            p-2 rounded-lg transition-all duration-500
            ${statusColor ? '' : isAlta ? 'bg-amber-300/20 text-amber-200 shadow-[0_0_16px_rgba(250,204,21,0.65)] animate-pulse' : isInternacao ? 'bg-orange-400/20 text-orange-200 shadow-[0_0_16px_rgba(249,115,22,0.65)] animate-pulse' : isActive ? 'bg-dash-live text-[#0B0E14] shadow-[0_0_10px_var(--dash-live)]' : 'bg-black/20 text-[#3a3f58]'}
            ${isFinished && !statusColor ? 'text-dash-live !bg-dash-live/10' : ''}
          `} style={statusColor ? { backgroundColor: statusColor, color: '#000', boxShadow: `0 0 10px ${statusColor}` } : {}}>
            <div className="relative">
              {data.icon}
              {/* Badge de Contagem (Exames/Medicamentos/Reaval) */}
              {(data.stepData?.count || 0) > 0 && (
                <div className="absolute -top-3 -right-3 bg-red-600 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-[#0B0E14] shadow-lg">
                  {data.stepData.count}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-col items-center w-full px-1">
            <span className={`text-[9px] font-bold tracking-tight uppercase text-center transition-colors mb-0.5 ${
              isActive || isFinished ? 'text-white' : 'text-[#4B5263]'
            }`}>
              {data.label}
            </span>

            {/* Sub-label de Detalhe (Insights) */}
            {hasStep && (
              <div className="flex flex-col items-center gap-0.5 mt-0.5 mb-1 min-h-[12px] h-auto px-1 w-full">
                {data.stepData.step === 'CONSULTA' && data.stepData.detail && (
                  <div className="flex flex-col items-center w-full px-0.5">
                    {data.stepData.detail.specialty && (
                      <span className="text-[8px] text-dash-live font-black uppercase tracking-tighter truncate w-full text-center">
                        {data.stepData.detail.specialty}
                      </span>
                    )}
                    {data.stepData.detail.doctor && (
                      <div className="flex flex-col items-center mt-1 leading-[1]">
                        <span className="text-[9px] text-yellow-500 font-black uppercase tracking-tight">
                          DR. {data.stepData.detail.doctor.split(' ')[0]}
                        </span>
                        <span className="text-[8px] text-yellow-500/80 font-bold uppercase tracking-tighter truncate w-full text-center">
                          {data.stepData.detail.doctor.split(' ').slice(1, 2).join(' ')}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 justify-center w-full">
                      {data.stepData.detail.cid && (
                        <span className="text-[7px] bg-dash-live/20 px-2 py-0.5 rounded text-dash-live font-black border border-dash-live/30 truncate">
                          CID: {data.stepData.detail.cid}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {data.stepData.step === 'TRIAGEM' && data.stepData.detail?.priority && (
                  <span className="text-[7px] text-yellow-400/80 font-black uppercase tracking-tighter truncate w-full text-center">
                    {data.stepData.detail.priority}
                  </span>
                )}
                {(data.stepData.step === 'LABORATORIO' || data.stepData.step === 'IMAGEM' || data.stepData.step === 'MEDICACAO') && data.stepData.count > 0 && (
                  <span className="text-[7px] text-app-muted font-bold lowercase tracking-tight italic">
                    {data.stepData.count} item(s) solicita.
                  </span>
                )}
              </div>
            )}
            
            {/* Status Indicator */}
            <div className={`h-1 w-8 rounded-full transition-all duration-500 ${
              isActive ? 'bg-dash-live w-12' : isFinished ? 'bg-dash-live/40' : 'bg-transparent'
            }`} />
          </div>
        </div>

        {/* Time badge - Isolamento da Lógica por Tipo de Nó */}
        {(isActive || isFinished) && (
          <>
            {/* CASO A: Nó de Desfecho (ALTA/INTERNACAO) com Baixa no Sistema (Alta Visibilidade) */}
            {data.stepData?.type === 'OUTCOME' && endTimeStr ? (
              <div className="flex items-center gap-1.5 px-1.5 py-1.5 rounded-xl border-2 transition-all mt-1.5 bg-blue-600/25 border-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)] w-full justify-center overflow-hidden">
                <div className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-lg border border-white/10 flex-1 justify-center">
                  <span className="text-[7px] text-blue-300 uppercase font-black tracking-tighter">SAÍDA:</span>
                  <span className="text-[10px] text-white font-black font-mono leading-none">{endTimeStr}</span>
                </div>
                <div className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-lg border border-white/10 flex-1 justify-center">
                  <span className="text-[7px] text-app-muted uppercase font-black tracking-tighter">PERMAN:</span>
                  <span className="text-[10px] text-white font-black leading-none">{Math.round(minutes)}m</span>
                </div>
              </div>
            ) : (
              /* CASO B: Todos os outros nós ou nó de Desfecho sem baixa ainda (Visual de Intervalo de Alta Visibilidade) */
              timeStr && (
                <div className={`
                  flex flex-col items-center gap-0 px-3 py-1.5 rounded-xl border-2 transition-all mt-1.5 w-[95%]
                  ${isActive ? 'bg-blue-600/25 border-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]' : 'bg-black/60 border-white/20'}
                `}>
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} className={isActive ? 'text-blue-300' : 'text-app-muted'} />
                    <span className={`text-[10px] font-mono font-black tracking-tight ${isActive ? 'text-blue-200' : 'text-app-muted'}`}>
                      {timeStr} — {endTimeStr || '...'}
                    </span>
                  </div>
                </div>
              )
            )}
          </>
        )}
      </div>

      {/* Tooltip Surreal */}
      {hovered && hasStep && (
        (() => {
          const y = data.yPos ?? 0;
          const openLeft = (data.xPos ?? 250) >= 400;
          const isBottom = y >= 700;
          const isTop = y <= 350; // Ajustado para pegar o ENTRADA e LAB
          
          let verticalPos = 'top-1/2 -translate-y-1/2';
          let arrowVerticalPos = 'top-1/2 -translate-y-1/2';

          if (isBottom) {
            verticalPos = 'bottom-0 translate-y-0';
            arrowVerticalPos = 'bottom-[60px] translate-y-0';
          } else if (isTop) {
            verticalPos = 'top-0 translate-y-0';
            arrowVerticalPos = 'top-[40px] translate-y-0';
          }

          const posClass = openLeft 
            ? `right-full mr-4 ${verticalPos} slide-in-from-right-2`
            : `left-full ml-4 ${verticalPos} slide-in-from-left-2`;

          const arrowClass = openLeft
            ? `absolute -right-[8px] ${arrowVerticalPos} border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[8px] border-l-dash-live/30`
            : `absolute -left-[8px] ${arrowVerticalPos} border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-r-[8px] border-r-dash-live/30`;

          const stepKey = data.stepData?.step || '';
          const isDesfechoStep = stepKey === 'ALTA' || stepKey === 'INTERNACAO';
          const portariaInicioFmt = isDesfechoStep ? fmtTime(getPortariaSenhaTime(data.journey)) : null;
          const statusBadgeLabel = isDesfechoStep
            ? 'Finalizado'
            : isActive
              ? 'EM ANDAMENTO'
              : 'CONCLUÍDO';
          const statusBadgeClass = isDesfechoStep
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            : isActive
              ? 'bg-dash-live/10 text-dash-live border-dash-live/20'
              : 'bg-white/5 text-app-muted border-white/10';

          const getHexFromCor = (corName: string) => {
            if (!corName) return '#4B5263';
            const c = corName.toUpperCase();
            if (c.includes('VERMELHO') || c.includes('EMERG')) return '#EF4444';
            if (c.includes('LARANJA') || c.includes('MUITO URGENTE')) return '#F97316';
            if (c.includes('AMARELO') || c.includes('URGENTE')) return '#EAB308';
            if (c.includes('VERDE') || c.includes('POUCO URG')) return '#22C55E';
            if (c.includes('AZUL') || c.includes('NAO URG')) return '#3B82F6';
            return '#4B5263';
          }

          return (
            <div className={`absolute z-50 pointer-events-none animate-in fade-in duration-300 ${posClass}`}>
              <div className={arrowClass} />
              
              <div className="bg-[#0B0E14]/90 backdrop-blur-xl border border-dash-live/30 rounded-2xl px-5 py-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] min-w-[220px]">
                
                {/* Cabeçalho */}
                <div className="flex items-center justify-between gap-4 mb-3 pb-2 border-b border-white/10">
                  <p className="font-black text-[11px] text-dash-live uppercase tracking-[0.2em]">{data.label}</p>
                  <div className={`px-2 py-0.5 rounded text-[9px] font-bold border ${statusBadgeClass}`}>
                    {statusBadgeLabel}
                  </div>
                </div>
                
                {/* Dados Específicos por Setor */}
                <div className="space-y-3 mb-3">
                  
                  {/* TRIAGEM */}
                  {stepKey === 'TRIAGEM' && data.journey && (
                     <div className="p-2.5 bg-white/[0.02] rounded-lg border border-white/5 border-l-2" style={{ borderLeftColor: getHexFromCor(data.journey.COR) }}>
                       <span className="text-[8px] text-app-muted uppercase tracking-widest font-black block mb-1">Classificação de Risco:</span>
                       <div className="flex items-center gap-2">
                         <span className="text-[11px] font-bold text-white capitalize">{data.journey.PRIORIDADE || data.journey.COR}</span>
                       </div>
                       {data.journey.DISCRIMINADOR && (
                         <div className="mt-1 text-[10px] text-white/60 italic leading-tight">"{data.journey.DISCRIMINADOR}"</div>
                       )}
                     </div>
                  )}

                  {/* CONSULTA MÉDICA */}
                  {stepKey === 'CONSULTA' && data.journey && (
                     <div className="p-2.5 bg-white/[0.02] rounded-lg border border-white/5 space-y-2 border-l-2 border-l-dash-live">
                       <div>
                         <span className="text-[8px] text-app-muted uppercase tracking-widest font-black block mb-0.5">Especialidade:</span>
                         <span className="text-[11px] font-bold text-white uppercase">{data.journey.DS_ESPECIALID || 'Não Lançada'}</span>
                       </div>
                       {(data.journey.NOME_MEDICO || data.journey.MEDICO_ATENDIMENTO) && (
                         <div className="border-t border-white/5 pt-2">
                           <span className="text-[8px] text-app-muted uppercase tracking-widest font-black block mb-0.5">Médico Responsável:</span>
                           <span className="text-[10px] text-white/90 font-medium truncate block max-w-[180px]">{data.journey.NOME_MEDICO || data.journey.MEDICO_ATENDIMENTO}</span>
                         </div>
                       )}
                     </div>
                  )}

                  {/* EXAMES (LABORATORIO / IMAGEM) */}
                  {(stepKey === 'LABORATORIO' || stepKey === 'IMAGEM') && data.stepData?.detail?.length > 0 && (
                     <div className="space-y-2">
                       <span className="text-[8px] text-app-muted uppercase tracking-widest font-black block px-1">Exames Solicitados:</span>
                       <div className="max-h-[110px] overflow-y-auto pr-1 custom-scrollbar space-y-1">
                         {data.stepData.detail.map((ex: any, idx: number) => (
                           <div key={idx} className="p-2 bg-white/5 rounded border border-white/5 flex items-center justify-between gap-3">
                             <div className="flex flex-col">
                               <span className="text-[9px] text-white/90 font-bold leading-tight">{ex.name}</span>
                               <span className="text-[8px] text-dash-live/60 font-mono">{fmtTime(ex.time)}</span>
                             </div>
                             <span className="text-[7px] px-1 py-0.5 bg-dash-live/10 text-dash-live rounded font-black uppercase">OK</span>
                           </div>
                         ))}
                       </div>
                     </div>
                  )}

                  {/* MEDICACAO */}
                  {stepKey === 'MEDICACAO' && data.stepData?.detail?.length > 0 && (
                     <div className="space-y-2">
                       <span className="text-[8px] text-app-muted uppercase tracking-widest font-black block px-1">Prescrições Ativas:</span>
                       <div className="max-h-[110px] overflow-y-auto pr-1 custom-scrollbar space-y-1">
                         {data.stepData.detail.map((med: any, idx: number) => (
                           <div
                             key={idx}
                             className={`p-2 rounded border flex items-center justify-between gap-3 ${
                               String(med?.padrao ?? '').toUpperCase() === 'N'
                                 ? 'bg-red-500/10 border-red-500/30'
                                 : 'bg-white/5 border-white/5'
                             }`}
                           >
                             <div className="flex flex-col">
                               <span className="text-[9px] text-white/90 font-bold leading-tight line-clamp-1">{med.name}</span>
                               <span className="text-[8px] text-app-muted font-mono">{fmtTime(med.time)}</span>
                             </div>
                             {String(med?.padrao ?? '').toUpperCase() === 'N' ? (
                               <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-red-500 text-white uppercase tracking-tight">
                                 N
                               </span>
                             ) : (
                               <div className="w-2 h-2 rounded-full bg-dash-live animate-pulse shadow-[0_0_5px_var(--dash-live)]" />
                             )}
                           </div>
                         ))}
                       </div>
                     </div>
                  )}

                  {/* REAVALIACAO */}
                  {stepKey === 'REAVALIACAO' && data.stepData?.detail?.length > 0 && (
                     <div className="space-y-2">
                       <span className="text-[8px] text-app-muted uppercase tracking-widest font-black block px-1">Histórico de Retornos:</span>
                       <div className="space-y-1">
                         {data.stepData.detail.map((rev: any, idx: number) => (
                           <div key={idx} className="p-2 bg-yellow-500/5 rounded border border-yellow-500/20 flex items-center justify-between">
                              <span className="text-[9px] text-white/90 font-bold">{rev.name}</span>
                              <span className="text-[8px] text-yellow-400 font-mono">{fmtTime(rev.time)}</span>
                           </div>
                         ))}
                       </div>
                     </div>
                  )}

                  {/* ALTA / INTERNACAO */}
                  {(stepKey === 'ALTA' || stepKey === 'INTERNACAO') && data.journey && (
                     <div className="p-2.5 bg-white/[0.02] rounded-lg border border-white/5 space-y-2 border-l-2 border-l-dash-live">
                       <div>
                         <span className="text-[8px] text-app-muted uppercase tracking-widest font-black block mb-0.5">Desfecho Clínico:</span>
                         <span className="text-[11px] font-bold text-white uppercase">{data.journey.DESFECHO || data.journey.ALTA_HOSPITALAR || data.journey.DESTINO || 'Não Lançado'}</span>
                       </div>
                       {(data.journey.MEDICO_DESFECHO || data.journey.MEDICO_ALTA) && (
                         <div className="border-t border-white/5 pt-2">
                           <span className="text-[8px] text-app-muted uppercase tracking-widest font-black block mb-0.5">Assinado por:</span>
                           <span className="text-[10px] text-white/90 font-medium truncate block max-w-[180px]">{data.journey.MEDICO_ALTA || data.journey.MEDICO_DESFECHO}</span>
                         </div>
                       )}
                     </div>
                  )}
                  
                  {/* FOOTER: Tempos e SLA Performance */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1 pt-1 bg-black/20 rounded py-1.5 border border-black/40">
                      <div className="flex flex-col px-2">
                        <span className="text-[8px] text-app-muted uppercase tracking-widest font-black mb-0.5">
                          {isDesfechoStep ? 'Início (senha):' : 'Início:'}
                        </span>
                        <span className="text-white font-mono font-bold text-[11px]">
                          {isDesfechoStep ? portariaInicioFmt || '--:--' : timeStr || '--:--'}
                        </span>
                      </div>
                      {(stepKey === 'ALTA' || stepKey === 'INTERNACAO') && data.journey?.steps?.length > 0 ? (
                        <div className="flex flex-col text-right px-2 border-l border-white/5">
                          <span className="text-[8px] text-dash-live/60 uppercase tracking-widest font-black mb-0.5">Permanência Total:</span>
                          <span className="text-dash-live font-mono font-bold text-[11px]">
                            {fmtMin(data.stepData?.minutes != null ? Number(data.stepData.minutes) : null) ||
                              fmtMin(
                                (new Date(data.stepData.time).getTime() -
                                  new Date(getPortariaSenhaTime(data.journey) || data.journey.steps[0].time).getTime()) /
                                  60000
                              )}
                          </span>
                        </div>
                      ) : data.stepData?.endTime && (
                        <div className="flex flex-col text-right px-2 border-l border-white/5">
                          <span className="text-[8px] text-dash-live/60 uppercase tracking-widest font-black mb-0.5">Fim:</span>
                          <span className="text-dash-live font-mono font-bold text-[11px]">{fmtTime(data.stepData.endTime)}</span>
                        </div>
                      )}
                    </div>

                    {/* SLA Performance Bar */}
                    {hasStep && data.stepData.slaLimit && (
                      <div className={`p-2 rounded-lg border ${isOverMeta ? 'bg-red-500/10 border-red-500/30' : isOverAlert ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-white/5 border-white/10'}`}>
                         <div className="flex justify-between items-center mb-1">
                            <span className="text-[8px] text-app-muted uppercase font-black uppercase tracking-widest">Performance SLA:</span>
                            <span className={`text-[9px] font-bold ${isOverMeta ? 'text-red-400' : isOverAlert ? 'text-yellow-400' : 'text-dash-live'}`}>
                               {hasNaoPadrao
                                 ? 'Medicação não padrão'
                                 : isOverMeta
                                   ? 'Meta Gerência Excedida'
                                   : isOverAlert
                                     ? 'Meta Supervisão Excedida'
                                     : 'Dentro da Meta'}
                            </span>
                         </div>
                         <div className="flex items-baseline gap-1">
                            <span className="text-xs font-bold text-white">{Math.round(minutes)} min</span>
                            <span className="text-[9px] text-app-muted">
                              {hasNaoPadrao ? 'com item fora do padrão' : `de meta ${data.stepData.slaLimit} min`}
                            </span>
                         </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="pt-2 border-t border-white/5 flex items-center justify-center gap-2 text-[9px] text-dash-live/80 font-bold uppercase tracking-tighter cursor-pointer hover:text-dash-live transition-colors">
                  <MousePointerClick size={12} />
                  <span>Clique p/ Detalhes Completos</span>
                </div>
              </div>
            </div>
          )
        })()
      )}
    </div>
  )
}
