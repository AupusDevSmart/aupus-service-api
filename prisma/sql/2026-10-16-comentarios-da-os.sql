-- Comentários na OS (SN-48, 2026-10-16)
--
-- A solicitação já tinha comentarios_solicitacao_servico (vazia, sem tela). A
-- OS ganha a mesma tabela, coluna por coluna, para um serviço só atender as
-- duas: autor (nome no momento) e autor_id, `privado` = comentário interno,
-- que o cliente não vê, e exclusão lógica (deleted_at).
-- Só cria: não apaga nem altera dado. Idempotente.
--
-- As datas são TIMESTAMP sem fuso em UTC: quem grava é o Prisma (@default(now())
-- em UTC). INSERT feito à mão tem de passar created_at em UTC — o DEFAULT
-- CURRENT_TIMESTAMP usa o fuso da sessão, e numa sessão em America/Sao_Paulo o
-- comentário nasceria 3 h no passado (nunca editável, hora errada na tela).
--
--   psql -f 2026-10-16-comentarios-da-os.sql

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() NOT IN ('aupus_service', 'aupus_local', 'aupus_test') THEN
    RAISE EXCEPTION 'Script do banco do Service (aupus_service); este banco é %', current_database();
  END IF;
END $$;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.comentarios_os (
  id         TEXT      PRIMARY KEY,
  os_id      TEXT      NOT NULL REFERENCES public.ordens_servico (id) ON DELETE CASCADE,
  comentario TEXT      NOT NULL,
  autor      TEXT      NOT NULL,
  autor_id   TEXT,
  privado    BOOLEAN   NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS comentarios_os_os_id_idx ON public.comentarios_os (os_id);

COMMIT;

-- Conferência: IF NOT EXISTS pula calado o que já existe com outra forma
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'comentarios_os'
 ORDER BY ordinal_position;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.comentarios_os'::regclass ORDER BY 1;
SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'comentarios_os' ORDER BY 1;
