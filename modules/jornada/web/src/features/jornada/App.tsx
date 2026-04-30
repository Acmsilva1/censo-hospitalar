import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { API_BASE } from '../../shared/lib/apiBase'
import MapFlow from './components/MapFlow'
import StepDetailModal from './components/StepDetailModal'
import { PatientQueueRow } from './components/PatientQueueRow'
import { isInternacaoOutcome } from './lib/internacaoOutcome'
import { HeartPulse, Activity, ChevronLeft, ChevronRight, Map as MapIcon, Pill, Beaker, Camera, RefreshCw, Timer, Search } from 'lucide-react'

export type PatientSummary = {
  NR_ATENDIMENTO: string;
  PACIENTE: string;
  IDADE: string;
  SEXO: string;
  PRIORIDADE: string;
  DT_ENTRADA: string;
  DT_ALTA?: string;
  DT_DESFECHO?: string;
  /** Texto do desfecho (ex.: internação). */
  DESFECHO?: string;
  DS_TIPO_ALTA?: string;
  DESTINO?: string;
  DT_INTERNACAO?: string;
  NR_ATENDIMENTO_INT?: string;
  CID_INTERNADO?: string;
  ALTA_HOSPITALAR?: string;
  ALTA_MEDICA?: string;
  /** Definido pela API `/api/patients` (regra única com o Parquet). */
  outcomeInternacao?: boolean;
  CD_PESSOA_FISICA: string;
}

export type JourneyStep = {
  type: 'FLOW' | 'ACTION' | 'OUTCOME';
  step: string;
  label: string;
  time: string | null;
  endTime?: string | null;
  minutes: number | null;
  count?: number;
  detail?: any;
}

export type JourneyData = {
  NR_ATENDIMENTO: string;
  PACIENTE: string;
  IDADE: string;
  SEXO: string;
  PRIORIDADE: string;
  COR: string;
  DISCRIMINADOR: string;
  CID: string;
  GRUPO_CID: string;
  DESFECHO: string;
  UNIDADE: string;
  MEDICO_ATENDIMENTO: string;
  TURNO_ATENDIMENTO: string;
  steps: JourneyStep[];
  tempoTotalMin: number | null;
}

const COR_BADGE: Record<string, string> = {
  VERMELHO: 'bg-red-500/20 text-red-400 border-red-500/30',
  LARANJA: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  AMARELO: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  VERDE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  AZUL: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  BRANCO: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
}

function fmtDatetime(dt: string | null) {
  if (!dt) return '—'
  try { return new Date(dt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' }) } catch { return dt }
}

export default function App() {
  const [units, setUnits] = useState<string[]>([])
  const [selectedUnit, setSelectedUnit] = useState<string>('')
  const [patients, setPatients] = useState<PatientSummary[]>([])
  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null)
  const [journey, setJourney] = useState<JourneyData | null>(null)
  const [activeStep, setActiveStep] = useState<string>('')
  const [loadingPatients, setLoadingPatients] = useState(false)
  const [loadingJourney, setLoadingJourney] = useState(false)
  const [selectedStep, setSelectedStep] = useState<any>(null)
  const [syncStatus, setSyncStatus] = useState<string>('Ocioso')
  const [timeLeft, setTimeLeft] = useState(600) // 10 minutos
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [patientPanelOpen, setPatientPanelOpen] = useState(false)
  const [panelSearchTerm, setPanelSearchTerm] = useState('')
  const [panelOutcomeFilter, setPanelOutcomeFilter] = useState<'all' | 'alta' | 'internacao'>('all')
  const [apiLoading, setApiLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)

  /** Evita closure velha no intervalo ETL / refresh. */
  const selectedPatientRef = useRef<PatientSummary | null>(null)
  const selectedUnitRef = useRef('')
  useEffect(() => {
    selectedPatientRef.current = selectedPatient
  }, [selectedPatient])
  useEffect(() => {
    selectedUnitRef.current = selectedUnit
  }, [selectedUnit])

  // Função central de Recarga Silenciosa (ETL Sync)
  const refreshData = useCallback(async (isManual = false) => {
    if (!isManual) console.log('Iniciando sincronização automática com ETL...')
    const unit = selectedUnitRef.current
    const patient = selectedPatientRef.current

    if (unit) {
      fetch(`${API_BASE}/api/patients?unit=${encodeURIComponent(unit)}`)
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) setPatients(d)
        })
        .catch(console.error)
    }

    if (patient) {
      if (isManual) setLoadingJourney(true)
      const atd = patient.NR_ATENDIMENTO
      fetch(`${API_BASE}/api/journey/${encodeURIComponent(atd)}`)
        .then(async (r) => r.json())
        .then((data: any) => {
          const still = selectedPatientRef.current
          if (!still || String(still.NR_ATENDIMENTO) !== String(atd)) return
          if (data && !data.error && Array.isArray(data.steps) && data.steps.length > 0) {
            if (String(data.NR_ATENDIMENTO) === String(atd)) {
              setJourney(data as JourneyData)
            }
          }
        })
        .catch(console.error)
        .finally(() => {
          if (isManual) setLoadingJourney(false)
        })
    }

    setLastUpdate(new Date())
    setTimeLeft(600)
  }, [])

  // Cronômetro do Ciclo ETL
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          refreshData()
          return 600
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [selectedUnit, selectedPatient, refreshData])

  // Alterna mensagens de carregamento para o efeito de "mensageria"
  useEffect(() => {
    if (!loadingJourney) {
      setSyncStatus('Sincronizado')
      return
    }
    const messages = ['Acessando prontuário...', 'Mapeando fluxo real...', 'Sincronizando exames...', 'Renderizando jornada...']
    let i = 0
    const interval = setInterval(() => {
      setSyncStatus(messages[i % messages.length])
      i++
    }, 400)
    return () => clearInterval(interval)
  }, [loadingJourney])

  // Carrega unidades (retries com backoff — evita dezenas de falhas na consola se a API não estiver na 3211)
  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout>
    let attempt = 0
    const MAX_ATTEMPTS = 16

    const delayAfterFail = (n: number) =>
      Math.min(28000, Math.round(1600 * Math.pow(1.5, Math.min(n, 10))))

    const poll = () => {
      if (cancelled) return
      fetch(`${API_BASE}/api/units`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then((d) => {
          if (cancelled) return
          if (!Array.isArray(d)) throw new Error('Resposta inválida')
          setUnits(d)
          setApiError(null)
          setApiLoading(false)
        })
        .catch(() => {
          if (cancelled) return
          attempt += 1
          if (attempt >= MAX_ATTEMPTS) {
            setApiLoading(false)
            setApiError(
              `Sem conexão com a API Jornada em ${API_BASE} (ERR_CONNECTION_REFUSED = nada a escutar nessa porta). Na pasta do projeto Censo Vivo: npm run dev — ou só o backend PS: npm run dev -w modules/jornada/api`
            )
            return
          }
          if (attempt >= 2) {
            setApiError(
              `À espera da API em ${API_BASE} (tentativa ${attempt}/${MAX_ATTEMPTS}). Se não subir, num terminal: npm run dev -w modules/jornada/api`
            )
          }
          timeoutId = setTimeout(poll, delayAfterFail(attempt))
        })
    }
    poll()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [])

  // Limpa filtro local ao trocar de unidade
  useEffect(() => {
    setPanelSearchTerm('')
    setPanelOutcomeFilter('all')
  }, [selectedUnit])

  // Carrega pacientes ao mudar unidade
  useEffect(() => {
    if (!selectedUnit) { setPatients([]); setSelectedPatient(null); setJourney(null); setActiveStep(''); return }
    setLoadingPatients(true)
    // Não limpamos o patient/journey aqui imediatamente para evitar o "flash" se o usuário estiver navegando rápido
    fetch(`${API_BASE}/api/patients?unit=${encodeURIComponent(selectedUnit)}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPatients(d) })
      .catch(console.error)
      .finally(() => setLoadingPatients(false))
  }, [selectedUnit])

  // Carrega jornada por ATD (deps por string evita re-fetch só por novo objeto na fila).
  const selectedPatientId = selectedPatient?.NR_ATENDIMENTO ?? null
  useEffect(() => {
    if (!selectedPatientId) {
      setJourney(null)
      setActiveStep('')
      setLoadingJourney(false)
      return
    }

    let cancelled = false
    const clearTimers: ReturnType<typeof setTimeout>[] = []

    const currentJourneyId = journey?.NR_ATENDIMENTO
    const targetPatientId = selectedPatientId

    if (String(currentJourneyId ?? '') !== String(targetPatientId)) {
      setLoadingJourney(true)
      setJourney(null)
      setActiveStep('')
    }

    const isSamePatient = String(currentJourneyId ?? '') === String(targetPatientId)

    fetch(`${API_BASE}/api/journey/${encodeURIComponent(selectedPatientId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP Error ${r.status}`)
        return r.json()
      })
      .then((data: any) => {
        if (cancelled) return
        if (!data || data.error || !Array.isArray(data.steps)) return
        if (String(data.NR_ATENDIMENTO) !== String(selectedPatientId)) return

        setJourney(data as JourneyData)

        if (!isSamePatient) {
          const startAnimation = () => {
            data.steps.forEach((s: JourneyStep, index: number) => {
              const tid = setTimeout(() => {
                if (!cancelled) setActiveStep(s.step)
              }, index * 1200)
              clearTimers.push(tid)
            })
          }
          // Pequeno atraso só para o paint da nova jornada (sem bloquear 2s fixos — isso travava e conflituava com trocas rápidas).
          const ANIM_START_DELAY_MS = 350
          clearTimers.push(setTimeout(startAnimation, ANIM_START_DELAY_MS))
        } else {
          const lastStep = data.steps[data.steps.length - 1]
          if (lastStep) setActiveStep(lastStep.step)
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('Falha ao carregar jornada inicial:', err)
      })
      .finally(() => {
        if (cancelled) return
        setLoadingJourney(false)
      })

    return () => {
      cancelled = true
      clearTimers.forEach(clearTimeout)
    }
  }, [selectedPatientId])

  const corBadge = journey ? (COR_BADGE[journey.COR] ?? COR_BADGE.BRANCO) : ''

  const headerStatusLabel = useMemo(() => {
    if (!activeStep) return 'Processando...'
    if (activeStep === 'ALTA' || activeStep === 'INTERNACAO') return 'Finalizado'
    return activeStep.toLowerCase().replace('_', ' ')
  }, [activeStep])

  // Sugestões da busca central: só quando há texto; ordena por viabilidade (ATD/nome que começa com o termo primeiro)
  const filteredPatients = useMemo(() => {
    const raw = searchTerm.trim()
    if (!raw) return []
    const q = raw.toLowerCase()
    const matches = patients.filter(
      (p) =>
        String(p.PACIENTE).toLowerCase().includes(q) || String(p.NR_ATENDIMENTO).includes(raw)
    )
    return matches
      .sort((a, b) => {
        const an = String(a.PACIENTE).toLowerCase()
        const bn = String(b.PACIENTE).toLowerCase()
        const aAtd = String(a.NR_ATENDIMENTO)
        const bAtd = String(b.NR_ATENDIMENTO)
        const score = (name: string, atd: string) => {
          let s = 0
          if (atd.startsWith(raw)) s += 200
          else if (atd.includes(raw)) s += 120
          if (name.startsWith(q)) s += 100
          else if (name.includes(q)) s += 50
          return s
        }
        return score(bn, bAtd) - score(an, aAtd)
      })
      .slice(0, 50)
  }, [patients, searchTerm])

  const [unitRow1, unitRow2] = useMemo(() => {
    if (!units.length) return [[], []] as [string[], string[]]
    const mid = Math.ceil(units.length / 2)
    return [units.slice(0, mid), units.slice(mid)]
  }, [units])

  const panelFilteredPatients = useMemo(() => {
    const s = panelSearchTerm.toLowerCase().trim()
    return patients.filter((p) => {
      const byText =
        !s ||
        String(p.PACIENTE).toLowerCase().includes(s) ||
        String(p.NR_ATENDIMENTO).includes(s)

      if (!byText) return false
      if (panelOutcomeFilter === 'all') return true

      const internacao =
        typeof p.outcomeInternacao === 'boolean'
          ? p.outcomeInternacao
          : isInternacaoOutcome(p as unknown as Record<string, unknown>)

      const isAlta = !internacao && Boolean(p.DT_ALTA && String(p.DT_ALTA) !== 'NULL')
      return panelOutcomeFilter === 'internacao' ? internacao : isAlta
    })
  }, [patients, panelSearchTerm, panelOutcomeFilter])

  const handleSelectPatient = (patient: PatientSummary) => {
    setSelectedPatient(patient)
    setSearchTerm('')
    setIsSearchFocused(false)
    setPatientPanelOpen(false)
  }

  const selectUnit = (u: string) => {
    setSelectedUnit(u)
    setPatientPanelOpen(true)
  }

  const showDataBanner = Boolean(apiError || apiLoading || (!apiLoading && units.length === 0))

  // Removido sidebarContent para integração direta no layout principal

  return (
    <div className="flex h-screen bg-[#1E2235] text-app-fg overflow-hidden font-sans">
      {/* Sidebar Removida - Agora tudo é sobreposição (overlap) */}

      {/* Content */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {apiError && (
          <div className="shrink-0 z-[70] mx-4 mt-3 rounded-xl border border-amber-500/40 bg-amber-950/90 px-4 py-2.5 text-sm text-amber-100 shadow-lg pointer-events-auto">
            {apiError}
          </div>
        )}
        {!apiError && apiLoading && (
          <div className="shrink-0 z-[70] mx-4 mt-3 rounded-xl border border-white/10 bg-black/50 px-4 py-2 text-xs text-app-muted pointer-events-auto">
            Aguardando API em {API_BASE} (o backend pode levar um tempo ao carregar os Parquet)…
          </div>
        )}
        {!apiError && !apiLoading && units.length === 0 && (
          <div className="shrink-0 z-[70] mx-4 mt-3 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs text-app-muted pointer-events-auto">
            API respondeu, mas não há unidades nos dados. Confira se existe{' '}
            <code className="text-dash-live/90">banco local/tbl_tempos_entrada_consulta_saida.parquet</code> na raiz do
            projeto (variável <code className="text-dash-live/90">JORNADA_DADOS_DIR</code> se usar outra pasta).
          </div>
        )}
        {/* Header / Floats - Navbar Unificada no Topo */}
        <header
          className={`absolute left-6 right-6 z-[60] flex items-center justify-between gap-4 pointer-events-none ${
            showDataBanner ? 'top-24' : 'top-6'
          }`}
        >
           {/* Brand & Unidade */}
           <div className="flex items-center gap-3 pointer-events-auto min-w-0">
              <div className="bg-black/60 backdrop-blur-md border border-white/10 p-3 rounded-2xl shadow-2xl flex items-start gap-3 min-w-0 max-w-[min(100%,52rem)]">
                <div className="w-10 h-10 shrink-0 rounded-xl bg-dash-live/20 flex items-center justify-center text-dash-live border border-dash-live/30">
                  <HeartPulse size={24} />
                </div>
                <div className="shrink-0 pt-0.5">
                   <h1 className="text-xs font-black tracking-widest text-white uppercase leading-none">Jornada do Paciente</h1>
                </div>
                <div className="min-w-0 flex flex-col gap-1.5 border-l border-white/10 pl-3 ml-0.5">
                  <div className="flex flex-wrap gap-1.5">
                    {unitRow1.map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => selectUnit(u)}
                        className={`rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wide border transition ${
                          selectedUnit === u
                            ? 'border-dash-live/50 bg-dash-live/15 text-dash-live'
                            : 'border-white/10 bg-white/5 text-app-muted hover:border-white/20 hover:text-white'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {unitRow2.map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => selectUnit(u)}
                        className={`rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wide border transition ${
                          selectedUnit === u
                            ? 'border-dash-live/50 bg-dash-live/15 text-dash-live'
                            : 'border-white/10 bg-white/5 text-app-muted hover:border-white/20 hover:text-white'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
           </div>

           {/* Busca Centralizada */}
           <div className="flex-1 max-w-xl pointer-events-auto">
              <div className="relative group">
                <div className="absolute inset-0 bg-dash-live/5 blur-xl group-focus-within:bg-dash-live/15 transition-all rounded-full" />
                <div className="relative flex items-center bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-2 hover:border-dash-live/30 focus-within:border-dash-live transition-all">
                   <Search size={18} className="text-app-muted mr-3" />
                   <input
                     type="text"
                     placeholder={selectedPatient ? `Paciente: ${selectedPatient.PACIENTE}` : "Pesquise por nome ou atendimento..."}
                     value={searchTerm}
                     onChange={e => {
                       setSearchTerm(e.target.value)
                       setIsSearchFocused(true)
                     }}
                     onFocus={() => setIsSearchFocused(true)}
                     className="w-full bg-transparent text-sm text-white placeholder:text-app-muted focus:outline-none"
                   />
                   {selectedPatient && (
                      <button 
                        onClick={() => setSelectedPatient(null)}
                        className="ml-2 p-1.5 rounded-lg bg-white/5 text-app-muted hover:text-red-400 transition-colors"
                      >
                        <Activity size={14} />
                      </button>
                   )}
                </div>

                {/* Dropdown: só após digitar — lista filtrada e ordenada como sugestões viáveis */}
                {isSearchFocused && searchTerm.trim().length > 0 && (
                  <>
                    <div className="fixed inset-0 z-[100]" onClick={() => setIsSearchFocused(false)} />
                    <div className="absolute top-full left-0 right-0 mt-3 bg-[#0F1219]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] z-[101] max-h-[400px] overflow-y-auto animate-in fade-in slide-in-from-top-4 duration-300 custom-scrollbar">
                      {!selectedUnit ? (
                        <div className="p-10 text-center text-app-muted text-sm">
                          Selecione uma unidade para buscar pacientes.
                        </div>
                      ) : filteredPatients.length > 0 ? (
                        filteredPatients.map((p) => (
                          <PatientQueueRow
                            key={p.NR_ATENDIMENTO}
                            patient={p}
                            onSelect={(row) => handleSelectPatient(row as PatientSummary)}
                          />
                        ))
                      ) : (
                        <div className="p-10 text-center text-app-muted text-sm italic">
                          Nenhuma sugestão para &quot;{searchTerm.trim()}&quot;.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
           </div>

           {/* Sync & Status */}
           <div className="flex items-center gap-3 pointer-events-auto">
              {journey && (
                <div className="bg-white/5 backdrop-blur-md border border-dash-live/30 px-5 py-2.5 rounded-2xl shadow-[0_0_20px_rgba(45,224,185,0.15)] text-right hidden lg:block">
                   <span className="text-[9px] text-dash-live uppercase tracking-[0.2em] font-black block mb-0.5">Status Atual</span>
                   <span className="text-sm font-bold text-white uppercase">{headerStatusLabel}</span>
                </div>
              )}

              <div className="bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2.5 rounded-2xl flex items-center gap-5">
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5 mb-0.5 text-app-muted">
                    <Timer size={10} />
                    <span className="text-[9px] uppercase tracking-widest font-black">Próximo ETL</span>
                  </div>
                  <span className="text-white font-mono font-bold text-sm leading-none">
                    {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                
                <div className="h-8 w-[1px] bg-white/10" />

                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5 mb-0.5 text-dash-live/60">
                    <RefreshCw size={10} />
                    <span className="text-[9px] text-app-muted uppercase tracking-widest font-black">Última Atualização</span>
                  </div>
                  <span className="text-app-muted font-mono text-[11px] leading-none">
                    {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
           </div>
        </header>

        {/* Painel da fila à esquerda (unidade selecionada) — mapa / árvore permanecem à direita */}
        {selectedUnit && (
          <div
            className={`pointer-events-auto fixed left-0 top-28 bottom-8 z-[55] flex flex-row items-stretch overflow-hidden rounded-r-2xl border border-white/15 border-l-0 bg-black/50 shadow-2xl backdrop-blur-md transition-[width] duration-300 ease-out ${
              patientPanelOpen ? 'w-[min(22rem,calc(100vw-1.5rem))]' : 'w-11'
            }`}
          >
            <button
              type="button"
              onClick={() => setPatientPanelOpen((o) => !o)}
              className="flex w-11 shrink-0 flex-col items-center justify-center gap-1 border-r border-white/10 bg-white/5 text-dash-live transition-colors hover:bg-dash-live/15"
              aria-expanded={patientPanelOpen}
              aria-controls="patient-queue-panel"
              id="patient-queue-toggle"
              title={patientPanelOpen ? 'Ocultar fila da unidade' : 'Ver fila da unidade (escolher paciente)'}
            >
              {patientPanelOpen ? <ChevronLeft size={20} strokeWidth={2.5} /> : <ChevronRight size={20} strokeWidth={2.5} />}
            </button>
            <div
              id="patient-queue-panel"
              role="region"
              aria-label="Fila de pacientes da unidade selecionada"
              aria-hidden={!patientPanelOpen}
              className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#0F1219]/90 backdrop-blur-xl transition-[opacity,max-width] duration-300 ${
                patientPanelOpen ? 'max-w-none opacity-100' : 'max-w-0 opacity-0'
              }`}
            >
              <div className="shrink-0 border-b border-white/10 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-dash-live">Fila no momento</p>
                <p className="truncate text-[10px] font-bold text-white/90">{selectedUnit}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-app-muted">Filtro</span>
                  <button
                    type="button"
                    onClick={() => setPanelOutcomeFilter((v) => (v === 'alta' ? 'all' : 'alta'))}
                    className={`text-[8px] font-black px-2.5 py-1 rounded-md border transition ${
                      panelOutcomeFilter === 'alta'
                        ? 'bg-yellow-400 text-[#1a1a1a] border-yellow-200 shadow-[0_0_14px_rgba(250,204,21,0.75)]'
                        : 'bg-yellow-400/10 text-yellow-300 border-yellow-400/30'
                    }`}
                  >
                    ALTA
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanelOutcomeFilter((v) => (v === 'internacao' ? 'all' : 'internacao'))}
                    className={`text-[8px] font-black px-2.5 py-1 rounded-md border transition ${
                      panelOutcomeFilter === 'internacao'
                        ? 'bg-orange-500 text-white border-orange-200 shadow-[0_0_14px_rgba(249,115,22,0.75)]'
                        : 'bg-orange-500/10 text-orange-300 border-orange-400/30'
                    }`}
                  >
                    INTERNACAO
                  </button>
                </div>
              </div>
              <div className="shrink-0 border-b border-white/10 px-3 py-2">
                <div className="relative flex items-center rounded-xl border border-white/10 bg-black/40 px-3 py-2 focus-within:border-dash-live/40">
                  <Search size={14} className="mr-2 shrink-0 text-app-muted" />
                  <input
                    type="text"
                    value={panelSearchTerm}
                    onChange={(e) => setPanelSearchTerm(e.target.value)}
                    placeholder="Filtrar por nome ou atendimento…"
                    className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder:text-app-muted focus:outline-none"
                    aria-label="Filtrar fila da unidade"
                  />
                </div>
              </div>
              <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
                {loadingPatients ? (
                  <div className="flex items-center justify-center p-8 text-app-muted text-xs">Carregando…</div>
                ) : patients.length === 0 ? (
                  <div className="p-6 text-center text-app-muted text-xs">Nenhum paciente na fila.</div>
                ) : panelFilteredPatients.length === 0 ? (
                  <div className="p-6 text-center text-app-muted text-xs">
                    Nenhum resultado para &quot;{panelSearchTerm}&quot;.
                  </div>
                ) : (
                  panelFilteredPatients.map((p) => (
                    <PatientQueueRow
                      key={p.NR_ATENDIMENTO}
                      patient={p}
                      onSelect={(row) => handleSelectPatient(row as PatientSummary)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* HUD Flutuante de Jornada (Apenas quando selecionado) */}
        {selectedPatient && (
          <aside
            className={`absolute top-28 bottom-6 w-64 z-[52] flex flex-col pointer-events-none animate-in fade-in slide-in-from-left-6 duration-700 ${
              patientPanelOpen && selectedUnit
                ? 'left-[calc(min(22rem,100vw-1.5rem)+0.75rem)]'
                : 'left-6'
            }`}
          >
             {/* Card do Paciente */}
             <div className="pointer-events-auto bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden flex flex-col h-full shadow-[0_30px_60px_rgba(0,0,0,0.5)]">
               
               {/* Resumo no HUD */}
               <div className="p-5 border-b border-white/5 bg-white/5">
                 <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black border uppercase shadow-lg ${corBadge}`}>
                      {selectedPatient.PACIENTE?.substring(0,2)}
                    </div>
                    <div className="min-w-0">
                       <h3 className="text-base font-bold text-white truncate leading-tight">{selectedPatient.PACIENTE}</h3>
                       <p className="text-[10px] text-app-muted uppercase tracking-widest font-black mt-1">ATD #{selectedPatient.NR_ATENDIMENTO}</p>
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                       <p className="text-[9px] text-app-muted uppercase font-black mb-0.5">Prioridade</p>
                       <p className={`text-[10px] font-bold uppercase ${journey?.COR === 'VERMELHO' ? 'text-red-400' : 'text-dash-live'}`}>
                        {journey?.COR || 'Normal'}
                       </p>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                       <p className="text-[9px] text-app-muted uppercase font-black mb-0.5">Entrada</p>
                       <p className="text-[10px] font-bold text-white whitespace-nowrap">
                        {fmtDatetime(selectedPatient.DT_ENTRADA)}
                       </p>
                    </div>
                 </div>
               </div>

               {/* Timeline no HUD */}
               <div className="flex-1 overflow-y-auto p-5 custom-scrollbar relative">
                 {loadingJourney && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-10">
                       <div className="flex flex-col items-center gap-3">
                          <Activity className="text-dash-live animate-spin" size={24} />
                          <span className="text-[10px] text-dash-live font-black uppercase tracking-widest">Sincronizando...</span>
                       </div>
                    </div>
                 )}

                 <div className="space-y-6">
                    {journey?.steps.map((s, idx) => {
                      const isInternacao = s.step === 'INTERNACAO'
                      const isAltaMedica = s.step === 'ALTA'
                      const isActive = activeStep === s.step
                      return (
                      <div key={`${s.step}-${idx}`} className="relative pl-7">
                        {/* Linha Vertical */}
                        {idx < journey.steps.length - 1 && (
                          <div className="absolute left-[7px] top-5 bottom-[-1.5rem] w-px bg-white/10" />
                        )}
                        
                        {/* Ponto: internação laranja, alta médica amarelo/âmbar, passo ativo teal */}
                        <div className={`absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-[#0B0E14] z-10 transition-all duration-500 ${
                          isInternacao
                            ? 'bg-orange-500 border-orange-200 shadow-[0_0_14px_rgba(249,115,22,0.85)] animate-pulse scale-110'
                            : isAltaMedica
                              ? 'bg-amber-400 border-amber-200 shadow-[0_0_16px_rgba(250,204,21,0.85)] animate-pulse scale-110'
                              : isActive
                                ? 'bg-dash-live shadow-[0_0_12px_rgba(45,224,185,0.6)] scale-110'
                                : 'bg-white/10'
                        }`} />

                        <div className={`p-3 rounded-2xl border transition-all duration-500 ${
                          isInternacao
                            ? 'bg-orange-500/15 border-orange-500/45 shadow-[0_0_22px_rgba(249,115,22,0.35)] animate-pulse'
                            : isAltaMedica
                              ? 'bg-amber-400/12 border-amber-400/50 shadow-[0_0_24px_rgba(250,204,21,0.32)] animate-pulse'
                              : isActive
                                ? 'bg-white/10 border-dash-live/40 shadow-lg'
                                : 'bg-transparent border-transparent opacity-60'
                        }`}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className={`text-[10px] font-black uppercase tracking-[0.1em] ${
                              isInternacao
                                ? 'text-orange-300'
                                : isAltaMedica
                                  ? 'text-amber-200'
                                  : isActive
                                    ? 'text-white'
                                    : 'text-app-muted'
                            }`}>{s.label}</span>
                            <span className="text-[9px] font-mono text-app-muted">{fmtDatetime(s.time)}</span>
                          </div>

                          {s.type === 'ACTION' && s.count && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                               {s.step === 'MEDICACAO' && <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-400 text-[9px] font-bold"><Pill size={11}/> {s.count} Presc.</div>}
                               {s.step === 'LABORATORIO' && <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-400 text-[9px] font-bold"><Beaker size={11}/> {s.count} Exames</div>}
                               {s.step === 'IMAGEM' && <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-orange-500/10 text-orange-400 text-[9px] font-bold"><Camera size={11}/> {s.count} Imagens</div>}
                            </div>
                          )}
                        </div>
                      </div>
                      )
                    })}
                 </div>
               </div>

             </div>
          </aside>
        )}

        {/* Home / No Patient State */}
        {!selectedPatient ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="relative mb-8">
               <div className="absolute inset-0 bg-dash-live/10 blur-[100px] rounded-full scale-150 animate-pulse" />
               <div className="relative w-32 h-32 rounded-3xl bg-black/40 backdrop-blur-md border border-white/5 flex items-center justify-center shadow-2xl">
                  <MapIcon className="text-dash-live/40" size={64} />
               </div>
            </div>
            <h2 className="text-white text-3xl font-black tracking-[0.2em] uppercase mb-4 drop-shadow-2xl">
               Nenhum Paciente Selecionado
            </h2>
            <p className="text-app-muted text-base max-w-lg leading-relaxed px-6">
               Escolha uma unidade nos botões ao lado do título: a fila abre à esquerda (pode recolher pelo botão na borda). Use o filtro acima da lista ou a busca no topo para localizar um atendimento e ver a jornada em tempo real.
            </p>
          </div>
        ) : (
          <>
            {/* Mapa mantém-se montado: desmontar aqui + race no finally do fetch antigo fazia a jornada “sumir” após uns segundos. */}
            <MapFlow key={selectedPatient.NR_ATENDIMENTO} activeStep={activeStep} journey={journey} onStepClick={(step) => setSelectedStep(step)} />
            
            {/* Máscara de segurança Cyberpunk */}
            {loadingJourney && (
              <div className="absolute inset-0 z-[100] flex flex-col justify-center items-center bg-[#0B0E14]/95 backdrop-blur-2xl transition-all duration-700">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-dash-live shadow-[0_0_20px_var(--dash-live)] animate-[scan_2.5s_linear_infinite]" />
                
                <style>{`
                  @keyframes scan {
                    0% { top: 0%; opacity: 0; }
                    50% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                  }
                `}</style>

                <Activity className="text-dash-live mb-8 animate-pulse shadow-[0_0_30px_rgba(45,224,185,0.4)]" size={100} />

                <div className="flex flex-col items-center gap-4">
                  <h2 className="text-white text-3xl font-black tracking-[0.4em] drop-shadow-2xl uppercase">
                    Carregando jornada
                  </h2>
                  <div className="flex items-center gap-4 bg-white/5 border border-white/10 px-6 py-3 rounded-2xl backdrop-blur-xl">
                    <div className="w-2 h-2 rounded-full bg-dash-live animate-ping" />
                    <span className="text-dash-live font-mono text-sm tracking-[0.2em] uppercase font-bold">
                       {syncStatus}
                    </span>
                  </div>
                </div>

                <div className="absolute bottom-20 w-64 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-dash-live shadow-[0_0_15px_var(--dash-live)] animate-[progress_1.5s_ease-in-out_infinite]" />
                </div>
                
                <style>{`
                  @keyframes progress {
                    0% { width: 0%; transform: translateX(-100%); }
                    50% { width: 60%; }
                    100% { width: 0%; transform: translateX(200%); }
                  }
                `}</style>
              </div>
            )}
          </>
        )}

        {/* Modal */}
        {selectedStep && journey && (
          <StepDetailModal
            data={{ step: selectedStep, journey }}
            onClose={() => setSelectedStep(null)}
          />
        )}
      </main>
    </div>
  )
}
