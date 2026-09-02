-- Fase 1 da separacao posicao / equipamento.
--
-- "Inversor 1" deixa de ser um equipamento e passa a ser uma POSICAO. O
-- equipamento instalado nela pode ser trocado; a posicao permanece, e com ela o
-- registro de tudo que ja passou por ali.
--
-- Tudo aqui e ADITIVO e idempotente: nenhuma coluna existente e removida ou
-- alterada. O backfill e a obrigatoriedade de `ativo_funcional_id` ficam para a
-- Fase 6, depois que a UI souber criar posicao.
--
-- Banco COMPARTILHADO com /var/www/iot_nexon/. Aplicar este arquivo, nunca um
-- `prisma migrate diff` cru: o diff propoe DROPAR as 15 tabelas fora do schema
-- (ver prisma/TABELAS-FORA-DO-SCHEMA.md).

BEGIN;

-- ---------------------------------------------------------------- a posicao
CREATE TABLE IF NOT EXISTS ativos_funcionais (
  id                     CHAR(26)     PRIMARY KEY,
  nome                   VARCHAR(255) NOT NULL,
  categoria_id           CHAR(26)     NOT NULL,
  unidade_id             CHAR(26)     NOT NULL,
  localizacao            VARCHAR(255),
  localizacao_especifica VARCHAR(500),
  observacoes            TEXT,
  created_at             TIMESTAMP(0) NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMP(0) NOT NULL DEFAULT NOW(),
  deleted_at             TIMESTAMP(0),
  CONSTRAINT ativos_funcionais_categoria_id_fkey
    FOREIGN KEY (categoria_id) REFERENCES categorias_equipamentos(id) ON DELETE RESTRICT,
  CONSTRAINT ativos_funcionais_unidade_id_fkey
    FOREIGN KEY (unidade_id) REFERENCES unidades(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ativos_funcionais_unidade    ON ativos_funcionais(unidade_id);
CREATE INDEX IF NOT EXISTS idx_ativos_funcionais_categoria  ON ativos_funcionais(categoria_id);
CREATE INDEX IF NOT EXISTS idx_ativos_funcionais_deleted_at ON ativos_funcionais(deleted_at);

-- ------------------------------------------------------- o historico do vinculo
--
-- `equipamentos.ativo_funcional_id` diz onde o equipamento esta AGORA. So isso
-- nao responde "o que ja passou por aqui": numa troca a coluna e sobrescrita e o
-- vinculo anterior desaparece — e um equipamento que sai e volta nem seria
-- expressavel. Por isso o vinculo e registro, nao coluna.
CREATE TABLE IF NOT EXISTS ativos_funcionais_equipamentos (
  id                 CHAR(26)     PRIMARY KEY,
  ativo_funcional_id CHAR(26)     NOT NULL,
  equipamento_id     CHAR(26)     NOT NULL,
  instalado_em       TIMESTAMP(0) NOT NULL DEFAULT NOW(),
  removido_em        TIMESTAMP(0),
  motivo_remocao     VARCHAR(500),
  instalado_por_id   CHAR(26),
  removido_por_id    CHAR(26),
  created_at         TIMESTAMP(0) NOT NULL DEFAULT NOW(),
  CONSTRAINT afe_ativo_funcional_fkey
    FOREIGN KEY (ativo_funcional_id) REFERENCES ativos_funcionais(id) ON DELETE RESTRICT,
  CONSTRAINT afe_equipamento_fkey
    FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_afe_ativo_funcional ON ativos_funcionais_equipamentos(ativo_funcional_id);
CREATE INDEX IF NOT EXISTS idx_afe_equipamento     ON ativos_funcionais_equipamentos(equipamento_id);
CREATE INDEX IF NOT EXISTS idx_afe_removido_em     ON ativos_funcionais_equipamentos(removido_em);

-- "Um ativo por vez" no banco, e nao so na aplicacao.
--
-- Indice unico PARCIAL sobre os vinculos em aberto: uma posicao pode ter varios
-- vinculos historicos, mas no maximo um sem `removido_em`. Deixar essa regra so
-- no service a torna dependente de nao haver duas requisicoes concorrentes — e
-- o estado invalido, uma vez gravado, e dificil de descobrir.
--
-- Prisma nao expressa indice parcial no schema; por isso vive aqui.
CREATE UNIQUE INDEX IF NOT EXISTS uq_afe_um_ativo_por_posicao
  ON ativos_funcionais_equipamentos(ativo_funcional_id)
  WHERE removido_em IS NULL;

-- ------------------------------------------------------- colunas no equipamento
ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS ativo_funcional_id CHAR(26);
ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS ativo_na_posicao   BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipamentos_ativo_funcional_id_fkey'
  ) THEN
    ALTER TABLE equipamentos
      ADD CONSTRAINT equipamentos_ativo_funcional_id_fkey
      FOREIGN KEY (ativo_funcional_id) REFERENCES ativos_funcionais(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_equipamentos_ativo_funcional ON equipamentos(ativo_funcional_id);

-- Precisao de MILISSEGUNDO nos tempos do vinculo, e nao de segundo como no
-- resto do schema.
--
-- Aqui a ordem E a informacao: o historico da posicao e lido do mais recente
-- para o mais antigo. Com TIMESTAMP(0), duas operacoes no mesmo segundo ficam
-- sem ordem definida e a lista sai invertida — foi assim que o teste pegou.
--
-- ALTER separado, e nao so o tipo no CREATE, para quem ja aplicou a versao
-- anterior deste arquivo. E idempotente: aplicar de novo nao muda nada.
ALTER TABLE ativos_funcionais_equipamentos
  ALTER COLUMN instalado_em TYPE TIMESTAMP(3),
  ALTER COLUMN removido_em  TYPE TIMESTAMP(3),
  ALTER COLUMN created_at   TYPE TIMESTAMP(3);

COMMIT;
