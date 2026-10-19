-- Garantia do equipamento (SN-66, 2026-10-19)
--
-- Até quando o equipamento (ou o componente) está em garantia: uma data de
-- calendário, como data_instalacao. A leitura avisa a garantia vencida ou
-- vencendo. Fornecedor, centro de custo e data de instalação já existiam no
-- banco e passam a aparecer no sheet; só esta coluna é nova.
--
-- Só acrescenta uma coluna anulável. Não apaga nem altera dado. Idempotente.
-- A sincronização com o NexOn descarta coluna que o outro lado não tem
-- (filtrarParaEsteBanco), e o que vem do NexOn sem ela não a apaga. Antes do
-- restart da API nova: sem a coluna, abrir, listar e salvar equipamento dão
-- 500. Se parar no lock_timeout, não reiniciar a API: rodar de novo.
--
--   psql -f 2026-10-19-garantia-do-equipamento.sql

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() NOT IN ('aupus_service', 'aupus_local', 'aupus_test') THEN
    RAISE EXCEPTION 'Script do banco do Service (aupus_service); este banco é %', current_database();
  END IF;
END $$;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS garantia_ate DATE;

COMMIT;

-- Conferência: IF NOT EXISTS pula calado o que já existe com outra forma
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'equipamentos'
   AND column_name IN ('data_instalacao', 'garantia_ate', 'fornecedor', 'centro_custo')
 ORDER BY 1;
