-- Verificar equipamentos UC diretamente no banco
SELECT
  SUBSTRING(id, 1, 20) as id_short,
  SUBSTRING(nome, 1, 40) as nome_short,
  classificacao,
  SUBSTRING(tipo_equipamento_id, 1, 20) as tipo_id
FROM equipamentos
WHERE classificacao = 'UC'
ORDER BY tipo_equipamento_id NULLS FIRST
LIMIT 30;
