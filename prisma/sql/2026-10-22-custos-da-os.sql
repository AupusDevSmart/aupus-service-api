-- O custo da OS por instrução e por natureza (SN-93, 2026-10-22)
--
-- Decisões do usuário (21/out/2026):
--   D1  cada instrução entra na OS com o valor do cadastro, congelado ao vincular,
--       e o planejador ajusta só naquela OS (como a proposta e o AupusProject):
--         valor           o valor da instrução nesta programação / OS
--         valor_original  o do cadastro no vínculo (para mostrar o ajuste)
--   D2  os outros custos (instrumento, maquinário, veículo, terceiro, despesa de
--       campo) entram no custo real, conferidos no Executar; o não previsto se lança
--       com descrição:
--         natureza        INSTRUMENTO, MAQUINARIO, VEICULO, TERCEIRO, DESPESA_CAMPO, OUTRO
--         valor_real      o que custou (nulo = não conferido; o custo usa o previsto)
--         nao_previsto    lançado no Executar, fora do orçamento (valor previsto 0)
--   e o equipamento de cada tarefa com o nome congelado (o PDF repetia "INV-03 ·
--   Termografia e reaperto" nove vezes sem dizer de qual inversor):
--         equipamento_nome
--
-- Acrescenta. A natureza dos itens que já existem sai do prefixo que a tela grava
-- ("Veículo: Picape 4x4"); o nome do equipamento das tarefas que já existem, do
-- cadastro de hoje (o nome da posição, como a tela mostra), só na execução que cria
-- a coluna. A única coisa que muda de lugar: os "custos adicionais" de antes (um
-- número sem descrição) da OS ainda não finalizada viram um não previsto com
-- descrição, que a tela corrige (o custo real não muda). O código de verificação
-- das OS finalizadas não muda: o conteúdo da versão 1 não lê estas colunas, e a
-- finalizada não é tocada. Não está na sincronização com o NexOn (as tabelas não
-- têm gatilho).
--
-- PRÉVIA POR PADRÃO (mostra e desfaz). Grava com -v aplicar=1. Idempotente.
--
-- Com a API PARADA (a mesma janela do 5p/5q): a API nova lê as colunas, e a antiga
-- copiaria o item da programação para a OS sem a natureza.
--
--   psql -f 2026-10-22-custos-da-os.sql               (prévia)
--   psql -v aplicar=1 -f 2026-10-22-custos-da-os.sql  (grava)

\set ON_ERROR_STOP on

-- O backfill compara texto com acento ('Veículo:', 'Maquinário:'): lido em CP850/WIN1252 (console do
-- Windows), os itens virariam OUTRO para sempre (a coluna vira NOT NULL e a nova execução não os acha)
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
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'tarefas_os' AND column_name = 'origem_item') THEN
    RAISE EXCEPTION 'Faltam as instruções na OS: aplique antes o 2026-10-21-instrucoes-na-os.sql (SN-86)';
  END IF;
END $$;

-- Esperando a trava, o ALTER seguraria todas as consultas das tabelas: 2 s e rodar de novo se falhar
SET LOCAL lock_timeout = '2s';

-- O nome do equipamento das tarefas que já existem só na execução que cria a coluna: rodado de novo
-- depois do deploy, preencheria a OS finalizada na versão 2 que gravou a linha sem nome, e o código
-- dela deixaria de conferir
SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'tarefas_os'
                      AND column_name = 'equipamento_nome') AS nomear_equipamentos \gset

\echo 'Tamanho das tabelas:'
SELECT (SELECT count(*) FROM public.tarefas_programacao_os) AS tarefas_programacao_os,
       (SELECT count(*) FROM public.tarefas_os) AS tarefas_os,
       (SELECT count(*) FROM public.itens_orcamento_programacao_os) AS itens_programacao,
       (SELECT count(*) FROM public.itens_orcamento_os) AS itens_os;

-- 1. O valor da instrução e o equipamento, congelados na linha
ALTER TABLE public.tarefas_programacao_os
  ADD COLUMN IF NOT EXISTS valor NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS valor_original NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS equipamento_nome VARCHAR(255);
ALTER TABLE public.tarefas_os
  ADD COLUMN IF NOT EXISTS valor NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS valor_original NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS equipamento_nome VARCHAR(255);

-- 2. Os outros custos com a natureza, o valor real e o não previsto
ALTER TABLE public.itens_orcamento_programacao_os
  ADD COLUMN IF NOT EXISTS natureza VARCHAR(20);
ALTER TABLE public.itens_orcamento_os
  ADD COLUMN IF NOT EXISTS natureza VARCHAR(20),
  ADD COLUMN IF NOT EXISTS valor_real NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS nao_previsto BOOLEAN NOT NULL DEFAULT false;

-- A natureza pelo prefixo que a tela grava (recursos-das-instrucoes.ts); o resto é OUTRO
CREATE TEMP TABLE prefixo_da_natureza (prefixo TEXT, natureza TEXT) ON COMMIT DROP;
INSERT INTO prefixo_da_natureza VALUES
  ('Instrumento:', 'INSTRUMENTO'),
  ('Maquinário:', 'MAQUINARIO'),
  ('Veículo:', 'VEICULO'),
  ('Terceiro:', 'TERCEIRO'),
  ('Despesa de campo:', 'DESPESA_CAMPO');

UPDATE public.itens_orcamento_programacao_os i
   SET natureza = COALESCE((SELECT p.natureza FROM prefixo_da_natureza p WHERE left(i.descricao, length(p.prefixo)) = p.prefixo), 'OUTRO')
 WHERE i.natureza IS NULL;
UPDATE public.itens_orcamento_os i
   SET natureza = COALESCE((SELECT p.natureza FROM prefixo_da_natureza p WHERE left(i.descricao, length(p.prefixo)) = p.prefixo), 'OUTRO')
 WHERE i.natureza IS NULL;

ALTER TABLE public.itens_orcamento_programacao_os
  ALTER COLUMN natureza SET DEFAULT 'OUTRO',
  ALTER COLUMN natureza SET NOT NULL;
ALTER TABLE public.itens_orcamento_os
  ALTER COLUMN natureza SET DEFAULT 'OUTRO',
  ALTER COLUMN natureza SET NOT NULL;

DO $$
DECLARE
  regra RECORD;
BEGIN
  FOR regra IN
    SELECT * FROM (VALUES
      ('itens_orcamento_programacao_os', 'itens_orcamento_programacao_os_natureza_valida',
       'CHECK (natureza IN (''INSTRUMENTO'', ''MAQUINARIO'', ''VEICULO'', ''TERCEIRO'', ''DESPESA_CAMPO'', ''OUTRO''))'),
      ('itens_orcamento_os', 'itens_orcamento_os_natureza_valida',
       'CHECK (natureza IN (''INSTRUMENTO'', ''MAQUINARIO'', ''VEICULO'', ''TERCEIRO'', ''DESPESA_CAMPO'', ''OUTRO''))'),
      ('itens_orcamento_os', 'itens_orcamento_os_valor_real_positivo', 'CHECK (valor_real IS NULL OR valor_real >= 0)'),
      ('tarefas_programacao_os', 'tarefas_programacao_os_valor_positivo',
       'CHECK ((valor IS NULL OR valor >= 0) AND (valor_original IS NULL OR valor_original >= 0))'),
      ('tarefas_os', 'tarefas_os_valor_positivo',
       'CHECK ((valor IS NULL OR valor >= 0) AND (valor_original IS NULL OR valor_original >= 0))')
    ) AS r(tabela, nome, regra)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = regra.nome AND conrelid = ('public.' || regra.tabela)::regclass) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', regra.tabela, regra.nome, regra.regra);
    END IF;
  END LOOP;
END $$;

-- 3. O nome do equipamento das tarefas que já existem: o da posição, ou o próprio (como a tela mostra)
\if :nomear_equipamentos
CREATE TEMP TABLE nome_do_equipamento ON COMMIT DROP AS
SELECT trim(e.id) AS id, left(COALESCE(NULLIF(trim(af.nome), ''), trim(e.nome)), 255) AS nome
  FROM public.equipamentos e
  LEFT JOIN public.ativos_funcionais af ON trim(af.id) = trim(e.ativo_funcional_id);

UPDATE public.tarefas_programacao_os t
   SET equipamento_nome = n.nome
  FROM nome_do_equipamento n
 WHERE n.id = trim(t.equipamento_id) AND t.equipamento_nome IS NULL;
UPDATE public.tarefas_os t
   SET equipamento_nome = n.nome
  FROM nome_do_equipamento n
 WHERE n.id = trim(t.equipamento_id) AND t.equipamento_nome IS NULL;
\else
\echo 'O nome do equipamento já foi preenchido na primeira execução: não se preenche de novo.'
\endif

-- 4. Os "custos adicionais" de antes (um número só, sem descrição) da OS que ainda não finalizou viram
--    um não previsto com descrição: o Executar e a correção mostram e corrigem como os outros (o campo
--    saiu da tela, e o número ficava no custo sem ninguém conseguir mexer). A finalizada fica como está:
--    o conteúdo dela está provado pelo código. O custo real não muda: os dois entram nele
CREATE TEMP TABLE adicionais_antigos ON COMMIT DROP AS
SELECT o.id, o.numero_os, o.status, o.custos_adicionais
  FROM public.ordens_servico o
 WHERE o.custos_adicionais > 0 AND o.status NOT IN ('FINALIZADA', 'CANCELADA');

\echo 'Os custos adicionais de antes que viram não previsto (OS ainda não finalizada):'
SELECT trim(numero_os) AS os, status, custos_adicionais FROM adicionais_antigos ORDER BY 1;

-- O id derivado da OS: rodar de novo não duplica (e a OS já sem o número não entra)
INSERT INTO public.itens_orcamento_os (id, os_id, descricao, valor, natureza, valor_real, nao_previsto, created_at, updated_at)
SELECT 'sn93' || substr(md5(a.id), 1, 21), a.id, 'Custos adicionais (lançados antes de 22/10/2026)', 0, 'OUTRO',
       a.custos_adicionais, true, now(), now()
  FROM adicionais_antigos a
ON CONFLICT (id) DO NOTHING;
UPDATE public.ordens_servico o SET custos_adicionais = NULL FROM adicionais_antigos a WHERE o.id = a.id;

\echo 'Conferência: os itens por natureza (OUTRO é o que não tinha prefixo conhecido):'
SELECT 'programacao' AS tabela, natureza, count(*) FROM public.itens_orcamento_programacao_os GROUP BY 1, 2
UNION ALL
SELECT 'os', natureza, count(*) FROM public.itens_orcamento_os GROUP BY 1, 2
ORDER BY 1, 2;

\echo 'Conferência: as tarefas com equipamento e sem o nome dele (equipamento apagado de verdade):'
SELECT 'programacao' AS tabela, count(*) FILTER (WHERE equipamento_id IS NOT NULL) AS com_equipamento,
       count(*) FILTER (WHERE equipamento_id IS NOT NULL AND equipamento_nome IS NULL) AS sem_nome
  FROM public.tarefas_programacao_os
UNION ALL
SELECT 'os', count(*) FILTER (WHERE equipamento_id IS NOT NULL), count(*) FILTER (WHERE equipamento_id IS NOT NULL AND equipamento_nome IS NULL)
  FROM public.tarefas_os;

\if :aplicar
COMMIT;
\echo 'Gravado.'
\else
ROLLBACK;
\echo 'Prévia: nada foi gravado. Para gravar: psql -v aplicar=1 -f 2026-10-22-custos-da-os.sql'
\endif
