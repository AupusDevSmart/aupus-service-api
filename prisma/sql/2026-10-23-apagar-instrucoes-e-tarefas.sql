-- Apaga TODAS as instruções e TODAS as tarefas (23/out/2026)
--
-- Decisão do usuário (23/out/2026): as instruções de produção vão ser trocadas
-- pelas da importação nova, e as tarefas dos planos vão junto. Apagar de vez, e
-- não só marcar: a instrução marcada como excluída continua lida pelo gerador
-- das 3h, pelo checklist da OS e pela proposta, e o código dela fica reservado
-- (a importação nova com os mesmos códigos daria conflito).
--
-- O que vai junto, pelas FKs (ON DELETE CASCADE): os passos (sub_instrucoes), os
-- recursos e maquinários da instrução, os anexos (só as linhas: os arquivos em
-- uploads/instrucoes/anexos ficam no disco), os vínculos com anomalias e
-- solicitações, e o vínculo de tarefa com solicitação.
--
-- O que NÃO muda: a OS e a programação guardam uma cópia do que foi pedido
-- (nome, código e descrição da instrução, valor, checklist já gerado). As linhas
-- delas perdem só o ponteiro (tarefa_id e instrucao_id viram nulos, ON DELETE SET
-- NULL). A OS finalizada, o PDF e o código de verificação ficam como estão. Os
-- planos ficam, vazios, para a importação de planos preencher.
--
-- O que a prévia lista para decidir antes: as programações abertas e as OS
-- ainda não iniciadas que vinham dessas tarefas ou instruções. A OS que começar
-- depois disto nasce sem checklist (ele é gerado ao iniciar, a partir da
-- instrução). Cancelar pela tela as que não devem seguir: o cancelamento da tela
-- faz o histórico, a reserva de viatura e a âncora do ciclo.
--
-- Fora da sincronização com o NexOn (instruções e tarefas não têm gatilho).
--
-- PRÉVIA POR PADRÃO (mostra e desfaz). Grava com -v aplicar=1.
--
--   psql -f 2026-10-23-apagar-instrucoes-e-tarefas.sql               (prévia)
--   psql -v aplicar=1 -f 2026-10-23-apagar-instrucoes-e-tarefas.sql  (grava)

\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';

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

-- As tabelas ficam travadas até o fim; esperando a trava, seguraria as consultas: 2 s e rodar de novo se falhar
SET LOCAL lock_timeout = '2s';

\echo ''
\echo '== O que existe hoje'
SELECT 'instrucoes' AS tabela, count(*) AS total, count(*) FILTER (WHERE deleted_at IS NULL) AS vivas FROM public.instrucoes
UNION ALL SELECT 'tarefas', count(*), count(*) FILTER (WHERE deleted_at IS NULL) FROM public.tarefas;

\echo ''
\echo '== Tarefas por onde estão'
SELECT CASE
         WHEN t.plano_manutencao_id IS NULL THEN 'sem plano'
         WHEN p.plano_origem_id IS NULL AND p.equipamento_id IS NULL THEN 'template'
         ELSE 'cópia (equipamento)'
       END AS onde,
       count(*) AS tarefas
  FROM public.tarefas t
  LEFT JOIN public.planos_manutencao p ON p.id = t.plano_manutencao_id
 GROUP BY 1 ORDER BY 1;

\echo ''
\echo '== O que vai junto (CASCADE)'
SELECT 'sub_instrucoes (passos)' AS tabela, count(*) FROM public.sub_instrucoes
UNION ALL SELECT 'instrucao_recursos', count(*) FROM public.instrucao_recursos
UNION ALL SELECT 'instrucao_maquinarios', count(*) FROM public.instrucao_maquinarios
UNION ALL SELECT 'anexos_instrucao (o arquivo fica no disco)', count(*) FROM public.anexos_instrucao
UNION ALL SELECT 'anomalias_instrucoes', count(*) FROM public.anomalias_instrucoes
UNION ALL SELECT 'solicitacoes_instrucoes', count(*) FROM public.solicitacoes_instrucoes
UNION ALL SELECT 'tarefas_solicitacoes', count(*) FROM public.tarefas_solicitacoes;

\echo ''
\echo '== Programações abertas que vinham dessas tarefas ou instruções (decidir: seguem ou cancelar pela tela)'
SELECT trim(p.codigo) AS programacao, p.status, p.origem, count(*) AS linhas
  FROM public.programacoes_os p
  JOIN public.tarefas_programacao_os tp ON tp.programacao_id = p.id
 WHERE p.deletado_em IS NULL AND p.status IN ('PENDENTE', 'APROVADA')
   AND (tp.tarefa_id IS NOT NULL OR tp.instrucao_id IS NOT NULL)
 GROUP BY 1, 2, 3 ORDER BY 2, 1;

\echo ''
\echo '== OS ainda não iniciadas que vinham delas (começadas depois disto, nascem sem checklist)'
SELECT trim(o.numero_os) AS os, o.status, count(*) AS linhas
  FROM public.ordens_servico o
  JOIN public.tarefas_os t ON t.os_id = o.id
 WHERE o.deletado_em IS NULL AND o.status = 'PENDENTE'
   AND (t.tarefa_id IS NOT NULL OR t.instrucao_id IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM public.checklist_atividades_os c WHERE c.os_id = o.id)
 GROUP BY 1, 2 ORDER BY 1;

-- As cópias guardadas nas linhas da OS e da programação, para conferir depois que nada se perdeu
CREATE TEMP TABLE copias_antes ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.tarefas_programacao_os) AS linhas_programacao,
       (SELECT count(*) FROM public.tarefas_os) AS linhas_os,
       (SELECT count(*) FROM public.checklist_atividades_os) AS itens_checklist;

DELETE FROM public.tarefas;
DELETE FROM public.instrucoes;

\echo ''
\echo '== Conferência: instruções e tarefas (tem de ser 0 e 0)'
SELECT (SELECT count(*) FROM public.instrucoes) AS instrucoes, (SELECT count(*) FROM public.tarefas) AS tarefas;

\echo ''
\echo '== Conferência: as linhas da OS e da programação e o checklist continuam (antes = depois)'
SELECT a.linhas_programacao AS programacao_antes, (SELECT count(*) FROM public.tarefas_programacao_os) AS programacao_depois,
       a.linhas_os AS os_antes, (SELECT count(*) FROM public.tarefas_os) AS os_depois,
       a.itens_checklist AS checklist_antes, (SELECT count(*) FROM public.checklist_atividades_os) AS checklist_depois
  FROM copias_antes a;

\echo ''
\echo '== Planos que ficam vazios (a importação de planos preenche)'
SELECT CASE WHEN plano_origem_id IS NULL AND equipamento_id IS NULL THEN 'template' ELSE 'cópia (equipamento)' END AS plano,
       count(*) AS planos
  FROM public.planos_manutencao
 GROUP BY 1 ORDER BY 1;

\if :aplicar
COMMIT;
\echo 'Gravado.'
\else
ROLLBACK;
\echo 'Prévia: nada foi gravado. Para gravar: psql -v aplicar=1 -f 2026-10-23-apagar-instrucoes-e-tarefas.sql'
\endif
