import React, { memo, useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CardLeito } from './CardLeito';
import { 
  Users, CheckCircle2, LayoutGrid, AlertTriangle 
} from 'lucide-react';
import { deriveBedFlags } from '../types/census';

interface GridSetorProps {
  floorName: string;
  setorName: string;
  leitos: any[];
  onBedClick?: (bed: any) => void;
}

type FilterMode = 'todos' | 'ocupados' | 'livres' | 'prioritarios';

export const GridSetor: React.FC<GridSetorProps> = memo(({ floorName, setorName, leitos, onBedClick }) => {
  const [filterMode, setFilterMode] = useState<FilterMode>('todos');

  const isUTI = floorName.toUpperCase().includes('UTI') || setorName.toUpperCase().includes('UTI');

  // Reset do filtro se o setor ou andar mudar
  useEffect(() => {
    setFilterMode('todos');
  }, [floorName, setorName]);

  // Lógica de Filtragem Exclusiva
  const filteredLeitos = useMemo(() => {
    let list = [...leitos];
    
    // Ordem Numérica Base
    list.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));

    if (filterMode === 'todos') return list;

    if (filterMode === 'ocupados') {
      return list.filter(leito => {
        const { isOccupied, isDischarged } = deriveBedFlags(leito);
        return isOccupied || isDischarged || leito.isIsolation;
      });
    }

    if (filterMode === 'livres') {
      return list.filter(leito => {
        const { isFree } = deriveBedFlags(leito);
        return isFree;
      });
    }

    if (filterMode === 'prioritarios') {
      return list.filter(leito => (leito.stayDuration || 0) > 4);
    }

    return list;
  }, [leitos, filterMode]);

  return (
    <div className="mb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-[var(--border)]/40 pb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-bold text-white tracking-tight">{setorName}</h3>
          <span className="bg-slate-800/80 text-slate-400 text-[10px] uppercase tracking-widest font-black px-2.5 py-1 rounded-lg border border-slate-700/50 shadow-inner">
            {leitos.length} LEITOS
          </span>
        </div>

        {/* Filtro Segmentado Premium */}
        <div className="flex items-center bg-slate-900/60 p-1 rounded-xl border border-slate-800 shadow-xl overflow-hidden">
           <button
             onClick={() => setFilterMode('todos')}
             className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${filterMode === 'todos' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-inner' : 'text-slate-500 hover:text-slate-300'}`}
           >
             <LayoutGrid className="w-3.5 h-3.5" />
             TODOS
           </button>
           
           {isUTI && (
             <button
               onClick={() => setFilterMode('prioritarios')}
               className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${filterMode === 'prioritarios' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-inner' : 'text-rose-500/60 hover:text-rose-400'}`}
             >
               <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
               ALERTA
             </button>
           )}

           <button
             onClick={() => setFilterMode('ocupados')}
             className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${filterMode === 'ocupados' ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30 shadow-inner' : 'text-slate-500 hover:text-slate-300'}`}
           >
             <Users className="w-3.5 h-3.5" />
             OCUPADOS
           </button>
           <button
             onClick={() => setFilterMode('livres')}
             className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${filterMode === 'livres' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner' : 'text-slate-500 hover:text-slate-300'}`}
           >
             <CheckCircle2 className="w-3.5 h-3.5" />
             LIVRES
           </button>
        </div>
      </div>
      
      <motion.div 
        layout
        transition={{ 
          layout: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
          opacity: { duration: 0.4 }
        }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1600px]:grid-cols-6 min-[1920px]:grid-cols-7 min-[2200px]:grid-cols-8 gap-4"
      >
        <AnimatePresence>
          {filteredLeitos.map((leito) => (
            <CardLeito 
              key={leito.id} 
              floorName={floorName} 
              setorName={setorName} 
              leito={leito} 
              onClick={() => onBedClick?.(leito)}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
});
