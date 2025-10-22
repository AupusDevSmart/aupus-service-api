-- ============================================
-- MIGRATION DATA SCRIPT
-- Execute ANTES de aplicar o schema com prisma db push
-- ============================================

-- DADOS EXISTENTES:
-- - 3 equipamentos_diagrama
-- - 6 unidades_nexon

BEGIN;

-- ============================================
-- PASSO 1: Migrar unidades_nexon para unidades
-- ============================================

-- Criar tabela unidades (se não existir)
CREATE TABLE IF NOT EXISTS unidades (
  id CHAR(26) PRIMARY KEY,
  planta_id CHAR(26) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  estado VARCHAR(2) NOT NULL,
  cidade VARCHAR(100) NOT NULL,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  potencia DECIMAL(10, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ativo',
  pontos_medicao JSON,
  created_at TIMESTAMP(0) DEFAULT NOW(),
  updated_at TIMESTAMP(0) DEFAULT NOW(),
  deleted_at TIMESTAMP(0)
);

-- Verificar quantas plantas existem
DO $$
DECLARE
  plantas_count INTEGER;
  planta_padrao_id CHAR(26);
BEGIN
  SELECT COUNT(*) INTO plantas_count FROM plantas;

  IF plantas_count = 0 THEN
    RAISE EXCEPTION 'Nenhuma planta encontrada! Crie pelo menos uma planta antes de migrar.';
  END IF;

  -- Pegar ID da primeira planta como padrão
  SELECT id INTO planta_padrao_id FROM plantas ORDER BY created_at ASC LIMIT 1;

  -- Migrar unidades_nexon para unidades
  -- Associando todas à primeira planta (você pode ajustar essa lógica)
  INSERT INTO unidades (
    id,
    planta_id,
    nome,
    tipo,
    estado,
    cidade,
    latitude,
    longitude,
    potencia,
    status,
    pontos_medicao,
    created_at,
    updated_at,
    deleted_at
  )
  SELECT
    un.id,
    planta_padrao_id, -- Todas vão para a primeira planta
    un.nome,
    un.tipo::text, -- Cast do enum
    un.estado,
    un.cidade,
    un.latitude,
    un.longitude,
    un.potencia,
    un.status::text, -- Cast do enum
    un.pontos_medicao,
    un.created_at,
    un.updated_at,
    un.deleted_at
  FROM unidades_nexon un
  WHERE NOT EXISTS (SELECT 1 FROM unidades u WHERE u.id = un.id);

  RAISE NOTICE 'Migradas % unidades para planta %', (SELECT COUNT(*) FROM unidades), planta_padrao_id;
END $$;

-- Criar índices (se não existirem)
CREATE INDEX IF NOT EXISTS idx_unidades_planta_id ON unidades(planta_id);
CREATE INDEX IF NOT EXISTS idx_unidades_tipo ON unidades(tipo);
CREATE INDEX IF NOT EXISTS idx_unidades_status ON unidades(status);
CREATE INDEX IF NOT EXISTS idx_unidades_estado ON unidades(estado);
CREATE INDEX IF NOT EXISTS idx_unidades_created_at ON unidades(created_at);
CREATE INDEX IF NOT EXISTS idx_unidades_deleted_at ON unidades(deleted_at);

-- ============================================
-- PASSO 2: Adicionar campos novos à tabela equipamentos
-- ============================================

ALTER TABLE equipamentos
  ADD COLUMN IF NOT EXISTS unidade_id CHAR(26),
  ADD COLUMN IF NOT EXISTS tipo_equipamento_id CHAR(26),
  ADD COLUMN IF NOT EXISTS diagrama_id CHAR(26),
  ADD COLUMN IF NOT EXISTS tag VARCHAR(50),
  ADD COLUMN IF NOT EXISTS posicao_x REAL,
  ADD COLUMN IF NOT EXISTS posicao_y REAL,
  ADD COLUMN IF NOT EXISTS rotacao REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS largura_customizada INTEGER,
  ADD COLUMN IF NOT EXISTS altura_customizada INTEGER,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS propriedades JSON;

-- ============================================
-- PASSO 3: Migrar equipamentos_diagrama para equipamentos
-- ============================================

-- Inserir equipamentos que existem apenas em equipamentos_diagrama
INSERT INTO equipamentos (
  id,
  unidade_id,
  tipo_equipamento_id,
  diagrama_id,
  nome,
  tag,
  posicao_x,
  posicao_y,
  rotacao,
  largura_customizada,
  altura_customizada,
  status,
  propriedades,
  created_at,
  updated_at
)
SELECT
  ed.id,
  ed.unidade_id,
  ed.tipo_equipamento_id,
  ed.diagrama_id,
  ed.nome,
  ed.tag,
  ed.posicao_x,
  ed.posicao_y,
  COALESCE(ed.rotacao, 0),
  ed.largura_customizada,
  ed.altura_customizada,
  ed.status::text,
  ed.propriedades,
  ed.created_at,
  ed.updated_at
FROM equipamentos_diagrama ed
WHERE NOT EXISTS (
  SELECT 1 FROM equipamentos e WHERE e.id = ed.id
)
ON CONFLICT (id) DO NOTHING;

-- Atualizar equipamentos existentes que também estão em diagrama
UPDATE equipamentos e
SET
  unidade_id = ed.unidade_id,
  tipo_equipamento_id = ed.tipo_equipamento_id,
  diagrama_id = ed.diagrama_id,
  tag = ed.tag,
  posicao_x = ed.posicao_x,
  posicao_y = ed.posicao_y,
  rotacao = COALESCE(ed.rotacao, 0),
  largura_customizada = ed.largura_customizada,
  altura_customizada = ed.altura_customizada,
  status = ed.status::text,
  propriedades = COALESCE(ed.propriedades, e.propriedades),
  updated_at = NOW()
FROM equipamentos_diagrama ed
WHERE e.id = ed.id;

RAISE NOTICE 'Migrados equipamentos de diagrama';

-- ============================================
-- PASSO 4: Associar equipamentos antigos a unidades
-- ============================================

-- Equipamentos com planta_id mas sem unidade_id
-- Criar unidade padrão para cada planta que tiver equipamentos
INSERT INTO unidades (id, planta_id, nome, tipo, estado, cidade, latitude, longitude, potencia, status, created_at, updated_at)
SELECT
  'UNI-' || p.id as id,
  p.id,
  'Unidade Principal - ' || p.nome,
  'UFV',
  p.uf,
  p.cidade,
  CAST('-23.5505' AS DECIMAL(10,7)),
  CAST('-46.6333' AS DECIMAL(10,7)),
  CAST('1000' AS DECIMAL(10,2)),
  'ativo',
  NOW(),
  NOW()
FROM plantas p
WHERE EXISTS (
  SELECT 1 FROM equipamentos e
  WHERE e.planta_id = p.id AND e.unidade_id IS NULL
)
AND NOT EXISTS (SELECT 1 FROM unidades u WHERE u.id = 'UNI-' || p.id)
ON CONFLICT (id) DO NOTHING;

-- Associar equipamentos à unidade padrão da planta
UPDATE equipamentos e
SET unidade_id = 'UNI-' || e.planta_id
WHERE e.planta_id IS NOT NULL
  AND e.unidade_id IS NULL;

-- ============================================
-- PASSO 5: Verificações
-- ============================================

DO $$
DECLARE
  equipamentos_sem_unidade INTEGER;
  total_unidades INTEGER;
  total_equipamentos INTEGER;
BEGIN
  SELECT COUNT(*) INTO equipamentos_sem_unidade
  FROM equipamentos
  WHERE unidade_id IS NULL;

  SELECT COUNT(*) INTO total_unidades FROM unidades;
  SELECT COUNT(*) INTO total_equipamentos FROM equipamentos;

  RAISE NOTICE '===========================================';
  RAISE NOTICE 'VERIFICAÇÃO FINAL:';
  RAISE NOTICE 'Total de unidades: %', total_unidades;
  RAISE NOTICE 'Total de equipamentos: %', total_equipamentos;
  RAISE NOTICE 'Equipamentos sem unidade: %', equipamentos_sem_unidade;
  RAISE NOTICE '===========================================';

  IF equipamentos_sem_unidade > 0 THEN
    RAISE WARNING 'Ainda existem % equipamentos sem unidade!', equipamentos_sem_unidade;
  ELSE
    RAISE NOTICE '✓ Todos os equipamentos têm unidade associada!';
  END IF;
END $$;

COMMIT;

-- ============================================
-- ROLLBACK (em caso de erro)
-- ============================================
-- Se algo der errado, execute: ROLLBACK;
