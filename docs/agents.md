# 🤖 Agentes e Automação - Censo Vivo

Este documento define os perfis de IA e automação que operam no ecossistema do Censo Hospitalar.

## 🎭 Perfis de Agentes

### 1. Arquiteto de Visualização (3D Shell)
- **Escopo:** `apps/web-shell/`
- **Responsabilidade:** Renderização do prédio, maquetes de leitos (Three.js) e orquestração das abas do sistema.
- **Regra de Ouro:** Interfaces fluidas (Framer Motion) e alta fidelidade visual no 3D.

### 2. Especialista Real-Time (WebSocket/Censo)
- **Escopo:** `apps/api-orchestrator/` e `modules/censo/api/`
- **Responsabilidade:** Garantir a baixa latência nas atualizações de leitos via Socket.io e Fastify WebSockets.
- **Regra de Ouro:** Notificações instantâneas; Estado do censo deve ser a única fonte da verdade.

### 3. Engenheiro de Dados (Dual-Source)
- **Escopo:** `modules/*/api/src/services/`
- **Responsabilidade:** Manter a paridade de queries entre DuckDB (dev) e PostgreSQL (prod).
- **Regra de Ouro:** Usar o `SqlDataSource` unificado; Garantir performance analítica.

## 🛠 Comandos de Orquestração
- **Full Stack Mode:** `npm run dev` (Raiz) - Inicia todos os 6 serviços em paralelo.
- **Build Mode:** `npm run build` - Gera o pacote de produção para todos os módulos.

## 📜 Protocolos de Interação
- **Documentação:** Seguir o padrão de 9 tópicos fixos (`CENSOVIVO-*-TEC-RNN`).
- **Segurança:** Respeitar as regras de PHI/PII hospitalar e exceções de segurança do DuckDB.
