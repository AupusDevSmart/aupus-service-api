-- Recursos com os campos do AupusProject (SN-83, 2026-10-20)
--
-- Decisão do usuário (20/out/2026): o recurso do Service tem os mesmos campos
-- do recurso do AupusProject, com as 6 categorias de lá. As planilhas de um
-- importam no outro.
--
--   categorias:  TECNICO -> MAO_DE_OBRA, VIATURA -> VEICULO,
--                FERRAMENTA -> INSTRUMENTO; entram TERCEIRO e DESPESA_CAMPO.
--                Vale para recursos.categoria e recursos_instrucao.tipo.
--   colunas:     preco_medio vira preco_unitario; entram funcao, descricao,
--                base_calculo, rubrica, valor_aquisicao, prazo_retorno_meses,
--                custos_anuais, meta_utilizacao_horas e horas_por_diaria; o
--                nome passa a 255 (como lá).
--   base:        pela unidade antiga (aparada, sem caixa): hora, diária, km ou
--                unidade; a que não for reconhecida para a categoria fica no
--                padrão dela e a prévia LISTA para conferir. O instrumento só é
--                cobrado por diária: o que tinha preço por HORA passa a ter o da
--                diária (x 8 horas por diária). As linhas das instruções ficam
--                como estão: em horas, a conta da API as converte em diárias
--                arredondadas para cima (2 h de megôhmetro = 1 diária).
--
-- Não está na sincronização com o NexOn (recursos não é tabela compartilhada).
--
-- PRÉVIA POR PADRÃO: mostra o que muda e desfaz (ROLLBACK). Grava só com
-- -v aplicar=1 (ou on/true). A prévia também roda a DDL (trava as duas
-- tabelas até o fim): rodar com pouco movimento.
--
--   psql -f 2026-10-20-recursos-como-no-aupusproject.sql               (prévia)
--   psql -v aplicar=1 -f 2026-10-20-recursos-como-no-aupusproject.sql  (grava)
--
-- Em produção: guardar a saída da prévia e um pg_dump -t recursos -t
-- recursos_instrucao; PARAR a API (pm2 stop) antes do aplicar — a velha dá 500
-- com as colunas novas —, deploy, prisma generate e start. Idempotente: rodar
-- de novo não muda nada. Para se a conversão juntar dois recursos de mesmo
-- nome na mesma categoria (o índice único não deixaria).

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

-- Já convertido? (a categoria nova existe no tipo)
SELECT EXISTS (
  SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
   WHERE t.typname = 'TipoRecurso' AND e.enumlabel = 'MAO_DE_OBRA'
) AS ja_convertido \gset

\if :ja_convertido
\echo 'As categorias já são as do AupusProject: a conversão já foi feita.'
\else

-- O que vai mudar, calculado UMA vez: a prévia mostra exatamente o que o UPDATE grava
CREATE TEMP TABLE conversao ON COMMIT DROP AS
WITH r AS (
  SELECT id, nome, deleted_at, unidade, preco_medio,
         categoria::text AS antes,
         CASE categoria::text WHEN 'TECNICO' THEN 'MAO_DE_OBRA' WHEN 'VIATURA' THEN 'VEICULO'
              WHEN 'FERRAMENTA' THEN 'INSTRUMENTO' ELSE categoria::text END AS depois,
         btrim(lower(coalesce(unidade, ''))) AS u
    FROM public.recursos
), classificada AS (
  SELECT *,
         CASE WHEN u ~ '^(h|hr|hrs|hs|hora|horas)$' THEN 'hora'
              WHEN u ~ '^(d|dia|dias|diaria|diarias|diária|diárias)$' THEN 'diaria'
              WHEN u ~ '^(km|kms|quilometro|quilometros|quilômetro|quilômetros)$' THEN 'km'
              WHEN u = '' THEN 'vazia'
              ELSE 'outra' END AS unidade_lida
    FROM r
)
SELECT id, nome, deleted_at, unidade, antes, depois, unidade_lida,
       CASE depois
         WHEN 'MAO_DE_OBRA' THEN CASE WHEN unidade_lida = 'diaria' THEN 'diaria' ELSE 'hora' END
         WHEN 'MATERIAL' THEN 'unidade'
         WHEN 'INSTRUMENTO' THEN 'diaria'
         WHEN 'VEICULO' THEN CASE WHEN unidade_lida = 'diaria' THEN 'diaria' ELSE 'km' END
         ELSE 'diaria'
       END AS base_calculo,
       CASE depois
         WHEN 'MAO_DE_OBRA' THEN 'instrucoes' WHEN 'INSTRUMENTO' THEN 'instrucoes'
         WHEN 'MATERIAL' THEN 'materiais' WHEN 'VEICULO' THEN 'veiculos' ELSE 'diarias'
       END AS rubrica,
       preco_medio AS preco_antes,
       CASE WHEN depois = 'INSTRUMENTO' AND unidade_lida = 'hora' AND preco_medio IS NOT NULL
            THEN preco_medio * 8 ELSE preco_medio END AS preco_depois,
       -- A unidade antiga não diz a cobrança da categoria nova: a base fica no padrão, para conferir
       CASE
         WHEN depois = 'MATERIAL' THEN false
         WHEN depois = 'MAO_DE_OBRA' THEN unidade_lida NOT IN ('hora', 'diaria', 'vazia')
         WHEN depois = 'INSTRUMENTO' THEN unidade_lida NOT IN ('hora', 'diaria', 'vazia')
         WHEN depois = 'VEICULO' THEN unidade_lida NOT IN ('km', 'diaria')
         ELSE false
       END AS conferir
  FROM classificada;

\echo 'Cada recurso: categoria, base, rubrica e preço, antes -> depois (unidade entre aspas: espaço sobrando aparece):'
SELECT trim(id) AS id, nome, (deleted_at IS NOT NULL) AS removido, quote_literal(coalesce(unidade, '')) AS unidade,
       antes, depois, base_calculo, rubrica, preco_antes, preco_depois
  FROM conversao ORDER BY depois, nome;

\echo 'A CONFERIR com o usuário: a unidade antiga não diz a cobrança da categoria nova (ficou no padrão):'
SELECT trim(id) AS id, nome, quote_literal(coalesce(unidade, '')) AS unidade, antes, depois, base_calculo, preco_depois
  FROM conversao WHERE conferir ORDER BY depois, nome;

\echo 'Linhas das instruções por categoria, antes -> depois (ficam em horas: a conta converte em diárias):'
SELECT tipo::text AS antes,
       CASE tipo::text WHEN 'TECNICO' THEN 'MAO_DE_OBRA' WHEN 'VIATURA' THEN 'VEICULO'
            WHEN 'FERRAMENTA' THEN 'INSTRUMENTO' ELSE tipo::text END AS depois,
       count(*) AS linhas
  FROM public.recursos_instrucao GROUP BY 1, 2 ORDER BY 1;

-- A conversão não pode juntar dois nomes iguais na mesma categoria nova
DO $$
DECLARE repetidos TEXT;
BEGIN
  SELECT string_agg(format('%s (%s)', nome, depois), ', ') INTO repetidos
    FROM (SELECT lower(nome) AS nome, depois FROM conversao WHERE deleted_at IS NULL) x
   GROUP BY nome, depois HAVING count(*) > 1;
  IF repetidos IS NOT NULL THEN
    RAISE EXCEPTION 'A conversão juntaria recursos de mesmo nome na mesma categoria: %. Renomeie um deles antes.', repetidos;
  END IF;
END $$;

CREATE TYPE "TipoRecurso_novo" AS ENUM ('MAO_DE_OBRA', 'MATERIAL', 'INSTRUMENTO', 'VEICULO', 'TERCEIRO', 'DESPESA_CAMPO');

ALTER TABLE public.recursos
  ALTER COLUMN categoria TYPE "TipoRecurso_novo"
  USING (CASE categoria::text WHEN 'TECNICO' THEN 'MAO_DE_OBRA' WHEN 'VIATURA' THEN 'VEICULO'
              WHEN 'FERRAMENTA' THEN 'INSTRUMENTO' ELSE categoria::text END)::"TipoRecurso_novo";

ALTER TABLE public.recursos_instrucao
  ALTER COLUMN tipo TYPE "TipoRecurso_novo"
  USING (CASE tipo::text WHEN 'TECNICO' THEN 'MAO_DE_OBRA' WHEN 'VIATURA' THEN 'VEICULO'
              WHEN 'FERRAMENTA' THEN 'INSTRUMENTO' ELSE tipo::text END)::"TipoRecurso_novo";

DROP TYPE "TipoRecurso";
ALTER TYPE "TipoRecurso_novo" RENAME TO "TipoRecurso";

ALTER TABLE public.recursos RENAME COLUMN preco_medio TO preco_unitario;
ALTER TABLE public.recursos
  ADD COLUMN funcao VARCHAR(255),
  ADD COLUMN descricao TEXT,
  ADD COLUMN base_calculo VARCHAR(20),
  ADD COLUMN rubrica VARCHAR(20),
  ADD COLUMN valor_aquisicao DECIMAL(12, 2),
  ADD COLUMN prazo_retorno_meses SMALLINT,
  ADD COLUMN custos_anuais DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN meta_utilizacao_horas DECIMAL(10, 2),
  ADD COLUMN horas_por_diaria SMALLINT NOT NULL DEFAULT 8;

-- O que a prévia mostrou, e o updated_at: o @updatedAt não dispara em SQL cru (no segundo, Timestamp(0))
UPDATE public.recursos x
   SET base_calculo = c.base_calculo, rubrica = c.rubrica, preco_unitario = c.preco_depois,
       updated_at = date_trunc('second', now())
  FROM conversao c
 WHERE c.id = x.id;

\endif

ALTER TABLE public.recursos ALTER COLUMN base_calculo SET NOT NULL;
ALTER TABLE public.recursos ALTER COLUMN rubrica SET NOT NULL;
-- 255, como no AupusProject: a planilha de lá não pode ser recusada aqui
ALTER TABLE public.recursos ALTER COLUMN nome TYPE VARCHAR(255);

-- As listas do AupusProject (Recurso::BASES, Rubrica::DE_CUSTO), os limites e o índice do nome
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recursos_base_calculo_valida') THEN
    ALTER TABLE public.recursos ADD CONSTRAINT recursos_base_calculo_valida
      CHECK (base_calculo IN ('hora', 'diaria', 'unidade', 'km', 'fechado'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recursos_rubrica_valida') THEN
    ALTER TABLE public.recursos ADD CONSTRAINT recursos_rubrica_valida
      CHECK (rubrica IN ('instrucoes', 'materiais', 'veiculos', 'combustivel', 'diarias', 'terceirizados'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recursos_horas_por_diaria_valida') THEN
    ALTER TABLE public.recursos ADD CONSTRAINT recursos_horas_por_diaria_valida CHECK (horas_por_diaria BETWEEN 1 AND 24);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recursos_prazo_retorno_valido') THEN
    ALTER TABLE public.recursos ADD CONSTRAINT recursos_prazo_retorno_valido
      CHECK (prazo_retorno_meses IS NULL OR prazo_retorno_meses BETWEEN 1 AND 600);
  END IF;
END $$;

-- O nome não se repete na categoria entre os não removidos (existia sem estar versionado)
CREATE UNIQUE INDEX IF NOT EXISTS recursos_categoria_nome_unico
  ON public.recursos (categoria, lower((nome)::text)) WHERE deleted_at IS NULL;

\echo 'Conferência: recursos por categoria e base (todos com base e rubrica):'
SELECT categoria::text AS categoria, base_calculo, rubrica, count(*) AS recursos
  FROM public.recursos
 GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

\echo 'Linhas das instruções por categoria:'
SELECT tipo::text AS categoria, count(*) AS linhas FROM public.recursos_instrucao GROUP BY 1 ORDER BY 1;

\if :aplicar
COMMIT;
\echo 'Gravado.'
\else
ROLLBACK;
\echo 'Prévia: nada foi gravado. Para gravar: psql -v aplicar=1 -f 2026-10-20-recursos-como-no-aupusproject.sql'
\endif
