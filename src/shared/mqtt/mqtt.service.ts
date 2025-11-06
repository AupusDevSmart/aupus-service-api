import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as mqtt from 'mqtt';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter } from 'events';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Interface para o buffer de dados
interface BufferData {
  equipamentoId: string;
  leituras: Array<{
    timestamp: Date;
    dados: any;
  }>;
  timestamp_inicio: Date;
}

@Injectable()
export class MqttService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private client: mqtt.MqttClient;
  private subscriptions: Map<string, string[]> = new Map(); // topic -> [equipamentoIds]
  private ajv: Ajv;

  // Buffer para agregação de 1 minuto
  private buffers: Map<string, BufferData> = new Map();
  private bufferInterval = 60000; // 1 minuto em ms
  private flushTimer: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {
    super();
    // Inicializar Ajv com formatos adicionais
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
  }

  async onModuleInit() {
    await this.connect();

    // Iniciar processo de flush periódico (1 minuto)
    this.flushTimer = setInterval(() => {
      this.flushAllBuffers();
    }, this.bufferInterval);

    console.log('📊 Sistema de agregação de dados (1 minuto) inicializado');
  }

  onModuleDestroy() {
    // Limpar timer de flush
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Fazer flush final antes de desconectar
    this.flushAllBuffers();

    this.disconnect();
  }

  private async connect() {
    // Construir URL do broker a partir de HOST e PORT
    const mqttHost = process.env.MQTT_HOST || 'localhost';
    const mqttPort = process.env.MQTT_PORT || '1883';
    const mqttUrl = `mqtt://${mqttHost}:${mqttPort}`;

    const options: mqtt.IClientOptions = {
      clientId: `aupus-${Math.random().toString(16).substr(2, 8)}`,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      clean: true,
      reconnectPeriod: 5000,
    };

    console.log(`🔌 Conectando ao MQTT broker: ${mqttUrl}`);
    this.client = mqtt.connect(mqttUrl, options);

    this.client.on('connect', () => {
      console.log('✅ MQTT conectado');
      this.carregarTopicosEquipamentos();
    });

    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload);
    });

    this.client.on('error', (error) => {
      console.error('❌ Erro MQTT:', error);
    });

    this.client.on('reconnect', () => {
      console.log('🔄 Reconectando ao MQTT...');
    });
  }

  /**
   * Carrega todos os tópicos cadastrados e subscreve
   */
  private async carregarTopicosEquipamentos() {
    const equipamentos = await this.prisma.equipamentos.findMany({
      where: {
        mqtt_habilitado: true,
        topico_mqtt: { not: null },
        deleted_at: null,
      },
      select: {
        id: true,
        topico_mqtt: true,
      },
    });

    console.log(`📡 Carregando ${equipamentos.length} tópicos MQTT...`);

    for (const equip of equipamentos) {
      this.subscribeTopic(equip.topico_mqtt!, equip.id);
    }
  }

  /**
   * Subscreve a um tópico MQTT
   */
  private subscribeTopic(topic: string, equipamentoId: string) {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, []);
      this.client.subscribe(topic, (err) => {
        if (err) {
          console.error(`❌ Erro ao subscrever tópico ${topic}:`, err);
        } else {
          console.log(`✅ Subscrito ao tópico: ${topic}`);
        }
      });
    }

    const equipamentos = this.subscriptions.get(topic)!;
    if (!equipamentos.includes(equipamentoId)) {
      equipamentos.push(equipamentoId);
    }
  }

  /**
   * Remove subscrição de um tópico
   */
  public unsubscribeTopic(topic: string, equipamentoId: string) {
    if (!this.subscriptions.has(topic)) return;

    const equipamentos = this.subscriptions.get(topic)!;
    const index = equipamentos.indexOf(equipamentoId);

    if (index > -1) {
      equipamentos.splice(index, 1);
    }

    // Se não há mais equipamentos neste tópico, desinscreve
    if (equipamentos.length === 0) {
      this.client.unsubscribe(topic);
      this.subscriptions.delete(topic);
      console.log(`🔕 Desinscrito do tópico: ${topic}`);
    }
  }

  /**
   * Processa mensagem recebida
   */
  private async handleMessage(topic: string, payload: Buffer) {
    try {
      // LOG: Mensagem recebida
      console.log('📨 [MQTT] Mensagem recebida no tópico:', topic);
      console.log('📨 [MQTT] Payload (primeiros 200 chars):', payload.toString().substring(0, 200));

      // Parse do payload JSON
      const dados = JSON.parse(payload.toString());
      console.log('📨 [MQTT] Timestamp nos dados:', dados.timestamp, '| Status:', dados.status?.work_state_text || 'N/A');

      // Obter equipamentos que escutam este tópico
      const equipamentoIds = this.subscriptions.get(topic);
      console.log('📨 [MQTT] Equipamentos inscritos:', equipamentoIds?.length || 0);

      if (!equipamentoIds || equipamentoIds.length === 0) {
        console.log('⚠️ [MQTT] Nenhum equipamento inscrito neste tópico');
        return;
      }

      // Processar para cada equipamento
      for (const equipamentoId of equipamentoIds) {
        await this.processarDadosEquipamento(equipamentoId, dados, topic);
      }
    } catch (error) {
      console.error(`❌ Erro ao processar mensagem do tópico ${topic}:`, error);
    }
  }

  /**
   * Valida dados contra JSON Schema
   */
  private validarDadosContraSchema(dados: any, schema: any): { valido: boolean; erros?: string[] } {
    if (!schema) {
      // Se não há schema, considera válido
      return { valido: true };
    }

    try {
      const validate = this.ajv.compile(schema);
      const valido = validate(dados);

      if (!valido) {
        const erros = validate.errors?.map((err) => {
          return `${err.instancePath || '/'} ${err.message}`;
        }) || [];

        return {
          valido: false,
          erros,
        };
      }

      return { valido: true };
    } catch (error) {
      // Schema inválido ou incompatível - silenciar erro pois não bloqueia operação
      // O schema armazenado no banco usa formato customizado, não JSON Schema padrão
      // Em caso de erro no schema, considera válido para não bloquear
      return { valido: true };
    }
  }

  /**
   * Processa e salva dados de um equipamento
   */
  private async processarDadosEquipamento(
    equipamentoId: string,
    dados: any,
    topic: string,
  ) {
    try {
      // Buscar equipamento com tipo
      const equipamento = await this.prisma.equipamentos.findUnique({
        where: { id: equipamentoId },
        include: {
          tipo_equipamento_rel: {
            select: {
              id: true,
              codigo: true,
              nome: true,
              propriedades_schema: true,
            },
          },
        },
      });

      if (!equipamento) {
        console.warn(`⚠️ Equipamento ${equipamentoId} não encontrado`);
        return;
      }

      // Validar dados contra o schema do tipo
      let qualidade = dados.qualidade || 'GOOD';
      const schema = equipamento.tipo_equipamento_rel?.propriedades_schema;

      if (schema) {
        const validacao = this.validarDadosContraSchema(dados, schema);

        if (!validacao.valido) {
          console.warn(
            `⚠️ Dados inválidos para equipamento ${equipamento.nome} (${equipamento.tipo_equipamento_rel?.nome}):`,
            validacao.erros,
          );
          qualidade = 'BAD';
          // Adicionar erros aos dados
          dados._validation_errors = validacao.erros;
        }
      }

      // Salvar dados no banco
      // Converter timestamp de segundos para milissegundos se necessário
      let timestampDados: Date;
      if (dados.timestamp) {
        // Se o timestamp é menor que 10 bilhões, provavelmente está em segundos
        const timestamp = typeof dados.timestamp === 'number' ? dados.timestamp : parseInt(dados.timestamp);
        if (timestamp < 10000000000) {
          // Timestamp em segundos - converter para milissegundos
          timestampDados = new Date(timestamp * 1000);
        } else {
          // Timestamp já em milissegundos
          timestampDados = new Date(timestamp);
        }
      } else {
        timestampDados = new Date();
      }

      // Adicionar ao buffer ao invés de salvar imediatamente
      this.addToBuffer(equipamentoId, timestampDados, dados, qualidade);

      // Emitir evento para WebSocket (com dados em tempo real)
      this.emit('equipamento_dados', {
        equipamentoId,
        diagramaId: equipamento.diagrama_id,
        dados: {
          id: `temp_${Date.now()}`,
          equipamento_id: equipamentoId,
          dados: dados as any,
          timestamp_dados: timestampDados,
          qualidade,
        },
      });
    } catch (error) {
      console.error(
        `❌ Erro ao processar dados do equipamento ${equipamentoId}:`,
        error,
      );
    }
  }

  /**
   * Adiciona novo tópico dinamicamente
   */
  public adicionarTopico(equipamentoId: string, topic: string) {
    this.subscribeTopic(topic, equipamentoId);
  }

  /**
   * Remove tópico dinamicamente
   */
  public removerTopico(equipamentoId: string, topic: string) {
    this.unsubscribeTopic(topic, equipamentoId);
  }

  /**
   * Desconecta do MQTT
   */
  public disconnect() {
    if (this.client) {
      this.client.end();
      console.log('🔌 MQTT desconectado');
    }
  }

  /**
   * Adiciona dados ao buffer de agregação
   */
  private addToBuffer(
    equipamentoId: string,
    timestamp: Date,
    dados: any,
    qualidade: string,
  ) {
    let buffer = this.buffers.get(equipamentoId);

    if (!buffer) {
      buffer = {
        equipamentoId,
        leituras: [],
        timestamp_inicio: new Date(),
      };
      this.buffers.set(equipamentoId, buffer);
      console.log(`📊 [Buffer] Criado buffer para equipamento ${equipamentoId}`);
    }

    buffer.leituras.push({
      timestamp,
      dados: { ...dados, _qualidade: qualidade },
    });
  }

  /**
   * Flush de todos os buffers
   */
  private async flushAllBuffers() {
    const equipamentoIds = Array.from(this.buffers.keys());

    if (equipamentoIds.length === 0) {
      return;
    }

    console.log(`🔄 [Buffer] Flush de ${equipamentoIds.length} buffers...`);

    for (const equipamentoId of equipamentoIds) {
      const buffer = this.buffers.get(equipamentoId);
      if (buffer) {
        await this.flushBuffer(equipamentoId, buffer);
      }
    }
  }

  /**
   * Flush de um buffer específico
   */
  private async flushBuffer(equipamentoId: string, buffer: BufferData) {
    if (buffer.leituras.length === 0) {
      return;
    }

    try {
      const timestamp_fim = new Date();
      const leituras = buffer.leituras;

      // Calcular agregações para inversores
      const dadosAgregados = this.calcularAgregacoes(leituras);

      // Determinar qualidade geral do período
      const qualidades = leituras.map((l) => l.dados._qualidade);
      const numGood = qualidades.filter((q) => q === 'GOOD').length;
      const qualidadeGeral =
        numGood > leituras.length / 2 ? 'bom' : numGood > 0 ? 'parcial' : 'ruim';

      // Salvar dados agregados
      await this.prisma.equipamentos_dados.create({
        data: {
          equipamento_id: equipamentoId,
          dados: dadosAgregados as any,
          fonte: 'MQTT',
          timestamp_dados: buffer.timestamp_inicio,
          timestamp_fim,
          num_leituras: leituras.length,
          qualidade: qualidadeGeral,
        },
      });

      console.log(
        `✅ [Buffer] Flush ${equipamentoId}: ${leituras.length} leituras agregadas (${qualidadeGeral})`,
      );

      // Log de informações para inversores (estrutura aninhada)
      if (dadosAgregados.power?.active_total !== undefined) {
        console.log(
          `   📊 Potência Ativa: ${dadosAgregados.power.active_total} W (${(dadosAgregados.power.active_total / 1000).toFixed(2)} kW)`,
        );
        if (dadosAgregados.energy?.period_energy_kwh) {
          console.log(`   ⚡ Energia no período: ${dadosAgregados.energy.period_energy_kwh} kWh`);
        }
      } else if (dadosAgregados.power_avg !== undefined) {
        // Log para estrutura legada
        console.log(
          `   📊 Potência: min=${dadosAgregados.power_min?.toFixed(2)} avg=${dadosAgregados.power_avg?.toFixed(2)} max=${dadosAgregados.power_max?.toFixed(2)} kW`,
        );
        console.log(`   ⚡ Energia: ${dadosAgregados.energia_kwh?.toFixed(4)} kWh`);
      }

      // Limpar buffer
      buffer.leituras = [];
      buffer.timestamp_inicio = new Date();
    } catch (error) {
      console.error(`❌ [Buffer] Erro ao fazer flush do buffer ${equipamentoId}:`, error);
    }
  }

  /**
   * Calcula agregações dos dados (média, min, max, etc)
   * Preserva a estrutura aninhada dos dados do inversor
   */
  private calcularAgregacoes(
    leituras: Array<{ timestamp: Date; dados: any }>,
  ): any {
    if (leituras.length === 0) {
      return {};
    }

    const ultimaLeitura = leituras[leituras.length - 1].dados;
    const primeiraLeitura = leituras[0];

    // Estrutura base: timestamp e status da última leitura
    const agregado: any = {
      timestamp: ultimaLeitura.timestamp,
    };

    // Copiar status da última leitura
    if (ultimaLeitura.status) {
      agregado.status = ultimaLeitura.status;
    }

    // Copiar info se existir
    if (ultimaLeitura.info) {
      agregado.info = ultimaLeitura.info;
    }

    // Verificar se é estrutura de inversor (tem power como objeto)
    const isInversorData = ultimaLeitura.power && typeof ultimaLeitura.power === 'object';

    if (isInversorData) {
      // ESTRUTURA DE INVERSOR - preservar nested objects

      // ========== POWER ==========
      if (ultimaLeitura.power) {
        agregado.power = {};

        // active_total
        const activeTotals = leituras.map(l => l.dados.power?.active_total).filter(v => v != null);
        if (activeTotals.length > 0) {
          agregado.power.active_total = Math.round(this.mean(activeTotals));
        }

        // reactive_total
        const reactiveTotals = leituras.map(l => l.dados.power?.reactive_total).filter(v => v != null);
        if (reactiveTotals.length > 0) {
          agregado.power.reactive_total = Math.round(this.mean(reactiveTotals));
        }

        // apparent_total
        const apparentTotals = leituras.map(l => l.dados.power?.apparent_total).filter(v => v != null);
        if (apparentTotals.length > 0) {
          agregado.power.apparent_total = Math.round(this.mean(apparentTotals));
        }

        // power_factor
        const powerFactors = leituras.map(l => l.dados.power?.power_factor).filter(v => v != null);
        if (powerFactors.length > 0) {
          agregado.power.power_factor = parseFloat(this.mean(powerFactors).toFixed(3));
        }

        // frequency
        const frequencies = leituras.map(l => l.dados.power?.frequency).filter(v => v != null);
        if (frequencies.length > 0) {
          agregado.power.frequency = parseFloat(this.mean(frequencies).toFixed(2));
        }
      }

      // ========== VOLTAGE ==========
      if (ultimaLeitura.voltage) {
        agregado.voltage = {};

        // phase_a-b
        const voltageAB = leituras.map(l => l.dados.voltage?.['phase_a-b']).filter(v => v != null);
        if (voltageAB.length > 0) {
          agregado.voltage['phase_a-b'] = parseFloat(this.mean(voltageAB).toFixed(1));
        }

        // phase_b-c
        const voltageBC = leituras.map(l => l.dados.voltage?.['phase_b-c']).filter(v => v != null);
        if (voltageBC.length > 0) {
          agregado.voltage['phase_b-c'] = parseFloat(this.mean(voltageBC).toFixed(1));
        }

        // phase_c-a
        const voltageCA = leituras.map(l => l.dados.voltage?.['phase_c-a']).filter(v => v != null);
        if (voltageCA.length > 0) {
          agregado.voltage['phase_c-a'] = parseFloat(this.mean(voltageCA).toFixed(1));
        }
      }

      // ========== CURRENT ==========
      if (ultimaLeitura.current) {
        agregado.current = {};

        // phase_a
        const currentA = leituras.map(l => l.dados.current?.phase_a).filter(v => v != null);
        if (currentA.length > 0) {
          agregado.current.phase_a = parseFloat(this.mean(currentA).toFixed(1));
        }

        // phase_b
        const currentB = leituras.map(l => l.dados.current?.phase_b).filter(v => v != null);
        if (currentB.length > 0) {
          agregado.current.phase_b = parseFloat(this.mean(currentB).toFixed(1));
        }

        // phase_c
        const currentC = leituras.map(l => l.dados.current?.phase_c).filter(v => v != null);
        if (currentC.length > 0) {
          agregado.current.phase_c = parseFloat(this.mean(currentC).toFixed(1));
        }
      }

      // ========== TEMPERATURE ==========
      if (ultimaLeitura.temperature) {
        agregado.temperature = {};

        const internalTemps = leituras.map(l => l.dados.temperature?.internal).filter(v => v != null);
        if (internalTemps.length > 0) {
          agregado.temperature.internal = parseFloat(this.mean(internalTemps).toFixed(1));
        }
      }

      // ========== DC (MPPT e Strings) ==========
      if (ultimaLeitura.dc) {
        agregado.dc = {};

        // total_power
        const dcTotalPowers = leituras.map(l => l.dados.dc?.total_power).filter(v => v != null);
        if (dcTotalPowers.length > 0) {
          agregado.dc.total_power = Math.round(this.mean(dcTotalPowers));
        }

        // MPPTs (mppt1_voltage, mppt2_voltage, etc.)
        const mpptKeys = Object.keys(ultimaLeitura.dc).filter(k => k.startsWith('mppt') && k.endsWith('_voltage'));
        for (const key of mpptKeys) {
          const values = leituras.map(l => l.dados.dc?.[key]).filter(v => v != null);
          if (values.length > 0) {
            agregado.dc[key] = parseFloat(this.mean(values).toFixed(1));
          }
        }

        // Strings (string1_current, string2_current, etc.)
        const stringKeys = Object.keys(ultimaLeitura.dc).filter(k => k.startsWith('string') && k.endsWith('_current'));
        for (const key of stringKeys) {
          const values = leituras.map(l => l.dados.dc?.[key]).filter(v => v != null);
          if (values.length > 0) {
            agregado.dc[key] = parseFloat(this.mean(values).toFixed(2));
          }
        }
      }

      // ========== ENERGY ==========
      if (ultimaLeitura.energy) {
        agregado.energy = {};

        // Para energia, usar valores da última leitura (são cumulativos)
        if (ultimaLeitura.energy.daily_yield != null) {
          agregado.energy.daily_yield = parseFloat(ultimaLeitura.energy.daily_yield.toFixed(2));
        }
        if (ultimaLeitura.energy.total_yield != null) {
          agregado.energy.total_yield = parseFloat(ultimaLeitura.energy.total_yield.toFixed(2));
        }
        if (ultimaLeitura.energy.total_running_time != null) {
          agregado.energy.total_running_time = ultimaLeitura.energy.total_running_time;
        }
        if (ultimaLeitura.energy.daily_running_time != null) {
          agregado.energy.daily_running_time = ultimaLeitura.energy.daily_running_time;
        }

        // Calcular energia gerada no período (kWh)
        if (agregado.power?.active_total) {
          const intervalo_horas =
            (leituras[leituras.length - 1].timestamp.getTime() - primeiraLeitura.timestamp.getTime()) / (1000 * 3600);
          agregado.energy.period_energy_kwh = parseFloat(((agregado.power.active_total / 1000) * intervalo_horas).toFixed(4));
        }
      }

      // ========== PROTECTION ==========
      if (ultimaLeitura.protection) {
        agregado.protection = {};

        const insulationResistances = leituras.map(l => l.dados.protection?.insulation_resistance).filter(v => v != null);
        if (insulationResistances.length > 0) {
          agregado.protection.insulation_resistance = parseFloat(this.mean(insulationResistances).toFixed(1));
        }

        const busVoltages = leituras.map(l => l.dados.protection?.bus_voltage).filter(v => v != null);
        if (busVoltages.length > 0) {
          agregado.protection.bus_voltage = parseFloat(this.mean(busVoltages).toFixed(1));
        }
      }

      // ========== PID ==========
      if (ultimaLeitura.pid) {
        // PID é status, manter último valor
        agregado.pid = ultimaLeitura.pid;
      }

    } else {
      // ESTRUTURA SIMPLES/LEGADA - dados não aninhados
      // Manter comportamento para equipamentos que não são inversores

      const potencias = leituras.map((l) => l.dados.power).filter((p) => p != null && p > 0);
      const tensoes = leituras.map((l) => l.dados.voltage || l.dados.v1).filter((v) => v != null);
      const correntes = leituras.map((l) => l.dados.current || l.dados.i1).filter((c) => c != null);
      const temperaturas = leituras.map((l) => l.dados.temperature || l.dados.temp).filter((t) => t != null);

      if (potencias.length > 0) {
        agregado.power_avg = this.mean(potencias);
        agregado.power_min = Math.min(...potencias);
        agregado.power_max = Math.max(...potencias);

        const intervalo_horas =
          (leituras[leituras.length - 1].timestamp.getTime() - primeiraLeitura.timestamp.getTime()) / (1000 * 3600);
        agregado.energia_kwh = agregado.power_avg * intervalo_horas;
      }

      if (tensoes.length > 0) {
        agregado.voltage_avg = this.mean(tensoes);
        agregado.voltage_min = Math.min(...tensoes);
        agregado.voltage_max = Math.max(...tensoes);
      }

      if (correntes.length > 0) {
        agregado.current_avg = this.mean(correntes);
        agregado.current_min = Math.min(...correntes);
        agregado.current_max = Math.max(...correntes);
      }

      if (temperaturas.length > 0) {
        agregado.temperature_avg = this.mean(temperaturas);
        agregado.temperature_min = Math.min(...temperaturas);
        agregado.temperature_max = Math.max(...temperaturas);
      }
    }

    return agregado;
  }

  /**
   * Calcula média de um array
   */
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Calcula desvio padrão
   */
  private standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.mean(values);
    const squareDiffs = values.map((val) => Math.pow(val - avg, 2));
    const avgSquareDiff = this.mean(squareDiffs);
    return Math.sqrt(avgSquareDiff);
  }
}
