# Skill Frontend

## Objetivo
Definir padrões para desenvolvimento frontend com foco em consistência, acessibilidade, performance e manutenibilidade.

## Stack padrão
- React 18+
- TypeScript (strict)
- Tailwind CSS
- shadcn/ui (Radix UI)
- React Hook Form + Zod
- TanStack Query
- React Router
- ECharts para gráficos e dashboards
- Framer Motion para animações de interface e transições visuais
- Three.js
- React Three Fiber (R3F) para visualização Digital Twin 3D

## Diretrizes de implementação
- Proibir `any` no código de produção.
- Um componente por arquivo; lógica complexa em hooks ou services.
- Evitar acoplamento entre UI e regras de negócio.
- Usar estados globais apenas quando necessário.
- Preferir composição a herança.
- Exigir tipagem rigorosa dos estados que representam entidades físicas do Digital Twin (leito, monitor, sensor, setor e status operacional).

## UI e UX
- Layout responsivo mobile-first.
- Garantir contraste, foco visível e navegação por teclado.
- Tratar loading, erro e estado vazio em todas as telas críticas.
- Padronizar tokens visuais (cores, espaçamento, tipografia, bordas).
- Adotar padrão visual consistente para operação hospitalar: alto contraste, leitura rápida e organização em cards modulares (estilo bento).

## Performance
- Evitar renders desnecessários (`memo`, `useMemo`, `useCallback` quando fizer sentido).
- Fazer code splitting por rota.
- Otimizar listas grandes (virtualização quando necessário).
- Evitar chamadas de API duplicadas.

## Qualidade
- Cobrir componentes e hooks críticos com testes.
- Remover logs de debug antes de merge.
- Não deixar código morto ou comentários óbvios.
