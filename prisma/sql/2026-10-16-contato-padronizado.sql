-- Contato padronizado (SN-46, 2026-10-16)
--
-- Telefone em E.164 (+5562999998888) e e-mail sem caixa nos usuários. A API já
-- grava assim (DTO, sincronização); este script acerta o que está gravado:
--   1. telefone: converte o que é telefone (com ou sem máscara, com ou sem +55,
--      com o 0 da operadora) pela mesma regra de src/common/helpers/contato.ts;
--      o que não é telefone ("werwe", 4 dígitos, 8 dígitos sem DDD) vira NULL —
--      a prévia lista esses casos (só o formato, sem o número);
--   2. e-mail: aparado e em minúsculas. Conta EXCLUÍDA que colidiria libera o
--      e-mail (deleted_<id>_<email>, como o cadastro já faz ao reaproveitar).
--      PARA (nada gravado) se dois usuários ATIVOS ficariam com o mesmo e-mail —
--      decidir a mão qual conta fica;
--   3. índice único em lower(email): o banco deixa de aceitar Ana@ e ana@ como
--      duas contas. Não está no schema.prisma (o Prisma não modela índice por
--      expressão) — mais um motivo para nunca rodar prisma db push.
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

-- A mesma regra do telefoneE164 da API
CREATE FUNCTION pg_temp.telefone_e164(texto text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  limpo text := btrim(coalesce(texto, ''));
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
  IF nacional ~ '^[1-9][1-9]([0-9]{8}|9[0-9]{8})$' THEN RETURN '+55' || nacional; END IF;
  RETURN NULL;
END $$;

CREATE TEMP TABLE telefone_novo ON COMMIT DROP AS
SELECT id, telefone AS antes, pg_temp.telefone_e164(telefone) AS depois
FROM usuarios
WHERE telefone IS NOT NULL AND telefone IS DISTINCT FROM pg_temp.telefone_e164(telefone);

\echo '== 1. telefones: o que muda (formato do que estava -> resultado)'
SELECT regexp_replace(antes, '[0-9]', '9', 'g') AS formato_antes,
       CASE WHEN depois IS NULL THEN 'vira vazio (nao e telefone)' ELSE 'vira E.164' END AS resultado,
       count(*)
FROM telefone_novo GROUP BY 1, 2 ORDER BY 2, 3 DESC;

UPDATE usuarios u SET telefone = t.depois, updated_at = now()
FROM telefone_novo t WHERE t.id = u.id;

\echo '== 2. contas EXCLUIDAS com e-mail que se repetiria sem caixa: liberam o e-mail (como o cadastro ja faz ao reaproveitar)'
WITH repetidos AS (SELECT lower(btrim(email)) AS e FROM usuarios GROUP BY 1 HAVING count(*) > 1)
UPDATE usuarios u SET email = 'deleted_' || trim(u.id) || '_' || lower(btrim(u.email)), updated_at = now()
FROM repetidos r
WHERE lower(btrim(u.email)) = r.e AND u.deleted_at IS NOT NULL
RETURNING trim(u.id) AS conta, u.email AS email_liberado;

\echo '== 2. contas ATIVAS que ficariam com o mesmo e-mail sem caixa (se houver, o script para)'
SELECT lower(btrim(email)) AS email, count(*) AS contas, string_agg(trim(id), ', ') AS ids
FROM usuarios GROUP BY 1 HAVING count(*) > 1;

DO $$
DECLARE problema text;
BEGIN
  SELECT string_agg(e, ', ') INTO problema
  FROM (SELECT lower(btrim(email)) AS e FROM usuarios GROUP BY 1 HAVING count(*) > 1) x;
  IF problema IS NOT NULL THEN
    RAISE EXCEPTION 'E-mails repetidos sem caixa, nada foi gravado (decidir qual conta fica): %', problema;
  END IF;
END $$;

\echo '== 2. e-mails que mudam (so caixa ou espaco)'
SELECT count(*) AS emails FROM usuarios WHERE email <> lower(btrim(email));

UPDATE usuarios SET email = lower(btrim(email)), updated_at = now()
WHERE email <> lower(btrim(email));

\echo '== 3. indice unico sem caixa'
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_lower_unique ON usuarios (lower(email));

\echo '== depois'
SELECT
  (SELECT count(*) FROM usuarios WHERE telefone IS NOT NULL AND telefone !~ '^\+[1-9][0-9]{7,14}$') AS telefones_fora_do_padrao,
  (SELECT count(*) FROM usuarios WHERE email <> lower(btrim(email))) AS emails_com_caixa;

\if :aplicar
COMMIT;
\echo 'Aplicado.'
\else
ROLLBACK;
\echo 'Previa: nada foi gravado. Para aplicar: psql -v aplicar=1 -f <este arquivo>'
\endif
