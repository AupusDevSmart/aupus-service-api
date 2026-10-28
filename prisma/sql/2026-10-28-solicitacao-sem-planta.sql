-- ============================================================================
-- Solicitação sem planta (28/out/2026)
--
-- Muita solicitação não vira OS, e criar usuário, planta e instalação para cada
-- uma era trabalho jogado fora. A planta passa a ser opcional para a equipe (o
-- cliente, que tem escopo por planta, continua escolhendo a dele); sem planta,
-- quem pediu fica em `cliente_nome`. Ao programar, a programação pede a planta e
-- a instalação e as grava de volta na solicitação.
--
-- Aditivo e idempotente: DROP NOT NULL não mexe em linha nenhuma, e a coluna
-- nova nasce vazia. Aplicar ANTES de subir a API nova (ela lê as colunas novas).
-- psql -d aupus_service -f prisma/sql/2026-10-28-solicitacao-sem-planta.sql
-- ROLLBACK (só se nenhuma solicitação estiver sem planta):
--   ALTER TABLE solicitacoes_servico ALTER COLUMN planta_id SET NOT NULL;
--   ALTER TABLE solicitacoes_servico DROP COLUMN IF EXISTS cliente_nome;
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

ALTER TABLE solicitacoes_servico
  ALTER COLUMN planta_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS cliente_nome VARCHAR(255) NULL;

COMMIT;
