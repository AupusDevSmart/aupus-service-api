-- Cadastro de maquinários (SN-84, 2026-10-20)
--
-- Decisão do usuário (20/out/2026): o Service tem o cadastro de maquinários
-- do AupusProject, com os mesmos campos (as planilhas de um importam no
-- outro). Máquina que uma instrução usa: betoneira, munck, retroescavadeira,
-- gerador. Não é recurso: tem cadastro e tela próprios, e a mesma regra de
-- custo do instrumento (amortização na diária do próprio).
--
--   tipo:          proprio | locacao
--   base_calculo:  diaria | hora | km | fechado (padrão: diaria)
--   rubrica:       a do orçamento (padrão: instrucoes no próprio, terceirizados na locação)
--
-- Não está na sincronização com o NexOn. Só cria (tabela nova).
--
-- PRÉVIA POR PADRÃO: cria e desfaz (ROLLBACK). Grava só com -v aplicar=1.
--
--   psql -f 2026-10-20-maquinarios.sql               (prévia)
--   psql -v aplicar=1 -f 2026-10-20-maquinarios.sql  (grava)
--
-- ANTES do restart da API nova (a tela e as rotas leem a tabela). Idempotente.

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

CREATE TABLE IF NOT EXISTS public.maquinarios (
  id                    CHAR(26)      PRIMARY KEY,
  nome                  VARCHAR(255)  NOT NULL,
  tipo                  VARCHAR(20)   NOT NULL,
  descricao             TEXT,
  base_calculo          VARCHAR(20)   NOT NULL DEFAULT 'diaria',
  rubrica               VARCHAR(20)   NOT NULL DEFAULT 'instrucoes',
  preco_unitario        DECIMAL(12, 2),
  valor_aquisicao       DECIMAL(12, 2),
  prazo_retorno_meses   SMALLINT,
  custos_anuais         DECIMAL(12, 2) NOT NULL DEFAULT 0,
  meta_utilizacao_horas DECIMAL(10, 2),
  horas_por_diaria      SMALLINT      NOT NULL DEFAULT 8,
  ativo                 BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMP(0)  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMP(0)  NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMP(0),
  CONSTRAINT maquinarios_tipo_valido CHECK (tipo IN ('proprio', 'locacao')),
  CONSTRAINT maquinarios_base_calculo_valida CHECK (base_calculo IN ('diaria', 'hora', 'km', 'fechado')),
  CONSTRAINT maquinarios_rubrica_valida
    CHECK (rubrica IN ('instrucoes', 'materiais', 'veiculos', 'combustivel', 'diarias', 'terceirizados')),
  CONSTRAINT maquinarios_horas_por_diaria_valida CHECK (horas_por_diaria BETWEEN 1 AND 24),
  CONSTRAINT maquinarios_prazo_retorno_valido CHECK (prazo_retorno_meses IS NULL OR prazo_retorno_meses BETWEEN 1 AND 600)
);

-- 255, como no AupusProject (a tabela criada antes com 200 passa a 255)
ALTER TABLE public.maquinarios ALTER COLUMN nome TYPE VARCHAR(255);

-- O nome não se repete entre os não removidos (é por ele que a planilha e a instrução casam)
CREATE UNIQUE INDEX IF NOT EXISTS maquinarios_nome_unico ON public.maquinarios (lower(nome)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS maquinarios_tipo_idx ON public.maquinarios (tipo);
CREATE INDEX IF NOT EXISTS maquinarios_deleted_at_idx ON public.maquinarios (deleted_at);

\echo 'Conferência: as colunas e as regras da tabela nova'
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'maquinarios'
 ORDER BY ordinal_position;
SELECT conname FROM pg_constraint WHERE conrelid = 'public.maquinarios'::regclass ORDER BY conname;

\if :aplicar
COMMIT;
\echo 'Gravado.'
\else
ROLLBACK;
\echo 'Prévia: nada foi gravado. Para gravar: psql -v aplicar=1 -f 2026-10-20-maquinarios.sql'
\endif
