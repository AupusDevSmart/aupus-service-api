import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface DashboardData {
  timestamp: Date;
  resumoGeral: {
    totalGeracao: number;
    totalConsumo: number;
    balancoRede: number;
    totalUnidades: number;
    unidadesOnline: number;
    alertasAtivos: number;
    totalGeradores: number;
    totalCargas: number;
  };
  plantas: PlantaResumo[];
  alertas: Alerta[];
}

export interface PlantaResumo {
  id: string;
  nome: string;
  cliente: string;
  unidades: UnidadeResumo[];
  totais: {
    geracao: number;
    consumo: number;
    unidadesAtivas: number;
  };
}

export interface UnidadeResumo {
  id: string;
  nome: string;
  tipo: string;
  status: 'ONLINE' | 'OFFLINE' | 'ALERTA';
  ultimaLeitura: Date | null;
  coordenadas?: {
    latitude: number;
    longitude: number;
  };
  cidade?: string;
  estado?: string;
  metricas: {
    potenciaAtual: number;
    energiaHoje: number;
    fatorPotencia: number;
  };
}

export interface Alerta {
  id: string;
  tipo: string;
  severidade: 'info' | 'warning' | 'critical';
  mensagem: string;
  unidadeId: string;
  unidadeNome: string;
  timestamp: Date;
}

@Injectable()
export class CoaService {
  private readonly logger = new Logger(CoaService.name);
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL = 30000; // 30 segundos
  private readonly TEMPO_OFFLINE = 10 * 60 * 1000; // 10 minutos

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna dados agregados para o dashboard COA
   * Com cache de 30 segundos para otimização
   */
  async getDashboardData(clienteId?: string): Promise<DashboardData> {
    this.logger.log(`[COA] getDashboardData chamado - clienteId: ${clienteId || 'none'}`);
    const cacheKey = `dashboard-${clienteId || 'all'}`;
    const cached = this.cache.get(cacheKey);

    // Retorna cache se ainda válido
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      this.logger.log(`[COA] Retornando dados do cache para ${cacheKey}`);
      return cached.data;
    }

    this.logger.log(`[COA] Buscando dados frescos para ${cacheKey}`);

    try {
      // Buscar dados agregados
      const data = await this.fetchDashboardData(clienteId);

      // Atualizar cache
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      // Limpar cache antigo periodicamente
      this.cleanupCache();

      return data;
    } catch (error) {
      this.logger.error('Erro ao buscar dados do dashboard:', error);

      // Se houver erro, retorna cache mesmo vencido
      if (cached) {
        this.logger.warn('Retornando cache vencido devido a erro');
        return cached.data;
      }

      throw error;
    }
  }

  /**
   * Busca dados do banco de forma otimizada
   */
  private async fetchDashboardData(clienteId?: string): Promise<DashboardData> {
    // 1. Buscar estrutura de plantas e unidades
    // Nota: plantas não têm cliente_id direto, têm proprietario_id (usuário)
    const plantas = await this.prisma.plantas.findMany({
      where: {
        deleted_at: null,
        ...(clienteId && { proprietario_id: clienteId }),
      },
      select: {
        id: true,
        nome: true,
        proprietario: {
          select: {
            nome: true,
          },
        },
      },
    });

    // 2. Buscar unidades com suas plantas
    const unidades = await this.prisma.unidades.findMany({
      where: {
        deleted_at: null,
        planta_id: {
          in: plantas.map(p => p.id),
        },
      },
      select: {
        id: true,
        nome: true,
        tipo: true,
        latitude: true,
        longitude: true,
        cidade: true,
        estado: true,
        planta_id: true,
        equipamentos: {
          where: { deleted_at: null },
          select: {
            id: true,
            nome: true,
          },
        },
      },
    });

    // 3. Buscar últimas leituras de todos os equipamentos (query otimizada)
    const horaAtras = new Date(Date.now() - 60 * 60 * 1000); // 1 hora atrás

    const ultimasLeituras = await this.prisma.$queryRaw<any[]>`
      WITH UltimasLeituras AS (
        SELECT DISTINCT ON (ed.equipamento_id)
          ed.equipamento_id,
          ed.dados,
          ed.potencia_ativa_kw,
          ed.energia_kwh,
          ed.timestamp_dados,
          ed.qualidade,
          e.unidade_id,
          e.tipo_equipamento
        FROM equipamentos_dados ed
        INNER JOIN equipamentos e ON e.id = ed.equipamento_id
        WHERE ed.timestamp_dados >= ${horaAtras}
          AND e.deleted_at IS NULL
        ORDER BY ed.equipamento_id, ed.timestamp_dados DESC
      )
      SELECT * FROM UltimasLeituras
    `;

    // 4. Criar mapa de leituras por unidade
    const leiturasPorUnidade = new Map<string, any[]>();
    for (const leitura of ultimasLeituras) {
      if (!leiturasPorUnidade.has(leitura.unidade_id)) {
        leiturasPorUnidade.set(leitura.unidade_id, []);
      }
      leiturasPorUnidade.get(leitura.unidade_id)!.push(leitura);
    }

    // 5. Processar dados das plantas e unidades
    const plantasProcessadas: PlantaResumo[] = [];
    const alertas: Alerta[] = [];
    let totalGeracao = 0;
    let totalConsumo = 0;
    let unidadesOnline = 0;
    let totalUnidades = 0;
    let totalGeradores = 0;
    let totalCargas = 0;
    const equipamentosContados = new Set<string>(); // Para evitar contar o mesmo equipamento duas vezes

    // Agrupar unidades por planta
    const unidadesPorPlanta = new Map<string, typeof unidades>();
    for (const unidade of unidades) {
      if (!unidadesPorPlanta.has(unidade.planta_id)) {
        unidadesPorPlanta.set(unidade.planta_id, []);
      }
      unidadesPorPlanta.get(unidade.planta_id)!.push(unidade);
    }

    for (const planta of plantas) {
      const unidadesPlanta = unidadesPorPlanta.get(planta.id) || [];
      const unidadesProcessadas: UnidadeResumo[] = [];
      let geracaoPlanta = 0;
      let consumoPlanta = 0;
      let unidadesAtivasPlanta = 0;

      for (const unidade of unidadesPlanta) {
        totalUnidades++;

        const leiturasUnidade = leiturasPorUnidade.get(unidade.id) || [];

        // Calcular métricas da unidade
        let potenciaTotal = 0;
        let energiaTotal = 0;
        let fatorPotencia = 0;
        let ultimaLeitura: Date | null = null;
        let status: 'ONLINE' | 'OFFLINE' | 'ALERTA' = 'OFFLINE';
        let unidadeJaContada = false; // Flag para garantir que contamos a unidade apenas uma vez

        for (const leitura of leiturasUnidade) {
          // Extrair potência - tentar coluna primeiro, depois JSON
          let potencia = Number(leitura.potencia_ativa_kw) || 0;

          // Se potência não estiver na coluna, extrair do JSON (inversores)
          if (potencia === 0 && leitura.dados) {
            try {
              const dados = leitura.dados as any;
              // Formato inversores: power.active_total (em W, converter para kW)
              if (dados?.power?.active_total) {
                potencia = Number(dados.power.active_total) / 1000;
              }
              // Formato M-160: Dados.Pa + Dados.Pb + Dados.Pc (em W, converter para kW)
              else if (dados?.Dados) {
                const Pa = Number(dados.Dados.Pa) || 0;
                const Pb = Number(dados.Dados.Pb) || 0;
                const Pc = Number(dados.Dados.Pc) || 0;
                potencia = (Pa + Pb + Pc) / 1000;
              }
            } catch (e) {
              // Ignorar erro de parsing
            }
          }

          // Extrair energia - tentar coluna primeiro, depois JSON
          let energia = Number(leitura.energia_kwh) || 0;

          // Se energia não estiver na coluna, extrair do JSON (inversores)
          if (energia === 0 && leitura.dados) {
            try {
              const dados = leitura.dados as any;
              // Formato inversores: energy.daily_yield (já em kWh)
              if (dados?.energy?.daily_yield) {
                energia = Number(dados.energy.daily_yield);
              }
            } catch (e) {
              // Ignorar erro de parsing
            }
          }

          potenciaTotal += potencia;
          energiaTotal += energia;

          // Determinar status baseado no timestamp
          const tempoDesdeUltimaLeitura = Date.now() - new Date(leitura.timestamp_dados).getTime();

          if (tempoDesdeUltimaLeitura < this.TEMPO_OFFLINE) {
            if (!ultimaLeitura || leitura.timestamp_dados > ultimaLeitura) {
              ultimaLeitura = leitura.timestamp_dados;
            }

            if (tempoDesdeUltimaLeitura < 5 * 60 * 1000) { // 5 minutos
              status = 'ONLINE';
              // Contar a unidade apenas uma vez, mesmo que tenha múltiplos equipamentos online
              if (!unidadeJaContada) {
                unidadesOnline++;
                unidadesAtivasPlanta++;
                unidadeJaContada = true;
              }
            } else if (leitura.qualidade === 'SUSPEITO') {
              status = 'ALERTA';

              // Criar alerta
              alertas.push({
                id: `${unidade.id}-quality`,
                tipo: 'QUALIDADE_DADOS',
                severidade: 'warning',
                mensagem: `Qualidade dos dados suspeita na unidade ${unidade.nome}`,
                unidadeId: unidade.id,
                unidadeNome: unidade.nome,
                timestamp: new Date(),
              });
            }
          }

          // Extrair fator de potência do JSON se disponível
          try {
            const dados = leitura.dados as any;
            if (dados?.Dados?.fp) {
              fatorPotencia = Number(dados.Dados.fp);
            }
          } catch (e) {
            // Ignorar erro de parsing
          }

          // Classificar geração vs consumo baseado no tipo do equipamento
          // Reconhecer inversores por múltiplos critérios:
          // 1. tipo_equipamento contém 'INVERSOR'
          // 2. Presença de dados de inversor no JSON (power.active_total, energy.daily_yield)
          const tipoEquip = (leitura.tipo_equipamento || '').toUpperCase();
          const isInversor = tipoEquip.includes('INVERSOR') ||
                            (leitura.dados?.power?.active_total !== undefined &&
                             leitura.dados?.energy?.daily_yield !== undefined);

          if (isInversor) {
            geracaoPlanta += potencia;
            totalGeracao += potencia;
            // Contar gerador apenas uma vez por equipamento
            if (!equipamentosContados.has(leitura.equipamento_id)) {
              totalGeradores++;
              equipamentosContados.add(leitura.equipamento_id);
            }
          } else {
            consumoPlanta += potencia;
            totalConsumo += potencia;
            // Contar carga apenas uma vez por equipamento
            if (!equipamentosContados.has(leitura.equipamento_id)) {
              totalCargas++;
              equipamentosContados.add(leitura.equipamento_id);
            }
          }
        }

        unidadesProcessadas.push({
          id: unidade.id,
          nome: unidade.nome,
          tipo: unidade.tipo,
          status,
          ultimaLeitura,
          coordenadas: unidade.latitude && unidade.longitude ? {
            latitude: Number(unidade.latitude),
            longitude: Number(unidade.longitude),
          } : undefined,
          cidade: unidade.cidade || undefined,
          estado: unidade.estado || undefined,
          metricas: {
            potenciaAtual: Math.round(potenciaTotal * 100) / 100,
            energiaHoje: Math.round(energiaTotal * 100) / 100,
            fatorPotencia: Math.round(fatorPotencia * 100) / 100,
          },
        });

        // Verificar alertas de fator de potência
        if (fatorPotencia > 0 && fatorPotencia < 0.92) {
          alertas.push({
            id: `${unidade.id}-fp`,
            tipo: 'FATOR_POTENCIA_BAIXO',
            severidade: 'info',
            mensagem: `Fator de potência baixo: ${fatorPotencia.toFixed(2)}`,
            unidadeId: unidade.id,
            unidadeNome: unidade.nome,
            timestamp: new Date(),
          });
        }
      }

      plantasProcessadas.push({
        id: planta.id,
        nome: planta.nome,
        cliente: planta.proprietario.nome,
        unidades: unidadesProcessadas,
        totais: {
          geracao: Math.round(geracaoPlanta * 100) / 100,
          consumo: Math.round(consumoPlanta * 100) / 100,
          unidadesAtivas: unidadesAtivasPlanta,
        },
      });
    }

    // 6. Montar resposta final
    return {
      timestamp: new Date(),
      resumoGeral: {
        totalGeracao: Math.round(totalGeracao * 100) / 100,
        totalConsumo: Math.round(totalConsumo * 100) / 100,
        balancoRede: Math.round((totalConsumo - totalGeracao) * 100) / 100,
        totalUnidades,
        unidadesOnline,
        alertasAtivos: alertas.length,
        totalGeradores,
        totalCargas,
      },
      plantas: plantasProcessadas,
      alertas: alertas.slice(0, 10), // Limitar a 10 alertas mais recentes
    };
  }

  /**
   * Limpa entradas antigas do cache
   */
  private cleanupCache(): void {
    const now = Date.now();
    const expirationTime = this.CACHE_TTL * 2; // Limpar caches com mais de 60 segundos

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > expirationTime) {
        this.cache.delete(key);
        this.logger.debug(`Cache removido: ${key}`);
      }
    }
  }

  /**
   * Força atualização do cache (útil para testes ou refresh manual)
   */
  async refreshCache(clienteId?: string): Promise<DashboardData> {
    const cacheKey = `dashboard-${clienteId || 'all'}`;
    this.cache.delete(cacheKey);
    return this.getDashboardData(clienteId);
  }
}