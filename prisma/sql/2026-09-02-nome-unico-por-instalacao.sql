-- Nome unico por instalacao entre as posicoes vivas.
--
-- O nome passou a ser da POSICAO, e posicao que nao da para identificar sem
-- ambiguidade dentro da instalacao nao e posicao: duas "Chave Fusivel 1" no
-- mesmo lugar confundem tanto o sistema quanto quem esta em campo.
--
-- Parcial (`WHERE deleted_at IS NULL`) para conviver com o soft delete — nome de
-- posicao removida pode ser reaproveitado.
--
-- ATENCAO: nao entra com duplicata no banco. Rodar antes:
--
--   SELECT u.nome, af.nome, count(*)
--     FROM ativos_funcionais af JOIN unidades u ON u.id = af.unidade_id
--    WHERE af.deleted_at IS NULL
--    GROUP BY u.nome, af.nome HAVING count(*) > 1;
--
-- Em dev (2026-09-02) havia 9 pares. Oito eram cadastro duplicado sem trabalho
-- ligado — nenhuma anomalia, OS, plano ou tarefa — e foram removidos por soft
-- delete. O nono, `unidade 2 :: inversor 1`, tem 3 anomalias de CADA lado: os
-- dois foram usados como coisas distintas, e escolher por script qual historia
-- sobrevive seria arbitrario. Precisa de decisao humana antes deste indice.

CREATE UNIQUE INDEX IF NOT EXISTS uq_ativos_funcionais_nome_por_instalacao
  ON ativos_funcionais (unidade_id, nome)
  WHERE deleted_at IS NULL;
