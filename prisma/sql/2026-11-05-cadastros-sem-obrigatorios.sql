-- ============================================================================
-- Planta e instalação sem campos obrigatórios (05/nov/2026)
--
-- Pedido do usuário: "muitas vezes não temos o CNPJ da planta ou informações do
-- tipo, como o CEP" — a equipe deixava de cadastrar. Por enquanto só o que
-- identifica o registro continua obrigatório (o nome da planta; o nome da
-- instalação e a planta dela); o resto volta a ser exigido aos poucos.
--
-- O banco do NexOn recebe o mesmo DROP NOT NULL (aupus-nexon-api, mesmo nome
-- de arquivo): planta e instalação vinculadas viajam pela sincronização com
-- todas as colunas, e o nulo travaria a entrega lá.
--
-- Aditivo e idempotente: DROP NOT NULL não mexe em linha nenhuma.
-- ORDEM DO DEPLOY (os dois produtos): este SQL no aupus_service E o do NexOn no
-- aupus, depois as DUAS APIs. Com só um lado novo, a planta vinculada salva sem
-- CNPJ/CEP/dono é recusada pelo client antigo do outro lado e a entrega da
-- sincronização fica em erro, repetindo, até o outro lado subir.
-- psql -d aupus_service -f prisma/sql/2026-11-05-cadastros-sem-obrigatorios.sql
-- ROLLBACK (só se nenhuma linha tiver nulo na coluna): SET NOT NULL de volta.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() NOT IN ('aupus_service', 'aupus_local', 'aupus_test') THEN
    RAISE EXCEPTION 'Script do banco do Service (aupus_service); este banco é %', current_database();
  END IF;
END $$;

-- Cada ALTER pega ACCESS EXCLUSIVE: atrás de uma transação aberta, desiste em 5 s
SET LOCAL lock_timeout = '5s';

ALTER TABLE plantas
  ALTER COLUMN cnpj DROP NOT NULL,
  ALTER COLUMN localizacao DROP NOT NULL,
  ALTER COLUMN horario_funcionamento DROP NOT NULL,
  ALTER COLUMN logradouro DROP NOT NULL,
  ALTER COLUMN cidade DROP NOT NULL,
  ALTER COLUMN uf DROP NOT NULL,
  ALTER COLUMN cep DROP NOT NULL,
  ALTER COLUMN proprietario_id DROP NOT NULL;

ALTER TABLE unidades
  ALTER COLUMN tipo DROP NOT NULL,
  ALTER COLUMN estado DROP NOT NULL,
  ALTER COLUMN cidade DROP NOT NULL,
  ALTER COLUMN latitude DROP NOT NULL,
  ALTER COLUMN longitude DROP NOT NULL,
  ALTER COLUMN potencia DROP NOT NULL;

COMMIT;
