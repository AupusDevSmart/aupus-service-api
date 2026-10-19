-- Criticidade antiga A/B/C para a escala de 1 a 5 (SN-64, 2026-10-19)
--
-- Cadastro antigo ainda tem A/B/C, que o formulário não aceita (salvar dava
-- 400). Converte com a régua do cron (src/modules/tarefas/
-- prioridade-pela-criticidade.ts): A = 5, B = 3, C = 1. Impacto,
-- probabilidade e motivo ficam vazios: a avaliação não existia. O updated_at
-- muda (no segundo: a coluna é Timestamp(0) e arredondaria para o seguinte),
-- para a planilha exportada antes avisar "alterado depois da exportação".
--
-- SÓ NO SERVICE (decisão do usuário, 19/out/2026): roda com
-- sincronizacao.replicando = 'on', então não gera evento e o NexOn fica com o
-- A/B/C dele. O que chegar de lá com A/B/C é convertido na chegada
-- (src/core/modules/sincronizacao/transformacoes.ts, antesDeGravar). Se algum
-- evento dos convertidos entrar na fila, o script desfaz tudo.
--
-- PRÉVIA POR PADRÃO: mostra o que muda e desfaz (ROLLBACK). Grava só com
-- -v aplicar=1 (ou on/true); aplicar=0/off é prévia, valor que não é
-- booleano para o script sem gravar.
--
--   psql -f 2026-10-19-criticidade-antiga.sql               (prévia)
--   psql -v aplicar=1 -f 2026-10-19-criticidade-antiga.sql  (grava)
--
-- DEPOIS do restart da API nova: antes dele, quem recebe do NexOn é a API
-- velha, sem a conversão na chegada, e um equipamento editado lá nessa janela
-- voltaria a A/B/C. Idempotente: rodar de novo só converte o que voltou.
-- Valor que não é A/B/C nem 1 a 5 não é convertido: aparece em "fica como
-- está" para decidir à parte.

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
-- Sem evento para o NexOn (ver acima)
SET LOCAL sincronizacao.replicando = 'on';

CREATE TEMP TABLE convertidos ON COMMIT DROP AS
SELECT id, nome, classificacao, criticidade AS antes,
       CASE upper(trim(criticidade)) WHEN 'A' THEN '5' WHEN 'B' THEN '3' ELSE '1' END AS depois,
       deleted_at IS NOT NULL AS excluido
  FROM public.equipamentos
 WHERE upper(trim(criticidade)) IN ('A', 'B', 'C');

\echo 'O que muda (guarde esta lista: é o que permite desfazer à mão):'
SELECT trim(id) AS id, nome, classificacao, antes, depois, excluido FROM convertidos ORDER BY classificacao, nome;

-- Para conferir no fim que nenhum evento dos convertidos entrou na fila
SELECT coalesce(max(id), 0) AS outbox_antes FROM public.sincronizacao_outbox \gset

UPDATE public.equipamentos e
   SET criticidade = c.depois,
       updated_at = date_trunc('second', now())
  FROM convertidos c
 WHERE e.id = c.id;

\echo 'Fica como está (nem A/B/C nem 1 a 5):'
SELECT trim(id) AS id, nome, classificacao, criticidade
  FROM public.equipamentos
 WHERE criticidade IS NULL OR trim(criticidade) NOT IN ('1', '2', '3', '4', '5')
 ORDER BY classificacao, nome;

\echo 'Como fica (sem os excluídos):'
SELECT criticidade, count(*) AS equipamentos
  FROM public.equipamentos
 WHERE deleted_at IS NULL
 GROUP BY 1 ORDER BY 1;

-- Trava: nenhum evento dos convertidos pode ir para o NexOn
SELECT count(*) AS eventos_dos_convertidos, count(*) = 0 AS fila_limpa
  FROM public.sincronizacao_outbox o
 WHERE o.id > :outbox_antes AND o.recurso = 'equipamentos'
   AND trim(o.registro_id) IN (SELECT trim(id) FROM convertidos) \gset
\echo 'Eventos dos convertidos na fila:' :eventos_dos_convertidos

\if :fila_limpa
\if :aplicar
COMMIT;
\echo 'Gravado.'
\else
ROLLBACK;
\echo 'Prévia: nada foi gravado. Para gravar: psql -v aplicar=1 -f 2026-10-19-criticidade-antiga.sql'
\endif
\else
ROLLBACK;
\echo 'DESFEITO: a conversão gerou evento para o NexOn (o trigger não respeitou sincronizacao.replicando). Nada foi gravado.'
\endif
