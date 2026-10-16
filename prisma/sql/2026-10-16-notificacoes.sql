-- Notificações (SN-47, 2026-10-16)
--
-- Aviso de mudança de status da programação, da OS e das origens delas, no
-- sininho e por e-mail. Quatro peças:
--   notificacoes               a que já existia (herdada do Laravel, vazia e sem
--                              uso) ganha o evento, o registro e a planta;
--   notificacoes_eventos       o evento, gravado NA MESMA TRANSAÇÃO da mudança
--                              de status: se ela desfaz, ele some junto; um
--                              processador o transforma em notificações;
--   notificacoes_envios        a fila do e-mail (e, depois, do WhatsApp), com
--                              tentativa, próxima tentativa e erro;
--   notificacoes_preferencias  o que cada um quer receber por e-mail (o sininho
--                              recebe sempre).
-- Só cria e acrescenta coluna: não apaga nem altera dado. Idempotente.
--
--   psql -f 2026-10-16-notificacoes.sql

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() NOT IN ('aupus_service', 'aupus_local', 'aupus_test') THEN
    RAISE EXCEPTION 'Script do banco do Service (aupus_service); este banco é %', current_database();
  END IF;
  -- O índice novo de notificacoes não é CONCURRENTLY: só serve com a tabela
  -- vazia (herdada e sem uso). Com linhas, parar e decidir antes
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'notificacoes_usuario_lida_idx')
     AND (SELECT count(*) FROM public.notificacoes) > 10000 THEN
    RAISE EXCEPTION 'notificacoes tem linhas antigas demais para indexar dentro da transação: rever antes';
  END IF;
END $$;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS evento      VARCHAR(60),
  ADD COLUMN IF NOT EXISTS entidade    VARCHAR(30),
  ADD COLUMN IF NOT EXISTS entidade_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS planta_id   CHAR(26),
  ADD COLUMN IF NOT EXISTS lida_em     TIMESTAMP(0);

-- O sininho: as não lidas de quem está logado, das mais novas para as antigas
CREATE INDEX IF NOT EXISTS notificacoes_usuario_lida_idx
  ON public.notificacoes (usuario_id, lida, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notificacoes_eventos (
  id            BIGSERIAL PRIMARY KEY,
  evento        VARCHAR(60)  NOT NULL,
  entidade      VARCHAR(30)  NOT NULL,
  entidade_id   VARCHAR(36)  NOT NULL,
  ator_id       CHAR(26),
  criado_em     TIMESTAMP(0) NOT NULL,
  processado_em TIMESTAMP(0),
  erro          TEXT
);
CREATE INDEX IF NOT EXISTS notificacoes_eventos_pendentes_idx
  ON public.notificacoes_eventos (id) WHERE processado_em IS NULL;

CREATE TABLE IF NOT EXISTS public.notificacoes_envios (
  id                BIGSERIAL PRIMARY KEY,
  notificacao_id    CHAR(26)     NOT NULL REFERENCES public.notificacoes (id) ON DELETE CASCADE,
  canal             VARCHAR(20)  NOT NULL,
  destino           VARCHAR(255) NOT NULL,
  status            VARCHAR(20)  NOT NULL DEFAULT 'pendente',
  tentativas        INTEGER      NOT NULL DEFAULT 0,
  proxima_tentativa TIMESTAMP(0) NOT NULL,
  erro              TEXT,
  enviado_em        TIMESTAMP(0),
  criado_em         TIMESTAMP(0) NOT NULL
);
CREATE INDEX IF NOT EXISTS notificacoes_envios_fila_idx
  ON public.notificacoes_envios (proxima_tentativa) WHERE status = 'pendente';
-- A FK em cascata: apagar notificação (limpeza, usuário excluído de verdade)
-- sem este índice lê a fila inteira para cada uma
CREATE INDEX IF NOT EXISTS notificacoes_envios_notificacao_idx
  ON public.notificacoes_envios (notificacao_id);

-- entidade_id nasceu VARCHAR(26), e o id da programação/OS/solicitação é texto
-- sem limite (cuid, 25 hoje): id maior faria a mudança de status falhar junto
-- com o evento. Para quem já rodou a versão anterior deste arquivo (dev, test)
ALTER TABLE public.notificacoes ALTER COLUMN entidade_id TYPE VARCHAR(36);
ALTER TABLE public.notificacoes_eventos ALTER COLUMN entidade_id TYPE VARCHAR(36);

CREATE TABLE IF NOT EXISTS public.notificacoes_preferencias (
  usuario_id    CHAR(26)     NOT NULL REFERENCES public.usuarios (id) ON DELETE CASCADE,
  evento        VARCHAR(60)  NOT NULL,
  canal         VARCHAR(20)  NOT NULL,
  ativo         BOOLEAN      NOT NULL,
  atualizado_em TIMESTAMP(0) NOT NULL,
  PRIMARY KEY (usuario_id, evento, canal)
);

COMMIT;

-- Conferência: IF NOT EXISTS pula calado o que já existe com outra forma
SELECT table_name, column_name, data_type, character_maximum_length
  FROM information_schema.columns
 WHERE table_schema = 'public' AND column_name = 'entidade_id' AND table_name LIKE 'notificacoes%'
 ORDER BY 1;
SELECT indexname, indexdef FROM pg_indexes
 WHERE schemaname = 'public' AND tablename LIKE 'notificacoes%'
 ORDER BY 1;
