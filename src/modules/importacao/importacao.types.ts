import type { ErroDeCampo } from '@/common/pipes/mensagens-validacao';

/** O usuário autenticado, como o JwtStrategy o entrega em `req.user`. */
export type UsuarioDaImportacao = {
  id: string;
  email?: string;
  nome?: string;
  role?: string | null;
  permissions: string[];
};

/** Uma linha do RESUMO (cadastro plano) ou uma aba de ficha, já lida pelo front. */
export type RegistroImportado = {
  /** Vazio = registro novo. */
  id: string | null;
  aba: string;
  linha: number;
  /** O `updated_at` do registro quando foi exportado — para o aviso de "mudou depois". */
  atualizado_em: string | null;
  /**
   * O payload do formulário. Itens de lista podem trazer `_linha` (a linha da
   * planilha, para apontar o erro); a importação tira antes de validar.
   */
  dados: Record<string, unknown>;
};

export type ProblemaDaImportacao = {
  aba: string;
  linha: number;
  campo?: string;
  mensagem: string;
  /** Só nos avisos de "alterado depois da exportação" (ISO, UTC). */
  alterado_em?: string;
};

export type AcaoDaImportacao = 'novo' | 'alterado' | 'inalterado';

/**
 * O que a importação criou ou mudou FORA do cadastro importado (SN-98): o
 * recurso que a planilha de instruções cita, o plano que a de equipamentos
 * cita. A prévia lista no bloco "Outros cadastros": nada disso é gravado sem
 * aparecer ali, e o nome digitado errado aparece como "novo" antes de gravar.
 */
export type OutroCadastro = {
  cadastro: 'recurso' | 'plano';
  acao: 'novo' | 'alterado';
  nome: string;
  /** "Instrumento, por diária, R$ 39,57"; "preço R$ 25,00 → R$ 30,77" */
  detalhe: string;
  aba: string;
  linha: number;
};

export type ResultadoDaImportacao = {
  confirmado: boolean;
  novos: number;
  alterados: number;
  inalterados: number;
  registros: Array<{ aba: string; linha: number; id: string; nome: string; acao: AcaoDaImportacao }>;
  erros: ProblemaDaImportacao[];
  avisos: ProblemaDaImportacao[];
  outros_cadastros: OutroCadastro[];
};

/**
 * Um recurso citado pela planilha de instruções, como a leitura o junta: a
 * cobrança e o preço das linhas da instrução (COBRANÇA e VALOR DO CADASTRO) e
 * a categoria da aba REFERÊNCIAS. A aba e a linha são da primeira linha que o
 * cita, para apontar o erro.
 */
export type RecursoDaPlanilha = {
  nome: string;
  /** O ID DO ITEM da linha: desempata o nome repetido no cadastro (o mesmo nome em categorias diferentes) */
  id: string | null;
  grupo: 'recursos' | 'materiais';
  categoria: string | null;
  base_calculo: string | null;
  preco: number | null;
  unidade: string | null;
  aba: string;
  linha: number;
  /**
   * O que o front não reconheceu na aba REFERÊNCIAS para este item (categoria,
   * cobrança ou custo fora da lista): só vira erro se o recurso for criado — é só
   * para ele que a REFERÊNCIAS conta.
   */
  problemas: string[];
};

/** Uma tarefa do plano citado pela planilha de equipamentos, já com os códigos (frequência, criticidade) */
export type TarefaDoPlanoDaPlanilha = {
  nome: string | null;
  instrucao: string;
  frequencia: string | null;
  frequencia_personalizada: number | null;
  criticidade: number | null;
};

/**
 * Um plano citado por uma aba da planilha de equipamentos: o nome da coluna
 * PLANO, a CATEGORIA e as TAREFAS DO PLANO daquela aba. Uma entrada por aba: é o
 * servidor que junta as do mesmo plano, porque só ele sabe se o plano existe — e
 * plano que existe não usa as tarefas da planilha, então tarefas diferentes
 * entre abas (cópias customizadas) e linha que o front não entendeu (`problemas`)
 * só são erro quando o plano vai ser criado.
 */
export type PlanoDaPlanilha = {
  nome: string;
  categoria: string | null;
  tarefas: TarefaDoPlanoDaPlanilha[];
  aba: string;
  /** A linha do PLANO no cabeçalho da ficha */
  linha: number;
  /** O ID DO PLANO da ficha (o template quando a planilha foi exportada): o nome trocado não cria plano calado */
  plano_ref: string | null;
  /** O ID da ficha: o plano de hoje deste equipamento, pelo nome da cópia ou do template (mesmo excluído), não é plano novo */
  equipamento_id: string | null;
  /** A linha do título da seção TAREFAS DO PLANO (1 quando a aba não tem a seção) */
  linha_das_tarefas: number;
  /** As linhas de tarefa que o front não conseguiu ler (periodicidade fora da lista, sem instrução...) */
  problemas: Array<{ linha: number; mensagem: string }>;
};

/** O que a planilha cita de outros cadastros e a importação cria ou atualiza antes dos registros (SN-98) */
export type CatalogosDaPlanilha = {
  recursos?: RecursoDaPlanilha[];
  planos?: PlanoDaPlanilha[];
};

/**
 * Um item de catálogo para o motor gravar: `gravar` cria ou atualiza pelo
 * service da tela e diz o que fez (nada, se o cadastro já estava igual), ou
 * lança o erro — que vira linha de erro com o nome do item.
 */
export type ItemDeCatalogo = {
  aba: string;
  linha: number;
  /** Para o erro: "recursos", "plano" */
  campo: string;
  /** "Recurso Ajudante", "Plano Inversor string" — o começo da frase do erro */
  rotulo: string;
  gravar: () => Promise<{ feito?: Omit<OutroCadastro, 'aba' | 'linha'>; avisos?: Array<{ aba?: string; linha?: number; mensagem: string }> } | null>;
};

/** O erro de um campo; `aba` e `linha` quando o problema está em outro lugar da planilha (o plano citado por várias abas) */
export type ErroNaPlanilha = ErroDeCampo & { aba?: string; linha?: number };

/**
 * Erro de uma linha, com o campo de cada problema. O campo pode ter índice de
 * lista (`recursos.3.recurso`): a importação troca pela linha do item.
 */
export class ErrosDaLinha extends Error {
  constructor(readonly erros: ErroNaPlanilha[]) {
    super(erros.map((e) => e.mensagem).join('; '));
  }

  static em(campo: string, mensagem: string) {
    return new ErrosDaLinha([{ campo, mensagem }]);
  }
}

/**
 * Um cadastro que se importa por planilha.
 *
 * A importação não tem regra própria: valida com os MESMOS DTOs do formulário
 * e grava pelos MESMOS services. Cada implementação só diz quais são eles,
 * como trocar nome por id nas referências a outros cadastros e o que conta
 * para dizer que um registro mudou.
 */
export interface CadastroImportavel<TAtual = unknown> {
  /** "recurso" — para as mensagens. */
  singular: string;
  dtoDeCriacao: new () => object;
  dtoDeEdicao: new () => object;

  /**
   * O registro pelo id, com o mesmo escopo da tela: o que o usuário não vê é
   * "não encontrado" (NotFoundException ou ForbiddenException).
   */
  buscar(id: string, usuario: UsuarioDaImportacao): Promise<TAtual>;

  /**
   * Troca os nomes da planilha pelos ids e tira o que é só da planilha (nome
   * de referência, id do item) — o DTO recusaria campo a mais. Erros saem como
   * `ErrosDaLinha`, com o caminho do item.
   */
  prepararDados?(
    dados: Record<string, unknown>,
    usuario: UsuarioDaImportacao,
    atual: TAtual | null,
  ): Promise<Record<string, unknown>>;

  /**
   * Para o registro que grava por mais de um endpoint da tela (o plano e as
   * tarefas dele): valida cada parte com o DTO dela. Sem isto, o payload
   * inteiro passa pelo `dtoDeCriacao`/`dtoDeEdicao`.
   */
  validar?(dados: Record<string, unknown>, atual: TAtual | null): Promise<object>;

  /** Permissão que depende do registro (ex.: o papel do usuário criado). */
  autorizar?(usuario: UsuarioDaImportacao, dto: object, atual: TAtual | null): Promise<void>;

  /**
   * O que a planilha cita de outros cadastros e tem de existir antes dos
   * registros (SN-98). O motor grava cada item num savepoint próprio, na mesma
   * transação (a prévia desfaz junto), e o erro de um não derruba os outros.
   */
  itensDosCatalogos?(catalogos: CatalogosDaPlanilha, usuario: UsuarioDaImportacao): Promise<ItemDeCatalogo[]>;

  criar(dto: object, usuario: UsuarioDaImportacao): Promise<{ id: string }>;
  atualizar(atual: TAtual, dto: object, usuario: UsuarioDaImportacao): Promise<unknown>;

  /**
   * Avisos de um registro que vai ser gravado (não bloqueiam): o que a pessoa
   * precisa saber antes de confirmar e que nenhuma regra recusa.
   */
  avisos?(atual: TAtual | null, dto: object): string[];

  /** O que conta para "alterado" — sem ids de filho nem datas, que mudam sem o dado mudar. */
  retrato(id: string): Promise<unknown>;

  /** O id já sem o espaço do Char(26). */
  idDe(atual: TAtual): string;
  nomeDe(atual: TAtual | null, dto: object): string;
  atualizadoEm(atual: TAtual): Date | null;
}
