# Stack Tecnológica - Censo Hospitalar

O projeto utiliza uma arquitetura de **Monorepo** (gerenciado com NPM Workspaces e `concurrently`), separando o sistema em diferentes módulos independentes na pasta `apps` e `modules`.

## 🖥️ Front-End (Web)
- **Base Principal:** React (v18.3) com TypeScript.
- **Build / Bundler:** Vite.
- **Renderização 3D (`web-shell`):** 
  - `three` (Three.js nativo para renderização gráfica).
  - `@react-three/fiber` (Integração do Three.js com React).
- **Interface e UI (`censo/web`):**
  - `framer-motion` (Animações fluidas).
  - `lucide-react` (Ícones vetoriais).
- **Comunicação em Tempo Real:** `socket.io-client` (para receber atualizações de leitos instantaneamente).

## ⚙️ Back-End (API)
- **Base Principal:** Node.js com TypeScript (usando `tsx` para execução de desenvolvimento).
- **Módulo de Orquestração (`api-orchestrator`):**
  - `fastify` (Framework web ultra-rápido).
  - `@fastify/websocket` (Para gerenciar conexões em tempo real de forma performática).
- **Módulo do Censo (`censo/api`):**
  - `express` (Framework clássico para rotas REST).
  - `socket.io` (Servidor de WebSockets).
- **Bancos de Dados & Cache:**
  - `pg` (PostgreSQL - Banco de dados relacional).
  - `redis` (Cache em memória de altíssima velocidade).
  - `duckdb` (Motor de banco de dados analítico interno para processamento rápido de grandes volumes de dados locais).
- **Outras utilidades:** `csv-parser` e `dotenv`.

## 🎨 Estilização (CSS e Tailwind)
A estilização é dividida dependendo do módulo:
- **Módulo `censo/web`:** Utiliza o **TailwindCSS (v3)** em conjunto com o `postcss` e `autoprefixer` para gerar classes utilitárias, criar interfaces responsivas (Bento UI/Dashboards) e permitir o desenvolvimento acelerado da UI.
- **Módulo `web-shell` (Módulo 3D):** Utiliza **CSS Vanilla Puro**, pois a maior parte da interface gráfica é desenhada diretamente dentro do `Canvas` via código (geometrias) e não por manipulação pesada de DOM HTML.
