-- Foto por tarefa e por item do checklist (SN-59, 2026-10-16)
--
-- O anexo da OS pode pertencer a uma tarefa da OS (tarefas_os) ou a um item do
-- checklist (checklist_atividades_os). Sem nenhum dos dois é o anexo geral da
-- OS, como hoje. O passo da instrução pode exigir foto (exige_foto), e o item
-- da OS congela isso: o item que exige foto só é marcado com uma foto dele.
--
-- Só acrescenta (colunas com padrão, FKs anuláveis, índices). Não apaga nem
-- altera dado: os anexos que existem ficam gerais. Idempotente: rodar de novo
-- não trava nada se já está tudo lá. A API antiga convive com as colunas novas.
-- Antes do restart da API nova: sem as colunas dão 500 enviar e listar anexos,
-- gerar o checklist (iniciar a OS), abrir a OS e abrir ou salvar a instrução.
--
-- Duas transações, cada uma travando só o que altera: numa só, nenhuma ordem
-- de travas escapava de um caminho da API (executar a OS escreve na tarefa e
-- depois lê o checklist; concluir a tarefa faz o contrário) e dava deadlock.
-- Se ainda assim sair "deadlock detected", nada foi gravado: rodar de novo.
--
-- Depois do 2026-10-16-leituras-do-checklist.sql.
--
--   psql -f 2026-10-16-fotos-por-item.sql

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() NOT IN ('aupus_service', 'aupus_local', 'aupus_test') THEN
    RAISE EXCEPTION 'Script do banco do Service (aupus_service); este banco é %', current_database();
  END IF;
END $$;

-- 1. O "exige foto" do passo e do item, como as colunas do SN-58
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'checklist_atividades_os' AND column_name = 'exige_foto')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sub_instrucoes' AND column_name = 'exige_foto') THEN
    -- Na ordem em que a API lê as duas ao iniciar a OS
    LOCK TABLE public.checklist_atividades_os, public.sub_instrucoes IN ACCESS EXCLUSIVE MODE;
    ALTER TABLE public.sub_instrucoes ADD COLUMN IF NOT EXISTS exige_foto BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE public.checklist_atividades_os ADD COLUMN IF NOT EXISTS exige_foto BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
COMMIT;

-- 2. Onde o anexo prova: a tarefa ou o item. O anexo primeiro (é a tabela que
-- muda); a tarefa e o item só são referenciados pelas FKs novas, e para elas
-- basta barrar escrita (SHARE ROW EXCLUSIVE não barra leitura)
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE
  -- A FK no formato do Prisma (ON UPDATE CASCADE, o padrão das relações do
  -- schema): noutro formato, o migrate diff a mostraria como mudança para sempre
  fk_tarefa_ok BOOLEAN := EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'anexos_os_tarefa_os_id_fkey'
    AND conrelid = 'public.anexos_os'::regclass AND confupdtype = 'c' AND confdeltype = 'n');
  fk_item_ok BOOLEAN := EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'anexos_os_checklist_item_id_fkey'
    AND conrelid = 'public.anexos_os'::regclass AND confupdtype = 'c' AND confdeltype = 'n');
BEGIN
  IF fk_tarefa_ok AND fk_item_ok
     AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'anexos_os_tarefa_os_id_idx')
     AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'anexos_os_checklist_item_id_idx') THEN
    RETURN;
  END IF;

  LOCK TABLE public.anexos_os IN ACCESS EXCLUSIVE MODE;
  LOCK TABLE public.tarefas_os, public.checklist_atividades_os IN SHARE ROW EXCLUSIVE MODE;

  ALTER TABLE public.anexos_os
    ADD COLUMN IF NOT EXISTS tarefa_os_id      TEXT,
    ADD COLUMN IF NOT EXISTS checklist_item_id TEXT;

  -- SET NULL: apagar a tarefa ou o item (só acontece com a OS apagada, que leva
  -- os anexos junto por CASCADE) não apaga a foto
  IF NOT fk_tarefa_ok THEN
    ALTER TABLE public.anexos_os DROP CONSTRAINT IF EXISTS anexos_os_tarefa_os_id_fkey;
    ALTER TABLE public.anexos_os ADD CONSTRAINT anexos_os_tarefa_os_id_fkey
      FOREIGN KEY (tarefa_os_id) REFERENCES public.tarefas_os (id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT fk_item_ok THEN
    ALTER TABLE public.anexos_os DROP CONSTRAINT IF EXISTS anexos_os_checklist_item_id_fkey;
    ALTER TABLE public.anexos_os ADD CONSTRAINT anexos_os_checklist_item_id_fkey
      FOREIGN KEY (checklist_item_id) REFERENCES public.checklist_atividades_os (id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;

  CREATE INDEX IF NOT EXISTS anexos_os_tarefa_os_id_idx ON public.anexos_os (tarefa_os_id);
  CREATE INDEX IF NOT EXISTS anexos_os_checklist_item_id_idx ON public.anexos_os (checklist_item_id);
END $$;
COMMIT;

-- Conferência: IF NOT EXISTS pula calado o que já existe com outra forma
SELECT table_name, column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND ((table_name IN ('sub_instrucoes', 'checklist_atividades_os') AND column_name = 'exige_foto')
     OR (table_name = 'anexos_os' AND column_name IN ('tarefa_os_id', 'checklist_item_id')))
 ORDER BY 1, 2;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.anexos_os'::regclass AND contype = 'f' ORDER BY 1;
SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'anexos_os' ORDER BY 1;
