# Skill Testes

## Objetivo
Garantir qualidade contínua com testes confiáveis, rápidos e alinhados ao risco de negócio.

## Regra crítica (obrigatória)
- Testes são obrigatórios em todos os passos do processo, sem exceção.
- Nenhuma etapa avança sem evidência de teste aprovado da etapa anterior.
- Sem teste, sem merge; sem merge, sem deploy.

## Estratégia
- Priorizar testes em serviços e fluxos críticos.
- Combinar testes unitários, integração e E2E.
- Aplicar abordagem spec-driven para reduzir ambiguidade.

## Pirâmide de testes
- Unitário: maior volume, execução rápida.
- Integração: contratos entre camadas (API, banco, filas).
- E2E: poucos cenários críticos ponta a ponta.

## Boas práticas
- Não testar apenas caminho feliz; cobrir erros, limites e nulos.
- Isolar dependências externas com mocks/fakes quando necessário.
- Evitar testes frágeis acoplados à implementação interna.
- Manter dados de teste previsíveis e reutilizáveis.
- Para integração com banco, priorizar ambiente real isolado (ex.: Testcontainers) em vez de mock excessivo.

## Critérios mínimos
- Todo bug corrigido deve incluir teste de regressão.
- Toda feature crítica deve incluir ao menos 1 teste de integração.
- Pipeline deve falhar ao quebrar testes.
- Cobertura é indicador secundário; foco principal é risco.
- Meta de cobertura: mínimo 80% geral e 100% para lógica crítica de negócio.

## Processo obrigatório por etapa (gate de qualidade)
1. Pré-implementação (spec e risco)
- Escrever critérios de aceite testáveis.
- Definir casos obrigatórios: sucesso, erro, limite, nulo, permissão e concorrência.
- Identificar PII/PHI e incluir casos LGPD (acesso indevido, masking e trilha de auditoria).

2. Implementação (desenvolvimento local)
- Criar/atualizar testes unitários junto com o código.
- Validar branches de decisão e tratamento de erro.
- Bloqueio da etapa: não prosseguir se teste unitário falhar.

3. Integração (API, banco, filas, cache)
- Executar testes de integração com ambiente isolado e realista (Testcontainers quando aplicável).
- Validar contrato API (status, payload, schema e mensagens de erro).
- Validar migração, rollback e consistência transacional.
- Bloqueio da etapa: não prosseguir se qualquer contrato quebrar.

4. Frontend e experiência
- Validar componentes críticos, estados de loading/erro/vazio e acessibilidade básica.
- Validar gráficos (ECharts), animações/transições (Framer Motion) e comportamento de telas 3D (Three.js/R3F) sem quebrar fluxo funcional.
- Bloqueio da etapa: não prosseguir se fluxo crítico do usuário falhar.

5. End-to-End (fluxos de negócio)
- Executar E2E dos fluxos prioritários: autenticação, operação principal, persistência e retorno visual.
- Confirmar integração ponta a ponta com dados corretos.
- Bloqueio da etapa: sem E2E crítico verde, release é reprovado.

6. Resiliência e tempo real
- Testar queda e reconexão de WebSocket/SSE.
- Testar saturação de eventos e reinício de serviço sem perda relevante de estado.
- Confirmar fallback, idempotência e alerta operacional.
- Bloqueio da etapa: sem recuperação observável, não publicar.

7. Pré-release (pipeline)
- Executar suíte completa: lint, unitários, integração, E2E e segurança básica.
- Verificar cobertura mínima exigida e testes de regressão da release.
- Bloqueio da etapa: pipeline deve reprovar automaticamente em qualquer falha.

8. Pós-deploy (validação em produção)
- Rodar smoke tests e health checks.
- Monitorar erros, latência e métricas de negócio após deploy.
- Preparar rollback imediato se regressão crítica for detectada.

## Matriz mínima obrigatória por tipo de teste
- Unitário: regra de negócio, validação de entrada, tratamento de exceção e caminhos alternativos.
- Integração: contrato API, persistência real, autorização, cache e filas/eventos.
- E2E: jornada principal, jornada alternativa e cenário de falha recuperável.
- Segurança/LGPD: autorização, masking dinâmico, ausência de PII/PHI em logs e registro de auditoria.
- Dados: consistência de contagem, integridade referencial, duplicidade, nulos e precisão de agregações.

## Resiliência e caos
- Incluir cenários de falha controlada (Chaos) para fluxos críticos em tempo real.
- Validar perda de conexão (WebSocket/SSE), saturação de eventos e reinício de nó sem perda relevante de estado.
- Definir critérios de recuperação observáveis antes de produção (alerta, fallback, reconexão e idempotência).

## Ferramentas sugeridas
- Frontend: Vitest/Jest + React Testing Library.
- Backend Node: Jest/Vitest + Supertest.
- Python: Pytest.
- E2E: Playwright ou Cypress.
