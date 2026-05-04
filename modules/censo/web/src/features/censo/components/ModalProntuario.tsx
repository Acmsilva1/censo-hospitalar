import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Calendar, Clock, Activity, ExternalLink, 
  User, TrendingUp, ShieldAlert, MapPin, 
  ArrowRightCircle, History, Copy, Check, Stethoscope, CheckCircle2,
  Loader2, AlertTriangle, WifiOff
} from 'lucide-react';
import type { Bed } from '../types/census';
import ModalHistoricoPs, { type JourneyPayload, type PsJourneyWarmStart } from './ModalHistoricoPs';

interface ModalProntuarioProps {
  isOpen: boolean;
  onClose: () => void;
  bed: Bed | null;
}

type PsProbe = 'idle' | 'loading' | 'ok' | 'missing' | 'error';

const ModalProntuario: React.FC<ModalProntuarioProps> = ({ isOpen, onClose, bed }) => {
  const [copied, setCopied] = useState(false);
  const [psHistoricoOpen, setPsHistoricoOpen] = useState(false);
  const [psProbe, setPsProbe] = useState<PsProbe>('idle');
  const [psJourneyPayload, setPsJourneyPayload] = useState<JourneyPayload | null>(null);

  const patientId =
    bed?.patientId != null && String(bed.patientId).trim() !== ''
      ? String(bed.patientId).trim()
      : null;

  useEffect(() => {
    if (!isOpen) setPsHistoricoOpen(false);
  }, [isOpen]);

  /** Ao abrir o prontuário, consulta o PS uma vez — badge e modal ficam alinhados ao que existe na API. */
  useEffect(() => {
    if (!isOpen || !patientId) {
      if (!isOpen) {
        setPsProbe('idle');
        setPsJourneyPayload(null);
      }
      return;
    }

    const ac = new AbortController();
    setPsProbe('loading');
    setPsJourneyPayload(null);

    fetch(`/api/integration/ps-journey/${encodeURIComponent(patientId)}`, { signal: ac.signal })
      .then(async (res) => {
        if (res.status === 404) {
          setPsProbe('missing');
          return;
        }
        if (!res.ok) {
          setPsProbe('error');
          return;
        }
        const data = (await res.json()) as JourneyPayload;
        setPsJourneyPayload(data);
        setPsProbe('ok');
      })
      .catch((e: unknown) => {
        const aborted =
          (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortError') ||
          (e instanceof DOMException && e.name === 'AbortError');
        if (aborted) return;
        setPsProbe('error');
      });

    return () => ac.abort();
  }, [isOpen, patientId]);

  const historicoWarmStart = useMemo((): PsJourneyWarmStart | undefined => {
    if (psProbe === 'ok' && psJourneyPayload) return { kind: 'data', payload: psJourneyPayload };
    if (psProbe === 'missing') return { kind: 'missing' };
    if (psProbe === 'error') return { kind: 'error' };
    return undefined;
  }, [psProbe, psJourneyPayload]);

  if (!bed) return null;

  /** Evita um frame com badge errado antes do primeiro fetch. */
  const psUi: PsProbe | 'loading' =
    psProbe === 'idle' && isOpen && patientId ? 'loading' : psProbe;

  const isOccupied = !!bed.patientId;
  const isCriticalUTI = bed.isUTI && (bed.stayDuration || 0) > 4;

  // Formatação de data Real vinda do ERP
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    try {
      // Se a data já estiver no formato DD/MM/YYYY (comum no Tasy), retorna direto
      if (/^\d{2}\/\d{2}\/\d{4}/.test(dateStr)) return dateStr.split(' ')[0];

      // Tenta normalizar se vier em outros formatos (ISO, etc)
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr; 
      return date.toLocaleDateString('pt-BR');
    } catch {
      return dateStr;
    }
  };

  const formattedAdmission = formatDate(bed.admissionDate) || 'Data não informada';
  const formattedDischarge = formatDate(bed.dischargeForecast) || 'Aguardando Avaliação';

  const getSectorLocationText = () => {
    if (bed.isUTI || bed.sectorType?.includes('UTI') || bed.sectorType?.includes('UPC')) {
      return 'da unidade de Terapia Intensiva (UTI)';
    } else if (bed.sectorType?.includes('ENF')) {
      return 'da Enfermaria';
    } else if (bed.sectorType?.includes('APT BLK') || bed.sectorType?.includes('BLACK')) {
      return 'do Apartamento (Black)';
    } else if (bed.sectorType?.includes('APT')) {
      return 'do Apartamento';
    } else if (bed.sectorType) {
      return `do setor de ${bed.sectorType.toLowerCase()}`;
    }
    return 'da unidade de internação';
  };

  const handleCopyId = () => {
    if (bed.patientId) {
      navigator.clipboard.writeText(bed.patientId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenTasy = () => {
    if (!bed.patientId) return;
    
    // Como o Tasy é uma 'caixa preta', abrimos a base e copiamos o ID para o Ctrl+V
    handleCopyId();
    const baseUrl = "https://tasy.medsenior.com.br/#/";
    window.open(baseUrl, 'TasyMedSenior');
  };

  // Backdrop variants
  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 }
  };

  // Modal variants
  const modalVariants: any = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: { type: 'spring', damping: 25, stiffness: 300 }
    },
    exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Blur Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md cursor-pointer"
          />

          {/* Modal Container */}
          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header / Identificação */}
            <div className="relative p-8 pb-6 bg-gradient-to-br from-slate-800 to-slate-900 border-b border-slate-800">
              <button 
                onClick={onClose}
                className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/5 text-slate-400 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-2xl bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-5xl shadow-inner group relative overflow-hidden">
                   <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                   {bed.patientEmoji || '👤'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-0.5 rounded-lg text-[10px] font-black tracking-widest uppercase">
                      Leito {bed.id}
                    </span>
                    {bed.isIsolation && (
                      <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2.5 py-0.5 rounded-lg text-[10px] font-black tracking-widest uppercase flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" /> Isolamento
                      </span>
                    )}
                  </div>
                  <h2 className="text-3xl font-black text-white truncate tracking-tight mb-2">
                    {bed.patientName || 'Leito Disponível'}
                  </h2>
                  <div className="flex items-center gap-4 text-slate-400 font-medium text-sm">
                    <div 
                      onClick={handleCopyId}
                      className="flex items-center gap-1.5 cursor-pointer hover:text-blue-400 transition-colors group/id"
                      title="Clique para copiar o número do atendimento"
                    >
                       <Activity className="w-4 h-4 text-slate-500 group-hover/id:text-blue-400" />
                       <span className="font-mono text-slate-500 group-hover/id:text-blue-400">#{bed.patientId || '---'}</span>
                       {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 opacity-0 group-hover/id:opacity-100" />}
                    </div>
                    <span>•</span>
                    <span>{bed.patientAge ? `${bed.patientAge} anos` : 'Sem idade informada'}</span>
                    <span>•</span>
                    <span className="capitalize">{bed.patientSex || 'Sexo indefinido'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
               {isOccupied ? (
                 <div className="space-y-8">
                    {/* Status Operacional */}
                    <section>
                      <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" /> Status Operacional
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50 hover:bg-slate-800/60 transition-colors">
                            <div className="text-slate-500 mb-1 flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Data da Internação</span>
                            </div>
                            <p className="text-lg font-bold text-white tracking-tight">{formattedAdmission}</p>
                            {bed.doctorAdmission && (
                              <div className="mt-1 flex items-center gap-1.5 border-t border-slate-700/50 pt-2 relative group/doc">
                                <span className="text-[9px] font-black bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded uppercase">Médico</span>
                                <p className="text-[10px] font-bold text-slate-400 truncate max-w-[140px]">{bed.doctorAdmission}</p>
                                
                                {/* Premium Tooltip */}
                                <div className="absolute bottom-full left-0 mb-2 px-2.5 py-1.5 bg-emerald-950/90 backdrop-blur-md border border-emerald-500/30 rounded-lg shadow-2xl opacity-0 invisible group-hover/doc:opacity-100 group-hover/doc:visible transition-all duration-200 z-50 whitespace-nowrap pointer-events-none translate-y-1 group-hover/doc:translate-y-0">
                                   <p className="text-[10px] font-black text-emerald-300 uppercase tracking-tight">{bed.doctorAdmission}</p>
                                   <div className="absolute top-full left-4 -mt-1 w-2 h-2 bg-emerald-950/90 border-b border-r border-emerald-500/30 rotate-45"></div>
                                </div>
                              </div>
                            )}
                         </div>
                         <div className={`p-4 rounded-2xl border transition-all duration-500 ${
                            isCriticalUTI 
                              ? 'bg-rose-500/10 border-rose-500/30 animate-pulse-fast shadow-[0_0_20px_rgba(244,63,94,0.15)]' 
                              : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/60'
                         }`}>
                            <div className="text-slate-500 mb-1 flex items-center gap-2">
                              <Clock className={`w-3.5 h-3.5 ${isCriticalUTI ? 'text-rose-400' : ''}`} />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Permanência Total</span>
                            </div>
                            <p className={`text-lg font-bold tracking-tight ${isCriticalUTI ? 'text-rose-400' : 'text-blue-400'}`}>
                              {bed.stayDuration || 0} {bed.stayDuration === 1 ? 'dia' : 'dias'}
                            </p>
                         </div>
                         <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50 hover:border-emerald-500/30 transition-colors group">
                            <div className="text-slate-500 mb-1 flex items-center gap-2">
                              <History className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Previsão de Alta</span>
                            </div>
                            <p className={`text-lg font-bold tracking-tight ${bed.dischargeForecast ? 'text-emerald-400' : 'text-slate-500 italic font-medium text-sm'}`}>
                               {formattedDischarge}
                            </p>
                            {bed.doctorDischarge && bed.dischargeForecast && (
                              <div className="mt-1 flex items-center gap-1.5 border-t border-slate-700/50 pt-2 relative group/doc">
                                <span className="text-[9px] font-black bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded uppercase">Médico</span>
                                <p className="text-[10px] font-bold text-slate-400 truncate max-w-[140px]">{bed.doctorDischarge}</p>
                                
                                {/* Premium Tooltip */}
                                <div className="absolute bottom-full left-0 mb-2 px-2.5 py-1.5 bg-emerald-950/90 backdrop-blur-md border border-emerald-500/30 rounded-lg shadow-2xl opacity-0 invisible group-hover/doc:opacity-100 group-hover/doc:visible transition-all duration-200 z-50 whitespace-nowrap pointer-events-none translate-y-1 group-hover/doc:translate-y-0">
                                   <p className="text-[10px] font-black text-emerald-300 uppercase tracking-tight">{bed.doctorDischarge}</p>
                                   <div className="absolute top-full left-4 -mt-1 w-2 h-2 bg-emerald-950/90 border-b border-r border-emerald-500/30 rotate-45"></div>
                                </div>
                              </div>
                            )}
                         </div>
                      </div>
                    </section>

                    {/* Tasy ERP Integration */}
                    <section 
                      onClick={handleOpenTasy}
                      className="bg-blue-600/5 border border-blue-500/20 p-6 rounded-3xl flex items-center justify-between group cursor-pointer hover:bg-blue-600/10 transition-all"
                    >
                       <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
                            <ExternalLink className="w-6 h-6 text-blue-400" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white uppercase tracking-tight">Abrir no Tasy (MedSenior)</h4>
                            <p className="text-xs text-slate-400">Acessar prontuário do atendimento <span className="text-blue-400 font-bold">#{bed.patientId}</span></p>
                          </div>
                       </div>
                       <ArrowRightCircle className="w-6 h-6 text-blue-500 group-hover:translate-x-1 transition-transform" />
                    </section>

                    {/* Histórico PS — probe ao abrir prontuário; só mostramos “Passou pelo PS” quando a API encontra jornada */}
                    <section
                      role="button"
                      tabIndex={0}
                      onClick={() => setPsHistoricoOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setPsHistoricoOpen(true);
                        }
                      }}
                      className={`relative p-6 rounded-3xl flex items-center justify-between group cursor-pointer transition-all outline-none overflow-hidden border ${
                        psUi === 'ok'
                          ? 'bg-emerald-600/5 border-emerald-500/25 hover:bg-emerald-600/10 hover:border-emerald-400/35 focus-visible:ring-2 focus-visible:ring-emerald-500/40'
                          : psUi === 'missing'
                            ? 'bg-amber-600/5 border-amber-500/25 hover:bg-amber-600/10 hover:border-amber-400/35 focus-visible:ring-2 focus-visible:ring-amber-500/40'
                            : psUi === 'error'
                              ? 'bg-slate-600/5 border-slate-600/40 hover:bg-slate-600/10 focus-visible:ring-2 focus-visible:ring-slate-500/30'
                              : 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/50 focus-visible:ring-2 focus-visible:ring-slate-500/30'
                      }`}
                      aria-label={
                        psUi === 'ok'
                          ? 'Histórico do Pronto Socorro — jornada PS encontrada para este número'
                          : 'Histórico do Pronto Socorro — consultar vínculo com o PS'
                      }
                    >
                      <span
                        className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-3xl pointer-events-none ${
                          psUi === 'ok'
                            ? 'bg-gradient-to-b from-emerald-400/90 via-emerald-500/70 to-emerald-600/40'
                            : psUi === 'missing'
                              ? 'bg-gradient-to-b from-amber-400/90 via-amber-600/60 to-amber-800/40'
                              : 'bg-gradient-to-b from-slate-500/60 via-slate-600/40 to-slate-800/30'
                        }`}
                        aria-hidden
                      />
                      <div className="flex items-center gap-4 pl-1">
                        <div
                          className={`relative w-12 h-12 rounded-xl flex items-center justify-center border shadow-[0_0_20px_rgba(52,211,153,0.08)] ${
                            psUi === 'ok'
                              ? 'bg-emerald-500/20 border-emerald-500/25'
                              : psUi === 'missing'
                                ? 'bg-amber-500/15 border-amber-500/25'
                                : 'bg-slate-700/40 border-slate-600/40'
                          }`}
                        >
                          <Stethoscope
                            className={`w-6 h-6 ${
                              psUi === 'ok' ? 'text-emerald-400' : psUi === 'missing' ? 'text-amber-400' : 'text-slate-400'
                            }`}
                          />
                          {(psUi === 'loading' || psUi === 'idle') && (
                            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 border border-slate-600">
                              <Loader2 className="h-2.5 w-2.5 animate-spin text-emerald-400" aria-hidden />
                            </span>
                          )}
                          {psUi === 'ok' && (
                            <span
                              className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 border border-slate-900"
                              title="Jornada PS encontrada na base"
                            >
                              <CheckCircle2 className="h-2.5 w-2.5 text-white" aria-hidden />
                            </span>
                          )}
                          {psUi === 'missing' && (
                            <span
                              className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 border border-slate-900"
                              title="Sem dados do Pronto Socorro"
                            >
                              <AlertTriangle className="h-2.5 w-2.5 text-slate-900" aria-hidden />
                            </span>
                          )}
                          {psUi === 'error' && (
                            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-600 border border-slate-900">
                              <WifiOff className="h-2.5 w-2.5 text-white" aria-hidden />
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 gap-y-1 mb-0.5">
                            <h4 className="text-sm font-bold text-white uppercase tracking-tight">Histórico do Pronto Socorro</h4>
                            {(psUi === 'loading' || psUi === 'idle') && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-600/25 border border-slate-500/35 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-400 shrink-0">
                                <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
                                A verificar…
                              </span>
                            )}
                            {psUi === 'ok' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-400/35 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300 shrink-0">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" aria-hidden />
                                Passou pelo PS
                              </span>
                            )}
                            {psUi === 'missing' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-400/40 px-2 py-0.5 text-[9px] font-bold tracking-tight text-amber-100 shrink-0 max-w-[min(100%,14rem)] text-center leading-tight">
                                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" aria-hidden />
                                Sem dados do Pronto Socorro
                              </span>
                            )}
                            {psUi === 'error' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-600/30 border border-slate-500/35 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-400 shrink-0">
                                <WifiOff className="w-3 h-3" aria-hidden />
                                PS indisponível
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">
                            {psUi === 'missing' ? (
                              <>
                                <span className="text-amber-200/95">Sem dados do Pronto Socorro</span>
                                <span className="text-amber-400/90 font-bold font-mono ml-1">#{bed.patientId}</span>
                              </>
                            ) : (
                              <>
                                Chegada, internação, exames e medicações no PS{' '}
                                <span
                                  className={`font-bold font-mono ${
                                    psUi === 'ok' ? 'text-emerald-400' : 'text-slate-400'
                                  }`}
                                >
                                  #{bed.patientId}
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      <ArrowRightCircle
                        className={`w-6 h-6 shrink-0 transition-transform group-hover:translate-x-1 ${
                          psUi === 'ok'
                            ? 'text-emerald-500'
                            : psUi === 'missing'
                              ? 'text-amber-500'
                              : 'text-slate-500'
                        }`}
                      />
                    </section>

                    <ModalHistoricoPs
                      isOpen={psHistoricoOpen}
                      onClose={() => setPsHistoricoOpen(false)}
                      attendanceId={bed.patientId || ''}
                      warmStart={historicoWarmStart}
                    />

                    {/* Localização */}
                    <section>
                      <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <MapPin className="w-4 h-4" /> Localização Atual
                      </h3>
                      <div className="bg-slate-800/20 border border-slate-700/30 p-4 rounded-2xl text-slate-400 text-sm font-medium">
                         O paciente encontra-se no leito <span className="text-white font-bold">{bed.id}</span> {getSectorLocationText()}.
                      </div>
                    </section>
                 </div>
               ) : (
                 <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-20 h-20 rounded-full bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mb-4">
                      <User className="w-10 h-10 text-slate-600" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-400 mb-2">Sem Paciente no Momento</h3>
                    <p className="text-slate-500 text-sm max-w-xs">Este leito está em status {bed.status}. Aguardando admissão ou transferência.</p>
                 </div>
               )}
            </div>

            {/* Sticky Footer */}
            <div className="p-6 bg-slate-900 border-t border-slate-800 flex justify-end gap-3">
              <button 
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-slate-800 text-white font-bold text-sm hover:bg-slate-700 transition-colors"
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

export default ModalProntuario;
