-- ========================================
-- DIAGNÓSTICO COMPLETO DO SISTEMA MQTT
-- ========================================

-- 1️⃣ ÚLTIMA RECEPÇÃO DE DADOS POR EQUIPAMENTO (últimas 48h)
-- Mostra quando cada equipamento enviou dados pela última vez
SELECT
    e.id,
    e.nome,
    e.tag,
    e.topico_mqtt,
    e.mqtt_habilitado,
    te.codigo as tipo_equipamento,
    MAX(ed.timestamp_dados) as ultima_recepcao,
    MAX(ed.created_at) as ultimo_registro_criado,
    COUNT(ed.id) as total_registros_48h,
    EXTRACT(EPOCH FROM (NOW() - MAX(ed.timestamp_dados)))/3600 as horas_desde_ultimo
FROM equipamentos e
LEFT JOIN tipos_equipamentos te ON e.tipo_equipamento_id = te.id
LEFT JOIN equipamentos_dados ed ON e.id = ed.equipamento_id
    AND ed.timestamp_dados >= NOW() - INTERVAL '48 hours'
WHERE e.mqtt_habilitado = true
    AND e.topico_mqtt IS NOT NULL
    AND e.deleted_at IS NULL
GROUP BY e.id, e.nome, e.tag, e.topico_mqtt, e.mqtt_habilitado, te.codigo
ORDER BY ultima_recepcao DESC NULLS LAST;

-- 2️⃣ ESTATÍSTICAS GERAIS DE RECEPÇÃO (últimas 24h)
SELECT
    COUNT(DISTINCT equipamento_id) as equipamentos_com_dados_24h,
    COUNT(*) as total_registros_24h,
    MIN(timestamp_dados) as primeiro_registro,
    MAX(timestamp_dados) as ultimo_registro,
    ROUND(AVG(num_leituras), 2) as media_leituras_por_registro,
    COUNT(DISTINCT fonte) as fontes_distintas
FROM equipamentos_dados
WHERE timestamp_dados >= NOW() - INTERVAL '24 hours';

-- 3️⃣ EQUIPAMENTOS SEM DADOS NAS ÚLTIMAS 24H (mas com MQTT habilitado)
SELECT
    e.id,
    e.nome,
    e.tag,
    e.topico_mqtt,
    te.codigo as tipo_equipamento,
    u.nome as unidade,
    MAX(ed.timestamp_dados) as ultima_recepcao_conhecida
FROM equipamentos e
LEFT JOIN tipos_equipamentos te ON e.tipo_equipamento_id = te.id
LEFT JOIN unidades u ON e.unidade_id = u.id
LEFT JOIN equipamentos_dados ed ON e.id = ed.equipamento_id
WHERE e.mqtt_habilitado = true
    AND e.topico_mqtt IS NOT NULL
    AND e.deleted_at IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM equipamentos_dados ed2
        WHERE ed2.equipamento_id = e.id
        AND ed2.timestamp_dados >= NOW() - INTERVAL '24 hours'
    )
GROUP BY e.id, e.nome, e.tag, e.topico_mqtt, te.codigo, u.nome
ORDER BY ultima_recepcao_conhecida DESC NULLS LAST;

-- 4️⃣ DISTRIBUIÇÃO DE DADOS POR HORA (últimas 24h)
SELECT
    DATE_TRUNC('hour', timestamp_dados) as hora,
    COUNT(*) as registros,
    COUNT(DISTINCT equipamento_id) as equipamentos_distintos,
    ARRAY_AGG(DISTINCT fonte) as fontes
FROM equipamentos_dados
WHERE timestamp_dados >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', timestamp_dados)
ORDER BY hora DESC;

-- 5️⃣ ANÁLISE DE QUALIDADE DOS DADOS (últimas 24h)
SELECT
    qualidade,
    COUNT(*) as registros,
    COUNT(DISTINCT equipamento_id) as equipamentos,
    ROUND(COUNT(*)::NUMERIC / SUM(COUNT(*)) OVER () * 100, 2) as percentual
FROM equipamentos_dados
WHERE timestamp_dados >= NOW() - INTERVAL '24 hours'
GROUP BY qualidade
ORDER BY registros DESC;

-- 6️⃣ TÓPICOS MQTT CONFIGURADOS (agrupados)
SELECT
    topico_mqtt,
    COUNT(*) as quantidade_equipamentos,
    ARRAY_AGG(nome) as equipamentos,
    ARRAY_AGG(id) as ids
FROM equipamentos
WHERE mqtt_habilitado = true
    AND topico_mqtt IS NOT NULL
    AND deleted_at IS NULL
GROUP BY topico_mqtt
ORDER BY quantidade_equipamentos DESC;

-- 7️⃣ ÚLTIMOS 10 REGISTROS SALVOS (para verificar se está chegando)
SELECT
    ed.id,
    e.nome as equipamento,
    e.topico_mqtt,
    ed.timestamp_dados,
    ed.created_at,
    ed.fonte,
    ed.qualidade,
    ed.num_leituras,
    EXTRACT(EPOCH FROM (ed.created_at - ed.timestamp_dados)) as delay_segundos,
    LEFT(ed.dados::TEXT, 100) as dados_preview
FROM equipamentos_dados ed
JOIN equipamentos e ON ed.equipamento_id = e.id
ORDER BY ed.created_at DESC
LIMIT 10;

-- 8️⃣ GAPS DE DADOS (períodos sem recepção > 15min nas últimas 24h)
WITH dados_timeline AS (
    SELECT
        equipamento_id,
        timestamp_dados,
        LAG(timestamp_dados) OVER (PARTITION BY equipamento_id ORDER BY timestamp_dados) as timestamp_anterior
    FROM equipamentos_dados
    WHERE timestamp_dados >= NOW() - INTERVAL '24 hours'
)
SELECT
    e.nome,
    e.topico_mqtt,
    dt.timestamp_anterior as inicio_gap,
    dt.timestamp_dados as fim_gap,
    EXTRACT(EPOCH FROM (dt.timestamp_dados - dt.timestamp_anterior))/60 as minutos_sem_dados
FROM dados_timeline dt
JOIN equipamentos e ON dt.equipamento_id = e.id
WHERE dt.timestamp_anterior IS NOT NULL
    AND EXTRACT(EPOCH FROM (dt.timestamp_dados - dt.timestamp_anterior))/60 > 15
ORDER BY minutos_sem_dados DESC
LIMIT 20;

-- 9️⃣ EQUIPAMENTOS POR UNIDADE (com status MQTT)
SELECT
    u.nome as unidade,
    COUNT(*) as total_equipamentos,
    COUNT(*) FILTER (WHERE e.mqtt_habilitado = true) as mqtt_habilitado,
    COUNT(*) FILTER (WHERE e.topico_mqtt IS NOT NULL) as com_topico,
    COUNT(DISTINCT ed.equipamento_id) FILTER (WHERE ed.timestamp_dados >= NOW() - INTERVAL '24 hours') as recebendo_dados_24h
FROM unidades u
LEFT JOIN equipamentos e ON u.id = e.unidade_id AND e.deleted_at IS NULL
LEFT JOIN equipamentos_dados ed ON e.id = ed.equipamento_id
GROUP BY u.id, u.nome
HAVING COUNT(*) FILTER (WHERE e.mqtt_habilitado = true) > 0
ORDER BY recebendo_dados_24h DESC, total_equipamentos DESC;

-- 🔟 ANÁLISE DE DESEMPENHO (agregação de 1 minuto)
SELECT
    CASE
        WHEN num_leituras IS NULL THEN 'Leitura individual'
        WHEN num_leituras = 1 THEN '1 leitura agregada'
        WHEN num_leituras BETWEEN 2 AND 5 THEN '2-5 leituras'
        WHEN num_leituras BETWEEN 6 AND 10 THEN '6-10 leituras'
        ELSE '10+ leituras'
    END as faixa_agregacao,
    COUNT(*) as registros,
    ROUND(AVG(num_leituras), 2) as media_leituras
FROM equipamentos_dados
WHERE timestamp_dados >= NOW() - INTERVAL '24 hours'
GROUP BY
    CASE
        WHEN num_leituras IS NULL THEN 'Leitura individual'
        WHEN num_leituras = 1 THEN '1 leitura agregada'
        WHEN num_leituras BETWEEN 2 AND 5 THEN '2-5 leituras'
        WHEN num_leituras BETWEEN 6 AND 10 THEN '6-10 leituras'
        ELSE '10+ leituras'
    END
ORDER BY registros DESC;
