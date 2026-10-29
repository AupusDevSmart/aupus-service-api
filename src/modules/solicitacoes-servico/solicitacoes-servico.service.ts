import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService, PermissionScopeService, ScopedUser } from '@/core';
import { PropostaService } from './proposta.service';
import {
  CreateSolicitacaoDto,
  UpdateSolicitacaoDto,
  SolicitacaoFiltersDto,
  SolicitacaoResponseDto,
  ListarSolicitacoesResponseDto,
  SolicitacaoStatsDto,
} from './dto';
import { Prisma, type solicitacoes_servico } from '@/core';

// Import the enum from Prisma
import { StatusSolicitacaoServico } from '@/core';
import { comDataNecessidadeNormalizada } from './data-necessidade';
import { periodoDoFiltro } from '../../common/helpers/filtros-da-os';
import { comAsRelacoes, comOLugarAparado, exigirQuemPediu, mudouOLugar, plantaDaSolicitacao } from './lugar-da-solicitacao';
import { colunasDosPercentuais, padroesDaProposta } from './padroes-da-proposta';
import { herancaDaProposta, type HerancaDaProposta } from './heranca-da-proposta';
import { nivelDaProposta, solicitacaoPara, type NivelDaProposta } from './dinheiro-da-solicitacao';
import { registrarNotificacao } from '../notificacoes/registrar-notificacao';

/** A planta que a linha da lista mostra */
/** A planta da linha; o dono decide quanto da proposta quem pede vê (dinheiro-da-solicitacao.ts) */
interface PlantaDaLinha { id: string; nome: string; cidade: string; uf: string; proprietario_id: string | null }

@Injectable()
export class SolicitacoesServicoService {
  private readonly logger = new Logger(SolicitacoesServicoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: PermissionScopeService,
    private readonly propostaService: PropostaService,
  ) {}

  /**
   * Mapear solicitação do Prisma para DTO
   */
  private mapToResponseDto(solicitacao: solicitacoes_servico): SolicitacaoResponseDto {
    return {
      ...solicitacao,
      tempo_estimado: solicitacao.tempo_estimado ? Number(solicitacao.tempo_estimado) : null,
      custo_estimado: solicitacao.custo_estimado ? Number(solicitacao.custo_estimado) : null,
    } as SolicitacaoResponseDto;
  }

  /**
   * O número da solicitação: ANO-0000, reiniciando a cada ano.
   *
   * Os formatos anteriores — SSV-ANO-0000 e ASS-00000 — ficam como estão e são
   * ignorados pela contagem. Renumerar mexeria em documento que já pode ter
   * sido enviado ao cliente, e o PDF gerado carrega o número da época.
   *
   * A busca é por prefixo do ano corrente, então virar o ano zera a série
   * sozinho, sem tarefa agendada nem intervenção.
   */
  async gerarNumeroSolicitacao(): Promise<string> {
    return this.proximoNumeroAnual('solicitacoes_servico');
  }

  /**
   * O próximo ANO-0000 de uma tabela que tenha coluna `numero`.
   *
   * A ordenação alfabética serve porque o padding deixa todos do mesmo
   * tamanho: "2026-0010" vem depois de "2026-0009" como texto também.
   *
   * Corrida: duas criações simultâneas leem o mesmo último número e tentam
   * gravar o mesmo. A coluna é `@unique`, então a segunda falha em vez de
   * duplicar — e a tentativa é refeita. Sem isso a colisão viraria um 500 para
   * quem só clicou em salvar ao mesmo tempo que outra pessoa.
   */
  private async proximoNumeroAnual(tabela: 'solicitacoes_servico'): Promise<string> {
    const ano = new Date().getFullYear();
    const prefixo = `${ano}-`;

    const ultima = await this.prisma[tabela].findFirst({
      where: { numero: { startsWith: prefixo } },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    });

    let sequencial = 1;
    if (ultima?.numero) {
      const lido = parseInt(ultima.numero.slice(prefixo.length), 10);
      if (Number.isFinite(lido)) sequencial = lido + 1;
    }

    return `${prefixo}${sequencial.toString().padStart(4, '0')}`;
  }

  /**
   * Registra histórico de ações
   */
  private async registrarHistorico(
    prisma: Prisma.TransactionClient,
    solicitacao_id: string,
    acao: string,
    usuario_nome: string,
    usuario_id?: string,
    observacoes?: string,
    status_anterior?: StatusSolicitacaoServico,
    status_novo?: StatusSolicitacaoServico,
    dados_extras?: Prisma.InputJsonValue,
  ) {
    await prisma.historico_solicitacao_servico.create({
      data: {
        solicitacao_id,
        acao,
        usuario_nome,
        usuario_id,
        observacoes,
        status_anterior,
        status_novo,
        dados_extras,
      },
    });
  }

  /**
   * Criar nova solicitação.
   *
   * Refaz a tentativa quando o número colide.
   *
   * Duas criações simultâneas leem o mesmo último número e tentam gravar o
   * mesmo. A coluna é `@unique`, então a segunda falha (P2002) em vez de
   * duplicar — e sem o retry isso viraria um 500 para quem só clicou em salvar
   * ao mesmo tempo que outra pessoa. Na nova tentativa o número já foi tomado,
   * e a leitura devolve o seguinte.
   *
   * Três tentativas: a colisão exige simultaneidade quase exata, e três seguidas
   * significam outra coisa acontecendo — aí o erro deve subir.
   */
  async create(
    createDto: CreateSolicitacaoDto,
    usuarioId?: string,
    user?: ScopedUser,
  ): Promise<SolicitacaoResponseDto> {
    for (let tentativa = 1; ; tentativa++) {
      try {
        return await this.criarUmaVez(createDto, usuarioId, user);
      } catch (erro) {
        const colidiu =
          erro instanceof Prisma.PrismaClientKnownRequestError &&
          erro.code === 'P2002' &&
          String(erro.meta?.target ?? '').includes('numero');

        if (!colidiu || tentativa >= 3) throw erro;
        this.logger.warn(`Numero de solicitacao colidiu; tentativa ${tentativa + 1}`);
      }
    }
  }

  private async criarUmaVez(
    createDto: CreateSolicitacaoDto,
    usuarioId?: string,
    user?: ScopedUser,
  ): Promise<SolicitacaoResponseDto> {
    return await this.prisma.$transaction(async (prisma) => {
      // Gerar número único
      const numero = await this.gerarNumeroSolicitacao();

      // Se temos o usuarioId, buscar o nome do usuário
      let solicitante_nome = 'Sistema';
      if (usuarioId) {
        const usuario = await prisma.usuarios.findUnique({
          where: { id: usuarioId },
          select: { nome: true },
        });
        if (usuario) {
          solicitante_nome = usuario.nome;
        }
      }

      // A planta e a coerência do lugar (unidade, equipamento), com o escopo (SN-57).
      // Nula quando a equipe cadastra só com o cliente em texto
      const planta_id = await plantaDaSolicitacao(this.prisma, this.scopeService, createDto, user);
      // O cliente em texto é da equipe: quem tem escopo cadastra na planta dele, e o
      // texto dele apareceria na lista da equipe como dono da solicitação
      if (await this.temEscopo(user)) createDto.cliente_nome = null;
      exigirQuemPediu(planta_id, createDto.cliente_nome);
      // Quem não monta proposta (o cliente, o técnico) não escolhe o dono nem o custo: o dono é o
      // da planta (pelo corpo, o técnico virava "dono" e lia a proposta) e o custo é da equipe
      const montaProposta = !user || Boolean((user as { permissions?: string[] }).permissions?.includes('solicitacoes.manage'));
      if (!montaProposta) {
        createDto.custo_estimado = undefined;
        createDto.proprietario_id = planta_id ? await this.donoDaPlanta(planta_id) : null;
      }

      // Extrair campos que não são colunas da tabela antes de criar
      const { instrucoes_ids, tarefas_ids, ...camposDaTabela } = createDto;
      const createData = comOLugarAparado(comDataNecessidadeNormalizada(camposDaTabela));
      createData.cliente_nome = createData.cliente_nome?.trim() || null;

      // Criar solicitação com solicitante_id e solicitante_nome preenchidos
      // Removido o include da planta para evitar erro com soft delete
      const solicitacao = await prisma.solicitacoes_servico.create({
        data: {
          ...createData,
          // Os percentuais padrão (29/out/2026): a proposta nasce com eles e os ajusta no fechamento
          conta_da_proposta: 'IMPOSTO_MARGEM',
          ...colunasDosPercentuais(await padroesDaProposta(prisma)),
          // A coluna e NOT NULL: "nao informado" e vazio
          local: createData.local ?? '',
          planta_id, // Usar o planta_id determinado
          numero,
          status: StatusSolicitacaoServico.REGISTRADA,
          solicitante_id: usuarioId || null,
          solicitante_nome: solicitante_nome,
        } as Prisma.solicitacoes_servicoUncheckedCreateInput,
      });
      // Aberta avisa quem programa (SN-47), na mesma transação
      await registrarNotificacao(prisma, { evento: 'solicitacao.aberta', entidade: 'solicitacao_servico', entidadeId: solicitacao.id, atorId: usuarioId });

      // Buscar a planta manualmente apenas se não estiver deletada (a solicitação sem planta não tem)
      const planta = planta_id
        ? await prisma.plantas.findFirst({ where: { id: planta_id.trim(), deleted_at: null } })
        : null;

      // Associar tarefas se fornecidas
      if (tarefas_ids && tarefas_ids.length > 0) {
        await this.associarTarefas(prisma, solicitacao.id, tarefas_ids);
      }

      // Associar instruções se fornecidas
      if (instrucoes_ids && instrucoes_ids.length > 0) {
        await this.associarInstrucoes(prisma, solicitacao.id, instrucoes_ids);
        // Copia recursos e etapas para a proposta, com o preco do catalogo
        // congelado no momento do vinculo. So para quem monta proposta: a do
        // cliente ou do tecnico nasce sem preco (ele leria o custo do catalogo), e o
        // planejador a monta ao abrir a edicao
        if (montaProposta) await this.propostaService.materializarDeInstrucoes(solicitacao.id, prisma);
      }

      // A planta e as relações por consulta própria: o include perdia o id antigo (comAsRelacoes)
      const [comRelacoes] = await comAsRelacoes(prisma, [solicitacao]);
      const solicitacaoCompleta = {
        ...comRelacoes,
        planta: planta,
      };

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        solicitacao.id,
        'CRIACAO',
        solicitante_nome,
        usuarioId,
        'Solicitação criada',
        null,
        solicitacao.status,
      );

      this.logger.log(`Solicitação ${numero} criada com sucesso`);
      return solicitacaoPara(user, this.mapToResponseDto(solicitacaoCompleta));
    });
  }

  /**
   * Listar solicitações com filtros
   */
  async findAll(
    filters: SolicitacaoFiltersDto,
    user?: ScopedUser,
  ): Promise<ListarSolicitacoesResponseDto> {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      tipo,
      prioridade,
      origem,
      planta_id,
      unidade_id,
      proprietario_id,
      equipamento_id,
      departamento,
      solicitante_nome,
      data_inicio,
      data_fim,
      sortBy = 'data_solicitacao',
      sortOrder = 'desc',
    } = filters;

    const where: Prisma.solicitacoes_servicoWhereInput = {
      deleted_at: null,
    };

    // Filtro de busca textual
    if (search) {
      where.OR = [
        { titulo: { contains: search, mode: 'insensitive' } },
        { descricao: { contains: search, mode: 'insensitive' } },
        { local: { contains: search, mode: 'insensitive' } },
        { numero: { contains: search, mode: 'insensitive' } },
        // O que a lista de origem da programação mostra e a busca não alcançava (SN-77)
        { solicitante_nome: { contains: search, mode: 'insensitive' } },
        // A solicitação sem planta se acha pelo cliente em texto (28/out/2026)
        { cliente_nome: { contains: search, mode: 'insensitive' } },
        { planta: { nome: { contains: search, mode: 'insensitive' } } },
        { unidade: { nome: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Filtros específicos
    if (status) where.status = status;
    if (tipo) where.tipo = tipo;
    if (prioridade) where.prioridade = prioridade;
    if (origem) where.origem = origem;
    if (planta_id) where.planta_id = planta_id;
    if (unidade_id) where.unidade_id = unidade_id;
    if (proprietario_id) where.proprietario_id = proprietario_id;
    if (equipamento_id) where.equipamento_id = equipamento_id;
    if (departamento) where.departamento = { contains: departamento, mode: 'insensitive' };
    if (solicitante_nome) where.solicitante_nome = { contains: solicitante_nome, mode: 'insensitive' };

    // O mesmo período das OS: AAAA-MM-DD é o dia inteiro em Brasília. Com o
    // new Date, o fim era a meia-noite UTC e as do último dia ficavam de fora
    const periodo = periodoDoFiltro(data_inicio, data_fim);
    if (periodo) where.data_solicitacao = periodo;

    // Scope RBAC: filtrar por planta do escopo
    const scope = await this.scopeService.getScope(user);
    if (this.scopeService.isScoped(scope)) {
      if (scope.length === 0) {
        where.AND = [{ id: '__NEVER__' }];
      } else {
        where.AND = [{ planta_id: { in: scope } }];
      }
    }

    // Contar total
    const total = await this.prisma.solicitacoes_servico.count({ where });

    // Buscar dados - removendo unidade do include pois pode ter problemas com espaços
    const solicitacoes = await this.prisma.solicitacoes_servico.findMany({
      where,
      include: {
        // Planta, unidade, equipamento e proprietário por consulta própria, depois
        anexos: {
          select: {
            id: true,
            nome_arquivo: true,
            tipo_documento: true,
            tamanho: true,
          },
        },
        _count: {
          select: {
            anexos: true,
          },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      // Desempate pelo id: com a ordem empatada, as páginas repetiam e perdiam registros (SN-77)
      orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
    });

    // Plantas, unidades, equipamentos e pessoas por consulta própria, com o id
    // aparado (soft delete e ids com espaço): uma por tabela. Eram duas por
    // linha, em paralelo — com o seletor de origem buscando a cada letra, 100
    // consultas por busca (SN-77)
    const idsDePlanta = [...new Set(solicitacoes.map((s) => s.planta_id?.trim()).filter((id): id is string => Boolean(id)))];
    const [plantas, comRelacoes] = await Promise.all([
      idsDePlanta.length
        ? this.prisma.$queryRaw<PlantaDaLinha[]>`
            SELECT id, nome, cidade, uf, TRIM(proprietario_id) AS proprietario_id FROM plantas
            WHERE TRIM(id) = ANY(${idsDePlanta}) AND deleted_at IS NULL`
        : Promise.resolve<PlantaDaLinha[]>([]),
      comAsRelacoes(this.prisma, solicitacoes),
    ]);
    const plantaPorId = new Map(plantas.map((p) => [p.id.trim(), p]));
    const solicitacoesCompletas = comRelacoes.map((solicitacao) => ({
      ...solicitacao,
      planta: (solicitacao.planta_id && plantaPorId.get(solicitacao.planta_id.trim())) || null,
    }));

    return {
      // O dinheiro da proposta pelo nível de quem pede (dinheiro-da-solicitacao.ts, 28/out/2026)
      data: solicitacoesCompletas.map(s => solicitacaoPara(user, this.mapToResponseDto(s))),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Buscar solicitação por ID
   */
  /**
   * 404/403 do escopo para o que pende da solicitação sem passar pelo findOne
   * (a proposta). A proposta era lida por qualquer um com `solicitacoes.view`,
   * de qualquer planta (SN-40).
   */
  async garantirNoEscopo(id: string, user?: ScopedUser): Promise<void> {
    if (user) await this.scopeService.assertEntityInScope('solicitacao_servico', id, user);
  }

  /** Quanto da proposta quem pede vê: no escopo dele (404 fora), e pelo dono da solicitação */
  async nivelDaPropostaPara(id: string, user?: ScopedUser): Promise<NivelDaProposta> {
    await this.garantirNoEscopo(id, user);
    const solicitacao = await this.prisma.solicitacoes_servico.findFirst({ where: { id }, select: { planta_id: true } });
    return nivelDaProposta(user, solicitacao?.planta_id ? await this.donoDaPlanta(solicitacao.planta_id) : null);
  }

  /** O que a programação herda da proposta revisada (29/out/2026), no escopo de quem pede */
  async paraProgramar(id: string, user?: ScopedUser): Promise<HerancaDaProposta> {
    await this.garantirNoEscopo(id, user);
    const solicitacao = await this.prisma.solicitacoes_servico.findFirst({ where: { id, deleted_at: null }, select: { id: true } });
    if (!solicitacao) throw new NotFoundException('Solicitação não encontrada');
    return herancaDaProposta(this.prisma, solicitacao.id);
  }

  /** O dono atual da planta (a consulta pelo id aparado: o include perdia o id antigo) */
  private async donoDaPlanta(plantaId: string): Promise<string | null> {
    const planta = await this.prisma.plantas.findFirst({ where: { id: plantaId.trim() }, select: { proprietario_id: true } });
    return planta?.proprietario_id?.trim() || null;
  }

  /** Quem pede tem escopo por planta (o cliente, o técnico)? Sem usuário é chamada interna */
  private async temEscopo(user?: ScopedUser): Promise<boolean> {
    return Boolean(user) && this.scopeService.isScoped(await this.scopeService.getScope(user));
  }

  async findOne(id: string, user?: ScopedUser): Promise<SolicitacaoResponseDto> {
    if (user) await this.scopeService.assertEntityInScope('solicitacao_servico', id, user);
    const solicitacao = await this.prisma.solicitacoes_servico.findUnique({
      where: { id },
      include: {
        // Planta, unidade, equipamento e pessoas por consulta própria, depois
        anexos: true,
        historico: {
          orderBy: { data: 'desc' },
        },
        // Os comentários vêm só por GET :id/comentarios (SN-48), que esconde o
        // interno do cliente; aqui iam todos, com o interno
        tarefas: {
          include: {
            tarefa: {
              select: {
                id: true,
                tag: true,
                nome: true,
                criticidade: true
              }
            }
          },
          orderBy: { ordem: 'asc' }
        },
        solicitacoes_instrucoes: {
          // A instrução excluída não aparece: semeada na programação, ela dava 400 (SN-86)
          where: { instrucao: { deleted_at: null } },
          include: {
            instrucao: {
              select: {
                id: true,
                codigo: true,
                nome: true
              }
            }
          },
          orderBy: { ordem: 'asc' }
        }
      },
    });

    if (!solicitacao || solicitacao.deleted_at) {
      throw new NotFoundException('Solicitação não encontrada');
    }

    // Buscar a planta manualmente usando TRIM
    let planta = null;
    if (solicitacao.planta_id) {
      const plantaResult = await this.prisma.$queryRaw`
        SELECT id, nome, cidade, uf, cnpj, TRIM(proprietario_id) AS proprietario_id
        FROM plantas
        WHERE TRIM(id) = TRIM(${solicitacao.planta_id})
          AND deleted_at IS NULL
        LIMIT 1
      `;
      planta = plantaResult[0] || null;
    }

    // Unidade, equipamento e pessoas com o id aparado (o include perdia o id antigo)
    const [comRelacoes] = await comAsRelacoes(this.prisma, [solicitacao]);

    // Mapear tarefas associadas
    const tarefas = solicitacao.tarefas?.map(ts => ({
      ...ts.tarefa,
      ordem: ts.ordem,
      observacoes: ts.observacoes
    })) || [];

    // Mapear instruções associadas
    const instrucoes = solicitacao.solicitacoes_instrucoes?.map((si) => ({
      ...si.instrucao,
      ordem: si.ordem,
      observacoes: si.observacoes
    })) || [];

    const solicitacaoCompleta = {
      ...comRelacoes,
      planta: planta,
      tarefas: tarefas,
      instrucoes: instrucoes
    };

    return solicitacaoPara(user, this.mapToResponseDto(solicitacaoCompleta));
  }

  /**
   * Atualizar solicitação
   */
  async update(
    id: string,
    updateDto: UpdateSolicitacaoDto,
    usuarioId?: string,
    user?: ScopedUser,
  ): Promise<SolicitacaoResponseDto> {
    const solicitacao = await this.findOne(id, user);

    // Verificar se pode ser editada
    if (solicitacao.status !== 'REGISTRADA') {
      throw new ConflictException(
        'Apenas solicitações registradas podem ser editadas',
      );
    }

    // Levar a solicitação para outro lugar passa pela mesma regra do criar: antes
    // a edição não conferia a planta nova, e o escopo de quem editava não valia
    const lugarAtual = await this.prisma.solicitacoes_servico.findUnique({
      where: { id },
      select: { planta_id: true, unidade_id: true, equipamento_id: true, cliente_nome: true },
    });
    if (lugarAtual && mudouOLugar(updateDto, lugarAtual)) {
      const novo = {
        // A planta sai da unidade só quando vem uma unidade: limpar a instalação não leva a planta junto
        planta_id: updateDto.planta_id !== undefined ? updateDto.planta_id : updateDto.unidade_id ? undefined : lugarAtual.planta_id,
        unidade_id: updateDto.unidade_id !== undefined ? updateDto.unidade_id : lugarAtual.unidade_id,
        equipamento_id: updateDto.equipamento_id !== undefined ? updateDto.equipamento_id : lugarAtual.equipamento_id,
      };
      // Nula quando a equipe tira a planta (a solicitação fica com o cliente em texto)
      updateDto.planta_id = await plantaDaSolicitacao(this.prisma, this.scopeService, novo, user);
    }
    if (updateDto.cliente_nome !== undefined) {
      // O cliente em texto é da equipe (como no criar): de quem tem escopo, não muda
      if (await this.temEscopo(user)) delete updateDto.cliente_nome;
      else updateDto.cliente_nome = updateDto.cliente_nome?.trim() || null;
    }
    if (lugarAtual) {
      exigirQuemPediu(
        updateDto.planta_id !== undefined ? updateDto.planta_id : lugarAtual.planta_id,
        updateDto.cliente_nome !== undefined ? updateDto.cliente_nome : lugarAtual.cliente_nome,
      );
    }

    // Extrair instrucoes_ids e tarefas_ids antes de passar para o Prisma (não são
    // colunas da tabela). tarefas_ids ia junto e o Prisma recusava com 500.
    const { instrucoes_ids, tarefas_ids, ...camposDaTabela } = updateDto;
    const prismaData = comOLugarAparado(comDataNecessidadeNormalizada(camposDaTabela));

    return await this.prisma.$transaction(async (prisma) => {
      const solicitacaoAtualizada = await prisma.solicitacoes_servico.update({
        where: { id },
        data: prismaData as Prisma.solicitacoes_servicoUncheckedUpdateInput,
      });

      // Atualizar instruções vinculadas se fornecidas
      if (instrucoes_ids !== undefined) {
        // Atualiza so o vinculo. A proposta NAO e refeita aqui.
        //
        // Um dono para cada momento: na edicao, quem preenche itens e etapas e
        // a tela, no instante em que a instrucao e vinculada — e ela grava por
        // rotas proprias. Se o update tambem refizesse a copia, um sobrescreve
        // o outro, e o preco que a pessoa acabou de ajustar sumiria ao salvar
        // qualquer outro campo do formulario.
        //
        // Para refazer de proposito existe POST /proposta/recarregar.
        await prisma.solicitacoes_instrucoes.deleteMany({
          where: { solicitacao_id: id },
        });
        if (instrucoes_ids && instrucoes_ids.length > 0) {
          await this.associarInstrucoes(prisma, id, instrucoes_ids);
        }
      }

      // As tarefas avulsas, como no criar
      if (tarefas_ids !== undefined) {
        await prisma.tarefas_solicitacoes.deleteMany({ where: { solicitacao_id: id } });
        if (tarefas_ids.length > 0) await this.associarTarefas(prisma, id, tarefas_ids);
      }

      // Buscar a planta manualmente se existir e não estiver deletada
      let planta = null;
      if (solicitacaoAtualizada.planta_id) {
        planta = await prisma.plantas.findFirst({
          where: {
            id: solicitacaoAtualizada.planta_id,
            deleted_at: null
          }
        });
      }

      const [comRelacoes] = await comAsRelacoes(prisma, [solicitacaoAtualizada]);
      const solicitacaoCompleta = {
        ...comRelacoes,
        planta: planta
      };

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'ATUALIZACAO',
        'Sistema',
        usuarioId,
        'Solicitação atualizada',
      );

      return solicitacaoPara(user, this.mapToResponseDto(solicitacaoCompleta));
    });
  }

  /**
   * Remover solicitação (soft delete)
   */
  async remove(id: string, usuarioId?: string, user?: ScopedUser): Promise<void> {
    const solicitacao = await this.findOne(id, user);

    if (solicitacao.status !== StatusSolicitacaoServico.REGISTRADA) {
      throw new ConflictException('Apenas solicitações registradas podem ser excluídas');
    }

    await this.prisma.solicitacoes_servico.update({
      where: { id },
      data: {
        deleted_at: new Date(),
      },
    });

    this.logger.log(`Solicitação ${solicitacao.numero} removida`);
  }

  /**
   * Obter estatísticas — no escopo de quem pede, como a listagem.
   */
  async getStats(user?: ScopedUser): Promise<SolicitacaoStatsDto> {
    const scope = await this.scopeService.getScope(user);
    const base: Prisma.solicitacoes_servicoWhereInput = this.scopeService.isScoped(scope)
      ? { deleted_at: null, planta_id: { in: scope.length > 0 ? scope : ['__NEVER__'] } }
      : { deleted_at: null };
    const [
      total,
      registradas,
      revisadas,
      programadas,
      finalizadas,
      naoAprovadas,
      porPrioridade,
      porTipo,
    ] = await Promise.all([
      this.prisma.solicitacoes_servico.count({ where: base }),
      this.prisma.solicitacoes_servico.count({ where: { ...base, status: StatusSolicitacaoServico.REGISTRADA } }),
      this.prisma.solicitacoes_servico.count({ where: { ...base, status: StatusSolicitacaoServico.PROPOSTA_REVISADA } }),
      this.prisma.solicitacoes_servico.count({ where: { ...base, status: StatusSolicitacaoServico.PROGRAMADA } }),
      this.prisma.solicitacoes_servico.count({ where: { ...base, status: StatusSolicitacaoServico.FINALIZADA } }),
      this.prisma.solicitacoes_servico.count({ where: { ...base, status: StatusSolicitacaoServico.NAO_APROVADA } }),
      this.prisma.solicitacoes_servico.groupBy({ by: ['prioridade'], where: base, _count: true }),
      this.prisma.solicitacoes_servico.groupBy({ by: ['tipo'], where: base, _count: true }),
    ]);

    const prioridadeMap = { baixa: 0, media: 0, alta: 0, urgente: 0 };
    porPrioridade.forEach((item) => {
      prioridadeMap[item.prioridade.toLowerCase()] = item._count;
    });

    const tipoMap: Record<string, number> = {};
    porTipo.forEach((item) => {
      tipoMap[item.tipo] = item._count;
    });

    return {
      total,
      registradas,
      revisadas,
      programadas,
      finalizadas,
      nao_aprovadas: naoAprovadas,
      porPrioridade: prioridadeMap,
      porTipo: tipoMap,
    };
  }

  /**
   * Associar tarefas independentes à solicitação
   */
  private async associarTarefas(
    prisma: Prisma.TransactionClient,
    solicitacaoId: string,
    tarefasIds: string[]
  ) {
    // Verificar se todas as tarefas existem e não têm plano
    const tarefas = await prisma.tarefas.findMany({
      where: {
        id: { in: tarefasIds },
        plano_manutencao_id: null,
        deleted_at: null
      }
    });

    if (tarefas.length !== tarefasIds.length) {
      throw new BadRequestException('Algumas tarefas não existem ou já estão associadas a um plano');
    }

    // Criar associações
    const associacoes = tarefasIds.map((tarefaId, index) => ({
      id: this.generateId(), // Gerar ID único
      tarefa_id: tarefaId,
      solicitacao_id: solicitacaoId,
      ordem: index + 1
    }));

    await prisma.tarefas_solicitacoes.createMany({
      data: associacoes
    });
  }

  private async associarInstrucoes(
    prisma: Prisma.TransactionClient,
    solicitacaoId: string,
    instrucoesIds: string[]
  ) {
    // Verificar se todas as instruções existem
    const instrucoes = await prisma.instrucoes.findMany({
      where: {
        id: { in: instrucoesIds },
        deleted_at: null
      }
    });

    if (instrucoes.length !== instrucoesIds.length) {
      throw new BadRequestException('Algumas instruções não foram encontradas');
    }

    const associacoes = instrucoesIds.map((instrucaoId, index) => ({
      id: this.generateId(),
      instrucao_id: instrucaoId,
      solicitacao_id: solicitacaoId,
      ordem: index + 1
    }));

    await prisma.solicitacoes_instrucoes.createMany({
      data: associacoes
    });
  }

  /**
   * Gerar ID único (CUID)
   */
  private generateId(): string {
    // Implementação simplificada de CUID
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substr(2, 9);
    return `c${timestamp}${randomStr}`.substr(0, 26);
  }
}