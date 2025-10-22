-- ====================================================================
-- SCRIPT PARA VINCULAR EQUIPAMENTOS EXISTENTES AOS TIPOS CORRETOS
-- ====================================================================
-- Este script atualiza os equipamentos UC (Unidade Consumidora) existentes
-- vinculando-os aos tipos_equipamentos correspondentes
--
-- Data: 2025-10-20
-- ====================================================================

-- 1. INVERSORES → tipo INVERSOR
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1INVERSOR000000005'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%inversor%' OR
    tipo_equipamento ILIKE '%inversor%' OR
    modelo ILIKE '%inversor%'
  );

-- 2. TRANSFORMADORES → tipo TRANSFORMADOR
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1TRANSFORMADOR00007'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%transformador%' OR
    tipo_equipamento ILIKE '%transformador%' OR
    modelo ILIKE '%transformador%'
  );

-- 3. MOTORES → tipo MOTOR
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1MOTOR000000000017'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%motor%' OR
    tipo_equipamento ILIKE '%motor%' OR
    modelo ILIKE '%motor%'
  );

-- 4. MEDIDORES → tipo MEDIDOR (genérico)
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1MEDIDOR00000001'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%medidor%' OR
    tipo_equipamento ILIKE '%medidor%' OR
    modelo ILIKE '%medidor%'
  );

-- 5. M160 → tipo M160
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1M16000000000002'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%m160%' OR
    tipo_equipamento ILIKE '%m160%' OR
    modelo ILIKE '%m160%' OR
    modelo ILIKE '%m-160%'
  );

-- 6. M300 → tipo M300
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1M30000000000003'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%m300%' OR
    tipo_equipamento ILIKE '%m300%' OR
    modelo ILIKE '%m300%' OR
    modelo ILIKE '%m-300%'
  );

-- 7. LANDIS GYR / E750 → tipo LANDIS_E750
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1LANDIS_E750000004'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%landis%' OR
    nome ILIKE '%e750%' OR
    tipo_equipamento ILIKE '%landis%' OR
    fabricante ILIKE '%landis%'
  );

-- 8. A966 / GATEWAY → tipo A966
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1A96600000000013'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%a966%' OR
    nome ILIKE '%a-966%' OR
    tipo_equipamento ILIKE '%a966%' OR
    tipo_equipamento ILIKE '%gateway%' OR
    modelo ILIKE '%a966%'
  );

-- 9. DISJUNTORES → tipo DISJUNTOR
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1DISJUNTOR0000008'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%disjuntor%' OR
    tipo_equipamento ILIKE '%disjuntor%' OR
    modelo ILIKE '%disjuntor%'
  );

-- 10. CHAVES → tipo CHAVE_FUSIVEL
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1CHAVE_FUSIVEL00011'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%chave%' OR
    tipo_equipamento ILIKE '%chave%'
  );

-- 11. PAINÉIS SOLARES → tipo PAINEL_SOLAR
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1PAINEL_SOLAR000006'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%painel solar%' OR
    nome ILIKE '%placa solar%' OR
    nome ILIKE '%módulo fotovoltaico%' OR
    tipo_equipamento ILIKE '%painel%'
  );

-- 12. STRING BOX / QUADROS → tipo DISJUNTOR (como proxy para quadro elétrico)
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1DISJUNTOR0000008'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%string box%' OR
    nome ILIKE '%quadro%' OR
    tipo_equipamento ILIKE '%quadro%'
  );

-- 13. CAPACITORES → tipo CAPACITOR
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1CAPACITOR00000018'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%capacitor%' OR
    tipo_equipamento ILIKE '%capacitor%'
  );

-- 14. BOTOEIRAS → tipo BOTOEIRA
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1BOTOEIRA000000014'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%botoeira%' OR
    tipo_equipamento ILIKE '%botoeira%'
  );

-- 15. TSA / SUBESTAÇÃO → tipo TSA
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1TSA0000000000009'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%tsa%' OR
    nome ILIKE '%subestação%' OR
    nome ILIKE '%subestacao%' OR
    tipo_equipamento ILIKE '%tsa%'
  );

-- 16. RETIFICADORES → tipo RETIFICADOR
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1RETIFICADOR000022'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%retificador%' OR
    tipo_equipamento ILIKE '%retificador%'
  );

-- 17. BANCO DE BATERIAS → tipo BANCO_BATERIAS
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1BANCO_BATERIAS0023'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%bateria%' OR
    nome ILIKE '%banco%bateria%' OR
    tipo_equipamento ILIKE '%bateria%'
  );

-- 18. RELÉS → tipo RELE
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1RELE000000000012'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%relé%' OR
    nome ILIKE '%rele%' OR
    tipo_equipamento ILIKE '%relé%' OR
    tipo_equipamento ILIKE '%rele%'
  );

-- 19. SCADA → tipo SCADA
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1SCADA000000000015'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%scada%' OR
    tipo_equipamento ILIKE '%scada%'
  );

-- 20. CFTV / CÂMERAS → tipo CFTV
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1CFTV000000000016'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND (
    nome ILIKE '%cftv%' OR
    nome ILIKE '%câmera%' OR
    nome ILIKE '%camera%' OR
    tipo_equipamento ILIKE '%cftv%'
  );

-- ====================================================================
-- VERIFICAÇÕES PÓS-UPDATE
-- ====================================================================

-- Contar equipamentos UC vinculados por tipo
SELECT
  te.nome as tipo_equipamento,
  te.codigo,
  COUNT(e.id) as quantidade
FROM tipos_equipamentos te
LEFT JOIN equipamentos e ON e.tipo_equipamento_id = te.id AND e.classificacao = 'UC'
GROUP BY te.id, te.nome, te.codigo
ORDER BY quantidade DESC;

-- Contar equipamentos UC ainda sem tipo
SELECT COUNT(*) as equipamentos_uc_sem_tipo
FROM equipamentos
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL;
