-- Migration: Add Diagramas Features
-- Description: Adiciona campos e tabelas para suporte completo a diagramas sinópticos
-- Date: 2025-10-15
-- Author: Claude Code

-- =====================================================
-- 1. Atualizar tabela diagramas_unitarios
-- =====================================================

-- Adicionar novos campos em diagramas_unitarios
ALTER TABLE diagramas_unitarios
ADD COLUMN IF NOT EXISTS configuracoes JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500) DEFAULT NULL;

-- Adicionar índice para deleted_at se não existir
CREATE INDEX IF NOT EXISTS idx_diagramas_unitarios_deleted_at ON diagramas_unitarios(deleted_at);

-- Adicionar default cuid() para id se necessário (caso registros antigos não tenham)
-- Nota: Isso pode não ser necessário se todos os registros já têm IDs

COMMENT ON COLUMN diagramas_unitarios.configuracoes IS 'Configurações do canvas em JSON (zoom, grid, canvasWidth, canvasHeight, etc.)';
COMMENT ON COLUMN diagramas_unitarios.thumbnail_url IS 'URL da thumbnail/preview do diagrama';

-- =====================================================
-- 2. Criar tabela equipamentos_conexoes
-- =====================================================

CREATE TABLE IF NOT EXISTS equipamentos_conexoes (
  id CHAR(26) PRIMARY KEY,
  diagrama_id CHAR(26) NOT NULL,
  equipamento_origem_id CHAR(26) NOT NULL,
  porta_origem VARCHAR(20) NOT NULL,
  equipamento_destino_id CHAR(26) NOT NULL,
  porta_destino VARCHAR(20) NOT NULL,
  tipo_linha VARCHAR(20) DEFAULT 'solida',
  cor VARCHAR(20) DEFAULT NULL,
  espessura INTEGER DEFAULT 2,
  pontos_intermediarios JSONB DEFAULT NULL,
  rotulo VARCHAR(100) DEFAULT NULL,
  ordem INTEGER DEFAULT NULL,
  created_at TIMESTAMP(0) DEFAULT NOW(),
  updated_at TIMESTAMP(0) DEFAULT NOW(),
  deleted_at TIMESTAMP(0) DEFAULT NULL,

  -- Constraints
  CONSTRAINT fk_conexoes_diagrama FOREIGN KEY (diagrama_id)
    REFERENCES diagramas_unitarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_conexoes_equipamento_origem FOREIGN KEY (equipamento_origem_id)
    REFERENCES equipamentos(id) ON DELETE CASCADE,
  CONSTRAINT fk_conexoes_equipamento_destino FOREIGN KEY (equipamento_destino_id)
    REFERENCES equipamentos(id) ON DELETE CASCADE,

  -- Validações
  CONSTRAINT chk_porta_origem CHECK (porta_origem IN ('top', 'bottom', 'left', 'right')),
  CONSTRAINT chk_porta_destino CHECK (porta_destino IN ('top', 'bottom', 'left', 'right')),
  CONSTRAINT chk_tipo_linha CHECK (tipo_linha IN ('solida', 'tracejada', 'pontilhada')),
  CONSTRAINT chk_espessura CHECK (espessura > 0 AND espessura <= 10)
);

-- Comentários
COMMENT ON TABLE equipamentos_conexoes IS 'Armazena as conexões/ligações entre equipamentos no diagrama sinóptico';
COMMENT ON COLUMN equipamentos_conexoes.porta_origem IS 'Ponto de conexão no equipamento de origem (top, bottom, left, right)';
COMMENT ON COLUMN equipamentos_conexoes.porta_destino IS 'Ponto de conexão no equipamento de destino (top, bottom, left, right)';
COMMENT ON COLUMN equipamentos_conexoes.pontos_intermediarios IS 'Array JSON de pontos {x, y} para linhas com curvas personalizadas';
COMMENT ON COLUMN equipamentos_conexoes.ordem IS 'Ordem de renderização da conexão (z-index)';

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_conexoes_diagrama ON equipamentos_conexoes(diagrama_id);
CREATE INDEX IF NOT EXISTS idx_conexoes_origem ON equipamentos_conexoes(equipamento_origem_id);
CREATE INDEX IF NOT EXISTS idx_conexoes_destino ON equipamentos_conexoes(equipamento_destino_id);
CREATE INDEX IF NOT EXISTS idx_conexoes_deleted ON equipamentos_conexoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_conexoes_diagrama_ativo ON equipamentos_conexoes(diagrama_id, deleted_at);

-- =====================================================
-- 3. Adicionar trigger para updated_at (se não existir)
-- =====================================================

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para diagramas_unitarios (se não existir)
DROP TRIGGER IF EXISTS update_diagramas_unitarios_updated_at ON diagramas_unitarios;
CREATE TRIGGER update_diagramas_unitarios_updated_at
  BEFORE UPDATE ON diagramas_unitarios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger para equipamentos_conexoes
DROP TRIGGER IF EXISTS update_equipamentos_conexoes_updated_at ON equipamentos_conexoes;
CREATE TRIGGER update_equipamentos_conexoes_updated_at
  BEFORE UPDATE ON equipamentos_conexoes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4. Dados de exemplo (opcional - comentado)
-- =====================================================

-- COMENTADO: Descomentar se quiser inserir dados de exemplo

-- -- Exemplo de diagrama
-- INSERT INTO diagramas_unitarios (id, unidade_id, nome, versao, ativo, configuracoes)
-- VALUES (
--   'diag_example_001',
--   'sua_unidade_id_aqui',
--   'Diagrama Principal',
--   '1.0',
--   true,
--   '{"zoom": 1.0, "grid": {"enabled": true, "size": 20}, "canvasWidth": 2000, "canvasHeight": 1500}'::jsonb
-- )
-- ON CONFLICT (id) DO NOTHING;

-- -- Exemplo de conexão entre equipamentos
-- INSERT INTO equipamentos_conexoes (id, diagrama_id, equipamento_origem_id, porta_origem, equipamento_destino_id, porta_destino, tipo_linha, cor, espessura)
-- VALUES (
--   'conn_example_001',
--   'diag_example_001',
--   'equip_origem_id',
--   'right',
--   'equip_destino_id',
--   'left',
--   'solida',
--   '#22c55e',
--   2
-- )
-- ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 5. Verificações finais
-- =====================================================

-- Verificar se a tabela foi criada corretamente
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'equipamentos_conexoes') THEN
    RAISE NOTICE 'Tabela equipamentos_conexoes criada com sucesso!';
  ELSE
    RAISE EXCEPTION 'ERRO: Tabela equipamentos_conexoes não foi criada!';
  END IF;
END $$;

-- Listar colunas adicionadas
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'diagramas_unitarios'
  AND column_name IN ('configuracoes', 'thumbnail_url')
ORDER BY column_name;

-- Listar todas as constraints da nova tabela
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_name = 'equipamentos_conexoes'
ORDER BY tc.constraint_type, tc.constraint_name;

-- =====================================================
-- FIM DA MIGRATION
-- =====================================================

-- Para executar esta migration:
-- psql -U seu_usuario -d seu_banco -f 20251015_add_diagramas_features.sql

-- Ou via Prisma:
-- npx prisma db push --skip-generate
