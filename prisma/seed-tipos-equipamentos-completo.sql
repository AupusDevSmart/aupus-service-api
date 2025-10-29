-- =====================================================
-- SEED COMPLETO: Tipos de Equipamentos + Campos Técnicos Padrão
-- =====================================================
-- Este script popula a tabela tipos_equipamentos com:
-- 1. Todos os tipos de equipamentos
-- 2. Schemas JSON com campos técnicos padrão por tipo
--
-- Os campos técnicos são definidos no campo propriedades_schema como:
-- {
--   "campos": [
--     {"campo": "nome_do_campo", "tipo": "number|text|date|select", "unidade": "V|A|kW|etc", "obrigatorio": true|false, "opcoes": ["op1", "op2"]}
--   ]
-- }

-- Limpar dados existentes (CUIDADO: só usar em desenvolvimento!)
-- DELETE FROM tipos_equipamentos;

-- =====================================================
-- CATEGORIA: MEDICAO
-- =====================================================

-- Medidor Genérico
INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, propriedades_schema, created_at, updated_at)
VALUES (
  '01JAQTE1MEDIDOR00000001',
  'MEDIDOR',
  'Medidor de Energia',
  'MEDICAO',
  32, 32,
  '{
    "campos": [
      {"campo": "tensao_nominal", "tipo": "number", "unidade": "V", "obrigatorio": true},
      {"campo": "corrente_nominal", "tipo": "number", "unidade": "A", "obrigatorio": true},
      {"campo": "classe_precisao", "tipo": "select", "opcoes": ["0.2", "0.5", "1.0", "2.0"], "obrigatorio": true},
      {"campo": "fases", "tipo": "select", "opcoes": ["Monofásico", "Bifásico", "Trifásico"], "obrigatorio": true},
      {"campo": "comunicacao", "tipo": "select", "opcoes": ["RS485", "Ethernet", "LoRa", "Zigbee", "Sem comunicação"], "obrigatorio": false}
    ]
  }'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  categoria = EXCLUDED.categoria,
  propriedades_schema = EXCLUDED.propriedades_schema,
  updated_at = NOW();

-- Multimedidor M160
INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, propriedades_schema, created_at, updated_at)
VALUES (
  '01JAQTE1M16000000000002',
  'M160',
  'Multimedidor M160',
  'MEDICAO',
  40, 40,
  '{
    "campos": [
      {"campo": "tensao_nominal", "tipo": "number", "unidade": "V", "obrigatorio": true, "valor_padrao": 220},
      {"campo": "corrente_nominal", "tipo": "number", "unidade": "A", "obrigatorio": true, "valor_padrao": 100},
      {"campo": "frequencia", "tipo": "number", "unidade": "Hz", "obrigatorio": true, "valor_padrao": 60},
      {"campo": "classe_precisao", "tipo": "text", "obrigatorio": false, "valor_padrao": "0.5"},
      {"campo": "protocolo_comunicacao", "tipo": "select", "opcoes": ["Modbus RTU", "Modbus TCP", "IEC 61850"], "obrigatorio": true, "valor_padrao": "Modbus RTU"},
      {"campo": "endereco_modbus", "tipo": "number", "obrigatorio": true, "valor_padrao": 1},
      {"campo": "taxa_comunicacao", "tipo": "select", "opcoes": ["9600", "19200", "38400", "57600", "115200"], "obrigatorio": true, "valor_padrao": "9600"},
      {"campo": "ip_address", "tipo": "text", "obrigatorio": false},
      {"campo": "porta_tcp", "tipo": "number", "obrigatorio": false, "valor_padrao": 502}
    ]
  }'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  propriedades_schema = EXCLUDED.propriedades_schema,
  updated_at = NOW();

-- Multimeter M300
INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, propriedades_schema, created_at, updated_at)
VALUES (
  '01JAQTE1M30000000000003',
  'M300',
  'Multimeter M300',
  'MEDICAO',
  40, 40,
  '{
    "campos": [
      {"campo": "tensao_nominal", "tipo": "number", "unidade": "V", "obrigatorio": true, "valor_padrao": 220},
      {"campo": "corrente_nominal", "tipo": "number", "unidade": "A", "obrigatorio": true, "valor_padrao": 100},
      {"campo": "frequencia", "tipo": "number", "unidade": "Hz", "obrigatorio": true, "valor_padrao": 60},
      {"campo": "protocolo_comunicacao", "tipo": "select", "opcoes": ["Modbus RTU", "Modbus TCP"], "obrigatorio": true, "valor_padrao": "Modbus RTU"},
      {"campo": "endereco_modbus", "tipo": "number", "obrigatorio": true, "valor_padrao": 1},
      {"campo": "taxa_comunicacao", "tipo": "select", "opcoes": ["9600", "19200", "38400", "57600"], "obrigatorio": true, "valor_padrao": "9600"},
      {"campo": "TC_ratio", "tipo": "text", "obrigatorio": false, "descricao": "Relação de transformação TC (ex: 100:5)"},
      {"campo": "TP_ratio", "tipo": "text", "obrigatorio": false, "descricao": "Relação de transformação TP (ex: 13800:115)"}
    ]
  }'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  propriedades_schema = EXCLUDED.propriedades_schema,
  updated_at = NOW();

-- Landis+Gyr E750
INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, propriedades_schema, created_at, updated_at)
VALUES (
  '01JAQTE1LANDIS0000000004',
  'LANDIS_E750',
  'Landis+Gyr E750',
  'MEDICAO',
  40, 40,
  '{
    "campos": [
      {"campo": "tensao_nominal", "tipo": "number", "unidade": "V", "obrigatorio": true, "valor_padrao": 220},
      {"campo": "corrente_maxima", "tipo": "number", "unidade": "A", "obrigatorio": true, "valor_padrao": 100},
      {"campo": "classe_precisao", "tipo": "text", "obrigatorio": true, "valor_padrao": "0.2S"},
      {"campo": "protocolo_comunicacao", "tipo": "select", "opcoes": ["DLMS/COSEM", "Modbus", "IEC 62056"], "obrigatorio": true, "valor_padrao": "DLMS/COSEM"},
      {"campo": "numero_serie", "tipo": "text", "obrigatorio": true},
      {"campo": "firmware_version", "tipo": "text", "obrigatorio": false},
      {"campo": "ip_address", "tipo": "text", "obrigatorio": false},
      {"campo": "porta_comunicacao", "tipo": "number", "obrigatorio": false, "valor_padrao": 4059}
    ]
  }'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  propriedades_schema = EXCLUDED.propriedades_schema,
  updated_at = NOW();

-- =====================================================
-- CATEGORIA: GERACAO
-- =====================================================

-- Inversor Solar
INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, propriedades_schema, created_at, updated_at)
VALUES (
  '01JAQTE1INVERSOR000000005',
  'INVERSOR',
  'Inversor Solar',
  'GERACAO',
  48, 32,
  '{
    "campos": [
      {"campo": "potencia_nominal", "tipo": "number", "unidade": "kW", "obrigatorio": true},
      {"campo": "tensao_entrada_max", "tipo": "number", "unidade": "V", "obrigatorio": true},
      {"campo": "tensao_saida", "tipo": "number", "unidade": "V", "obrigatorio": true, "valor_padrao": 220},
      {"campo": "corrente_maxima_entrada", "tipo": "number", "unidade": "A", "obrigatorio": true},
      {"campo": "corrente_maxima_saida", "tipo": "number", "unidade": "A", "obrigatorio": true},
      {"campo": "eficiencia", "tipo": "number", "unidade": "%", "obrigatorio": false, "valor_padrao": 97.5},
      {"campo": "mppt_trackers", "tipo": "number", "obrigatorio": true, "valor_padrao": 2},
      {"campo": "protocolo_comunicacao", "tipo": "select", "opcoes": ["Modbus RTU", "Modbus TCP", "SunSpec", "Proprietário"], "obrigatorio": false},
      {"campo": "topologia", "tipo": "select", "opcoes": ["String", "Central", "Micro-inversor"], "obrigatorio": true}
    ]
  }'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  propriedades_schema = EXCLUDED.propriedades_schema,
  updated_at = NOW();

-- Painel Solar
INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, propriedades_schema, created_at, updated_at)
VALUES (
  '01JAQTE1PAINEL00000000006',
  'PAINEL_SOLAR',
  'Painel Solar Fotovoltaico',
  'GERACAO',
  64, 48,
  '{
    "campos": [
      {"campo": "potencia_pico", "tipo": "number", "unidade": "W", "obrigatorio": true},
      {"campo": "tensao_circuito_aberto", "tipo": "number", "unidade": "V", "obrigatorio": true},
      {"campo": "corrente_curto_circuito", "tipo": "number", "unidade": "A", "obrigatorio": true},
      {"campo": "tensao_max_potencia", "tipo": "number", "unidade": "V", "obrigatorio": true},
      {"campo": "corrente_max_potencia", "tipo": "number", "unidade": "A", "obrigatorio": true},
      {"campo": "eficiencia", "tipo": "number", "unidade": "%", "obrigatorio": false},
      {"campo": "tecnologia", "tipo": "select", "opcoes": ["Monocristalino", "Policristalino", "Filme Fino", "PERC", "HJT"], "obrigatorio": true},
      {"campo": "quantidade_celulas", "tipo": "number", "obrigatorio": false},
      {"campo": "dimensoes", "tipo": "text", "obrigatorio": false, "descricao": "LxAxP em mm"}
    ]
  }'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  propriedades_schema = EXCLUDED.propriedades_schema,
  updated_at = NOW();

-- =====================================================
-- CATEGORIA: DISTRIBUICAO
-- =====================================================

-- Transformador
INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, propriedades_schema, created_at, updated_at)
VALUES (
  '01JAQTE1TRANSFORM00000007',
  'TRANSFORMADOR',
  'Transformador',
  'DISTRIBUICAO',
  48, 48,
  '{
    "campos": [
      {"campo": "potencia_nominal", "tipo": "number", "unidade": "kVA", "obrigatorio": true},
      {"campo": "tensao_primaria", "tipo": "number", "unidade": "V", "obrigatorio": true},
      {"campo": "tensao_secundaria", "tipo": "number", "unidade": "V", "obrigatorio": true},
      {"campo": "corrente_primaria", "tipo": "number", "unidade": "A", "obrigatorio": true},
      {"campo": "corrente_secundaria", "tipo": "number", "unidade": "A", "obrigatorio": true},
      {"campo": "tipo_ligacao", "tipo": "select", "opcoes": ["Estrela-Estrela", "Delta-Delta", "Estrela-Delta", "Delta-Estrela"], "obrigatorio": true},
      {"campo": "tipo_resfriamento", "tipo": "select", "opcoes": ["ONAN", "ONAF", "OFAF", "Seco"], "obrigatorio": true},
      {"campo": "impedancia", "tipo": "number", "unidade": "%", "obrigatorio": false},
      {"campo": "frequencia", "tipo": "number", "unidade": "Hz", "obrigatorio": true, "valor_padrao": 60},
      {"campo": "grupo_conexao", "tipo": "text", "obrigatorio": false, "descricao": "Ex: Dyn11, Yyn0"}
    ]
  }'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  propriedades_schema = EXCLUDED.propriedades_schema,
  updated_at = NOW();

-- Barramento
INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, propriedades_schema, created_at, updated_at)
VALUES (
  '01JAQTE1BARRAMENTO0000008',
  'BARRAMENTO',
  'Barramento Elétrico',
  'DISTRIBUICAO',
  64, 16,
  '{
    "campos": [
      {"campo": "tensao_nominal", "tipo": "number", "unidade": "V", "obrigatorio": true},
      {"campo": "corrente_nominal", "tipo": "number", "unidade": "A", "obrigatorio": true},
      {"campo": "material", "tipo": "select", "opcoes": ["Cobre", "Alumínio"], "obrigatorio": true},
      {"campo": "configuracao", "tipo": "select", "opcoes": ["Monofásico", "Bifásico", "Trifásico", "Trifásico + Neutro"], "obrigatorio": true},
      {"campo": "tipo_isolamento", "tipo": "select", "opcoes": ["Ar", "SF6", "Encapsulado"], "obrigatorio": false},
      {"campo": "secao_transversal", "tipo": "number", "unidade": "mm²", "obrigatorio": false}
    ]
  }'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  propriedades_schema = EXCLUDED.propriedades_schema,
  updated_at = NOW();

-- TSA (Transformador de Serviço Auxiliar)
INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, propriedades_schema, created_at, updated_at)
VALUES (
  '01JAQTE1TSA000000000000009',
  'TSA',
  'Transformador de Serviço Auxiliar',
  'DISTRIBUICAO',
  48, 48,
  '{
    "campos": [
      {"campo": "potencia_nominal", "tipo": "number", "unidade": "kVA", "obrigatorio": true},
      {"campo": "tensao_primaria", "tipo": "number", "unidade": "V", "obrigatorio": true},
      {"campo": "tensao_secundaria", "tipo": "number", "unidade": "V", "obrigatorio": true, "valor_padrao": 220},
      {"campo": "tipo_ligacao", "tipo": "select", "opcoes": ["Estrela-Estrela", "Delta-Delta", "Estrela-Delta", "Delta-Estrela"], "obrigatorio": true},
      {"campo": "frequencia", "tipo": "number", "unidade": "Hz", "obrigatorio": true, "valor_padrao": 60},
      {"campo": "servicos_alimentados", "tipo": "text", "obrigatorio": false, "descricao": "Lista de serviços auxiliares"}
    ]
  }'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  propriedades_schema = EXCLUDED.propriedades_schema,
  updated_at = NOW();

-- =====================================================
-- CATEGORIA: PROTECAO
-- =====================================================

-- Disjuntor
INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, propriedades_schema, created_at, updated_at)
VALUES (
  '01JAQTE1DISJUNTOR000000010',
  'DISJUNTOR',
  'Disjuntor',
  'PROTECAO',
  32, 24,
  '{
    "campos": [
      {"campo": "tensao_nominal", "tipo": "number", "unidade": "V", "obrigatorio": true},
      {"campo": "corrente_nominal", "tipo": "number", "unidade": "A", "obrigatorio": true},
      {"campo": "capacidade_ruptura", "tipo": "number", "unidade": "kA", "obrigatorio": true},
      {"campo": "numero_polos", "tipo": "select", "opcoes": ["1", "2", "3", "4"], "obrigatorio": true},
      {"campo": "curva_atuacao", "tipo": "select", "opcoes": ["B", "C", "D", "K", "Z"], "obrigatorio": false},
      {"campo": "tipo_acionamento", "tipo": "select", "opcoes": ["Manual", "Motorizado", "Remoto"], "obrigatorio": false},
      {"campo": "categoria_utilizacao", "tipo": "select", "opcoes": ["A", "B"], "obrigatorio": false}
    ]
  }'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  propriedades_schema = EXCLUDED.propriedades_schema,
  updated_at = NOW();

-- Relé de Proteção
INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, propriedades_schema, created_at, updated_at)
VALUES (
  '01JAQTE1RELE0000000000016',
  'RELE',
  'Relé de Proteção',
  'PROTECAO',
  32, 32,
  '{
    "campos": [
      {"campo": "tipo_protecao", "tipo": "select", "opcoes": ["Sobrecorrente", "Subtensão", "Sobretensão", "Frequência", "Diferencial", "Distância", "Multi-função"], "obrigatorio": true},
      {"campo": "tensao_nominal", "tipo": "number", "unidade": "V", "obrigatorio": true},
      {"campo": "corrente_nominal", "tipo": "number", "unidade": "A", "obrigatorio": true},
      {"campo": "protocolo_comunicacao", "tipo": "select", "opcoes": ["IEC 61850", "Modbus", "DNP3", "IEC 60870-5-104", "Sem comunicação"], "obrigatorio": false},
      {"campo": "funcoes_ansi", "tipo": "text", "obrigatorio": false, "descricao": "Ex: 50/51, 27, 59, 81"},
      {"campo": "tempo_atuacao", "tipo": "number", "unidade": "ms", "obrigatorio": false}
    ]
  }'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  propriedades_schema = EXCLUDED.propriedades_schema,
  updated_at = NOW();

-- =====================================================
-- CATEGORIA: CONTROLE
-- =====================================================

-- Gateway IoT A-966
INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, propriedades_schema, created_at, updated_at)
VALUES (
  '01JAQTE1A96600000000000020',
  'A966',
  'Gateway IoT A-966',
  'CONTROLE',
  40, 40,
  '{
    "campos": [
      {"campo": "tensao_alimentacao", "tipo": "number", "unidade": "V", "obrigatorio": true, "valor_padrao": 24},
      {"campo": "ip_address", "tipo": "text", "obrigatorio": true},
      {"campo": "mascara_rede", "tipo": "text", "obrigatorio": true, "valor_padrao": "255.255.255.0"},
      {"campo": "gateway", "tipo": "text", "obrigatorio": true},
      {"campo": "porta_modbus_tcp", "tipo": "number", "obrigatorio": false, "valor_padrao": 502},
      {"campo": "protocolo_upstream", "tipo": "select", "opcoes": ["MQTT", "HTTP", "CoAP", "WebSocket"], "obrigatorio": true, "valor_padrao": "MQTT"},
      {"campo": "servidor_mqtt", "tipo": "text", "obrigatorio": false},
      {"campo": "porta_mqtt", "tipo": "number", "obrigatorio": false, "valor_padrao": 1883},
      {"campo": "numero_serie", "tipo": "text", "obrigatorio": true},
      {"campo": "firmware_version", "tipo": "text", "obrigatorio": false}
    ]
  }'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  propriedades_schema = EXCLUDED.propriedades_schema,
  updated_at = NOW();

-- SCADA
INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, propriedades_schema, created_at, updated_at)
VALUES (
  '01JAQTE1SCADA000000000021',
  'SCADA',
  'Sistema SCADA',
  'CONTROLE',
  64, 48,
  '{
    "campos": [
      {"campo": "software", "tipo": "text", "obrigatorio": true, "descricao": "Nome do software SCADA"},
      {"campo": "versao", "tipo": "text", "obrigatorio": false},
      {"campo": "servidor_ip", "tipo": "text", "obrigatorio": true},
      {"campo": "porta_comunicacao", "tipo": "number", "obrigatorio": false},
      {"campo": "protocolo", "tipo": "select", "opcoes": ["OPC UA", "OPC DA", "Modbus TCP", "DNP3", "IEC 61850", "IEC 60870-5-104"], "obrigatorio": true},
      {"campo": "licencas_tags", "tipo": "number", "obrigatorio": false, "descricao": "Número de tags licenciadas"},
      {"campo": "redundancia", "tipo": "select", "opcoes": ["Sim", "Não"], "obrigatorio": false}
    ]
  }'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  propriedades_schema = EXCLUDED.propriedades_schema,
  updated_at = NOW();

-- =====================================================
-- CATEGORIA: INFRAESTRUTURA
-- =====================================================

-- Retificador
INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, propriedades_schema, created_at, updated_at)
VALUES (
  '01JAQTE1RETIFICADOR000024',
  'RETIFICADOR',
  'Retificador',
  'INFRAESTRUTURA',
  48, 40,
  '{
    "campos": [
      {"campo": "potencia_nominal", "tipo": "number", "unidade": "kW", "obrigatorio": true},
      {"campo": "tensao_entrada", "tipo": "number", "unidade": "V", "obrigatorio": true, "valor_padrao": 220},
      {"campo": "tensao_saida", "tipo": "number", "unidade": "V", "obrigatorio": true, "valor_padrao": 48},
      {"campo": "corrente_maxima", "tipo": "number", "unidade": "A", "obrigatorio": true},
      {"campo": "eficiencia", "tipo": "number", "unidade": "%", "obrigatorio": false},
      {"campo": "tipo", "tipo": "select", "opcoes": ["Monofásico", "Trifásico"], "obrigatorio": true},
      {"campo": "frequencia", "tipo": "number", "unidade": "Hz", "obrigatorio": true, "valor_padrao": 60},
      {"campo": "fator_potencia", "tipo": "number", "obrigatorio": false}
    ]
  }'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  propriedades_schema = EXCLUDED.propriedades_schema,
  updated_at = NOW();

-- Banco de Baterias
INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, propriedades_schema, created_at, updated_at)
VALUES (
  '01JAQTE1BANCOBATERIAS00025',
  'BANCO_BATERIAS',
  'Banco de Baterias',
  'INFRAESTRUTURA',
  64, 48,
  '{
    "campos": [
      {"campo": "capacidade", "tipo": "number", "unidade": "Ah", "obrigatorio": true},
      {"campo": "tensao_nominal", "tipo": "number", "unidade": "V", "obrigatorio": true},
      {"campo": "tipo_bateria", "tipo": "select", "opcoes": ["Chumbo-Ácido", "VRLA", "Níquel-Cádmio", "Lítio", "Gel"], "obrigatorio": true},
      {"campo": "quantidade_elementos", "tipo": "number", "obrigatorio": true},
      {"campo": "tempo_autonomia", "tipo": "number", "unidade": "h", "obrigatorio": false},
      {"campo": "corrente_descarga_max", "tipo": "number", "unidade": "A", "obrigatorio": false},
      {"campo": "temperatura_operacao_min", "tipo": "number", "unidade": "°C", "obrigatorio": false},
      {"campo": "temperatura_operacao_max", "tipo": "number", "unidade": "°C", "obrigatorio": false},
      {"campo": "data_fabricacao", "tipo": "date", "obrigatorio": false}
    ]
  }'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  propriedades_schema = EXCLUDED.propriedades_schema,
  updated_at = NOW();

-- =====================================================
-- CATEGORIA: CONSUMO
-- =====================================================

-- Motor Elétrico
INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, propriedades_schema, created_at, updated_at)
VALUES (
  '01JAQTE1MOTOR000000000017',
  'MOTOR',
  'Motor Elétrico',
  'CONSUMO',
  48, 48,
  '{
    "campos": [
      {"campo": "potencia_nominal", "tipo": "number", "unidade": "kW", "obrigatorio": true},
      {"campo": "tensao_nominal", "tipo": "number", "unidade": "V", "obrigatorio": true},
      {"campo": "corrente_nominal", "tipo": "number", "unidade": "A", "obrigatorio": true},
      {"campo": "rotacao_nominal", "tipo": "number", "unidade": "rpm", "obrigatorio": true},
      {"campo": "frequencia", "tipo": "number", "unidade": "Hz", "obrigatorio": true, "valor_padrao": 60},
      {"campo": "numero_polos", "tipo": "number", "obrigatorio": true},
      {"campo": "fator_servico", "tipo": "number", "obrigatorio": false, "valor_padrao": 1.15},
      {"campo": "categoria", "tipo": "select", "opcoes": ["N", "H", "D"], "obrigatorio": false},
      {"campo": "classe_isolamento", "tipo": "select", "opcoes": ["B", "F", "H"], "obrigatorio": false},
      {"campo": "grau_protecao", "tipo": "select", "opcoes": ["IP54", "IP55", "IP56", "IP65"], "obrigatorio": false},
      {"campo": "rendimento", "tipo": "number", "unidade": "%", "obrigatorio": false}
    ]
  }'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  propriedades_schema = EXCLUDED.propriedades_schema,
  updated_at = NOW();

-- =====================================================
-- CATEGORIA: AUXILIAR
-- =====================================================

-- Ponto de Junção (para diagramas)
INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, propriedades_schema, created_at, updated_at)
VALUES (
  '01JAQTE1PONTO000000000029',
  'PONTO',
  'Ponto de Junção',
  'AUXILIAR',
  8, 8,
  '{
    "campos": []
  }'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  propriedades_schema = EXCLUDED.propriedades_schema,
  updated_at = NOW();

-- =====================================================
-- Verificar dados inseridos
-- =====================================================

SELECT
  categoria,
  COUNT(*) as quantidade,
  STRING_AGG(codigo, ', ' ORDER BY codigo) as codigos
FROM tipos_equipamentos
GROUP BY categoria
ORDER BY categoria;

-- Exibir tipos com schemas
SELECT
  codigo,
  nome,
  categoria,
  jsonb_array_length(propriedades_schema->'campos') as num_campos_tecnicos
FROM tipos_equipamentos
ORDER BY categoria, nome;
