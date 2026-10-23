import { Injectable } from '@nestjs/common';
import { instrucoes, instrucao_maquinarios, instrucao_recursos, PrismaService, sub_instrucoes } from '@/core';
import { InstrucoesService } from '@/modules/instrucoes/instrucoes.service';
import { CreateInstrucaoDto } from '@/modules/instrucoes/dto/create-instrucao.dto';
import { UpdateInstrucaoDto } from '@/modules/instrucoes/dto/update-instrucao.dto';
import { variantesDeIds } from '@/modules/tarefas/ids';
import { RecursosService } from '@/modules/recursos/recursos.service';
import { CadastroImportavel, CatalogosDaPlanilha, ErrosDaLinha, UsuarioDaImportacao } from '../importacao.types';
import { CatalogoPorNome, chave } from '../catalogo-por-nome';
import { itensDosRecursosCitados, ROTULO_DA_BASE } from './recursos-citados';

type InstrucaoComListas = instrucoes & {
  passos: sub_instrucoes[];
  recursos: instrucao_recursos[];
  maquinarios: instrucao_maquinarios[];
};
type Linha = Record<string, unknown>;

const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * O valor que a planilha trouxe num campo que a cobrança do item não usa é erro
 * na linha: gravar limparia o campo calado (o formulário só mostra o que a
 * cobrança pede), e a linha por km com as horas na DURAÇÃO custaria zero sem
 * ninguém ver. A tela já manda esses campos vazios.
 */
function foraDaCobranca(linha: Linha, base: string | undefined, caminho: string) {
  if (!base) return [];
  const positivo = (v: unknown) => typeof v === 'number' && v > 0;
  const rotulo = ROTULO_DA_BASE[base] ?? base;
  const erros: Array<{ campo: string; mensagem: string }> = [];
  if (positivo(linha.duracao_horas) && base !== 'hora' && base !== 'diaria') {
    erros.push({ campo: `${caminho}.duracao_horas`, mensagem: `DURAÇÃO [H] não vale para a cobrança ${rotulo}: deixe vazio.` });
  }
  if (positivo(linha.distancia_km) && base !== 'km') {
    erros.push({ campo: `${caminho}.distancia_km`, mensagem: `DISTÂNCIA [KM] não vale para a cobrança ${rotulo}: deixe vazio.` });
  }
  if ((positivo(linha.fator_perda) || linha.fornecido_pelo_cliente === true) && base !== 'unidade') {
    erros.push({ campo: `${caminho}.fator_perda`, mensagem: `PERDA e FD só valem no material (cobrança por unidade), não na ${rotulo}.` });
  }
  return erros;
}
const porTexto = (a: unknown[], b: unknown[]) => JSON.stringify(a).localeCompare(JSON.stringify(b));

/**
 * Instruções: cadastro com listas, na montagem da planilha do AupusProject
 * (SN-85) — os passos, os recursos, o maquinário e os materiais. Cada lista é
 * substituída inteira pelo service; a planilha manda a que está na aba.
 *
 * O item entra pelo nome do cadastro, com o ID ao lado: RECURSOS casa entre os
 * recursos que não são material, MATERIAIS entre os materiais (o mesmo nome
 * pode existir nas duas) e MAQUINÁRIO entre os maquinários. A planilha do
 * Smart Project traz os IDs de lá, que não casam com nenhum daqui: vale o nome.
 */
@Injectable()
export class InstrucoesImportacao implements CadastroImportavel<InstrucaoComListas> {
  readonly singular = 'instrução';
  readonly dtoDeCriacao = CreateInstrucaoDto;
  readonly dtoDeEdicao = UpdateInstrucaoDto;

  constructor(
    private readonly instrucoes: InstrucoesService,
    private readonly recursos: RecursosService,
    private readonly prisma: PrismaService,
  ) {}

  /** Os recursos que as linhas citam: cria o que falta e acerta cobrança e preço no cadastro (SN-98) */
  async itensDosCatalogos({ recursos = [] }: CatalogosDaPlanilha, usuario: UsuarioDaImportacao) {
    return itensDosRecursosCitados(this.prisma, this.recursos, recursos, usuario);
  }

  async buscar(id: string) {
    await this.instrucoes.buscarPorId(id);
    const [instrucao, passos, recursos, maquinarios] = await Promise.all([
      this.prisma.instrucoes.findUniqueOrThrow({ where: { id } }),
      this.prisma.sub_instrucoes.findMany({ where: { instrucao_id: { in: variantesDeIds([id]) } }, orderBy: { ordem: 'asc' } }),
      this.prisma.instrucao_recursos.findMany({ where: { instrucao_id: { in: variantesDeIds([id]) } } }),
      this.prisma.instrucao_maquinarios.findMany({ where: { instrucao_id: id.trim() } }),
    ]);
    return { ...instrucao, passos, recursos, maquinarios };
  }

  async prepararDados(dados: Linha, _usuario: UsuarioDaImportacao, atual: InstrucaoComListas | null) {
    const { ativo, ...resto } = dados;
    const resultado: Linha = { ...resto };

    // `ativo` segue o status, como no PUT /instrucoes/:id/status, e os dois vão
    // sempre (até o SN-12 era o que impedia editar de reativar). A planilha do
    // AupusProject só tem ATIVO; a daqui tem os dois, e os dois têm de bater.
    resultado.status = this.statusDaLinha(dados.status as string | undefined, ativo as boolean | undefined, atual);
    resultado.ativo = resultado.status === 'ATIVA';

    if (Array.isArray(dados.sub_instrucoes)) {
      resultado.sub_instrucoes = (dados.sub_instrucoes as Linha[]).map((passo, i) => ({
        ...this.comOQueSoDaquiTem(passo, atual),
        ordem: i + 1,
      }));
    }

    const erros: Array<{ campo: string; mensagem: string }> = [];
    if (Array.isArray(dados.recursos)) {
      resultado.recursos = await this.resolverRecursos(dados.recursos as Linha[], atual, erros);
    }
    if (Array.isArray(dados.maquinarios)) {
      resultado.maquinarios = await this.resolverMaquinarios(dados.maquinarios as Linha[], atual, erros);
    }
    if (erros.length) throw new ErrosDaLinha(erros);

    return resultado;
  }

  /**
   * A planilha do Smart Project não tem as colunas só daqui: o passo chega SEM a
   * chave `registro` (a daqui a manda sempre, nula quando vazia). Trocar a lista
   * inteira apagaria calada a leitura (unidade e faixa) e a foto que o passo
   * daqui de mesma descrição pedia — as OS seguintes deixariam de pedir a medida
   * e a prova (revisão de segurança do SN-85). O passo novo entra com o padrão.
   */
  private comOQueSoDaquiTem(passo: Linha, atual: InstrucaoComListas | null): Linha {
    if ('registro' in passo || !atual) return passo;
    const daqui = atual.passos.find((p) => chave(p.descricao) === chave(passo.descricao as string));
    if (!daqui) return passo;
    const leitura = daqui.registro === 'LEITURA';
    return {
      ...passo,
      registro: daqui.registro,
      ...(leitura && {
        unidade: daqui.unidade,
        valor_minimo: numero(daqui.valor_minimo),
        valor_maximo: numero(daqui.valor_maximo),
      }),
      ...(!('exige_foto' in passo) && { exige_foto: daqui.exige_foto }),
    };
  }

  /** STATUS vence; sem ele, ATIVO: SIM é Ativa, NÃO mantém o status parado que já havia (ou Inativa) */
  private statusDaLinha(status: string | undefined, ativo: boolean | undefined, atual: InstrucaoComListas | null): string {
    if (status && ativo !== undefined && ativo !== (status === 'ATIVA')) {
      throw new ErrosDaLinha([
        { campo: 'ativo', mensagem: `ATIVO ${ativo ? 'SIM' : 'NÃO'} não bate com o STATUS da linha: deixe os dois iguais (ou um deles vazio).` },
      ]);
    }
    if (status) return status;
    if (ativo === true) return 'ATIVA';
    if (ativo === false) return atual && atual.status !== 'ATIVA' ? atual.status : 'INATIVA';
    return atual?.status ?? 'ATIVA';
  }

  /** `recurso` (nome) + `recurso_ref` (ID exportado) + `grupo` (a seção) → `recurso_id` */
  private async resolverRecursos(linhas: Linha[], atual: InstrucaoComListas | null, erros: Array<{ campo: string; mensagem: string }>) {
    const usados = (atual?.recursos ?? []).map((r) => r.recurso_id.trim());
    const catalogo = await this.prisma.recursos.findMany({
      // Os removidos só entram se esta instrução já os usa: a exportação os
      // mostra, e reimportar sem mexer não pode dar erro.
      where: { OR: [{ deleted_at: null }, { id: { in: variantesDeIds(usados) } }] },
      select: { id: true, nome: true, categoria: true, base_calculo: true },
    });
    const basePorId = new Map(catalogo.map((r) => [r.id.trim(), r.base_calculo]));
    const materiais = new CatalogoPorNome(catalogo.filter((r) => r.categoria === 'MATERIAL'), 'material');
    const outros = new CatalogoPorNome(catalogo.filter((r) => r.categoria !== 'MATERIAL'), 'recurso');

    return linhas.map((linha, i) => {
      const { recurso, recurso_ref, grupo, ...resto } = linha;
      const achado = (grupo === 'materiais' ? materiais : outros).procurar(recurso as string, [recurso_ref as string]);
      if (typeof achado === 'string') {
        erros.push(...foraDaCobranca(resto, basePorId.get(achado), `recursos.${i}`));
        return { ...resto, recurso_id: achado };
      }
      erros.push({ campo: `recursos.${i}.recurso`, mensagem: achado.erro });
      return resto;
    });
  }

  /** `maquinario` (nome) + `maquinario_ref` → `maquinario_id` */
  private async resolverMaquinarios(linhas: Linha[], atual: InstrucaoComListas | null, erros: Array<{ campo: string; mensagem: string }>) {
    const usados = (atual?.maquinarios ?? []).map((m) => m.maquinario_id.trim());
    const cadastro = await this.prisma.maquinarios.findMany({
      where: { OR: [{ deleted_at: null }, { id: { in: variantesDeIds(usados) } }] },
      select: { id: true, nome: true, base_calculo: true },
    });
    const porNome = new CatalogoPorNome(cadastro, 'maquinário');
    const basePorId = new Map(cadastro.map((m) => [m.id.trim(), m.base_calculo]));

    return linhas.map((linha, i) => {
      const { maquinario, maquinario_ref, ...resto } = linha;
      const achado = porNome.procurar(maquinario as string, [maquinario_ref as string]);
      if (typeof achado === 'string') {
        erros.push(...foraDaCobranca(resto, basePorId.get(achado), `maquinarios.${i}`));
        return { ...resto, maquinario_id: achado };
      }
      erros.push({ campo: `maquinarios.${i}.maquinario`, mensagem: achado.erro });
      return resto;
    });
  }

  // O autor é quem importa (o token), como no formulário
  async criar(dto: object, usuario: UsuarioDaImportacao) {
    return this.instrucoes.criar(dto as CreateInstrucaoDto, usuario.id);
  }

  atualizar(atual: InstrucaoComListas, dto: object, usuario: UsuarioDaImportacao) {
    return this.instrucoes.atualizar(atual.id, dto as UpdateInstrucaoDto, usuario.id);
  }

  async retrato(id: string) {
    // Listas em consultas próprias, não por `include`: instrucoes.id é
    // VarChar(26) e as FKs dos filhos são Char(26) com espaço no fim — o
    // Prisma compara em JS e o include volta vazio.
    const [i, passos, recursos, maquinarios] = await Promise.all([
      this.prisma.instrucoes.findUniqueOrThrow({ where: { id } }),
      this.prisma.sub_instrucoes.findMany({ where: { instrucao_id: { in: variantesDeIds([id]) } }, orderBy: { ordem: 'asc' } }),
      this.prisma.instrucao_recursos.findMany({ where: { instrucao_id: { in: variantesDeIds([id]) } } }),
      this.prisma.instrucao_maquinarios.findMany({ where: { instrucao_id: id.trim() } }),
    ]);
    return {
      codigo: i.codigo,
      nome: i.nome,
      descricao: i.descricao,
      frente: i.frente,
      prazo_inicio_relativo: i.prazo_inicio_relativo,
      duracao_dias: i.duracao_dias,
      status: i.status,
      ativo: i.ativo,
      // A sequência conta, o número da ordem não: a importação renumera 1..n, e
      // uma ordem antiga com buraco (1, 3, 4) não é mudança de ninguém.
      passos: passos.map((p) => [
        p.descricao,
        p.obrigatoria,
        p.tipo,
        numero(p.duracao_horas),
        p.registro,
        p.unidade,
        numero(p.valor_minimo),
        numero(p.valor_maximo),
        p.exige_foto,
      ]),
      // Sem ordem no banco: a lista se compara sem ela
      recursos: recursos
        .map((r) => [
          r.recurso_id.trim(),
          numero(r.quantidade),
          numero(r.duracao_horas),
          numero(r.fator_perda),
          r.fornecido_pelo_cliente,
          numero(r.distancia_km),
          numero(r.preco_proprio),
        ])
        .sort(porTexto),
      maquinarios: maquinarios
        .map((m) => [m.maquinario_id.trim(), numero(m.quantidade), numero(m.duracao_horas), numero(m.distancia_km), numero(m.preco_proprio)])
        .sort(porTexto),
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
