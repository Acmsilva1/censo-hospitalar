# Censo Vivo

Monorepo local que integra os modulos Jornada (PS) e Censo/Leitos com um orquestrador de estado.

## Apps
- apps/api-orchestrator: recebe eventos, correlaciona estado e publica atualizacoes via WS.
- apps/web-shell: shell com abas separadas para Jornada e Censo + painel de estado integrado.

## Modulos
- modules/jornada: copia funcional do projeto Jornada (api + web).
- modules/censo: copia funcional do projeto Censo/Leitos (api + web).

## Executar
1. npm install
2. npm run dev

## Portas
- Orquestrador: 3210
- Jornada API: 3211
- Jornada Web: 5276
- Censo API: 3212
- Censo Web: 5278
- Web Shell: 5288
