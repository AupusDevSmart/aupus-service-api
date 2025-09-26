import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, StatusProgramacaoOS } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  AdicionarTarefasDto,
  AnalisarProgramacaoDto,
  AprovarProgramacaoDto,
  AtualizarTarefasDto,
  CancelarProgramacaoDto,
  CreateProgramacaoAnomaliaDto,
  CreateProgramacaoDto,
  CreateProgramacaoTarefasDto,
  ListarProgramacoesResponseDto,
  ProgramacaoDetalhesResponseDto,
  ProgramacaoFiltersDto,
  ProgramacaoResponseDto,
  RejeitarProgramacaoDto,
  UpdateProgramacaoDto,
} from './dto';

@Injectable()
export class ProgramacaoOSService {
  private readonly logger = new Logger(ProgramacaoOSService.name);

  constructor(private readonly prisma: PrismaService) { }

  async listar(filters: ProgramacaoFiltersDto): Promise<ListarProgramacoesResponseDto> {
    this.logger.log('=== SERVICE: LISTAR PROGRAMAÇÕES ===');
    this.logger.log('Filtros:', JSON.stringify(filters, null, 2));

    const {
      page = 1,
      limit = 10,
      search,
      status,
      tipo,
      prioridade,
      origem,
      planta_id,
      data_inicio,
      data_fim,
      criado_por_id,
    } = filters;

    // Construir filtros
    const where: Prisma.programacoes_osWhereInput = {
      deletado_em: null,
    };

    if (search) {
      where.OR = [
        { descricao: { contains: search, mode: 'insensitive' } },
        { local: { contains: search, mode: 'insensitive' } },
        { ativo: { contains: search, mode: 'insensitive' } },
        { codigo: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status && status !== 'all') {
      where.status = status as StatusProgramacaoOS;
    }

    if (tipo && tipo !== 'all') {
      where.tipo = tipo;
    }

    if (prioridade && prioridade !== 'all') {
      where.prioridade = prioridade;
    }

    if (origem && origem !== 'all') {
      where.origem = origem;
    }

    if (planta_id) {
      where.planta_id = planta_id;
    }

    if (criado_por_id) {
      where.criado_por_id = criado_por_id;
    }

    if (data_inicio || data_fim) {
      where.criado_em = {};
      if (data_inicio) {
        where.criado_em.gte = new Date(data_inicio);
      }
      if (data_fim) {
        where.criado_em.lte = new Date(data_fim + 'T23:59:59.999Z');
      }
    }

    // Contar total
    const total = await this.prisma.programacoes_os.count({ where });

    // Buscar dados
    const programacoes = await this.prisma.programacoes_os.findMany({
      where,
      include: {
        tarefas_programacao: {
          include: {
            tarefa: {
              select: {
                id: true,
                nome: true,
                categoria: true,
                tipo_manutencao: true,
                tempo_estimado: true,
                duracao_estimada: true,
              },
            },
          },
        },
      },
      orderBy: { criado_em: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Buscar estatísticas
    const stats = await this.obterEstatisticas();

    return {
      data: programacoes.map(programacao => this.mapearParaResponse(programacao)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats,
    };
  }

  async buscarPorId(id: string): Promise<ProgramacaoDetalhesResponseDto> {
    const programacao = await this.prisma.programacoes_os.findFirst({
      where: {
        id,
        deletado_em: null,
      },
      include: {
        tarefas_programacao: {
          include: {
            tarefa: {
              select: {
                id: true,
                nome: true,
                categoria: true,
                tipo_manutencao: true,
                tempo_estimado: true,
                duracao_estimada: true,
              },
            },
          },
        },
        materiais: true,
        ferramentas: true,
        tecnicos: true,
        historico: {
          orderBy: { data: 'desc' },
        },
        ordem_servico: true,
      },
    });

    if (!programacao) {
      throw new NotFoundException('Programação não encontrada');
    }

    return this.mapearParaDetalhes(programacao);
  }

  async criar(createDto: CreateProgramacaoDto, usuarioId?: string): Promise<ProgramacaoResponseDto> {
    this.logger.log('=== SERVICE: CRIAR PROGRAMAÇÃO ===');
    this.logger.log('Dados recebidos:', JSON.stringify(createDto, null, 2));

    // Validar relacionamentos
    this.logger.log('Iniciando validação de relacionamentos...');
    await this.validarRelacionamentos(createDto);

    // Gerar código único
    const codigo = await this.gerarCodigo();

    // Calcular custo total dos materiais e técnicos
    const orcamento_previsto = this.calcularOrcamentoPrevisto(createDto);

    return await this.prisma.$transaction(async (prisma) => {
      // Criar programação
      const programacao = await prisma.programacoes_os.create({
        data: {
          codigo,
          descricao: createDto.descricao,
          local: createDto.local,
          ativo: createDto.ativo,
          condicoes: createDto.condicoes,
          tipo: createDto.tipo,
          prioridade: createDto.prioridade,
          origem: createDto.origem,
          planta_id: createDto.planta_id,
          equipamento_id: createDto.equipamento_id,
          anomalia_id: createDto.anomalia_id,
          plano_manutencao_id: createDto.plano_manutencao_id,
          dados_origem: createDto.dados_origem,
          tempo_estimado: createDto.tempo_estimado,
          duracao_estimada: createDto.duracao_estimada,
          data_previsao_inicio: createDto.data_previsao_inicio ? new Date(createDto.data_previsao_inicio) : null,
          data_previsao_fim: createDto.data_previsao_fim ? new Date(createDto.data_previsao_fim) : null,
          necessita_veiculo: createDto.necessita_veiculo || false,
          assentos_necessarios: createDto.assentos_necessarios,
          carga_necessaria: createDto.carga_necessaria,
          observacoes_veiculo: createDto.observacoes_veiculo,
          data_hora_programada: createDto.data_hora_programada ? new Date(createDto.data_hora_programada) : null,
          responsavel: createDto.responsavel,
          responsavel_id: createDto.responsavel_id,
          time_equipe: createDto.time_equipe,
          orcamento_previsto: createDto.orcamento_previsto || orcamento_previsto,
          observacoes: createDto.observacoes,
          observacoes_programacao: createDto.observacoes_programacao,
          justificativa: createDto.justificativa,
          criado_por_id: usuarioId,
        },
        include: {
          tarefas_programacao: {
            include: {
              tarefa: {
                select: {
                  id: true,
                  nome: true,
                  categoria: true,
                  tipo_manutencao: true,
                  tempo_estimado: true,
                  duracao_estimada: true,
                },
              },
            },
          },
        },
      });

      // Criar tarefas associadas
      if (createDto.tarefas_ids && createDto.tarefas_ids.length > 0) {
        await this.adicionarTarefas(prisma, programacao.id, createDto.tarefas_ids);
      }

      // Criar materiais
      if (createDto.materiais && createDto.materiais.length > 0) {
        await this.criarMateriais(prisma, programacao.id, createDto.materiais);
      }

      // Criar ferramentas
      if (createDto.ferramentas && createDto.ferramentas.length > 0) {
        await this.criarFerramentas(prisma, programacao.id, createDto.ferramentas);
      }

      // Criar técnicos
      if (createDto.tecnicos && createDto.tecnicos.length > 0) {
        await this.criarTecnicos(prisma, programacao.id, createDto.tecnicos);
      }

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        programacao.id,
        'CRIACAO',
        'Sistema',
        usuarioId,
        'Programação criada',
        null,
        StatusProgramacaoOS.PENDENTE,
      );

      return this.mapearParaResponse(programacao);
    }, {
      timeout: 15000, // 15 seconds timeout
    });
  }

  async atualizar(id: string, updateDto: UpdateProgramacaoDto, usuarioId?: string): Promise<ProgramacaoResponseDto> {
    const programacao = await this.buscarPorId(id);

    // Verificar se pode ser editada
    if (!['RASCUNHO', 'PENDENTE'].includes(programacao.status)) {
      throw new ConflictException('Apenas programações em rascunho ou pendentes podem ser editadas');
    }

    // Validar relacionamentos se alterados
    if (updateDto.planta_id || updateDto.equipamento_id || updateDto.anomalia_id || updateDto.plano_manutencao_id) {
      await this.validarRelacionamentos(updateDto);
    }

    // Prepare data without undefined fields to avoid Prisma issues
    const updateData: any = {};

    Object.keys(updateDto).forEach(key => {
      const value = updateDto[key as keyof typeof updateDto];
      if (value !== undefined) {
        if (key === 'data_previsao_inicio' || key === 'data_previsao_fim' || key === 'data_hora_programada') {
          updateData[key] = new Date(value as string);
        } else {
          updateData[key] = value;
        }
      }
    });

    const programacaoAtualizada = await this.prisma.programacoes_os.update({
      where: { id },
      data: updateData,
      include: {
        tarefas_programacao: {
          include: {
            tarefa: {
              select: {
                id: true,
                nome: true,
                categoria: true,
                tipo_manutencao: true,
                tempo_estimado: true,
                duracao_estimada: true,
              },
            },
          },
        },
      },
    });

    // Registrar histórico
    await this.registrarHistorico(
      this.prisma,
      id,
      'ATUALIZACAO',
      'Sistema',
      usuarioId,
      'Programação atualizada',
    );

    return this.mapearParaResponse(programacaoAtualizada);
  }

  async analisar(id: string, dto: AnalisarProgramacaoDto, usuarioId?: string): Promise<void> {
    const programacao = await this.buscarPorId(id);

    if (programacao.status !== StatusProgramacaoOS.PENDENTE) {
      throw new ConflictException('Apenas programações pendentes podem ser analisadas');
    }

    await this.prisma.programacoes_os.update({
      where: { id },
      data: {
        status: StatusProgramacaoOS.EM_ANALISE,
        analisado_por_id: usuarioId,
        data_analise: new Date(),
      },
    });

    await this.registrarHistorico(
      this.prisma,
      id,
      'ANALISE',
      'Sistema',
      usuarioId,
      dto.observacoes_analise,
      StatusProgramacaoOS.PENDENTE,
      StatusProgramacaoOS.EM_ANALISE,
    );
  }

  async aprovar(id: string, dto: AprovarProgramacaoDto, usuarioId?: string): Promise<void> {
    const programacao = await this.buscarPorId(id);

    if (programacao.status !== StatusProgramacaoOS.EM_ANALISE) {
      throw new ConflictException('Apenas programações em análise podem ser aprovadas');
    }

    await this.prisma.$transaction(async (prisma) => {
      // Atualizar programação
      await prisma.programacoes_os.update({
        where: { id },
        data: {
          status: StatusProgramacaoOS.APROVADA,
          aprovado_por_id: usuarioId,
          data_aprovacao: new Date(),
          orcamento_previsto: dto.ajustes_orcamento || programacao.orcamento_previsto,
          data_hora_programada: dto.data_programada_sugerida && dto.hora_programada_sugerida
            ? new Date(`${dto.data_programada_sugerida}T${dto.hora_programada_sugerida}:00Z`)
            : programacao.data_hora_programada,
        },
      });

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'APROVACAO',
        'Sistema',
        usuarioId,
        dto.observacoes_aprovacao,
        StatusProgramacaoOS.EM_ANALISE,
        StatusProgramacaoOS.APROVADA,
      );

      // Gerar OS automaticamente
      await this.gerarOrdemServico(prisma, id);
    }, {
      timeout: 10000, // 10 seconds timeout for approval process
    });
  }

  async rejeitar(id: string, dto: RejeitarProgramacaoDto, usuarioId?: string): Promise<void> {
    const programacao = await this.buscarPorId(id);

    if (programacao.status !== StatusProgramacaoOS.EM_ANALISE) {
      throw new ConflictException('Apenas programações em análise podem ser rejeitadas');
    }

    await this.prisma.programacoes_os.update({
      where: { id },
      data: {
        status: StatusProgramacaoOS.REJEITADA,
        motivo_rejeicao: dto.motivo_rejeicao,
      },
    });

    await this.registrarHistorico(
      this.prisma,
      id,
      'REJEICAO',
      'Sistema',
      usuarioId,
      `${dto.motivo_rejeicao}${dto.sugestoes_melhoria ? ` - Sugestões: ${dto.sugestoes_melhoria}` : ''}`,
      StatusProgramacaoOS.EM_ANALISE,
      StatusProgramacaoOS.REJEITADA,
    );
  }

  async cancelar(id: string, dto: CancelarProgramacaoDto, usuarioId?: string): Promise<void> {
    const programacao = await this.buscarPorId(id);

    if (['CANCELADA', 'APROVADA'].includes(programacao.status)) {
      throw new ConflictException('Programação não pode ser cancelada neste status');
    }

    const statusAnterior = programacao.status;

    await this.prisma.programacoes_os.update({
      where: { id },
      data: {
        status: StatusProgramacaoOS.CANCELADA,
        motivo_cancelamento: dto.motivo_cancelamento,
      },
    });

    await this.registrarHistorico(
      this.prisma,
      id,
      'CANCELAMENTO',
      'Sistema',
      usuarioId,
      dto.motivo_cancelamento,
      statusAnterior,
      StatusProgramacaoOS.CANCELADA,
    );
  }

  async criarDeAnomalia(anomaliaId: string, dto: CreateProgramacaoAnomaliaDto, usuarioId?: string): Promise<ProgramacaoResponseDto> {
    // Buscar anomalia
    const anomalia = await this.prisma.anomalias.findFirst({
      where: { id: anomaliaId, deleted_at: null },
      include: {
        equipamento: true,
        planta: true,
      },
    });

    if (!anomalia) {
      throw new NotFoundException('Anomalia não encontrada');
    }

    const createDto: CreateProgramacaoDto = {
      descricao: dto.ajustes?.descricao || `Correção de anomalia: ${anomalia.descricao}`,
      local: anomalia.local,
      ativo: anomalia.ativo,
      condicoes: anomalia.condicao === 'FUNCIONANDO' ? 'FUNCIONANDO' : 'PARADO',
      tipo: 'CORRETIVA',
      prioridade: dto.ajustes?.prioridade as any || anomalia.prioridade,
      origem: 'ANOMALIA',
      planta_id: anomalia.planta_id,
      equipamento_id: anomalia.equipamento_id,
      anomalia_id: anomalia.id,
      tempo_estimado: dto.ajustes?.tempo_estimado || 2,
      duracao_estimada: dto.ajustes?.tempo_estimado ? dto.ajustes.tempo_estimado * 1.5 : 3,
      dados_origem: {
        anomalia_descricao: anomalia.descricao,
        anomalia_data: anomalia.data,
        anomalia_prioridade: anomalia.prioridade,
      },
    };

    return this.criar(createDto, usuarioId);
  }

  async criarDeTarefas(dto: CreateProgramacaoTarefasDto, usuarioId?: string): Promise<ProgramacaoResponseDto> {
    // Buscar tarefas
    const tarefas = await this.prisma.tarefas.findMany({
      where: {
        id: { in: dto.tarefas_ids },
        deleted_at: null,
      },
      include: {
        equipamento: {
          include: { planta: true },
        },
      },
    });

    if (tarefas.length !== dto.tarefas_ids.length) {
      throw new NotFoundException('Uma ou mais tarefas não foram encontradas');
    }

    // Calcular tempo total
    const tempoTotal = tarefas.reduce((acc, tarefa) => acc + Number(tarefa.tempo_estimado), 0);
    const duracaoTotal = tarefas.reduce((acc, tarefa) => acc + Number(tarefa.duracao_estimada), 0);

    // Determinar planta e equipamento principal
    const plantas = [...new Set(tarefas.map(t => t.equipamento?.planta?.id).filter(Boolean))];
    const equipamentos = [...new Set(tarefas.map(t => t.equipamento_id).filter(Boolean))];

    const createDto: CreateProgramacaoDto = {
      descricao: dto.descricao || `Execução de ${tarefas.length} tarefa(s) de manutenção`,
      local: dto.agrupar_por === 'planta' && plantas.length === 1
        ? tarefas[0].equipamento?.planta?.nome || 'Local não definido'
        : 'Múltiplos locais',
      ativo: equipamentos.length === 1
        ? tarefas[0].equipamento?.nome || 'Equipamento não definido'
        : 'Múltiplos equipamentos',
      condicoes: 'FUNCIONANDO',
      tipo: tarefas[0].tipo_manutencao as any || 'PREVENTIVA',
      prioridade: dto.prioridade as any || 'MEDIA',
      origem: 'TAREFA',
      planta_id: plantas.length === 1 ? plantas[0] : null,
      equipamento_id: equipamentos.length === 1 ? equipamentos[0] : null,
      tempo_estimado: tempoTotal,
      duracao_estimada: duracaoTotal,
      data_hora_programada: dto.data_hora_programada
        ? dto.data_hora_programada
        : null,
      responsavel: dto.responsavel,
      observacoes: dto.observacoes,
      tarefas_ids: dto.tarefas_ids,
      dados_origem: {
        tarefas_count: tarefas.length,
        agrupamento: dto.agrupar_por,
        tarefas_nomes: tarefas.map(t => t.nome),
      },
    };

    return this.criar(createDto, usuarioId);
  }

  async adicionarTarefasProgramacao(id: string, dto: AdicionarTarefasDto, usuarioId?: string): Promise<void> {
    await this.buscarPorId(id); // Verificar se existe

    await this.prisma.$transaction(async (prisma) => {
      await this.adicionarTarefas(prisma, id, dto.tarefas_ids);

      await this.registrarHistorico(
        prisma,
        id,
        'ADICAO_TAREFAS',
        'Sistema',
        usuarioId,
        `Adicionadas ${dto.tarefas_ids.length} tarefa(s). ${dto.observacoes || ''}`,
      );
    }, {
      timeout: 8000, // 8 seconds timeout for adding tasks
    });
  }

  async atualizarTarefasProgramacao(id: string, dto: AtualizarTarefasDto, usuarioId?: string): Promise<void> {
    await this.buscarPorId(id); // Verificar se existe

    await this.prisma.$transaction(async (prisma) => {
      for (const tarefa of dto.tarefas) {
        await prisma.tarefas_programacao_os.updateMany({
          where: {
            programacao_id: id,
            tarefa_id: tarefa.tarefa_id,
          },
          data: {
            ordem: tarefa.ordem,
            status: tarefa.status,
            observacoes: tarefa.observacoes,
          },
        });
      }

      await this.registrarHistorico(
        prisma,
        id,
        'ATUALIZACAO_TAREFAS',
        'Sistema',
        usuarioId,
        `Atualizadas ${dto.tarefas.length} tarefa(s)`,
      );
    }, {
      timeout: 8000, // 8 seconds timeout for updating tasks
    });
  }

  async removerTarefaProgramacao(id: string, tarefaId: string, usuarioId?: string): Promise<void> {
    await this.buscarPorId(id); // Verificar se existe

    const tarefaRemovida = await this.prisma.tarefas_programacao_os.findFirst({
      where: {
        programacao_id: id,
        tarefa_id: tarefaId,
      },
      include: { tarefa: true },
    });

    if (!tarefaRemovida) {
      throw new NotFoundException('Tarefa não encontrada na programação');
    }

    await this.prisma.$transaction(async (prisma) => {
      await prisma.tarefas_programacao_os.delete({
        where: { id: tarefaRemovida.id },
      });

      await this.registrarHistorico(
        prisma,
        id,
        'REMOCAO_TAREFA',
        'Sistema',
        usuarioId,
        `Removida tarefa: ${tarefaRemovida.tarefa.nome}`,
      );
    }, {
      timeout: 5000, // 5 seconds timeout for removing task
    });
  }

  async deletar(id: string, usuarioId?: string): Promise<void> {
    const programacao = await this.buscarPorId(id);

    if (programacao.status === StatusProgramacaoOS.APROVADA) {
      throw new ConflictException('Programações aprovadas não podem ser deletadas');
    }

    await this.prisma.programacoes_os.update({
      where: { id },
      data: { deletado_em: new Date() },
    });

    await this.registrarHistorico(
      this.prisma,
      id,
      'EXCLUSAO',
      'Sistema',
      usuarioId,
      'Programação excluída',
    );
  }

  // Métodos auxiliares privados

  private async validarRelacionamentos(dto: Partial<CreateProgramacaoDto>): Promise<void> {
    if (dto.planta_id) {
      const planta = await this.prisma.plantas.findFirst({
        where: { id: dto.planta_id, deleted_at: null },
      });
      if (!planta) {
        throw new NotFoundException('Planta não encontrada');
      }
    }

    if (dto.equipamento_id) {
      const equipamento = await this.prisma.equipamentos.findFirst({
        where: { id: dto.equipamento_id, deleted_at: null },
      });
      if (!equipamento) {
        throw new NotFoundException('Equipamento não encontrado');
      }
    }

    if (dto.anomalia_id) {
      const anomalia = await this.prisma.anomalias.findFirst({
        where: { id: dto.anomalia_id, deleted_at: null },
      });
      if (!anomalia) {
        throw new NotFoundException('Anomalia não encontrada');
      }
    }

    if (dto.plano_manutencao_id) {
      const plano = await this.prisma.planos_manutencao.findFirst({
        where: { id: dto.plano_manutencao_id, deleted_at: null },
      });
      if (!plano) {
        throw new NotFoundException('Plano de manutenção não encontrado');
      }
    }
  }

  private async gerarCodigo(): Promise<string> {
    const ano = new Date().getFullYear();
    const count = await this.prisma.programacoes_os.count({
      where: {
        codigo: { startsWith: `PRG-${ano}-` },
      },
    });

    return `PRG-${ano}-${String(count + 1).padStart(3, '0')}`;
  }

  private calcularOrcamentoPrevisto(dto: CreateProgramacaoDto): number {
    let total = 0;

    if (dto.materiais) {
      total += dto.materiais.reduce((acc, material) => {
        const custo = (material.custo_unitario || 0) * material.quantidade_planejada;
        return acc + custo;
      }, 0);
    }

    if (dto.tecnicos) {
      total += dto.tecnicos.reduce((acc, tecnico) => {
        const custo = (tecnico.custo_hora || 0) * tecnico.horas_estimadas;
        return acc + custo;
      }, 0);
    }

    return total;
  }

  private async adicionarTarefas(prisma: any, programacaoId: string, tarefasIds: string[]): Promise<void> {
    // Verificar se as tarefas existem
    const tarefas = await prisma.tarefas.findMany({
      where: {
        id: { in: tarefasIds },
        deleted_at: null,
      },
    });

    if (tarefas.length !== tarefasIds.length) {
      throw new NotFoundException('Uma ou mais tarefas não foram encontradas');
    }

    // Verificar duplicatas
    const existentes = await prisma.tarefas_programacao_os.findMany({
      where: {
        programacao_id: programacaoId,
        tarefa_id: { in: tarefasIds },
      },
    });

    if (existentes.length > 0) {
      throw new ConflictException('Uma ou mais tarefas já estão associadas à programação');
    }

    // Adicionar tarefas
    const dados = tarefasIds.map((tarefaId, index) => ({
      programacao_id: programacaoId,
      tarefa_id: tarefaId,
      ordem: index + 1,
    }));

    await prisma.tarefas_programacao_os.createMany({ data: dados });
  }

  private async criarMateriais(prisma: any, programacaoId: string, materiais: any[]): Promise<void> {
    const dados = materiais.map(material => ({
      programacao_id: programacaoId,
      descricao: material.descricao,
      quantidade_planejada: material.quantidade_planejada,
      unidade: material.unidade,
      custo_unitario: material.custo_unitario,
      custo_total: material.custo_unitario ? material.custo_unitario * material.quantidade_planejada : null,
    }));

    await prisma.materiais_programacao_os.createMany({ data: dados });
  }

  private async criarFerramentas(prisma: any, programacaoId: string, ferramentas: any[]): Promise<void> {
    const dados = ferramentas.map(ferramenta => ({
      programacao_id: programacaoId,
      descricao: ferramenta.descricao,
      quantidade: ferramenta.quantidade,
    }));

    await prisma.ferramentas_programacao_os.createMany({ data: dados });
  }

  private async criarTecnicos(prisma: any, programacaoId: string, tecnicos: any[]): Promise<void> {
    const dados = tecnicos.map(tecnico => ({
      programacao_id: programacaoId,
      nome: tecnico.nome,
      especialidade: tecnico.especialidade,
      horas_estimadas: tecnico.horas_estimadas,
      custo_hora: tecnico.custo_hora,
      custo_total: tecnico.custo_hora ? tecnico.custo_hora * tecnico.horas_estimadas : null,
      tecnico_id: tecnico.tecnico_id,
    }));

    await prisma.tecnicos_programacao_os.createMany({ data: dados });
  }

  private async registrarHistorico(
    prismaOrTransaction: any,
    programacaoId: string,
    acao: string,
    usuario: string,
    usuarioId?: string,
    observacoes?: string,
    statusAnterior?: StatusProgramacaoOS,
    statusNovo?: StatusProgramacaoOS,
  ): Promise<void> {
    // Use a instância fornecida (pode ser this.prisma ou uma transação)
    const prismaClient = prismaOrTransaction || this.prisma;

    await prismaClient.historico_programacao_os.create({
      data: {
        programacao_id: programacaoId,
        acao,
        usuario,
        usuario_id: usuarioId,
        observacoes,
        status_anterior: statusAnterior,
        status_novo: statusNovo,
      },
    });
  }

  private async gerarOrdemServico(prisma: any, programacaoId: string): Promise<void> {
    const programacao = await prisma.programacoes_os.findUnique({
      where: { id: programacaoId },
      include: {
        tarefas_programacao: true,
        materiais: true,
        ferramentas: true,
        tecnicos: true,
      },
    });

    // Gerar número da OS
    const ano = new Date().getFullYear();
    const count = await prisma.ordens_servico.count({
      where: {
        numero_os: { startsWith: `OS-${ano}-` },
      },
    });
    const numeroOS = `OS-${ano}-${String(count + 1).padStart(3, '0')}`;

    // Criar OS
    const os = await prisma.ordens_servico.create({
      data: {
        programacao_id: programacaoId,
        numero_os: numeroOS,
        descricao: programacao.descricao,
        local: programacao.local,
        ativo: programacao.ativo,
        condicoes: programacao.condicoes,
        tipo: programacao.tipo,
        prioridade: programacao.prioridade,
        origem: programacao.origem,
        planta_id: programacao.planta_id,
        equipamento_id: programacao.equipamento_id,
        anomalia_id: programacao.anomalia_id,
        plano_manutencao_id: programacao.plano_manutencao_id,
        dados_origem: programacao.dados_origem,
        tempo_estimado: programacao.tempo_estimado,
        duracao_estimada: programacao.duracao_estimada,
        data_hora_programada: programacao.data_hora_programada || new Date(),
        responsavel: programacao.responsavel || '',
        responsavel_id: programacao.responsavel_id,
        time_equipe: programacao.time_equipe,
        orcamento_previsto: programacao.orcamento_previsto,
        observacoes: programacao.observacoes,
        observacoes_programacao: programacao.observacoes_programacao,
      },
    });

    // Copiar tarefas para a OS
    if (programacao.tarefas_programacao.length > 0) {
      const tarefasOS = programacao.tarefas_programacao.map(tp => ({
        os_id: os.id,
        tarefa_id: tp.tarefa_id,
        ordem: tp.ordem,
      }));
      await prisma.tarefas_os.createMany({ data: tarefasOS });
    }

    // Copiar materiais para a OS
    if (programacao.materiais.length > 0) {
      const materiaisOS = programacao.materiais.map(m => ({
        os_id: os.id,
        descricao: m.descricao,
        quantidade_planejada: m.quantidade_planejada,
        unidade: m.unidade,
        custo_unitario: m.custo_unitario,
        custo_total: m.custo_total,
        confirmado: m.confirmado,
        disponivel: m.disponivel,
        observacoes: m.observacoes,
      }));
      await prisma.materiais_os.createMany({ data: materiaisOS });
    }

    // Copiar ferramentas para a OS
    if (programacao.ferramentas.length > 0) {
      const ferramentasOS = programacao.ferramentas.map(f => ({
        os_id: os.id,
        descricao: f.descricao,
        quantidade: f.quantidade,
        confirmada: f.confirmada,
        disponivel: f.disponivel,
        observacoes: f.observacoes,
      }));
      await prisma.ferramentas_os.createMany({ data: ferramentasOS });
    }

    // Copiar técnicos para a OS
    if (programacao.tecnicos.length > 0) {
      const tecnicosOS = programacao.tecnicos.map(t => ({
        os_id: os.id,
        nome: t.nome,
        especialidade: t.especialidade,
        horas_estimadas: t.horas_estimadas,
        custo_hora: t.custo_hora,
        custo_total: t.custo_total,
        disponivel: t.disponivel,
        tecnico_id: t.tecnico_id,
      }));
      await prisma.tecnicos_os.createMany({ data: tecnicosOS });
    }
  }

  private async obterEstatisticas(): Promise<any> {
    const stats = await this.prisma.programacoes_os.groupBy({
      by: ['status'],
      where: { deletado_em: null },
      _count: true,
    });

    const resultado = {
      rascunho: 0,
      pendentes: 0,
      em_analise: 0,
      aprovadas: 0,
      rejeitadas: 0,
      canceladas: 0,
    };

    stats.forEach(stat => {
      switch (stat.status) {
        case StatusProgramacaoOS.RASCUNHO:
          resultado.rascunho = stat._count;
          break;
        case StatusProgramacaoOS.PENDENTE:
          resultado.pendentes = stat._count;
          break;
        case StatusProgramacaoOS.EM_ANALISE:
          resultado.em_analise = stat._count;
          break;
        case StatusProgramacaoOS.APROVADA:
          resultado.aprovadas = stat._count;
          break;
        case StatusProgramacaoOS.REJEITADA:
          resultado.rejeitadas = stat._count;
          break;
        case StatusProgramacaoOS.CANCELADA:
          resultado.canceladas = stat._count;
          break;
      }
    });

    return resultado;
  }

  private mapearParaResponse(programacao: any): ProgramacaoResponseDto {
    return {
      id: programacao.id,
      criado_em: programacao.criado_em,
      atualizado_em: programacao.atualizado_em,
      deletado_em: programacao.deletado_em,
      codigo: programacao.codigo,
      descricao: programacao.descricao,
      local: programacao.local,
      ativo: programacao.ativo,
      condicoes: programacao.condicoes,
      status: programacao.status,
      tipo: programacao.tipo,
      prioridade: programacao.prioridade,
      origem: programacao.origem,
      planta_id: programacao.planta_id,
      equipamento_id: programacao.equipamento_id,
      anomalia_id: programacao.anomalia_id,
      plano_manutencao_id: programacao.plano_manutencao_id,
      dados_origem: programacao.dados_origem,
      data_previsao_inicio: programacao.data_previsao_inicio,
      data_previsao_fim: programacao.data_previsao_fim,
      tempo_estimado: Number(programacao.tempo_estimado),
      duracao_estimada: Number(programacao.duracao_estimada),
      necessita_veiculo: programacao.necessita_veiculo,
      assentos_necessarios: programacao.assentos_necessarios,
      carga_necessaria: programacao.carga_necessaria ? Number(programacao.carga_necessaria) : null,
      observacoes_veiculo: programacao.observacoes_veiculo,
      data_hora_programada: programacao.data_hora_programada,
      responsavel: programacao.responsavel,
      responsavel_id: programacao.responsavel_id,
      time_equipe: programacao.time_equipe,
      orcamento_previsto: programacao.orcamento_previsto ? Number(programacao.orcamento_previsto) : null,
      observacoes: programacao.observacoes,
      observacoes_programacao: programacao.observacoes_programacao,
      justificativa: programacao.justificativa,
      motivo_rejeicao: programacao.motivo_rejeicao,
      motivo_cancelamento: programacao.motivo_cancelamento,
      tarefas_programacao: programacao.tarefas_programacao?.map((tp: any) => ({
        id: tp.id,
        programacao_id: tp.programacao_id,
        tarefa_id: tp.tarefa_id,
        ordem: tp.ordem,
        status: tp.status,
        observacoes: tp.observacoes,
        created_at: tp.created_at,
        updated_at: tp.updated_at,
        tarefa: {
          id: tp.tarefa.id,
          nome: tp.tarefa.nome,
          categoria: tp.tarefa.categoria,
          tipo_manutencao: tp.tarefa.tipo_manutencao,
          tempo_estimado: Number(tp.tarefa.tempo_estimado),
          duracao_estimada: Number(tp.tarefa.duracao_estimada),
        },
      })) || [],
      criado_por: programacao.criado_por,
      criado_por_id: programacao.criado_por_id,
      analisado_por: programacao.analisado_por,
      analisado_por_id: programacao.analisado_por_id,
      data_analise: programacao.data_analise,
      aprovado_por: programacao.aprovado_por,
      aprovado_por_id: programacao.aprovado_por_id,
      data_aprovacao: programacao.data_aprovacao,
    };
  }

  private mapearParaDetalhes(programacao: any): ProgramacaoDetalhesResponseDto {
    const base = this.mapearParaResponse(programacao);

    return {
      ...base,
      materiais: programacao.materiais?.map((m: any) => ({
        id: m.id,
        programacao_id: m.programacao_id,
        descricao: m.descricao,
        quantidade_planejada: Number(m.quantidade_planejada),
        unidade: m.unidade,
        custo_unitario: m.custo_unitario ? Number(m.custo_unitario) : null,
        custo_total: m.custo_total ? Number(m.custo_total) : null,
        confirmado: m.confirmado,
        disponivel: m.disponivel,
        observacoes: m.observacoes,
        created_at: m.created_at,
        updated_at: m.updated_at,
      })) || [],
      ferramentas: programacao.ferramentas?.map((f: any) => ({
        id: f.id,
        programacao_id: f.programacao_id,
        descricao: f.descricao,
        quantidade: f.quantidade,
        confirmada: f.confirmada,
        disponivel: f.disponivel,
        observacoes: f.observacoes,
        created_at: f.created_at,
        updated_at: f.updated_at,
      })) || [],
      tecnicos: programacao.tecnicos?.map((t: any) => ({
        id: t.id,
        programacao_id: t.programacao_id,
        nome: t.nome,
        especialidade: t.especialidade,
        horas_estimadas: Number(t.horas_estimadas),
        custo_hora: t.custo_hora ? Number(t.custo_hora) : null,
        custo_total: t.custo_total ? Number(t.custo_total) : null,
        disponivel: t.disponivel,
        tecnico_id: t.tecnico_id,
        created_at: t.created_at,
        updated_at: t.updated_at,
      })) || [],
      historico: programacao.historico?.map((h: any) => ({
        id: h.id,
        programacao_id: h.programacao_id,
        acao: h.acao,
        usuario: h.usuario,
        usuario_id: h.usuario_id,
        data: h.data,
        observacoes: h.observacoes,
        status_anterior: h.status_anterior,
        status_novo: h.status_novo,
        dados_extras: h.dados_extras,
      })) || [],
      ordem_servico: programacao.ordem_servico,
    };
  }
}