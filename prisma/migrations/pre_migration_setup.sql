-- ============================================
-- PRE-MIGRATION SETUP
-- Execute ANTES de npx prisma db push
-- ============================================

BEGIN;

-- Criar tabela unidades temporária
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

-- Copiar dados de unidades_nexon para unidades
INSERT INTO unidades (
  id, planta_id, nome, tipo, estado, cidade, latitude, longitude,
  potencia, status, pontos_medicao, created_at, updated_at, deleted_at
)
SELECT
  id,
  (SELECT id FROM plantas ORDER BY created_at LIMIT 1), -- primeira planta
  nome,
  tipo::text,
  estado,
  cidade,
  latitude,
  longitude,
  potencia,
  status::text,
  pontos_medicao,
  created_at,
  updated_at,
  deleted_at
FROM unidades_nexon
WHERE NOT EXISTS (SELECT 1 FROM unidades u WHERE u.id = unidades_nexon.id)
ON CONFLICT (id) DO NOTHING;

-- Atualizar diagramas_unitarios para apontar para unidades
-- (os IDs são os mesmos, então não precisa mudar nada)

-- Adicionar campos de diagrama em equipamentos
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

-- Migrar dados de equipamentos_diagrama
INSERT INTO equipamentos (
  id, unidade_id, tipo_equipamento_id, diagrama_id, nome, tag,
  posicao_x, posicao_y, rotacao, largura_customizada, altura_customizada,
  status, propriedades, created_at, updated_at
)
SELECT
  id, unidade_id, tipo_equipamento_id, diagrama_id, nome, tag,
  posicao_x, posicao_y, rotacao, largura_customizada, altura_customizada,
  status::text, propriedades, created_at, updated_at
FROM equipamentos_diagrama
WHERE NOT EXISTS (SELECT 1 FROM equipamentos e WHERE e.id = equipamentos_diagrama.id)
ON CONFLICT (id) DO NOTHING;

COMMIT;

SELECT 'Pre-migration concluída!' as status,
       (SELECT COUNT(*) FROM unidades) as total_unidades,
       (SELECT COUNT(*) FROM equipamentos) as total_equipamentos;
