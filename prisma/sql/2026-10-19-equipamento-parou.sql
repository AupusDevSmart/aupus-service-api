-- O equipamento parou? gravado na OS (SN-60, 2026-10-19)
--
-- Na corretiva, quando o equipamento parou e quando voltou passam a ser
-- opcionais (decisão do usuário: o técnico nem sempre sabe a hora). A pergunta
-- "o equipamento parou?" continua obrigatória, e a resposta precisa ficar
-- gravada: até aqui ela era deduzida das datas, e um "sim" sem horário ficaria
-- igual a um "não". Nula = não respondida (OS de antes do SN-60, ou de outro
-- tipo sem parada).
--
-- Preenche as OS que já têm resposta: com parada = parou; corretiva com
-- sintoma e sem parada = não parou (a API exigia as datas de quem parou).
-- Trava de coerência: parada só em quem parou. Não apaga dado. Idempotente.
-- Depois de 2026-10-16-dados-de-falha.sql e antes do restart da API nova,
-- conferindo o SELECT do fim. Se parar no lock_timeout, não reiniciar a API:
-- rodar de novo.
--
-- Rodar sozinho, em série com os outros do deploy, nunca junto numa transação
-- (psql -1): segurando outras tabelas enquanto espera ordens_servico, daria
-- deadlock com o executar da OS.
--
--   psql -f 2026-10-19-equipamento-parou.sql

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
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordens_servico_parou_check' AND conrelid = 'public.ordens_servico'::regclass) THEN
    RETURN;
  END IF;

  -- Uma tabela só: sem ordem de travas para dar deadlock com a API
  LOCK TABLE public.ordens_servico IN ACCESS EXCLUSIVE MODE;

  ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS equipamento_parou BOOLEAN;

  -- A finalizada com código fica como está: a resposta entraria no conteúdo
  -- recalculado e a conferência daria "não confere" (SN-62). No deploy não
  -- há nenhuma (este script roda antes da API nova); se houver uma COM parada,
  -- o CHECK abaixo falha e o script para inteiro (ROLLBACK) — melhor que mudar
  -- calado o conteúdo de uma OS com código.
  UPDATE public.ordens_servico SET equipamento_parou = true
   WHERE equipamento_parou IS NULL AND parada_inicio IS NOT NULL AND codigo_verificacao IS NULL;
  UPDATE public.ordens_servico SET equipamento_parou = false
   WHERE equipamento_parou IS NULL AND parada_inicio IS NULL AND codigo_verificacao IS NULL
     AND tipo = 'CORRETIVA' AND falha_sintoma IS NOT NULL;

  -- A API responde 400 antes; a trava é a rede para escrita fora dela
  ALTER TABLE public.ordens_servico
    ADD CONSTRAINT ordens_servico_parou_check
    CHECK (parada_inicio IS NULL OR equipamento_parou IS TRUE);
END $$;

COMMIT;

-- Conferência: a coluna, a trava e como ficaram as respostas
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'ordens_servico' AND column_name = 'equipamento_parou';
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ordens_servico_parou_check';
SELECT tipo, equipamento_parou, count(*) AS os, count(parada_inicio) AS com_parada
  FROM public.ordens_servico
 WHERE equipamento_parou IS NOT NULL OR falha_sintoma IS NOT NULL
 GROUP BY 1, 2 ORDER BY 1, 2;
