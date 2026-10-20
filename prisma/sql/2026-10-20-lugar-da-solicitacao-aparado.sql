-- Ids do lugar da solicitação sem o espaço do fim (SN-77, 2026-10-20)
--
-- solicitacoes_servico.planta_id, unidade_id, equipamento_id e
-- proprietario_id são TEXT, e os ids de destino são Char(26). O id antigo, de
-- 25 caracteres, chegava da tela com o espaço do Char e era gravado assim. Em
-- SQL, texto com espaço não casa com o char (que perde o dele): a busca pelo
-- nome da planta ou da instalação (SN-77) e o escopo por planta (planta_id IN
-- escopo) deixavam essa solicitação de fora, sem erro. Desde o SN-77 a API
-- apara ao gravar (comOLugarAparado); isto corrige o que já estava gravado.
--
-- Não está na sincronização com o NexOn (não gera evento).
--
-- PRÉVIA POR PADRÃO: mostra o que muda e desfaz (ROLLBACK). Grava só com
-- -v aplicar=1 (ou on/true).
--
--   psql -f 2026-10-20-lugar-da-solicitacao-aparado.sql               (prévia)
--   psql -v aplicar=1 -f 2026-10-20-lugar-da-solicitacao-aparado.sql  (grava)
--
-- Depois do restart da API nova (a velha voltaria a gravar com espaço).
-- Idempotente. Só tira espaço do fim e do começo: o valor continua o mesmo id.

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
END $$;

SET LOCAL lock_timeout = '5s';

\echo 'O que muda (os campos com espaço, por solicitação):'
SELECT trim(id) AS id, numero,
       planta_id <> btrim(planta_id) AS planta,
       unidade_id <> btrim(unidade_id) AS unidade,
       equipamento_id <> btrim(equipamento_id) AS equipamento,
       proprietario_id <> btrim(proprietario_id) AS proprietario
  FROM public.solicitacoes_servico
 WHERE planta_id <> btrim(planta_id) OR unidade_id <> btrim(unidade_id)
    OR equipamento_id <> btrim(equipamento_id) OR proprietario_id <> btrim(proprietario_id)
 ORDER BY numero;

UPDATE public.solicitacoes_servico
   SET planta_id = btrim(planta_id),
       unidade_id = btrim(unidade_id),
       equipamento_id = btrim(equipamento_id),
       proprietario_id = btrim(proprietario_id)
 WHERE planta_id <> btrim(planta_id) OR unidade_id <> btrim(unidade_id)
    OR equipamento_id <> btrim(equipamento_id) OR proprietario_id <> btrim(proprietario_id);

\echo 'Ainda com espaço (tem de ser 0):'
SELECT count(*) AS restantes
  FROM public.solicitacoes_servico
 WHERE planta_id <> btrim(planta_id) OR unidade_id <> btrim(unidade_id)
    OR equipamento_id <> btrim(equipamento_id) OR proprietario_id <> btrim(proprietario_id);

\if :aplicar
COMMIT;
\echo 'Gravado.'
\else
ROLLBACK;
\echo 'Prévia: nada foi gravado. Para gravar: psql -v aplicar=1 -f 2026-10-20-lugar-da-solicitacao-aparado.sql'
\endif
