-- A instrução com as tabelas e os campos do AupusProject (SN-85, 2026-10-20)
--
-- Decisão do usuário (20/out/2026): "a tabela e as relações no banco de dados
-- têm os mesmos campos" da instrução do AupusProject, e a planilha de lá
-- importa aqui. O que só o Service tem fica (status, observações, o passo de
-- leitura e a foto).
--
--   instrucoes:        tag vira codigo; nome até 255; descrição opcional;
--                      entram frente, prazo_inicio_relativo (D+X) e
--                      duracao_dias; SAEM os 6 campos que o formulário escondia
--                      (categoria, tipo_manutencao, condicao_ativo, criticidade,
--                      duracao_estimada, tempo_estimado) e os 3 tipos deles.
--   sub_instrucoes:    tipo passa a ser a disciplina de lá (administrativo,
--                      civil, eletrico, mecanico; opcional); o tipo do SN-58
--                      (VERIFICACAO/LEITURA) vira registro; tempo_estimado
--                      (minutos) vira duracao_horas (0 = vazio).
--   recursos_instrucao vira instrucao_recursos, o nome de lá, com duracao_horas,
--                      fator_perda (0 a 1), fornecido_pelo_cliente, distancia_km
--                      e preco_proprio. recurso_id passa a obrigatório: a linha
--                      antiga em texto livre vira o recurso do catálogo de mesmo
--                      nome na categoria, ou um recurso novo SEM PREÇO. A
--                      quantidade antiga vira a duração na cobrança por hora ou
--                      diária (as horas, ou os dias x a jornada) e a distância
--                      na por km, com a quantidade 1. O mesmo recurso duas vezes
--                      na instrução vira uma linha (somadas). Saem tipo,
--                      descricao, unidade (vêm do recurso) e obrigatorio.
--   instrucao_maquinarios (nova): o maquinário que a instrução usa.
--
-- Depende do SN-83 (2026-10-20-recursos-como-no-aupusproject.sql) e do SN-84
-- (2026-10-20-maquinarios.sql), nessa ordem. Nenhuma das tabelas está na
-- sincronização com o NexOn.
--
-- PRÉVIA POR PADRÃO: mostra o que muda e desfaz (ROLLBACK). Grava só com
-- -v aplicar=1 (ou on/true). A prévia também roda a DDL (trava as tabelas até o
-- fim): rodar com pouco movimento.
--
--   psql -f 2026-10-20-instrucao-como-no-aupusproject.sql               (prévia)
--   psql -v aplicar=1 -f 2026-10-20-instrucao-como-no-aupusproject.sql  (grava)
--
-- Em produção: guardar a saída da prévia e um pg_dump COMPLETO (-Fc): o -t das
-- tabelas não leva os tipos que este script apaga, e o dump não restauraria.
-- PARAR a API (pm2 stop) antes do aplicar (a velha lê as colunas que saem:
-- 500), deploy, prisma generate e start. Idempotente: rodar de novo não muda
-- nada. Para (sem gravar nada) se achar dado que a conversão estragaria:
-- quantidade negativa, tempo acima do que a coluna nova guarda, objeto com nome
-- diferente do esperado, ou o mesmo material repetido em unidades diferentes.

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
  IF to_regclass('public.maquinarios') IS NULL THEN
    RAISE EXCEPTION 'Falta a tabela maquinarios: aplique antes o 2026-10-20-maquinarios.sql (SN-84)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'recursos' AND column_name = 'base_calculo') THEN
    RAISE EXCEPTION 'Falta o recurso do AupusProject: aplique antes o 2026-10-20-recursos-como-no-aupusproject.sql (SN-83)';
  END IF;
END $$;

SET LOCAL lock_timeout = '5s';

-- Já convertido? (a instrução já tem o código)
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'instrucoes' AND column_name = 'codigo'
) AS ja_convertido \gset

\if :ja_convertido
\echo 'A instrução já tem os campos do AupusProject: a conversão já foi feita.'
\else

-- A foto das tabelas temporárias tem de ser exatamente o que o UPDATE grava
LOCK TABLE public.instrucoes, public.sub_instrucoes, public.recursos_instrucao, public.recursos IN ACCESS EXCLUSIVE MODE;

-- O que o script espera achar, antes de mexer em qualquer coisa: nada aqui é
-- consertado por ele, e parar no meio da DDL travaria a janela do deploy
DO $$
DECLARE problemas TEXT;
BEGIN
  SELECT string_agg(p, E'\n') INTO problemas FROM (
    SELECT format('linha de recurso %s com quantidade %s (negativa ou NaN): corrija antes', trim(id), quantidade) AS p
      FROM public.recursos_instrucao WHERE quantidade < 0 OR quantidade = 'NaN'::numeric
    UNION ALL
    SELECT format('passo %s com %s minutos (negativo ou acima de 9999 h): corrija antes', trim(id), tempo_estimado)
      FROM public.sub_instrucoes WHERE tempo_estimado < 0 OR tempo_estimado > 599940
    UNION ALL
    SELECT format('falta o objeto %s (o script renomeia ou apaga pelo nome)', nome)
      FROM (VALUES ('instrucoes_tag_key'), ('recursos_instrucao_recurso_id_idx')) v(nome)
     WHERE to_regclass('public.' || nome) IS NULL
    UNION ALL
    SELECT format('falta a restrição %s em %s', c.nome, c.tabela)
      FROM (VALUES ('recursos_instrucao', 'recursos_instrucao_pkey'), ('recursos_instrucao', 'recursos_instrucao_instrucao_id_fkey'),
                   ('recursos_instrucao', 'recursos_instrucao_recurso_id_fkey'), ('sub_instrucoes', 'sub_instrucoes_tipo_check')) c(tabela, nome)
     WHERE NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conname = c.nome AND k.conrelid = ('public.' || c.tabela)::regclass)
    UNION ALL
    SELECT format('o tipo %s é usado também por %s.%s (o script o apaga)', udt_name, table_name, column_name)
      FROM information_schema.columns
     WHERE table_schema = 'public' AND udt_name IN ('CategoriaTarefa', 'TipoManutencao', 'CondicaoAtivo') AND table_name <> 'instrucoes'
  ) x;
  IF problemas IS NOT NULL THEN
    RAISE EXCEPTION E'A conversão parou antes de mexer em qualquer coisa:\n%', problemas;
  END IF;
END $$;

-- A chave do nome como a planilha casa (catalogo-por-nome.ts): sem caixa, sem
-- acento e com os espaços colapsados. Só lower(btrim()) deixava "Megometro" e
-- "Megômetro" virarem dois recursos, e a planilha passaria a achar dois.
CREATE FUNCTION pg_temp.chave(t TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $f$
  SELECT lower(regexp_replace(btrim(translate(coalesce(t, ''),
    'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g'))
$f$;

-- ---------------------------------------------------------------- prévia ----

\echo 'Os 6 campos que saem da instrução, com o valor de cada uma (a guardar junto do pg_dump):'
SELECT tag, nome, categoria::text AS categoria, tipo_manutencao::text AS tipo_manutencao,
       condicao_ativo::text AS condicao_ativo, criticidade, duracao_estimada, tempo_estimado,
       (deleted_at IS NOT NULL) AS removida
  FROM public.instrucoes ORDER BY tag;

\echo 'Passos com tempo: minutos -> horas (a conta que não fecha em centésimos aparece em "aproximado"):'
SELECT i.tag, s.ordem, left(s.descricao, 60) AS passo, s.tempo_estimado AS minutos,
       round(s.tempo_estimado / 60.0, 2) AS horas,
       (round(s.tempo_estimado / 60.0, 2) * 60 <> s.tempo_estimado) AS aproximado
  FROM public.sub_instrucoes s JOIN public.instrucoes i ON trim(i.id) = trim(s.instrucao_id)
 WHERE coalesce(s.tempo_estimado, 0) > 0
 ORDER BY i.tag, s.ordem;

-- A linha em texto livre: o recurso do catálogo de mesmo nome na categoria. O
-- vivo primeiro; sem ele, o removido (a linha usava o que a pessoa tirou do
-- catálogo: ele volta a valer nela, sem voltar ao catálogo ativo)
CREATE TEMP TABLE livre ON COMMIT DROP AS
SELECT ri.id, ri.instrucao_id, ri.created_at, ri.tipo, btrim(ri.descricao) AS nome, nullif(btrim(ri.unidade), '') AS unidade,
       pg_temp.chave(ri.descricao) AS chave,
       (i.deleted_at IS NULL) AS instrucao_viva,
       (SELECT r.id FROM public.recursos r
         WHERE r.categoria = ri.tipo AND pg_temp.chave(r.nome) = pg_temp.chave(ri.descricao)
         ORDER BY (r.deleted_at IS NULL) DESC, r.deleted_at DESC NULLS FIRST, r.created_at LIMIT 1) AS do_catalogo
  FROM public.recursos_instrucao ri
  JOIN public.instrucoes i ON trim(i.id) = trim(ri.instrucao_id)
 WHERE ri.recurso_id IS NULL;

-- O recurso novo de cada nome que não está no catálogo: um por categoria e
-- chave, sem preço. A cobrança pela unidade da primeira linha, a regra do SN-83
-- (mão de obra e veículo em "dia" são por diária). O id sai do nome: a prévia
-- e o aplicar dão o mesmo. Inativo quando só instrução removida o usava.
CREATE TEMP TABLE recurso_novo ON COMMIT DROP AS
WITH grupo AS (
  SELECT tipo, chave,
         (array_agg(nome ORDER BY created_at, id))[1] AS nome,
         (array_agg(unidade ORDER BY created_at, id) FILTER (WHERE unidade IS NOT NULL))[1] AS unidade,
         bool_or(instrucao_viva) AS ativo
    FROM livre WHERE do_catalogo IS NULL
   GROUP BY tipo, chave
)
SELECT substr(md5('SN-85:' || tipo::text || ':' || chave), 1, 26) AS id, tipo, chave, nome, unidade, ativo,
       CASE tipo::text
         WHEN 'MATERIAL' THEN 'unidade'
         WHEN 'TERCEIRO' THEN 'fechado'
         WHEN 'INSTRUMENTO' THEN 'diaria'
         WHEN 'DESPESA_CAMPO' THEN 'diaria'
         WHEN 'MAO_DE_OBRA' THEN CASE WHEN lower(coalesce(unidade, '')) ~ '^(d|dia|dias|diaria|diarias|diária|diárias)$' THEN 'diaria' ELSE 'hora' END
         ELSE CASE WHEN lower(coalesce(unidade, '')) ~ '^(d|dia|dias|diaria|diarias|diária|diárias)$' THEN 'diaria' ELSE 'km' END
       END AS base_calculo,
       CASE tipo::text WHEN 'MATERIAL' THEN 'materiais' WHEN 'VEICULO' THEN 'veiculos' WHEN 'TERCEIRO' THEN 'terceirizados'
            WHEN 'DESPESA_CAMPO' THEN 'diarias' ELSE 'instrucoes' END AS rubrica
  FROM grupo;

\echo 'Linhas em texto livre -> recurso do catálogo (o vivo, o REMOVIDO de mesmo nome, ou NOVO sem preço):'
SELECT i.tag, l.tipo::text AS categoria, l.nome AS linha,
       coalesce(r.nome || CASE WHEN r.deleted_at IS NOT NULL THEN ' (removido do catálogo)' ELSE '' END,
                'NOVO ' || n.nome || ' (' || n.base_calculo || CASE WHEN n.ativo THEN '' ELSE ', inativo' END || ')') AS recurso,
       coalesce(trim(l.do_catalogo), trim(n.id)) AS id
  FROM livre l
  JOIN public.instrucoes i ON trim(i.id) = trim(l.instrucao_id)
  LEFT JOIN public.recursos r ON r.id = l.do_catalogo
  LEFT JOIN recurso_novo n ON n.tipo = l.tipo AND n.chave = l.chave AND l.do_catalogo IS NULL
 ORDER BY i.tag, l.nome;

-- Cada linha com o recurso final e a conversão pela cobrança dele
CREATE TEMP TABLE linha ON COMMIT DROP AS
WITH base AS (
  SELECT ri.id, ri.instrucao_id, ri.created_at,
         coalesce(ri.recurso_id, l.do_catalogo, n.id) AS recurso_id,
         coalesce(ri.quantidade, 1) AS q,
         btrim(lower(coalesce(ri.unidade, ''))) AS u,
         ri.descricao AS descricao_antes, ri.unidade AS unidade_antes, ri.quantidade AS quantidade_antes, ri.obrigatorio
    FROM public.recursos_instrucao ri
    LEFT JOIN livre l ON l.id = ri.id
    LEFT JOIN recurso_novo n ON n.tipo = l.tipo AND n.chave = l.chave AND l.do_catalogo IS NULL
), com_recurso AS (
  SELECT b.*,
         coalesce(r.base_calculo, n.base_calculo) AS base,
         btrim(lower(coalesce(r.unidade, n.unidade, ''))) AS unidade_do_recurso,
         coalesce(r.horas_por_diaria, 8) AS jornada,
         CASE WHEN b.u ~ '^(h|hr|hrs|hs|hora|horas)$' THEN 'hora'
              WHEN b.u ~ '^(d|dia|dias|diaria|diarias|diária|diárias)$' THEN 'diaria'
              WHEN b.u ~ '^(km|kms|quilometro|quilometros|quilômetro|quilômetros)$' THEN 'km'
              WHEN b.u = '' THEN 'vazia'
              ELSE 'outra' END AS unidade_lida
    FROM base b
    LEFT JOIN public.recursos r ON r.id = b.recurso_id
    LEFT JOIN recurso_novo n ON n.id = b.recurso_id
), convertida AS (
  SELECT *,
         CASE WHEN base IN ('unidade', 'fechado') THEN q ELSE 1 END AS quantidade,
         CASE WHEN base = 'hora' THEN CASE WHEN unidade_lida = 'diaria' THEN q * jornada ELSE q END
              WHEN base = 'diaria' THEN CASE WHEN unidade_lida = 'hora' THEN q ELSE q * jornada END
              ELSE 0 END AS duracao_horas,
         CASE WHEN base = 'km' THEN q END AS distancia_km,
         -- As unidades da cobrança, antes (a regra do SN-83) e depois (a do AupusProject)
         CASE WHEN base = 'diaria' AND unidade_lida = 'hora' THEN ceil(q / greatest(jornada, 1)) ELSE q END AS unidades_antes,
         CASE base
           WHEN 'hora' THEN CASE WHEN unidade_lida = 'diaria' THEN q * jornada ELSE q END
           WHEN 'diaria' THEN ceil((CASE WHEN unidade_lida = 'hora' THEN q ELSE q * jornada END) / greatest(jornada, 1))
           ELSE q END AS unidades_depois
    FROM com_recurso
)
SELECT *,
       -- O que a contagem sozinha não pega: o sentido do número muda
       concat_ws('; ',
         CASE WHEN unidades_antes <> unidades_depois THEN 'a conta da cobrança muda' END,
         CASE WHEN base = 'unidade' AND u <> '' AND u <> unidade_do_recurso THEN 'a linha está em ' || u || ' e o recurso em ' || coalesce(nullif(unidade_do_recurso, ''), '(sem unidade)') END,
         CASE WHEN base = 'km' AND unidade_lida IN ('hora', 'diaria') THEN 'cobrança por km e a linha em ' || u END,
         CASE WHEN base IN ('hora', 'diaria') AND unidade_lida IN ('outra', 'km') THEN 'unidade "' || u || '" lida como horas' END,
         CASE WHEN quantidade_antes IS NULL THEN 'sem quantidade: entrou 1' END
       ) AS conferir
  FROM convertida;

\echo 'Cada linha: antes (descrição, quantidade, unidade, obrigatório) -> quantidade, duração e distância; "conferir" diz o que mudou de sentido:'
SELECT i.tag, coalesce(r.nome, n.nome || ' (novo)') AS recurso, l.base, l.descricao_antes, l.quantidade_antes,
       quote_literal(coalesce(l.unidade_antes, '')) AS unidade_antes, l.obrigatorio,
       l.quantidade, l.duracao_horas, l.distancia_km, l.unidades_antes, l.unidades_depois, nullif(l.conferir, '') AS conferir
  FROM linha l
  JOIN public.instrucoes i ON trim(i.id) = trim(l.instrucao_id)
  LEFT JOIN public.recursos r ON r.id = l.recurso_id
  LEFT JOIN recurso_novo n ON n.id = l.recurso_id
 ORDER BY (l.conferir = '') , i.tag, 2;

-- O mesmo recurso duas vezes na instrução: uma linha só, somada (a primeira fica)
CREATE TEMP TABLE junta ON COMMIT DROP AS
SELECT trim(instrucao_id) AS instrucao, recurso_id,
       (array_agg(id ORDER BY created_at, id))[1] AS fica,
       count(*) AS linhas,
       min(base) AS base,
       count(DISTINCT u) FILTER (WHERE u <> '') AS unidades_distintas,
       string_agg(DISTINCT nullif(u, ''), ', ') AS unidades,
       CASE WHEN min(base) IN ('unidade', 'fechado') THEN sum(quantidade) ELSE max(quantidade) END AS quantidade,
       sum(duracao_horas) AS duracao_horas,
       sum(distancia_km) AS distancia_km,
       -- Na diária, a soma das diárias de cada linha contra as diárias da soma (2 h + 3 h: 2 antes, 1 depois)
       sum(unidades_depois) AS unidades_por_linha,
       CASE WHEN min(base) = 'diaria' THEN ceil(sum(duracao_horas) / greatest(min(jornada), 1)) ELSE sum(unidades_depois) END AS unidades_juntas
  FROM linha
 GROUP BY trim(instrucao_id), recurso_id
HAVING count(*) > 1;

\echo 'O mesmo recurso repetido na instrução -> uma linha, somada (em "unidades" as que as linhas tinham):'
SELECT i.tag, coalesce(r.nome, n.nome || ' (novo)') AS recurso, j.linhas, j.unidades, j.quantidade, j.duracao_horas, j.distancia_km,
       j.unidades_por_linha, j.unidades_juntas,
       CASE WHEN j.base = 'unidade' AND j.unidades_distintas > 1 THEN 'BLOQUEIA: material em unidades diferentes não se soma'
            WHEN j.unidades_por_linha <> j.unidades_juntas THEN 'a conta muda ao juntar' END AS conferir
  FROM junta j
  JOIN public.instrucoes i ON trim(i.id) = j.instrucao
  LEFT JOIN public.recursos r ON r.id = j.recurso_id
  LEFT JOIN recurso_novo n ON n.id = j.recurso_id
 ORDER BY i.tag, 2;

-- Material repetido em unidades diferentes (10 m + 2 rolos) não tem soma certa:
-- a prévia mostra, e o aplicar para antes da DDL — acerte as linhas na tela antes
\if :aplicar
DO $$
DECLARE repetidos TEXT;
BEGIN
  SELECT string_agg(format('instrução %s: %s em %s', j.instrucao, trim(j.recurso_id), j.unidades), E'\n') INTO repetidos
    FROM junta j WHERE j.base = 'unidade' AND j.unidades_distintas > 1;
  IF repetidos IS NOT NULL THEN
    RAISE EXCEPTION E'O mesmo material repetido em unidades diferentes (acerte na instrução antes):\n%', repetidos;
  END IF;
END $$;
\endif

-- ------------------------------------------------------------ instrucoes ----

ALTER TABLE public.instrucoes RENAME COLUMN tag TO codigo;
ALTER INDEX public.instrucoes_tag_key RENAME TO instrucoes_codigo_key;
ALTER TABLE public.instrucoes ALTER COLUMN nome TYPE VARCHAR(255);
ALTER TABLE public.instrucoes ALTER COLUMN descricao DROP NOT NULL;
ALTER TABLE public.instrucoes
  ADD COLUMN frente VARCHAR(60),
  ADD COLUMN prazo_inicio_relativo SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN duracao_dias SMALLINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT instrucoes_prazo_inicio_valido CHECK (prazo_inicio_relativo BETWEEN 0 AND 9999),
  ADD CONSTRAINT instrucoes_duracao_dias_valida CHECK (duracao_dias BETWEEN 1 AND 9999);
ALTER TABLE public.instrucoes
  DROP COLUMN categoria,
  DROP COLUMN tipo_manutencao,
  DROP COLUMN condicao_ativo,
  DROP COLUMN criticidade,
  DROP COLUMN duracao_estimada,
  DROP COLUMN tempo_estimado;
-- Só a instrução usava os três (conferido em information_schema antes de escrever)
DROP TYPE "CategoriaTarefa";
DROP TYPE "TipoManutencao";
DROP TYPE "CondicaoAtivo";
-- As frentes já usadas viram sugestão no formulário
CREATE INDEX instrucoes_frente_idx ON public.instrucoes (frente);

-- -------------------------------------------------------- sub_instrucoes ----

ALTER TABLE public.sub_instrucoes RENAME COLUMN tipo TO registro;
ALTER TABLE public.sub_instrucoes RENAME CONSTRAINT sub_instrucoes_tipo_check TO sub_instrucoes_registro_check;
ALTER TABLE public.sub_instrucoes
  ADD COLUMN tipo VARCHAR(20),
  ADD COLUMN duracao_horas DECIMAL(8, 2),
  ADD CONSTRAINT sub_instrucoes_tipo_check CHECK (tipo IN ('administrativo', 'civil', 'eletrico', 'mecanico')),
  ADD CONSTRAINT sub_instrucoes_duracao_valida CHECK (duracao_horas BETWEEN 0 AND 9999);
UPDATE public.sub_instrucoes
   SET duracao_horas = round(tempo_estimado / 60.0, 2), updated_at = date_trunc('second', now())
 WHERE coalesce(tempo_estimado, 0) > 0;
ALTER TABLE public.sub_instrucoes DROP COLUMN tempo_estimado;

-- ---------------------------------------------------- instrucao_recursos ----

-- A cobrança e a rubrica que a prévia mostrou (uma conta só, em recurso_novo)
INSERT INTO public.recursos (id, categoria, nome, unidade, base_calculo, rubrica, ativo, created_at, updated_at)
SELECT id, tipo, nome, CASE WHEN tipo::text = 'MATERIAL' THEN unidade END, base_calculo, rubrica,
       ativo, date_trunc('second', now()), date_trunc('second', now())
  FROM recurso_novo;

ALTER TABLE public.recursos_instrucao RENAME TO instrucao_recursos;
ALTER TABLE public.instrucao_recursos RENAME CONSTRAINT recursos_instrucao_pkey TO instrucao_recursos_pkey;
ALTER TABLE public.instrucao_recursos RENAME CONSTRAINT recursos_instrucao_instrucao_id_fkey TO instrucao_recursos_instrucao_id_fkey;
ALTER INDEX public.recursos_instrucao_recurso_id_idx RENAME TO instrucao_recursos_recurso_id_idx;

ALTER TABLE public.instrucao_recursos
  ADD COLUMN duracao_horas DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN fator_perda DECIMAL(6, 4) NOT NULL DEFAULT 0,
  ADD COLUMN fornecido_pelo_cliente BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN distancia_km DECIMAL(10, 2),
  ADD COLUMN preco_proprio DECIMAL(12, 2);

-- O que a prévia mostrou: o recurso final e a conversão de cada linha
UPDATE public.instrucao_recursos x
   SET recurso_id = l.recurso_id, quantidade = l.quantidade, duracao_horas = l.duracao_horas,
       distancia_km = l.distancia_km, updated_at = date_trunc('second', now())
  FROM linha l
 WHERE l.id = x.id;

UPDATE public.instrucao_recursos x
   SET quantidade = j.quantidade, duracao_horas = j.duracao_horas, distancia_km = j.distancia_km
  FROM junta j
 WHERE x.id = j.fica;
DELETE FROM public.instrucao_recursos x
 USING junta j
 WHERE trim(x.instrucao_id) = j.instrucao AND x.recurso_id = j.recurso_id AND x.id <> j.fica;

ALTER TABLE public.instrucao_recursos
  DROP COLUMN tipo,
  DROP COLUMN descricao,
  DROP COLUMN unidade,
  DROP COLUMN obrigatorio;
ALTER TABLE public.instrucao_recursos ALTER COLUMN recurso_id SET NOT NULL;
ALTER TABLE public.instrucao_recursos ALTER COLUMN quantidade SET NOT NULL;
ALTER TABLE public.instrucao_recursos ALTER COLUMN quantidade SET DEFAULT 1;

-- Restrict, como lá: apagar um recurso em uso mudaria o custo da instrução calado
ALTER TABLE public.instrucao_recursos DROP CONSTRAINT recursos_instrucao_recurso_id_fkey;
ALTER TABLE public.instrucao_recursos ADD CONSTRAINT instrucao_recursos_recurso_id_fkey
  FOREIGN KEY (recurso_id) REFERENCES public.recursos(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.instrucao_recursos
  ADD CONSTRAINT instrucao_recursos_quantidade_valida CHECK (quantidade >= 0),
  ADD CONSTRAINT instrucao_recursos_duracao_valida CHECK (duracao_horas >= 0),
  ADD CONSTRAINT instrucao_recursos_fator_perda_valido CHECK (fator_perda BETWEEN 0 AND 1),
  ADD CONSTRAINT instrucao_recursos_distancia_valida CHECK (distancia_km IS NULL OR distancia_km >= 0),
  ADD CONSTRAINT instrucao_recursos_preco_proprio_valido CHECK (preco_proprio IS NULL OR preco_proprio >= 0);

-- A mesma instrução não lista o mesmo recurso duas vezes (duas linhas somando; quem edita uma acha que corrigiu o total)
CREATE UNIQUE INDEX instrucao_recursos_instrucao_id_recurso_id_key ON public.instrucao_recursos (instrucao_id, recurso_id);

\endif

-- ------------------------------------------------- instrucao_maquinarios ----

-- instrucao_id VarChar(26), o tipo de instrucoes.id: com Char(26) o include do Prisma volta vazio para id de 25
CREATE TABLE IF NOT EXISTS public.instrucao_maquinarios (
  id             CHAR(26)      PRIMARY KEY,
  instrucao_id   VARCHAR(26)   NOT NULL,
  maquinario_id  CHAR(26)      NOT NULL,
  quantidade     DECIMAL(10, 2) NOT NULL DEFAULT 1,
  duracao_horas  DECIMAL(10, 2) NOT NULL DEFAULT 0,
  distancia_km   DECIMAL(10, 2),
  preco_proprio  DECIMAL(12, 2),
  created_at     TIMESTAMP(0)  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMP(0)  NOT NULL DEFAULT now(),
  CONSTRAINT instrucao_maquinarios_instrucao_id_fkey FOREIGN KEY (instrucao_id)
    REFERENCES public.instrucoes(id) ON UPDATE CASCADE ON DELETE CASCADE,
  -- Restrict pelo mesmo motivo de instrucao_recursos
  CONSTRAINT instrucao_maquinarios_maquinario_id_fkey FOREIGN KEY (maquinario_id)
    REFERENCES public.maquinarios(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT instrucao_maquinarios_quantidade_valida CHECK (quantidade >= 0),
  CONSTRAINT instrucao_maquinarios_duracao_valida CHECK (duracao_horas >= 0),
  CONSTRAINT instrucao_maquinarios_distancia_valida CHECK (distancia_km IS NULL OR distancia_km >= 0),
  CONSTRAINT instrucao_maquinarios_preco_proprio_valido CHECK (preco_proprio IS NULL OR preco_proprio >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS instrucao_maquinarios_instrucao_id_maquinario_id_key
  ON public.instrucao_maquinarios (instrucao_id, maquinario_id);
CREATE INDEX IF NOT EXISTS instrucao_maquinarios_maquinario_id_idx ON public.instrucao_maquinarios (maquinario_id);

-- ---------------------------------------------------------- conferência ----

\echo 'Conferência: instruções e passos (com duração e de leitura):'
SELECT (SELECT count(*) FROM public.instrucoes) AS instrucoes,
       (SELECT count(*) FROM public.sub_instrucoes) AS passos,
       (SELECT count(*) FROM public.sub_instrucoes WHERE duracao_horas IS NOT NULL) AS passos_com_duracao,
       (SELECT count(*) FROM public.sub_instrucoes WHERE registro = 'LEITURA') AS passos_de_leitura;

\echo 'As colunas de instrucao_maquinarios (o CREATE IF NOT EXISTS pularia calado uma versão antiga):'
SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale, is_nullable
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'instrucao_maquinarios'
 ORDER BY ordinal_position;

\echo 'Linhas de recurso por categoria e cobrança (todas com recurso):'
SELECT r.categoria::text AS categoria, r.base_calculo, count(*) AS linhas,
       sum(ir.quantidade) AS quantidade, sum(ir.duracao_horas) AS horas, sum(ir.distancia_km) AS km
  FROM public.instrucao_recursos ir JOIN public.recursos r ON r.id = ir.recurso_id
 GROUP BY 1, 2 ORDER BY 1, 2;

\if :aplicar
COMMIT;
\echo 'Gravado.'
\else
ROLLBACK;
\echo 'Prévia: nada foi gravado. Para gravar: psql -v aplicar=1 -f 2026-10-20-instrucao-como-no-aupusproject.sql'
\endif
