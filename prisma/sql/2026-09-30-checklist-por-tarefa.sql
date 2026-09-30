-- ============================================================================
-- Checklist da OS ligado à tarefa (SPEC-EXECUCAO-DA-OS, decisão D4)
--
-- Até aqui o item do checklist só "sabia" de qual tarefa era pelo texto
-- ("Nome da tarefa: sub-instrução"). A tela passa a agrupar o checklist por
-- tarefa e a exigir os itens obrigatórios antes de concluir cada uma.
--
-- Aditivo e idempotente. Itens gerais de segurança ficam com tarefa_os_id nulo.
-- ROLLBACK: ALTER TABLE checklist_atividades_os DROP COLUMN IF EXISTS tarefa_os_id;
-- ============================================================================

ALTER TABLE checklist_atividades_os ADD COLUMN IF NOT EXISTS tarefa_os_id TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'checklist_atividades_os_tarefa_os_id_fkey'
  ) THEN
    ALTER TABLE checklist_atividades_os
      ADD CONSTRAINT checklist_atividades_os_tarefa_os_id_fkey
      FOREIGN KEY (tarefa_os_id) REFERENCES tarefas_os(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS checklist_atividades_os_tarefa_os_id_idx ON checklist_atividades_os (tarefa_os_id);

-- Itens já existentes: liga pelo prefixo do texto, só quando o prefixo
-- aponta para UMA tarefa daquela OS (nome repetido fica sem vínculo).
WITH candidatos AS (
  SELECT c.id AS item_id, t.id AS tarefa_os_id,
         count(*) OVER (PARTITION BY c.id) AS casamentos
  FROM checklist_atividades_os c
  JOIN tarefas_os t ON t.os_id = c.os_id
  WHERE c.tarefa_os_id IS NULL
    AND COALESCE(t.nome_snapshot, t.instrucao_nome) IS NOT NULL
    AND c.atividade LIKE COALESCE(t.nome_snapshot, t.instrucao_nome) || ': %'
)
UPDATE checklist_atividades_os c
   SET tarefa_os_id = cand.tarefa_os_id
  FROM candidatos cand
 WHERE cand.item_id = c.id AND cand.casamentos = 1;
