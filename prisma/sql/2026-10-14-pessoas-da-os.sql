-- SN-31: responsável e técnicos da programação e da OS são usuários.
--
-- Antes eram texto livre: `responsavel_id` e `tecnico_id` existiam sem FK e
-- nunca eram preenchidos (0 no dev). A partir de agora o service grava o id e
-- copia o nome do cadastro; este arquivo
--   1. limpa o rótulo "Não atribuído", que a tela mostra para vazio e acabou
--      gravado como se fosse nome;
--   2. liga ao usuário o texto antigo que bate com o nome de exatamente um
--      usuário (o texto fica como está: é o que a OS registrou);
--   3. cria as FKs (ON DELETE SET NULL: usuário apagado não apaga a OS).
--
-- Idempotente. Banco do Service: aupus_local (dev) / aupus_service (produção).

SET client_encoding = 'UTF8';
BEGIN;

-- 1. "Não atribuído" não é nome. O padrão pega também a grafia corrompida
--    ("N├úo atribu├¡do", UTF-8 lido como cp850), que existe no dev
UPDATE ordens_servico SET responsavel = NULL
  WHERE responsavel_id IS NULL
    AND (btrim(responsavel) = '' OR btrim(responsavel) ~* '^n.{1,4}o atribu.{1,4}do$');
UPDATE programacoes_os SET responsavel = NULL
  WHERE responsavel_id IS NULL
    AND (btrim(responsavel) = '' OR btrim(responsavel) ~* '^n.{1,4}o atribu.{1,4}do$');

-- 2. Nome que bate com um só usuário vira o vínculo
CREATE TEMP TABLE nome_unico ON COMMIT DROP AS
  SELECT lower(btrim(nome)) AS nome, min(id) AS id
  FROM usuarios
  WHERE deleted_at IS NULL
  GROUP BY lower(btrim(nome))
  HAVING count(*) = 1;

UPDATE ordens_servico o SET responsavel_id = n.id
  FROM nome_unico n WHERE o.responsavel_id IS NULL AND lower(btrim(o.responsavel)) = n.nome;
UPDATE programacoes_os p SET responsavel_id = n.id
  FROM nome_unico n WHERE p.responsavel_id IS NULL AND lower(btrim(p.responsavel)) = n.nome;
UPDATE tecnicos_os t SET tecnico_id = n.id
  FROM nome_unico n WHERE t.tecnico_id IS NULL AND lower(btrim(t.nome)) = n.nome;
UPDATE tecnicos_programacao_os t SET tecnico_id = n.id
  FROM nome_unico n WHERE t.tecnico_id IS NULL AND lower(btrim(t.nome)) = n.nome;

-- 3. FKs. Id que não existe (não há no dev) vira nulo antes, senão a FK não entra
UPDATE ordens_servico SET responsavel_id = NULL
  WHERE responsavel_id IS NOT NULL AND responsavel_id NOT IN (SELECT id FROM usuarios);
UPDATE programacoes_os SET responsavel_id = NULL
  WHERE responsavel_id IS NOT NULL AND responsavel_id NOT IN (SELECT id FROM usuarios);
UPDATE tecnicos_os SET tecnico_id = NULL
  WHERE tecnico_id IS NOT NULL AND tecnico_id NOT IN (SELECT id FROM usuarios);
UPDATE tecnicos_programacao_os SET tecnico_id = NULL
  WHERE tecnico_id IS NOT NULL AND tecnico_id NOT IN (SELECT id FROM usuarios);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordens_servico_responsavel_id_fkey') THEN
    ALTER TABLE ordens_servico ADD CONSTRAINT ordens_servico_responsavel_id_fkey
      FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programacoes_os_responsavel_id_fkey') THEN
    ALTER TABLE programacoes_os ADD CONSTRAINT programacoes_os_responsavel_id_fkey
      FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tecnicos_os_tecnico_id_fkey') THEN
    ALTER TABLE tecnicos_os ADD CONSTRAINT tecnicos_os_tecnico_id_fkey
      FOREIGN KEY (tecnico_id) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tecnicos_programacao_os_tecnico_id_fkey') THEN
    ALTER TABLE tecnicos_programacao_os ADD CONSTRAINT tecnicos_programacao_os_tecnico_id_fkey
      FOREIGN KEY (tecnico_id) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
