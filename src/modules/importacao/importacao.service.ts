import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '@/core';
import { TransacaoEmCurso } from '@/core/prisma/transacao-em-curso';
import { errosPorCampo } from '@/common/pipes/mensagens-validacao';
import {
  CadastroImportavel,
  ErrosDaLinha,
  ProblemaDaImportacao,
  RegistroImportado,
  ResultadoDaImportacao,
  UsuarioDaImportacao,
} from './importacao.types';

/** Dá tempo para centenas de registros passarem pelo caminho inteiro do formulário. */
const TEMPO_MAXIMO_DA_TRANSACAO = 5 * 60_000;

/** Para desfazer a transação inteira no fim da prévia — não é erro. */
class DesfazerTudo extends Error {}

type LinhasDosItens = Record<string, number[]>;

/**
 * Importação de planilha de cadastro (`.claude/CLAUDE.md`, "Toda página de
 * cadastro exporta e importa planilha").
 *
 * A prévia e o confirmar são o MESMO caminho: tudo roda dentro de uma
 * transação, registro por registro, e no fim a prévia desfaz e o confirmar
 * grava. É o que garante que a prévia diz exatamente o que o confirmar vai
 * fazer — inclusive os erros que só o service descobre. Confirmar com algum
 * erro também desfaz: é tudo ou nada.
 *
 * Os services do formulário gravam dentro dessa transação porque ela é
 * aberta como `TransacaoEmCurso`, que o PrismaService segue. O que sai do
 * banco (fila de propagação, e-mail, MQTT) espera o commit — e não acontece
 * na prévia.
 *
 * Linha sem id é registro novo; com id, edição. Nada é apagado: registro que
 * sumiu da planilha continua no cadastro.
 */
@Injectable()
export class ImportacaoService {
  private readonly logger = new Logger(ImportacaoService.name);

  constructor(private readonly prisma: PrismaService) {}

  async importar<T>(
    cadastro: CadastroImportavel<T>,
    registros: RegistroImportado[],
    confirmar: boolean,
    usuario: UsuarioDaImportacao,
  ): Promise<ResultadoDaImportacao> {
    const resultado: ResultadoDaImportacao = {
      confirmado: false,
      novos: 0,
      alterados: 0,
      inalterados: 0,
      registros: [],
      erros: [],
      avisos: [],
    };

    let emCurso: TransacaoEmCurso | null = null;

    try {
      await this.prisma.$transaction(
        async (tx) => {
          emCurso = new TransacaoEmCurso(tx);
          await emCurso.rodar(() => this.processarTodos(cadastro, registros, usuario, resultado, emCurso!));

          if (!confirmar || resultado.erros.length > 0) throw new DesfazerTudo();
        },
        { timeout: TEMPO_MAXIMO_DA_TRANSACAO, maxWait: 10_000 },
      );
      resultado.confirmado = true;
    } catch (erro) {
      if (!(erro instanceof DesfazerTudo)) throw erro;
    }

    if (resultado.confirmado && emCurso) await (emCurso as TransacaoEmCurso).executarPendentes();

    return resultado;
  }

  private async processarTodos<T>(
    cadastro: CadastroImportavel<T>,
    registros: RegistroImportado[],
    usuario: UsuarioDaImportacao,
    resultado: ResultadoDaImportacao,
    emCurso: TransacaoEmCurso,
  ) {
    const idsVistos = new Map<string, string>();

    for (const registro of registros) {
      const id = registro.id?.trim() || null;

      if (id) {
        const antes = idsVistos.get(id);
        if (antes) {
          this.erro(resultado, registro, 'id', `O ID ${id} aparece duas vezes na planilha (também em ${antes}).`);
          continue;
        }
        idsVistos.set(id, onde(registro));
      }

      await this.processar(cadastro, { ...registro, id }, usuario, resultado, emCurso);
    }
  }

  /**
   * Um registro dentro do seu próprio savepoint: o erro de um não contamina
   * os outros, e o registro que não mudou nada é desfeito em vez de gravado
   * (os services substituem listas inteiras, e regravar igual trocaria os ids
   * dos filhos e o `updated_at` à toa).
   */
  private async processar<T>(
    cadastro: CadastroImportavel<T>,
    registro: RegistroImportado,
    usuario: UsuarioDaImportacao,
    resultado: ResultadoDaImportacao,
    emCurso: TransacaoEmCurso,
  ) {
    const { dados, linhas } = separarLinhasDosItens(registro.dados ?? {});
    const marca = emCurso.marca();

    await emCurso.tx.$executeRawUnsafe('SAVEPOINT registro_importado');

    const desfazer = async () => {
      await emCurso.tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT registro_importado');
      await emCurso.tx.$executeRawUnsafe('RELEASE SAVEPOINT registro_importado');
      emCurso.descartarDesde(marca);
    };

    let atual: T | null = null;

    try {
      if (registro.id) {
        try {
          atual = await cadastro.buscar(registro.id, usuario);
        } catch (erro) {
          if (erro instanceof HttpException && [403, 404].includes(erro.getStatus())) {
            throw ErrosDaLinha.em(
              'id',
              `Não existe ${cadastro.singular} com o ID ${registro.id} que você possa editar. Para criar um novo, deixe o ID em branco.`,
            );
          }
          throw erro;
        }
      }

      const antes = atual ? await cadastro.retrato(cadastro.idDe(atual)) : null;
      // Antes de gravar: a própria edição troca o updated_at.
      const atualizadoAntes = atual ? cadastro.atualizadoEm(atual) : null;

      const preparados = cadastro.prepararDados
        ? await cadastro.prepararDados(dados, usuario, atual)
        : dados;
      const dto = cadastro.validar
        ? await cadastro.validar(preparados, atual)
        : await validarComoOFormulario(atual ? cadastro.dtoDeEdicao : cadastro.dtoDeCriacao, preparados);
      if (cadastro.autorizar) await cadastro.autorizar(usuario, dto, atual);

      let id: string;
      if (atual) {
        id = cadastro.idDe(atual);
        await cadastro.atualizar(atual, dto, usuario);
      } else {
        id = (await cadastro.criar(dto, usuario)).id.trim();
      }

      const nome = cadastro.nomeDe(atual, dto);

      if (atual && igual(antes, await cadastro.retrato(id))) {
        await desfazer();
        resultado.inalterados++;
        resultado.registros.push({ aba: registro.aba, linha: registro.linha, id, nome, acao: 'inalterado' });
        return;
      }

      await emCurso.tx.$executeRawUnsafe('RELEASE SAVEPOINT registro_importado');

      if (atual) this.avisarSeMudouDepoisDaExportacao(resultado, registro, atualizadoAntes);
      for (const mensagem of cadastro.avisos?.(atual, dto) ?? []) {
        resultado.avisos.push({ aba: registro.aba, linha: registro.linha, mensagem });
      }

      const acao = atual ? 'alterado' : 'novo';
      resultado[acao === 'novo' ? 'novos' : 'alterados']++;
      resultado.registros.push({ aba: registro.aba, linha: registro.linha, id, nome, acao });
    } catch (erro) {
      await desfazer();
      for (const problema of this.problemasDe(erro)) {
        this.erro(resultado, registro, problema.campo, problema.mensagem, linhaDoItem(linhas, problema.campo));
      }
    }
  }

  /** Cada forma de erro que um service ou a validação lança, em frases para a planilha. */
  private problemasDe(erro: unknown): Array<{ campo: string; mensagem: string }> {
    if (erro instanceof ErrosDaLinha) return erro.erros;

    if (erro instanceof HttpException) {
      const resposta = erro.getResponse();
      const mensagem =
        typeof resposta === 'string' ? resposta : (resposta as { message?: string | string[] }).message;
      const mensagens = Array.isArray(mensagem) ? mensagem : [mensagem ?? erro.message];
      return mensagens.map((m) => ({ campo: 'dados', mensagem: String(m) }));
    }

    if (erro instanceof Prisma.PrismaClientKnownRequestError) {
      const motivo =
        erro.code === 'P2002'
          ? 'já existe outro registro com o mesmo valor num campo que não pode repetir'
          : erro.code === 'P2003'
            ? 'aponta para um registro que não existe'
            : `código ${erro.code}`;
      return [{ campo: 'dados', mensagem: `O banco recusou esta linha: ${motivo}.` }];
    }

    this.logger.error('Erro inesperado na importação', erro instanceof Error ? erro.stack : String(erro));
    return [
      {
        campo: 'dados',
        mensagem: `Erro inesperado ao gravar esta linha: ${erro instanceof Error ? erro.message : String(erro)}`,
      },
    ];
  }

  /**
   * A planilha diz quando exportou; se o registro mudou no sistema depois
   * disso, a importação está sobrescrevendo a mudança de alguém. Não bloqueia —
   * avisa na prévia, para quem confirma saber.
   */
  private avisarSeMudouDepoisDaExportacao(
    resultado: ResultadoDaImportacao,
    registro: RegistroImportado,
    atualizadoEm: Date | null,
  ) {
    if (!registro.atualizado_em || !atualizadoEm) return;

    const exportadoEm = new Date(registro.atualizado_em);
    if (Number.isNaN(exportadoEm.getTime())) return;

    // Sem folga: a planilha leva o ISO exato que a API devolveu, e a volta é
    // texto, sem arredondar. Qualquer diferença é edição de outra pessoa.
    if (atualizadoEm.getTime() > exportadoEm.getTime()) {
      resultado.avisos.push({
        aba: registro.aba,
        linha: registro.linha,
        mensagem:
          'Este registro foi alterado no sistema depois da exportação. A planilha vai sobrescrever essa alteração.',
        alterado_em: atualizadoEm.toISOString(),
      });
    }
  }

  private erro(
    resultado: ResultadoDaImportacao,
    registro: RegistroImportado,
    campo: string,
    mensagem: string,
    linha?: number,
  ) {
    const problema: ProblemaDaImportacao = {
      aba: registro.aba,
      linha: linha ?? registro.linha,
      campo,
      mensagem,
    };
    resultado.erros.push(problema);
  }
}

/**
 * Valida como o ValidationPipe global (`main.ts`): mesma conversão, mesmo
 * `whitelist` + `forbidNonWhitelisted`, mesmas frases em português.
 */
export async function validarComoOFormulario(
  Dto: new () => object,
  dados: Record<string, unknown>,
  /** Para item de lista validado à parte: `tarefas.3` → `tarefas.3.nome`. */
  prefixo = '',
): Promise<object> {
  const instancia = plainToInstance(Dto, dados, { enableImplicitConversion: true });
  const erros = await validate(instancia, { whitelist: true, forbidNonWhitelisted: true });
  if (erros.length > 0) throw new ErrosDaLinha(errosPorCampo(erros, prefixo));
  return instancia;
}

/** Tira o `_linha` dos itens de cada lista, guardando a linha de cada índice. */
function separarLinhasDosItens(dados: Record<string, unknown>) {
  const limpos: Record<string, unknown> = {};
  const linhas: LinhasDosItens = {};

  for (const [campo, valor] of Object.entries(dados)) {
    if (Array.isArray(valor) && valor.some((item) => item && typeof item === 'object' && '_linha' in item)) {
      linhas[campo] = [];
      limpos[campo] = valor.map((item, i) => {
        if (!item || typeof item !== 'object') return item;
        const { _linha, ...resto } = item as Record<string, unknown>;
        linhas[campo][i] = Number(_linha);
        return resto;
      });
    } else {
      limpos[campo] = valor;
    }
  }

  return { dados: limpos, linhas };
}

/** `recursos.3.quantidade` → a linha da planilha do 4º recurso. */
function linhaDoItem(linhas: LinhasDosItens, campo: string): number | undefined {
  const achado = /^([^.]+)\.(\d+)(\.|$)/.exec(campo);
  if (!achado) return undefined;
  const linha = linhas[achado[1]]?.[Number(achado[2])];
  return Number.isFinite(linha) ? linha : undefined;
}

function onde(registro: RegistroImportado) {
  return `aba ${registro.aba}, linha ${registro.linha}`;
}

/**
 * Retratos iguais, com texto aparado e vazio igual a nulo: a planilha apara o
 * que lê, e um "Nicolas " gravado pela tela voltaria "Nicolas" — sem isso a
 * reimportação sem mexer acusaria "alterado" onde ninguém mudou nada.
 */
function igual(a: unknown, b: unknown) {
  const normalizar = (_chave: string, valor: unknown) =>
    typeof valor === 'string' ? valor.trim() || null : valor;
  return JSON.stringify(a, normalizar) === JSON.stringify(b, normalizar);
}
