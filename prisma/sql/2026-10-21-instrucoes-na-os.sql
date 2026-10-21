-- Instruções na OS de qualquer origem (SN-86, 2026-10-21)
--
-- Decisão do usuário (20/out/2026): a programação nasce com as instruções da
-- origem (as das tarefas, da anomalia ou da solicitação) e o planejador
-- acrescenta ou tira antes de aprovar. A instrução avulsa (que não vem por
-- tarefa) é uma linha de tarefas_programacao_os / tarefas_os SEM tarefa,
-- congelada como a da tarefa (instrucao_tag, instrucao_nome,
-- instrucao_descricao): a execução trata as duas igual (checklist agrupado,
-- "feita", motivo de não feita, PDF, conteúdo selado).
--
--   origem_item:   TAREFA (a linha de sempre, padrão) ou INSTRUCAO (a avulsa)
--   instrucao_id:  a instrução congelada, só de rastro (o conteúdo é o snapshot);
--                  SET NULL se ela for apagada de verdade (o normal é soft delete)
--
-- Acrescenta: as linhas que existem ficam TAREFA, como eram, e a programação
-- PENDENTE de anomalia ou solicitação ganha as instruções da origem. Não está na
-- sincronização com o NexOn.
--
-- PRÉVIA POR PADRÃO (mostra e desfaz). Grava com -v aplicar=1. Idempotente: as
-- colunas, as regras e os índices só se criam uma vez, e a cópia das instruções da
-- origem só roda na execução que cria a coluna (rodar de novo depois do deploy não
-- devolve as instruções que o planejador tirou).
--
-- Com a API PARADA (a mesma janela do 5p): a API antiga copiaria a linha nova para
-- a OS sem origem_item nem instrucao_id, e a nova sem as colunas dá 500. As duas
-- tabelas ficam travadas até o fim; fora do horário de pico.
--
--   psql -f 2026-10-21-instrucoes-na-os.sql               (prévia)
--   psql -v aplicar=1 -f 2026-10-21-instrucoes-na-os.sql  (grava)

\set ON_ERROR_STOP on

\if :{?aplicar}
\else
\set aplicar off
\endif

BEGIN;

DO $$
BEGIN
  IF current_database() NOT IN ('aupus_service', 'aupus_local', 'aupus_test') THEN
    RAISE EXCEPTION 'Script do banco do Service (aupus_service); este banco é %', current_database();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'instrucoes' AND column_name = 'codigo') THEN
    RAISE EXCEPTION 'Falta a instrução do AupusProject: aplique antes o 2026-10-20-instrucao-como-no-aupusproject.sql (SN-85)';
  END IF;
END $$;

-- Esperando a trava, o ALTER seguraria todas as consultas das duas tabelas: 2 s e
-- rodar de novo se falhar
SET LOCAL lock_timeout = '2s';

-- A cópia das instruções da origem só na execução que cria a coluna
SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'tarefas_programacao_os'
                      AND column_name = 'origem_item') AS copiar_da_origem \gset

\echo 'Tamanho das duas tabelas:'
SELECT (SELECT count(*) FROM public.tarefas_programacao_os) AS tarefas_programacao_os,
       (SELECT count(*) FROM public.tarefas_os) AS tarefas_os;

ALTER TABLE public.tarefas_programacao_os
  ADD COLUMN IF NOT EXISTS origem_item VARCHAR(12) NOT NULL DEFAULT 'TAREFA',
  ADD COLUMN IF NOT EXISTS instrucao_id VARCHAR(26);
ALTER TABLE public.tarefas_os
  ADD COLUMN IF NOT EXISTS origem_item VARCHAR(12) NOT NULL DEFAULT 'TAREFA',
  ADD COLUMN IF NOT EXISTS instrucao_id VARCHAR(26);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tarefas_programacao_os_origem_item_valida'
                  AND conrelid = 'public.tarefas_programacao_os'::regclass) THEN
    ALTER TABLE public.tarefas_programacao_os ADD CONSTRAINT tarefas_programacao_os_origem_item_valida
      CHECK (origem_item IN ('TAREFA', 'INSTRUCAO'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tarefas_os_origem_item_valida'
                  AND conrelid = 'public.tarefas_os'::regclass) THEN
    ALTER TABLE public.tarefas_os ADD CONSTRAINT tarefas_os_origem_item_valida
      CHECK (origem_item IN ('TAREFA', 'INSTRUCAO'));
  END IF;
  -- A avulsa tem a instrução e não tem tarefa; a da tarefa tem a tarefa (ou a perdeu, quando a cópia do plano foi apagada)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tarefas_programacao_os_avulsa_sem_tarefa'
                  AND conrelid = 'public.tarefas_programacao_os'::regclass) THEN
    ALTER TABLE public.tarefas_programacao_os ADD CONSTRAINT tarefas_programacao_os_avulsa_sem_tarefa
      CHECK (origem_item = 'TAREFA' OR tarefa_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tarefas_os_avulsa_sem_tarefa'
                  AND conrelid = 'public.tarefas_os'::regclass) THEN
    ALTER TABLE public.tarefas_os ADD CONSTRAINT tarefas_os_avulsa_sem_tarefa
      CHECK (origem_item = 'TAREFA' OR tarefa_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tarefas_programacao_os_instrucao_id_fkey'
                  AND conrelid = 'public.tarefas_programacao_os'::regclass) THEN
    ALTER TABLE public.tarefas_programacao_os ADD CONSTRAINT tarefas_programacao_os_instrucao_id_fkey
      FOREIGN KEY (instrucao_id) REFERENCES public.instrucoes(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tarefas_os_instrucao_id_fkey'
                  AND conrelid = 'public.tarefas_os'::regclass) THEN
    ALTER TABLE public.tarefas_os ADD CONSTRAINT tarefas_os_instrucao_id_fkey
      FOREIGN KEY (instrucao_id) REFERENCES public.instrucoes(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tarefas_programacao_os_instrucao_id_idx ON public.tarefas_programacao_os (instrucao_id);
CREATE INDEX IF NOT EXISTS tarefas_os_instrucao_id_idx ON public.tarefas_os (instrucao_id);
-- A mesma instrução avulsa uma vez só por programação e por OS (a API já não repete; o banco garante)
CREATE UNIQUE INDEX IF NOT EXISTS tarefas_programacao_os_avulsa_unica
  ON public.tarefas_programacao_os (programacao_id, instrucao_id) WHERE origem_item = 'INSTRUCAO';
CREATE UNIQUE INDEX IF NOT EXISTS tarefas_os_avulsa_unica
  ON public.tarefas_os (os_id, instrucao_id) WHERE origem_item = 'INSTRUCAO';

-- A programação PENDENTE de anomalia ou solicitação, de antes deste script, passa
-- a ter as instruções da origem como linhas, como a que nasce daqui em diante:
-- a tela as mostrava (lidas da origem) e os recursos dela já saíram delas, mas
-- sem a linha a aprovação levaria à OS uma corretiva sem checklist. Só as que
-- ainda não têm instrução avulsa nenhuma, só na execução que cria a coluna, e
-- não a que já vem por uma tarefa da mesma programação. A instrução excluída
-- fica de fora; a inativada depois do vínculo entra (a origem a pediu quando
-- valia), como a API faz. A OS que já existe não muda: é registro do que foi pedido.
\if :copiar_da_origem
CREATE TEMP TABLE avulsa_nova ON COMMIT DROP AS
WITH programacao_base AS (
  SELECT p.id, p.equipamento_id, p.anomalia_id,
         COALESCE(NULLIF(trim(p.solicitacao_servico_id), ''), NULLIF(trim(p.dados_origem->>'solicitacaoServicoId'), '')) AS solicitacao_id
    FROM public.programacoes_os p
   WHERE p.status = 'PENDENTE'
     AND p.deletado_em IS NULL
     AND p.origem IN ('ANOMALIA', 'SOLICITACAO_SERVICO')
     AND NOT EXISTS (SELECT 1 FROM public.tarefas_programacao_os a
                      WHERE a.programacao_id = p.id AND a.origem_item = 'INSTRUCAO')
),
-- O equipamento da avulsa é o da programação e, sem ele, o da origem (como a API):
-- com a avulsa sem equipamento, a corretiva sumia do histórico do equipamento
programacao AS (
  SELECT b.id, b.anomalia_id, b.solicitacao_id,
         COALESCE(NULLIF(trim(b.equipamento_id), ''),
                  (SELECT NULLIF(trim(an.equipamento_id), '') FROM public.anomalias an WHERE trim(an.id) = trim(b.anomalia_id)),
                  (SELECT NULLIF(trim(ss.equipamento_id), '') FROM public.solicitacoes_servico ss WHERE trim(ss.id) = b.solicitacao_id)
         ) AS equipamento_id
    FROM programacao_base b
),
vinculo AS (
  SELECT p.id AS programacao_id, p.equipamento_id, ai.instrucao_id,
         row_number() OVER (PARTITION BY p.id ORDER BY ai.created_at, ai.id) AS posicao
    FROM programacao p
    JOIN public.anomalias_instrucoes ai ON trim(ai.anomalia_id) = trim(p.anomalia_id)
  UNION ALL
  SELECT p.id, p.equipamento_id, si.instrucao_id,
         row_number() OVER (PARTITION BY p.id ORDER BY si.ordem, si.id)
    FROM programacao p
    JOIN public.solicitacoes_instrucoes si ON trim(si.solicitacao_id) = p.solicitacao_id
   WHERE p.anomalia_id IS NULL
)
, unica AS (
  -- A mesma instrução uma vez por programação, na primeira posição em que aparece
  SELECT DISTINCT ON (v.programacao_id, trim(i.id))
         v.programacao_id, v.equipamento_id, v.posicao, i.id AS instrucao_id, i.codigo, i.nome, i.descricao
    FROM vinculo v
    JOIN public.instrucoes i ON trim(i.id) = trim(v.instrucao_id) AND i.deleted_at IS NULL
   WHERE NOT EXISTS (
           SELECT 1 FROM public.tarefas_programacao_os t
             JOIN public.tarefas ta ON trim(ta.id) = trim(t.tarefa_id)
            WHERE t.programacao_id = v.programacao_id AND trim(ta.instrucao_id) = trim(i.id))
   ORDER BY v.programacao_id, trim(i.id), v.posicao
)
SELECT u.programacao_id, u.equipamento_id, u.instrucao_id, u.codigo, u.nome, u.descricao,
       (SELECT COALESCE(max(t.ordem), 0) FROM public.tarefas_programacao_os t
         WHERE t.programacao_id = u.programacao_id AND t.origem_item = 'TAREFA')
       + row_number() OVER (PARTITION BY u.programacao_id ORDER BY u.posicao) AS ordem
  FROM unica u;

INSERT INTO public.tarefas_programacao_os
       (id, programacao_id, origem_item, instrucao_id, tarefa_id, ordem, status, equipamento_id,
        nome_snapshot, instrucao_tag, instrucao_nome, instrucao_descricao, created_at, updated_at)
SELECT substr(md5('sn86:' || n.programacao_id || ':' || trim(n.instrucao_id)), 1, 26),
       -- O id da instrução como está no banco: a FK é exata
       n.programacao_id, 'INSTRUCAO', n.instrucao_id, NULL, n.ordem, 'PENDENTE', NULLIF(trim(n.equipamento_id), ''),
       left(n.nome, 200), n.codigo, left(n.nome, 200), n.descricao, now(), now()
  FROM avulsa_nova n;

\echo 'Programações pendentes que ganharam as instruções da origem (programações, linhas):'
SELECT count(DISTINCT programacao_id) AS programacoes, count(*) AS linhas FROM avulsa_nova;
\else
\echo 'As colunas já existiam: a cópia das instruções da origem não roda de novo.'
\endif

\echo 'Conferência: as linhas por origem do item (as que existem ficam TAREFA):'
SELECT 'programacao' AS tabela, origem_item, count(*) FROM public.tarefas_programacao_os GROUP BY 1, 2
UNION ALL
SELECT 'os', origem_item, count(*) FROM public.tarefas_os GROUP BY 1, 2
ORDER BY 1, 2;

\if :aplicar
COMMIT;
\echo 'Gravado.'
\else
ROLLBACK;
\echo 'Prévia: nada foi gravado. Para gravar: psql -v aplicar=1 -f 2026-10-21-instrucoes-na-os.sql'
\endif
