import { Injectable } from '@nestjs/common';
import { PermissionScopeService, plantas, PlantasService, PrismaService, unidades, UnidadesService } from '@/core';
import { CreatePlantaDto } from '@/core/modules/plantas/dto/create-planta.dto';
import { UpdatePlantaDto } from '@/core/modules/plantas/dto/update-planta.dto';
import { CreateUnidadeDto } from '@/core/modules/unidades/dto/create-unidade.dto';
import { UpdateUnidadeDto } from '@/core/modules/unidades/dto/update-unidade.dto';
import { ErroDeCampo } from '@/common/pipes/mensagens-validacao';
import { CadastroImportavel, ErrosDaLinha, UsuarioDaImportacao } from '../importacao.types';
import { validarComoOFormulario } from '../importacao.service';
import { CatalogoPorNome } from '../catalogo-por-nome';
import { semOQueNaoMudou } from '../sem-o-que-nao-mudou';
import { problemaNoDono } from '@/core/modules/plantas/dono-da-planta';

type PlantaComUnidades = plantas & { unidades: unidades[] };

type UnidadeValidada = { id: string | null; dto: CreateUnidadeDto | UpdateUnidadeDto };
type PlantaValidada = {
  planta: CreatePlantaDto | UpdatePlantaDto;
  unidades?: UnidadeValidada[];
};

/** Campo da planta → coluna (para não revalidar o que não mudou). */
const COLUNAS_DA_PLANTA: Record<string, keyof plantas> = {
  nome: 'nome',
  cnpj: 'cnpj',
  numero_uc: 'numero_uc',
  horarioFuncionamento: 'horario_funcionamento',
  localizacao: 'localizacao',
  proprietarioId: 'proprietario_id',
};

const COLUNAS_DO_ENDERECO: Record<string, keyof plantas> = {
  logradouro: 'logradouro',
  bairro: 'bairro',
  cidade: 'cidade',
  uf: 'uf',
  cep: 'cep',
};

const COLUNAS_DA_UNIDADE: Record<string, keyof unidades> = {
  nome: 'nome',
  tipo: 'tipo',
  numero_uc: 'numero_uc',
  status: 'status',
  grupo: 'grupo',
  tensao_nominal: 'tensao_nominal',
  concessionaria_id: 'concessionaria_id',
  latitude: 'latitude',
  longitude: 'longitude',
};

/** Placeholder para validar unidade de planta nova: o id só existe depois de criar a planta. */
const PLANTA_NOVA = '__planta_nova__';

const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * Plantas: ficha com a seção UNIDADES. Na tela, a planta e cada unidade
 * gravam por endpoints próprios; a importação também (PlantasService,
 * UnidadesService).
 *
 * Unidade nunca é apagada pela planilha: excluir unidade exclui os
 * equipamentos dela. Tirar de uso é o STATUS inativo.
 *
 * Escopo: quem tem escopo de planta só edita as plantas dele, só cria planta
 * em que é o proprietário e não passa a planta para outro dono.
 */
@Injectable()
export class PlantasImportacao implements CadastroImportavel<PlantaComUnidades> {
  readonly singular = 'planta';
  readonly dtoDeCriacao = CreatePlantaDto;
  readonly dtoDeEdicao = UpdatePlantaDto;

  constructor(
    private readonly plantas: PlantasService,
    private readonly unidades: UnidadesService,
    private readonly escopo: PermissionScopeService,
    private readonly prisma: PrismaService,
  ) {}

  async buscar(id: string, usuario: UsuarioDaImportacao) {
    await this.plantas.findOne(id, usuario);
    const planta = await this.prisma.plantas.findUniqueOrThrow({ where: { id } });
    return { ...planta, unidades: await this.unidadesDa(id) };
  }

  private unidadesDa(plantaId: string) {
    return this.prisma.unidades.findMany({ where: { planta_id: plantaId.trim(), deleted_at: null } });
  }

  async prepararDados(dados: Record<string, unknown>, _usuario: UsuarioDaImportacao, atual: PlantaComUnidades | null) {
    const { proprietario, proprietario_ref, endereco, unidades: linhas, ...planta } = dados;
    const resultado: Record<string, unknown> = { ...planta };

    if (proprietario !== undefined || !atual) {
      const candidatos = await this.plantas.findProprietarios();
      // O dono de hoje entra mesmo se deixou de ser "proprietário" no papel:
      // reimportar sem mexer não pode dar erro.
      if (atual && !candidatos.some((c) => c.id.trim() === atual.proprietario_id.trim())) {
        const dono = await this.prisma.usuarios.findUnique({ where: { id: atual.proprietario_id }, select: { id: true, nome: true } });
        if (dono) candidatos.push(dono as (typeof candidatos)[number]);
      }
      const achado = new CatalogoPorNome(candidatos, 'proprietário').procurar(proprietario as string, [proprietario_ref as string]);
      if (typeof achado !== 'string') throw ErrosDaLinha.em('proprietario', achado.erro);
      resultado.proprietarioId = achado;
    }

    if (endereco && typeof endereco === 'object') {
      const mudou = semOQueNaoMudou(endereco as Record<string, unknown>, atual, COLUNAS_DO_ENDERECO);
      if (Object.keys(mudou).length) resultado.endereco = mudou;
    }

    if (Array.isArray(linhas)) {
      resultado.unidades = await this.resolverUnidades(linhas as Array<Record<string, unknown>>, atual, resultado);
    }

    return semOQueNaoMudou(resultado, atual, COLUNAS_DA_PLANTA);
  }

  private async resolverUnidades(
    linhas: Array<Record<string, unknown>>,
    atual: PlantaComUnidades | null,
    planta: Record<string, unknown>,
  ) {
    const porId = new Map((atual?.unidades ?? []).map((u) => [u.id.trim(), u]));
    const usadas = [...porId.values()].map((u) => u.concessionaria_id).filter((id): id is string => !!id);
    const concessionarias = new CatalogoPorNome(
      await this.prisma.concessionarias_energia.findMany({
        where: { OR: [{ deleted_at: null }, { id: { in: usadas } }] },
        select: { id: true, nome: true },
      }),
      'concessionária',
      'f',
    );
    // A unidade nova herda UF e cidade da planta, como o formulário faz.
    const endereco = (planta.endereco ?? {}) as Record<string, unknown>;
    const uf = (endereco.uf as string | undefined) ?? atual?.uf ?? null;
    const cidade = (endereco.cidade as string | undefined) ?? atual?.cidade ?? null;

    const erros: ErroDeCampo[] = [];
    const resolvidas = linhas.map((linha, i) => {
      const { id, concessionaria, concessionaria_ref, ...unidade } = linha;
      const idDaUnidade = typeof id === 'string' && id.trim() ? id.trim() : null;
      const existente = idDaUnidade ? porId.get(idDaUnidade) : undefined;

      if (idDaUnidade && !existente) {
        erros.push({ campo: `unidades.${i}.id`, mensagem: `A unidade ${idDaUnidade} não é desta planta. Em unidade nova, deixe o ID vazio.` });
      }

      const resolvida: Record<string, unknown> = { ...unidade };
      if (typeof concessionaria === 'string' && concessionaria.trim()) {
        const achada = concessionarias.procurar(concessionaria, [concessionaria_ref as string]);
        if (typeof achada === 'string') resolvida.concessionaria_id = achada;
        else erros.push({ campo: `unidades.${i}.concessionaria`, mensagem: achada.erro });
      }

      if (!idDaUnidade) {
        resolvida.estado = typeof uf === 'string' ? uf.toUpperCase() : uf;
        resolvida.cidade = cidade;
      }

      return { id: idDaUnidade, ...semOQueNaoMudou(resolvida, existente ?? null, COLUNAS_DA_UNIDADE) };
    });

    if (erros.length) throw new ErrosDaLinha(erros);
    return resolvidas;
  }

  async validar(dados: Record<string, unknown>, atual: PlantaComUnidades | null): Promise<PlantaValidada> {
    const { unidades: linhas, ...cabecalho } = dados;
    const erros: ErroDeCampo[] = [];

    let planta = cabecalho as UpdatePlantaDto;
    try {
      planta = (await validarComoOFormulario(atual ? UpdatePlantaDto : CreatePlantaDto, cabecalho)) as UpdatePlantaDto;
    } catch (erro) {
      if (!(erro instanceof ErrosDaLinha)) throw erro;
      erros.push(...erro.erros);
    }

    let unidadesValidadas: UnidadeValidada[] | undefined;
    if (Array.isArray(linhas)) {
      unidadesValidadas = [];
      for (const [i, linha] of (linhas as Array<Record<string, unknown>>).entries()) {
        const { id, ...unidade } = linha;
        try {
          const dto = id
            ? await validarComoOFormulario(UpdateUnidadeDto, unidade, `unidades.${i}`)
            : await validarComoOFormulario(CreateUnidadeDto, { ...unidade, planta_id: atual?.id.trim() ?? PLANTA_NOVA }, `unidades.${i}`);
          unidadesValidadas.push({ id: (id as string | null) ?? null, dto: dto as CreateUnidadeDto });
        } catch (erro) {
          if (!(erro instanceof ErrosDaLinha)) throw erro;
          erros.push(...erro.erros);
        }
      }
    }

    if (erros.length) throw new ErrosDaLinha(erros);
    return { planta, unidades: unidadesValidadas };
  }

  async autorizar(usuario: UsuarioDaImportacao, dto: object, atual: PlantaComUnidades | null) {
    const { planta, unidades: linhas } = dto as PlantaValidada;

    // Na tela, unidade grava com permissão própria.
    const mexeEmUnidade = (linhas ?? []).some((l) => !l.id || Object.values(l.dto).some((v) => v !== undefined));
    if (mexeEmUnidade && !usuario.permissions.includes('unidades.manage')) {
      throw ErrosDaLinha.em('unidades', 'Você não tem permissão para criar ou editar unidades (unidades.manage).');
    }

    const escopo = await this.escopo.getScope(usuario);
    if (!this.escopo.isScoped(escopo)) return;

    // A mesma regra do formulário (SN-75)
    const problema = problemaNoDono(usuario, planta.proprietarioId, atual ? atual.proprietario_id : null);
    if (problema) throw ErrosDaLinha.em('proprietario', problema);
  }

  async criar(dto: object) {
    const { planta, unidades: linhas } = dto as PlantaValidada;
    const criada = await this.plantas.create(planta as CreatePlantaDto);
    const id = String(criada.id).trim();
    for (const { dto: unidade } of linhas ?? []) {
      await this.unidades.create({ ...(unidade as CreateUnidadeDto), planta_id: id });
    }
    return { id };
  }

  /** Cabeçalho só se algo mudou; unidade com ID atualiza (se mudou), sem ID cria. Nenhuma é apagada. */
  async atualizar(atual: PlantaComUnidades, dto: object) {
    const { planta, unidades: linhas } = dto as PlantaValidada;
    if (Object.keys(planta).some((campo) => (planta as Record<string, unknown>)[campo] !== undefined)) {
      await this.plantas.update(atual.id.trim(), planta as UpdatePlantaDto);
    }

    for (const { id, dto: unidade } of linhas ?? []) {
      if (!id) {
        await this.unidades.create({ ...(unidade as CreateUnidadeDto), planta_id: atual.id.trim() });
      } else if (Object.values(unidade).some((v) => v !== undefined)) {
        await this.unidades.update(id, unidade as UpdateUnidadeDto);
      }
    }
  }

  async retrato(id: string) {
    const p = await this.prisma.plantas.findUniqueOrThrow({ where: { id } });
    const doPlanta = await this.unidadesDa(id);
    return {
      nome: p.nome,
      cnpj: p.cnpj,
      numero_uc: p.numero_uc,
      horario_funcionamento: p.horario_funcionamento,
      localizacao: p.localizacao,
      proprietario_id: p.proprietario_id.trim(),
      endereco: [p.logradouro, p.bairro, p.cidade, p.uf, p.cep],
      unidades: doPlanta
        .map((u) => [
          u.id.trim(), u.nome, u.tipo, u.numero_uc, u.status, u.grupo, u.tensao_nominal,
          u.concessionaria_id?.trim() ?? null, numero(u.latitude), numero(u.longitude),
        ])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    };
  }

  idDe(atual: PlantaComUnidades) {
    return atual.id.trim();
  }

  nomeDe(atual: PlantaComUnidades | null, dto: object) {
    return (dto as PlantaValidada).planta?.nome ?? atual?.nome ?? '';
  }

  atualizadoEm(atual: PlantaComUnidades) {
    return atual.updated_at;
  }
}
