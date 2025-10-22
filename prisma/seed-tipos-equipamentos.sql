-- =====================================================
-- SEED: Tipos de Equipamentos para Diagramas Elétricos
-- =====================================================
-- Este script popula a tabela tipos_equipamentos com os tipos
-- que correspondem aos símbolos elétricos disponíveis no frontend

-- Limpar tabela (CUIDADO: isso remove todos os tipos existentes)
-- DELETE FROM tipos_equipamentos;

-- =====================================================
-- CATEGORIA: MEDICAO
-- =====================================================

INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, created_at, updated_at)
VALUES
  ('01JAQTE1MEDIDOR00000001', 'MEDIDOR', 'Medidor de Energia', 'MEDICAO', 32, 32, NOW(), NOW()),
  ('01JAQTE1M16000000000002', 'M160', 'Multimedidor M160', 'MEDICAO', 40, 40, NOW(), NOW()),
  ('01JAQTE1M30000000000003', 'M300', 'Multimeter M300', 'MEDICAO', 40, 40, NOW(), NOW()),
  ('01JAQTE1LANDIS0000000004', 'LANDIS_E750', 'Landis+Gyr E750', 'MEDICAO', 40, 40, NOW(), NOW())
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  categoria = EXCLUDED.categoria,
  updated_at = NOW();

-- =====================================================
-- CATEGORIA: GERACAO
-- =====================================================

INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, created_at, updated_at)
VALUES
  ('01JAQTE1INVERSOR000000005', 'INVERSOR', 'Inversor Solar', 'GERACAO', 48, 32, NOW(), NOW()),
  ('01JAQTE1PAINEL00000000006', 'PAINEL_SOLAR', 'Painel Solar Fotovoltaico', 'GERACAO', 64, 48, NOW(), NOW())
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  categoria = EXCLUDED.categoria,
  updated_at = NOW();

-- =====================================================
-- CATEGORIA: DISTRIBUICAO
-- =====================================================

INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, created_at, updated_at)
VALUES
  ('01JAQTE1TRANSFORM00000007', 'TRANSFORMADOR', 'Transformador', 'DISTRIBUICAO', 48, 48, NOW(), NOW()),
  ('01JAQTE1BARRAMENTO0000008', 'BARRAMENTO', 'Barramento Elétrico', 'DISTRIBUICAO', 64, 16, NOW(), NOW()),
  ('01JAQTE1TSA000000000000009', 'TSA', 'Transformador de Serviço Auxiliar', 'DISTRIBUICAO', 48, 48, NOW(), NOW())
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  categoria = EXCLUDED.categoria,
  updated_at = NOW();

-- =====================================================
-- CATEGORIA: PROTECAO
-- =====================================================

INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, created_at, updated_at)
VALUES
  ('01JAQTE1DISJUNTOR000000010', 'DISJUNTOR', 'Disjuntor', 'PROTECAO', 32, 24, NOW(), NOW()),
  ('01JAQTE1DISJFECHADO000011', 'DISJUNTOR_FECHADO', 'Disjuntor Fechado (Energizado)', 'PROTECAO', 32, 24, NOW(), NOW()),
  ('01JAQTE1DISJABERTO0000012', 'DISJUNTOR_ABERTO', 'Disjuntor Aberto (Desenergizado)', 'PROTECAO', 32, 24, NOW(), NOW()),
  ('01JAQTE1CHAVEABERTA000013', 'CHAVE_ABERTA', 'Chave Seccionadora Aberta', 'PROTECAO', 32, 24, NOW(), NOW()),
  ('01JAQTE1CHAVEFECHADA00014', 'CHAVE_FECHADA', 'Chave Seccionadora Fechada', 'PROTECAO', 32, 24, NOW(), NOW()),
  ('01JAQTE1CHAVEFUSIVEL00015', 'CHAVE_FUSIVEL', 'Chave Fusível', 'PROTECAO', 32, 24, NOW(), NOW()),
  ('01JAQTE1RELE0000000000016', 'RELE', 'Relé de Proteção', 'PROTECAO', 32, 32, NOW(), NOW())
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  categoria = EXCLUDED.categoria,
  updated_at = NOW();

-- =====================================================
-- CATEGORIA: CONSUMO
-- =====================================================

INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, created_at, updated_at)
VALUES
  ('01JAQTE1MOTOR000000000017', 'MOTOR', 'Motor Elétrico', 'CONSUMO', 48, 48, NOW(), NOW()),
  ('01JAQTE1CAPACITOR00000018', 'CAPACITOR', 'Banco de Capacitores', 'CONSUMO', 32, 48, NOW(), NOW())
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  categoria = EXCLUDED.categoria,
  updated_at = NOW();

-- =====================================================
-- CATEGORIA: CONTROLE
-- =====================================================

INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, created_at, updated_at)
VALUES
  ('01JAQTE1BOTOEIRA000000019', 'BOTOEIRA', 'Botoeira de Comando', 'CONTROLE', 24, 24, NOW(), NOW()),
  ('01JAQTE1A96600000000000020', 'A966', 'Gateway IoT A-966', 'CONTROLE', 40, 40, NOW(), NOW()),
  ('01JAQTE1SCADA000000000021', 'SCADA', 'Sistema SCADA', 'CONTROLE', 64, 48, NOW(), NOW()),
  ('01JAQTE1CFTV0000000000022', 'CFTV', 'Sistema de CFTV', 'CONTROLE', 48, 48, NOW(), NOW()),
  ('01JAQTE1TELECOM00000000023', 'TELECOM', 'Sistema de Telecomunicações', 'CONTROLE', 48, 48, NOW(), NOW())
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  categoria = EXCLUDED.categoria,
  updated_at = NOW();

-- =====================================================
-- CATEGORIA: INFRAESTRUTURA
-- =====================================================

INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, created_at, updated_at)
VALUES
  ('01JAQTE1RETIFICADOR000024', 'RETIFICADOR', 'Retificador', 'INFRAESTRUTURA', 48, 40, NOW(), NOW()),
  ('01JAQTE1BANCOBATERIAS00025', 'BANCO_BATERIAS', 'Banco de Baterias', 'INFRAESTRUTURA', 64, 48, NOW(), NOW()),
  ('01JAQTE1PAINELPMT00000026', 'PAINEL_PMT', 'Painel PMT', 'INFRAESTRUTURA', 64, 64, NOW(), NOW()),
  ('01JAQTE1SKID0000000000027', 'SKID', 'SKID de Equipamentos', 'INFRAESTRUTURA', 80, 64, NOW(), NOW()),
  ('01JAQTE1SALACOMANDO000028', 'SALA_COMANDO', 'Sala de Comando', 'INFRAESTRUTURA', 96, 80, NOW(), NOW())
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  categoria = EXCLUDED.categoria,
  updated_at = NOW();

-- =====================================================
-- CATEGORIA: AUXILIAR (para diagramas)
-- =====================================================

INSERT INTO tipos_equipamentos (id, codigo, nome, categoria, largura_padrao, altura_padrao, created_at, updated_at)
VALUES
  ('01JAQTE1PONTO000000000029', 'PONTO', 'Ponto de Junção', 'AUXILIAR', 8, 8, NOW(), NOW())
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  categoria = EXCLUDED.categoria,
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
