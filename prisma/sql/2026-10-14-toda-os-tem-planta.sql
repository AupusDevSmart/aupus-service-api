-- Toda anomalia, programação e OS tem planta (SN-35, 2026-10-14)
--
-- É pela planta que o técnico de campo e o cliente enxergam o trabalho: o que
-- ficou sem planta era invisível para quem ia executar. A API passou a gravar a
-- planta sempre (anomalia: a do equipamento; programação: a da origem) e a
-- recusar programação sem planta. Este script acerta o que já está gravado:
--
--   1. anomalia sem planta e com equipamento: recebe a planta do equipamento
--      (componente UAR, que não tem unidade: a do UC pai);
--   2. programação sem planta: recebe a da anomalia, da solicitação, do
--      equipamento ou das tarefas (só se forem todas da mesma planta);
--   3. OS sem planta: recebe a da programação;
--   4. o que continua sem planta não tem de onde tirar (a manual antiga, a de
--      teste sem equipamento) e é APAGADO: OS (com checklist, histórico, anexos
--      etc. em cascata), programações, reservas delas e anomalias sem planta e
--      sem equipamento. Decisão do usuário: "isso nem deveria existir".
--
-- Para no meio (nada gravado) se alguma coisa a apagar estiver em uso: OS em
-- execução, solicitação apontando para ela, ou anomalia que vai continuar e
-- ficaria presa em PROGRAMADA.
--
-- Prévia (padrão, desfaz tudo no fim):  psql -f 2026-10-14-toda-os-tem-planta.sql
-- Aplicar:                               psql -v aplicar=1 -f 2026-10-14-toda-os-tem-planta.sql
-- Idempotente: rodar de novo não acha mais nada.

\set ON_ERROR_STOP on
BEGIN;

-- Planta efetiva de cada equipamento: a dele, a da unidade, ou a da unidade do UC pai
CREATE TEMP TABLE planta_do_equipamento ON COMMIT DROP AS
SELECT trim(e.id) AS equipamento_id, trim(COALESCE(e.planta_id, u.planta_id, up.planta_id)) AS planta_id
FROM equipamentos e
LEFT JOIN unidades u ON trim(u.id) = trim(e.unidade_id)
LEFT JOIN equipamentos pai ON trim(pai.id) = trim(e.equipamento_pai_id)
LEFT JOIN unidades up ON trim(up.id) = trim(pai.unidade_id)
WHERE COALESCE(e.planta_id, u.planta_id, up.planta_id) IS NOT NULL;

\echo '== 1. anomalias que recebem a planta do equipamento'
UPDATE anomalias a SET planta_id = pe.planta_id
FROM planta_do_equipamento pe
WHERE pe.equipamento_id = trim(a.equipamento_id) AND COALESCE(trim(a.planta_id), '') = ''
RETURNING trim(a.id) AS anomalia, a.numero, pe.planta_id;

\echo '== 2. programacoes que recebem a planta da origem'
UPDATE programacoes_os p SET planta_id = trim(a.planta_id)
FROM anomalias a
WHERE trim(a.id) = trim(p.anomalia_id) AND COALESCE(trim(a.planta_id), '') <> '' AND COALESCE(trim(p.planta_id), '') = ''
RETURNING p.codigo, 'anomalia' AS de, trim(p.planta_id) AS planta;

UPDATE programacoes_os p SET planta_id = trim(s.planta_id)
FROM solicitacoes_servico s
WHERE trim(s.id) = COALESCE(NULLIF(trim(p.solicitacao_servico_id), ''), trim(p.dados_origem->>'solicitacaoServicoId'))
  AND COALESCE(trim(s.planta_id), '') <> '' AND COALESCE(trim(p.planta_id), '') = ''
RETURNING p.codigo, 'solicitacao' AS de, trim(p.planta_id) AS planta;

UPDATE programacoes_os p SET planta_id = pe.planta_id
FROM planta_do_equipamento pe
WHERE pe.equipamento_id = trim(p.equipamento_id) AND COALESCE(trim(p.planta_id), '') = ''
RETURNING p.codigo, 'equipamento' AS de, trim(p.planta_id) AS planta;

UPDATE programacoes_os p SET planta_id = x.planta_id
FROM (
  SELECT trim(t.programacao_id) AS programacao_id, min(pe.planta_id) AS planta_id
  FROM tarefas_programacao_os t JOIN planta_do_equipamento pe ON pe.equipamento_id = trim(t.equipamento_id)
  GROUP BY 1 HAVING count(DISTINCT pe.planta_id) = 1
) x
WHERE x.programacao_id = trim(p.id) AND COALESCE(trim(p.planta_id), '') = ''
RETURNING p.codigo, 'tarefas' AS de, trim(p.planta_id) AS planta;

\echo '== 3. OS que recebem a planta da programacao'
UPDATE ordens_servico o SET planta_id = trim(p.planta_id)
FROM programacoes_os p
WHERE trim(p.id) = trim(o.programacao_id) AND COALESCE(trim(p.planta_id), '') <> '' AND COALESCE(trim(o.planta_id), '') = ''
RETURNING o.numero_os, trim(o.planta_id) AS planta;

-- 4. O que não tem de onde tirar a planta
CREATE TEMP TABLE prog_apagar ON COMMIT DROP AS
SELECT trim(id) AS id, codigo, origem, status, trim(anomalia_id) AS anomalia_id, trim(reserva_id) AS reserva_id
FROM programacoes_os WHERE COALESCE(trim(planta_id), '') = '';

CREATE TEMP TABLE os_apagar ON COMMIT DROP AS
SELECT trim(id) AS id, numero_os, status, trim(reserva_id) AS reserva_id
FROM ordens_servico
WHERE COALESCE(trim(planta_id), '') = '' OR trim(programacao_id) IN (SELECT id FROM prog_apagar);

CREATE TEMP TABLE anomalia_apagar ON COMMIT DROP AS
SELECT trim(id) AS id, numero, status
FROM anomalias WHERE COALESCE(trim(planta_id), '') = '' AND COALESCE(trim(equipamento_id), '') = '';

\echo '== 4. a apagar: programacoes'
SELECT codigo, origem, status FROM prog_apagar ORDER BY codigo;
\echo '== 4. a apagar: OS'
SELECT numero_os, status, (SELECT count(*) FROM anexos_os x WHERE trim(x.os_id) = o.id) AS anexos FROM os_apagar o ORDER BY numero_os;
\echo '== 4. a apagar: anomalias sem planta e sem equipamento'
SELECT id, numero, status FROM anomalia_apagar ORDER BY id;
\echo '== 4. continuam sem planta (equipamento sem planta: conferir a mao)'
SELECT trim(id) AS anomalia, numero, trim(equipamento_id) AS equipamento FROM anomalias
WHERE COALESCE(trim(planta_id), '') = '' AND COALESCE(trim(equipamento_id), '') <> '';

DO $$
DECLARE
  problema text;
BEGIN
  SELECT string_agg(numero_os || ' (' || status || ')', ', ') INTO problema
  FROM os_apagar WHERE status IN ('EM_EXECUCAO', 'PAUSADA');
  IF problema IS NOT NULL THEN
    RAISE EXCEPTION 'OS sem planta em execucao, nada foi apagado: %', problema;
  END IF;

  SELECT string_agg(trim(s.id), ', ') INTO problema
  FROM solicitacoes_servico s
  WHERE trim(s.programacao_os_id) IN (SELECT id FROM prog_apagar)
     OR trim(s.os_id) IN (SELECT id FROM os_apagar)
     OR trim(s.ordem_servico_id) IN (SELECT id FROM os_apagar);
  IF problema IS NOT NULL THEN
    RAISE EXCEPTION 'Solicitacoes apontam para o que seria apagado, nada foi apagado: %', problema;
  END IF;

  SELECT string_agg(trim(a.id), ', ') INTO problema
  FROM anomalias a
  WHERE trim(a.id) NOT IN (SELECT id FROM anomalia_apagar)
    AND (trim(a.id) IN (SELECT anomalia_id FROM prog_apagar WHERE anomalia_id IS NOT NULL)
         OR trim(a.ordem_servico_id) IN (SELECT id FROM os_apagar));
  IF problema IS NOT NULL THEN
    RAISE EXCEPTION 'Anomalias que continuam apontam para o que seria apagado, nada foi apagado: %', problema;
  END IF;
END $$;

-- OS e programação apagam os filhos em cascata (checklist, tarefas, histórico,
-- anexos, materiais, técnicos...). A reserva vai por último: a OS e a
-- programação apontam para ela.
DELETE FROM ordens_servico WHERE trim(id) IN (SELECT id FROM os_apagar);
DELETE FROM programacoes_os WHERE trim(id) IN (SELECT id FROM prog_apagar);
DELETE FROM reservas_veiculos
WHERE trim(solicitante_id) IN (SELECT id FROM prog_apagar UNION SELECT id FROM os_apagar)
   OR trim(id) IN (SELECT reserva_id FROM prog_apagar WHERE reserva_id IS NOT NULL
                   UNION SELECT reserva_id FROM os_apagar WHERE reserva_id IS NOT NULL);
DELETE FROM anomalias WHERE trim(id) IN (SELECT id FROM anomalia_apagar);

\echo '== depois: sem planta (programacoes, OS, anomalias)'
SELECT
  (SELECT count(*) FROM programacoes_os WHERE COALESCE(trim(planta_id), '') = '') AS programacoes,
  (SELECT count(*) FROM ordens_servico WHERE COALESCE(trim(planta_id), '') = '') AS os,
  (SELECT count(*) FROM anomalias WHERE COALESCE(trim(planta_id), '') = '') AS anomalias;

\if :{?aplicar}
COMMIT;
\echo 'Aplicado.'
\else
ROLLBACK;
\echo 'Previa: nada foi gravado. Para aplicar: psql -v aplicar=1 -f <este arquivo>'
\endif
