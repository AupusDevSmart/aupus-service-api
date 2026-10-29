-- ============================================================================
-- Proposta por imposto e margem, com frete, deslocamento e diárias (29/out/2026)
--
-- Decisão do usuário: sai o BDI (complexo demais) e entram imposto e margem:
--   preço dos serviços = custo ÷ (1 − (imposto + margem)); a administração (sobre
--   os serviços e sobre o faturamento direto) leva só o imposto; o desconto (% ou
--   R$) é sobre o total inteiro e sai do faturamento da Aupus.
-- A proposta é revisada antes de programar: status PROPOSTA_REVISADA (e
-- NAO_APROVADA, a que não fechou). As colunas antigas de aprovação e rejeição da
-- solicitação, sem uso, passam a guardar quem revisou e quem marcou não aprovada.
--
-- 1. Status novos no enum. IRREVERSÍVEL: o Postgres não tira valor de enum.
--    Fora da transação: o valor novo não se usa na transação que o cria.
-- 2. solicitacoes_servico: a conta da proposta (BDI nas que já existiam,
--    IMPOSTO_MARGEM nas novas), km, dias, pessoas e noites, os percentuais
--    copiados na proposta, validade, condições e os totais da conta nova.
-- 3. solicitacoes_logistica: as linhas de frete, deslocamento e diárias.
-- 4. padroes_da_proposta: imposto, margem e administração padrão (uma linha só).
--    Nasce com os números de simulação da spec (15%, 20%, 5% e 2%): confirmar na
--    tela "Padrões da proposta" antes de usar.
--
-- Aplicar ANTES de subir a API nova e, depois dela, o script que converte as
-- propostas REGISTRADAS para a conta nova (scripts/db/converter-propostas-registradas.ts).
-- Aditivo (fora o enum) e idempotente.
-- ROLLBACK (menos o enum): DROP TABLE IF EXISTS solicitacoes_logistica, padroes_da_proposta;
--   ALTER TABLE solicitacoes_servico DROP COLUMN IF EXISTS conta_da_proposta, ... (as colunas abaixo).
-- ============================================================================

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() NOT IN ('aupus_service', 'aupus_local', 'aupus_test') THEN
    RAISE EXCEPTION 'Script do banco do Service (aupus_service); este banco é %', current_database();
  END IF;
END $$;

ALTER TYPE "StatusSolicitacaoServico" ADD VALUE IF NOT EXISTS 'PROPOSTA_REVISADA' AFTER 'REGISTRADA';
ALTER TYPE "StatusSolicitacaoServico" ADD VALUE IF NOT EXISTS 'NAO_APROVADA' AFTER 'FINALIZADA';

BEGIN;

-- Cada ALTER pega ACCESS EXCLUSIVE: atrás de uma transação aberta, desiste em 5 s
-- (e nada fica) em vez de enfileirar a lista de solicitações
SET LOCAL lock_timeout = '5s';

-- As que já existem ficam na conta do BDI (o default do ADD); as novas nascem na nova
ALTER TABLE solicitacoes_servico
  ADD COLUMN IF NOT EXISTS conta_da_proposta       VARCHAR(20)   NOT NULL DEFAULT 'BDI',
  ADD COLUMN IF NOT EXISTS distancia_km            NUMERIC(10,2) NULL,
  ADD COLUMN IF NOT EXISTS distancia_ida_volta_km  NUMERIC(10,2) NULL,
  ADD COLUMN IF NOT EXISTS dias_previstos          NUMERIC(6,2)  NULL,
  ADD COLUMN IF NOT EXISTS pessoas_previstas       SMALLINT      NULL,
  ADD COLUMN IF NOT EXISTS noites_fora             SMALLINT      NULL,
  ADD COLUMN IF NOT EXISTS imposto_percentual      NUMERIC(6,3)  NULL,
  ADD COLUMN IF NOT EXISTS margem_percentual       NUMERIC(6,3)  NULL,
  ADD COLUMN IF NOT EXISTS adm_servicos_percentual NUMERIC(6,3)  NULL,
  ADD COLUMN IF NOT EXISTS adm_fd_percentual       NUMERIC(6,3)  NULL,
  ADD COLUMN IF NOT EXISTS validade_proposta       DATE          NULL,
  ADD COLUMN IF NOT EXISTS condicoes_comerciais    TEXT          NULL,
  ADD COLUMN IF NOT EXISTS total_servicos          NUMERIC(14,2) NULL,
  ADD COLUMN IF NOT EXISTS total_fd                NUMERIC(14,2) NULL,
  ADD COLUMN IF NOT EXISTS total_administracao     NUMERIC(14,2) NULL,
  ADD COLUMN IF NOT EXISTS total_aupus             NUMERIC(14,2) NULL,
  ADD COLUMN IF NOT EXISTS valor_imposto           NUMERIC(14,2) NULL,
  ADD COLUMN IF NOT EXISTS margem_efetiva          NUMERIC(7,3)  NULL;
ALTER TABLE solicitacoes_servico ALTER COLUMN conta_da_proposta SET DEFAULT 'IMPOSTO_MARGEM';

CREATE TABLE IF NOT EXISTS solicitacoes_logistica (
  id             VARCHAR(26)   PRIMARY KEY,
  solicitacao_id TEXT          NOT NULL REFERENCES solicitacoes_servico (id) ON DELETE CASCADE,
  tabela         VARCHAR(20)   NOT NULL,
  ativo          BOOLEAN       NOT NULL DEFAULT TRUE,
  recurso_id     CHAR(26)      NULL,
  descricao      VARCHAR(200)  NOT NULL,
  quantidade     NUMERIC(10,3) NULL,
  valor_unitario NUMERIC(14,2) NULL,
  dias           NUMERIC(6,2)  NULL,
  km             NUMERIC(10,2) NULL,
  valor_km       NUMERIC(14,4) NULL,
  valor_fixo     NUMERIC(14,2) NULL,
  total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  ordem          SMALLINT      NOT NULL DEFAULT 1,
  created_at     TIMESTAMP(0)  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMP(0)  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS solicitacoes_logistica_solicitacao_id_idx ON solicitacoes_logistica (solicitacao_id);

CREATE TABLE IF NOT EXISTS padroes_da_proposta (
  id                      SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  imposto_percentual      NUMERIC(6,3) NOT NULL DEFAULT 15.000,
  margem_percentual       NUMERIC(6,3) NOT NULL DEFAULT 20.000,
  adm_servicos_percentual NUMERIC(6,3) NOT NULL DEFAULT 5.000,
  adm_fd_percentual       NUMERIC(6,3) NOT NULL DEFAULT 2.000,
  updated_by              CHAR(26)     NULL,
  updated_at              TIMESTAMPTZ(3) NULL
);
INSERT INTO padroes_da_proposta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMIT;
