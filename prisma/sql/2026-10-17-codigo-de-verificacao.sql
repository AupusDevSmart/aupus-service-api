-- Código de verificação da OS finalizada (SN-62, 2026-10-17)
--
-- Ao finalizar, a API grava o conteúdo registrado da OS (tarefas, checklist e
-- leituras, fotos pela soma do arquivo, dados de falha, horas, materiais e
-- resultado), o SHA-256 dele e a hora da finalização. O PDF sai desse conteúdo
-- e mostra o código; conferir o código refaz a conta sobre o que está no
-- sistema e diz se ainda é o mesmo. Sem assinatura (decisão do usuário).
--
-- `finalizada_em` não existia: a tela mostrava o fim da execução como data da
-- finalização. As OS já finalizadas ganham a data da trilha (FINALIZACAO), e
-- ficam SEM código — o conteúdo de hoje não prova o da finalização.
--
-- Só acrescenta colunas anuláveis (três em ordens_servico, `sha256` em
-- anexos_os), um índice único (vazio) e três travas de formato. O único dado escrito é a `finalizada_em` das OS finalizadas, tirada
-- da trilha. Idempotente. Antes do restart da API nova, conferindo o SELECT do
-- fim: sem as colunas cai TODO o fluxo de OS — aprovar a programação (cria a OS),
-- abrir, listar, executar e finalizar. Se o script parar no lock_timeout, não
-- reiniciar a API: rodar de novo.
--
-- Rodar sozinho, em série com os outros do deploy, nunca junto numa transação
-- (psql -1): segurando outras tabelas enquanto espera ordens_servico, daria
-- deadlock com o executar e o finalizar da OS.
--
--   psql -f 2026-10-17-codigo-de-verificacao.sql

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
  -- Pronto quando a trava já tem a forma de hoje (o JSON tem de ser objeto):
  -- a versão anterior do script, que só rodou no dev, converge
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ordens_servico' AND column_name = 'conteudo_finalizado')
     AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordens_servico_codigo_verificacao_check' AND conrelid = 'public.ordens_servico'::regclass
                 AND pg_get_constraintdef(oid) LIKE '%jsonb_typeof%') THEN
    RETURN;
  END IF;

  -- Uma tabela só: sem ordem de travas para dar deadlock com a API
  LOCK TABLE public.ordens_servico IN ACCESS EXCLUSIVE MODE;

  ALTER TABLE public.ordens_servico
    ADD COLUMN IF NOT EXISTS finalizada_em       TIMESTAMP(0),
    ADD COLUMN IF NOT EXISTS codigo_verificacao  CHAR(64),
    ADD COLUMN IF NOT EXISTS conteudo_finalizado JSONB;

  -- O nome que o Prisma dá ao @unique: com outro, o migrate diff acusaria sempre
  CREATE UNIQUE INDEX IF NOT EXISTS ordens_servico_codigo_verificacao_key
    ON public.ordens_servico (codigo_verificacao);

  -- A API grava os dois juntos, o código em hexadecimal minúsculo e o conteúdo
  -- como objeto; a trava é a rede para escrita fora dela. O JSON `null` não é o
  -- NULL do SQL: sem o jsonb_typeof, código com conteúdo `null` passava
  ALTER TABLE public.ordens_servico DROP CONSTRAINT IF EXISTS ordens_servico_codigo_verificacao_check;
  ALTER TABLE public.ordens_servico
    ADD CONSTRAINT ordens_servico_codigo_verificacao_check
    CHECK ((codigo_verificacao IS NULL) = (conteudo_finalizado IS NULL)
           AND (codigo_verificacao IS NULL OR codigo_verificacao ~ '^[0-9a-f]{64}$')
           AND (conteudo_finalizado IS NULL OR jsonb_typeof(conteudo_finalizado) = 'object'));
END $$;

COMMIT;

-- Transação própria, depois do DDL e fora da guarda: a data da finalização das
-- OS já finalizadas, pela trilha. Rodar de novo pega as que a API antiga
-- finalizou entre o script e o restart (só as sem data). O PRIMEIRO registro:
-- o duplo "Finalizar" (corrigido no SN-62) gravou dois. No segundo, para
-- baixo: a coluna é TIMESTAMP(0), que arredondaria os milissegundos
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.ordens_servico o
   SET finalizada_em = date_trunc('second', h.quando)
  FROM (SELECT os_id, min(data) AS quando FROM public.historico_os WHERE acao = 'FINALIZACAO' GROUP BY os_id) h
 WHERE h.os_id = o.id
   AND o.status = 'FINALIZADA'
   AND o.finalizada_em IS NULL;

COMMIT;

-- Transação 2, separada: travar anexos_os segurando ordens_servico daria
-- deadlock com o upload (que grava o anexo com a chave da OS). O SHA-256 de cada
-- arquivo, gravado no upload: sem ele o finalizar, a prévia e o PDF de OS antiga
-- liam e somavam todos os arquivos do disco a cada pedido. Os anexos que já
-- existem ficam nulos: a conta lê o disco para eles, como antes.
BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'anexos_os_sha256_check' AND conrelid = 'public.anexos_os'::regclass) THEN
    RETURN;
  END IF;

  LOCK TABLE public.anexos_os IN ACCESS EXCLUSIVE MODE;

  ALTER TABLE public.anexos_os ADD COLUMN IF NOT EXISTS sha256 CHAR(64);

  ALTER TABLE public.anexos_os
    ADD CONSTRAINT anexos_os_sha256_check CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$');
END $$;

COMMIT;

-- Conferência: IF NOT EXISTS pula calado o que já existe com outra forma
SELECT column_name, data_type, datetime_precision, character_maximum_length, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'ordens_servico'
   AND column_name IN ('finalizada_em', 'codigo_verificacao', 'conteudo_finalizado')
 ORDER BY 1;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname IN ('ordens_servico_codigo_verificacao_check', 'anexos_os_sha256_check') ORDER BY 1;
SELECT column_name, data_type, character_maximum_length FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'anexos_os' AND column_name = 'sha256';
SELECT indexname, indexdef FROM pg_indexes WHERE indexname = 'ordens_servico_codigo_verificacao_key';
-- Finalizadas sem data (sem FINALIZACAO na trilha): ficam sem, e a tela não inventa
SELECT count(*) FILTER (WHERE finalizada_em IS NOT NULL) AS finalizadas_com_data,
       count(*) FILTER (WHERE finalizada_em IS NULL) AS finalizadas_sem_data
  FROM public.ordens_servico WHERE status = 'FINALIZADA';
