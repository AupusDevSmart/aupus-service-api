import { Injectable, NotFoundException } from '@nestjs/common';
import { planos_manutencao, PrismaService, tarefas } from '@/core';
import { PlanosManutencaoService } from '@/modules/planos-manutencao/planos-manutencao.service';
import { CreatePlanoManutencaoDto } from '@/modules/planos-manutencao/dto/create-plano-manutencao.dto';
import { UpdatePlanoManutencaoDto } from '@/modules/planos-manutencao/dto/update-plano-manutencao.dto';
import { TarefasService } from '@/modules/tarefas/tarefas.service';
import { CreateTarefaDto } from '@/modules/tarefas/dto/create-tarefa.dto';
import { UpdateTarefaDto } from '@/modules/tarefas/dto/update-tarefa.dto';
import { ErroDeCampo } from '@/common/pipes/mensagens-validacao';
import { CadastroImportavel, ErrosDaLinha, UsuarioDaImportacao } from '../importacao.types';
import { validarComoOFormulario } from '../importacao.service';
import { CatalogoPorNome } from '../catalogo-por-nome';

type PlanoComTarefas = planos_manutencao & { tarefas: tarefas[] };

type TarefaValidada = { id: string | null; dto: CreateTarefaDto | UpdateTarefaDto };
type PlanoValidado = {
  plano: CreatePlanoManutencaoDto | UpdatePlanoManutencaoDto;
  /** Ausente quando a seção TAREFAS não está na aba: não mexe nas tarefas. */
  tarefas?: TarefaValidada[];
};

/** Os campos de uma tarefa que a planilha edita — os mesmos da linha na tela. */
const CAMPOS_DA_TAREFA = ['nome', 'instrucao_id', 'frequencia', 'frequencia_personalizada', 'criticidade'] as const;

/**
 * Planos de manutenção: só os TEMPLATES (um por categoria). A cópia de cada
 * equipamento não entra: ela se edita na ficha do equipamento, e o template
 * chega nela pela propagação.
 *
 * Na tela, plano e tarefas gravam por endpoints próprios; a importação faz o
 * mesmo — PlanosManutencaoService para o cabeçalho, TarefasService para cada
 * tarefa —, e cada um enfileira a propagação como faz pela tela (o disparo
 * espera a importação ser confirmada).
 *
 * Tarefa que sumiu da seção é removida, como o "Excluir" da linha na tela.
 */
@Injectable()
export class PlanosImportacao implements CadastroImportavel<PlanoComTarefas> {
  readonly singular = 'plano';
  readonly dtoDeCriacao = CreatePlanoManutencaoDto;
  readonly dtoDeEdicao = UpdatePlanoManutencaoDto;

  constructor(
    private readonly planos: PlanosManutencaoService,
    private readonly tarefas: TarefasService,
    private readonly prisma: PrismaService,
  ) {}

  async buscar(id: string) {
    const plano = await this.prisma.planos_manutencao.findFirst({ where: { id, deleted_at: null } });
    // Cópia de equipamento não é editável pela planilha de planos.
    if (!plano || plano.plano_origem_id) throw new NotFoundException('Plano não encontrado');
    return { ...plano, tarefas: await this.tarefasDo(plano.id) };
  }

  private tarefasDo(planoId: string) {
    return this.prisma.tarefas.findMany({
      where: { plano_manutencao_id: planoId.trim(), deleted_at: null },
      orderBy: { ordem: 'asc' },
    });
  }

  async prepararDados(dados: Record<string, unknown>, usuario: UsuarioDaImportacao, atual: PlanoComTarefas | null) {
    const { categoria, categoria_ref, tarefas: linhas, ...plano } = dados;
    const resultado: Record<string, unknown> = { ...plano };

    // Plano antigo, de antes da categoria, continua sem ela se a célula
    // também está vazia.
    const semCategoria = !(typeof categoria === 'string' && categoria.trim());
    const continuaSemCategoria = semCategoria && atual && !atual.categoria_id;

    if (!continuaSemCategoria && (categoria !== undefined || !atual)) {
      const catalogo = new CatalogoPorNome(
        await this.prisma.categorias_equipamentos.findMany({ select: { id: true, nome: true } }),
        'categoria',
        'f',
      );
      const achada = catalogo.procurar(categoria as string, [categoria_ref as string]);
      if (typeof achada !== 'string') throw ErrosDaLinha.em('categoria', achada.erro);
      resultado.categoria_id = achada;
    }

    if (!atual) resultado.criado_por = usuario.id;

    if (Array.isArray(linhas)) {
      resultado.tarefas = await this.resolverTarefas(linhas as Array<Record<string, unknown>>, atual);
    }

    return resultado;
  }

  /** `instrucao` (código ou nome) + `instrucao_ref` → `instrucao_id`; nome vazio = o da instrução. */
  private async resolverTarefas(linhas: Array<Record<string, unknown>>, atual: PlanoComTarefas | null) {
    const usadas = (atual?.tarefas ?? []).map((t) => t.instrucao_id).filter((id): id is string => !!id);
    const instrucoes = await this.prisma.instrucoes.findMany({
      where: { deleted_at: null, OR: [{ ativo: true }, { id: { in: usadas } }] },
      select: { id: true, nome: true, codigo: true },
    });
    const catalogo = new CatalogoPorNome(
      instrucoes.map((i) => ({ id: i.id, nome: i.nome, codigo: i.codigo })),
      'instrução',
      'f',
    );
    const nomePorId = new Map(instrucoes.map((i) => [i.id.trim(), i.nome]));
    const porId = new Map((atual?.tarefas ?? []).map((t) => [t.id.trim(), t]));
    const idsDoPlano = new Set(porId.keys());

    const erros: ErroDeCampo[] = [];
    const resolvidas = linhas.map((linha, i) => {
      const { id, instrucao, instrucao_ref, ...tarefa } = linha;
      const idDaTarefa = typeof id === 'string' && id.trim() ? id.trim() : null;

      if (idDaTarefa && !idsDoPlano.has(idDaTarefa)) {
        erros.push({ campo: `tarefas.${i}.id`, mensagem: `A tarefa ${idDaTarefa} não é deste plano. Em tarefa nova, deixe o ID vazio.` });
      }

      // Tarefa antiga, de antes de a instrução ser obrigatória: sem instrução
      // na planilha também, fica como está.
      const semInstrucao = !(typeof instrucao === 'string' && instrucao.trim());
      if (semInstrucao && idDaTarefa && !porId.get(idDaTarefa)?.instrucao_id) {
        return { id: idDaTarefa, ...tarefa };
      }

      const achada = catalogo.procurar(instrucao as string, [instrucao_ref as string]);
      if (typeof achada !== 'string') {
        erros.push({ campo: `tarefas.${i}.instrucao`, mensagem: achada.erro });
        return { id: idDaTarefa, ...tarefa };
      }

      const nome = typeof tarefa.nome === 'string' && tarefa.nome.trim() ? tarefa.nome : nomePorId.get(achada);
      return { id: idDaTarefa, ...tarefa, nome, instrucao_id: achada };
    });

    if (erros.length) throw new ErrosDaLinha(erros);
    return resolvidas;
  }

  /** O cabeçalho pelo DTO do plano; cada tarefa pelo DTO da tarefa, com o caminho dela. */
  async validar(dados: Record<string, unknown>, atual: PlanoComTarefas | null): Promise<PlanoValidado> {
    const { tarefas: linhas, ...cabecalho } = dados;
    const erros: ErroDeCampo[] = [];

    let plano: PlanoValidado['plano'] = cabecalho as UpdatePlanoManutencaoDto;
    try {
      plano = (await validarComoOFormulario(atual ? UpdatePlanoManutencaoDto : CreatePlanoManutencaoDto, cabecalho)) as
        | CreatePlanoManutencaoDto
        | UpdatePlanoManutencaoDto;
    } catch (erro) {
      if (!(erro instanceof ErrosDaLinha)) throw erro;
      erros.push(...erro.erros);
    }

    let tarefasValidadas: TarefaValidada[] | undefined;
    if (Array.isArray(linhas)) {
      tarefasValidadas = [];
      for (const [i, linha] of (linhas as Array<Record<string, unknown>>).entries()) {
        const { id, ...tarefa } = linha;
        try {
          const dto = await validarComoOFormulario(id ? UpdateTarefaDto : CreateTarefaDto, tarefa, `tarefas.${i}`);
          tarefasValidadas.push({ id: (id as string | null) ?? null, dto: dto as CreateTarefaDto });
        } catch (erro) {
          if (!(erro instanceof ErrosDaLinha)) throw erro;
          erros.push(...erro.erros);
        }
      }
    }

    if (erros.length) throw new ErrosDaLinha(erros);
    return { plano, tarefas: tarefasValidadas };
  }

  async criar(dto: object, usuario: UsuarioDaImportacao) {
    const { plano, tarefas: linhas } = dto as PlanoValidado;
    const criado = await this.planos.criar(plano as CreatePlanoManutencaoDto, usuario);
    await this.sincronizarTarefas(criado.id.trim(), linhas ?? [], [], usuario);
    return { id: criado.id };
  }

  async atualizar(atual: PlanoComTarefas, dto: object, usuario: UsuarioDaImportacao) {
    const { plano, tarefas: linhas } = dto as PlanoValidado;
    const p = plano as UpdatePlanoManutencaoDto;

    // Cabeçalho igual não é regravado: cada gravação do template enfileira uma
    // propagação para todas as cópias.
    const mudouCabecalho =
      (p.nome !== undefined && p.nome !== atual.nome) ||
      (p.descricao !== undefined && (p.descricao ?? null) !== (atual.descricao ?? null)) ||
      (p.versao !== undefined && p.versao !== atual.versao) ||
      (p.categoria_id !== undefined && p.categoria_id.trim() !== atual.categoria_id?.trim());
    if (mudouCabecalho) await this.planos.atualizar(atual.id.trim(), p, usuario);

    if (linhas) await this.sincronizarTarefas(atual.id.trim(), linhas, atual.tarefas, usuario);
  }

  /**
   * Tarefa com ID: atualiza só se algum campo mudou (cada gravação enfileira
   * uma propagação). Sem ID: cria no fim do plano. Do plano e fora da seção:
   * remove, como o "Excluir" da tela.
   */
  private async sincronizarTarefas(planoId: string, linhas: TarefaValidada[], existentes: tarefas[], usuario: UsuarioDaImportacao) {
    const porId = new Map(existentes.map((t) => [t.id.trim(), t]));

    for (const { id, dto } of linhas) {
      if (!id) {
        await this.tarefas.criar({ ...(dto as CreateTarefaDto), plano_manutencao_id: planoId, criado_por: usuario.id });
        continue;
      }
      const existente = porId.get(id)!;
      const mudou = CAMPOS_DA_TAREFA.some(
        (campo) => dto[campo] !== undefined && (dto[campo] ?? null) !== (existente[campo] ?? null),
      );
      if (mudou) await this.tarefas.atualizar(id, dto as UpdateTarefaDto, usuario);
    }

    const naPlanilha = new Set(linhas.map((l) => l.id).filter(Boolean));
    for (const existente of existentes) {
      if (!naPlanilha.has(existente.id.trim())) await this.tarefas.remover(existente.id.trim(), usuario);
    }
  }

  async retrato(id: string) {
    const plano = await this.prisma.planos_manutencao.findUniqueOrThrow({ where: { id } });
    const doPlano = await this.tarefasDo(id);
    return {
      categoria_id: plano.categoria_id?.trim() ?? null,
      nome: plano.nome,
      versao: plano.versao,
      descricao: plano.descricao,
      tarefas: doPlano
        .map((t) => [t.id.trim(), ...CAMPOS_DA_TAREFA.map((c) => (typeof t[c] === 'string' ? (t[c] as string).trim() : t[c]))])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    };
  }

  idDe(atual: PlanoComTarefas) {
    return atual.id.trim();
  }

  nomeDe(atual: PlanoComTarefas | null, dto: object) {
    return (dto as PlanoValidado).plano?.nome ?? atual?.nome ?? '';
  }

  atualizadoEm(atual: PlanoComTarefas) {
    return atual.updated_at;
  }
}
