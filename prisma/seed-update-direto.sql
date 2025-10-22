-- UPDATE DIRETO PARA EQUIPAMENTOS ESPECÍFICOS

-- 1. Transformador Principal
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1TRANSFORMADOR00007'
WHERE id = 'jp8bqytvd9v2893vpus7mvxv  ';

-- 2. Todas as String Boxes
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1DISJUNTOR0000008'
WHERE id IN (
  'rvdfqjf91jid4ril429p6ua9  ',
  'yowshjfd7ci7x5dm3rm8uw4l  ',
  'nf78jrc4184emr4sw04ofk7i  ',
  'fjp75xn3r4rzcc64cdrymb1o  ',
  'tqyrfs5cx6p0fikebshpvwgn  '
);

-- 3. Quadro Distribuição
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1DISJUNTOR0000008'
WHERE nome LIKE 'Quadro Distribuição%';

-- 4. Atualizar TODOS transformadores (usar ILIKE para case-insensitive)
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1TRANSFORMADOR00007'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND nome ILIKE '%transformador%';

-- 5. Atualizar TODAS String Boxes (usar ILIKE para case-insensitive)
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1DISJUNTOR0000008'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND nome ILIKE '%string%box%';

-- 6. Atualizar TODOS Quadros (usar ILIKE)
UPDATE equipamentos
SET tipo_equipamento_id = '01JAQTE1DISJUNTOR0000008'
WHERE classificacao = 'UC'
  AND tipo_equipamento_id IS NULL
  AND nome ILIKE '%quadro%';

-- Verificar resultado
SELECT
  COUNT(CASE WHEN tipo_equipamento_id IS NOT NULL THEN 1 END) as com_tipo,
  COUNT(CASE WHEN tipo_equipamento_id IS NULL THEN 1 END) as sem_tipo,
  COUNT(*) as total
FROM equipamentos
WHERE classificacao = 'UC';
