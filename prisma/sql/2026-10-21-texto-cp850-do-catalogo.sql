-- Texto corrompido por CP850 no catálogo de equipamentos (achado do SN-70)
--
-- O UTF-8 de "ê" (C3 AA) lido num terminal CP850 vira "├¬": no dev, 34 nomes de
-- categoria, modelo e fabricante estavam assim ("Transformador de Pot├¬ncia").
-- Além do texto feio, a tela de equipamento casa os campos técnicos pelo NOME
-- da categoria, e o nome corrompido não casa: o transformador abria sem
-- nenhum campo padrão.
--
-- Só categorias e modelos (não sincronizam com o NexOn; os ids não mudam).
-- Cada par conhecido volta ao caractere de origem: as letras acentuadas (C3 xx,
-- "├"), os símbolos técnicos (°, º, ², µ, Ω: "┬", "╬") e a pontuação (– — “ ”
-- …: "ÔÇ"). Texto com sobra de CP850 depois dos pares PARA o script antes de
-- mexer em qualquer coisa: ninguém sabe o caractere de origem.
--
-- Prévia (só leitura):  psql -f 2026-10-21-texto-cp850-do-catalogo.sql
-- Aplicar:              psql -v aplicar=1 -f 2026-10-21-texto-cp850-do-catalogo.sql
-- Idempotente: rodar de novo não acha nada. PAROU sai com erro (código 3).

\set ON_ERROR_STOP on
\if :{?aplicar}
\else
  \set aplicar 0
\endif

-- O arquivo é UTF-8: num console Windows (CP850/WIN1252) o "├" seria lido como
-- outro texto, a busca não acharia nada e a prévia diria que não há o que fazer
SET client_encoding = 'UTF8';
BEGIN;
SET LOCAL lock_timeout = '2s';

CREATE TEMP TABLE pares_cp850 (errado text PRIMARY KEY, certo text NOT NULL) ON COMMIT DROP;
INSERT INTO pares_cp850 (errado, certo) VALUES
  -- minúsculas e maiúsculas acentuadas (C3 xx)
  ('├á', 'à'), ('├í', 'á'), ('├ó', 'â'), ('├ú', 'ã'), ('├ñ', 'ä'), ('├º', 'ç'), ('├¿', 'è'), ('├®', 'é'),
  ('├¬', 'ê'), ('├¡', 'í'), ('├«', 'î'), ('├│', 'ó'), ('├┤', 'ô'), ('├Á', 'õ'), ('├║', 'ú'), ('├╗', 'û'),
  ('├╝', 'ü'), ('├Ç', 'À'), ('├ü', 'Á'), ('├é', 'Â'), ('├â', 'Ã'), ('├ä', 'Ä'), ('├ç', 'Ç'), ('├ë', 'É'),
  ('├è', 'Ê'), ('├ì', 'Í'), ('├ô', 'Ó'), ('├ö', 'Ô'), ('├ò', 'Õ'), ('├Ü', 'Ú'),
  -- símbolos técnicos (C2 xx e CE A9)
  ('┬░', '°'), ('┬║', 'º'), ('┬¬', 'ª'), ('┬▓', '²'), ('┬│', '³'), ('┬Á', 'µ'), ('┬À', '·'), ('┬¢', '½'),
  ('╬®', 'Ω'),
  -- pontuação (E2 80 xx)
  ('ÔÇô', '–'), ('ÔÇö', '—'), ('ÔÇ£', '“'), ('ÔÇØ', '”'), ('ÔÇÿ', '‘'), ('ÔÇÖ', '’'), ('ÔÇª', '…');

-- Sobra de CP850: desenho de caixa e bloco (U+2500 a U+259F) ou o "ÔÇ" da pontuação
CREATE FUNCTION pg_temp.tem_cp850(t text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT t ~ '[─-▟]|ÔÇ'
$$;

CREATE FUNCTION pg_temp.sem_cp850(t text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  par record;
BEGIN
  IF t IS NULL OR NOT pg_temp.tem_cp850(t) THEN
    RETURN t;
  END IF;
  FOR par IN SELECT errado, certo FROM pares_cp850 LOOP
    t := replace(t, par.errado, par.certo);
  END LOOP;
  RETURN t;
END $$;

-- O nome como a importação o compara: sem caixa, sem acento, sem espaço sobrando
CREATE FUNCTION pg_temp.chave(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(translate(lower(t), 'àáâãäçèéêëìíîïòóôõöùúûü', 'aaaaaceeeeiiiiooooouuuu'))
$$;

CREATE TEMP VIEW correcoes AS
  SELECT 'categoria' AS onde, trim(id) AS id, nome AS hoje, pg_temp.sem_cp850(nome) AS depois
    FROM categorias_equipamentos WHERE pg_temp.tem_cp850(nome)
  UNION ALL
  SELECT 'modelo', trim(id), nome, pg_temp.sem_cp850(nome)
    FROM tipos_equipamentos WHERE pg_temp.tem_cp850(nome)
  UNION ALL
  SELECT 'fabricante', trim(id), fabricante, pg_temp.sem_cp850(fabricante)
    FROM tipos_equipamentos WHERE pg_temp.tem_cp850(fabricante);

\echo 'O que muda (hoje -> depois):'
SELECT onde, id, hoje, depois FROM correcoes ORDER BY onde, hoje;

-- Par que não está na tabela: ninguém sabe o caractere de origem, então não se adivinha
SELECT count(*) > 0 AS sobrou_desconhecido FROM correcoes WHERE pg_temp.tem_cp850(depois) \gset
\if :sobrou_desconhecido
  \echo 'Sobra de CP850 fora dos pares conhecidos (coluna depois):'
  SELECT onde, id, hoje, depois FROM correcoes WHERE pg_temp.tem_cp850(depois);
  DO $$ BEGIN RAISE EXCEPTION 'PAROU: texto com CP850 fora dos pares conhecidos. Nada foi alterado.'; END $$;
\endif

-- Categoria cujo nome corrigido já existe em outra (mesmo sem acento ou caixa): juntar é decisão, não correção
\echo 'Categorias que ficariam com o nome de outra:'
SELECT c.id, c.hoje, c.depois, trim(o.id) AS outra_id, o.nome AS outra
  FROM correcoes c
  JOIN categorias_equipamentos o ON pg_temp.chave(o.nome) = pg_temp.chave(c.depois) AND trim(o.id) <> c.id
 WHERE c.onde = 'categoria';
SELECT count(*) > 0 AS colide FROM correcoes c
  JOIN categorias_equipamentos o ON pg_temp.chave(o.nome) = pg_temp.chave(c.depois) AND trim(o.id) <> c.id
 WHERE c.onde = 'categoria' \gset
\if :colide
  DO $$ BEGIN RAISE EXCEPTION 'PAROU: o nome corrigido de uma categoria já existe em outra (lista acima). Nada foi alterado.'; END $$;
\endif

-- Só informação: o nome e o fabricante copiados do modelo para o equipamento ficam como estão (equipamentos
-- sincronizam com o NexOn: corrigir lá é outra decisão)
\echo 'Equipamentos com nome ou fabricante em CP850 (não mudam aqui):'
SELECT count(*) AS equipamentos FROM equipamentos
 WHERE deleted_at IS NULL AND (pg_temp.tem_cp850(nome) OR pg_temp.tem_cp850(fabricante));

\if :aplicar
  UPDATE categorias_equipamentos SET nome = pg_temp.sem_cp850(nome) WHERE pg_temp.tem_cp850(nome);
  UPDATE tipos_equipamentos
     SET nome = pg_temp.sem_cp850(nome), fabricante = pg_temp.sem_cp850(fabricante), updated_at = now()
   WHERE pg_temp.tem_cp850(nome) OR pg_temp.tem_cp850(fabricante);
  SELECT (SELECT count(*) FROM categorias_equipamentos WHERE pg_temp.tem_cp850(nome))
       + (SELECT count(*) FROM tipos_equipamentos WHERE pg_temp.tem_cp850(nome) OR pg_temp.tem_cp850(fabricante)) > 0 AS restam \gset
  \if :restam
    DO $$ BEGIN RAISE EXCEPTION 'PAROU: sobrou texto corrompido depois do UPDATE. Nada foi alterado.'; END $$;
  \endif
  COMMIT;
  \echo 'Aplicado.'
\else
  ROLLBACK;
  \echo 'Prévia: nada foi alterado. Para gravar: -v aplicar=1'
\endif
