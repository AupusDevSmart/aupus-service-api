-- Comentários na OS (SN-48, 2026-10-16)
--
-- A solicitação já tinha comentarios_solicitacao_servico (vazia, sem tela). A
-- OS ganha a mesma tabela, coluna por coluna, para um serviço só atender as
-- duas: autor (nome no momento) e autor_id, `privado` = comentário interno,
-- que o cliente não vê, e exclusão lógica (deleted_at).
-- Só cria: não apaga nem altera dado. Idempotente.
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

-- Conferência
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'comentarios_os'
 ORDER BY ordinal_position;
