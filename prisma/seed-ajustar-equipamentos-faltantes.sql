-- ====================================================================
-- AJUSTAR EQUIPAMENTOS QUE FICARAM SEM TIPO
-- ====================================================================

-- 1. TRANSFORMADORES - ajustar pattern
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1TRANSFORMADOR00007'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND nome LIKE '%Transformador%';

-- 2. STRING BOX → mapear para DISJUNTOR (representa quadro elétrico)
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1DISJUNTOR0000008'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND nome LIKE '%String Box%';

-- 3. QUADROS DE DISTRIBUIÇÃO → DISJUNTOR
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1DISJUNTOR0000008'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (nome LIKE '%Quadro%' OR nome LIKE '%QD%' OR nome LIKE '%Painel%');

-- 4. BANCO DE CAPACITORES → CAPACITOR
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1CAPACITOR00000018'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND nome LIKE '%Capacitor%';

-- 5. GERADORES → criar tipo GERADOR (caso exista)
-- Se não houver tipo GERADOR, mapear para INVERSOR temporariamente
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1INVERSOR000000005'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND nome LIKE '%Gerador%';

-- Verificar quantos ainda faltam
SELECT COUNT(*) as equipamentos_uc_sem_tipo
FROM equipamentos
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL;

-- Listar equipamentos sem tipo para análise
SELECT id, nome, fabricante, modelo, tipo_equipamento
FROM equipamentos
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
LIMIT 20;
