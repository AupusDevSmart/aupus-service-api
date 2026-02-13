-- ========================================
-- CORREÇÃO EM LOTE DA QUALIDADE DOS DADOS
-- ========================================

-- Atualizar para BOA: registros com tensão + corrente + potência
UPDATE equipamentos_dados
SET qualidade = 'boa'
WHERE qualidade = 'ruim'
  AND timestamp_dados >= NOW() - INTERVAL '48 hours'
  AND (dados->'Dados'->>'Va')::NUMERIC > 0  -- Tem tensão
  AND (dados->'Dados'->>'Ia')::NUMERIC > 0  -- Tem corrente
  AND (dados->'Dados'->>'Pt')::NUMERIC > 0; -- Tem potência

-- Atualizar para PARCIAL: registros com tensão mas sem corrente
UPDATE equipamentos_dados
SET qualidade = 'parcial'
WHERE qualidade = 'ruim'
  AND timestamp_dados >= NOW() - INTERVAL '48 hours'
  AND (dados->'Dados'->>'Va')::NUMERIC > 0  -- Tem tensão
  AND (dados->'Dados'->>'Ia')::NUMERIC = 0  -- Sem corrente
  AND (dados->'Dados'->>'Pt')::NUMERIC = 0; -- Sem potência

-- Verificar resultados
SELECT
    qualidade,
    COUNT(*) as registros,
    ROUND(COUNT(*)::NUMERIC / (SELECT COUNT(*) FROM equipamentos_dados WHERE timestamp_dados >= NOW() - INTERVAL '48 hours') * 100, 1) as percentual
FROM equipamentos_dados
WHERE timestamp_dados >= NOW() - INTERVAL '48 hours'
GROUP BY qualidade
ORDER BY registros DESC;
