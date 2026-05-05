import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { User, Activity, Clock, CalendarDays, CheckCircle2, Biohazard, Lock, Home, AlertTriangle, XCircle } from 'lucide-react';
import type { Bed } from '../types/census';
import { deriveBedFlags } from '../types/census';

interface LeitoProps {
  floorName: string;
  setorName: string;
  leito: Bed;
  onClick?: () => void;
}

const ENABLE_TOOLTIP = false; // Chave do "baú": mude para true para religar o tooltip

export const CardLeito: React.FC<LeitoProps> = memo(({ floorName, setorName, leito, onClick }) => {
  // Flags derivadas centralmente — zero duplicação de lógica
  const { isOccupied, isCleaning, isMaintenance, isInterdicted, isReserved, isFree, isInactive } = deriveBedFlags(leito);

  const isUTI = floorName.toUpperCase().includes('UTI') || setorName.toUpperCase().includes('UTI');
  const isCriticalUTI = isUTI && (leito.stayDuration || 0) > 4;

  let ringColor = 'border-[var(--status-free)]/60 group-hover:border-[var(--status-free)] shadow-[0_4px_12px_rgba(114,233,180,0.05)]';
  let badgeColor = 'text-[var(--status-free)] bg-[var(--status-free)]/15 backdrop-blur-md border-[var(--status-free)]/20 shadow-[0_0_15px_rgba(114,233,180,0.1)]';

  if (isCriticalUTI) {
    ringColor = 'border-rose-500/80 shadow-[0_8px_25px_rgba(244,63,94,0.3)] animate-pulse-red border-2';
    badgeColor = 'text-rose-400 bg-rose-500/20 backdrop-blur-md border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.2)] animate-pulse-fast';
  } else if (isInactive) {
    ringColor = 'border-slate-600/40 group-hover:border-slate-500 opacity-60';
    badgeColor = 'text-slate-400 bg-slate-400/10 border-slate-400/20';
  } else if (leito.isDischarged) {
    ringColor = 'border-[var(--status-discharge)] group-hover:border-[var(--status-discharge)] shadow-[0_8px_20px_rgba(6,182,212,0.25)] animate-pulse-subtle border-2';
    badgeColor = 'text-[var(--status-discharge)] bg-[var(--status-discharge)]/20 backdrop-blur-lg border-[var(--status-discharge)]/30 shadow-[0_0_20px_rgba(6,182,212,0.20)] animate-float';
  } else if (leito.isIsolation) {
    ringColor = 'border-[var(--status-cleaning)]/75 group-hover:border-[var(--status-cleaning)] shadow-[0_6px_15px_rgba(245,158,11,0.15)]';
    badgeColor = 'text-amber-400 bg-amber-400/20 backdrop-blur-md border-amber-400/30 shadow-[0_0_15px_rgba(245,158,11,0.2)] animate-glow';
  } else if (isOccupied) {
    ringColor = 'border-[var(--status-occupied)]/50 group-hover:border-[var(--status-occupied)] shadow-[0_4px_15px_rgba(167,139,250,0.15)]';
    badgeColor = 'text-[var(--status-occupied)] bg-[var(--status-occupied)]/15 backdrop-blur-md border-[var(--status-occupied)]/20 shadow-[0_0_20px_rgba(167,139,250,0.2)]';
  } else if (isReserved) {
    ringColor = 'border-blue-500/70 group-hover:border-blue-400 shadow-[0_6px_15px_rgba(59,130,246,0.18)]';
    badgeColor = 'text-blue-400 bg-blue-500/15 backdrop-blur-md border-blue-500/25 shadow-[0_0_15px_rgba(59,130,246,0.14)]';
  } else if (isCleaning) {
    ringColor = 'border-[var(--status-cleaning)]/60 group-hover:border-[var(--status-cleaning)] shadow-[0_4px_12px_rgba(245,158,11,0.08)]';
    badgeColor = 'text-[var(--status-cleaning)] bg-[var(--status-cleaning)]/15 backdrop-blur-md border-[var(--status-cleaning)]/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]';
  } else if (isMaintenance) {
    ringColor = 'border-[var(--status-maintenance)]/60 group-hover:border-[var(--status-maintenance)] shadow-[0_4px_12px_rgba(168,85,247,0.08)]';
    badgeColor = 'text-[var(--status-maintenance)] bg-[var(--status-maintenance)]/15 backdrop-blur-md border-[var(--status-maintenance)]/20 shadow-[0_0_15px_rgba(168,85,247,0.1)]';
  } else if (isInterdicted) {
    ringColor = 'border-slate-500/75 group-hover:border-slate-400 shadow-[0_4px_12px_rgba(148,163,184,0.1)]';
    badgeColor = 'text-slate-300 bg-slate-500/20 backdrop-blur-md border-slate-500/30 animate-pulse-fast';
  }

  const cardRef = React.useRef<HTMLDivElement>(null);
  const [isFlipped, setIsFlipped] = React.useState(false);

  const checkPosition = () => {
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // Se tiver menos de 280px abaixo, joga o tooltip para cima
      setIsFlipped(spaceBelow < 280);
    }
  };

  const bgTint = isOccupied 
    ? 'bg-violet-500/10 backdrop-blur-2xl border-violet-500/20 shadow-inner' 
    : leito.isDischarged 
    ? 'bg-cyan-500/5 backdrop-blur-xl border-cyan-500/20'
    : 'bg-slate-800/60 backdrop-blur-md border-slate-700/50';

  return (
    <motion.div
      ref={cardRef}
      onMouseEnter={checkPosition}
      onClick={onClick}
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      whileHover={{ scale: 1.02, zIndex: 50 }}
      transition={{ 
        layout: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.4 }
      }}
      className={`group relative ${bgTint} ${ringColor} border rounded-2xl p-4 transition-all duration-300 hover:shadow-2xl cursor-pointer overflow-visible flex flex-col`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
      
      <div className="flex justify-between items-start mb-3 relative z-10 w-full">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center min-w-[48px] h-[48px] px-3 rounded-full bg-white/10 border border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.05)] backdrop-blur-md">
            <span className="text-xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] tracking-tighter">
              {leito.id}
            </span>
          </div>
        </div>
        <span className={`text-[11px] uppercase tracking-wider font-bold h-7 px-3 rounded-full border ${badgeColor} inline-flex items-center gap-2 shadow-lg transition-all duration-300`}>
          {leito.isDischarged && <Home className="w-3.5 h-3.5" />}
          {leito.isIsolation && !leito.isDischarged && <Biohazard className="w-3.5 h-3.5 text-amber-500 animate-pulse" />}
          {isOccupied && !leito.isIsolation && !leito.isDischarged && <Activity className="w-3.5 h-3.5 text-[var(--status-occupied)] animate-heartbeat" />}
          {isCleaning && <Clock className="w-3.5 h-3.5 animate-spin-slow" />}
          {isFree && !leito.isDischarged && <CheckCircle2 className="w-3.5 h-3.5 animate-pulse" />}
          {isMaintenance && !leito.isIsolation && <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />}
          {isInterdicted && <XCircle className="w-3.5 h-3.5 animate-pulse text-slate-400" />}
          {isReserved && <Lock className="w-3.5 h-3.5 animate-bounce" style={{ animationDuration: '3s' }} />}
          
          <span className="whitespace-nowrap">
            {leito.isDischarged ? 'Alta Confirmada' : (leito.isIsolation ? 'Isolamento' : leito.status)}
          </span>
        </span>
      </div>

      <div className="mt-auto h-[72px] flex items-center justify-center relative z-10 w-full">
        {leito.patientId ? (
          <div className="w-full h-full bg-slate-800/50 border border-slate-700/80 rounded-xl p-3 flex flex-col justify-center shadow-inner relative overflow-hidden group-hover:bg-slate-800/80 transition-colors">
            {/* Linha Lateral Lilás Glassy (Ocupado), Verde (Livre) ou Ciano (Alta) */}
            <div className={`absolute top-0 left-0 w-1 h-full ${leito.isDischarged ? 'bg-cyan-400' : 'bg-violet-400/60 shadow-[0_0_10px_rgba(167,139,250,0.5)]'}`}></div>
            
            <div className="flex items-center gap-2 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                {leito.patientEmoji ? (
                  <span className="text-xl leading-none">{leito.patientEmoji}</span>
                ) : (
                  <User className="w-4 h-4 text-slate-400" />
                )}
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-slate-100 truncate">
                      {leito.patientName || 'Paciente Anonimizado'}
                    </p>
                    {/* Ícone de Gênero Normalizado - Aumentado para visibilidade máxima */}
                    {(leito.patientSex?.toUpperCase().startsWith('M')) && <span className="text-lg text-blue-400 font-black ml-1">♂</span>}
                    {(leito.patientSex?.toUpperCase().startsWith('F')) && <span className="text-lg text-rose-400 font-black ml-1">♀</span>}
                  </div>
                  {leito.patientAge && (
                    <p className="text-[10px] font-bold text-slate-400">
                      {leito.patientAge} ANOS
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center ml-7 mt-1">
               <p className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">
                 ID: #{leito.patientId}
               </p>
               {/* Tempo de Permanência: Verde Esmeralda (Normal) vs Vermelho Rose (Crítico UTI) */}
               {leito.stayDuration !== undefined && (
                 <div className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-all duration-500 ${
                   isCriticalUTI 
                     ? 'bg-rose-500/20 border-rose-500/30 animate-pulse-fast' 
                     : 'bg-emerald-500/10 border-emerald-500/20'
                 }`}>
                    <Clock className={`w-3 h-3 ${isCriticalUTI ? 'text-rose-400' : 'text-emerald-400'}`} />
                    <span className={`text-[10px] font-bold whitespace-nowrap ${isCriticalUTI ? 'text-rose-400' : 'text-emerald-400'}`}>
                       {leito.stayDuration} {leito.stayDuration === 1 ? 'DIA' : 'DIAS'}
                    </span>
                 </div>
               )}
            </div>
          </div>
        ) : (
          <div className={`w-full h-full border border-dashed rounded-xl flex items-center justify-center text-sm font-medium transition-all duration-300 ${
            isOccupied
              ? 'border-rose-500/40 bg-rose-500/5 text-rose-400'
              : isReserved 
              ? 'border-blue-500/40 bg-blue-500/5 text-blue-400' 
              : isCleaning
              ? 'border-amber-500/30 bg-amber-500/5 text-amber-400'
              : isMaintenance
              ? 'border-purple-500/30 bg-purple-500/5 text-purple-400'
              : isInterdicted
              ? 'border-slate-500/40 bg-slate-500/5 text-slate-400'
              : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-500/90'
          }`}>
            {isOccupied ? 'Ocupado (Sem Dados)' : isCleaning ? 'Aguardando Liberação' : (isReserved ? 'Leito Reservado' : (isMaintenance ? 'Em Manutenção' : (isInterdicted ? 'Leito Interditado' : 'Disponível')))}
          </div>
        )}
      </div>

      {/* Tooltip Float (TRANCADO NO BAU) */}
      {ENABLE_TOOLTIP && leito.patientId && (
        <div className={`absolute ${isFlipped ? 'bottom-full mb-3' : 'top-full mt-3'} left-1/2 -translate-x-1/2 w-64 p-4 bg-slate-900/95 backdrop-blur-xl border border-slate-700 shadow-2xl rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[100] transform ${isFlipped ? '-translate-y-2' : 'translate-y-2'} group-hover:translate-y-0 scale-95 group-hover:scale-100 ${isFlipped ? 'origin-bottom' : 'origin-top'}`}>
          {/* Arrow */}
          <div className={`absolute ${isFlipped ? '-bottom-2 border-b border-r' : '-top-2 border-t border-l'} left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-900/95 border-slate-700 rotate-45`}></div>
          
          <div className="relative z-10 flex flex-col gap-3">
             <div className="pb-1 border-b border-slate-800">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Dados do Paciente</p>
                  {leito.isDischarged && <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-500/30 animate-pulse">ALTA HOJE</span>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-2xl border border-slate-700 shadow-inner">
                    {leito.patientEmoji || '👤'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-100 truncate leading-tight">{leito.patientName || 'Paciente Anonimizado'}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/30 tracking-tighter">Checado!</span>
                      <p className="text-[11px] text-slate-300 font-mono font-bold tracking-tight">#{leito.patientId}</p>
                    </div>
                  </div>
                </div>
             </div>
  
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                   <p className="text-slate-500 mb-0.5">Sexo</p>
                   <p className="font-semibold text-slate-200">{leito.patientSex || 'N/A'}</p>
                </div>
                <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                   <p className="text-slate-500 mb-0.5">Idade</p>
                   <p className="font-semibold text-slate-200">{leito.patientAge ? `${leito.patientAge} anos` : 'N/A'}</p>
                </div>
             </div>

             {leito.stayDuration !== undefined && leito.stayDuration > 0 && (
               <div className="bg-cyan-500/5 p-2.5 rounded-lg border border-cyan-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-3.5 h-3.5 text-cyan-400" />
                    <p className="text-xs text-slate-400">Permanência</p>
                  </div>
                  <p className="text-xs font-bold text-cyan-400">{leito.stayDuration} {leito.stayDuration === 1 ? 'dia' : 'dias'}</p>
               </div>
             )}

             {!leito.isDischarged && (
               <div className="mt-1 pt-2 border-t border-slate-800 flex items-center gap-2">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Status: {leito.status}</p>
               </div>
             )}
          </div>
        </div>
      )}
    </motion.div>
  );
});
