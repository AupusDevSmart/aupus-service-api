-- Criticidade pela matriz impacto x probabilidade (SN-64, 2026-10-19)
--
-- A criticidade do equipamento (1 a 5) passa a ter critério: o impacto da
-- falha e a probabilidade (1 a 5 cada) sugerem o nível pela matriz
-- (src/core/modules/equipamentos/criticidade-pela-matriz.ts), e quem grava
-- outro nível informa o motivo. Equipamento de antes fica sem avaliação: as
-- três colunas nulas, e a criticidade como está.
--
-- Só acrescenta três colunas anuláveis e a trava das notas. Não apaga nem
-- altera dado. Idempotente. A sincronização com o NexOn descarta coluna que o
-- outro lado não tem (filtrarParaEsteBanco), e o que vem do NexOn sem elas não
-- as apaga. Antes do restart da API nova: sem as colunas, abrir, listar e
-- salvar equipamento dão 500. Se parar no lock_timeout, não reiniciar a API:
-- rodar de novo.
--
-- A conversão dos A/B/C antigos é outro script, com prévia:
-- 2026-10-19-criticidade-antiga.sql.
--
--   psql -f 2026-10-19-criticidade-pela-matriz.sql

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
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipamentos_criticidade_matriz_check' AND conrelid = 'public.equipamentos'::regclass) THEN
    -- A primeira versão (só no dev e no teste) deixava passar uma nota sozinha
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'equipamentos_criticidade_matriz_check' AND conrelid = 'public.equipamentos'::regclass
         AND pg_get_constraintdef(oid) LIKE '%criticidade_probabilidade IS NOT NULL%'
    ) THEN
      RAISE EXCEPTION 'equipamentos_criticidade_matriz_check existe com outra definição: DROP CONSTRAINT e rode de novo';
    END IF;
    RETURN;
  END IF;

  -- Uma tabela só: sem ordem de travas para dar deadlock com a API
  LOCK TABLE public.equipamentos IN ACCESS EXCLUSIVE MODE;

  ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS criticidade_impacto SMALLINT;
  ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS criticidade_probabilidade SMALLINT;
  ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS criticidade_motivo VARCHAR(1000);

  -- A API responde 400 antes; a trava é a rede para escrita fora dela. O
  -- motivo não entra na trava: a regra dele depende da matriz, que mora no
  -- código, e a criticidade pode mudar pela sincronização com o NexOn.
  -- Os IS NOT NULL não sobram: CHECK que dá NULL passa, e com uma nota só o
  -- BETWEEN da outra daria NULL (achado no teste).
  ALTER TABLE public.equipamentos
    ADD CONSTRAINT equipamentos_criticidade_matriz_check
    CHECK (
      (criticidade_impacto IS NULL AND criticidade_probabilidade IS NULL)
      OR (criticidade_impacto IS NOT NULL AND criticidade_probabilidade IS NOT NULL
          AND criticidade_impacto BETWEEN 1 AND 5 AND criticidade_probabilidade BETWEEN 1 AND 5)
    );
END $$;

COMMIT;

-- Conferência: IF NOT EXISTS pula calado o que já existe com outra forma
SELECT column_name, data_type, character_maximum_length, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'equipamentos' AND column_name LIKE 'criticidade%'
 ORDER BY 1;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'equipamentos_criticidade_matriz_check';
