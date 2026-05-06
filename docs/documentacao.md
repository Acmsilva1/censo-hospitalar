# Documentação Técnica - Censo Vivo

## 0. Stack tecnológica do projeto

### Linguagens
- TypeScript
- JavaScript
- SQL
- HTML/CSS

### Arquitetura e organização
- Monorepo com `npm workspaces`
- Aplicações separadas por domínio:
  - `modules/jornada/*`
  - `modules/censo/*`
  - `modules/cc/*` (Centro Cirúrgico)
  - `apps/*` (shell e orquestrador)

### Backend
- Node.js
- Jornada API:
  - Fastify
  - `@fastify/cors`
  - `@fastify/websocket`
  - `ts-node`
- CC API:
  - Fastify
  - `@fastify/cors`
  - `@fastify/websocket`
  - DuckDB
  - `tsx`
- Censo API:
  - Express
  - CORS
  - Socket.IO
  - `tsx`

### Frontend
- React
- Vite
- TypeScript
- Tailwind CSS (nos módulos que utilizam utilitários)
- Bibliotecas de UI/visualização usadas no projeto:
  - `reactflow` (fluxo/jornada)
  - `framer-motion` (animações no censo)
  - `lucide-react` (ícones)
  - `socket.io-client` (tempo real no frontend do censo)

### Dados e integração
- DuckDB (motor analítico local para leitura de `parquet`/`csv`)
- PostgreSQL via `pg` (fonte alvo de produção)
- Redis (cache/suporte operacional no censo)
- Arquivos Parquet como fonte local principal de dados

### Qualidade, build e execução
- Vitest (testes no Jornada API)
- TypeScript Compiler (`tsc`)
- `concurrently` para subir múltiplos serviços em desenvolvimento
- `npm audit` para análise de vulnerabilidades

## 1. Registro do que foi implementado

Data: 2026-04-29

### Segurança e dependências
- Atualização de frontend para versões atuais de build:
  - `vite@^8.0.10`
  - `@vitejs/plugin-react@^6.0.1`
- Atualização de `vitest` no `modules/jornada/api` para `^4.1.5` (remove cadeia antiga com `vite@5`).
- Adição de `pg@^8.16.3` nos dois backends:
  - `modules/jornada/api`
  - `modules/censo/api`

### Unificação da camada de dados
- Implementada camada única de datasource com seleção por ambiente:
  - `DATA_SOURCE=duckdb` (local/dev)
  - `DATA_SOURCE=postgres` (produção)
- `DuckDB` local foi padronizado para arquivo persistente (`DUCKDB_PATH`) em vez de uso só em memória por processo.
- Censo API:
  - Novo adapter: `modules/censo/api/src/features/censo/services/SqlDataSource.ts`
  - Serviços migrados para usar datasource único:
    - `CensoService.ts`
    - `DuckDbParserService.ts`
  - Configuração ampliada em `modules/censo/api/src/core/config/env.ts`
- Jornada API:
  - Novo adapter: `modules/jornada/api/src/core/sqlDataSource.ts`
  - API de jornada ajustada para inicializar e consultar via datasource único:
    - `modules/jornada/api/src/features/jornada/app.ts`

### Segurança residual documentada
- Criado `SECURITY_EXCEPTIONS.md` para registrar vulnerabilidades transitivas remanescentes de `duckdb` (`node-gyp`/`tar`) sem fix upstream no momento.

Data: 2026-05-06

### Centro Cirúrgico (novo módulo)
- Criado `modules/cc/api` com endpoints:
  - `GET /api/health`
  - `GET /api/cc/summary`
  - `GET /api/cc/units`
  - `GET /api/cc/rooms?unit=<unitKey>`
- Feed em tempo real por WebSocket:
  - `ws://localhost:3213/ws/cc-state`
- Fonte de dados local (datalake):
  - `tbl_centro_cirurgico_bkp.parquet`
  - `tbl_cc_tempos_mov.parquet`
- Regras de estado operacional:
  - `EM_SALA`
  - `NO_ROLL_ESPERA`
  - `FORA_FLUXO_ATIVO`

- Criado `modules/cc/web`:
  - React + Vite na porta `5280`
  - seleção por unidades via ícones circulares
  - emoji de hospital animado por unidade
  - diferenciação de unidades com/sem CC via API
  - paleta inicial azul (tom amigável)

- Integração no shell e orquestrador:
  - `apps/api-orchestrator/src/index.ts` agora expõe:
    - `ccApi: http://localhost:3213`
    - `ccWeb: http://localhost:5280`
  - `apps/web-shell/src/App.tsx` agora contém:
    - card "Centro Cirúrgico" na home
    - aba dedicada no menu
    - iframe para `targets.ccWeb`

## 2. Arquitetura atual da pipeline de dados

### Fonte local (desenvolvimento)
1. Arquivos `parquet`/`csv` locais são lidos pelo `DuckDB`.
2. `DuckDB` materializa tabelas/views analíticas.
3. APIs (`jornada/api` e `censo/api`) consultam a camada SQL unificada.
4. Frontends consomem as APIs HTTP/WebSocket normalmente.

### Fonte de produção
1. `DATA_SOURCE=postgres`.
2. APIs passam a consultar PostgreSQL via `pg`.
3. Mantém-se o mesmo contrato de resposta para frontend (paridade de shape).

## 3. Variáveis de ambiente principais

### Comuns de datasource
- `DATA_SOURCE`: `duckdb` ou `postgres`
- `DATABASE_URL`: string de conexão PostgreSQL (obrigatória em produção)
- `DUCKDB_PATH`: caminho do arquivo `.duckdb` local (default: `.local/censo-vivo.duckdb`)

### Jornada API
- `JORNADA_DADOS_DIR`: pasta dos parquet da jornada
- `JORNADA_API_PORT` ou `PORT`: porta da API (default 3211)
- `ORCHESTRATOR_URL`: endpoint do orquestrador (default `http://localhost:3020`)

### Censo API
- `DATASET_PATH`: pasta local dos parquet/csv
- `PORT`: porta da API (default 3212)
- `REDIS_URL`: opcional (cache/pub-sub)
- `ORCHESTRATOR_URL`: endpoint do orquestrador

### CC API
- `CC_DADOS_DIR`: pasta de parquet do Centro Cirúrgico (override opcional)
- `CC_API_PORT` ou `PORT`: porta da API (default 3213)
- `CC_REFRESH_MS`: intervalo de refresh do snapshot (default 600000 ms)

## 4. Fluxo operacional

### Subir ambiente local completo
```bash
npm install
npm run dev
```

Esse comando sobe:
- `apps/api-orchestrator`
- `modules/jornada/api`
- `modules/jornada/web`
- `modules/censo/api`
- `modules/censo/web`
- `modules/cc/api`
- `modules/cc/web`
- `apps/web-shell`

### Execução com Docker Compose (datalake)
Arquivo: `docker-compose.datalake.yml`

Portas expostas:
- `3020` (orquestrador)
- `3211` (jornada/api)
- `3212` (censo/api)
- `3213` (cc/api)
- `5276` (jornada/web)
- `5278` (censo/web)
- `5280` (cc/web)
- `5180` (web-shell)

Mounts externos obrigatórios:
- Datalake: `../../../datalake:/datalake:ro`
- Regras de IA: `../../../regras do agente de IA:/regras-agente:ro`
- Variável de regras: `AGENT_RULES_DIR=/regras-agente`

### Build
```bash
npm run build
```

## 5. Pipeline de validação recomendada

1. Segurança:
```bash
npm audit
npm audit --omit=dev
```

2. Backend:
```bash
npm run typecheck -w modules/jornada/api
npm run build -w modules/censo/api
npm run typecheck -w modules/cc/api
```

3. Frontend:
```bash
npm run build -w modules/jornada/web
npm run build -w modules/censo/web
npm run build -w modules/cc/web
npm run build -w apps/web-shell
```

4. Smoke test manual:
- Subir `npm run dev`
- Validar endpoints de health e telas principais
- Confirmar logs de inicialização indicando fonte ativa (`duckdb` ou `postgres`)

## 6. Situação atual do audit

- Após atualização, vulnerabilidades de toolchain frontend antiga foram reduzidas.
- Permanecem vulnerabilidades de alta severidade na cadeia transitiva do `duckdb` sem correção automática disponível até a data da implementação.
- Tratamento formal e mitigação estão registrados em `SECURITY_EXCEPTIONS.md`.
