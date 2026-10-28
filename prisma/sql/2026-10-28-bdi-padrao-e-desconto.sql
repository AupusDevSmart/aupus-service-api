-- ============================================================================
-- BDI padrão configurável e desconto da proposta (28/out/2026)
--
-- 1. `bdi_padrao`: o BDI da empresa, uma linha só (id 1), com os nove
--    componentes da fórmula do TCU. A solicitação nova copia daqui; cada uma
--    guarda os seus (`solicitacoes_servico.bdi_*`) e pode ajustá-los, e trocar o
--    padrão não reescreve proposta já feita. Nasce com a tabela GOINFRA sem
--    REIDI (30,44%), o padrão de até hoje.
-- 2. O desconto da proposta, sobre o total inteiro (o faturamento direto
--    junto): `desconto_tipo` PERCENTUAL ou VALOR, `desconto_valor` o digitado (o
--    percentual ou os reais) e `total_desconto` os reais descontados. O
--    `total_geral` passa a ser o total com o desconto.
--
-- Aditivo e idempotente. Aplicar ANTES de subir a API nova (sem a tabela, criar
-- solicitação dá 500). psql -d aupus_service -f prisma/sql/2026-10-28-bdi-padrao-e-desconto.sql
-- ROLLBACK: DROP TABLE IF EXISTS bdi_padrao;
--           ALTER TABLE solicitacoes_servico DROP COLUMN IF EXISTS desconto_tipo,
--             DROP COLUMN IF EXISTS desconto_valor, DROP COLUMN IF EXISTS total_desconto;
--           (e recalcular o total_geral das que tinham desconto: soma o total_desconto)
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() NOT IN ('aupus_service', 'aupus_local', 'aupus_test') THEN
    RAISE EXCEPTION 'Script do banco do Service (aupus_service); este banco é %', current_database();
  END IF;
END $$;

-- Cada ALTER pega ACCESS EXCLUSIVE: atrás de uma transação aberta, desiste em 5 s
-- (e nada fica) em vez de enfileirar a lista de solicitações
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS bdi_padrao (
  id                        SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bdi_administracao_central NUMERIC(6,3) NOT NULL DEFAULT 5.000,
  bdi_seguro_garantia       NUMERIC(6,3) NOT NULL DEFAULT 0.500,
  bdi_taxa_risco            NUMERIC(6,3) NOT NULL DEFAULT 0.000,
  bdi_despesas_financeiras  NUMERIC(6,3) NOT NULL DEFAULT 0.500,
  bdi_lucro                 NUMERIC(6,3) NOT NULL DEFAULT 5.000,
  bdi_pis                   NUMERIC(6,3) NOT NULL DEFAULT 0.650,
  bdi_cofins                NUMERIC(6,3) NOT NULL DEFAULT 3.000,
  bdi_cprb                  NUMERIC(6,3) NOT NULL DEFAULT 4.500,
  bdi_issqn                 NUMERIC(6,3) NOT NULL DEFAULT 6.500,
  updated_by                CHAR(26)     NULL,
  updated_at                TIMESTAMPTZ(3) NULL
);

INSERT INTO bdi_padrao (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE solicitacoes_servico
  ADD COLUMN IF NOT EXISTS desconto_tipo  VARCHAR(10)   NULL,
  ADD COLUMN IF NOT EXISTS desconto_valor NUMERIC(14,2) NULL,
  ADD COLUMN IF NOT EXISTS total_desconto NUMERIC(14,2) NULL;

COMMIT;
