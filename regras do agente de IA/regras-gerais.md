# Skill Regras Gerais

## Objetivo
Consolidar regras transversais de engenharia para orientar decisões técnicas, qualidade e colaboração.

## Princípios
- KISS: preferir soluções simples e legíveis.
- DRY: remover duplicações relevantes.
- YAGNI: não implementar o que não é necessário agora.
- SOLID: aplicar quando trouxer clareza e extensibilidade.
- Modularidade primeiro: organizar o sistema em módulos de negócio independentes, evitando acoplamento transversal.
- Convenção de dados: todo acesso a dados da API deve passar pela estrutura `api/data`.
- Preferência de dados: usar DuckDB em todos os projetos para exploração analítica, staging e validação técnica de datasets.
- Diretriz de frontend: padronizar ECharts para gráficos, Framer Motion para animações de UI e Three.js/R3F para cenários Digital Twin 3D.

## Fluxo recomendado
- Especificar antes de implementar (spec-driven).
- Validar requisitos ambíguos antes de codar.
- Entregar incrementalmente com feedback curto.
- Definir plano curto antes de execução e revisar impacto antes de mudanças críticas.
- Em falha repetida, limitar tentativas autônomas em até 3 ciclos antes de escalar para decisão humana.

## Padrões de código
- Nomes semânticos e consistentes.
- Funções pequenas com responsabilidade única.
- Tratar erros de forma explícita.
- Evitar comentários óbvios; código deve se explicar.

## Segurança e conformidade
- Não expor segredos em código.
- Não registrar PII/PHI sem necessidade.
- Aplicar princípio do menor privilégio em acesso e permissões.
- Regra de ouro documental: todo documento processado deve ser revisado ativamente para identificar e registrar possíveis discordâncias com a LGPD.

## Qualidade e entrega
- Toda mudança relevante deve incluir testes.
- Testes são obrigatórios em todos os passos do processo (planejamento, implementação, integração, release e pós-deploy).
- Nenhuma etapa pode avançar sem evidência de testes aprovados da etapa anterior.
- Revisão de código deve focar em risco, segurança e regressão.
- CI deve validar build, lint e testes antes de merge.
- Em projetos críticos, combinar SDD (intenção), TDD (implementação) e BDD (comportamento) para reduzir ambiguidades.

## Workflow DevOps em ambiente corporativo
- Projetar fluxo para ambientes com permissões restritas (Corporate PC), evitando dependência de instalação local privilegiada.
- Priorizar automações via n8n Cloud para orquestração de integrações e rotinas operacionais.
- Usar túneis de conexão seguros para integrações internas/externas, com autenticação forte e trilha de auditoria.

## Anti-patterns a evitar
- Prompt vago sem especificação.
- Copiar código sem entender impacto.
- Aceitar resultado sem validação.
- Aumentar escopo durante execução sem alinhamento.

## Documentação técnica obrigatória
- Toda documentação técnica deve manter estrutura fixa por seção, sem omissão de tópicos obrigatórios.
- Quando um tópico não se aplicar, registrar explicitamente como "Não aplicável" com justificativa objetiva.
- Documentar separação de responsabilidades entre backend (`api`), frontend (`web`) e itens transversais (LGPD, contrato API, riscos).
- Manter identificação e rastreabilidade de revisão documental (DOC-ID/versionamento) em cada artefato técnico.
