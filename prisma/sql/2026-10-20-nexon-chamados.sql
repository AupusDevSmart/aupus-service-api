-- ============================================================================
-- Chamados do NexON viram solicitação de serviço (NEXON-27)
--
-- POST /api/v1/integracoes/nexon/chamados grava o id do chamado do NexON na
-- solicitação. Índice único: a fila do NexON tenta de novo quando a resposta
-- não chega, e a segunda entrega devolve a mesma solicitação.
--
-- Aditivo e idempotente. Postgres trata NULL como distinto: solicitações que não
-- vieram do NexON não colidem.
-- ROLLBACK: DROP INDEX IF EXISTS solicitacoes_servico_nexon_chamado_id_key;
--           ALTER TABLE solicitacoes_servico DROP COLUMN IF EXISTS nexon_chamado_id;
-- ============================================================================

ALTER TABLE solicitacoes_servico ADD COLUMN IF NOT EXISTS nexon_chamado_id VARCHAR(64) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS solicitacoes_servico_nexon_chamado_id_key
  ON solicitacoes_servico (nexon_chamado_id);
