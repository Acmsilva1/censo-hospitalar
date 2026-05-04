import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Stethoscope, Clock, Pill, FlaskConical, Loader2, AlertCircle } from 'lucide-react';

type JourneyDetailItem = { name?: string; time?: string; status?: string; padrao?: string };

type JourneyStep = {
  type?: string;
  step?: string;
  label?: string;
  time?: string;
  detail?: JourneyDetailItem[] | string;
};

export type JourneyPayload = {
  NR_ATENDIMENTO?: string;
  DT_ENTRADA?: string;
  DT_INTERNACAO?: string;
  DT_DESFECHO?: string;
  DESFECHO?: string;
  steps?: JourneyStep[];
};

/** Pré-cheque feito no ModalProntuário — evita 2º pedido e alinha badge ao modal. */
export type PsJourneyWarmStart =
  | { kind: 'data'; payload: JourneyPayload }
  | { kind: 'missing' }
  | { kind: 'error'; message?: string };

const MSG_PS_NAO_ENCONTRADO = 'Sem dados do Pronto Socorro';

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const s = String(dateStr).trim();
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const parts = s.split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[1]}` : parts[0];
  }
  try {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString('pt-BR');
  } catch {
    /* ignore */
  }
  return s;
}

function flattenExamRows(steps: JourneyStep[] | undefined): JourneyDetailItem[] {
  if (!steps?.length) return [];
  const out: JourneyDetailItem[] = [];
  for (const st of steps) {
    if (st.step !== 'LABORATORIO' && st.step !== 'IMAGEM') continue;
    const d = st.detail;
    if (Array.isArray(d)) out.push(...d);
  }
  return out;
}

function flattenMedRows(steps: JourneyStep[] | undefined): JourneyDetailItem[] {
  if (!steps?.length) return [];
  for (const st of steps) {
    if (st.step !== 'MEDICACAO') continue;
    const d = st.detail;
    if (Array.isArray(d)) return [...d];
  }
  return [];
}

function MedPsRow({ row }: { row: JourneyDetailItem }) {
  const foraPadrao = String(row.padrao ?? '').trim().toUpperCase() === 'N';
  return (
    <li
      className={
        foraPadrao
          ? 'bg-amber-950/25 border border-amber-500/45 ring-1 ring-amber-400/35 rounded-xl px-3 py-2.5 text-sm shadow-[0_0_0_1px_rgba(251,191,36,0.12)]'
          : 'bg-slate-800/30 border border-slate-700/40 rounded-xl px-3 py-2.5 text-sm'
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-100">{row.name || 'Medicamento'}</span>
        {foraPadrao && (
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-200 border border-amber-500/35">
            Fora do padrão
          </span>
        )}
      </div>
      {row.time && (
        <span className="block text-[11px] text-slate-500 mt-0.5">{formatDateTime(row.time)}</span>
      )}
    </li>
  );
}

function internacaoDisplay(j: JourneyPayload): string {
  if (j.DT_INTERNACAO) return formatDateTime(j.DT_INTERNACAO);
  const outcome = j.steps?.find((s) => s.step === 'INTERNACAO');
  if (outcome?.time) return formatDateTime(outcome.time);
  if (j.DT_DESFECHO && String(j.DESFECHO || '').toLowerCase().includes('intern')) {
    return formatDateTime(j.DT_DESFECHO);
  }
  return '—';
}

interface ModalHistoricoPsProps {
  isOpen: boolean;
  onClose: () => void;
  attendanceId: string;
  warmStart?: PsJourneyWarmStart;
}

const ModalHistoricoPs: React.FC<ModalHistoricoPsProps> = ({ isOpen, onClose, attendanceId, warmStart }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<JourneyPayload | null>(null);

  useEffect(() => {
    if (!isOpen || !attendanceId) return;

    let cancelled = false;

    if (warmStart?.kind === 'data') {
      setData(warmStart.payload);
      setError(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    if (warmStart?.kind === 'missing') {
      setData(null);
      setError(MSG_PS_NAO_ENCONTRADO);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    if (warmStart?.kind === 'error') {
      setData(null);
      setError(warmStart.message || 'Não foi possível consultar o serviço do PS. Verifique se a API Jornada está no ar.');
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);
    setData(null);

    const url = `/api/integration/ps-journey/${encodeURIComponent(attendanceId)}`;
    fetch(url)
      .then(async (res) => {
        if (res.status === 404) {
          throw new Error(MSG_PS_NAO_ENCONTRADO);
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            typeof body.error === 'string' ? body.error : `Erro ao consultar o PS (${res.status})`
          );
        }
        return res.json() as Promise<JourneyPayload>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Falha na rede');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, attendanceId, warmStart]);

  const exams = useMemo(() => flattenExamRows(data?.steps), [data?.steps]);
  const meds = useMemo(() => flattenMedRows(data?.steps), [data?.steps]);
  const previewDestaqueDev = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const q = new URLSearchParams(window.location.search).has('previewPsMedN');
    return import.meta.env.DEV && q;
  }, [isOpen]);

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.96, y: 12 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: { type: 'spring' as const, damping: 26, stiffness: 320 },
    },
    exit: { opacity: 0, scale: 0.96, y: 12, transition: { duration: 0.18 } },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm cursor-pointer"
          />

          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            <div className="relative p-6 pb-4 bg-gradient-to-br from-slate-800 to-slate-900 border-b border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/5 text-slate-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3 pr-10">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center border border-emerald-500/25">
                  <Stethoscope className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-white tracking-tight">Histórico do Pronto Socorro</h3>
                  <p className="text-xs text-slate-400 font-mono truncate">Atendimento #{attendanceId}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
              {loading && (
                <div className="flex flex-col items-center justify-center py-14 gap-3 text-slate-400">
                  <Loader2 className="w-10 h-10 animate-spin text-emerald-500/80" />
                  <p className="text-sm font-medium">Carregando dados do PS…</p>
                </div>
              )}

              {!loading && error && (
                <div className="flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-amber-200/90">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-sm leading-relaxed">{error}</p>
                </div>
              )}

              {!loading && !error && data && (
                <>
                  <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50">
                      <div className="text-slate-500 mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                        <Clock className="w-3.5 h-3.5" />
                        Chegada ao PS
                      </div>
                      <p className="text-sm font-bold text-white">{formatDateTime(data.DT_ENTRADA)}</p>
                    </div>
                    <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50">
                      <div className="text-slate-500 mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                        <Clock className="w-3.5 h-3.5 text-blue-400" />
                        Internação (desfecho)
                      </div>
                      <p className="text-sm font-bold text-blue-300">{internacaoDisplay(data)}</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                      <FlaskConical className="w-4 h-4 text-violet-400" />
                      Exames (PS)
                    </h4>
                    {exams.length === 0 ? (
                      <p className="text-sm text-slate-500 italic">Nenhum exame laboratorial ou de imagem registrado neste fluxo.</p>
                    ) : (
                      <ul className="space-y-2">
                        {exams.map((row, idx) => (
                          <li
                            key={`${row.name}-${row.time}-${idx}`}
                            className="bg-slate-800/30 border border-slate-700/40 rounded-xl px-3 py-2.5 text-sm"
                          >
                            <span className="font-semibold text-slate-100">{row.name || 'Exame'}</span>
                            {row.time && (
                              <span className="block text-[11px] text-slate-500 mt-0.5">{formatDateTime(row.time)}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section>
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                      <Pill className="w-4 h-4 text-cyan-400" />
                      Medicações (PS)
                    </h4>
                    {meds.length === 0 ? (
                      <p className="text-sm text-slate-500 italic">Nenhuma medicação administrada listada neste atendimento.</p>
                    ) : (
                      <>
                        <ul className="space-y-2">
                          {meds.map((row, idx) => (
                            <MedPsRow key={`${row.name}-${row.time}-${idx}`} row={row} />
                          ))}
                        </ul>
                        {previewDestaqueDev && (
                          <div className="mt-3 pt-3 border-t border-dashed border-slate-600/60">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">
                              Pré-visualização do destaque (remova ?previewPsMedN=1 da URL)
                            </p>
                            <ul className="space-y-2">
                              <MedPsRow
                                row={{
                                  name: 'Medicamento exemplo (PADRAO = N na farmácia)',
                                  time: new Date().toISOString(),
                                  padrao: 'N',
                                }}
                              />
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </section>
                </>
              )}
            </div>

            <div className="p-4 bg-slate-900 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-slate-800 text-white font-bold text-sm hover:bg-slate-700 transition-colors"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ModalHistoricoPs;
