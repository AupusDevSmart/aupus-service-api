-- Contato padronizado (SN-46, 2026-10-16)
--
-- Telefone em E.164 (+5562999998888) e e-mail sem caixa nos usuários. A API já
-- grava assim (DTO, sincronização); este script acerta o que está gravado:
--   1. telefone: converte o que é telefone (com ou sem máscara, com ou sem +55,
--      com o 0 da operadora) pela mesma regra de src/common/helpers/contato.ts;
--      o que não é telefone ("werwe", 4 dígitos, 8 dígitos sem DDD, fixo
--      começando em 9) vira NULL. A prévia lista o formato e os ids dos que
--      viram NULL (o número não aparece: é dado pessoal);
--   2. e-mail: aparado e em minúsculas. Conta EXCLUÍDA que colidiria libera o
--      e-mail (deleted_<id>_<email>, como o cadastro já faz ao reaproveitar).
--      PARA (nada gravado) se duas contas não excluídas ficariam com o mesmo
--      e-mail — decidir a mão qual fica, ANTES de reiniciar a API nova;
--   3. índice único em lower(email): o banco deixa de aceitar Ana@ e ana@ como
--      duas contas. Não está no schema.prisma (o Prisma não modela índice por
--      expressão) — ver prisma/TABELAS-FORA-DO-SCHEMA.md.
--
-- O saneamento NÃO vai para o NexOn: a escrita é marcada como replicação e o
-- gatilho da sincronização não a captura (decisão: não mexer no NexOn). Editar
-- um usuário compartilhado depois, pela tela, propaga como qualquer edição.
--
-- O telefone anulado não volta: fazer o backup de usuarios antes (DEPLOY.md).
--
-- Prévia (padrão, desfaz tudo no fim):  psql -f 2026-10-16-contato-padronizado.sql
-- Aplicar:                               psql -v aplicar=1 -f 2026-10-16-contato-padronizado.sql
-- Idempotente: rodar de novo não acha mais nada.

\set ON_ERROR_STOP on
\if :{?aplicar}
\else
\set aplicar false
\endif

BEGIN;

-- Só nos bancos do Service: no aupus do NexOn poria os e-mails de lá em minúsculas
DO $$
BEGIN
  IF current_database() NOT IN ('aupus_service', 'aupus_local', 'aupus_test') THEN
    RAISE EXCEPTION 'Script do banco do Service (aupus_service); este banco é %', current_database();
  END IF;
END $$;

SET LOCAL TIME ZONE 'UTC';          -- updated_at em UTC, como o Prisma grava
SET LOCAL lock_timeout = '5s';      -- não fica na fila atrás de uma importação longa
SET LOCAL sincronizacao.replicando = 'on';  -- o gatilho da sincronização não captura

-- Aparar como o trim() do JavaScript: espaço, tab, quebra de linha, NBSP e BOM
CREATE FUNCTION pg_temp.aparar(texto text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(coalesce(texto, ''), '^[[:space:] ﻿]+|[[:space:] ﻿]+$', '', 'g')
$$;

-- A mesma regra do telefoneE164 da API
CREATE FUNCTION pg_temp.telefone_e164(texto text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  limpo text := pg_temp.aparar(texto);
  d text := regexp_replace(limpo, '\D', '', 'g');
  nacional text;
BEGIN
  IF d = '' THEN RETURN NULL; END IF;
  IF left(limpo, 1) = '+' OR left(d, 2) = '00' THEN
    IF left(d, 2) = '00' AND left(limpo, 1) <> '+' THEN d := substr(d, 3); END IF;
    IF left(d, 2) = '55' THEN
      nacional := substr(d, 3);
    ELSIF d ~ '^[1-9][0-9]{7,14}$' THEN
      RETURN '+' || d;
    ELSE
      RETURN NULL;
    END IF;
  ELSIF length(d) IN (12, 13) AND left(d, 2) = '55' THEN
    nacional := substr(d, 3);
  ELSIF length(d) IN (11, 12) AND left(d, 1) = '0' THEN
    nacional := substr(d, 2);
  ELSE
    nacional := d;
  END IF;
  -- fixo começa de 2 a 5; começando em 9 é celular com um dígito a menos
  IF nacional ~ '^[1-9][1-9]([2-5][0-9]{7}|9[0-9]{8})$' THEN RETURN '+55' || nacional; END IF;
  RETURN NULL;
END $$;

CREATE TEMP TABLE telefone_novo ON COMMIT DROP AS
SELECT id, telefone AS antes, pg_temp.telefone_e164(telefone) AS depois
FROM public.usuarios
WHERE telefone IS NOT NULL AND telefone IS DISTINCT FROM pg_temp.telefone_e164(telefone);

\echo '== 1. telefones: o que muda (formato do que estava -> resultado)'
SELECT regexp_replace(antes, '[0-9]', '9', 'g') AS formato_antes,
       CASE WHEN depois IS NULL THEN 'vira vazio (nao e telefone)' ELSE 'vira E.164' END AS resultado,
       count(*)
FROM telefone_novo GROUP BY 1, 2 ORDER BY 2, 3 DESC;

\echo '== 1. contas cujo telefone vira vazio (ids; o numero antigo so no backup)'
SELECT string_agg(trim(id), ', ' ORDER BY id) AS ids FROM telefone_novo WHERE depois IS NULL;

UPDATE public.usuarios u SET telefone = t.depois, updated_at = now()
FROM telefone_novo t WHERE t.id = u.id;

\echo '== 2. contas EXCLUIDAS com e-mail que se repetiria sem caixa: liberam o e-mail (como o cadastro ja faz ao reaproveitar)'
WITH repetidos AS (SELECT lower(pg_temp.aparar(email)) AS e FROM public.usuarios GROUP BY 1 HAVING count(*) > 1)
UPDATE public.usuarios u SET email = 'deleted_' || trim(u.id) || '_' || lower(pg_temp.aparar(u.email)), updated_at = now()
FROM repetidos r
WHERE lower(pg_temp.aparar(u.email)) = r.e AND u.deleted_at IS NOT NULL
RETURNING trim(u.id) AS conta_excluida;  -- só o id: o e-mail é dado pessoal e iria para o terminal

\echo '== 2. contas NAO excluidas que ficariam com o mesmo e-mail sem caixa (se houver, o script para)'
SELECT count(*) AS contas, string_agg(trim(id), ', ') AS ids  -- só os ids, sem o e-mail
FROM public.usuarios GROUP BY lower(pg_temp.aparar(email)) HAVING count(*) > 1;

DO $$
DECLARE problema text;
BEGIN
  SELECT string_agg(ids, ' / ') INTO problema
  FROM (SELECT string_agg(trim(id), ', ') AS ids FROM public.usuarios GROUP BY lower(pg_temp.aparar(email)) HAVING count(*) > 1) x;
  IF problema IS NOT NULL THEN
    RAISE EXCEPTION 'Contas com o mesmo e-mail sem caixa, nada foi gravado (decidir qual fica; ids): %', problema;
  END IF;
END $$;

\echo '== 2. e-mails que mudam (so caixa ou espaco)'
SELECT count(*) AS emails FROM public.usuarios WHERE email <> lower(pg_temp.aparar(email));

UPDATE public.usuarios SET email = lower(pg_temp.aparar(email)), updated_at = now()
WHERE email <> lower(pg_temp.aparar(email));

\echo '== 3. indice unico sem caixa'
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_lower_unique ON public.usuarios (lower(email));

\echo '== depois'
SELECT
  (SELECT count(*) FROM public.usuarios WHERE telefone IS NOT NULL AND telefone !~ '^\+[1-9][0-9]{7,14}$') AS telefones_fora_do_padrao,
  (SELECT count(*) FROM public.usuarios WHERE email <> lower(pg_temp.aparar(email))) AS emails_com_caixa;

\if :aplicar
COMMIT;
\echo 'Aplicado.'
\else
ROLLBACK;
\echo 'Previa: nada foi gravado. Para aplicar: psql -v aplicar=1 -f <este arquivo>'
\endif
