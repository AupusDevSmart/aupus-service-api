/**
 * MATRIZ DE PERMISSÕES DO AUPUSSERVICE — fonte única.
 *
 * Quem lê daqui: o seed (`scripts/db/sync-rbac.ts`, que deixa o banco igual a
 * esta matriz), a API (`GET /roles` devolve nome exibido e descrição) e os
 * testes (matriz papel × rota). Mudou aqui, mudou em todo lugar — e o banco só
 * muda quando o sync roda (seed de RBAC pede confirmação, ver CONTRATO-JIRA).
 *
 * Padrão de nome: `recurso.acao`. Leitura (`.view`) separada da escrita
 * (`.manage`), mais verbos pontuais (`.aprovar`, `.executar`, `.cancelar`,
 * `.report`, `.manage_own`, `.create_<papel>`). O decorator `@Permissions`
 * aceita qualquer uma das listadas (OR).
 *
 * As permissões dizem O QUE a pessoa faz; o ESCOPO por planta diz ONDE
 * (operador: plantas vinculadas; proprietario: plantas dele; demais: todas) —
 * ver permission-scope.service.ts.
 *
 * Arquivo sem import de propósito: o seed roda em ts-node e o teste em jest.
 * Documentação completa: skill `roles-permissoes-usuarios`.
 */

export interface PermissaoDef {
  name: string;
  display_name: string;
  description: string;
  category: string;
}

export interface PapelDef {
  /** Nome técnico. NÃO renomear: o AupusNexOn usa os mesmos nomes. */
  name: string;
  /** Como a tela mostra. */
  nome_exibido: string;
  descricao: string;
  /** O que o papel enxerga (aplicado em runtime pelo PermissionScopeService). */
  escopo: string;
  permissoes: string[];
}

const p = (name: string, display_name: string, description: string, category: string): PermissaoDef => ({
  name,
  display_name,
  description,
  category,
});

export const PERMISSOES: PermissaoDef[] = [
  p('dashboard.view', 'Ver painel', 'Painel de manutenção e indicadores (no escopo da pessoa)', 'Painel'),

  p('plantas.view', 'Ver plantas', 'Listar e abrir plantas', 'Cadastros'),
  p('plantas.manage', 'Gerenciar plantas', 'Criar, editar e excluir plantas', 'Cadastros'),
  p('plantas.manage_operadores', 'Vincular técnicos à planta', 'Definir quais técnicos de campo atuam em cada planta', 'Cadastros'),
  p('unidades.view', 'Ver unidades', 'Listar e abrir unidades (instalações)', 'Cadastros'),
  p('unidades.manage', 'Gerenciar unidades', 'Criar, editar e excluir unidades', 'Cadastros'),
  p('equipamentos.view', 'Ver equipamentos', 'Listar e abrir equipamentos, posições e histórico', 'Cadastros'),
  p('equipamentos.manage', 'Gerenciar equipamentos', 'Equipamentos, componentes, posições, categorias e tipos', 'Cadastros'),
  p('concessionarias.manage', 'Gerenciar concessionárias', 'Criar, editar e excluir concessionárias e tarifas (ver é livre)', 'Cadastros'),

  p('manutencao.view', 'Ver instruções e planos', 'Ler instruções, planos de manutenção e tarefas', 'Manutenção'),
  p('manutencao.manage', 'Gerenciar instruções e planos', 'Criar e editar instruções, planos e tarefas; vincular planos', 'Manutenção'),
  p('agenda.view', 'Ver agenda', 'Calendário, feriados e dias úteis', 'Manutenção'),
  p('agenda.manage', 'Gerenciar agenda', 'Cadastrar feriados e dias úteis por planta', 'Manutenção'),

  p('anomalias.view', 'Ver anomalias', 'Listar e abrir anomalias', 'Anomalias e solicitações'),
  p('anomalias.report', 'Registrar anomalia', 'Abrir anomalia em equipamento do escopo', 'Anomalias e solicitações'),
  p('anomalias.manage_own', 'Gerenciar as próprias anomalias', 'Editar as anomalias que a pessoa registrou', 'Anomalias e solicitações'),
  p('anomalias.manage', 'Gerenciar anomalias', 'Editar e excluir qualquer anomalia do escopo', 'Anomalias e solicitações'),
  p('solicitacoes.view', 'Ver solicitações', 'Listar e abrir solicitações de serviço', 'Anomalias e solicitações'),
  p('solicitacoes.create', 'Abrir solicitação', 'Abrir solicitação de serviço', 'Anomalias e solicitações'),
  p('solicitacoes.manage', 'Gerenciar solicitações', 'Analisar, aprovar, editar e encerrar solicitações; proposta', 'Anomalias e solicitações'),

  p('programacao_os.view', 'Ver programações', 'Listar e abrir programações de OS', 'Ordens de serviço'),
  p('programacao_os.manage', 'Programar OS', 'Criar e editar programações de OS', 'Ordens de serviço'),
  p('programacao_os.aprovar', 'Aprovar programação', 'Aprovar a programação (gera a OS)', 'Ordens de serviço'),
  p('programacao_os.cancelar', 'Cancelar programação', 'Cancelar programação de OS', 'Ordens de serviço'),
  p('execucao_os.view', 'Ver OS', 'Listar e abrir OS, baixar anexos e o PDF', 'Ordens de serviço'),
  p('execucao_os.executar', 'Executar OS', 'Iniciar, pausar, marcar o checklist, anexar fotos e concluir a execução', 'Ordens de serviço'),
  p('execucao_os.manage', 'Auditar OS', 'Tudo do executar, mais auditar e reabrir', 'Ordens de serviço'),
  p('execucao_os.aprovar', 'Finalizar OS', 'Encerrar a OS auditada (registra a execução no plano)', 'Ordens de serviço'),
  p('execucao_os.cancelar', 'Cancelar OS', 'Cancelar a OS com motivo', 'Ordens de serviço'),

  p('recursos.manage', 'Gerenciar recursos', 'Materiais, ferramentas, veículos e reservas', 'Recursos'),
  p('equipes.manage', 'Gerenciar equipes', 'Montar as equipes de cada planta', 'Recursos'),

  p('usuarios.view', 'Ver usuários', 'Listar e abrir usuários', 'Usuários'),
  p('usuarios.manage', 'Gerenciar usuários', 'Editar, excluir e redefinir senha (só de quem a pessoa pode criar)', 'Usuários'),
  p('usuarios.create_operador', 'Criar técnico de campo', 'Cadastrar e gerenciar usuários do tipo técnico de campo', 'Usuários'),
  p('usuarios.create_proprietario', 'Criar cliente', 'Cadastrar e gerenciar usuários do tipo cliente', 'Usuários'),
  p('usuarios.create_analista', 'Criar planejador', 'Cadastrar e gerenciar usuários do tipo planejador PCM', 'Usuários'),
  p('usuarios.create_gerente', 'Criar gerente', 'Cadastrar e gerenciar usuários do tipo gerente de manutenção', 'Usuários'),
  p('usuarios.create_admin', 'Criar administrador', 'Cadastrar e gerenciar administradores', 'Usuários'),

  p('sincronizacao.gerenciar', 'Gerenciar sincronização', 'Compartilhar cadastros com o AupusNexOn', 'Sistema'),
  p('sistema.monitorar', 'Monitorar o sistema', 'Alertas e métricas do servidor', 'Sistema'),
];

const VER_O_PROPRIO_ESCOPO = ['dashboard.view', 'plantas.view', 'unidades.view', 'equipamentos.view'];

const PLANEJADOR = [
  ...VER_O_PROPRIO_ESCOPO,
  'plantas.manage',
  'plantas.manage_operadores',
  'unidades.manage',
  'equipamentos.manage',
  'concessionarias.manage',
  'manutencao.view',
  'manutencao.manage',
  'agenda.view',
  'agenda.manage',
  'anomalias.view',
  'anomalias.report',
  'anomalias.manage',
  'solicitacoes.view',
  'solicitacoes.create',
  'solicitacoes.manage',
  'programacao_os.view',
  'programacao_os.manage',
  'programacao_os.cancelar',
  'execucao_os.view',
  'execucao_os.executar',
  'execucao_os.manage',
  'execucao_os.cancelar',
  'recursos.manage',
  'equipes.manage',
  'usuarios.view',
  'usuarios.create_operador',
  'usuarios.create_proprietario',
];

const GERENTE = [
  ...PLANEJADOR,
  'programacao_os.aprovar',
  'execucao_os.aprovar',
  'usuarios.manage',
  'usuarios.create_analista',
];

const ADMIN = [...GERENTE, 'usuarios.create_gerente', 'sincronizacao.gerenciar', 'sistema.monitorar'];

/** Na ordem da hierarquia, do que menos pode ao que mais pode. */
export const PAPEIS: PapelDef[] = [
  {
    name: 'operador',
    nome_exibido: 'Técnico de campo',
    descricao: 'Executa as OS das plantas em que atua: checklist, fotos, materiais e resultado. Abre anomalias e solicitações.',
    escopo: 'Só as plantas em que está vinculado',
    permissoes: [
      ...VER_O_PROPRIO_ESCOPO,
      'manutencao.view',
      'agenda.view',
      'anomalias.view',
      'anomalias.report',
      'anomalias.manage_own',
      'solicitacoes.view',
      'solicitacoes.create',
      'programacao_os.view',
      'execucao_os.view',
      'execucao_os.executar',
    ],
  },
  {
    name: 'proprietario',
    nome_exibido: 'Cliente',
    descricao: 'Acompanha as plantas dele: equipamentos, programações e OS (com o PDF). Abre solicitações de serviço.',
    escopo: 'Só as plantas de que é proprietário',
    permissoes: [
      ...VER_O_PROPRIO_ESCOPO,
      'manutencao.view',
      'agenda.view',
      'anomalias.view',
      'solicitacoes.view',
      'solicitacoes.create',
      'programacao_os.view',
      'execucao_os.view',
    ],
  },
  {
    name: 'analista',
    nome_exibido: 'Planejador PCM',
    descricao: 'Mantém cadastros, planos e agenda; programa e audita as OS; monta equipes. Não aprova programação nem finaliza OS.',
    escopo: 'Todas as plantas',
    permissoes: PLANEJADOR,
  },
  {
    name: 'gerente',
    nome_exibido: 'Gerente de manutenção',
    descricao: 'Tudo do planejador, mais aprovar programações, finalizar OS e gerenciar a equipe de usuários.',
    escopo: 'Todas as plantas',
    permissoes: GERENTE,
  },
  {
    name: 'admin',
    nome_exibido: 'Administrador',
    descricao: 'Tudo do gerente, mais criar gerentes, compartilhar cadastros com o NexOn e monitorar o sistema.',
    escopo: 'Todas as plantas',
    permissoes: ADMIN,
  },
  {
    name: 'super_admin',
    nome_exibido: 'Super administrador',
    descricao: 'Acesso total, inclusive criar administradores.',
    escopo: 'Todas as plantas',
    permissoes: [...ADMIN, 'usuarios.create_admin'],
  },
];

export const PAPEL_POR_NOME: Record<string, PapelDef> = Object.fromEntries(PAPEIS.map((papel) => [papel.name, papel]));

/** O que o papel pode, pelo nome técnico (vazio para papel fora da matriz, como os legados). */
export function permissoesDoPapel(nome: string | null | undefined): string[] {
  return (nome && PAPEL_POR_NOME[nome]?.permissoes) || [];
}

/**
 * Os papéis da equipe: todos os da matriz menos o cliente. Lista de quem PODE
 * (SN-48): o comentário interno só aparece para estes — papel legado, nulo ou
 * fora da matriz não vê, em vez de ver por não ser "proprietario".
 */
export const PAPEIS_DA_EQUIPE: readonly string[] = PAPEIS.filter((papel) => papel.name !== 'proprietario').map((papel) => papel.name);
