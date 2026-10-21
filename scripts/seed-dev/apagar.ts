import type { PrismaService } from '@/core';

/**
 * O que o seed apaga do dev antes de recriar (decisão do usuário, SN-70:
 * "apagar e recriar", com backup antes). Ficam os usuários (menos os do seed,
 * que ele recria), os papéis, as permissões, o catálogo de categorias e
 * modelos (que o seed corrige e completa) e as tabelas que não são do Service
 * (CRM antigo, telescope, sincronização). A exceção, por chave estrangeira: o
 * que é de outro sistema e está preso a uma instalação ou a um equipamento
 * (projeto IoT antigo, logs e regras MQTT, TON/BO) sai com eles, apagado de
 * propósito e contado na prévia; os dispositivos IoT ficam, sem o componente.
 *
 * Roda dentro da transação do seed, com `sincronizacao.replicando = on`: o
 * gatilho de captura não grava o apagar no outbox, e nada chega ao NexOn. O
 * vínculo de sincronização das plantas, instalações e equipamentos apagados
 * sai junto, com o que estava pendente de entrega deles.
 *
 * A ordem é a das chaves estrangeiras (filho antes do pai); a que tem
 * ON DELETE CASCADE no banco vai junto com o pai.
 */
export const DOMINIO_DO_SEED = 'seed.aupus.example';

export const APAGAR: Array<{ rotulo: string; sql: string }> = [
  { rotulo: 'notificações (envios, avisos e eventos)', sql: `DELETE FROM notificacoes_envios; DELETE FROM notificacoes; DELETE FROM notificacoes_eventos` },
  { rotulo: 'comentários das OS', sql: `DELETE FROM comentarios_os` },
  {
    rotulo: 'ordens de serviço e o que é delas',
    sql: `DELETE FROM anexos_os; DELETE FROM checklist_atividades_os; DELETE FROM registros_tempo_os; DELETE FROM historico_os;
          DELETE FROM tecnicos_os; DELETE FROM materiais_os; DELETE FROM ferramentas_os; DELETE FROM itens_orcamento_os;
          DELETE FROM tarefas_os; DELETE FROM ordens_servico`,
  },
  {
    rotulo: 'programações e o que é delas',
    sql: `DELETE FROM historico_programacao_os; DELETE FROM tecnicos_programacao_os; DELETE FROM materiais_programacao_os;
          DELETE FROM ferramentas_programacao_os; DELETE FROM itens_orcamento_programacao_os; DELETE FROM tarefas_programacao_os;
          DELETE FROM programacoes_os`,
  },
  { rotulo: 'viaturas, documentos e reservas', sql: `DELETE FROM reservas_veiculos; DELETE FROM documentacao_veiculos; DELETE FROM veiculos` },
  {
    rotulo: 'solicitações de serviço e propostas',
    sql: `DELETE FROM comentarios_solicitacao_servico; DELETE FROM anexos_solicitacao_servico; DELETE FROM historico_solicitacao_servico;
          DELETE FROM solicitacoes_itens; DELETE FROM solicitacoes_outros_custos; DELETE FROM solicitacoes_subinstrucoes;
          DELETE FROM tarefas_solicitacoes; DELETE FROM solicitacoes_instrucoes; DELETE FROM solicitacoes_servico`,
  },
  {
    rotulo: 'anomalias',
    sql: `DELETE FROM anexos_anomalias; DELETE FROM historico_anomalias; DELETE FROM anomalias_instrucoes; DELETE FROM anomalias`,
  },
  {
    rotulo: 'planos e tarefas (cópias antes dos templates)',
    sql: `DELETE FROM propagacoes_plano; DELETE FROM tarefas WHERE tarefa_origem_id IS NOT NULL; DELETE FROM tarefas;
          DELETE FROM planos_manutencao WHERE plano_origem_id IS NOT NULL; DELETE FROM planos_manutencao`,
  },
  {
    rotulo: 'instruções, recursos e maquinários',
    sql: `DELETE FROM anexos_instrucao; DELETE FROM instrucao_recursos; DELETE FROM instrucao_maquinarios; DELETE FROM sub_instrucoes;
          DELETE FROM instrucoes; DELETE FROM recursos; DELETE FROM maquinarios`,
  },
  {
    rotulo: 'feriados e dias úteis',
    sql: `DELETE FROM feriado_plantas; DELETE FROM feriados; DELETE FROM configuracao_plantas; DELETE FROM configuracoes_dias_uteis`,
  },
  {
    // Iriam em cascata com as instalações e os equipamentos: explícito, e contado na prévia
    rotulo: 'projetos IoT antigos presos às instalações e o MQTT dos equipamentos (logs, regras, TON/BO, custo)',
    sql: `DELETE FROM iot_projetos; DELETE FROM logs_mqtt; DELETE FROM regras_logs_mqtt; DELETE FROM ton_bo;
          DELETE FROM configuracoes_custo_equipamento`,
  },
  {
    rotulo: 'equipamentos, posições e o que é deles (leituras MQTT antigas inclusive)',
    sql: `DELETE FROM equipamentos_dados; DELETE FROM equipamentos_dados_tecnicos; DELETE FROM equipamento_pontos;
          DELETE FROM equipamentos_conexoes; DELETE FROM anexos_equipamentos; DELETE FROM ativos_funcionais_equipamentos;
          DELETE FROM equipamentos WHERE equipamento_pai_id IS NOT NULL; DELETE FROM equipamentos; DELETE FROM ativos_funcionais`,
  },
  {
    rotulo: 'plantas e instalações',
    sql: `DELETE FROM diagramas_unitarios; DELETE FROM configuracao_demanda; DELETE FROM anexos_unidades; DELETE FROM unidades;
          DELETE FROM planta_operadores; DELETE FROM plantas`,
  },
  {
    rotulo: 'usuários do seed (o seed os recria)',
    sql: `DELETE FROM model_has_permissions WHERE model_id IN (SELECT id FROM usuarios WHERE email LIKE '%@${DOMINIO_DO_SEED}');
          DELETE FROM model_has_roles WHERE model_id IN (SELECT id FROM usuarios WHERE email LIKE '%@${DOMINIO_DO_SEED}');
          DELETE FROM usuarios WHERE email LIKE '%@${DOMINIO_DO_SEED}'`,
  },
  {
    rotulo: 'vínculo de sincronização do que foi apagado (e o pendente de entrega dele)',
    sql: `DELETE FROM sincronizacao_outbox WHERE entregue_em IS NULL AND recurso IN ('plantas', 'unidades', 'equipamentos');
          DELETE FROM sincronizacao_vinculos WHERE recurso IN ('plantas', 'unidades', 'equipamentos')`,
  },
];

/** As tabelas contadas na prévia: o tamanho de cada uma antes e depois */
export const TABELAS_CONTADAS = [
  'usuarios', 'plantas', 'unidades', 'planta_operadores', 'ativos_funcionais', 'equipamentos', 'equipamentos_dados',
  'categorias_equipamentos', 'tipos_equipamentos', 'recursos', 'maquinarios', 'instrucoes', 'sub_instrucoes', 'instrucao_recursos',
  'instrucao_maquinarios', 'planos_manutencao', 'tarefas', 'feriados', 'configuracoes_dias_uteis', 'veiculos', 'documentacao_veiculos',
  'reservas_veiculos', 'anomalias', 'solicitacoes_servico', 'solicitacoes_itens', 'programacoes_os', 'tarefas_programacao_os',
  'ordens_servico', 'tarefas_os', 'checklist_atividades_os', 'anexos_os', 'tecnicos_os', 'materiais_os', 'ferramentas_os',
  'itens_orcamento_os', 'registros_tempo_os', 'comentarios_os', 'comentarios_solicitacao_servico', 'historico_os',
  'notificacoes', 'notificacoes_envios', 'sincronizacao_vinculos', 'sincronizacao_outbox',
  // De outros sistemas, presos às instalações e aos equipamentos: saem com eles
  'iot_projetos', 'iot_componentes', 'iot_conexoes', 'iot_firmwares', 'logs_mqtt', 'regras_logs_mqtt', 'ton_bo',
  'configuracoes_custo_equipamento',
];

export async function contar(prisma: PrismaService): Promise<Record<string, number>> {
  const saida: Record<string, number> = {};
  for (const tabela of TABELAS_CONTADAS) {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${tabela}"`);
    saida[tabela] = Number(n);
  }
  return saida;
}

export async function apagarDadosDoDev(prisma: PrismaService, log: (linha: string) => void): Promise<void> {
  for (const { rotulo, sql } of APAGAR) {
    // Uma instrução por chamada: o Prisma não manda várias numa só
    for (const comando of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(comando);
    }
    log(`  apagado: ${rotulo}`);
  }
}
