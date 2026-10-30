-- ============================================================================
-- Logística automática da proposta (30/out/2026)
--
-- Pedido do usuário: calcular sozinho o máximo da logística. O km de ida é o de
-- volta (a ida e volta passa a ser sempre o dobro); entra o deslocamento interno
-- (km da obra; vazio = 10% da ida e volta); e os padrões de custo:
--   km R$ 2,50; 1h30 de viagem a cada 100 km; café R$ 10, almoço R$ 20, jantar
--   R$ 20 e pernoite R$ 100 por pessoa; 1 veículo a cada 4 pessoas; bate-volta
--   (sem pernoite) enquanto a ida não passa de 2 h; 2 pessoas quando ninguém diz.
-- As linhas automáticas (o km dos veículos, café, almoço, jantar e pernoite)
-- acompanham o planejamento; a que a pessoa ajusta à mão deixa de acompanhar.
--
-- 1. padroes_da_proposta: os padrões da logística (os valores do usuário).
-- 2. solicitacoes_servico: o deslocamento interno e se a logística é automática.
--    A que já tem deslocamento ou diária digitados NÃO liga sozinha: ganharia as
--    automáticas por cima das digitadas (a logística em dobro). A tela oferece
--    ligar; as outras e as novas nascem ligadas.
-- 3. solicitacoes_logistica: a chave da linha automática e se ela foi ajustada,
--    com uma linha só por chave em cada solicitação (índice fora do schema: o
--    Prisma não modela índice parcial; ver prisma/TABELAS-FORA-DO-SCHEMA.md).
--
-- Aditivo e idempotente. Aplicar ANTES de subir a API nova.
-- ROLLBACK: DROP INDEX IF EXISTS solicitacoes_logistica_automatica_key;
--   ALTER TABLE solicitacoes_logistica DROP COLUMN IF EXISTS automatica, DROP COLUMN IF EXISTS ajustada;
--   ALTER TABLE solicitacoes_servico DROP COLUMN IF EXISTS deslocamento_interno_km, DROP COLUMN IF EXISTS logistica_automatica;
--   ALTER TABLE padroes_da_proposta DROP COLUMN IF EXISTS valor_km, ... (as colunas abaixo).
-- ============================================================================

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() NOT IN ('aupus_service', 'aupus_local', 'aupus_test') THEN
    RAISE EXCEPTION 'Script do banco do Service (aupus_service); este banco é %', current_database();
  END IF;
END $$;

BEGIN;

-- Cada ALTER pega ACCESS EXCLUSIVE: atrás de uma transação aberta, desiste em 5 s
-- (e nada fica) em vez de enfileirar a lista de solicitações
SET LOCAL lock_timeout = '5s';

ALTER TABLE padroes_da_proposta
  ADD COLUMN IF NOT EXISTS valor_km            NUMERIC(14,4) NOT NULL DEFAULT 2.5000,
  ADD COLUMN IF NOT EXISTS horas_por_100_km    NUMERIC(5,2)  NOT NULL DEFAULT 1.50,
  ADD COLUMN IF NOT EXISTS interno_percentual  NUMERIC(6,3)  NOT NULL DEFAULT 10.000,
  ADD COLUMN IF NOT EXISTS cafe_valor          NUMERIC(14,2) NOT NULL DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS almoco_valor        NUMERIC(14,2) NOT NULL DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS jantar_valor        NUMERIC(14,2) NOT NULL DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS pernoite_valor      NUMERIC(14,2) NOT NULL DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS pessoas_por_veiculo SMALLINT      NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS bate_volta_horas    NUMERIC(5,2)  NOT NULL DEFAULT 2.00,
  ADD COLUMN IF NOT EXISTS pessoas_padrao      SMALLINT      NOT NULL DEFAULT 2;

ALTER TABLE solicitacoes_servico
  ADD COLUMN IF NOT EXISTS deslocamento_interno_km NUMERIC(10,2) NULL;

-- Só na primeira vez (rodar de novo não religa a que a pessoa deixou desligada)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'solicitacoes_servico' AND column_name = 'logistica_automatica') THEN
    ALTER TABLE solicitacoes_servico ADD COLUMN logistica_automatica BOOLEAN NOT NULL DEFAULT FALSE;
    UPDATE solicitacoes_servico s SET logistica_automatica = TRUE
     WHERE NOT EXISTS (SELECT 1 FROM solicitacoes_logistica l
                        WHERE l.solicitacao_id = s.id AND l.tabela IN ('DESLOCAMENTO', 'DIARIA'));
    ALTER TABLE solicitacoes_servico ALTER COLUMN logistica_automatica SET DEFAULT TRUE;
  END IF;
END $$;

ALTER TABLE solicitacoes_logistica
  ADD COLUMN IF NOT EXISTS automatica VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS ajustada   BOOLEAN     NOT NULL DEFAULT FALSE;

-- Uma linha só por chave: duas "Almoço" automáticas somariam o almoço duas vezes
CREATE UNIQUE INDEX IF NOT EXISTS solicitacoes_logistica_automatica_key
  ON solicitacoes_logistica (solicitacao_id, automatica)
  WHERE automatica IS NOT NULL;

COMMIT;
