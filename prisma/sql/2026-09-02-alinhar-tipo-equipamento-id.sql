-- Alinha planos_manutencao.equipamento_id com equipamentos.id
--
-- PROBLEMA
-- equipamentos.id                  eh character(26)  -> o Postgres completa com
--                                                       espaco ate 26
-- planos_manutencao.equipamento_id eh character varying(26) -> guarda o que
--                                                       mandaram, com ou sem
--
-- Em SQL o JOIN casa nos dois casos: o Postgres ignora espaco a direita ao
-- comparar char. Mas o Prisma resolve a RELACAO em JavaScript, depois de trazer
-- as duas pontas, e ali '...xpfqi ' nao eh igual a '...xpfqi'. O resultado eh
-- `equipamento: null` calado.
--
-- Medido em DEV (2026-09-02):
--   JOIN em SQL          casa 23 de 23
--   include do Prisma    casa  7 de 23   <- 16 planos perdem o equipamento
--   equipamento_id       8 linhas com padding, 16 sem  (a coluna tem as DUAS formas)
--
-- Eh a UNICA divergencia desse tipo no banco. Conferido coluna a coluna: as
-- outras 12 FKs varchar(26) apontam para PKs varchar ou text, onde nao ha
-- padding e o problema nao existe.
--
-- Ate aqui o codigo contorna caso a caso — `hidratarEquipamentos` compara com
-- trim dos dois lados, e `planoAHerdar` procura as duas formas. Cada consulta
-- nova precisa lembrar do contorno, e esquecer nao da erro: da resultado vazio.
--
-- POR QUE CHAR E NAO TRIM NOS DADOS
-- Trimar as 8 linhas resolve hoje e volta amanha: qualquer escrita que passe o
-- id lido de uma coluna char reintroduz o padding. Alinhar o TIPO faz as duas
-- pontas chegarem iguais ao JavaScript, e o include do Prisma passa a funcionar
-- sozinho.
--
-- DEPOIS DE APLICAR, no mesmo deploy:
--   prisma/schema.prisma, model planos_manutencao:
--     equipamento_id String? @db.VarChar(26)   ->   @db.Char(26)
--   senao `prisma migrate diff` acusa deriva permanente.
--
-- Idempotente: o DO so age se a coluna ainda for varchar.

-- Antes de aplicar, para registro:
--   SELECT count(*) FILTER (WHERE equipamento_id <> btrim(equipamento_id)) AS com_padding,
--          count(*) FILTER (WHERE equipamento_id IS NOT NULL)              AS total
--   FROM planos_manutencao WHERE deleted_at IS NULL;
--
-- RISCO QUE O PROPRIO @unique REVELA
-- A coluna tem indice unico, mas em VARCHAR 'xpfqi' e 'xpfqi ' sao valores
-- DIFERENTES — a mesma id de equipamento gravada uma vez com padding e outra
-- vez sem escaparia da unicidade hoje, como dois planos "diferentes" para o
-- mesmo equipamento. Depois do ALTER as duas formas colapsam na mesma string
-- CHAR(26), e o proprio ALTER falharia com violacao de unicidade — mas so
-- DEPOIS de já ter travado a tabela. O bloco abaixo checa isso ANTES e aborta
-- com mensagem clara se houver colisao, em vez de deixar o Postgres estourar
-- um erro generico de indice no meio do ALTER.
DO $$
DECLARE
  v_colisoes INT;
BEGIN
  SELECT count(*) INTO v_colisoes FROM (
    SELECT btrim(equipamento_id) AS eq
    FROM planos_manutencao
    WHERE equipamento_id IS NOT NULL
    GROUP BY btrim(equipamento_id)
    HAVING count(*) > 1
  ) x;

  IF v_colisoes > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: % equipamento(s) com mais de um plano quando comparado sem padding — '
      'resolver a duplicata (ver SELECT no comentario acima) antes de rodar este arquivo de novo',
      v_colisoes;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'planos_manutencao'
      AND column_name  = 'equipamento_id'
      AND data_type    = 'character varying'
  ) THEN
    ALTER TABLE planos_manutencao
      ALTER COLUMN equipamento_id TYPE CHAR(26);
    RAISE NOTICE 'planos_manutencao.equipamento_id -> CHAR(26)';
  ELSE
    RAISE NOTICE 'planos_manutencao.equipamento_id ja esta alinhada, nada a fazer';
  END IF;
END $$;

-- Conferencia: os dois numeros tem de bater depois.
--   SELECT count(*) AS total,
--          count(e.id) AS com_equipamento
--   FROM planos_manutencao pm
--   LEFT JOIN equipamentos e ON pm.equipamento_id = e.id
--   WHERE pm.deleted_at IS NULL AND pm.equipamento_id IS NOT NULL;
