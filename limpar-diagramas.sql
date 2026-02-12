-- ============================================================================
-- SCRIPT: Limpar Diagramas, Conexões e Posições de Equipamentos
-- Descrição: Remove TUDO relacionado a diagramas para migração limpa V2
-- Data: 2026-02-09
-- IMPORTANTE: Este script remove todos os diagramas e posições!
-- ============================================================================

BEGIN;

-- 1. Deletar todas as conexões (foreign key para diagramas e equipamentos)
DELETE FROM equipamentos_conexoes;

-- 2. Deletar todos os diagramas
DELETE FROM diagramas_unitarios;

-- 3. Limpar TODAS as posições e rotações dos equipamentos
--    (Remove vinculação com diagramas E posições antigas)
UPDATE equipamentos 
SET 
  diagrama_id = NULL,
  posicao_x = NULL,
  posicao_y = NULL,
  rotacao = 0,
  label_position = 'top',
  label_offset_x = NULL,
  label_offset_y = NULL
WHERE 
  diagrama_id IS NOT NULL 
  OR posicao_x IS NOT NULL 
  OR posicao_y IS NOT NULL;

-- 4. Verificar resultado final
SELECT 
  (SELECT COUNT(*) FROM equipamentos_conexoes) as conexoes_restantes,
  (SELECT COUNT(*) FROM diagramas_unitarios) as diagramas_restantes,
  (SELECT COUNT(*) FROM equipamentos WHERE diagrama_id IS NOT NULL) as eq_em_diagrama,
  (SELECT COUNT(*) FROM equipamentos WHERE posicao_x IS NOT NULL OR posicao_y IS NOT NULL) as eq_com_posicao;

COMMIT;

-- ============================================================================
-- RESULTADO ESPERADO: Todos os valores devem ser 0
-- ============================================================================
