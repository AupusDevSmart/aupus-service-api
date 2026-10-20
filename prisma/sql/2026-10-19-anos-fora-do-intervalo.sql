-- SN-74: datas com o ano fora de 1900–2199. SÓ LEITURA: não escreve nada.
--
-- Desde o SN-74 a API recusa (400) data com ano fora de 1900–2199 — o ano 9999
-- no fim de um período vira 10000 em UTC, que o Prisma recusa (500), e fora
-- disso é o ano digitado errado. O sheet do equipamento e a planilha reenviam
-- a data gravada: um registro antigo com o ano fora daria 400 ao salvar até
-- alguém corrigir a data. Rodar ANTES do deploy; linha que aparecer se corrige
-- com o usuário.
--
--   psql -f prisma/sql/2026-10-19-anos-fora-do-intervalo.sql
--
-- No dev (19/out/2026): 0 linhas.

SELECT tabela, coluna, count(*) AS registros FROM (
  SELECT 'equipamentos' AS tabela, 'data_instalacao' AS coluna, data_instalacao AS d FROM equipamentos WHERE deleted_at IS NULL
  UNION ALL SELECT 'equipamentos', 'data_imobilizacao', data_imobilizacao FROM equipamentos WHERE deleted_at IS NULL
  UNION ALL SELECT 'equipamentos', 'garantia_ate', garantia_ate FROM equipamentos WHERE deleted_at IS NULL
  UNION ALL SELECT 'concessionarias_energia', 'data_inicio', data_inicio FROM concessionarias_energia WHERE deleted_at IS NULL
  UNION ALL SELECT 'concessionarias_energia', 'data_validade', data_validade FROM concessionarias_energia WHERE deleted_at IS NULL
  UNION ALL SELECT 'feriados', 'data', data FROM feriados
  UNION ALL SELECT 'veiculos', 'proxima_revisao', proxima_revisao FROM veiculos
  UNION ALL SELECT 'veiculos', 'vencimento_seguro', vencimento_seguro FROM veiculos
  UNION ALL SELECT 'veiculos', 'data_aquisicao', data_aquisicao FROM veiculos
  UNION ALL SELECT 'documentacao_veiculos', 'data_vencimento', data_vencimento FROM documentacao_veiculos
  UNION ALL SELECT 'reservas_veiculos', 'data_inicio', data_inicio FROM reservas_veiculos
  UNION ALL SELECT 'reservas_veiculos', 'data_fim', data_fim FROM reservas_veiculos
  UNION ALL SELECT 'ferramentas', 'data_aquisicao', data_aquisicao FROM ferramentas
  UNION ALL SELECT 'ferramentas', 'proxima_data_calibracao', proxima_data_calibracao FROM ferramentas
) t
WHERE d IS NOT NULL AND extract(year FROM d) NOT BETWEEN 1900 AND 2199
GROUP BY 1, 2
ORDER BY 1, 2;
