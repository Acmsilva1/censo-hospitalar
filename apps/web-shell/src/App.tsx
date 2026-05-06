import { useEffect, useMemo, useState } from 'react';
import { VisaoHospitalar } from './VisaoHospitalar';

type StateItem = {
  atendimentoId: string;
  pacienteId: string;
  internacaoIndicadaAt?: string;
  leitoStatus?: string;
  leitoId?: string;
  limboAguardandoLeito?: boolean;
  updatedAt: string;
};

export function App() {
  const [screen, setScreen] = useState<'jornada' | 'censo' | 'visao' | 'cc'>('jornada');
  const [view, setView] = useState<'home' | 'app'>('home');
  const [items, setItems] = useState<StateItem[]>([]);
  const [wsOnline, setWsOnline] = useState(false);
  const [targets, setTargets] = useState({
    jornadaWeb: 'http://localhost:5276',
    censoWeb: 'http://localhost:5278',
    ccWeb: 'http://localhost:5280',
    jornadaApi: 'http://localhost:3211',
    censoApi: 'http://localhost:3212',
    ccApi: 'http://localhost:3213',
  });

  const orchestratorHttp = useMemo(() => 'http://localhost:3020', []);
  const orchestratorWs = useMemo(() => 'ws://localhost:3020/ws/state', []);

  useEffect(() => {
    let closed = false;
    const ws = new WebSocket(orchestratorWs);

    ws.onopen = () => setWsOnline(true);
    ws.onclose = () => setWsOnline(false);
    ws.onerror = () => setWsOnline(false);
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data as string);
      if (data.type === 'SNAPSHOT' && Array.isArray(data.items)) setItems(data.items);
      if (data.type === 'STATE_UPDATED' && data.state) {
        setItems((prev) => {
          const key = `${data.state.atendimentoId}::${data.state.pacienteId}`;
          const next = prev.filter((p) => `${p.atendimentoId}::${p.pacienteId}` !== key);
          next.unshift(data.state);
          return next;
        });
      }
    };

    const poll = setInterval(async () => {
      if (closed || wsOnline) return;
      const res = await fetch(`${orchestratorHttp}/state`);
      const json = await res.json();
      setItems(json.items || []);
    }, 4000);

    return () => {
      closed = true;
      clearInterval(poll);
      ws.close();
    };
  }, [orchestratorHttp, orchestratorWs, wsOnline]);

  useEffect(() => {
    fetch(`${orchestratorHttp}/targets`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.targets) setTargets(json.targets);
      })
      .catch(() => undefined);
  }, [orchestratorHttp]);

  function openModule(module: 'jornada' | 'censo' | 'visao' | 'cc') {
    setScreen(module);
    setView('app');
  }

  return (
    <div className="stage-shell">
      <div className={`stage-track ${view === 'app' ? 'show-app' : ''}`}>
        <main className="home">
          <div className="home-overlay" />
          <div className="home-title" aria-label="Jornada do Paciente">
            <span className="home-title-kicker">Centro de Comando</span>
            <h1>Jornada do Paciente</h1>
          </div>
          <section className="home-content">
            <div className="card-grid">
              <button className="big-card" onClick={() => openModule('jornada')}>
                <span className="card-kicker">Pronto Socorro</span>
                <span className="card-title">Jornada</span>
                <span className="card-sub">Fluxo assistencial e eventos do PS</span>
              </button>
              <button className="big-card" onClick={() => openModule('censo')}>
                <span className="card-kicker">Internacao</span>
                <span className="card-title">Censo e Leitos</span>
                <span className="card-sub">Gestao de leitos e fila de alocacao</span>
              </button>
              <button className="big-card" onClick={() => openModule('cc')}>
                <span className="card-kicker">CIRURGICO</span>
                <span className="card-title">Centro Cirúrgico</span>
                <span className="card-sub">Monitoramento em tempo real por salas e roll de espera</span>
              </button>
              <button className="big-card" onClick={() => openModule('visao')}>
                <span className="card-title">Visao hospitalar</span>
                <span className="card-sub">Ocupacao por andar e fluxo do PS</span>
              </button>
            </div>
          </section>
        </main>

        <section className="shell">
          <header>
            <h1>Jornada do Paciente</h1>
            <p>Orquestrador central de conexoes, estado e roteamento entre modulos.</p>
          </header>

          <nav>
            <button onClick={() => setView('home')}>Voltar</button>
            <button className={screen === 'jornada' ? 'active' : ''} onClick={() => setScreen('jornada')}>Pronto socorro</button>
            <button className={screen === 'censo' ? 'active' : ''} onClick={() => setScreen('censo')}>Internacao</button>
            <button className={screen === 'cc' ? 'active' : ''} onClick={() => setScreen('cc')}>Centro cirúrgico</button>
            <button className={screen === 'visao' ? 'active' : ''} onClick={() => setScreen('visao')}>Visao hospitalar</button>
          </nav>

          <section className="content iframe-stack">
            <div
              className={`iframe-pane ${screen === 'jornada' ? 'is-active' : ''}`}
              aria-hidden={screen !== 'jornada'}
            >
              <iframe title="Jornada" src={targets.jornadaWeb} />
            </div>
            <div
              className={`iframe-pane ${screen === 'censo' ? 'is-active' : ''}`}
              aria-hidden={screen !== 'censo'}
            >
              <iframe title="Censo" src={targets.censoWeb} />
            </div>
            <div
              className={`iframe-pane ${screen === 'cc' ? 'is-active' : ''}`}
              aria-hidden={screen !== 'cc'}
            >
              <iframe title="Centro Cirúrgico" src={targets.ccWeb} />
            </div>
            <div
              className={`iframe-pane ${screen === 'visao' ? 'is-active' : ''}`}
              aria-hidden={screen !== 'visao'}
            >
              <VisaoHospitalar censoApiUrl={targets.censoApi} jornadaApiUrl={targets.jornadaApi} ccApiUrl={targets.ccApi} />
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}

