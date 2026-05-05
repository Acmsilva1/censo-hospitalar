# Skill Backend

## Objetivo
Estabelecer padrões para APIs e serviços backend seguros, testáveis e prontos para produção.

## Stack padrão
- Node.js LTS com TypeScript
- Express ou Fastify
- Python 3.10+ para analytics, IA e automações especializadas
- Zod para validação
- Prisma ou Knex para persistência
- Redis para cache/filas (quando aplicável)
- WebSockets ou Server-Sent Events (SSE) para fluxo em tempo real

## Arquitetura
- Adotar arquitetura modular (modular monolith) como padrão.
- Estrutura de referência na raiz: `api/`, `web/`, `docs/` e diretórios de apoio.
- Separar em camadas: `route -> controller -> use_case (interactor) -> service -> repository`.
- Regras de negócio puras devem ficar em `use_case (interactor)`.
- `service` deve concentrar orquestração técnica e integrações.
- Acesso a banco apenas em `repository/model`.
- Evitar dependência circular entre módulos.
- Cada módulo deve encapsular rotas, casos de uso, serviços e acesso a dados, com contratos claros entre módulos.
- Padronizar `api/data` como camada central de dados da API para banco relacional, cache, arquivos e conectores de fontes diversas.

## API e segurança
- Validar entrada e saída de dados.
- Padronizar erros HTTP com payload consistente.
- Nunca retornar stack trace para cliente.
- Implementar autenticação/autorização por perfil/permissão.
- Aplicar rate limit, CORS, headers de segurança e proteção contra injeção.

## Observabilidade
- Logs estruturados por nível (`info`, `warn`, `error`).
- Não registrar PII/PHI em texto puro.
- Adicionar correlation id para rastreio de requisições.
- Monitorar métricas técnicas e métricas de negócio.
- Exigir métricas de saúde do domínio (ex.: contagem de leitos disponíveis, ocupados e bloqueados).

## Operação
- Healthcheck e readiness/liveness endpoints.
- Configuração por ambiente via variáveis (`.env`).
- Dockerfile e compose para execução local padronizada.
- Integrações e rotinas operacionais devem priorizar automação CI/CD e n8n Cloud.
