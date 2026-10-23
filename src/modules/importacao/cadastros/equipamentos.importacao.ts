import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { equipamentos, equipamentos_dados_tecnicos, EquipamentosService, PermissionScopeService, PrismaService } from '@/core';
import { CreateEquipamentoDto } from '@/core/modules/equipamentos/dto/create-equipamento.dto';
import { UpdateEquipamentoDto } from '@/core/modules/equipamentos/dto/update-equipamento.dto';
import { conferirCriticidade, criticidadeSugerida, type CriticidadeDoEquipamento } from '@/core/modules/equipamentos/criticidade-pela-matriz';
import { PlanosManutencaoService } from '@/modules/planos-manutencao/planos-manutencao.service';
import { ErroDeCampo } from '@/common/pipes/mensagens-validacao';
import { CadastroImportavel, CatalogosDaPlanilha, ErrosDaLinha, UsuarioDaImportacao } from '../importacao.types';
import { validarComoOFormulario } from '../importacao.service';
import { CatalogoPorNome, chave } from '../catalogo-por-nome';
import { semOQueNaoMudou } from '../sem-o-que-nao-mudou';
import { PlanosImportacao } from './planos.importacao';
import { itensDosPlanosCitados } from './planos-citados';

type EquipamentoComListas = equipamentos & {
  componentes: equipamentos[];
  dadosTecnicos: equipamentos_dados_tecnicos[];
  /** O template de que vem a cópia do plano deste equipamento. */
  planoDeOrigem: string | null;
};

type ComponenteValidado = { id: string | null; dto: CreateEquipamentoDto | UpdateEquipamentoDto };
type EquipamentoValidado = {
  equipamento: CreateEquipamentoDto | UpdateEquipamentoDto;
  componentes?: ComponenteValidado[];
  /** Template a vincular — só quando muda. */
  planoId?: string;
};

/** Campo do formulário → coluna (o que não mudou sai do payload). */
const COLUNAS_DA_UC: Record<string, keyof equipamentos> = {
  nome: 'nome',
  tag: 'tag',
  tipo_equipamento_id: 'tipo_equipamento_id',
  tipo_equipamento: 'tipo_equipamento',
  fabricante: 'fabricante',
  numero_serie: 'numero_serie',
  criticidade: 'criticidade',
  // SN-64
  criticidade_impacto: 'criticidade_impacto',
  criticidade_probabilidade: 'criticidade_probabilidade',
  criticidade_motivo: 'criticidade_motivo',
  localizacao: 'localizacao',
  valor_contabil: 'valor_contabil',
  // SN-66
  fornecedor: 'fornecedor',
  centro_custo: 'centro_custo',
  status: 'status',
  mcpse: 'mcpse',
  tuc: 'tuc',
  a1: 'a1',
  a2: 'a2',
  a3: 'a3',
  a4: 'a4',
  a5: 'a5',
  a6: 'a6',
};

const COLUNAS_DO_COMPONENTE: Record<string, keyof equipamentos> = {
  nome: 'nome',
  tag: 'tag',
  tipo_equipamento_id: 'tipo_equipamento_id',
  tipo_equipamento: 'tipo_equipamento',
  fabricante: 'fabricante',
  numero_serie: 'numero_serie',
  criticidade: 'criticidade',
  criticidade_impacto: 'criticidade_impacto',
  criticidade_probabilidade: 'criticidade_probabilidade',
  criticidade_motivo: 'criticidade_motivo',
  localizacao_especifica: 'localizacao_especifica',
  fornecedor: 'fornecedor',
  centro_custo: 'centro_custo',
  valor_imobilizado: 'valor_imobilizado',
  valor_depreciacao: 'valor_depreciacao',
  valor_contabil: 'valor_contabil',
  observacoes: 'observacoes',
};

/** Placeholder para validar componente de UC nova: o id só existe depois de criá-la. */
const UC_NOVA = '__uc_nova__';

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));
/** Os dados técnicos numa forma comparável, sem ordem e com texto aparado. */
const formaDosDadosTecnicos = (lista: Array<Record<string, unknown>>) =>
  JSON.stringify(
    lista
      .map((d) => [d.campo, d.valor, d.tipo, d.unidade].map((v) => (typeof v === 'string' ? v.trim() || null : (v ?? null))))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );

/** A data do calendário como a tela manda: meia-noite UTC do dia. */
const comoATela = (d: unknown) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00.000Z` : d);

/**
 * A regra da matriz (SN-64) já na validação, para o erro sair na linha certa:
 * no service, o de um componente caía na linha 1 da aba, sem dizer qual.
 * O service confere de novo ao gravar (é a mesma função).
 */
function erroDaMatriz(atual: CriticidadeDoEquipamento, dados: Record<string, unknown>, campo: string, nome?: unknown): ErroDeCampo | null {
  try {
    conferirCriticidade(atual, dados as CriticidadeDoEquipamento);
    return null;
  } catch (erro) {
    if (!(erro instanceof BadRequestException)) throw erro;
    return { campo, mensagem: typeof nome === 'string' && nome.trim() ? `${nome.trim()}: ${erro.message}` : erro.message };
  }
}

/**
 * Equipamentos: uma ficha por UC, com DADOS TÉCNICOS e COMPONENTES UAR.
 * Decidido com o usuário (09/out/2026):
 *
 * - O PLANO entra pelo nome do template. Trocar é o mesmo "vincular" da tela
 *   (recria a cópia e perde as customizações); vazio mantém o que está.
 * - As tarefas do plano saem só para leitura: a importação nunca transforma
 *   tarefa herdada em customizada.
 * - Posição (ativo funcional), pontos e MQTT ficam na tela.
 * - Componente que sumiu da seção não é apagado; a unidade da UC não se troca
 *   pela planilha (a tela também não troca).
 */
@Injectable()
export class EquipamentosImportacao implements CadastroImportavel<EquipamentoComListas> {
  readonly singular = 'equipamento';
  readonly dtoDeCriacao = CreateEquipamentoDto;
  readonly dtoDeEdicao = UpdateEquipamentoDto;

  constructor(
    private readonly equipamentos: EquipamentosService,
    private readonly planos: PlanosManutencaoService,
    private readonly escopo: PermissionScopeService,
    private readonly prisma: PrismaService,
    private readonly planosDaPlanilha: PlanosImportacao,
  ) {}

  /** O plano que a coluna PLANO cita e não existe: criado com as TAREFAS DO PLANO da aba (SN-98) */
  async itensDosCatalogos({ planos = [] }: CatalogosDaPlanilha, usuario: UsuarioDaImportacao) {
    return itensDosPlanosCitados(this.prisma, this.planosDaPlanilha, planos, usuario);
  }

  async buscar(id: string, usuario: UsuarioDaImportacao) {
    await this.equipamentos.findOne(id, usuario);
    const uc = await this.prisma.equipamentos.findUniqueOrThrow({ where: { id } });
    // A ficha é da UC; o componente se edita dentro dela.
    if (uc.classificacao !== 'UC') throw new NotFoundException('Equipamento não encontrado');
    return { ...uc, ...(await this.listasDa(id)) };
  }

  private async listasDa(id: string) {
    const [componentes, dadosTecnicos, copia] = await Promise.all([
      this.prisma.equipamentos.findMany({ where: { equipamento_pai_id: id.trim(), deleted_at: null } }),
      this.prisma.equipamentos_dados_tecnicos.findMany({ where: { equipamento_id: id.trim() } }),
      this.prisma.planos_manutencao.findFirst({ where: { equipamento_id: id.trim(), deleted_at: null } }),
    ]);
    return { componentes, dadosTecnicos, planoDeOrigem: copia?.plano_origem_id?.trim() ?? null };
  }

  async prepararDados(dados: Record<string, unknown>, usuario: UsuarioDaImportacao, atual: EquipamentoComListas | null) {
    const {
      planta, planta_ref, unidade, unidade_ref, modelo, modelo_ref, plano, plano_ref,
      dados_tecnicos: dadosTecnicos, componentes, data_imobilizacao, data_instalacao, garantia_ate, ...uc
    } = dados;
    const erros: ErroDeCampo[] = [];
    const resultado: Record<string, unknown> = { ...uc };
    if (data_imobilizacao !== undefined) resultado.data_imobilizacao = comoATela(data_imobilizacao);
    // SN-66: as datas vão sempre (como a de imobilização); o retrato as compara
    if (data_instalacao !== undefined) resultado.data_instalacao = comoATela(data_instalacao);
    if (garantia_ate !== undefined) resultado.garantia_ate = comoATela(garantia_ate);

    if (!atual) {
      resultado.classificacao = 'UC';
      resultado.em_operacao = 'sim';
    }

    const unidadeId = await this.resolverUnidade(planta, planta_ref, unidade, unidade_ref, usuario, atual, erros);
    if (unidadeId && !atual) resultado.unidade_id = unidadeId;

    const modelos = await this.catalogoDeModelos();
    this.resolverModelo(modelo, modelo_ref, modelos, resultado, 'modelo', !atual, atual?.tipo_equipamento_id ?? null, erros);

    const planoId = await this.resolverPlano(plano, plano_ref, atual, erros);
    if (planoId) resultado.plano_id = planoId;

    if (Array.isArray(dadosTecnicos) && this.dadosTecnicosMudaram(dadosTecnicos as Array<Record<string, unknown>>, atual)) {
      resultado.dados_tecnicos = dadosTecnicos;
    }

    if (Array.isArray(componentes)) {
      resultado.componentes = (componentes as Array<Record<string, unknown>>).map((linha, i) =>
        this.resolverComponente(linha, i, atual, modelos, erros),
      );
    }

    if (erros.length) throw new ErrosDaLinha(erros);
    return semOQueNaoMudou(resultado, atual, COLUNAS_DA_UC);
  }

  /**
   * A unidade pelo nome, dentro da planta. Na UC nova é obrigatória; na que
   * existe, só pode continuar a mesma.
   */
  private async resolverUnidade(
    planta: unknown, plantaRef: unknown, unidade: unknown, unidadeRef: unknown,
    usuario: UsuarioDaImportacao, atual: EquipamentoComListas | null, erros: ErroDeCampo[],
  ): Promise<string | null> {
    const temUnidade = typeof unidade === 'string' && unidade.trim();
    if (!temUnidade) {
      if (!atual) erros.push({ campo: 'unidade', mensagem: 'Informe a UNIDADE da UC nova.' });
      return null;
    }

    const escopo = await this.escopo.getScope(usuario);
    const doEscopo = this.escopo.isScoped(escopo) ? { planta_id: { in: escopo } } : {};
    const unidades = await this.prisma.unidades.findMany({
      where: { OR: [{ deleted_at: null, ...doEscopo }, ...(atual?.unidade_id ? [{ id: atual.unidade_id }] : [])] },
      select: { id: true, nome: true, planta_id: true, planta: { select: { nome: true } } },
    });

    // Com a planta preenchida, a unidade é procurada só nela (nome de unidade
    // se repete entre plantas).
    const nomeDaPlanta = typeof planta === 'string' ? chave(planta) : '';
    const naPlanta = unidades.filter(
      (u) => !nomeDaPlanta || chave(u.planta.nome) === nomeDaPlanta || u.planta_id.trim() === String(plantaRef ?? '').trim(),
    );
    const achada = new CatalogoPorNome(naPlanta, 'unidade', 'f').procurar(unidade as string, [unidadeRef as string]);
    if (typeof achada !== 'string') {
      erros.push({ campo: 'unidade', mensagem: nomeDaPlanta ? `${achada.erro} (na planta da linha)` : achada.erro });
      return null;
    }

    if (atual && achada !== atual.unidade_id?.trim()) {
      erros.push({ campo: 'unidade', mensagem: 'A unidade de uma UC não se troca pela planilha (nem pela tela).' });
      return null;
    }
    return achada;
  }

  private async catalogoDeModelos() {
    const modelos = await this.prisma.tipos_equipamentos.findMany({ select: { id: true, nome: true, codigo: true, fabricante: true } });
    return { catalogo: new CatalogoPorNome(modelos, 'modelo'), porId: new Map(modelos.map((m) => [m.id.trim(), m])) };
  }

  /** Modelo pelo nome ou código → `tipo_equipamento_id`, `tipo_equipamento` (código) e `fabricante`, como o formulário. */
  private resolverModelo(
    modelo: unknown, modeloRef: unknown, modelos: Awaited<ReturnType<EquipamentosImportacao['catalogoDeModelos']>>,
    alvo: Record<string, unknown>, campo: string, obrigatorio: boolean, modeloAtual: string | null, erros: ErroDeCampo[],
  ) {
    if (!(typeof modelo === 'string' && modelo.trim())) {
      if (obrigatorio) erros.push({ campo, mensagem: 'Informe o MODELO.' });
      return;
    }
    const achado = modelos.catalogo.procurar(modelo, [modeloRef as string]);
    if (typeof achado !== 'string') {
      erros.push({ campo, mensagem: achado.erro });
      return;
    }
    // Mesmo modelo: não mexe. O fabricante gravado pode diferir do cadastro do
    // modelo (dado antigo), e reimportar sem mexer não pode trocá-lo.
    if (achado === modeloAtual?.trim()) return;
    const m = modelos.porId.get(achado)!;
    alvo.tipo_equipamento_id = m.id.trim();
    alvo.tipo_equipamento = m.codigo;
    alvo.fabricante = m.fabricante;
  }

  /** O template pelo nome; só volta o id quando é outro que não o atual. */
  private async resolverPlano(plano: unknown, planoRef: unknown, atual: EquipamentoComListas | null, erros: ErroDeCampo[]) {
    if (!(typeof plano === 'string' && plano.trim())) return null;

    // O plano de hoje, pelo nome do template ou da cópia (que pode estar
    // desatualizado): não muda nada — mesmo se houver outro template com esse
    // nome, se o template tiver sido excluído, ou se for um plano antigo,
    // ligado direto ao equipamento, de antes do plano por categoria.
    if (atual) {
      const deHoje = await this.prisma.planos_manutencao.findMany({
        where: {
          OR: [
            ...(atual.planoDeOrigem ? [{ id: atual.planoDeOrigem }] : []),
            { equipamento_id: atual.id.trim(), deleted_at: null },
          ],
        },
        select: { nome: true },
      });
      if (deHoje.some((p) => chave(p.nome) === chave(plano))) return null;
    }

    const templates = await this.prisma.planos_manutencao.findMany({
      where: { plano_origem_id: null, deleted_at: null },
      select: { id: true, nome: true },
    });
    const achado = new CatalogoPorNome(templates, 'plano').procurar(plano, [planoRef as string]);
    if (typeof achado !== 'string') {
      erros.push({ campo: 'plano', mensagem: achado.erro });
      return null;
    }
    return achado === atual?.planoDeOrigem ? null : achado;
  }

  /**
   * A lista é regravada inteira pelo service: só vai se algo mudou. Sem
   * ordem: o banco não guarda ordem para dado técnico.
   */
  private dadosTecnicosMudaram(linhas: Array<Record<string, unknown>>, atual: EquipamentoComListas | null) {
    if (!atual) return linhas.length > 0;
    const novas = formaDosDadosTecnicos(linhas);
    const antigas = formaDosDadosTecnicos(atual.dadosTecnicos);
    return novas !== antigas;
  }

  private resolverComponente(
    linha: Record<string, unknown>, i: number, atual: EquipamentoComListas | null,
    modelos: Awaited<ReturnType<EquipamentosImportacao['catalogoDeModelos']>>, erros: ErroDeCampo[],
  ) {
    const { id, modelo, modelo_ref, data_instalacao, garantia_ate, ...componente } = linha;
    const idDoComponente = typeof id === 'string' && id.trim() ? id.trim() : null;
    const existente = idDoComponente ? atual?.componentes.find((c) => c.id.trim() === idDoComponente) : undefined;

    if (idDoComponente && !existente) {
      erros.push({ campo: `componentes.${i}.id`, mensagem: `O componente ${idDoComponente} não é desta UC. Em componente novo, deixe o ID vazio.` });
    }

    const resolvido: Record<string, unknown> = { ...componente };
    if (data_instalacao !== undefined) resolvido.data_instalacao = comoATela(data_instalacao);
    if (garantia_ate !== undefined) resolvido.garantia_ate = comoATela(garantia_ate);
    this.resolverModelo(
      modelo, modelo_ref, modelos, resolvido, `componentes.${i}.modelo`, false, existente?.tipo_equipamento_id ?? null, erros,
    );
    if (!idDoComponente) resolvido.classificacao = 'UAR';

    return { id: idDoComponente, ...semOQueNaoMudou(resolvido, existente ?? null, COLUNAS_DO_COMPONENTE) };
  }

  async validar(dados: Record<string, unknown>, atual: EquipamentoComListas | null): Promise<EquipamentoValidado> {
    const { componentes, plano_id, ...uc } = dados;
    const erros: ErroDeCampo[] = [];

    let equipamento = uc as UpdateEquipamentoDto;
    try {
      equipamento = (await validarComoOFormulario(atual ? UpdateEquipamentoDto : CreateEquipamentoDto, uc)) as UpdateEquipamentoDto;
      const daUc = erroDaMatriz(atual ?? {}, uc, 'criticidade');
      if (daUc) erros.push(daUc);
    } catch (erro) {
      if (!(erro instanceof ErrosDaLinha)) throw erro;
      erros.push(...erro.erros);
    }

    let validados: ComponenteValidado[] | undefined;
    if (Array.isArray(componentes)) {
      validados = [];
      for (const [i, linha] of (componentes as Array<Record<string, unknown>>).entries()) {
        const { id, ...componente } = linha;
        try {
          // Componente novo sem nível: o que a matriz sugere (como no sheet, dar as
          // notas escolhe o nível); sem notas, Média
          const sugerida = criticidadeSugerida(componente.criticidade_impacto as number, componente.criticidade_probabilidade as number);
          const novo = { ...componente, criticidade: componente.criticidade ?? String(sugerida ?? 3) };
          const dto = id
            ? await validarComoOFormulario(UpdateEquipamentoDto, componente, `componentes.${i}`)
            : await validarComoOFormulario(
                CreateEquipamentoDto,
                { ...novo, equipamento_pai_id: atual?.id.trim() ?? UC_NOVA },
                `componentes.${i}`,
              );
          const existente = id ? atual?.componentes.find((c) => c.id.trim() === String(id).trim()) : undefined;
          const daMatriz = erroDaMatriz(existente ?? {}, id ? componente : novo, `componentes.${i}.criticidade`, componente.nome ?? existente?.nome);
          if (daMatriz) erros.push(daMatriz);
          validados.push({ id: (id as string | null) ?? null, dto: dto as CreateEquipamentoDto });
        } catch (erro) {
          if (!(erro instanceof ErrosDaLinha)) throw erro;
          erros.push(...erro.erros);
        }
      }
    }

    if (erros.length) throw new ErrosDaLinha(erros);
    return { equipamento, componentes: validados, planoId: plano_id as string | undefined };
  }

  /** UC nova só numa unidade do escopo; vincular plano pede a permissão da tela de planos. */
  async autorizar(usuario: UsuarioDaImportacao, dto: object, atual: EquipamentoComListas | null) {
    const { equipamento, planoId } = dto as EquipamentoValidado;

    if (planoId && !usuario.permissions.includes('manutencao.manage')) {
      throw ErrosDaLinha.em('plano', 'Você não tem permissão para vincular plano de manutenção (manutencao.manage).');
    }

    if (!atual && equipamento.unidade_id) {
      const unidade = await this.prisma.unidades.findFirst({ where: { id: equipamento.unidade_id }, select: { planta_id: true } });
      try {
        await this.escopo.assertPlantaInScope(unidade?.planta_id ?? null, usuario);
      } catch (erro) {
        // Fora do escopo é 404 desde o SN-57 (a unidade "não existe" para quem importa)
        if (erro instanceof NotFoundException) throw ErrosDaLinha.em('unidade', 'Esta unidade não está nas suas plantas.');
        throw erro;
      }
    }
  }

  async criar(dto: object, usuario: UsuarioDaImportacao) {
    const { equipamento, componentes, planoId } = dto as EquipamentoValidado;
    const criado = await this.equipamentos.create(equipamento as CreateEquipamentoDto);
    const id = criado.id.trim();
    await this.gravarComponentes(id, equipamento.unidade_id ?? null, componentes ?? []);
    if (planoId) await this.planos.vincularEquipamento({ equipamento_id: id, plano_id: planoId, criado_por: usuario.id }, usuario);
    return { id };
  }

  async atualizar(atual: EquipamentoComListas, dto: object, usuario: UsuarioDaImportacao) {
    const { equipamento, componentes, planoId } = dto as EquipamentoValidado;
    if (Object.values(equipamento).some((v) => v !== undefined)) {
      await this.equipamentos.update(atual.id.trim(), equipamento as UpdateEquipamentoDto);
    }
    await this.gravarComponentes(atual.id.trim(), atual.unidade_id?.trim() ?? null, componentes ?? []);
    if (planoId) {
      await this.planos.vincularEquipamento({ equipamento_id: atual.id.trim(), plano_id: planoId, criado_por: usuario.id }, usuario);
    }
  }

  /** Componente com ID atualiza (se mudou); sem ID cria nesta UC. Nenhum é apagado. */
  private async gravarComponentes(ucId: string, unidadeId: string | null, linhas: ComponenteValidado[]) {
    for (const { id, dto } of linhas) {
      if (!id) {
        await this.equipamentos.create({
          ...(dto as CreateEquipamentoDto),
          equipamento_pai_id: ucId,
          ...(unidadeId ? { unidade_id: unidadeId } : {}),
        });
      } else if (Object.values(dto).some((v) => v !== undefined)) {
        await this.equipamentos.update(id, dto as UpdateEquipamentoDto);
      }
    }
  }

  async retrato(id: string) {
    const uc = await this.prisma.equipamentos.findUniqueOrThrow({ where: { id } });
    const { componentes, dadosTecnicos, planoDeOrigem } = await this.listasDa(id);
    const campos = (e: equipamentos, colunas: Record<string, keyof equipamentos>) =>
      Object.values(colunas).map((c) => {
        const v = e[c];
        return typeof v === 'string' ? v.trim() : v instanceof Date ? dia(v) : (numero(v) ?? v);
      });
    return {
      uc: [...campos(uc, COLUNAS_DA_UC), uc.unidade_id?.trim() ?? null, dia(uc.data_imobilizacao), dia(uc.data_instalacao), dia(uc.garantia_ate)],
      dadosTecnicos: formaDosDadosTecnicos(dadosTecnicos),
      componentes: componentes
        .map((c) => [c.id.trim(), ...campos(c, COLUNAS_DO_COMPONENTE), dia(c.data_instalacao), dia(c.garantia_ate)])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      planoDeOrigem,
    };
  }

  idDe(atual: EquipamentoComListas) {
    return atual.id.trim();
  }

  nomeDe(atual: EquipamentoComListas | null, dto: object) {
    return (dto as EquipamentoValidado).equipamento?.nome ?? atual?.nome ?? '';
  }

  atualizadoEm(atual: EquipamentoComListas) {
    return atual.updated_at;
  }
}
