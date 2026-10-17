-- Leituras no checklist da OS (SN-58, 2026-10-16)
--
-- O passo da instrução (sub_instrucoes) pode ser uma LEITURA: a equipe digita o
-- valor medido, com unidade e faixa aceitável (mínimo, máximo, um dos dois ou
-- nenhum). O item do checklist da OS congela tipo, unidade e faixa, como já
-- congela o texto, e guarda o valor lido. Fora da faixa não é coluna: sai da
-- conta valor x faixa, e a tarefa só fecha com a observação do item.
--
-- Só acrescenta colunas (com padrão: o que existe vira VERIFICACAO, como hoje).
-- Não apaga nem altera dado. Idempotente. A API antiga convive com as colunas
-- novas (o Prisma lista as colunas que conhece). Antes do restart da API nova:
-- sem as colunas dão 500 gerar o checklist (iniciar a OS), abrir a OS, abrir e
-- salvar a instrução e importar a planilha de instruções.
--
-- As duas tabelas ficam travadas do começo ao COMMIT (cada CHECK varre a
-- tabela; no tamanho de hoje, menos de 1 s). Aplicar com pouco movimento: quem
-- usar as tabelas nesse meio tempo espera.
--
--   psql -f 2026-10-16-leituras-do-checklist.sql

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() NOT IN ('aupus_service', 'aupus_local', 'aupus_test') THEN
    RAISE EXCEPTION 'Script do banco do Service (aupus_service); este banco é %', current_database();
  END IF;
END $$;

SET LOCAL lock_timeout = '5s';

-- Na mesma ordem em que a API lê as duas ao iniciar a OS (o checklist, depois
-- os passos): travar na ordem inversa podia dar deadlock com um "Iniciar"
LOCK TABLE public.checklist_atividades_os, public.sub_instrucoes IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.sub_instrucoes
  ADD COLUMN IF NOT EXISTS tipo         VARCHAR(20)   NOT NULL DEFAULT 'VERIFICACAO',
  ADD COLUMN IF NOT EXISTS unidade      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS valor_minimo NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS valor_maximo NUMERIC(14, 4);

ALTER TABLE public.checklist_atividades_os
  ADD COLUMN IF NOT EXISTS tipo         VARCHAR(20)   NOT NULL DEFAULT 'VERIFICACAO',
  ADD COLUMN IF NOT EXISTS unidade      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS valor_minimo NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS valor_maximo NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS valor_lido   NUMERIC(14, 4);

-- As travas repetem a regra da API (que responde 400 antes): são a rede para
-- escrita fora dela. Mínimo acima do máximo nunca aceitaria leitura nenhuma.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sub_instrucoes', 'checklist_atividades_os'] LOOP
    -- Pelo nome E pela tabela: o mesmo nome noutra tabela pulava calado
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_tipo_check' AND conrelid = format('public.%I', t)::regclass) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (tipo IN (''VERIFICACAO'', ''LEITURA''))', t, t || '_tipo_check');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_faixa_check' AND conrelid = format('public.%I', t)::regclass) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (valor_minimo IS NULL OR valor_maximo IS NULL OR valor_minimo <= valor_maximo)', t, t || '_faixa_check');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_so_leitura_check' AND conrelid = format('public.%I', t)::regclass) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (tipo = ''LEITURA'' OR (unidade IS NULL AND valor_minimo IS NULL AND valor_maximo IS NULL))', t, t || '_so_leitura_check');
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_atividades_os_valor_lido_check' AND conrelid = 'public.checklist_atividades_os'::regclass) THEN
    ALTER TABLE public.checklist_atividades_os
      ADD CONSTRAINT checklist_atividades_os_valor_lido_check CHECK (tipo = 'LEITURA' OR valor_lido IS NULL);
  END IF;
END $$;

COMMIT;

-- Conferência: IF NOT EXISTS pula calado o que já existe com outra forma
SELECT table_name, column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('sub_instrucoes', 'checklist_atividades_os')
   AND column_name IN ('tipo', 'unidade', 'valor_minimo', 'valor_maximo', 'valor_lido')
 ORDER BY 1, 2;
SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid IN ('public.sub_instrucoes'::regclass, 'public.checklist_atividades_os'::regclass)
   AND contype = 'c'
 ORDER BY 1, 2;
