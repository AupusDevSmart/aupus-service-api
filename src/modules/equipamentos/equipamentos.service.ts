import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { MqttService } from '../../shared/mqtt/mqtt.service';
import { CreateEquipamentoDto } from './dto/create-equipamento.dto';
import { UpdateEquipamentoDto } from './dto/update-equipamento.dto';
import { EquipamentoQueryDto } from './dto/equipamento-query.dto';
import { CreateComponenteUARDto } from './dto/componente-uar.dto';
import { ConfigurarMqttDto } from './dto/configurar-mqtt.dto';
import { CreateEquipamentoRapidoDto } from './dto/create-equipamento-rapido.dto';

@Injectable()
export class EquipamentosService {
  constructor(
    private prisma: PrismaService,
    @Optional() private mqttService?: MqttService,
  ) {}

  async create(createDto: CreateEquipamentoDto) {
    // Validar se unidade existe (para UC) ou equipamento pai existe (para UAR)
    if (createDto.classificacao === 'UC' && !createDto.unidade_id) {
      throw new BadRequestException('Equipamento UC deve ter uma unidade');
    }

    if (createDto.classificacao === 'UAR' && !createDto.equipamento_pai_id) {
      throw new BadRequestException('Componente UAR deve ter um equipamento pai');
    }

    if (createDto.unidade_id) {
      const unidadeExists = await this.prisma.unidades.findFirst({
        where: { id: createDto.unidade_id, deleted_at: null }
      });
      if (!unidadeExists) {
        throw new NotFoundException('Unidade não encontrada');
      }
    }

    if (createDto.equipamento_pai_id) {
      const equipamentoPaiExists = await this.prisma.equipamentos.findFirst({
        where: { id: createDto.equipamento_pai_id, deleted_at: null, classificacao: 'UC' }
      });
      if (!equipamentoPaiExists) {
        throw new NotFoundException('Equipamento pai não encontrado ou não é UC');
      }
    }

    // Extrair dados técnicos separadamente
    const { dados_tecnicos, ...equipamentoData } = createDto;

    // ✅ Aumentar timeout da transação para 15 segundos
    return await this.prisma.$transaction(async (prisma) => {
      // Criar equipamento
      const equipamento = await prisma.equipamentos.create({
        data: equipamentoData as any,
        include: {
          unidade: {
            select: {
              id: true,
              nome: true,
              planta: {
                select: {
                  id: true,
                  nome: true,
                  proprietario: {
                    select: {
                      id: true,
                      nome: true,
                      cpf_cnpj: true,
                    },
                  },
                },
              },
            },
          },
          equipamento_pai: {
            select: {
              id: true,
              nome: true,
              classificacao: true,
              criticidade: true,
            },
          },
        },
      });

      // Criar dados técnicos se fornecidos
      if (dados_tecnicos && dados_tecnicos.length > 0) {
        await prisma.equipamentos_dados_tecnicos.createMany({
          data: dados_tecnicos.map((dt) => ({
            equipamento_id: equipamento.id,
            ...dt,
          })),
        });
      }

      return equipamento;
    }, {
      maxWait: 15000, // Aguarda até 15s para começar a transação
      timeout: 15000,  // Timeout de 15s para completar a transação
    });
  }

  /**
   * Cria um equipamento rapidamente com dados mínimos para uso imediato no diagrama
   * Ideal para adicionar equipamentos durante a edição do sinóptico
   * Dados completos podem ser preenchidos posteriormente na página de cadastro
   */
  async criarEquipamentoRapido(dto: CreateEquipamentoRapidoDto) {
    // Validar se unidade existe
    const unidade = await this.prisma.unidades.findFirst({
      where: { id: dto.unidade_id?.trim(), deleted_at: null }
    });

    if (!unidade) {
      throw new NotFoundException('Unidade não encontrada');
    }

    // Validar se tipo de equipamento existe e buscar categoria/fabricante
    const tipoEquipamento = await this.prisma.tipos_equipamentos.findUnique({
      where: { id: dto.tipo_equipamento_id?.trim() },
      include: {
        categoria: true,
      },
    });

    if (!tipoEquipamento) {
      throw new NotFoundException('Tipo de equipamento não encontrado');
    }

    // Gerar nome automático se não fornecido
    let nome = dto.nome?.trim();
    if (!nome) {
      // Contar quantos equipamentos desse tipo já existem na unidade
      const count = await this.prisma.equipamentos.count({
        where: {
          unidade_id: dto.unidade_id?.trim(),
          tipo_equipamento_id: dto.tipo_equipamento_id?.trim(),
          deleted_at: null
        }
      });

      nome = `${tipoEquipamento.nome} ${count + 1}`;
    }

    // Criar equipamento com dados mínimos
    const equipamento = await this.prisma.equipamentos.create({
      data: {
        nome: nome.trim(),
        tag: dto.tag?.trim() || null,
        unidade_id: dto.unidade_id.trim(),
        classificacao: dto.classificacao || 'UC',
        tipo_equipamento_id: dto.tipo_equipamento_id.trim(),
        criticidade: '3', // Criticidade média por padrão
        em_operacao: 'sim',
        // ✅ Preencher fabricante do modelo automaticamente
        fabricante: tipoEquipamento.fabricante,
        modelo: null,
        numero_serie: null,
        localizacao: 'A definir',
      },
      include: {
        tipo_equipamento_rel: {
          select: {
            id: true,
            codigo: true,
            nome: true,
            categoria_id: true,
            categoria: true,
            fabricante: true,
            largura_padrao: true,
            altura_padrao: true,
            icone_svg: true,
          }
        },
        unidade: {
          select: {
            id: true,
            nome: true,
            planta: {
              select: {
                id: true,
                nome: true,
              }
            }
          }
        }
      }
    });

    return {
      success: true,
      message: 'Equipamento criado rapidamente. Complete os dados depois na página de cadastro.',
      data: {
        ...equipamento,
        // Garantir trim em todos os campos de string
        id: equipamento.id?.trim(),
        nome: equipamento.nome?.trim(),
        tag: equipamento.tag?.trim() || null,
        tipoEquipamento: equipamento.tipo_equipamento_rel,
      },
    };
  }

  async findAll(query: EquipamentoQueryDto) {
    const {
      page = 1,
      limit = 10,
      search,
      unidade_id,
      planta_id,
      proprietario_id,
      classificacao,
      criticidade,
      equipamento_pai_id,
      semDiagrama,
      tipo,
      mqtt_habilitado,
      orderBy = 'created_at',
      orderDirection = 'desc'
    } = query;
    const skip = (page - 1) * limit;

    // Construir filtros
    const where: any = {
      deleted_at: null,
    };

    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { tag: { contains: search, mode: 'insensitive' } },
        { fabricante: { contains: search, mode: 'insensitive' } },
        { modelo: { contains: search, mode: 'insensitive' } },
        { numero_serie: { contains: search, mode: 'insensitive' } },
        { localizacao: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (unidade_id) where.unidade_id = unidade_id;

    // Filtros hierárquicos: proprietário > planta > unidade
    // Prioridade: unidade > planta > proprietário
    // Se unidade está selecionada, não aplicar filtros de planta ou proprietário
    if (!unidade_id) {
      // Filtrar por planta (via relação com unidade)
      if (planta_id) {
        where.unidade = {
          planta_id: planta_id.trim()
        };
      }
      // Filtrar por proprietário (via relação com unidade -> planta -> proprietário)
      else if (proprietario_id) {
        where.unidade = {
          planta: {
            proprietario_id: proprietario_id.trim()
          }
        };
      }
    }

    if (classificacao) where.classificacao = classificacao;
    if (criticidade) where.criticidade = criticidade;
    if (equipamento_pai_id) where.equipamento_pai_id = equipamento_pai_id;

    // Filtro semDiagrama - equipamentos não posicionados em diagramas
    if (semDiagrama !== undefined) {
      if (semDiagrama === true) {
        where.diagrama_id = null;
      } else {
        where.diagrama_id = { not: null };
      }
    }

    // Filtro por tipo de equipamento
    if (tipo) {
      where.tipo_equipamento_id = tipo;
    }

    // Filtro por MQTT habilitado
    if (mqtt_habilitado !== undefined) {
      where.mqtt_habilitado = mqtt_habilitado;
      console.log('   🔌 Adicionando filtro mqtt_habilitado =', mqtt_habilitado);
    }

    console.log('   📋 WHERE clause final:', JSON.stringify(where, null, 2));

    const [data, total] = await Promise.all([
      this.prisma.equipamentos.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderBy]: orderDirection },
        include: {
          unidade: {
            select: {
              id: true,
              nome: true,
              planta: {
                select: {
                  id: true,
                  nome: true,
                  proprietario: {
                    select: {
                      id: true,
                      nome: true,
                      cpf_cnpj: true,
                    },
                  },
                },
              },
            },
          },
          tipo_equipamento_rel: {
            select: {
              id: true,
              codigo: true,
              nome: true,
              categoria: true,
              largura_padrao: true,
              altura_padrao: true,
              icone_svg: true,
            },
          },
          equipamento_pai: {
            select: {
              id: true,
              nome: true,
              classificacao: true,
              criticidade: true,
            },
          },
          equipamentos_filhos: {
            select: {
              id: true,
              nome: true,
              classificacao: true,
            },
            where: {
              deleted_at: null,
            },
          },
        },
      }),
      this.prisma.equipamentos.count({ where }),
    ]);

    // Calcular total de equipamentos sem diagrama (para meta)
    const totalSemDiagrama = unidade_id
      ? await this.prisma.equipamentos.count({
          where: {
            ...where,
            diagrama_id: null,
          },
        })
      : undefined;

    // Adicionar contagem de componentes e informações de diagrama
    const dataWithCounts = data.map((equipamento: any) => ({
      ...equipamento,
      totalComponentes: equipamento.equipamentos_filhos?.length || 0,
      noDiagrama: equipamento.diagrama_id !== null,
      diagramaId: equipamento.diagrama_id,
      tipoEquipamento: equipamento.tipo_equipamento_rel,
    }));

    return {
      data: dataWithCounts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      meta: totalSemDiagrama !== undefined ? { totalSemDiagrama } : undefined,
    };
  }

  async findOne(id: string) {
    const equipamento = await this.prisma.equipamentos.findFirst({
      where: { id, deleted_at: null },
      include: {
        unidade: {
          include: {
            planta: true,
          },
        },
        tipo_equipamento_rel: {
          select: {
            id: true,
            codigo: true,
            nome: true,
            categoria: true,
            largura_padrao: true,
            altura_padrao: true,
            icone_svg: true,
          },
        },
        equipamento_pai: {
          select: {
            id: true,
            nome: true,
            classificacao: true,
            criticidade: true,
          },
        },
        equipamentos_filhos: {
          where: { deleted_at: null },
          include: {
            dados_tecnicos: true,
          },
        },
        dados_tecnicos: true,
      },
    });

    console.log('API: Dados técnicos do banco:', equipamento.dados_tecnicos);

    if (!equipamento) {
      throw new NotFoundException('Equipamento não encontrado');
    }

    return {
      ...equipamento,
      totalComponentes: equipamento.equipamentos_filhos?.length || 0,
      tipoEquipamento: equipamento.tipo_equipamento_rel,
    };
  }

  async update(id: string, updateDto: UpdateEquipamentoDto) {
    const equipamentoExists = await this.prisma.equipamentos.findFirst({
      where: { id, deleted_at: null },
    });

    if (!equipamentoExists) {
      throw new NotFoundException('Equipamento não encontrado');
    }

    // Extrair dados técnicos separadamente
    const { dados_tecnicos, ...equipamentoData } = updateDto;

    // ✅ CORRIGIDO: Aumentar timeout da transação para 15 segundos (suficiente para processar dados técnicos)
    return await this.prisma.$transaction(async (prisma) => {
      // Atualizar equipamento
      const equipamento = await prisma.equipamentos.update({
        where: { id },
        data: equipamentoData,
        include: {
          unidade: {
            select: {
              id: true,
              nome: true,
              planta: {
                select: {
                  id: true,
                  nome: true,
                  proprietario: {
                    select: {
                      id: true,
                      nome: true,
                      cpf_cnpj: true,
                    },
                  },
                },
              },
            },
          },
          equipamento_pai: {
            select: {
              id: true,
              nome: true,
              classificacao: true,
              criticidade: true,
            },
          },
        },
      });

      // Atualizar dados técnicos se fornecidos
      if (dados_tecnicos) {
        // Remover dados técnicos existentes
        await prisma.equipamentos_dados_tecnicos.deleteMany({
          where: { equipamento_id: id },
        });

        // Criar novos dados técnicos
        if (dados_tecnicos.length > 0) {
          await prisma.equipamentos_dados_tecnicos.createMany({
            data: dados_tecnicos.map((dt) => ({
              equipamento_id: id,
              ...dt,
            })),
          });
        }
      }

      return equipamento;
    }, {
      maxWait: 15000, // Aguarda até 15s para começar a transação
      timeout: 15000,  // Timeout de 15s para completar a transação
    });
  }

  async remove(id: string) {
    const equipamento = await this.prisma.equipamentos.findFirst({
      where: { id, deleted_at: null },
      include: {
        equipamentos_filhos: {
          where: { deleted_at: null },
        },
      },
    });

    if (!equipamento) {
      throw new NotFoundException('Equipamento não encontrado');
    }

    // Se for UC e tiver componentes, impedir exclusão
    if (equipamento.classificacao === 'UC' && equipamento.equipamentos_filhos.length > 0) {
      throw new BadRequestException('Não é possível excluir equipamento que possui componentes UAR');
    }

    // Soft delete
    await this.prisma.equipamentos.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    return { message: 'Equipamento removido com sucesso' };
  }

  async findComponentesByEquipamento(equipamentoId: string) {
    const equipamento = await this.prisma.equipamentos.findFirst({
      where: { id: equipamentoId, deleted_at: null, classificacao: 'UC' },
    });

    if (!equipamento) {
      throw new NotFoundException('Equipamento UC não encontrado');
    }

    return await this.prisma.equipamentos.findMany({
      where: {
        equipamento_pai_id: equipamentoId,
        deleted_at: null,
      },
      include: {
        dados_tecnicos: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findEquipamentosUC() {
    return await this.prisma.equipamentos.findMany({
      where: {
        classificacao: 'UC',
        deleted_at: null,
      },
      select: {
        id: true,
        nome: true,
        fabricante: true,
        modelo: true,
        unidade: {
          select: {
            id: true,
            nome: true,
            planta: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
        },
      },
      orderBy: { nome: 'asc' },
    });
  }

  async findUARDetalhes(uarId: string) {
    const uar = await this.prisma.equipamentos.findFirst({
      where: {
        id: uarId,
        deleted_at: null,
        classificacao: 'UAR'
      },
      include: {
        unidade: {
          select: {
            id: true,
            nome: true,
            planta: {
              select: {
                id: true,
                nome: true,
                localizacao: true,
              },
            },
          },
        },
        equipamento_pai: {
          select: {
            id: true,
            nome: true,
            classificacao: true,
            criticidade: true,
            fabricante: true,
            modelo: true,
            localizacao: true,
          },
        },
        dados_tecnicos: {
          orderBy: { campo: 'asc' },
        },
      },
    });

    if (!uar) {
      throw new NotFoundException('Componente UAR não encontrado');
    }

    return uar;
  }

  async findComponentesParaGerenciar(ucId: string) {
    // Verificar se UC existe
    const equipamentoUC = await this.prisma.equipamentos.findFirst({
      where: { id: ucId, deleted_at: null, classificacao: 'UC' },
      select: {
        id: true,
        nome: true,
        fabricante: true,
        modelo: true,
        unidade: {
          select: {
            id: true,
            nome: true,
            planta: {
              select: { id: true, nome: true }
            }
          }
        }
      }
    });

    if (!equipamentoUC) {
      throw new NotFoundException('Equipamento UC não encontrado');
    }

    // Buscar componentes UAR
    const componentes = await this.prisma.equipamentos.findMany({
      where: {
        equipamento_pai_id: ucId,
        deleted_at: null,
      },
      include: {
        dados_tecnicos: {
          orderBy: { campo: 'asc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return {
      equipamentoUC,
      componentes,
    };
  }

  async salvarComponentesUARLote(ucId: string, componentes: Partial<CreateEquipamentoDto & { id?: string }>[]) {
    const equipamentoUC = await this.prisma.equipamentos.findFirst({
      where: { id: ucId.trim(), deleted_at: null, classificacao: 'UC' }
    });

    if (!equipamentoUC) {
      throw new NotFoundException('Equipamento UC não encontrado');
    }

    console.log('💾 [BACKEND] Salvando componentes UAR em lote');
    console.log('💾 [BACKEND] UC ID:', ucId);
    console.log('💾 [BACKEND] Componentes recebidos:', componentes.length);
    console.log('💾 [BACKEND] IDs recebidos:', componentes.map(c => (c as any).id?.trim()));

    // 1. Buscar componentes existentes no banco
    const componentesExistentes = await this.prisma.equipamentos.findMany({
      where: {
        equipamento_pai_id: ucId.trim(),
        deleted_at: null,
      },
      select: { id: true }
    });

    const idsExistentes = componentesExistentes.map(c => c.id.trim());
    const idsRecebidos = componentes
      .map(c => (c as any).id?.trim())
      .filter(Boolean); // Remove undefined/null

    console.log('💾 [BACKEND] IDs existentes no banco:', idsExistentes);
    console.log('💾 [BACKEND] IDs recebidos (limpos):', idsRecebidos);

    // 2. Identificar componentes a serem excluídos (soft delete)
    const idsParaExcluir = idsExistentes.filter(id => !idsRecebidos.includes(id));

    console.log('💾 [BACKEND] IDs para EXCLUIR:', idsParaExcluir);

    if (idsParaExcluir.length > 0) {
      await this.prisma.equipamentos.updateMany({
        where: {
          id: { in: idsParaExcluir },
        },
        data: {
          deleted_at: new Date(),
        },
      });
      console.log(`✅ [BACKEND] ${idsParaExcluir.length} componentes excluídos`);
    }

    // 3. Criar/Atualizar componentes
    const resultados = [];

    for (const componente of componentes) {
      const componenteId = (componente as any).id?.trim();
      const { dados_tecnicos, ...componenteData } = componente;

      const baseData = {
        nome: componente.nome,
        fabricante: componente.fabricante,
        modelo: componente.modelo,
        numero_serie: componente.numero_serie,
        criticidade: componente.criticidade,
        tipo_equipamento: componente.tipo_equipamento,
        data_instalacao: componente.data_instalacao,
        localizacao_especifica: componente.localizacao_especifica,
        observacoes: componente.observacoes,
        fornecedor: componente.fornecedor,
        valor_imobilizado: componente.valor_imobilizado,
        valor_depreciacao: componente.valor_depreciacao,
        valor_contabil: componente.valor_contabil,
        classificacao: 'UAR' as const,
        equipamento_pai_id: ucId.trim(),
        unidade_id: equipamentoUC.unidade_id,
      };

      if (componenteId && !componenteId.startsWith('temp_')) {
        // Atualizar componente existente
        console.log(`🔄 [BACKEND] Atualizando componente ${componenteId}`);
        const atualizado = await this.prisma.equipamentos.update({
          where: { id: componenteId },
          data: baseData,
        });
        resultados.push(atualizado);
      } else {
        // Criar novo componente
        console.log(`➕ [BACKEND] Criando novo componente`);
        const criado = await this.prisma.equipamentos.create({
          data: baseData as any,
        });
        resultados.push(criado);
      }
    }

    console.log(`✅ [BACKEND] ${resultados.length} componentes processados com sucesso`);

    return {
      message: `${resultados.length} componentes processados com sucesso`,
      componentes: resultados
    };
  }

  async findByUnidade(unidadeId: string, query: EquipamentoQueryDto) {
    console.log('🔍 [findByUnidade] Iniciando busca de equipamentos');
    console.log('   📋 UnidadeId:', unidadeId);
    console.log('   📋 Query params:', JSON.stringify(query, null, 2));
    console.log('   🔌 mqtt_habilitado filter:', query.mqtt_habilitado);

    // Verificar se unidade existe
    const unidadeExists = await this.prisma.unidades.findFirst({
      where: { id: unidadeId, deleted_at: null },
      include: {
        planta: {
          select: {
            id: true,
            nome: true,
            localizacao: true,
          }
        }
      }
    });

    if (!unidadeExists) {
      console.log('   ❌ Unidade não encontrada:', unidadeId);
      throw new NotFoundException('Unidade não encontrada');
    }

    console.log('   ✅ Unidade encontrada:', unidadeExists.nome);

    // Usar o método findAll existente com filtro de unidade
    // Remove planta_id se existir, pois quando temos unidade_id não precisamos de planta_id
    const { planta_id, ...queryRestante } = query;
    const queryComUnidade = {
      ...queryRestante,
      unidade_id: unidadeId
    };

    console.log('   📋 Query final:', JSON.stringify(queryComUnidade, null, 2));

    const resultado = await this.findAll(queryComUnidade);

    console.log('   📊 Resultado:');
    console.log('      Total de equipamentos:', resultado.pagination.total);
    console.log('      Equipamentos retornados:', resultado.data.length);
    console.log('      Total sem diagrama:', resultado.meta?.totalSemDiagrama);

    // Log detalhado dos equipamentos UC
    const equipamentosUC = resultado.data.filter(e => e.classificacao === 'UC');
    console.log('      Equipamentos UC:', equipamentosUC.length);
    equipamentosUC.forEach((eq, idx) => {
      console.log(`         [${idx + 1}] ${eq.nome}`);
      console.log(`             - Tipo: ${eq.tipoEquipamento?.codigo || 'SEM TIPO'}`);
      console.log(`             - ID: ${eq.id.trim()}`);
      console.log(`             - No diagrama: ${eq.noDiagrama ? 'Sim' : 'Não'}`);
    });

    return {
      ...resultado,
      unidade: {
        id: unidadeExists.id,
        nome: unidadeExists.nome,
        planta: unidadeExists.planta,
      }
    };
  }

  async getEstatisticasUnidade(unidadeId: string) {
    // Verificar se unidade existe
    const unidade = await this.prisma.unidades.findFirst({
      where: { id: unidadeId, deleted_at: null },
      include: {
        planta: {
          select: {
            id: true,
            nome: true,
            localizacao: true,
          }
        }
      }
    });

    if (!unidade) {
      throw new NotFoundException('Unidade não encontrada');
    }

    const [
      totalEquipamentos,
      equipamentosPorTipo,
      equipamentosPorCriticidade,
      valorTotal,
      equipamentosUC,
      componentesUAR
    ] = await Promise.all([
      // Total de equipamentos
      this.prisma.equipamentos.count({
        where: { unidade_id: unidadeId, deleted_at: null }
      }),

      // Por tipo
      this.prisma.equipamentos.groupBy({
        by: ['classificacao'],
        where: { unidade_id: unidadeId, deleted_at: null },
        _count: { id: true }
      }),

      // Por criticidade
      this.prisma.equipamentos.groupBy({
        by: ['criticidade'],
        where: { unidade_id: unidadeId, deleted_at: null },
        _count: { id: true }
      }),

      // Valor total
      this.prisma.equipamentos.aggregate({
        where: {
          unidade_id: unidadeId,
          deleted_at: null,
          valor_contabil: { not: null }
        },
        _sum: { valor_contabil: true }
      }),

      // Contagem UCs
      this.prisma.equipamentos.count({
        where: {
          unidade_id: unidadeId,
          deleted_at: null,
          classificacao: 'UC'
        }
      }),

      // Contagem UARs
      this.prisma.equipamentos.count({
        where: {
          unidade_id: unidadeId,
          deleted_at: null,
          classificacao: 'UAR'
        }
      })
    ]);

    // Formatar dados de criticidade
    const criticidadeMap = equipamentosPorCriticidade.reduce((acc, item) => {
      acc[item.criticidade] = item._count.id;
      return acc;
    }, {} as Record<string, number>);

    return {
      unidade: {
        id: unidade.id,
        nome: unidade.nome,
        planta: unidade.planta,
      },
      totais: {
        equipamentos: totalEquipamentos,
        equipamentosUC,
        componentesUAR,
      },
      porCriticidade: {
        '1': criticidadeMap['1'] || 0,
        '2': criticidadeMap['2'] || 0,
        '3': criticidadeMap['3'] || 0,
        '4': criticidadeMap['4'] || 0,
        '5': criticidadeMap['5'] || 0,
      },
      financeiro: {
        valorTotalContabil: Number(valorTotal._sum.valor_contabil || 0),
      }
    };
  }

  /**
   * Cria um componente visual (BARRAMENTO ou PONTO) para uso em diagramas
   */
  async criarComponenteVisual(unidadeId: string, tipo: 'BARRAMENTO' | 'PONTO', nome?: string) {
    // Verificar se unidade existe
    const unidade = await this.prisma.unidades.findFirst({
      where: { id: unidadeId, deleted_at: null }
    });

    if (!unidade) {
      throw new NotFoundException('Unidade não encontrada');
    }

    // Criar equipamento virtual
    const equipamento = await this.prisma.equipamentos.create({
      data: {
        nome: nome || `${tipo} ${Date.now()}`,
        classificacao: 'UAR', // Componentes virtuais são UAR
        unidade_id: unidadeId,
        criticidade: '1', // Criticidade mínima (não representa equipamento real)
        tipo_equipamento: tipo, // BARRAMENTO ou PONTO
        localizacao: 'VIRTUAL', // Marca como componente virtual
      },
      select: {
        id: true,
        nome: true,
        tipo_equipamento: true,
        unidade_id: true,
      }
    });

    // IMPORTANTE: Fazer trim de todos os campos porque o banco pode ter CHAR() em vez de VARCHAR()
    return {
      id: equipamento.id?.trim(),
      nome: equipamento.nome?.trim(),
      tipo_equipamento: equipamento.tipo_equipamento?.trim(),
      unidade_id: equipamento.unidade_id?.trim(),
    };
  }

  /**
   * Configura ou atualiza o tópico MQTT de um equipamento
   */
  async configurarMqtt(id: string, dto: ConfigurarMqttDto) {
    // Verificar se o equipamento existe
    const equipamentoAtual = await this.prisma.equipamentos.findFirst({
      where: { id, deleted_at: null },
    });

    if (!equipamentoAtual) {
      throw new NotFoundException('Equipamento não encontrado');
    }

    // ⚠️ Verificar se MqttService está disponível
    if (!this.mqttService) {
      throw new BadRequestException('Serviço MQTT não está disponível. O módulo MQTT está desabilitado.');
    }

    // Se estava habilitado e mudou o tópico, desinscrever do antigo
    if (equipamentoAtual.mqtt_habilitado && equipamentoAtual.topico_mqtt) {
      this.mqttService.removerTopico(id, equipamentoAtual.topico_mqtt);
    }

    // Atualizar no banco
    const equipamento = await this.prisma.equipamentos.update({
      where: { id },
      data: {
        topico_mqtt: dto.topico_mqtt,
        mqtt_habilitado: dto.mqtt_habilitado,
      },
    });

    // Se habilitou, subscrever ao novo tópico
    if (dto.mqtt_habilitado && dto.topico_mqtt) {
      this.mqttService.adicionarTopico(id, dto.topico_mqtt);
    }

    return {
      id: equipamento.id,
      nome: equipamento.nome,
      topico_mqtt: equipamento.topico_mqtt,
      mqtt_habilitado: equipamento.mqtt_habilitado,
      updatedAt: equipamento.updated_at,
    };
  }
}