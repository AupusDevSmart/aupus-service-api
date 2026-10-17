-- Dados de falha na OS (SN-60, 2026-10-16)
--
-- A corretiva registra quando o equipamento parou e quando voltou a funcionar,
-- o sintoma, a causa e a ação tomada — a base do MTTR, do MTBF e da
-- disponibilidade (Fase 6). Nos outros tipos são opcionais (a preventiva pode
-- ter parado o equipamento). Antes só havia o texto livre "problemas
-- encontrados", e o tempo parado não existia em lugar nenhum.
--
-- Só acrescenta colunas anuláveis e uma trava de coerência (o retorno não vem
-- antes da parada). Não apaga nem altera dado. Idempotente. A API antiga
-- convive com as colunas novas. Antes do restart da API nova, e conferindo o
-- SELECT do fim (cinco colunas e o CHECK): sem as colunas cai TODO o fluxo de
-- OS — aprovar a programação (cria a OS), abrir, listar, iniciar, executar,
-- cancelar, a agenda e o painel. Se o script parar no lock_timeout, não
-- reiniciar a API: rodar de novo.
--
-- Rodar sozinho, em série com os outros do deploy, nunca junto numa transação
-- (psql -1): segurando outras tabelas enquanto espera ordens_servico, daria
-- deadlock com o executar da OS.
--
--   psql -f 2026-10-16-dados-de-falha.sql

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() NOT IN ('aupus_service', 'aupus_local', 'aupus_test') THEN
    RAISE EXCEPTION 'Script do banco do Service (aupus_service); este banco é %', current_database();
  END IF;
END $$;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ordens_servico' AND column_name = 'falha_acao')
     AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordens_servico_parada_check' AND conrelid = 'public.ordens_servico'::regclass) THEN
    RETURN;
  END IF;

  -- Uma tabela só: sem ordem de travas para dar deadlock com a API
  LOCK TABLE public.ordens_servico IN ACCESS EXCLUSIVE MODE;

  -- TIMESTAMP(0) em UTC, como data_hora_inicio_real e data_hora_fim_real
  ALTER TABLE public.ordens_servico
    ADD COLUMN IF NOT EXISTS parada_inicio TIMESTAMP(0),
    ADD COLUMN IF NOT EXISTS parada_fim    TIMESTAMP(0),
    ADD COLUMN IF NOT EXISTS falha_sintoma TEXT,
    ADD COLUMN IF NOT EXISTS falha_causa   TEXT,
    ADD COLUMN IF NOT EXISTS falha_acao    TEXT;

  -- A API responde 400 antes; a trava é a rede para escrita fora dela
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordens_servico_parada_check' AND conrelid = 'public.ordens_servico'::regclass) THEN
    ALTER TABLE public.ordens_servico
      ADD CONSTRAINT ordens_servico_parada_check
      CHECK ((parada_inicio IS NULL) = (parada_fim IS NULL) AND (parada_fim IS NULL OR parada_fim >= parada_inicio));
  END IF;
END $$;

COMMIT;

-- Conferência: IF NOT EXISTS pula calado o que já existe com outra forma
SELECT column_name, data_type, datetime_precision, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'ordens_servico'
   AND column_name IN ('parada_inicio', 'parada_fim', 'falha_sintoma', 'falha_causa', 'falha_acao')
 ORDER BY 1;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ordens_servico_parada_check';
