import { useState, useEffect, useMemo, useRef } from 'react';
import { useCenso } from '../hooks/useCenso';
import { GridSetor } from '../components/GridSetor';

import { 
  Activity, LayoutDashboard, User, Search, RefreshCcw, Clock,
  Heart, CheckCircle2, AlertTriangle, Lock, Home, XCircle, Biohazard,
  Building2, ChevronDown
} from 'lucide-react';
import type { Bed } from '../types/census';
import ModalProntuario from '../components/ModalProntuario';
import { formatHospitalName } from '../../../shared/utils/formatters';

const CountdownTimer: React.FC<{ nextUpdate: string | null }> = ({ nextUpdate }) => {
  const [timeLeft, setTimeLeft] = useState<string>('--:--');

  useEffect(() => {
    if (!nextUpdate) {
      setTimeLeft('--:--');
      return;
    }

    const timer = setInterval(() => {
      const target = new Date(nextUpdate).getTime();
      const now = new Date().getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft('00:00');
        return;
      }

      const minutes = Math.floor(diff / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [nextUpdate]);

  return <>{timeLeft}</>;
};

const Dashboard: React.FC = () => {
  const [activeHospital, setActiveHospital] = useState('');
  const [activeFloor, setActiveFloor] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBed, setSelectedBed] = useState<Bed | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hospitalMenuOpen, setHospitalMenuOpen] = useState(false);
  const hospitalMenuRef = useRef<HTMLDivElement | null>(null);
  
  const { data, loading, error, hospitals, lastUpdate, nextUpdate, stats } = useCenso(activeHospital);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (data && isFirstLoad.current) {
      isFirstLoad.current = false;
    }
  }, [data]);

  // Lógica de Filtragem de Dados (Busca)
  const filteredData = useMemo(() => {
    if (!data || !searchTerm) return data;
    
    const term = searchTerm.toLowerCase().trim();
    const result: any = {};
    
    Object.entries(data).forEach(([floorName, sectors]) => {
      const filteredSectors: any = {};
      let floorHasMatch = false;
      
      Object.entries(sectors as any).forEach(([sectorName, beds]) => {
        const matchingBeds = (beds as any[]).filter((bed: any) => 
          (bed.id && bed.id.toLowerCase().includes(term)) || 
          (bed.patientName && bed.patientName.toLowerCase().includes(term)) ||
          (bed.patientId && bed.patientId.toLowerCase().includes(term))
        );
        
        if (matchingBeds.length > 0) {
          filteredSectors[sectorName] = matchingBeds;
          floorHasMatch = true;
        }
      });
      
      if (floorHasMatch) {
        result[floorName] = filteredSectors;
      }
    });
    
    return result;
  }, [data, searchTerm]);

  // Carregar lista de hospitais via API Service


  // Lógica do Cronômetro removida: tela atualiza apenas via push do servidor a cada 10 minutos

  // Definir primeiro hospital como ativo quando a lista carregar
  useEffect(() => {
    if (hospitals.length > 0 && !activeHospital) {
      setActiveHospital(hospitals[0]);
    }
  }, [hospitals, activeHospital]);

  const handleFloorSelect = (floorName: string) => {
    setActiveFloor(floorName);
  };


  // Se os andares carregaram do Socket, pegar o ativo, caso contrario o primeiro
  const floorKeys = filteredData ? Object.keys(filteredData).sort((a, b) => 
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  ) : [];
  const currentFloorKey = activeFloor && floorKeys.includes(activeFloor) ? activeFloor : floorKeys[0];
  const hospitalsByRegional = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const hospital of hospitals) {
      const formatted = formatHospitalName(hospital);
      const regional = (formatted.split(' - ')[0] || 'OUTROS').trim();
      if (!groups.has(regional)) groups.set(regional, []);
      groups.get(regional)!.push(hospital);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([regional, items]) => ({
        regional,
        items: items.sort((h1, h2) =>
          formatHospitalName(h1).localeCompare(formatHospitalName(h2), 'pt-BR', { sensitivity: 'base' })
        ),
      }));
  }, [hospitals]);

  const currentFloorData = filteredData && currentFloorKey ? filteredData[currentFloorKey] : null;

  // Sincronizar activeFloor apenas se necessário (primeira carga ou busca filtrada)
  useEffect(() => {
    if (floorKeys.length > 0 && !activeFloor) {
      setActiveFloor(floorKeys[0]);
    }
  }, [floorKeys, activeFloor]);

  useEffect(() => {
    function onClickOutside(ev: MouseEvent) {
      if (!hospitalMenuRef.current) return;
      if (!hospitalMenuRef.current.contains(ev.target as Node)) {
        setHospitalMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Sincronizar activeFloor quando a busca filtrar os andares (apenas se o atual sumir do filtro)
  useEffect(() => {
    if (searchTerm && floorKeys.length > 0 && !floorKeys.includes(activeFloor || '')) {
       setActiveFloor(floorKeys[0]);
    }
  }, [floorKeys, searchTerm, activeFloor]);

  return (
    <>
      <div className="dark-blue flex h-screen bg-[var(--background)] text-[var(--foreground)] font-sans overflow-hidden">


      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-[var(--background)] relative isolate overflow-hidden">
        {/* Efeitos Decorativos de Luz (Glassmorphism ambient) */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none mix-blend-screen" />

        {/* Topbar Placeholder */}
        <header className="h-[76px] px-8 flex items-center justify-between border-b border-[var(--border)] bg-[var(--background)]/40 backdrop-blur-xl z-20 shrink-0 shadow-sm relative">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              {activeHospital ? formatHospitalName(activeHospital) : 'Selecionando Hospital...'}
            </h2>
            <div className="h-5 w-[1px] bg-slate-700" />

            {/* Legenda de Status - Horizontal */}
            <div className="hidden xl:flex items-center gap-3 ml-2 pl-4 border-l border-slate-700/50">
              {[
                { label: 'Ocupado', icon: Heart, anim: 'animate-heartbeat', color: 'text-violet-400 bg-violet-500/15' },
                { label: 'Isolamento', icon: Biohazard, anim: 'animate-pulse', color: 'text-amber-500 bg-amber-500/10' },
                { label: 'Disponível', icon: CheckCircle2, anim: 'animate-pulse', color: 'text-emerald-400 bg-emerald-500/10' },
                { label: 'Higienização', icon: Clock, anim: 'animate-spin-slow', color: 'text-amber-400 bg-amber-500/10' },
                { label: 'Reservado', icon: Lock, anim: 'animate-bounce', color: 'text-indigo-400 bg-indigo-500/10' },
                { label: 'Manutenção', icon: AlertTriangle, anim: 'animate-pulse', color: 'text-purple-400 bg-purple-500/10' },
                { label: 'Interditado', icon: XCircle, anim: 'animate-pulse', color: 'text-slate-400 bg-slate-500/10' },
                { label: 'Alta Confirmada', icon: Home, anim: 'animate-float', color: 'text-cyan-400 bg-cyan-500/10' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5 group cursor-default">
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center shadow-inner border border-white/5 ${item.color}`}>
                    <item.icon className={`w-4.5 h-4.5 ${item.anim}`} />
                  </div>
                  <span className="text-[14px] font-bold text-slate-400 group-hover:text-slate-200 transition-colors uppercase tracking-tight whitespace-nowrap">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-2 text-slate-400">
                  <RefreshCcw className="w-3.5 h-3.5 animate-spin-slow" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Próxima carga em</span>
                </div>
                <div className="text-lg font-mono font-bold text-blue-400 tracking-tighter">
                  <CountdownTimer nextUpdate={nextUpdate} />
                </div>
              </div>
              
              <div className="h-10 w-[1px] bg-slate-800" />

              <div className="flex flex-col items-end">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Última atualização</span>
                </div>
                <div className="text-sm font-semibold text-slate-300">
                  {lastUpdate ? new Date(lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                </div>
              </div>
            </div>

            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-slate-700 to-slate-800 border border-slate-600 shadow-inner flex items-center justify-center">
              <User className="w-5 h-5 text-slate-300" />
            </div>
          </div>
        </header>

        {/* Controles e Filtros Tab Fixo */}
        <div className="bg-slate-800/60 backdrop-blur-xl border-b border-[var(--border)] px-8 py-4 z-20 shrink-0 flex items-center justify-between gap-4">
           {/* Esquerda: Seletor de Andar */}
           <div className="flex-1 flex items-center gap-6 overflow-hidden">
             {data && floorKeys.length > 0 && (
               <div className="bg-slate-800/40 border border-slate-700/50 p-1.5 rounded-2xl inline-flex gap-1 shadow-2xl max-w-full overflow-x-auto no-scrollbar shrink-0">
                  {floorKeys.map(floor => {
                    const pct = stats?.floors?.[floor]?.occupancyPct ?? 0;
                    return (
                      <button 
                        key={`floor-tab-${floor}`}
                        onClick={() => handleFloorSelect(floor)}
                        className={`px-5 py-2 text-sm font-bold rounded-xl whitespace-nowrap transition-all duration-300 flex items-center gap-2 ${
                          currentFloorKey === floor 
                            ? 'bg-gradient-to-b from-blue-500 to-blue-600 shadow-lg text-white ring-1 ring-blue-400/50 z-10' 
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                        }`}
                      >
                        {floor}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                          currentFloorKey === floor 
                            ? 'bg-amber-400 text-blue-950 font-black shadow-sm' 
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {pct}%
                        </span>
                      </button>
                    );
                  })}
               </div>
             )}
           </div>

           {/* Direita: KPI, Hospitais e Busca */}
           <div className="flex items-center gap-6 shrink-0 ml-4">
             {/* Mega KPI de Ocupação */}
             {data && (
               <div className="flex items-center gap-4 bg-gradient-to-r from-blue-600/20 to-blue-400/5 border border-blue-500/30 pl-3 pr-6 py-2 rounded-2xl shadow-[0_0_20px_rgba(59,130,246,0.15)] group relative overflow-hidden shrink-0">
                 <div className="absolute inset-0 bg-blue-400/10 w-[50%] blur-[15px] group-hover:w-full transition-all duration-700" />
                 <div className="bg-blue-500/20 w-12 h-12 rounded-xl flex items-center justify-center border border-blue-400/30 shadow-inner z-10">
                   <span className="text-[22px] leading-none drop-shadow-[0_0_8px_rgba(96,165,250,0.8)] group-hover:scale-110 transition-transform duration-500 will-change-transform">🏥</span>
                 </div>
                 <div className="flex flex-col z-10 justify-center">
                   <span className="text-[10px] uppercase font-black text-blue-300/70 tracking-[0.2em] leading-none mb-1.5">Taxa de Ocupação</span>
                   <div className="flex items-baseline gap-0.5">
                     <span className="text-[26px] font-black text-white leading-none tracking-tighter">{stats?.globalOccupancyPct ?? 0}</span>
                     <span className="text-xl font-bold text-blue-400 leading-none">%</span>
                   </div>
                 </div>
               </div>
             )}

             <div className="h-8 w-[1px] bg-slate-700/50" />

             {/* Filtros de Setup */}
             <div className="flex items-center gap-4">
              <div className="relative group min-w-[280px]" ref={hospitalMenuRef}>
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setHospitalMenuOpen((v) => !v)}
                  className="w-full text-left bg-slate-800/60 border border-slate-600/50 rounded-xl py-2.5 pl-10 pr-10 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 text-slate-200 shadow-inner cursor-pointer hover:border-slate-500/60 transition"
                >
                  {activeHospital ? formatHospitalName(activeHospital) : 'Selecione um hospital'}
                </button>
                <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none transition-transform ${hospitalMenuOpen ? 'rotate-180' : ''}`} />

                {hospitalMenuOpen && (
                  <div className="absolute left-0 right-0 mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-600/60 bg-slate-900/95 backdrop-blur-xl shadow-2xl z-50 custom-scrollbar">
                    {!hospitals.length && (
                      <div className="px-3 py-2 text-xs text-slate-400">Sem hospitais disponíveis</div>
                    )}
                    {hospitalsByRegional.map(({ regional, items }) => (
                      <div key={regional} className="border-b border-slate-700/60 last:border-b-0 py-1">
                        {items.map((h) => {
                          const isActive = activeHospital === h;
                          return (
                            <button
                              key={h}
                              type="button"
                              onClick={() => {
                                setActiveHospital(h);
                                setActiveFloor(null);
                                setHospitalMenuOpen(false);
                              }}
                              className={`w-full px-3 py-1.5 text-left text-sm font-semibold transition ${
                                isActive
                                  ? 'bg-blue-600/70 text-white'
                                  : 'text-slate-200 hover:bg-slate-700/80 hover:text-white'
                              }`}
                            >
                              {formatHospitalName(h)}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative group min-w-[280px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                <input 
                  type="text"
                  placeholder="Buscar leito ou paciente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-600/50 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all text-slate-100 shadow-inner"
                />
              </div>
           </div>
        </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-4 md:px-8 py-8 relative z-10 custom-scrollbar">
           <div className="w-full mx-auto min-h-full flex flex-col">
              {loading && !data && (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 min-h-[400px]">
                   <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                   <p className="font-medium animate-pulse italic">Iniciando conexão segura e mapeando leitos...</p>
                </div>
              )}

              {error && !data && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-6 rounded-2xl flex items-center gap-4 animate-in fade-in slide-in-from-top-4">
                   <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center">
                     <Activity className="w-6 h-6 border-2 border-rose-500/40 rounded-full p-1" />
                   </div>
                   <div>
                     <p className="font-bold text-lg">Erro de Comunicação</p>
                     <p className="text-sm opacity-80">{error}</p>
                   </div>
                </div>
              )}

              {!loading && !data && !error && (
                 <div className="flex-1 flex flex-col items-center justify-center text-slate-600 opacity-50">
                    <LayoutDashboard className="w-16 h-16 mb-4 stroke-1" />
                    <p className="font-medium text-lg">Selecione um hospital para visualizar o censo</p>
                 </div>
              )}

              {data && (
                <div className={isFirstLoad.current ? "animate-in fade-in duration-700" : ""}>
                  {floorKeys.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-20 bg-slate-800/20 rounded-3xl border border-dashed border-slate-700">
                      <Search className="w-12 h-12 mb-4 opacity-20" />
                      <p className="text-lg font-medium">Nenhum leito encontrado com estes critérios</p>
                      <button onClick={() => setSearchTerm('')} className="mt-4 text-blue-400 font-bold hover:underline">Limpar filtros</button>
                    </div>
                  ) : (
                    <>

                      {/* Renderização das Alas (Setores) do Andar Ativo */}
                      {currentFloorData && (
                        <div className="flex-1 pb-20">
                          {Object.keys(currentFloorData).map(areaKey => (
                            <GridSetor 
                              key={`setor-${currentFloorKey}-${areaKey}`} 
                              floorName={currentFloorKey}
                              setorName={areaKey} 
                              leitos={currentFloorData[areaKey]} 
                              onBedClick={(bed) => {
                                setSelectedBed(bed);
                                setIsModalOpen(true);
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
           </div>
        </div>
      </main>
    </div>
    <ModalProntuario 
      isOpen={isModalOpen} 
      onClose={() => setIsModalOpen(false)} 
      bed={selectedBed} 
    />
    </>
  );
};

export default Dashboard;
