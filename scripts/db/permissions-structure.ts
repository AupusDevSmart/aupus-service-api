/**
 * ESTRUTURA DE PERMISSOES - AUPUS SERVICE
 *
 * Padrao: recurso.acao (minusculas, separadas por ponto)
 *
 * Roles (ordem de senioridade): operador < proprietario < analista < gerente < admin < super_admin
 *
 * Escopo de dados (aplicado em runtime, nao via permissao):
 * - operador: ve apenas dados das plantas vinculadas via planta_operadores
 * - proprietario: ve apenas dados das plantas onde plantas.proprietario_id = seu id
 * - analista+: sem filtro de planta
 *
 * Sufixos especiais de ownership (filtros adicionais ao scope de planta):
 * - .manage_own:     filtra por usuario_id = current_user (ex: anomalias.manage_own)
 * - .manage_created: filtra por created_by = current_user (ex: usuarios.manage_created)
 */

export interface PermissionDef {
  name: string;
  display_name: string;
  description: string;
  category: string;
}

export const PERMISSIONS: PermissionDef[] = [
  // Dashboard
  { name: 'dashboard.view', display_name: 'Ver Dashboard', description: 'Acessar o dashboard principal', category: 'Dashboard' },

  // Plantas
  { name: 'plantas.view', display_name: 'Ver Plantas', description: 'Listar e visualizar plantas', category: 'Plantas' },
  { name: 'plantas.manage', display_name: 'Gerenciar Plantas', description: 'Criar, editar e deletar plantas', category: 'Plantas' },
  { name: 'plantas.manage_operadores', display_name: 'Gerenciar Operadores da Planta', description: 'Vincular e desvincular operadores de plantas', category: 'Plantas' },

  // Unidades
  { name: 'unidades.view', display_name: 'Ver Unidades', description: 'Listar e visualizar unidades', category: 'Unidades' },
  { name: 'unidades.manage', display_name: 'Gerenciar Unidades', description: 'Criar, editar e deletar unidades', category: 'Unidades' },

  // Equipamentos
  { name: 'equipamentos.view', display_name: 'Ver Equipamentos', description: 'Listar e visualizar equipamentos', category: 'Equipamentos' },
  { name: 'equipamentos.manage', display_name: 'Gerenciar Equipamentos', description: 'Criar, editar e deletar equipamentos', category: 'Equipamentos' },

  // Anomalias
  { name: 'anomalias.view', display_name: 'Ver Anomalias', description: 'Listar e visualizar anomalias', category: 'Anomalias' },
  { name: 'anomalias.manage', display_name: 'Gerenciar Anomalias', description: 'Criar, editar e deletar anomalias', category: 'Anomalias' },
  { name: 'anomalias.report', display_name: 'Reportar Anomalia', description: 'Criar (POST) anomalia em equipamento/planta dentro do escopo', category: 'Anomalias' },
  { name: 'anomalias.manage_own', display_name: 'Gerenciar Minhas Anomalias', description: 'Editar e atualizar status das anomalias reportadas pelo proprio usuario (usuario_id)', category: 'Anomalias' },

  // Usuarios
  { name: 'usuarios.view', display_name: 'Ver Usuarios', description: 'Listar e visualizar usuarios', category: 'Usuarios' },
  { name: 'usuarios.manage', display_name: 'Gerenciar Usuarios', description: 'Editar e deletar usuarios (respeitando hierarquia)', category: 'Usuarios' },
  { name: 'usuarios.create_operador', display_name: 'Criar Operador', description: 'Cadastrar novo usuario com role operador', category: 'Usuarios' },
  { name: 'usuarios.create_proprietario', display_name: 'Criar Proprietario', description: 'Cadastrar novo usuario com role proprietario', category: 'Usuarios' },
  { name: 'usuarios.create_analista', display_name: 'Criar Analista', description: 'Cadastrar novo usuario com role analista', category: 'Usuarios' },
  { name: 'usuarios.create_admin', display_name: 'Criar Admin', description: 'Cadastrar novo usuario com role admin', category: 'Usuarios' },
  { name: 'usuarios.manage_created', display_name: 'Gerenciar Usuarios Criados', description: 'Editar e desativar usuarios que o proprio usuario criou (created_by)', category: 'Usuarios' },

  // Programacao OS
  { name: 'programacao_os.view', display_name: 'Ver Programacao OS', description: 'Listar e visualizar programacoes de OS', category: 'Ordens de Servico' },
  { name: 'programacao_os.manage', display_name: 'Gerenciar Programacao OS', description: 'Criar e editar programacoes de OS', category: 'Ordens de Servico' },
  { name: 'programacao_os.aprovar', display_name: 'Aprovar Programacao OS', description: 'Aprovar programacoes de OS pendentes', category: 'Ordens de Servico' },
  { name: 'programacao_os.cancelar', display_name: 'Cancelar Programacao OS', description: 'Cancelar programacoes de OS', category: 'Ordens de Servico' },

  // Execucao OS
  { name: 'execucao_os.view', display_name: 'Ver Execucao OS', description: 'Listar e visualizar execucoes de OS', category: 'Ordens de Servico' },
  { name: 'execucao_os.manage', display_name: 'Gerenciar Execucao OS', description: 'Criar e editar execucoes de OS', category: 'Ordens de Servico' },
  { name: 'execucao_os.aprovar', display_name: 'Aprovar Execucao OS', description: 'Aprovar execucoes de OS', category: 'Ordens de Servico' },
  { name: 'execucao_os.cancelar', display_name: 'Cancelar Execucao OS', description: 'Cancelar execucoes de OS', category: 'Ordens de Servico' },
  { name: 'execucao_os.executar', display_name: 'Executar OS', description: 'Disparar execucao de OS atribuida (operador em campo)', category: 'Ordens de Servico' },

  // Outras paginas AupusService (agrupadas)
  { name: 'manutencao.manage', display_name: 'Gerenciar Manutencao', description: 'Tarefas, instrucoes, planos de manutencao, solicitacoes de servico', category: 'Manutencao' },
  { name: 'tarefas.update_status', display_name: 'Atualizar Status de Tarefa', description: 'Mudar status de tarefa de manutencao (operador em campo)', category: 'Manutencao' },
  { name: 'solicitacoes.create', display_name: 'Abrir Solicitacao de Servico', description: 'Criar (POST) solicitacao de servico em planta dentro do escopo (operador reporta)', category: 'Manutencao' },
  { name: 'recursos.manage', display_name: 'Gerenciar Recursos', description: 'Ferramentas, fornecedores, veiculos e reservas', category: 'Recursos' },
  { name: 'agenda.manage', display_name: 'Gerenciar Agenda', description: 'Feriados e dias uteis', category: 'Agenda' },

  // Administracao
  { name: 'admin.impersonate', display_name: 'Personificar Usuario', description: 'Fazer login como outro usuario', category: 'Administracao' },
];

/**
 * Mapeamento role -> permissoes.
 * Cada role herda as permissoes do role anterior na hierarquia, mas aqui listamos de forma explicita
 * para ficar claro o que cada role recebe no seed.
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  // OPERADOR: read-only escopado por planta + 4 escritas pontuais + ownership de anomalias.
  operador: [
    'dashboard.view',
    'plantas.view',
    'unidades.view',
    'equipamentos.view',
    'anomalias.view',
    'anomalias.report',
    'anomalias.manage_own',
    'programacao_os.view',
    'execucao_os.view',
    'execucao_os.executar',
    'solicitacoes.create',
    'tarefas.update_status',
  ],
  // PROPRIETARIO: espelha analista, com escopo por proprietario_id em runtime
  // + ownership sobre operadores que ele criou. Sem .aprovar (gerente+) nem create_proprietario.
  proprietario: [
    'dashboard.view',
    'plantas.view', 'plantas.manage', 'plantas.manage_operadores',
    'unidades.view', 'unidades.manage',
    'equipamentos.view', 'equipamentos.manage',
    'anomalias.view', 'anomalias.manage', 'anomalias.report',
    'usuarios.view', 'usuarios.create_operador', 'usuarios.manage_created',
    'programacao_os.view', 'programacao_os.manage', 'programacao_os.cancelar',
    'execucao_os.view', 'execucao_os.manage', 'execucao_os.cancelar', 'execucao_os.executar',
    'manutencao.manage',
    'recursos.manage',
    'agenda.manage',
    'solicitacoes.create',
    'tarefas.update_status',
  ],
  analista: [
    'dashboard.view',
    'plantas.view', 'plantas.manage', 'plantas.manage_operadores',
    'unidades.view', 'unidades.manage',
    'equipamentos.view', 'equipamentos.manage',
    'anomalias.view', 'anomalias.manage', 'anomalias.report',
    'usuarios.view',
    'usuarios.create_operador', 'usuarios.create_proprietario',
    'programacao_os.view', 'programacao_os.manage', 'programacao_os.cancelar',
    'execucao_os.view', 'execucao_os.manage', 'execucao_os.cancelar', 'execucao_os.executar',
    'manutencao.manage',
    'recursos.manage',
    'agenda.manage',
    'solicitacoes.create',
    'tarefas.update_status',
  ],
  gerente: [
    'dashboard.view',
    'plantas.view', 'plantas.manage', 'plantas.manage_operadores',
    'unidades.view', 'unidades.manage',
    'equipamentos.view', 'equipamentos.manage',
    'anomalias.view', 'anomalias.manage', 'anomalias.report',
    'usuarios.view',
    'usuarios.create_operador', 'usuarios.create_proprietario', 'usuarios.create_analista',
    'programacao_os.view', 'programacao_os.manage', 'programacao_os.aprovar', 'programacao_os.cancelar',
    'execucao_os.view', 'execucao_os.manage', 'execucao_os.aprovar', 'execucao_os.cancelar', 'execucao_os.executar',
    'manutencao.manage',
    'recursos.manage',
    'agenda.manage',
    'solicitacoes.create',
    'tarefas.update_status',
  ],
  admin: [
    'dashboard.view',
    'plantas.view', 'plantas.manage', 'plantas.manage_operadores',
    'unidades.view', 'unidades.manage',
    'equipamentos.view', 'equipamentos.manage',
    'anomalias.view', 'anomalias.manage', 'anomalias.report',
    'usuarios.view', 'usuarios.manage',
    'usuarios.create_operador', 'usuarios.create_proprietario', 'usuarios.create_analista',
    'programacao_os.view', 'programacao_os.manage', 'programacao_os.aprovar', 'programacao_os.cancelar',
    'execucao_os.view', 'execucao_os.manage', 'execucao_os.aprovar', 'execucao_os.cancelar', 'execucao_os.executar',
    'manutencao.manage',
    'recursos.manage',
    'agenda.manage',
    'solicitacoes.create',
    'tarefas.update_status',
    'admin.impersonate',
  ],
  super_admin: [
    'dashboard.view',
    'plantas.view', 'plantas.manage', 'plantas.manage_operadores',
    'unidades.view', 'unidades.manage',
    'equipamentos.view', 'equipamentos.manage',
    'anomalias.view', 'anomalias.manage', 'anomalias.report',
    'usuarios.view', 'usuarios.manage',
    'usuarios.create_operador', 'usuarios.create_proprietario', 'usuarios.create_analista', 'usuarios.create_admin',
    'programacao_os.view', 'programacao_os.manage', 'programacao_os.aprovar', 'programacao_os.cancelar',
    'execucao_os.view', 'execucao_os.manage', 'execucao_os.aprovar', 'execucao_os.cancelar', 'execucao_os.executar',
    'manutencao.manage',
    'recursos.manage',
    'agenda.manage',
    'solicitacoes.create',
    'tarefas.update_status',
    'admin.impersonate',
  ],
};

export const ROLES = Object.keys(ROLE_PERMISSIONS);

/**
 * Remocoes explicitas a aplicar (one-off) durante a sincronizacao do RBAC.
 *
 * O sync-rbac padrao e idempotente e nao remove vinculos role_has_permissions
 * que nao estao no ROLE_PERMISSIONS atual. Esta lista existe para casos onde
 * a role TINHA uma permission que deveria perder. Aplicada apenas quando
 * o script roda com --apply-removals.
 */
export const ROLE_PERMISSIONS_TO_REMOVE: Record<string, string[]> = {
  operador: [
    // Antes operador tinha CRUD de anomalias; agora so report + manage_own.
    'anomalias.manage',
    // Operador deixou de configurar automacao (read-only + acionar_ponto apenas).
    'equipamentos.manage_bos',
    'equipamentos.manage_pontos',
  ],
};

export function getAllPermissions(): PermissionDef[] {
  return PERMISSIONS;
}

export function getPermissionsByCategory(): Record<string, PermissionDef[]> {
  return PERMISSIONS.reduce<Record<string, PermissionDef[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});
}

export function getTotalPermissions(): number {
  return PERMISSIONS.length;
}
