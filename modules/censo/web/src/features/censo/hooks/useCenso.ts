import { useState, useEffect } from 'react';
import { socket } from '../../../shared/services/socket';
import { censoApi } from '../../../shared/services/api';
import type { CensoData, CensoPayload } from '../types/census';

interface UseCensoResult {
  data: CensoData | null;
  lastUpdate: string | null;
  nextUpdate: string | null;
  loading: boolean;
  queueStatus: 'idle' | 'processing' | 'retrying' | 'failed' | 'completed';
  error: string | null;
  hospitals: string[];
  stats: any | null; // Tipagem HospitalStats do payload
}

export function useCenso(hospitalName: string): UseCensoResult {
  const [data,       setData]        = useState<CensoData | null>(null);
  const [lastUpdate, setLastUpdate]  = useState<string | null>(null);
  const [nextUpdate, setNextUpdate]  = useState<string | null>(null);
  const [loading,    setLoading]     = useState<boolean>(true);
  const [queueStatus, setQueueStatus] = useState<UseCensoResult['queueStatus']>('idle');
  const [error,      setError]       = useState<string | null>(null);
  const [hospitals,  setHospitals]   = useState<string[]>([]);
  const [stats,      setStats]       = useState<any | null>(null);

  // Carregar lista de hospitais apenas uma vez
  useEffect(() => {
    censoApi.getHospitals()
      .then(setHospitals)
      .catch(err => console.error('[useCenso] Erro ao buscar hospitais:', err));
  }, []);

  useEffect(() => {
    if (!hospitalName) return;

    // Só mostra loading se não houver dados (primeira carga)
    if (!data) setLoading(true);
    
    socket.emit('join-hospital', hospitalName);

    const handleInitialState = (payload: CensoPayload) => {
      if (payload?.data) {
        // Guarda de Estabilidade Conjunta (Dados e Estatísticas)
        setData(prev => {
          const isIdentical = JSON.stringify(prev) === JSON.stringify(payload.data);
          return isIdentical ? prev : payload.data;
        });
        
        setStats((prev: any) => {
          if (!payload.stats) return prev;
          const isIdentical = JSON.stringify(prev) === JSON.stringify(payload.stats);
          return isIdentical ? prev : payload.stats;
        });

        setLastUpdate(payload.lastUpdate);
        setNextUpdate(payload.nextUpdate);
      }
      setLoading(false);
      setError(null);
    };

    const handleUpdate = (payload: Pick<CensoPayload, 'lastUpdate' | 'nextUpdate'>) => {
      setLastUpdate(payload.lastUpdate);
      setNextUpdate(payload.nextUpdate);
    };

    const handleQueueStatus = (payload: { status: UseCensoResult['queueStatus'] }) => {
      setQueueStatus(payload.status);
    };

    const handleError = (msg: string) => {
      setError(msg);
      setLoading(false);
    };

    socket.on('censo-initial-state', handleInitialState);
    socket.on('censo-update',        handleUpdate);
    socket.on('censo-queue-status',  handleQueueStatus);
    socket.on('censo-error',         handleError);

    return () => {
      socket.emit('leave-hospital', hospitalName);
      socket.off('censo-initial-state', handleInitialState);
      socket.off('censo-update',        handleUpdate);
      socket.off('censo-queue-status',  handleQueueStatus);
      socket.off('censo-error',         handleError);
    };
  }, [hospitalName]);

  return { data, lastUpdate, nextUpdate, loading, queueStatus, error, hospitals, stats };
}
