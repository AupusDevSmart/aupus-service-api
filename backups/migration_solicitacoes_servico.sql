-- Migration: Add Solicitações de Serviço
-- Date: 2026-03-13
-- Description: Adiciona tabelas e enums para o módulo de Solicitações de Serviço

-- 1. Adicionar novo valor ao enum OrigemOS (se ainda não existir)
DO $$
BEGIN
    -- Verifica se o valor já existe no enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'SOLICITACAO_SERVICO'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OrigemOS')
    ) THEN
        ALTER TYPE "OrigemOS" ADD VALUE 'SOLICITACAO_SERVICO';
    END IF;
END $$;

-- 2. Criar enum StatusSolicitacaoServico
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StatusSolicitacaoServico') THEN
        CREATE TYPE "StatusSolicitacaoServico" AS ENUM (
            'RASCUNHO',
            'AGUARDANDO',
            'EM_ANALISE',
            'APROVADA',
            'REJEITADA',
            'CANCELADA',
            'OS_GERADA',
            'CONCLUIDA'
        );
    END IF;
END $$;

-- 3. Criar enum TipoSolicitacaoServico
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoSolicitacaoServico') THEN
        CREATE TYPE "TipoSolicitacaoServico" AS ENUM (
            'INSTALACAO',
            'MANUTENCAO_PREVENTIVA',
            'MANUTENCAO_CORRETIVA',
            'INSPECAO',
            'CALIBRACAO',
            'MODIFICACAO',
            'REMOCAO',
            'CONSULTORIA',
            'TREINAMENTO',
            'OUTRO'
        );
    END IF;
END $$;

-- 4. Criar enum PrioridadeSolicitacao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrioridadeSolicitacao') THEN
        CREATE TYPE "PrioridadeSolicitacao" AS ENUM (
            'BAIXA',
            'MEDIA',
            'ALTA',
            'URGENTE',
            'CRITICA'
        );
    END IF;
END $$;

-- 5. Criar enum OrigemSolicitacao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrigemSolicitacao') THEN
        CREATE TYPE "OrigemSolicitacao" AS ENUM (
            'PORTAL',
            'EMAIL',
            'TELEFONE',
            'PRESENCIAL',
            'SISTEMA',
            'APLICATIVO'
        );
    END IF;
END $$;

-- 6. Criar tabela solicitacoes_servico
CREATE TABLE IF NOT EXISTS "solicitacoes_servico" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoSolicitacaoServico" NOT NULL,
    "prioridade" "PrioridadeSolicitacao" NOT NULL DEFAULT 'MEDIA',
    "status" "StatusSolicitacaoServico" NOT NULL DEFAULT 'RASCUNHO',
    "origem" "OrigemSolicitacao" NOT NULL DEFAULT 'PORTAL',

    -- Localização
    "planta_id" TEXT NOT NULL,
    "area" TEXT,
    "local_especifico" TEXT,

    -- Equipamento (opcional)
    "equipamento_id" TEXT,

    -- Solicitante
    "solicitante_nome" TEXT NOT NULL,
    "solicitante_email" TEXT,
    "solicitante_telefone" TEXT,
    "solicitante_departamento" TEXT,
    "solicitante_id" TEXT,

    -- Datas e prazos
    "data_necessidade" TIMESTAMP(3),
    "prazo_esperado" TIMESTAMP(3),
    "data_inicio_previsto" TIMESTAMP(3),
    "data_fim_previsto" TIMESTAMP(3),

    -- Estimativas
    "tempo_estimado" DECIMAL(10,2),
    "custo_estimado" DECIMAL(10,2),

    -- Análise e aprovação
    "analisado_por_id" TEXT,
    "data_analise" TIMESTAMP(3),
    "observacoes_analise" TEXT,

    "aprovado_por_id" TEXT,
    "data_aprovacao" TIMESTAMP(3),
    "observacoes_aprovacao" TEXT,

    "rejeitado_por_id" TEXT,
    "data_rejeicao" TIMESTAMP(3),
    "motivo_rejeicao" TEXT,

    -- Cancelamento
    "cancelado_por_id" TEXT,
    "data_cancelamento" TIMESTAMP(3),
    "motivo_cancelamento" TEXT,

    -- Conclusão
    "concluido_por_id" TEXT,
    "data_conclusao" TIMESTAMP(3),
    "observacoes_conclusao" TEXT,

    -- Integração com OS
    "programacao_os_id" TEXT,
    "os_id" TEXT,

    -- Observações gerais
    "observacoes" TEXT,
    "requisitos_especiais" TEXT,
    "riscos_identificados" TEXT,

    -- Metadados
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "solicitacoes_servico_pkey" PRIMARY KEY ("id")
);

-- 7. Criar tabela historico_solicitacao_servico
CREATE TABLE IF NOT EXISTS "historico_solicitacao_servico" (
    "id" TEXT NOT NULL,
    "solicitacao_id" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "usuario" TEXT,
    "usuario_id" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacoes" TEXT,
    "status_anterior" "StatusSolicitacaoServico",
    "status_novo" "StatusSolicitacaoServico",
    "dados_extras" JSONB,

    CONSTRAINT "historico_solicitacao_servico_pkey" PRIMARY KEY ("id")
);

-- 8. Criar tabela anexos_solicitacao_servico
CREATE TABLE IF NOT EXISTS "anexos_solicitacao_servico" (
    "id" TEXT NOT NULL,
    "solicitacao_id" TEXT NOT NULL,
    "nome_original" TEXT NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo_documento" TEXT,
    "uploaded_por" TEXT,
    "uploaded_por_id" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "anexos_solicitacao_servico_pkey" PRIMARY KEY ("id")
);

-- 9. Criar tabela comentarios_solicitacao_servico
CREATE TABLE IF NOT EXISTS "comentarios_solicitacao_servico" (
    "id" TEXT NOT NULL,
    "solicitacao_id" TEXT NOT NULL,
    "comentario" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "autor_id" TEXT,
    "tipo" TEXT DEFAULT 'COMENTARIO',
    "privado" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "comentarios_solicitacao_servico_pkey" PRIMARY KEY ("id")
);

-- 10. Criar índices
CREATE UNIQUE INDEX IF NOT EXISTS "solicitacoes_servico_numero_key" ON "solicitacoes_servico"("numero");
CREATE INDEX IF NOT EXISTS "solicitacoes_servico_status_idx" ON "solicitacoes_servico"("status");
CREATE INDEX IF NOT EXISTS "solicitacoes_servico_tipo_idx" ON "solicitacoes_servico"("tipo");
CREATE INDEX IF NOT EXISTS "solicitacoes_servico_prioridade_idx" ON "solicitacoes_servico"("prioridade");
CREATE INDEX IF NOT EXISTS "solicitacoes_servico_planta_id_idx" ON "solicitacoes_servico"("planta_id");
CREATE INDEX IF NOT EXISTS "solicitacoes_servico_equipamento_id_idx" ON "solicitacoes_servico"("equipamento_id");
CREATE INDEX IF NOT EXISTS "solicitacoes_servico_solicitante_id_idx" ON "solicitacoes_servico"("solicitante_id");
CREATE INDEX IF NOT EXISTS "solicitacoes_servico_created_at_idx" ON "solicitacoes_servico"("created_at");

CREATE INDEX IF NOT EXISTS "historico_solicitacao_servico_solicitacao_id_idx" ON "historico_solicitacao_servico"("solicitacao_id");
CREATE INDEX IF NOT EXISTS "historico_solicitacao_servico_data_idx" ON "historico_solicitacao_servico"("data");

CREATE INDEX IF NOT EXISTS "anexos_solicitacao_servico_solicitacao_id_idx" ON "anexos_solicitacao_servico"("solicitacao_id");
CREATE INDEX IF NOT EXISTS "comentarios_solicitacao_servico_solicitacao_id_idx" ON "comentarios_solicitacao_servico"("solicitacao_id");

-- 11. Adicionar foreign keys
ALTER TABLE "solicitacoes_servico"
    ADD CONSTRAINT "solicitacoes_servico_planta_id_fkey"
    FOREIGN KEY ("planta_id") REFERENCES "plantas"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "solicitacoes_servico"
    ADD CONSTRAINT "solicitacoes_servico_equipamento_id_fkey"
    FOREIGN KEY ("equipamento_id") REFERENCES "equipamentos"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "solicitacoes_servico"
    ADD CONSTRAINT "solicitacoes_servico_solicitante_id_fkey"
    FOREIGN KEY ("solicitante_id") REFERENCES "usuarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "solicitacoes_servico"
    ADD CONSTRAINT "solicitacoes_servico_analisado_por_id_fkey"
    FOREIGN KEY ("analisado_por_id") REFERENCES "usuarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "solicitacoes_servico"
    ADD CONSTRAINT "solicitacoes_servico_aprovado_por_id_fkey"
    FOREIGN KEY ("aprovado_por_id") REFERENCES "usuarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "solicitacoes_servico"
    ADD CONSTRAINT "solicitacoes_servico_rejeitado_por_id_fkey"
    FOREIGN KEY ("rejeitado_por_id") REFERENCES "usuarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "solicitacoes_servico"
    ADD CONSTRAINT "solicitacoes_servico_cancelado_por_id_fkey"
    FOREIGN KEY ("cancelado_por_id") REFERENCES "usuarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "solicitacoes_servico"
    ADD CONSTRAINT "solicitacoes_servico_concluido_por_id_fkey"
    FOREIGN KEY ("concluido_por_id") REFERENCES "usuarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "solicitacoes_servico"
    ADD CONSTRAINT "solicitacoes_servico_programacao_os_id_fkey"
    FOREIGN KEY ("programacao_os_id") REFERENCES "programacao_os"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "solicitacoes_servico"
    ADD CONSTRAINT "solicitacoes_servico_os_id_fkey"
    FOREIGN KEY ("os_id") REFERENCES "os"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "historico_solicitacao_servico"
    ADD CONSTRAINT "historico_solicitacao_servico_solicitacao_id_fkey"
    FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes_servico"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "historico_solicitacao_servico"
    ADD CONSTRAINT "historico_solicitacao_servico_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "anexos_solicitacao_servico"
    ADD CONSTRAINT "anexos_solicitacao_servico_solicitacao_id_fkey"
    FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes_servico"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "anexos_solicitacao_servico"
    ADD CONSTRAINT "anexos_solicitacao_servico_uploaded_por_id_fkey"
    FOREIGN KEY ("uploaded_por_id") REFERENCES "usuarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "comentarios_solicitacao_servico"
    ADD CONSTRAINT "comentarios_solicitacao_servico_solicitacao_id_fkey"
    FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes_servico"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comentarios_solicitacao_servico"
    ADD CONSTRAINT "comentarios_solicitacao_servico_autor_id_fkey"
    FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 12. Adicionar comentário nas tabelas
COMMENT ON TABLE "solicitacoes_servico" IS 'Tabela para gerenciar solicitações de serviço';
COMMENT ON TABLE "historico_solicitacao_servico" IS 'Histórico de ações nas solicitações de serviço';
COMMENT ON TABLE "anexos_solicitacao_servico" IS 'Anexos das solicitações de serviço';
COMMENT ON TABLE "comentarios_solicitacao_servico" IS 'Comentários nas solicitações de serviço';

-- Migration completed successfully