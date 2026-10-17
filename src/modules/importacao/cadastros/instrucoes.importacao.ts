import { Injectable } from '@nestjs/common';
import { instrucoes, PrismaService, recursos_instrucao } from '@/core';
import { InstrucoesService } from '@/modules/instrucoes/instrucoes.service';
import { CreateInstrucaoDto } from '@/modules/instrucoes/dto/create-instrucao.dto';
import { UpdateInstrucaoDto } from '@/modules/instrucoes/dto/update-instrucao.dto';
import { CadastroImportavel, ErrosDaLinha, UsuarioDaImportacao } from '../importacao.types';
import { CatalogoPorNome, chave } from '../catalogo-por-nome';

type InstrucaoComListas = instrucoes & { recursos: recursos_instrucao[] };

/**
 * O que o formulário grava sem mostrar, na instrução nova
 * (`InstrucoesModal`, valores iniciais). A planilha faz igual: na edição esses
 * campos não vão no payload e ficam como estão.
 */
const PADROES_DA_INSTRUCAO_NOVA = {
  categoria: 'MECANICA',
  tipo_manutencao: 'PREVENTIVA',
  condicao_ativo: 'PARADO',
  criticidade: 3,
  duracao_estimada: 1,
  tempo_estimado: 60,
};

const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * Instruções: cadastro com listas — sub-instruções (os passos) e recursos
 * necessários. As duas listas são substituídas inteiras pelo service; a
 * planilha manda as duas sempre que a seção está na aba.
 *
 * O recurso entra pelo nome do catálogo dentro da categoria da linha. Linha
 * antiga, sem recurso do catálogo (texto livre), continua livre se o texto
 * não mudou.
 */
@Injectable()
export class InstrucoesImportacao implements CadastroImportavel<InstrucaoComListas> {
  readonly singular = 'instrução';
  readonly dtoDeCriacao = CreateInstrucaoDto;
  readonly dtoDeEdicao = UpdateInstrucaoDto;

  constructor(
    private readonly instrucoes: InstrucoesService,
    private readonly prisma: PrismaService,
  ) {}

  async buscar(id: string) {
    await this.instrucoes.buscarPorId(id);
    const instrucao = await this.prisma.instrucoes.findUniqueOrThrow({ where: { id } });
    return { ...instrucao, recursos: await this.prisma.recursos_instrucao.findMany({ where: { instrucao_id: id } }) };
  }

  async prepararDados(dados: Record<string, unknown>, usuario: UsuarioDaImportacao, atual: InstrucaoComListas | null) {
    const resultado: Record<string, unknown> = atual
      ? { ...dados }
      : { ...PADROES_DA_INSTRUCAO_NOVA, ...dados, criado_por: usuario.id };

    // `ativo` segue o status, como no PUT /instrucoes/:id/status, e os dois vão
    // sempre. Até o SN-12 era também o que impedia editar de reativar: o
    // UpdateInstrucaoDto herdava status = ATIVA e ativo = true do Create.
    const status = (dados.status as string | undefined) ?? atual?.status ?? 'ATIVA';
    resultado.status = status;
    resultado.ativo = status === 'ATIVA';

    if (Array.isArray(dados.sub_instrucoes)) {
      resultado.sub_instrucoes = (dados.sub_instrucoes as Array<Record<string, unknown>>).map((passo, i) => ({
        ...passo,
        ordem: i + 1,
      }));
    }

    if (Array.isArray(dados.recursos)) {
      resultado.recursos = await this.resolverRecursos(dados.recursos as Array<Record<string, unknown>>, atual);
    }

    return resultado;
  }

  /** `recurso` (nome) + `recurso_ref` (ID exportado) + `tipo` → `recurso_id`. */
  private async resolverRecursos(linhas: Array<Record<string, unknown>>, atual: InstrucaoComListas | null) {
    const usados = new Set((atual?.recursos ?? []).map((r) => r.recurso_id?.trim()).filter(Boolean));
    const catalogo = await this.prisma.recursos.findMany({
      // Os excluídos só entram se esta instrução já os usa: a exportação os
      // mostra, e reimportar sem mexer não pode dar erro.
      where: { OR: [{ deleted_at: null }, { id: { in: [...usados] as string[] } }] },
      select: { id: true, nome: true, categoria: true },
    });
    const livresDeAntes = (atual?.recursos ?? []).filter((r) => !r.recurso_id);

    const erros: Array<{ campo: string; mensagem: string }> = [];
    const resolvidas = linhas.map((linha, i) => {
      const { recurso, recurso_ref, tipo, ...resto } = linha;
      const nome = typeof recurso === 'string' ? recurso : '';

      const daCategoria = catalogo.filter((r) => !tipo || r.categoria === tipo);
      const achado = new CatalogoPorNome(daCategoria, 'recurso').procurar(nome, [recurso_ref as string]);
      if (typeof achado === 'string') return { ...resto, recurso_id: achado };

      const livre = livresDeAntes.find((r) => r.tipo === tipo && chave(r.descricao) === chave(nome));
      if (livre) return { ...resto, tipo, descricao: livre.descricao, unidade: livre.unidade };

      erros.push({
        campo: `recursos.${i}.recurso`,
        mensagem: tipo ? `${achado.erro} (na categoria da linha)` : achado.erro,
      });
      return resto;
    });

    if (erros.length) throw new ErrosDaLinha(erros);
    return resolvidas;
  }

  async criar(dto: object) {
    return this.instrucoes.criar(dto as CreateInstrucaoDto);
  }

  atualizar(atual: InstrucaoComListas, dto: object) {
    return this.instrucoes.atualizar(atual.id, dto as UpdateInstrucaoDto);
  }

  async retrato(id: string) {
    // Listas em consultas próprias, não por `include`: instrucoes.id é
    // VarChar(26) e as FKs dos filhos são Char(26) com espaço no fim — o
    // Prisma compara em JS e o include volta vazio.
    const [i, passos, recursos] = await Promise.all([
      this.prisma.instrucoes.findUniqueOrThrow({ where: { id } }),
      this.prisma.sub_instrucoes.findMany({ where: { instrucao_id: id }, orderBy: { ordem: 'asc' } }),
      this.prisma.recursos_instrucao.findMany({ where: { instrucao_id: id } }),
    ]);
    return {
      tag: i.tag,
      nome: i.nome,
      descricao: i.descricao,
      status: i.status,
      ativo: i.ativo,
      // A sequência conta, o número da ordem não: a importação renumera 1..n, e
      // uma ordem antiga com buraco (1, 3, 4) não é mudança de ninguém.
      passos: passos.map((p) => [p.descricao, p.obrigatoria, p.tempo_estimado, p.tipo, p.unidade, numero(p.valor_minimo), numero(p.valor_maximo)]),
      // Linha do catálogo: nome, categoria e unidade são cópia do cadastro do
      // recurso, que o service refaz a cada gravação — cópia velha não é
      // mudança de quem importa. Linha livre (antiga): tudo conta.
      recursos: recursos
        .map((r) =>
          r.recurso_id
            ? [r.recurso_id.trim(), numero(r.quantidade), r.obrigatorio]
            : [null, r.tipo, r.descricao, numero(r.quantidade), r.unidade, r.obrigatorio],
        )
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    };
  }

  idDe(atual: InstrucaoComListas) {
    return atual.id.trim();
  }

  nomeDe(atual: InstrucaoComListas | null, dto: object) {
    return (dto as UpdateInstrucaoDto).nome ?? atual?.nome ?? '';
  }

  atualizadoEm(atual: InstrucaoComListas) {
    return atual.updated_at;
  }
}
