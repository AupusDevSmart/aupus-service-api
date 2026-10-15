-- SN-33: programações e OS de tarefa (a preventiva) nasciam sem planta_id, e o
-- técnico e o cliente, que enxergam pela planta, nunca as viam (no dev: 57 de
-- 57 programações e 33 de 33 OS de origem TAREFA).
--
-- Preenche a planta pela das tarefas — a unidade do equipamento, senão
-- (componente/UAR, sem unidade) a unidade do UC pai, senão a coluna planta_id
-- do equipamento, que é da estrutura antiga e fica velha quando o UC muda de
-- planta (SN-12) —, só quando todas as tarefas são da mesma planta. Depois, o
-- equipamento da própria linha e, na OS, a planta da programação.
--
-- Só toca onde planta_id é nulo: rodar de novo não muda nada. trim() dos dois
-- lados porque os ids são Char(26) com espaço.

BEGIN;

-- 1. programação pela planta das tarefas
WITH planta_das_tarefas AS (
  SELECT trim(tp.programacao_id) AS id,
         min(trim(COALESCE(NULLIF(trim(u.planta_id), ''), NULLIF(trim(up.planta_id), ''), NULLIF(trim(e.planta_id), '')))) AS planta_id,
         count(DISTINCT trim(COALESCE(NULLIF(trim(u.planta_id), ''), NULLIF(trim(up.planta_id), ''), NULLIF(trim(e.planta_id), '')))) AS plantas
  FROM tarefas_programacao_os tp
  JOIN equipamentos e ON trim(e.id) = trim(tp.equipamento_id)
  LEFT JOIN unidades u ON trim(u.id) = trim(e.unidade_id)
  LEFT JOIN equipamentos pai ON trim(pai.id) = trim(e.equipamento_pai_id)
  LEFT JOIN unidades up ON trim(up.id) = trim(pai.unidade_id)
  GROUP BY trim(tp.programacao_id)
)
UPDATE programacoes_os p
SET planta_id = t.planta_id
FROM planta_das_tarefas t
WHERE trim(p.id) = t.id AND p.planta_id IS NULL AND t.plantas = 1 AND t.planta_id IS NOT NULL;

-- 2. OS pela planta das tarefas
WITH planta_das_tarefas AS (
  SELECT trim(t.os_id) AS id,
         min(trim(COALESCE(NULLIF(trim(u.planta_id), ''), NULLIF(trim(up.planta_id), ''), NULLIF(trim(e.planta_id), '')))) AS planta_id,
         count(DISTINCT trim(COALESCE(NULLIF(trim(u.planta_id), ''), NULLIF(trim(up.planta_id), ''), NULLIF(trim(e.planta_id), '')))) AS plantas
  FROM tarefas_os t
  JOIN equipamentos e ON trim(e.id) = trim(t.equipamento_id)
  LEFT JOIN unidades u ON trim(u.id) = trim(e.unidade_id)
  LEFT JOIN equipamentos pai ON trim(pai.id) = trim(e.equipamento_pai_id)
  LEFT JOIN unidades up ON trim(up.id) = trim(pai.unidade_id)
  GROUP BY trim(t.os_id)
)
UPDATE ordens_servico o
SET planta_id = t.planta_id
FROM planta_das_tarefas t
WHERE trim(o.id) = t.id AND o.planta_id IS NULL AND t.plantas = 1 AND t.planta_id IS NOT NULL;

-- 3. pelo equipamento da própria linha (programação e OS)
UPDATE programacoes_os p
SET planta_id = trim(COALESCE(NULLIF(trim(u.planta_id), ''), NULLIF(trim(up.planta_id), ''), NULLIF(trim(e.planta_id), '')))
FROM equipamentos e
LEFT JOIN unidades u ON trim(u.id) = trim(e.unidade_id)
LEFT JOIN equipamentos pai ON trim(pai.id) = trim(e.equipamento_pai_id)
LEFT JOIN unidades up ON trim(up.id) = trim(pai.unidade_id)
WHERE trim(e.id) = trim(p.equipamento_id) AND p.planta_id IS NULL
  AND COALESCE(NULLIF(trim(u.planta_id), ''), NULLIF(trim(up.planta_id), ''), NULLIF(trim(e.planta_id), '')) IS NOT NULL;

UPDATE ordens_servico o
SET planta_id = trim(COALESCE(NULLIF(trim(u.planta_id), ''), NULLIF(trim(up.planta_id), ''), NULLIF(trim(e.planta_id), '')))
FROM equipamentos e
LEFT JOIN unidades u ON trim(u.id) = trim(e.unidade_id)
LEFT JOIN equipamentos pai ON trim(pai.id) = trim(e.equipamento_pai_id)
LEFT JOIN unidades up ON trim(up.id) = trim(pai.unidade_id)
WHERE trim(e.id) = trim(o.equipamento_id) AND o.planta_id IS NULL
  AND COALESCE(NULLIF(trim(u.planta_id), ''), NULLIF(trim(up.planta_id), ''), NULLIF(trim(e.planta_id), '')) IS NOT NULL;

-- 4. OS pela planta da programação que a gerou
UPDATE ordens_servico o
SET planta_id = p.planta_id
FROM programacoes_os p
WHERE trim(p.id) = trim(o.programacao_id) AND o.planta_id IS NULL AND p.planta_id IS NOT NULL;

COMMIT;
