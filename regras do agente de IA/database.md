# Skill Database

## Objetivo
Definir práticas para modelagem, migração, consulta e governança de dados com foco em integridade e performance.

## Banco padrão
- PostgreSQL como base relacional principal.
- Redis para cache e estado volátil quando necessário.
- DuckDB como padrão preferencial em todos os projetos para análise local, staging analítico e validação de dados.
- Centralizar a infraestrutura de dados em `api/data` (conexões, repositórios, adapters e pipelines).
- Tratar `api/data` como gateway único para dados estruturados e não estruturados (SQL, cache, arquivos, streams e integrações).

## Modelagem
- Usar `snake_case` e nomes semânticos.
- Chaves primárias consistentes (`uuid` quando aplicável).
- Declarar constraints (`not null`, `unique`, `check`, `fk`).
- Projetar índices com base em leitura real, não por suposição.
- Regra de negócio crítica: leitos de isolamento (`ISOL`) devem ser sempre computados como ocupados em métricas de ocupação e performance.
- Garantir consistência de contagem para unidades com capacidade fixa (ex.: total de 96 leitos), com validações automáticas e alertas de divergência.

## Migrações
- Toda alteração de schema deve ocorrer via migration versionada.
- Nunca alterar estrutura diretamente em produção sem controle.
- Garantir estratégia de rollback.

## Consultas
- Evitar `select *`.
- Usar `explain analyze` para consultas lentas.
- Preferir paginação e filtros indexados.
- Materialized views para relatórios pesados quando necessário.

## Segurança e LGPD
- Classificar PII/PHI e aplicar Data Masking dinâmico por perfil de acesso.
- Evitar dados sensíveis em logs e dumps.
- Aplicar mascaramento/anonimização para uso analítico.
- Controlar acesso por privilégio mínimo.
- Manter Audit Logs detalhados de acesso a dados sensíveis (quem acessou, quando, qual dado e motivo técnico).

## ETL e qualidade de dados
- Validar tipos, nulos, duplicidade e integridade referencial.
- Tratar falhas de carga com reprocessamento idempotente.
