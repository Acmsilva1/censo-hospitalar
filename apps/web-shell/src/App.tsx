import { useEffect, useMemo, useState } from 'react';

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
  const [screen, setScreen] = useState<'home' | 'jornada' | 'censo'>('home');
  const [items, setItems] = useState<StateItem[]>([]);
  const [wsOnline, setWsOnline] = useState(false);
  const [targets, setTargets] = useState({
    jornadaWeb: 'http://localhost:5276',
    censoWeb: 'http://localhost:5278',
    jornadaApi: 'http://localhost:3211',
    censoApi: 'http://localhost:3212',
  });

  const orchestratorHttp = useMemo(() => 'http://localhost:3210', []);
  const orchestratorWs = useMemo(() => 'ws://localhost:3210/ws/state', []);

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

  return (
    <div className={screen === 'home' ? 'home-shell' : 'shell'}>
      {screen === 'home' ? (
        <main className="home">
          <h1>Jornada do Paciente</h1>
          <p>Selecione o modulo para abrir endpoints, queries e funcoes dedicadas.</p>
          <div className="card-grid">
            <button className="big-card" onClick={() => setScreen('jornada')}>
              <span className="card-title">Pronto socorro</span>
              <span className="card-sub">Modulo Jornada + API PS</span>
            </button>
            <button className="big-card" onClick={() => setScreen('censo')}>
              <span className="card-title">Internacao</span>
              <span className="card-sub">Modulo Censo/Leitos + API internacao</span>
            </button>
          </div>
        </main>
      ) : (
        <>
          <header>
            <h1>Jornada do Paciente</h1>
            <p>Orquestrador central de conexoes, estado e roteamento entre modulos.</p>
          </header>

          <nav>
            <button onClick={() => setScreen('home')}>Voltar</button>
            <button className={screen === 'jornada' ? 'active' : ''} onClick={() => setScreen('jornada')}>Pronto socorro</button>
            <button className={screen === 'censo' ? 'active' : ''} onClick={() => setScreen('censo')}>Internacao</button>
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
          </section>
        </>
      )}
    </div>
  );
}
