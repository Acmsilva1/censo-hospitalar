import { Clock } from 'lucide-react'
import { isInternacaoOutcome } from '../lib/internacaoOutcome'

export type PatientQueuePatient = {
  NR_ATENDIMENTO: string
  PACIENTE: string
  IDADE: string
  SEXO: string
  PRIORIDADE: string
  DT_ENTRADA: string
  DT_ALTA?: string
  DT_DESFECHO?: string
  DESFECHO?: string
  DS_TIPO_ALTA?: string
  DESTINO?: string
  DT_INTERNACAO?: string
  NR_ATENDIMENTO_INT?: string
  CID_INTERNADO?: string
  ALTA_HOSPITALAR?: string
  ALTA_MEDICA?: string
  outcomeInternacao?: boolean
}

function priorityBadgeClass(priority: string) {
  const p = String(priority || '')
  if ((p.includes('AMARELO') || p.includes('URGENTE')) && !p.includes('POUCO') && !p.includes('NÃO')) {
    return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'
  }
  if (p.includes('VERDE') || p.includes('POUCO')) {
    return 'text-green-400 bg-green-400/10 border-green-400/20'
  }
  if (p.includes('LARANJA') || p.includes('MUITO URGENTE')) {
    return 'text-orange-400 bg-orange-400/10 border-orange-400/20'
  }
  if (p.includes('VERMELHO') || p.includes('EMERG')) {
    return 'text-red-400 bg-red-400/10 border-red-400/20'
  }
  return 'text-blue-400 bg-blue-400/10 border-blue-400/20'
}

function priorityLabel(priority: string) {
  const p = String(priority || '').toUpperCase()
  if (p.includes('NORMAL')) return 'NÃO URGENTE'
  return priority || 'NÃO URGENTE'
}

type PatientQueueRowProps = {
  patient: PatientQueuePatient
  onSelect: (p: PatientQueuePatient) => void
}

export function PatientQueueRow({ patient: p, onSelect }: PatientQueueRowProps) {
  const internacao =
    typeof p.outcomeInternacao === 'boolean'
      ? p.outcomeInternacao
      : isInternacaoOutcome(p as Record<string, unknown>)

  const mostrarBadgeAlta = !internacao && Boolean(p.DT_ALTA && String(p.DT_ALTA) !== 'NULL')

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(p)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(p)
        }
      }}
      className="group flex flex-col p-4 border-b border-white/5 hover:bg-dash-live/10 cursor-pointer transition-all outline-none focus-visible:ring-2 focus-visible:ring-dash-live/40"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-black text-dash-live tracking-widest font-mono">ATD #{p.NR_ATENDIMENTO}</span>
        <span className={`text-[9px] font-black px-2 py-0.5 rounded border border-white/10 ${priorityBadgeClass(p.PRIORIDADE || '')}`}>
          {priorityLabel(p.PRIORIDADE || '')}
        </span>
      </div>
      <span className="text-base font-bold text-white group-hover:translate-x-2 transition-transform truncate">{p.PACIENTE}</span>
      <div className="flex items-center gap-3 mt-2">
        <span className="text-xs text-app-muted">{p.IDADE} - {p.SEXO}</span>
        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          {internacao && (
            <span
              className="text-[8px] font-black px-2.5 py-1 rounded-md bg-orange-500 text-white animate-pulse whitespace-nowrap border border-orange-200/80 shadow-[0_0_18px_rgba(249,115,22,0.8)] leading-none"
              title="Desfecho: internação"
            >
              INTERNAÇÃO
            </span>
          )}
          {mostrarBadgeAlta && (
            <span className="text-[8px] font-black px-2.5 py-1 rounded-md bg-yellow-400 text-[#1a1a1a] animate-pulse border border-yellow-200 shadow-[0_0_18px_rgba(250,204,21,0.8)] leading-none">
              ALTA
            </span>
          )}
          <span className={`text-xs flex items-center gap-1.5 font-mono shrink-0 ${mostrarBadgeAlta ? 'text-yellow-300' : 'text-yellow-400/70'}`}>
            <Clock size={12} />
            {new Date(p.DT_ENTRADA).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  )
}
