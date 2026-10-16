/**
 * Os eventos que avisam alguém (SN-47). Decisão do usuário (16/out): o que
 * importa são as MUDANÇAS DE STATUS da programação, da OS e das origens delas.
 *
 * Quem recebe cada um:
 * - quem tem `permissao` (o próximo passo), dentro do escopo da planta;
 * - os `envolvidos` do registro, também no escopo da planta;
 * - nunca quem causou o evento.
 *
 * `acao`: o evento pede que alguém faça algo. É o que liga o e-mail por padrão
 * (o sininho recebe tudo; a preferência de cada um muda o e-mail).
 */
export type Entidade = 'programacao_os' | 'ordem_servico' | 'anomalia' | 'solicitacao_servico';

/** Pessoas do registro. Na anomalia e na solicitação, `criador` é quem registrou ou pediu. */
export type Envolvido = 'responsavel' | 'tecnicos' | 'criador' | 'autor_origem' | 'cliente';

/** O registro do evento, como o processador o lê na hora de avisar. */
export interface Registro {
  entidade: Entidade;
  id: string;
  plantaId: string | null;
  /** "Programação PRG-2026-069", "OS OSP-2026-0003"... */
  rotulo: string;
  /** Uma linha do que é (a descrição, encurtada). */
  resumo: string;
  /** Caminho na tela que abre o registro. */
  link: string;
  pessoas: Record<Envolvido, string[]>;
}

export interface DefinicaoDoEvento {
  grupo: 'Programações' | 'Ordens de serviço' | 'Anomalias e solicitações';
  /** Como aparece nas preferências. */
  nome: string;
  acao: boolean;
  permissao?: string;
  envolvidos: Envolvido[];
  titulo: (r: Registro) => string;
  /** Complemento da descrição, quando o evento tem algo a dizer além do resumo. */
  nota?: string;
  /**
   * Só avisa a equipe (PAPEIS_DA_EQUIPE: lista de quem pode, tirada da matriz),
   * nem como envolvido nem pela permissão: o comentário interno (SN-48) não pode
   * nem ser anunciado ao cliente, a conta sem papel ou a papel legado.
   */
  soEquipe?: boolean;
}

const NA_PROGRAMACAO: DefinicaoDoEvento['grupo'] = 'Programações';
const NA_OS: DefinicaoDoEvento['grupo'] = 'Ordens de serviço';
const NA_ORIGEM: DefinicaoDoEvento['grupo'] = 'Anomalias e solicitações';

export const EVENTOS = {
  'programacao.criada': {
    grupo: NA_PROGRAMACAO, nome: 'Programação para aprovar', acao: true,
    permissao: 'programacao_os.aprovar', envolvidos: [],
    titulo: (r) => `${r.rotulo} aguarda aprovação`,
  },
  'programacao.aprovada': {
    grupo: NA_PROGRAMACAO, nome: 'Programação aprovada (OS liberada)', acao: true,
    permissao: 'execucao_os.executar', envolvidos: ['responsavel', 'tecnicos', 'autor_origem'],
    titulo: (r) => `${r.rotulo} aprovada: OS liberada para execução`,
  },
  'programacao.cancelada': {
    grupo: NA_PROGRAMACAO, nome: 'Programação cancelada', acao: false,
    envolvidos: ['responsavel', 'tecnicos', 'criador', 'autor_origem'],
    titulo: (r) => `${r.rotulo} cancelada`,
  },
  'os.iniciada': {
    grupo: NA_OS, nome: 'OS iniciada', acao: false, envolvidos: ['criador', 'responsavel'],
    titulo: (r) => `${r.rotulo} em execução`,
  },
  'os.pausada': {
    grupo: NA_OS, nome: 'OS pausada', acao: false, envolvidos: ['criador', 'responsavel'],
    titulo: (r) => `${r.rotulo} pausada`,
  },
  'os.retomada': {
    grupo: NA_OS, nome: 'OS retomada', acao: false, envolvidos: ['criador', 'responsavel'],
    titulo: (r) => `${r.rotulo} retomada`,
  },
  'os.executada': {
    grupo: NA_OS, nome: 'OS para auditar', acao: true, permissao: 'execucao_os.manage', envolvidos: ['criador'],
    titulo: (r) => `${r.rotulo} executada: aguarda auditoria`,
  },
  'os.auditada': {
    grupo: NA_OS, nome: 'OS para finalizar', acao: true, permissao: 'execucao_os.aprovar', envolvidos: [],
    titulo: (r) => `${r.rotulo} auditada: aguarda finalização`,
  },
  'os.reaberta': {
    grupo: NA_OS, nome: 'OS reaberta', acao: true, envolvidos: ['responsavel', 'tecnicos'],
    titulo: (r) => `${r.rotulo} reaberta`,
  },
  'os.finalizada': {
    grupo: NA_OS, nome: 'OS finalizada', acao: false,
    envolvidos: ['responsavel', 'tecnicos', 'criador', 'autor_origem', 'cliente'],
    titulo: (r) => `${r.rotulo} finalizada`, nota: 'O relatório em PDF está disponível.',
  },
  'os.cancelada': {
    grupo: NA_OS, nome: 'OS cancelada', acao: false, envolvidos: ['responsavel', 'tecnicos', 'criador', 'autor_origem'],
    titulo: (r) => `${r.rotulo} cancelada`,
  },
  'anomalia.registrada': {
    grupo: NA_ORIGEM, nome: 'Anomalia registrada', acao: true, permissao: 'programacao_os.manage', envolvidos: [],
    titulo: (r) => `${r.rotulo} registrada`,
  },
  'anomalia.programada': {
    grupo: NA_ORIGEM, nome: 'Anomalia programada', acao: false, envolvidos: ['criador'],
    titulo: (r) => `${r.rotulo} programada`,
  },
  'anomalia.finalizada': {
    grupo: NA_ORIGEM, nome: 'Anomalia resolvida', acao: false, envolvidos: ['criador'],
    titulo: (r) => `${r.rotulo} resolvida`,
  },
  'anomalia.reaberta': {
    grupo: NA_ORIGEM, nome: 'Anomalia de volta à fila', acao: true, permissao: 'programacao_os.manage', envolvidos: ['criador'],
    titulo: (r) => `${r.rotulo} voltou para a fila`,
  },
  'solicitacao.aberta': {
    grupo: NA_ORIGEM, nome: 'Solicitação aberta', acao: true, permissao: 'programacao_os.manage', envolvidos: [],
    titulo: (r) => `${r.rotulo} aberta`,
  },
  'solicitacao.programada': {
    grupo: NA_ORIGEM, nome: 'Solicitação programada', acao: false, envolvidos: ['criador', 'cliente'],
    titulo: (r) => `${r.rotulo} programada`,
  },
  'solicitacao.finalizada': {
    grupo: NA_ORIGEM, nome: 'Solicitação atendida', acao: false, envolvidos: ['criador', 'cliente'],
    titulo: (r) => `${r.rotulo} atendida`,
  },
  'solicitacao.reaberta': {
    grupo: NA_ORIGEM, nome: 'Solicitação de volta à fila', acao: true, permissao: 'programacao_os.manage', envolvidos: ['criador'],
    titulo: (r) => `${r.rotulo} voltou para a fila`,
  },
  // Comentários (SN-48). O aviso não leva o texto do comentário, só o registro
  'os.comentario': {
    grupo: NA_OS, nome: 'Comentário na OS', acao: false, envolvidos: ['responsavel', 'tecnicos', 'criador', 'cliente'],
    titulo: (r) => `Novo comentário na ${r.rotulo}`,
  },
  'os.comentario_interno': {
    grupo: NA_OS, nome: 'Comentário interno na OS', acao: false, envolvidos: ['responsavel', 'tecnicos', 'criador'], soEquipe: true,
    titulo: (r) => `Novo comentário interno na ${r.rotulo}`,
  },
  'solicitacao.comentario': {
    grupo: NA_ORIGEM, nome: 'Comentário na solicitação', acao: false, permissao: 'programacao_os.manage', envolvidos: ['criador', 'cliente'],
    titulo: (r) => `Novo comentário na ${r.rotulo}`,
  },
  'solicitacao.comentario_interno': {
    grupo: NA_ORIGEM, nome: 'Comentário interno na solicitação', acao: false, permissao: 'programacao_os.manage', envolvidos: ['criador'],
    soEquipe: true,
    titulo: (r) => `Novo comentário interno na ${r.rotulo}`,
  },
} satisfies Record<string, DefinicaoDoEvento>;

export type Evento = keyof typeof EVENTOS;

export function ehEvento(valor: string): valor is Evento {
  return Object.prototype.hasOwnProperty.call(EVENTOS, valor);
}
