-- ========================================================================
-- SCRIPT DE VERIFICAÇÃO: Inversor Solar Sungrow
-- Data: 2026-01-19
-- Descrição: Verificar se o tipo INVERSOR_SUNGROW foi criado corretamente
-- ========================================================================

-- 1. Verificar categoria Inversor PV
SELECT
  id,
  nome,
  (SELECT COUNT(*) FROM tipos_equipamentos te WHERE te.categoria_id = ce.id) as total_modelos
FROM categorias_equipamentos ce
WHERE nome = 'Inversor PV';

-- 2. Listar todos os tipos de Inversores PV
SELECT
  te.id,
  te.codigo,
  te.nome,
  te.fabricante,
  te.largura_padrao,
  te.altura_padrao,
  CASE WHEN te.mqtt_schema IS NOT NULL THEN 'Sim' ELSE 'Não' END as tem_mqtt,
  (SELECT COUNT(*) FROM equipamentos e WHERE e.tipo_equipamento_id = te.id) as total_equipamentos
FROM tipos_equipamentos te
JOIN categorias_equipamentos ce ON te.categoria_id = ce.id
WHERE ce.nome = 'Inversor PV'
ORDER BY te.fabricante, te.nome;

-- 3. Detalhes completos do INVERSOR_SUNGROW
SELECT
  te.id,
  te.codigo,
  te.nome,
  te.fabricante,
  ce.nome as categoria,
  te.largura_padrao,
  te.altura_padrao,
  te.propriedades_schema::text as propriedades,
  te.mqtt_schema::text as mqtt_config,
  te.created_at,
  te.updated_at
FROM tipos_equipamentos te
JOIN categorias_equipamentos ce ON te.categoria_id = ce.id
WHERE te.codigo = 'INVERSOR_SUNGROW';

-- 4. Schema de propriedades formatado
SELECT
  'Propriedades Técnicas' as secao,
  jsonb_pretty(te.propriedades_schema::jsonb) as detalhes
FROM tipos_equipamentos te
WHERE te.codigo = 'INVERSOR_SUNGROW'
UNION ALL
SELECT
  'Configuração MQTT' as secao,
  jsonb_pretty(te.mqtt_schema::jsonb) as detalhes
FROM tipos_equipamentos te
WHERE te.codigo = 'INVERSOR_SUNGROW';

-- 5. Comparação entre inversores cadastrados
SELECT
  te.codigo,
  te.nome,
  te.fabricante,
  te.largura_padrao || 'x' || te.altura_padrao as dimensoes,
  CASE WHEN te.mqtt_schema IS NOT NULL THEN '✓' ELSE '✗' END as mqtt,
  CASE WHEN te.propriedades_schema IS NOT NULL THEN '✓' ELSE '✗' END as propriedades,
  (SELECT COUNT(*) FROM equipamentos e WHERE e.tipo_equipamento_id = te.id) as equipamentos
FROM tipos_equipamentos te
JOIN categorias_equipamentos ce ON te.categoria_id = ce.id
WHERE ce.nome = 'Inversor PV'
ORDER BY te.fabricante, te.nome;

-- 6. Verificar campos de propriedades do Sungrow
SELECT
  te.codigo as tipo,
  (campo->>'campo')::text as campo,
  (campo->>'tipo')::text as tipo_dado,
  COALESCE((campo->>'unidade')::text, '-') as unidade,
  (campo->>'obrigatorio')::boolean as obrigatorio,
  (campo->>'descricao')::text as descricao
FROM tipos_equipamentos te,
     jsonb_array_elements(te.propriedades_schema->'campos') as campo
WHERE te.codigo = 'INVERSOR_SUNGROW'
ORDER BY (campo->>'obrigatorio')::boolean DESC, (campo->>'campo')::text;

-- 7. Verificar campos de telemetria MQTT do Sungrow
SELECT
  te.codigo as tipo,
  (campo->>'campo')::text as campo,
  (campo->>'tipo')::text as tipo_dado,
  COALESCE((campo->>'unidade')::text, '-') as unidade,
  (campo->>'descricao')::text as descricao
FROM tipos_equipamentos te,
     jsonb_array_elements(te.mqtt_schema->'campos_telemetria') as campo
WHERE te.codigo = 'INVERSOR_SUNGROW'
ORDER BY (campo->>'campo')::text;

-- 8. Contar equipamentos por fabricante na categoria Inversor PV
SELECT
  te.fabricante,
  COUNT(DISTINCT te.id) as modelos_cadastrados,
  COUNT(e.id) as equipamentos_cadastrados
FROM tipos_equipamentos te
JOIN categorias_equipamentos ce ON te.categoria_id = ce.id
LEFT JOIN equipamentos e ON e.tipo_equipamento_id = te.id
WHERE ce.nome = 'Inversor PV'
GROUP BY te.fabricante
ORDER BY equipamentos_cadastrados DESC;

-- 9. Resumo geral
SELECT
  'Total de categorias' as metrica,
  COUNT(*)::text as valor
FROM categorias_equipamentos
UNION ALL
SELECT
  'Total de tipos de equipamentos',
  COUNT(*)::text
FROM tipos_equipamentos
UNION ALL
SELECT
  'Tipos de Inversores PV',
  COUNT(*)::text
FROM tipos_equipamentos te
JOIN categorias_equipamentos ce ON te.categoria_id = ce.id
WHERE ce.nome = 'Inversor PV'
UNION ALL
SELECT
  'Inversor Sungrow existe?',
  CASE WHEN EXISTS (SELECT 1 FROM tipos_equipamentos WHERE codigo = 'INVERSOR_SUNGROW')
    THEN '✓ SIM'
    ELSE '✗ NÃO'
  END
UNION ALL
SELECT
  'Total de equipamentos cadastrados',
  COUNT(*)::text
FROM equipamentos;
