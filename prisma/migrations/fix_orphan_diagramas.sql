-- Script para identificar e corrigir registros órfãos em diagramas_unitarios
-- Data: 2025-10-15

-- =====================================================
-- 1. IDENTIFICAR REGISTROS ÓRFÃOS
-- =====================================================

-- Listar diagramas com unidade_id que não existe em unidades
SELECT
  d.id,
  d.unidade_id,
  d.nome,
  d.created_at,
  'Unidade não existe' as problema
FROM diagramas_unitarios d
LEFT JOIN unidades u ON d.unidade_id = u.id
WHERE u.id IS NULL;

-- Contar quantos registros órfãos existem
SELECT COUNT(*) as total_orfaos
FROM diagramas_unitarios d
LEFT JOIN unidades u ON d.unidade_id = u.id
WHERE u.id IS NULL;

-- =====================================================
-- 2. OPÇÕES DE CORREÇÃO
-- =====================================================

-- OPÇÃO A: Deletar diagramas órfãos (CUIDADO: Perda de dados)
-- Descomente as linhas abaixo se quiser deletar

-- DELETE FROM diagramas_unitarios
-- WHERE id IN (
--   SELECT d.id
--   FROM diagramas_unitarios d
--   LEFT JOIN unidades u ON d.unidade_id = u.id
--   WHERE u.id IS NULL
-- );

-- OPÇÃO B: Soft delete (marcar como deletado)
-- Descomente as linhas abaixo se quiser fazer soft delete

-- UPDATE diagramas_unitarios
-- SET deleted_at = NOW()
-- WHERE id IN (
--   SELECT d.id
--   FROM diagramas_unitarios d
--   LEFT JOIN unidades u ON d.unidade_id = u.id
--   WHERE u.id IS NULL
-- );

-- OPÇÃO C: Verificar se existe alguma unidade válida para reassociar
-- Liste as unidades disponíveis
SELECT id, nome, tipo, status, created_at
FROM unidades
WHERE deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 10;

-- Se você tem uma unidade padrão, pode reassociar assim:
-- UPDATE diagramas_unitarios
-- SET unidade_id = 'ID_DA_UNIDADE_PADRAO'
-- WHERE id IN (
--   SELECT d.id
--   FROM diagramas_unitarios d
--   LEFT JOIN unidades u ON d.unidade_id = u.id
--   WHERE u.id IS NULL
-- );

-- =====================================================
-- 3. VERIFICAÇÃO ADICIONAL - EQUIPAMENTOS
-- =====================================================

-- Verificar equipamentos que referenciam diagramas que não existem
SELECT
  e.id,
  e.nome,
  e.diagrama_id,
  'Diagrama não existe' as problema
FROM equipamentos e
LEFT JOIN diagramas_unitarios d ON e.diagrama_id = d.id
WHERE e.diagrama_id IS NOT NULL
  AND d.id IS NULL;

-- Se houver equipamentos órfãos, limpar o diagrama_id
-- UPDATE equipamentos
-- SET diagrama_id = NULL,
--     posicao_x = NULL,
--     posicao_y = NULL
-- WHERE diagrama_id IS NOT NULL
--   AND diagrama_id NOT IN (SELECT id FROM diagramas_unitarios);

-- =====================================================
-- 4. INSTRUÇÕES
-- =====================================================

/*
PASSO A PASSO:

1. Execute este script para identificar o problema:
   psql -U seu_usuario -d aupus -f prisma/migrations/fix_orphan_diagramas.sql

2. Analise os resultados e escolha uma das opções (A, B ou C)

3. Descomente a opção escolhida e execute novamente

4. Após corrigir, execute:
   npx prisma db push

Se preferir fazer via linha de comando PostgreSQL:
*/
