-- ====================================================================
-- UPDATE FINAL - USANDO TRIM E CHAR(26)
-- ====================================================================

-- LIMPAR TODOS OS TIPOS PRIMEIRO (para debug)
-- UPDATE equipamentos SET tipo_equipamento_id = NULL WHERE classificacao = 'UC';

-- 1. INVERSORES
UPDATE equipamentos
SET tipo_equipamento_id = RPAD('01JAQTE1INVERSOR000000005', 26, ' ')
WHERE classificacao = 'UC'
  AND LOWER(nome) LIKE '%inversor%';

-- 2. TRANSFORMADORES
UPDATE equipamentos
SET tipo_equipamento_id = RPAD('01JAQTE1TRANSFORMADOR00007', 26, ' ')
WHERE classificacao = 'UC'
  AND LOWER(nome) LIKE '%transformador%';

-- 3. STRING BOX → DISJUNTOR
UPDATE equipamentos
SET tipo_equipamento_id = RPAD('01JAQTE1DISJUNTOR0000008', 26, ' ')
WHERE classificacao = 'UC'
  AND LOWER(nome) LIKE '%string%';

-- 4. QUADRO → DISJUNTOR
UPDATE equipamentos
SET tipo_equipamento_id = RPAD('01JAQTE1DISJUNTOR0000008', 26, ' ')
WHERE classificacao = 'UC'
  AND LOWER(nome) LIKE '%quadro%';

-- 5. MOTOR
UPDATE equipamentos
SET tipo_equipamento_id = RPAD('01JAQTE1MOTOR000000000017', 26, ' ')
WHERE classificacao = 'UC'
  AND LOWER(nome) LIKE '%motor%';

-- 6. MEDIDOR
UPDATE equipamentos
SET tipo_equipamento_id = RPAD('01JAQTE1MEDIDOR00000001', 26, ' ')
WHERE classificacao = 'UC'
  AND (LOWER(nome) LIKE '%medidor%' OR LOWER(tipo_equipamento) LIKE '%medidor%');

-- 7. M160
UPDATE equipamentos
SET tipo_equipamento_id = RPAD('01JAQTE1M16000000000002', 26, ' ')
WHERE classificacao = 'UC'
  AND (LOWER(nome) LIKE '%m160%' OR LOWER(modelo) LIKE '%m160%');

-- 8. M300
UPDATE equipamentos
SET tipo_equipamento_id = RPAD('01JAQTE1M30000000000003', 26, ' ')
WHERE classificacao = 'UC'
  AND (LOWER(nome) LIKE '%m300%' OR LOWER(modelo) LIKE '%m300%');

-- 9. LANDIS GYR
UPDATE equipamentos
SET tipo_equipamento_id = RPAD('01JAQTE1LANDIS_E750000004', 26, ' ')
WHERE classificacao = 'UC'
  AND (LOWER(nome) LIKE '%landis%' OR LOWER(nome) LIKE '%e750%');

-- 10. A966
UPDATE equipamentos
SET tipo_equipamento_id = RPAD('01JAQTE1A96600000000013', 26, ' ')
WHERE classificacao = 'UC'
  AND (LOWER(nome) LIKE '%a966%' OR LOWER(nome) LIKE '%a-966%');

-- 11. CAPACITOR
UPDATE equipamentos
SET tipo_equipamento_id = RPAD('01JAQTE1CAPACITOR00000018', 26, ' ')
WHERE classificacao = 'UC'
  AND LOWER(nome) LIKE '%capacitor%';

-- VERIFICAÇÃO FINAL
SELECT
  COUNT(CASE WHEN tipo_equipamento_id IS NOT NULL THEN 1 END) as com_tipo,
  COUNT(CASE WHEN tipo_equipamento_id IS NULL THEN 1 END) as sem_tipo,
  COUNT(*) as total_uc
FROM equipamentos
WHERE classificacao = 'UC';
