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

export type ResultadoDaImportacao = {
  confirmado: boolean;
  novos: number;
  alterados: number;
  inalterados: number;
  registros: Array<{ aba: string; linha: number; id: string; nome: string; acao: AcaoDaImportacao }>;
  erros: ProblemaDaImportacao[];
  avisos: ProblemaDaImportacao[];
};

/**
 * Erro de uma linha, com o campo de cada problema. O campo pode ter índice de
 * lista (`recursos.3.recurso`): a importação troca pela linha do item.
 */
export class ErrosDaLinha extends Error {
  constructor(readonly erros: ErroDeCampo[]) {
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

  /** Permissão que depende do registro (ex.: o papel do usuário criado). */
  autorizar?(usuario: UsuarioDaImportacao, dto: object, atual: TAtual | null): Promise<void>;

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
