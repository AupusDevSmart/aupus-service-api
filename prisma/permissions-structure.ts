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

  // Usuarios
  { name: 'usuarios.view', display_name: 'Ver Usuarios', description: 'Listar e visualizar usuarios', category: 'Usuarios' },
  { name: 'usuarios.manage', display_name: 'Gerenciar Usuarios', description: 'Editar e deletar usuarios (respeitando hierarquia)', category: 'Usuarios' },
  { name: 'usuarios.create_operador', display_name: 'Criar Operador', description: 'Cadastrar novo usuario com role operador', category: 'Usuarios' },
  { name: 'usuarios.create_proprietario', display_name: 'Criar Proprietario', description: 'Cadastrar novo usuario com role proprietario', category: 'Usuarios' },
  { name: 'usuarios.create_analista', display_name: 'Criar Analista', description: 'Cadastrar novo usuario com role analista', category: 'Usuarios' },
  { name: 'usuarios.create_admin', display_name: 'Criar Admin', description: 'Cadastrar novo usuario com role admin', category: 'Usuarios' },

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

  // Outras paginas AupusService (agrupadas)
  { name: 'manutencao.manage', display_name: 'Gerenciar Manutencao', description: 'Tarefas, instrucoes, planos de manutencao, solicitacoes de servico', category: 'Manutencao' },
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
  operador: [
    'dashboard.view',
    'plantas.view',
    'unidades.view',
    'equipamentos.view',
    'anomalias.view',
    'anomalias.manage', // restrito por planta em runtime
  ],
  proprietario: [
    'dashboard.view',
    'plantas.view',
    'plantas.manage_operadores',
    'unidades.view',
    'equipamentos.view',
    'anomalias.view',
    'anomalias.manage',
    'usuarios.view',
    'usuarios.create_operador',
  ],
  analista: [
    'dashboard.view',
    'plantas.view', 'plantas.manage', 'plantas.manage_operadores',
    'unidades.view', 'unidades.manage',
    'equipamentos.view', 'equipamentos.manage',
    'anomalias.view', 'anomalias.manage',
    'usuarios.view',
    'usuarios.create_operador', 'usuarios.create_proprietario',
    'programacao_os.view', 'programacao_os.manage', 'programacao_os.cancelar',
    'execucao_os.view', 'execucao_os.manage', 'execucao_os.cancelar',
    'manutencao.manage',
    'recursos.manage',
    'agenda.manage',
  ],
  gerente: [
    'dashboard.view',
    'plantas.view', 'plantas.manage', 'plantas.manage_operadores',
    'unidades.view', 'unidades.manage',
    'equipamentos.view', 'equipamentos.manage',
    'anomalias.view', 'anomalias.manage',
    'usuarios.view',
    'usuarios.create_operador', 'usuarios.create_proprietario', 'usuarios.create_analista',
    'programacao_os.view', 'programacao_os.manage', 'programacao_os.aprovar', 'programacao_os.cancelar',
    'execucao_os.view', 'execucao_os.manage', 'execucao_os.aprovar', 'execucao_os.cancelar',
    'manutencao.manage',
    'recursos.manage',
    'agenda.manage',
  ],
  admin: [
    'dashboard.view',
    'plantas.view', 'plantas.manage', 'plantas.manage_operadores',
    'unidades.view', 'unidades.manage',
    'equipamentos.view', 'equipamentos.manage',
    'anomalias.view', 'anomalias.manage',
    'usuarios.view', 'usuarios.manage',
    'usuarios.create_operador', 'usuarios.create_proprietario', 'usuarios.create_analista',
    'programacao_os.view', 'programacao_os.manage', 'programacao_os.aprovar', 'programacao_os.cancelar',
    'execucao_os.view', 'execucao_os.manage', 'execucao_os.aprovar', 'execucao_os.cancelar',
    'manutencao.manage',
    'recursos.manage',
    'agenda.manage',
    'admin.impersonate',
  ],
  super_admin: [
    'dashboard.view',
    'plantas.view', 'plantas.manage', 'plantas.manage_operadores',
    'unidades.view', 'unidades.manage',
    'equipamentos.view', 'equipamentos.manage',
    'anomalias.view', 'anomalias.manage',
    'usuarios.view', 'usuarios.manage',
    'usuarios.create_operador', 'usuarios.create_proprietario', 'usuarios.create_analista', 'usuarios.create_admin',
    'programacao_os.view', 'programacao_os.manage', 'programacao_os.aprovar', 'programacao_os.cancelar',
    'execucao_os.view', 'execucao_os.manage', 'execucao_os.aprovar', 'execucao_os.cancelar',
    'manutencao.manage',
    'recursos.manage',
    'agenda.manage',
    'admin.impersonate',
  ],
};

export const ROLES = Object.keys(ROLE_PERMISSIONS);

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
