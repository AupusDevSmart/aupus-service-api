-- CreateEnum
CREATE TYPE "StatusSolicitacaoServico" AS ENUM ('RASCUNHO', 'AGUARDANDO', 'EM_ANALISE', 'APROVADA', 'OS_GERADA', 'EM_EXECUCAO', 'CONCLUIDA', 'CANCELADA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "TipoSolicitacaoServico" AS ENUM ('INSTALACAO', 'MELHORIA', 'PREVENTIVA', 'ADAPTACAO', 'INSPECAO', 'CALIBRACAO', 'LIMPEZA', 'TREINAMENTO', 'OUTROS');

-- CreateEnum
CREATE TYPE "PrioridadeSolicitacao" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "OrigemSolicitacao" AS ENUM ('OPERADOR', 'SISTEMA', 'PREVENTIVA', 'MELHORIA', 'AUDITORIA');

-- AlterEnum
ALTER TYPE "origem_os" ADD VALUE 'SOLICITACAO_SERVICO';

-- DropIndex
DROP INDEX "public"."idx_equipamentos_dados_created_at";

-- CreateTable
CREATE TABLE "solicitacoes_servico" (
    "id" CHAR(26) NOT NULL,
    "numero" VARCHAR(50) NOT NULL,
    "titulo" VARCHAR(255) NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoSolicitacaoServico" NOT NULL,
    "status" "StatusSolicitacaoServico" NOT NULL DEFAULT 'RASCUNHO',
    "prioridade" "PrioridadeSolicitacao" NOT NULL DEFAULT 'MEDIA',
    "origem" "OrigemSolicitacao" NOT NULL DEFAULT 'OPERADOR',
    "planta_id" CHAR(26),
    "equipamento_id" CHAR(26),
    "local" VARCHAR(255) NOT NULL,
    "area" VARCHAR(255),
    "data_solicitacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_necessidade" TIMESTAMP(3),
    "prazo_execucao" INTEGER,
    "data_prevista_inicio" TIMESTAMP(3),
    "data_prevista_fim" TIMESTAMP(3),
    "justificativa" TEXT NOT NULL,
    "beneficios_esperados" TEXT,
    "riscos_nao_execucao" TEXT,
    "tempo_estimado" DECIMAL(5,2),
    "custo_estimado" DECIMAL(12,2),
    "materiais_necessarios" TEXT,
    "ferramentas_necessarias" TEXT,
    "mao_obra_necessaria" TEXT,
    "solicitante_id" CHAR(26),
    "solicitante_nome" VARCHAR(255) NOT NULL,
    "departamento" VARCHAR(100),
    "contato" VARCHAR(100),
    "analisado_por_id" CHAR(26),
    "analisado_por_nome" VARCHAR(255),
    "data_analise" TIMESTAMP(3),
    "parecer_tecnico" TEXT,
    "observacoes_analise" TEXT,
    "aprovado_por_id" CHAR(26),
    "aprovado_por_nome" VARCHAR(255),
    "data_aprovacao" TIMESTAMP(3),
    "observacoes_aprovacao" TEXT,
    "motivo_rejeicao" TEXT,
    "sugestoes_alternativas" TEXT,
    "motivo_cancelamento" TEXT,
    "cancelado_por_id" CHAR(26),
    "cancelado_por_nome" VARCHAR(255),
    "data_cancelamento" TIMESTAMP(3),
    "programacao_os_id" CHAR(26),
    "ordem_servico_id" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "solicitacoes_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_solicitacao_servico" (
    "id" TEXT NOT NULL,
    "solicitacao_id" CHAR(26) NOT NULL,
    "acao" VARCHAR(255) NOT NULL,
    "usuario_id" CHAR(26),
    "usuario_nome" VARCHAR(255) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_anterior" "StatusSolicitacaoServico",
    "status_novo" "StatusSolicitacaoServico",
    "observacoes" TEXT,
    "dados_extras" JSONB,

    CONSTRAINT "historico_solicitacao_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anexos_solicitacao_servico" (
    "id" TEXT NOT NULL,
    "solicitacao_id" CHAR(26) NOT NULL,
    "nome" VARCHAR(255) NOT NULL,
    "nome_original" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "caminho" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo_documento" VARCHAR(50),
    "uploaded_por_id" CHAR(26),
    "uploaded_por_nome" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexos_solicitacao_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comentarios_solicitacao_servico" (
    "id" TEXT NOT NULL,
    "solicitacao_id" CHAR(26) NOT NULL,
    "comentario" TEXT NOT NULL,
    "usuario_id" CHAR(26),
    "usuario_nome" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentarios_solicitacao_servico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "solicitacoes_servico_numero_key" ON "solicitacoes_servico"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "solicitacoes_servico_programacao_os_id_key" ON "solicitacoes_servico"("programacao_os_id");

-- CreateIndex
CREATE INDEX "solicitacoes_servico_numero_idx" ON "solicitacoes_servico"("numero");

-- CreateIndex
CREATE INDEX "solicitacoes_servico_status_idx" ON "solicitacoes_servico"("status");

-- CreateIndex
CREATE INDEX "solicitacoes_servico_tipo_idx" ON "solicitacoes_servico"("tipo");

-- CreateIndex
CREATE INDEX "solicitacoes_servico_prioridade_idx" ON "solicitacoes_servico"("prioridade");

-- CreateIndex
CREATE INDEX "solicitacoes_servico_data_solicitacao_idx" ON "solicitacoes_servico"("data_solicitacao");

-- CreateIndex
CREATE INDEX "solicitacoes_servico_planta_id_idx" ON "solicitacoes_servico"("planta_id");

-- CreateIndex
CREATE INDEX "solicitacoes_servico_equipamento_id_idx" ON "solicitacoes_servico"("equipamento_id");

-- CreateIndex
CREATE INDEX "solicitacoes_servico_solicitante_id_idx" ON "solicitacoes_servico"("solicitante_id");

-- CreateIndex
CREATE INDEX "solicitacoes_servico_deleted_at_idx" ON "solicitacoes_servico"("deleted_at");

-- CreateIndex
CREATE INDEX "historico_solicitacao_servico_solicitacao_id_idx" ON "historico_solicitacao_servico"("solicitacao_id");

-- CreateIndex
CREATE INDEX "historico_solicitacao_servico_data_idx" ON "historico_solicitacao_servico"("data");

-- CreateIndex
CREATE INDEX "anexos_solicitacao_servico_solicitacao_id_idx" ON "anexos_solicitacao_servico"("solicitacao_id");

-- CreateIndex
CREATE INDEX "comentarios_solicitacao_servico_solicitacao_id_idx" ON "comentarios_solicitacao_servico"("solicitacao_id");

-- CreateIndex
CREATE INDEX "comentarios_solicitacao_servico_created_at_idx" ON "comentarios_solicitacao_servico"("created_at");

-- CreateIndex
CREATE INDEX "idx_equipamentos_dados_periodo" ON "equipamentos_dados"("equipamento_id", "timestamp_dados", "energia_kwh");

-- CreateIndex
CREATE INDEX "idx_equipamentos_dados_potencia" ON "equipamentos_dados"("equipamento_id", "potencia_ativa_kw");

-- CreateIndex
CREATE INDEX "idx_equipamentos_dados_tipo_horario" ON "equipamentos_dados"("equipamento_id", "tipo_horario", "timestamp_dados");

-- AddForeignKey
ALTER TABLE "tipos_equipamentos" ADD CONSTRAINT "tipos_equipamentos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_equipamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracao_demanda" ADD CONSTRAINT "configuracao_demanda_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracao_demanda" ADD CONSTRAINT "configuracao_demanda_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracao_demanda" ADD CONSTRAINT "configuracao_demanda_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_servico" ADD CONSTRAINT "solicitacoes_servico_planta_id_fkey" FOREIGN KEY ("planta_id") REFERENCES "plantas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_servico" ADD CONSTRAINT "solicitacoes_servico_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_servico" ADD CONSTRAINT "solicitacoes_servico_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_servico" ADD CONSTRAINT "solicitacoes_servico_analisado_por_id_fkey" FOREIGN KEY ("analisado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_servico" ADD CONSTRAINT "solicitacoes_servico_aprovado_por_id_fkey" FOREIGN KEY ("aprovado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_servico" ADD CONSTRAINT "solicitacoes_servico_cancelado_por_id_fkey" FOREIGN KEY ("cancelado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_servico" ADD CONSTRAINT "solicitacoes_servico_programacao_os_id_fkey" FOREIGN KEY ("programacao_os_id") REFERENCES "programacoes_os"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_solicitacao_servico" ADD CONSTRAINT "historico_solicitacao_servico_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos_solicitacao_servico" ADD CONSTRAINT "anexos_solicitacao_servico_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios_solicitacao_servico" ADD CONSTRAINT "comentarios_solicitacao_servico_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "uk_equipamento_timestamp" RENAME TO "equipamentos_dados_equipamento_id_timestamp_dados_key";

