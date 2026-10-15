-- Toda anomalia, programação e OS tem planta (SN-35, 2026-10-14)
--
-- É pela planta que o técnico de campo e o cliente enxergam o trabalho: o que
-- ficou sem planta era invisível para quem ia executar. A API passou a gravar a
-- planta sempre (anomalia: a do equipamento; programação: a da origem) e a
-- recusar programação sem planta. Este script acerta o que já está gravado.
--
--   1. DÁ A PLANTA a quem tem de onde tirar, por todos os caminhos conhecidos:
--      anomalia pelo equipamento; OS pelo equipamento e pelas tarefas; programação
--      pela anomalia, pela solicitação (nos dois sentidos do vínculo), pelo
--      equipamento, pelo plano, pelas tarefas (congeladas e vivas) e pela OS que
--      ela gerou; OS pela programação; anomalia pela programação/OS que a atende.
--      Componente (UAR) sem unidade: a da unidade do UC pai.
--   2. APAGA o que continua sem planta (decisão do usuário: "isso nem deveria
--      existir"), em três níveis:
--      - sem pedir nada: programação sem planta e a OS dela que não começou
--        (PENDENTE/CANCELADA, sem anexo, sem tempo registrado), e as reservas;
--      - só com -v apagar_executadas=1: OS que já foi executada (EXECUTADA,
--        AUDITADA, FINALIZADA), ou que tem anexo, tempo registrado ou tarefa
--        concluída. É registro de trabalho feito: o cron usa a tarefa concluída
--        para não gerar de novo a preventiva;
--      - só com -v apagar_anomalias=1: anomalia sem planta e sem equipamento (pode
--        ser relato real, descrito só no texto).
--      Sem a opção, o script PARA (nada gravado) e lista o que exigiria.
--
-- Para no meio (nada gravado) também se algo a apagar estiver em uso: OS em
-- execução, solicitação apontando para o que sai, anomalia que fica e perderia a
-- programação/OS, programação que fica apontando para anomalia que sai, ou
-- programação de tarefas de mais de uma planta (precisa de decisão manual).
--
-- Prévia (padrão, desfaz tudo no fim):  psql -f 2026-10-14-toda-os-tem-planta.sql
-- Aplicar:                               psql -v aplicar=1 -f 2026-10-14-toda-os-tem-planta.sql
-- Idempotente: rodar de novo não acha mais nada. Os arquivos dos anexos apagados
-- ficam no disco: a prévia lista os caminhos para limpar depois.

\set ON_ERROR_STOP on
\if :{?aplicar}
\else
\set aplicar false
\endif
\if :{?apagar_executadas}
\else
\set apagar_executadas false
\endif
\if :{?apagar_anomalias}
\else
\set apagar_anomalias false
\endif

BEGIN;

-- As opções vão para uma tabela: dentro do DO $$ $$ o psql não substitui variáveis
CREATE TEMP TABLE opcoes ON COMMIT DROP AS
SELECT :'apagar_executadas'::boolean AS apagar_executadas, :'apagar_anomalias'::boolean AS apagar_anomalias;

-- Planta efetiva de cada equipamento: a dele, a da unidade, ou a da unidade do UC pai
CREATE TEMP TABLE planta_do_equipamento ON COMMIT DROP AS
SELECT trim(e.id) AS equipamento_id,
       COALESCE(NULLIF(trim(e.planta_id), ''), NULLIF(trim(u.planta_id), ''), NULLIF(trim(up.planta_id), '')) AS planta_id
FROM equipamentos e
LEFT JOIN unidades u ON trim(u.id) = trim(e.unidade_id)
LEFT JOIN equipamentos pai ON trim(pai.id) = trim(e.equipamento_pai_id)
LEFT JOIN unidades up ON trim(up.id) = trim(pai.unidade_id)
WHERE COALESCE(NULLIF(trim(e.planta_id), ''), NULLIF(trim(u.planta_id), ''), NULLIF(trim(up.planta_id), '')) IS NOT NULL;

\echo '== 1a. anomalias que recebem a planta do equipamento'
UPDATE anomalias a SET planta_id = pe.planta_id
FROM planta_do_equipamento pe
WHERE pe.equipamento_id = trim(a.equipamento_id) AND COALESCE(trim(a.planta_id), '') = ''
RETURNING trim(a.id) AS anomalia, a.numero, pe.planta_id;

\echo '== 1b. OS que recebem a planta do equipamento ou das tarefas (todas da mesma planta)'
UPDATE ordens_servico o SET planta_id = pe.planta_id
FROM planta_do_equipamento pe
WHERE pe.equipamento_id = trim(o.equipamento_id) AND COALESCE(trim(o.planta_id), '') = ''
RETURNING o.numero_os, 'equipamento' AS de, trim(o.planta_id) AS planta;

UPDATE ordens_servico o SET planta_id = x.planta_id
FROM (
  SELECT trim(t.os_id) AS os_id, min(pe.planta_id) AS planta_id
  FROM tarefas_os t JOIN planta_do_equipamento pe ON pe.equipamento_id = trim(t.equipamento_id)
  GROUP BY 1 HAVING count(DISTINCT pe.planta_id) = 1
) x
WHERE x.os_id = trim(o.id) AND COALESCE(trim(o.planta_id), '') = ''
RETURNING o.numero_os, 'tarefas' AS de, trim(o.planta_id) AS planta;

\echo '== 1c. programacoes que recebem a planta da origem'
UPDATE programacoes_os p SET planta_id = trim(a.planta_id)
FROM anomalias a
WHERE trim(a.id) = trim(p.anomalia_id) AND COALESCE(trim(a.planta_id), '') <> '' AND COALESCE(trim(p.planta_id), '') = ''
RETURNING p.codigo, 'anomalia' AS de, trim(p.planta_id) AS planta;

UPDATE programacoes_os p SET planta_id = trim(s.planta_id)
FROM solicitacoes_servico s
WHERE (trim(s.id) = COALESCE(NULLIF(trim(p.solicitacao_servico_id), ''), trim(p.dados_origem->>'solicitacaoServicoId'))
       OR trim(s.programacao_os_id) = trim(p.id))
  AND COALESCE(trim(s.planta_id), '') <> '' AND COALESCE(trim(p.planta_id), '') = ''
RETURNING p.codigo, 'solicitacao' AS de, trim(p.planta_id) AS planta;

UPDATE programacoes_os p SET planta_id = pe.planta_id
FROM planta_do_equipamento pe
WHERE pe.equipamento_id = trim(p.equipamento_id) AND COALESCE(trim(p.planta_id), '') = ''
RETURNING p.codigo, 'equipamento' AS de, trim(p.planta_id) AS planta;

UPDATE programacoes_os p SET planta_id = pe.planta_id
FROM planos_manutencao pm JOIN planta_do_equipamento pe ON pe.equipamento_id = trim(pm.equipamento_id)
WHERE trim(pm.id) = trim(p.plano_manutencao_id) AND COALESCE(trim(p.planta_id), '') = ''
RETURNING p.codigo, 'plano' AS de, trim(p.planta_id) AS planta;

-- Tarefas: o equipamento congelado no vínculo ou, sem ele, o da tarefa viva (ou a planta dela)
UPDATE programacoes_os p SET planta_id = x.planta_id
FROM (
  SELECT trim(tp.programacao_id) AS programacao_id, min(x2.planta_id) AS planta_id
  FROM tarefas_programacao_os tp
  LEFT JOIN tarefas t ON trim(t.id) = trim(tp.tarefa_id)
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      (SELECT pe.planta_id FROM planta_do_equipamento pe WHERE pe.equipamento_id = trim(tp.equipamento_id)),
      (SELECT pe.planta_id FROM planta_do_equipamento pe WHERE pe.equipamento_id = trim(t.equipamento_id)),
      NULLIF(trim(t.planta_id), '')
    ) AS planta_id
  ) x2
  WHERE x2.planta_id IS NOT NULL
  GROUP BY 1 HAVING count(DISTINCT x2.planta_id) = 1
) x
WHERE x.programacao_id = trim(p.id) AND COALESCE(trim(p.planta_id), '') = ''
RETURNING p.codigo, 'tarefas' AS de, trim(p.planta_id) AS planta;

UPDATE programacoes_os p SET planta_id = trim(o.planta_id)
FROM ordens_servico o
WHERE trim(o.programacao_id) = trim(p.id) AND COALESCE(trim(o.planta_id), '') <> '' AND COALESCE(trim(p.planta_id), '') = ''
RETURNING p.codigo, 'a OS dela' AS de, trim(p.planta_id) AS planta;

\echo '== 1d. OS que recebem a planta da programacao'
UPDATE ordens_servico o SET planta_id = trim(p.planta_id)
FROM programacoes_os p
WHERE trim(p.id) = trim(o.programacao_id) AND COALESCE(trim(p.planta_id), '') <> '' AND COALESCE(trim(o.planta_id), '') = ''
RETURNING o.numero_os, trim(o.planta_id) AS planta;

\echo '== 1e. anomalias que recebem a planta da programacao ou da OS que as atende'
UPDATE anomalias a SET planta_id = x.planta_id
FROM (
  SELECT trim(anomalia_id) AS anomalia_id, min(trim(planta_id)) AS planta_id
  FROM (SELECT anomalia_id, planta_id FROM programacoes_os UNION ALL SELECT anomalia_id, planta_id FROM ordens_servico) v
  WHERE COALESCE(trim(anomalia_id), '') <> '' AND COALESCE(trim(planta_id), '') <> ''
  GROUP BY 1 HAVING count(DISTINCT trim(planta_id)) = 1
) x
WHERE x.anomalia_id = trim(a.id) AND COALESCE(trim(a.planta_id), '') = ''
RETURNING trim(a.id) AS anomalia, a.numero, x.planta_id;

-- 2. O que não tem de onde tirar a planta
CREATE TEMP TABLE prog_apagar ON COMMIT DROP AS
SELECT trim(id) AS id, codigo, origem, status, trim(anomalia_id) AS anomalia_id, trim(reserva_id) AS reserva_id
FROM programacoes_os WHERE COALESCE(trim(planta_id), '') = '';

CREATE TEMP TABLE os_apagar ON COMMIT DROP AS
SELECT trim(o.id) AS id, o.numero_os, o.status, trim(o.reserva_id) AS reserva_id, trim(o.anomalia_id) AS anomalia_id,
       (SELECT count(*) FROM anexos_os x WHERE trim(x.os_id) = trim(o.id)) AS anexos,
       (SELECT count(*) FROM registros_tempo_os x WHERE trim(x.os_id) = trim(o.id)) AS tempos,
       (SELECT count(*) FROM tarefas_os x WHERE trim(x.os_id) = trim(o.id) AND x.status = 'CONCLUIDA') AS concluidas
FROM ordens_servico o
WHERE COALESCE(trim(o.planta_id), '') = '' OR trim(o.programacao_id) IN (SELECT id FROM prog_apagar);

CREATE TEMP TABLE anomalia_apagar ON COMMIT DROP AS
SELECT trim(id) AS id, numero, status, left(descricao, 60) AS descricao
FROM anomalias WHERE COALESCE(trim(planta_id), '') = '' AND COALESCE(trim(equipamento_id), '') = '';

\echo '== 2. a apagar: programacoes (origem, status)'
SELECT origem, status, count(*), string_agg(codigo, ', ' ORDER BY codigo) AS codigos FROM prog_apagar GROUP BY 1, 2 ORDER BY 1, 2;
\echo '== 2. a apagar: OS (as com anexo, tempo ou tarefa concluida, ou ja executadas, exigem -v apagar_executadas=1)'
SELECT numero_os, status, anexos, tempos, concluidas FROM os_apagar ORDER BY numero_os;
\echo '== 2. a apagar: anomalias sem planta e sem equipamento (exigem -v apagar_anomalias=1)'
SELECT id, numero, status, descricao FROM anomalia_apagar ORDER BY id;
\echo '== 2. arquivos em disco dos anexos que saem (apagar a mao depois do COMMIT)'
SELECT 'os' AS de, caminho_s3 FROM anexos_os WHERE trim(os_id) IN (SELECT id FROM os_apagar)
UNION ALL
SELECT 'anomalia', caminho_s3 FROM anexos_anomalias WHERE trim(anomalia_id) IN (SELECT id FROM anomalia_apagar);
\echo '== 2. continuam sem planta (anomalia com equipamento sem planta: conferir a mao)'
SELECT trim(id) AS anomalia, numero, trim(equipamento_id) AS equipamento FROM anomalias
WHERE COALESCE(trim(planta_id), '') = '' AND COALESCE(trim(equipamento_id), '') <> '';
\echo '== informativo: programacoes PENDENTES cuja planta gravada difere da planta da anomalia (editar vai pedir conferencia)'
SELECT p.codigo, trim(p.planta_id) AS gravada, trim(a.planta_id) AS da_anomalia
FROM programacoes_os p JOIN anomalias a ON trim(a.id) = trim(p.anomalia_id)
WHERE p.status = 'PENDENTE' AND COALESCE(trim(a.planta_id), '') <> '' AND trim(p.planta_id) <> trim(a.planta_id);

DO $$
DECLARE
  problema text;
  op record;
BEGIN
  SELECT * INTO op FROM opcoes;

  SELECT string_agg(numero_os || ' (' || status || ')', ', ') INTO problema
  FROM os_apagar WHERE status IN ('EM_EXECUCAO', 'PAUSADA');
  IF problema IS NOT NULL THEN
    RAISE EXCEPTION 'OS sem planta em execucao, nada foi apagado: %', problema;
  END IF;

  IF NOT op.apagar_executadas THEN
    SELECT string_agg(numero_os || ' (' || status || ')', ', ') INTO problema
    FROM os_apagar
    WHERE status IN ('EXECUTADA', 'AUDITADA', 'FINALIZADA') OR anexos > 0 OR tempos > 0 OR concluidas > 0;
    IF problema IS NOT NULL THEN
      RAISE EXCEPTION 'OS sem planta com trabalho registrado, nada foi apagado (para apagar mesmo assim: -v apagar_executadas=1): %', problema;
    END IF;
  END IF;

  IF NOT op.apagar_anomalias THEN
    SELECT string_agg(id || ' (' || status || ')', ', ') INTO problema FROM anomalia_apagar;
    IF problema IS NOT NULL THEN
      RAISE EXCEPTION 'Anomalias sem planta e sem equipamento, nada foi apagado (para apagar mesmo assim: -v apagar_anomalias=1): %', problema;
    END IF;
  END IF;

  SELECT string_agg(p.codigo, ', ') INTO problema
  FROM prog_apagar p
  WHERE (SELECT count(DISTINCT x.planta_id) FROM (
           SELECT COALESCE(
             (SELECT pe.planta_id FROM planta_do_equipamento pe WHERE pe.equipamento_id = trim(tp.equipamento_id)),
             (SELECT pe.planta_id FROM planta_do_equipamento pe WHERE pe.equipamento_id = trim(t.equipamento_id)),
             NULLIF(trim(t.planta_id), '')) AS planta_id
           FROM tarefas_programacao_os tp LEFT JOIN tarefas t ON trim(t.id) = trim(tp.tarefa_id)
           WHERE trim(tp.programacao_id) = p.id) x
         WHERE x.planta_id IS NOT NULL) > 1;
  IF problema IS NOT NULL THEN
    RAISE EXCEPTION 'Programacoes com tarefas de mais de uma planta (decidir a planta a mao), nada foi apagado: %', problema;
  END IF;

  SELECT string_agg(trim(s.id), ', ') INTO problema
  FROM solicitacoes_servico s
  WHERE trim(s.programacao_os_id) IN (SELECT id FROM prog_apagar)
     OR trim(s.os_id) IN (SELECT id FROM os_apagar)
     OR trim(s.ordem_servico_id) IN (SELECT id FROM os_apagar);
  IF problema IS NOT NULL THEN
    RAISE EXCEPTION 'Solicitacoes apontam para o que seria apagado, nada foi apagado: %', problema;
  END IF;

  -- Anomalia que fica e perderia a programação/OS (ficaria presa em PROGRAMADA)
  SELECT string_agg(trim(a.id), ', ') INTO problema
  FROM anomalias a
  WHERE trim(a.id) NOT IN (SELECT id FROM anomalia_apagar)
    AND (trim(a.id) IN (SELECT anomalia_id FROM prog_apagar WHERE anomalia_id IS NOT NULL)
         OR trim(a.id) IN (SELECT anomalia_id FROM os_apagar WHERE anomalia_id IS NOT NULL)
         OR trim(a.ordem_servico_id) IN (SELECT id FROM os_apagar));
  IF problema IS NOT NULL THEN
    RAISE EXCEPTION 'Anomalias que continuam apontam para o que seria apagado, nada foi apagado: %', problema;
  END IF;

  -- Programação/OS que fica e perderia a anomalia de origem
  SELECT string_agg(v.id, ', ') INTO problema
  FROM (SELECT trim(id) AS id, trim(anomalia_id) AS anomalia_id FROM programacoes_os WHERE trim(id) NOT IN (SELECT id FROM prog_apagar)
        UNION ALL
        SELECT trim(id), trim(anomalia_id) FROM ordens_servico WHERE trim(id) NOT IN (SELECT id FROM os_apagar)) v
  WHERE v.anomalia_id IN (SELECT id FROM anomalia_apagar);
  IF problema IS NOT NULL THEN
    RAISE EXCEPTION 'Programacoes/OS que continuam apontam para anomalia que seria apagada, nada foi apagado: %', problema;
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

\if :aplicar
COMMIT;
\echo 'Aplicado.'
\else
ROLLBACK;
\echo 'Previa: nada foi gravado. Para aplicar: psql -v aplicar=1 -f <este arquivo>'
\endif
