import { X, Clock, Activity, FileText, Stethoscope, Beaker, Pill, Camera, ChevronRight } from 'lucide-react'

export type StepInfo = {
  step: string
  label: string
  time: string | null
  minutes: number | null
  detail?: any
}

export type ModalData = {
  step: StepInfo
  journey: any
}

function fmtMin(min: number | null) {
  if (min === null || min === undefined) return '—'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

function fmtDatetime(dt: string | null) {
  if (!dt) return '—'
  try {
    return new Date(dt).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  } catch { return dt }
}

function getPortariaSenhaTime(journey: any): string | null {
  if (!journey) return null
  const entrada = Array.isArray(journey.steps)
    ? journey.steps.find((s: StepInfo) => s.step === 'ENTRADA')
    : null
  const t = entrada?.time ?? journey.DT_ENTRADA
  return t ? String(t) : null
}

const STEP_ICON: Record<string, any> = {
  ENTRADA: <DoorOpen size={24} />,
  TRIAGEM: <FileText size={24} />,
  CONSULTA: <Stethoscope size={24} />,
  LABORATORIO: <Beaker size={24} />,
  MEDICACAO: <Pill size={24} />,
  IMAGEM: <Camera size={24} />,
  REAVALIACAO: <Activity size={24} />,
  ALTA: <Home size={24} />,
  INTERNACAO: <Building size={24} />,
}

import { DoorOpen, Home, Building } from 'lucide-react'

export default function StepDetailModal({ data, onClose }: { data: ModalData; onClose: () => void }) {
  const { step, journey } = data
  const corStyle = journey?.COR ? `border-${journey.COR.toLowerCase()}-500/30 text-${journey.COR.toLowerCase()}-400` : 'border-white/10 text-white'

  // Calcular duração neste passo (diff com próximo passo)
  const allSteps: StepInfo[] = journey?.steps ?? []
  const stepIdx = allSteps.findIndex((s: StepInfo) => s.step === step.step)
  const nextStep = allSteps[stepIdx + 1]
  const isFinalStep = step.step === 'ALTA' || step.step === 'INTERNACAO' || !nextStep

  let duration: number | null = null
  if (step.time && nextStep?.time) {
    duration = (new Date(nextStep.time).getTime() - new Date(step.time).getTime()) / 60000
  } else if (isFinalStep && (step.minutes != null && !isNaN(Number(step.minutes)))) {
    // Backend: permanência portaria (senha) → desfecho
    duration = Number(step.minutes)
  } else if (step.time && isFinalStep && allSteps.length > 0) {
    const inicioPortaria = getPortariaSenhaTime(journey)
    if (inicioPortaria) {
      duration = (new Date(step.time).getTime() - new Date(inicioPortaria).getTime()) / 60000
    }
  }

  const inicioPortariaFmt = getPortariaSenhaTime(journey)
  const isDesfecho = step.step === 'ALTA' || step.step === 'INTERNACAO'

  const detailList = Array.isArray(step.detail) ? step.detail : []

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6"
      style={{ background: 'rgba(7, 9, 15, 0.8)', backdropFilter: 'blur(12px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-2xl bg-[#0F1118] rounded-[2.5rem] border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in-95 duration-300"
      >
        {/* Top Header - Glassmorphism */}
        <div className="px-10 py-8 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-dash-live/10 flex items-center justify-center text-dash-live border border-dash-live/20 shadow-[0_0_20px_rgba(45,224,185,0.1)]">
              {STEP_ICON[step.step] || <Activity size={24} />}
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight leading-tight">{step.label}</h2>
              <p className="text-[10px] font-bold text-app-muted uppercase tracking-[0.2em]">Relatório Técnico de Etapa</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-app-muted hover:text-white hover:bg-white/5 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body - Multi-column */}
        <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Paciente Card */}
            <div className="space-y-4">
               <div>
                 <span className="text-[10px] font-black text-app-muted uppercase tracking-widest block mb-2">Paciente Identificado</span>
                 <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5">
                    <p className="text-lg font-bold text-white mb-1">{journey?.PACIENTE}</p>
                    <div className="flex items-center gap-2 text-xs text-app-muted">
                       <span>{journey?.IDADE} Anos</span>
                       <div className="w-1 h-1 rounded-full bg-white/20" />
                       <span>{journey?.SEXO}</span>
                    </div>
                 </div>
               </div>
               
               <div className="flex gap-4">
                  <div className="flex-1 bg-white/[0.03] border border-white/5 rounded-2xl p-4">
                     <span className="text-[8px] font-black text-app-muted uppercase tracking-widest block mb-1">Risco</span>
                     <span className={`text-xs font-black uppercase ${corStyle.split(' ')[1]}`}>{journey?.COR || 'N/A'}</span>
                  </div>
                  <div className="flex-1 bg-white/[0.03] border border-white/5 rounded-2xl p-4">
                     <span className="text-[8px] font-black text-app-muted uppercase tracking-widest block mb-1">Atendimento</span>
                     <span className="text-xs font-mono text-white">#{journey?.NR_ATENDIMENTO}</span>
                  </div>
               </div>
            </div>

            {/* Tempos Card */}
            <div className="space-y-4">
               <span className="text-[10px] font-black text-app-muted uppercase tracking-widest block mb-2">Cronometria</span>
               <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                     <div className="flex items-center gap-3">
                        <Clock size={14} className="text-dash-live" />
                        <span className="text-xs text-app-muted">
                          {isDesfecho ? 'Início (senha na portaria)' : 'Início desta etapa'}
                        </span>
                     </div>
                     <span className="text-xs font-bold text-white">
                       {isDesfecho && inicioPortariaFmt ? fmtDatetime(inicioPortariaFmt) : fmtDatetime(step.time)}
                     </span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-dash-live/5 border border-dash-live/10 rounded-2xl">
                     <div className="flex items-center gap-3">
                        <Activity size={14} className="text-dash-live" />
                        <span className="text-xs text-app-muted">
                           {step.step === 'ALTA' || step.step === 'INTERNACAO' ? 'Permanência Total' : 'Permanência'}
                        </span>
                     </div>
                     <span className="text-xs font-black text-dash-live">{fmtMin(duration)}</span>
                  </div>
               </div>
            </div>
          </div>

          {/* Ações / Detalhes Itemizados */}
          {detailList.length > 0 && (
            <div className="space-y-4">
               <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-app-muted uppercase tracking-widest">Procedimentos Realizados ({detailList.length})</span>
                  <div className="h-px flex-1 mx-6 bg-white/5" />
               </div>
               
               <div className="grid grid-cols-1 gap-3">
                  {detailList.map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl group hover:bg-white/[0.04] transition-all">
                       <div className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-app-muted group-hover:text-dash-live transition-colors">
                             {step.step === 'LABORATORIO' ? <Beaker size={14} /> : 
                              step.step === 'MEDICACAO' ? <Pill size={14} /> : 
                              step.step === 'IMAGEM' ? <Camera size={14} /> : <FileText size={14} />}
                          </div>
                          <div>
                             <p className="text-xs font-bold text-white uppercase tracking-tight">{item.name}</p>
                             <p className="text-[10px] text-app-muted mt-0.5">{item.status} · {fmtDatetime(item.time)}</p>
                          </div>
                       </div>
                       <ChevronRight size={14} className="text-white/10 group-hover:text-dash-live transition-colors" />
                    </div>
                  ))}
               </div>
            </div>
          )}

          {/* Footer Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/5">
             <InfoMini label="Médico Responsável" value={journey?.MEDICO_ATENDIMENTO || 'S/M'} />
             <InfoMini label="Diagnóstico (CID)" value={journey?.CID || 'N/A'} />
             <InfoMini label="Unidade" value={journey?.UNIDADE || 'N/A'} />
          </div>
        </div>

        {/* Action Bar */}
        <div className="px-10 py-6 bg-black/40 border-t border-white/5 flex justify-end">
           <button 
             onClick={onClose}
             className="px-8 py-3 bg-dash-live text-[#0B0E14] font-black text-[10px] uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-[0_10px_20px_rgba(45,224,185,0.2)]"
           >
             Fechar Relatório
           </button>
        </div>
      </div>
    </div>
  )
}

function InfoMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[8px] font-black text-app-muted uppercase tracking-[0.2em] block mb-1">{label}</span>
      <span className="text-[10px] font-bold text-white leading-tight block">{value}</span>
    </div>
  )
}
