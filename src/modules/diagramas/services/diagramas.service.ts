import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CreateDiagramaDto } from '../dto/create-diagrama.dto';
import { UpdateDiagramaDto } from '../dto/update-diagrama.dto';

@Injectable()
export class DiagramasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria um novo diagrama para uma unidade
   */
  async create(createDiagramaDto: CreateDiagramaDto) {
    const { unidadeId, nome, descricao, ativo, configuracoes } = createDiagramaDto;

    // Verificar se a unidade existe
    const unidade = await this.prisma.unidades.findUnique({
      where: { id: unidadeId, deleted_at: null },
    });

    if (!unidade) {
      throw new NotFoundException('Unidade não encontrada');
    }

    // Configurações padrão se não fornecidas
    const configPadrao = {
      zoom: 1.0,
      grid: {
        enabled: true,
        size: 20,
        snapToGrid: true,
      },
      canvas: {
        width: 2000,
        height: 1500,
        backgroundColor: '#f5f5f5',
      },
      viewport: {
        x: 0,
        y: 0,
        scale: 1.0,
      },
      ...configuracoes,
    };

    // Criar diagrama
    const diagrama = await this.prisma.diagramas_unitarios.create({
      data: {
        unidade_id: unidadeId,
        nome,
        descricao,
        versao: '1.0',
        ativo: ativo !== undefined ? ativo : true,
        configuracoes: configPadrao as any,
      },
    });

    return this.formatDiagramaResponse(diagrama);
  }

  /**
   * Busca todos os diagramas de uma unidade
   */
  async findByUnidade(unidadeId: string) {
    // Verificar se a unidade existe
    const unidade = await this.prisma.unidades.findUnique({
      where: { id: unidadeId, deleted_at: null },
    });

    if (!unidade) {
      throw new NotFoundException('Unidade não encontrada');
    }

    // Buscar diagramas da unidade
    const diagramas = await this.prisma.diagramas_unitarios.findMany({
      where: {
        unidade_id: unidadeId,
        deleted_at: null,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // Buscar contagem de equipamentos e conexões para cada diagrama
    const diagramasComEstatisticas = await Promise.all(
      diagramas.map(async (diagrama) => {
        const [totalEquipamentos, totalConexoes] = await Promise.all([
          this.prisma.equipamentos.count({
            where: {
              diagrama_id: diagrama.id,
              deleted_at: null,
            },
          }),
          this.prisma.equipamentos_conexoes.count({
            where: {
              diagrama_id: diagrama.id,
              deleted_at: null,
            },
          }),
        ]);

        return {
          id: diagrama.id,
          nome: diagrama.nome,
          descricao: diagrama.descricao,
          versao: diagrama.versao,
          ativo: diagrama.ativo,
          unidadeId: diagrama.unidade_id,
          configuracoes: diagrama.configuracoes,
          thumbnailUrl: diagrama.thumbnail_url,
          estatisticas: {
            totalEquipamentos,
            totalConexoes,
          },
          createdAt: diagrama.created_at,
          updatedAt: diagrama.updated_at,
        };
      })
    );

    return diagramasComEstatisticas;
  }

  /**
   * Busca um diagrama por ID com opção de incluir dados em tempo real
   */
  async findOne(id: string, includeData = false) {
    const diagrama = await this.prisma.diagramas_unitarios.findFirst({
      where: {
        id,
        deleted_at: null,
      },
    });

    if (!diagrama) {
      throw new NotFoundException('Diagrama não encontrado');
    }

    // Buscar unidade
    const unidade = await this.prisma.unidades.findUnique({
      where: { id: diagrama.unidade_id },
      select: {
        id: true,
        nome: true,
        tipo: true,
        potencia: true,
      },
    });

    // Buscar equipamentos posicionados neste diagrama
    const equipamentos = await this.prisma.equipamentos.findMany({
      where: {
        diagrama_id: id,
        deleted_at: null,
      },
    });

    // Buscar tipos de equipamentos (filtrar nulls para BARRAMENTO/PONTO que não têm tipo)
    const tiposEquipamentosIds = [... new Set(equipamentos.map(eq => eq.tipo_equipamento_id).filter(id => id !== null))];
    const tiposEquipamentos = tiposEquipamentosIds.length > 0
      ? await this.prisma.tipos_equipamentos.findMany({
          where: { id: { in: tiposEquipamentosIds } },
        })
      : [];
    const tiposMap = new Map(tiposEquipamentos.map(t => [t.id, t]));

    // Formatar equipamentos
    const equipamentosFormatados = equipamentos.map((eq) => {
      const tipo = tiposMap.get(eq.tipo_equipamento_id);
      return {
        id: eq.id,
        nome: eq.nome,
        tag: eq.tag,
        classificacao: eq.classificacao,
        tipo_equipamento: eq.tipo_equipamento, // IMPORTANTE: Para BARRAMENTO/PONTO que não têm tipo_equipamento_id
        tipo: tipo ? {
          id: tipo.id,
          codigo: tipo.codigo,
          nome: tipo.nome,
          categoria: tipo.categoria,
          larguraPadrao: tipo.largura_padrao,
          alturaPadrao: tipo.altura_padrao,
          iconeSvg: tipo.icone_svg,
        } : null,
        posicao: {
          x: eq.posicao_x,
          y: eq.posicao_y,
        },
        rotacao: eq.rotacao || 0,
        dimensoes: {
          largura: eq.largura_customizada || tipo?.largura_padrao || 64,
          altura: eq.altura_customizada || tipo?.altura_padrao || 64,
        },
        status: eq.status,
        propriedades: eq.propriedades,
        // Campos MQTT para integração com dados em tempo real
        mqtt_habilitado: eq.mqtt_habilitado,
        topico_mqtt: eq.topico_mqtt,
        fabricante: eq.fabricante,
        modelo: eq.modelo,
        // Se includeData=true, buscar dados em tempo real (implementar depois com MQTT)
        dadosTempoReal: includeData ? null : undefined,
      };
    });

    // Buscar conexões
    const conexoes = await this.prisma.equipamentos_conexoes.findMany({
      where: {
        diagrama_id: id,
        deleted_at: null,
      },
    });

    // Buscar equipamentos origem e destino para as conexões
    const equipamentosConexoesIds = [
      ...new Set([
        ...conexoes.map(c => c.equipamento_origem_id),
        ...conexoes.map(c => c.equipamento_destino_id)
      ])
    ];
    const equipamentosConexoes = await this.prisma.equipamentos.findMany({
      where: { id: { in: equipamentosConexoesIds } },
      select: { id: true, nome: true, tag: true },
    });
    const equipamentosConexoesMap = new Map(equipamentosConexoes.map(e => [e.id, e]));

    // Formatar conexões
    const conexoesFormatadas = conexoes.map((conn) => ({
      id: conn.id,
      diagramaId: conn.diagrama_id,
      origem: {
        equipamentoId: conn.equipamento_origem_id,
        equipamento: equipamentosConexoesMap.get(conn.equipamento_origem_id),
        porta: conn.porta_origem,
      },
      destino: {
        equipamentoId: conn.equipamento_destino_id,
        equipamento: equipamentosConexoesMap.get(conn.equipamento_destino_id),
        porta: conn.porta_destino,
      },
      visual: {
        tipoLinha: conn.tipo_linha,
        cor: conn.cor,
        espessura: conn.espessura,
      },
      pontosIntermediarios: conn.pontos_intermediarios,
      rotulo: conn.rotulo,
      ordem: conn.ordem,
      createdAt: conn.created_at,
      updatedAt: conn.updated_at,
    }));

    // Estatísticas
    const estatisticas = {
      totalEquipamentos: equipamentos.length,
      equipamentosPorStatus: this.contarPorStatus(equipamentos),
      totalConexoes: conexoesFormatadas.length,
    };

    console.log('📤 [FIND ONE] Configurações do diagrama sendo retornadas:', JSON.stringify(diagrama.configuracoes, null, 2));
    const configs = diagrama.configuracoes as any;
    if (configs?.labelPositions) {
      console.log('✅ [FIND ONE] labelPositions encontrado com', Object.keys(configs.labelPositions).length, 'entradas');
    } else {
      console.log('⚠️ [FIND ONE] labelPositions NÃO encontrado nas configurações');
    }

    return {
      id: diagrama.id,
      nome: diagrama.nome,
      descricao: diagrama.descricao,
      versao: diagrama.versao,
      ativo: diagrama.ativo,
      unidadeId: diagrama.unidade_id,
      unidade,
      configuracoes: diagrama.configuracoes,
      thumbnailUrl: diagrama.thumbnail_url,
      equipamentos: equipamentosFormatados,
      conexoes: conexoesFormatadas,
      estatisticas,
      createdAt: diagrama.created_at,
      updatedAt: diagrama.updated_at,
    };
  }

  /**
   * Atualiza um diagrama
   */
  async update(id: string, updateDiagramaDto: UpdateDiagramaDto) {
    // Verificar se o diagrama existe
    const diagramaExistente = await this.prisma.diagramas_unitarios.findFirst({
      where: { id, deleted_at: null },
    });

    if (!diagramaExistente) {
      throw new NotFoundException('Diagrama não encontrado');
    }

    const { unidadeId, nome, descricao, configuracoes, ativo } = updateDiagramaDto;

    // Se mudou de unidade, verificar se a nova existe
    if (unidadeId && unidadeId !== diagramaExistente.unidade_id) {
      const unidade = await this.prisma.unidades.findUnique({
        where: { id: unidadeId, deleted_at: null },
      });

      if (!unidade) {
        throw new NotFoundException('Unidade não encontrada');
      }
    }

    // Mesclar configurações existentes com as novas
    const configExistente = diagramaExistente.configuracoes as any || {};
    console.log('🔍 [UPDATE DIAGRAMA] Configurações existentes:', JSON.stringify(configExistente, null, 2));
    console.log('🔍 [UPDATE DIAGRAMA] Novas configurações recebidas:', JSON.stringify(configuracoes, null, 2));

    const novasConfiguracoes = configuracoes
      ? { ...configExistente, ...configuracoes }
      : diagramaExistente.configuracoes;

    console.log('✅ [UPDATE DIAGRAMA] Configurações após merge:', JSON.stringify(novasConfiguracoes, null, 2));

    // Incrementar versão
    const versaoAtual = diagramaExistente.versao.split('.');
    const versaoNova = `${versaoAtual[0]}.${parseInt(versaoAtual[1]) + 1}`;

    // Atualizar diagrama
    const diagramaAtualizado = await this.prisma.diagramas_unitarios.update({
      where: { id },
      data: {
        unidade_id: unidadeId,
        nome,
        descricao,
        configuracoes: novasConfiguracoes as any,
        ativo,
        versao: versaoNova,
      },
    });

    return this.formatDiagramaResponse(diagramaAtualizado);
  }

  /**
   * Remove um diagrama (soft delete)
   */
  async remove(id: string) {
    // Verificar se o diagrama existe
    const diagrama = await this.prisma.diagramas_unitarios.findFirst({
      where: { id, deleted_at: null },
    });

    if (!diagrama) {
      throw new NotFoundException('Diagrama não encontrado');
    }

    // Soft delete em uma transação
    await this.prisma.$transaction(async (tx) => {
      // 1. Soft delete das conexões
      await tx.equipamentos_conexoes.updateMany({
        where: { diagrama_id: id },
        data: { deleted_at: new Date() },
      });

      // 2. Limpar diagrama_id, posicao_x, posicao_y dos equipamentos
      await tx.equipamentos.updateMany({
        where: { diagrama_id: id },
        data: {
          diagrama_id: null,
          posicao_x: null,
          posicao_y: null,
          rotacao: null,
        },
      });

      // 3. Soft delete do diagrama
      await tx.diagramas_unitarios.update({
        where: { id },
        data: { deleted_at: new Date() },
      });
    });

    return {
      id,
      message: 'Diagrama removido com sucesso',
      deletedAt: new Date(),
    };
  }

  /**
   * Formata a resposta do diagrama
   */
  private formatDiagramaResponse(diagrama: any) {
    console.log('📤 [FORMAT RESPONSE] Configurações sendo retornadas:', JSON.stringify(diagrama.configuracoes, null, 2));
    return {
      id: diagrama.id,
      nome: diagrama.nome,
      descricao: diagrama.descricao,
      versao: diagrama.versao,
      ativo: diagrama.ativo,
      unidadeId: diagrama.unidade_id,
      configuracoes: diagrama.configuracoes,
      thumbnailUrl: diagrama.thumbnail_url,
      createdAt: diagrama.created_at,
      updatedAt: diagrama.updated_at,
    };
  }

  /**
   * Conta equipamentos por status
   */
  private contarPorStatus(equipamentos: any[]) {
    return equipamentos.reduce((acc, eq) => {
      const status = eq.status || 'DESCONHECIDO';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
  }
}
