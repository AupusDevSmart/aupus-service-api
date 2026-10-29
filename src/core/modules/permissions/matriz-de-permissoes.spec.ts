import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { inventariarRotas, type RotaInventariada } from './inventario-de-rotas';
import { PAPEIS, PERMISSOES, permissoesDoPapel } from './matriz-de-permissoes';

/**
 * A matriz de permissões amarrada ao código de verdade (SN-26, SN-27, SN-30).
 *
 * 1. A matriz é coerente: toda permissão de papel existe no catálogo, e a
 *    hierarquia só soma de baixo para cima.
 * 2. Nenhuma rota fica sem regra por esquecimento: ou tem @Permissions, ou está
 *    numa das listas explícitas abaixo (só estar logado / pública).
 * 3. As jornadas do PCM, papel por papel, passam pelo PermissionsGuard real
 *    sobre os metadados das rotas.
 */

const rotas = inventariarRotas();
const porRota = new Map(rotas.map((r) => [r.rota, r]));
const catalogo = new Set(PERMISSOES.map((p) => p.name));

/** Rotas abertas a quem está logado, de propósito (o controller ou o service conferem o resto). */
const SO_LOGADO = [
  'GET /',
  'GET /auth/me',
  'POST /auth/logout',
  // O próprio usuário: perfil, senha (com a atual), foto, as próprias permissões
  'PATCH /usuarios/me',
  'PATCH /usuarios/:id/change-password',
  'POST /usuarios/:id/upload-avatar',
  'GET /usuarios/:id/permissions',
  'GET /usuarios/:id/permissions/categorized',
  'GET /usuarios/:id/permissions/detailed',
  'GET /usuarios/:id/permissions/summary',
  'POST /usuarios/:id/check-permission',
  'POST /usuarios/:id/check-permissions',
  'GET /usuarios/:usuarioId/plantas-operadas',
  // As próprias notificações e preferências: o service filtra pelo usuário logado (SN-47)
  'GET /notificacoes',
  'GET /notificacoes/nao-lidas/contagem',
  'GET /notificacoes/preferencias',
  'PUT /notificacoes/preferencias',
  'PATCH /notificacoes/lidas',
  'PATCH /notificacoes/:id/lida',
  // Catálogos que os formulários usam
  'GET /usuarios/available/permissions',
  'GET /usuarios/available/permissions/grouped',
  'GET /usuarios/available/roles',
  'GET /roles',
  'GET /roles/:id',
  'GET /permissions',
  'GET /permissions/:id',
  'GET /permissions/grouped',
  'GET /concessionarias',
  'GET /concessionarias/:id',
  'GET /concessionarias/:id/anexos',
  'GET /concessionarias/anexos/:anexoId',
  'GET /concessionarias/anexos/:anexoId/download',
  'POST /concessionarias/:id/calcular/a3a-verde',
  'POST /concessionarias/:id/calcular/a4-verde',
  'POST /concessionarias/:id/calcular/b',
  'GET /categorias-equipamentos',
  'GET /categorias-equipamentos/:id',
  'GET /tipos-equipamentos',
  'GET /tipos-equipamentos/:id',
  'GET /tipos-equipamentos/:id/campos-tecnicos',
  'GET /tipos-equipamentos/categorias',
  'GET /tipos-equipamentos/codigo/:codigo',
  'GET /tipos-equipamentos/codigo/:codigo/campos-tecnicos',
  'GET /tipos-equipamentos/estatisticas',
  // Selo "compartilhado com o NexOn" nas telas de cadastro
  'GET /sincronizacao/vinculos/:recurso',
];

/** Rotas sem login nenhum. */
const PUBLICAS = [
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/forgot-password',
  'POST /auth/reset-password',
  // Prova de vida para o deploy e o monitoramento
  'GET /health',
  'GET /health/database',
  // Canal entre os dois servidores: autenticado pelo TokenServicoGuard, não por JWT
  'GET /sincronizacao/ping',
  'POST /sincronizacao/eventos',
  // Chamados do NexON viram solicitação: autenticado pelo TokenNexonGuard (NEXON_CHAMADOS_TOKEN)
  'POST /integracoes/nexon/chamados',
  // Arquivos servidos pelo nome (fotos de equipamento, avatar, arquivos de tarefa)
  'GET /uploads/avatars/:filename',
  'GET /uploads/equipamentos/:filename',
  'GET /uploads/tarefas/:filename',
];

describe('matriz de permissões', () => {
  it('toda permissão de papel existe no catálogo, sem repetir', () => {
    for (const papel of PAPEIS) {
      expect(papel.permissoes.filter((nome) => !catalogo.has(nome))).toEqual([]);
      expect(new Set(papel.permissoes).size).toBe(papel.permissoes.length);
    }
    expect(catalogo.size).toBe(PERMISSOES.length);
  });

  it('cada create_<papel> é de um papel que existe', () => {
    const papeis = new Set(PAPEIS.map((p) => p.name));
    const criaveis = PERMISSOES.map((p) => p.name)
      .filter((n) => n.startsWith('usuarios.create_'))
      .map((n) => n.replace('usuarios.create_', ''));
    expect(criaveis.filter((papel) => !papeis.has(papel))).toEqual([]);
  });

  it('do planejador para cima, cada papel tem tudo o do anterior', () => {
    const ordem = ['analista', 'gerente', 'admin', 'super_admin'];
    for (let i = 1; i < ordem.length; i++) {
      const faltam = permissoesDoPapel(ordem[i - 1]).filter((x) => !permissoesDoPapel(ordem[i]).includes(x));
      expect({ papel: ordem[i], faltam }).toEqual({ papel: ordem[i], faltam: [] });
    }
  });

  it('o cliente só lê (e abre solicitação)', () => {
    const escritas = permissoesDoPapel('proprietario').filter((n) => !n.endsWith('.view') && n !== 'solicitacoes.create');
    expect(escritas).toEqual([]);
  });
});

describe('inventário de rotas', () => {
  it('toda rota tem permissão ou está numa lista explícita', () => {
    const semRegra = rotas
      .filter((r) => !r.publica && r.permissoes.length === 0 && !SO_LOGADO.includes(r.rota))
      .map((r) => `${r.rota} (${r.controller}.${r.metodo})`);
    expect(semRegra).toEqual([]);
  });

  it('só as rotas da lista são públicas', () => {
    const publicas = rotas.filter((r) => r.publica).map((r) => r.rota);
    expect(publicas.filter((r) => !PUBLICAS.includes(r))).toEqual([]);
  });

  it('as listas não guardam rota que não existe mais', () => {
    expect([...SO_LOGADO, ...PUBLICAS].filter((r) => !porRota.has(r))).toEqual([]);
  });

  it('toda permissão citada no código existe no catálogo', () => {
    const citadas = new Set(rotas.flatMap((r) => r.permissoes));
    expect([...citadas].filter((n) => !catalogo.has(n)).sort()).toEqual([]);
  });

  it('não sobra rota de debug ou de teste', () => {
    expect(rotas.map((r) => r.rota).filter((r) => /debug|test/i.test(r))).toEqual([]);
  });
});

/** O PermissionsGuard de verdade, sobre a classe e o método da rota. */
function papelPassa(rota: RotaInventariada, papel: string): boolean {
  const guard = new PermissionsGuard(new Reflector());
  const contexto = {
    getHandler: () => rota.handler,
    getClass: () => rota.classe,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 'x', role: papel, permissions: permissoesDoPapel(papel) } }) }),
  } as unknown as ExecutionContext;
  return guard.canActivate(contexto);
}

const TODOS = ['operador', 'proprietario', 'analista', 'gerente', 'admin', 'super_admin'];
const EXECUTAM = ['operador', 'analista', 'gerente', 'admin', 'super_admin'];
const PLANEJAM = ['analista', 'gerente', 'admin', 'super_admin'];
const GERENCIAM = ['gerente', 'admin', 'super_admin'];
const ADMINISTRAM = ['admin', 'super_admin'];

/** As jornadas do PCM: o que cada papel faz. A tabela é a documentação da matriz. */
const JORNADAS: [string, string, string[]][] = [
  ['ver o painel', 'GET /dashboard/manutencao', TODOS],
  ['ver uma OS (e baixar o PDF)', 'GET /execucao-os/:id', TODOS],
  // SN-62: o conteúdo do PDF e a conferência do código — o cliente baixa e confere os da planta dele
  ['baixar o PDF da OS', 'GET /execucao-os/:id/relatorio', TODOS],
  ['conferir o código do PDF', 'GET /execucao-os/conferencia', TODOS],
  ['iniciar a OS', 'PATCH /execucao-os/:id/iniciar', EXECUTAM],
  ['marcar o checklist', 'PATCH /execucao-os/:id/checklist', EXECUTAM],
  ['anexar foto na OS', 'POST /execucao-os/:id/anexos', EXECUTAM],
  ['executar a OS', 'PATCH /execucao-os/:id/executar', EXECUTAM],
  // SN-61: quem trabalhou sem estar escalado (o técnico de campo não tem a rota da programação)
  ['registrar quem entrou na execução', 'GET /execucao-os/:id/pessoas', EXECUTAM],
  ['auditar a OS', 'PATCH /execucao-os/:id/auditar', PLANEJAM],
  ['finalizar a OS', 'PATCH /execucao-os/:id/finalizar', GERENCIAM],
  ['cancelar a OS', 'PATCH /execucao-os/:id/cancelar', PLANEJAM],
  ['ver programações', 'GET /programacao-os', TODOS],
  ['programar OS', 'POST /programacao-os', PLANEJAM],
  ['escolher responsável e técnicos (SN-31)', 'GET /programacao-os/pessoas', PLANEJAM],
  ['aprovar programação', 'PATCH /programacao-os/:id/aprovar', GERENCIAM],
  ['ler instruções', 'GET /instrucoes', TODOS],
  ['criar instrução', 'POST /instrucoes', PLANEJAM],
  ['associar anomalia à instrução (SN-40)', 'POST /instrucoes/:id/anomalias', PLANEJAM],
  ['desfazer a associação de anomalia e instrução (SN-40)', 'DELETE /instrucoes/:id/anomalias/:anomaliaId', PLANEJAM],
  ['ler planos de manutenção', 'GET /planos-manutencao', TODOS],
  ['criar plano de manutenção', 'POST /planos-manutencao', PLANEJAM],
  // SN-53: o primeiro vencimento de cada tarefa, antes de vincular (quem vincula)
  ['ver os primeiros vencimentos antes de vincular', 'GET /planos-manutencao/:id/primeiros-vencimentos', PLANEJAM],
  ['ver solicitações', 'GET /solicitacoes-servico', TODOS],
  ['abrir solicitação', 'POST /solicitacoes-servico', TODOS],
  ['comentar na solicitação', 'POST /solicitacoes-servico/:id/comentarios', TODOS],
  // Comentários (SN-48): o cliente lê na OS, mas não escreve
  ['ler comentários da solicitação', 'GET /solicitacoes-servico/:id/comentarios', TODOS],
  ['editar o próprio comentário na solicitação', 'PATCH /solicitacoes-servico/:id/comentarios/:comentarioId', TODOS],
  ['ler comentários da OS', 'GET /execucao-os/:id/comentarios', TODOS],
  // Agenda (SN-51): a previsão das preventivas, nas plantas de cada um
  ['ver a previsão da agenda', 'GET /agenda/previsao', TODOS],
  ['ver o calendário de manutenção', 'GET /agenda/eventos', TODOS],
  ['comentar na OS', 'POST /execucao-os/:id/comentarios', EXECUTAM],
  ['editar o próprio comentário na OS', 'PATCH /execucao-os/:id/comentarios/:comentarioId', EXECUTAM],
  ['excluir o próprio comentário na OS', 'DELETE /execucao-os/:id/comentarios/:comentarioId', EXECUTAM],
  ['editar solicitação', 'PATCH /solicitacoes-servico/:id', PLANEJAM],
  ['programar a partir da solicitação', 'POST /solicitacoes-servico/:id/gerar-programacao-os', PLANEJAM],
  // Os padrões da proposta (29/out/2026, no lugar do BDI padrão): a margem da empresa, só quem monta proposta
  ['ler os padrões da proposta', 'GET /solicitacoes-servico/padroes-da-proposta', PLANEJAM],
  ['trocar os padrões da proposta', 'PUT /solicitacoes-servico/padroes-da-proposta', PLANEJAM],
  // A proposta nova (29/out/2026): a logística e a revisão, de quem monta proposta; a herança, de quem programa
  ['tabela de frete, deslocamento ou diárias da proposta', 'PUT /solicitacoes-servico/:id/proposta/logistica/:tabela', PLANEJAM],
  ['revisar a proposta', 'POST /solicitacoes-servico/:id/proposta/revisar', PLANEJAM],
  ['reabrir a proposta', 'POST /solicitacoes-servico/:id/proposta/reabrir', PLANEJAM],
  ['proposta não aprovada', 'POST /solicitacoes-servico/:id/proposta/nao-aprovada', PLANEJAM],
  ['o que a programação herda da proposta', 'GET /solicitacoes-servico/:id/para-programar', PLANEJAM],
  ['ver anomalias', 'GET /anomalias', TODOS],
  ['registrar anomalia', 'POST /anomalias', EXECUTAM],
  ['ver os anexos da anomalia', 'GET /anomalias/:id/anexos', TODOS],
  ['nome e e-mail de todos os usuários (select de anomalias, SN-40)', 'GET /anomalias/selects/usuarios', PLANEJAM],
  ['ver o calendário', 'GET /agenda/calendario/:ano/:mes', TODOS],
  ['cadastrar feriado', 'POST /agenda/feriados', PLANEJAM],
  ['editar planta', 'PUT /plantas/:id', PLANEJAM],
  ['cadastrar equipamento', 'POST /equipamentos', PLANEJAM],
  ['instalar equipamento na posição', 'POST /ativos-funcionais/:id/instalar', PLANEJAM],
  ['criar categoria de equipamento', 'POST /categorias-equipamentos', PLANEJAM],
  ['excluir concessionária', 'DELETE /concessionarias/:id', PLANEJAM],
  ['ver o histórico de OS do equipamento', 'GET /equipamentos/:id/historico-os', TODOS],
  ['ver os componentes do equipamento', 'GET /equipamentos/:ucId/componentes/gerenciar', TODOS],
  ['salvar os componentes do equipamento', 'PUT /equipamentos/:ucId/componentes/batch', PLANEJAM],
  ['reservar viatura', 'POST /reservas', PLANEJAM],
  ['criar usuário', 'POST /usuarios', PLANEJAM],
  ['editar usuário', 'PATCH /usuarios/:id', GERENCIAM],
  ['redefinir a senha de outro', 'PATCH /usuarios/:id/reset-password', GERENCIAM],
  ['compartilhar cadastro com o NexOn', 'POST /sincronizacao/vinculos/:recurso/:id', ADMINISTRAM],
  ['ver métricas do servidor', 'GET /health/metrics/database', ADMINISTRAM],
];

describe('jornadas do PCM por papel (PermissionsGuard real)', () => {
  it.each(JORNADAS)('%s (%s)', (_nome, rota, quemPode) => {
    const r = porRota.get(rota);
    expect(r).toBeDefined();
    const passam = TODOS.filter((papel) => papelPassa(r!, papel));
    expect(passam).toEqual(quemPode);
  });
});
