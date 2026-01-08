import { Injectable, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import * as mqtt from 'mqtt';
import { PrismaService } from '../prisma/prisma.service';
import { MqttIngestionService } from '../../modules/equipamentos-dados/services/mqtt-ingestion.service';
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

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => MqttIngestionService))
    private readonly mqttIngestionService: MqttIngestionService,
  ) {
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

    // console.log('📊 Sistema de agregação de dados (1 minuto) inicializado');
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
    // ✅ SISTEMA DE 3 MODOS: production, development, disabled
    const mqttMode = process.env.MQTT_MODE || 'production';
    const instanceId = process.env.INSTANCE_ID || 'unknown';

    // Modo DISABLED: Não conectar ao MQTT
    if (mqttMode === 'disabled') {
      console.warn(`⏸️ [MQTT] DESABILITADO para instância: ${instanceId}`);
      console.warn(`⏸️ [MQTT] Dados MQTT NÃO serão processados nesta instância`);
      console.warn(`⏸️ [MQTT] Configure MQTT_MODE=development ou production para habilitar`);
      return;
    }

    // Modo DEVELOPMENT: Conectar mas não salvar no banco
    if (mqttMode === 'development') {
      console.log(`🔧 [MQTT] MODO DESENVOLVIMENTO - Instância: ${instanceId}`);
      console.log(`🔧 [MQTT] Conectará ao MQTT mas NÃO salvará dados no banco`);
      console.log(`🔧 [MQTT] WebSocket e logs funcionarão normalmente`);
    } else {
      // Modo PRODUCTION: Funcionalidade completa
      console.log(`🚀 [MQTT] MODO PRODUÇÃO - Instância: ${instanceId}`);
    }

    // Construir URL do broker a partir de HOST e PORT
    const mqttHost = process.env.MQTT_HOST || 'localhost';
    const mqttPort = process.env.MQTT_PORT || '1883';
    const mqttUrl = `mqtt://${mqttHost}:${mqttPort}`;

    const options: mqtt.IClientOptions = {
      clientId: `aupus-${instanceId}-${Math.random().toString(16).substr(2, 8)}`,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      clean: true,
      reconnectPeriod: 5000,
    };

    console.log(`🔌 [MQTT] Conectando ao broker: ${mqttUrl}`);
    this.client = mqtt.connect(mqttUrl, options);

    this.client.on('connect', () => {
      console.log('✅ [MQTT] Conectado com sucesso!');
      this.carregarTopicosEquipamentos();
    });

    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload);
    });

    this.client.on('error', (error) => {
      console.error('❌ [MQTT] ERRO:', error);
    });

    this.client.on('reconnect', () => {
      console.warn('🔄 [MQTT] Reconectando ao broker...');
    });

    // ✅ NOVO: Eventos adicionais para monitoramento
    this.client.on('offline', () => {
      console.error('🔴 [MQTT] ALERTA CRÍTICO: Broker OFFLINE! Dados não estão sendo recebidos!');
    });

    this.client.on('close', () => {
      console.warn('⚠️ [MQTT] Conexão fechada');
    });

    this.client.on('end', () => {
      console.log('🔌 [MQTT] Cliente MQTT encerrado');
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

    console.log(`📡 [MQTT] Carregando ${equipamentos.length} tópicos MQTT...`);

    for (const equip of equipamentos) {
      this.subscribeTopic(equip.topico_mqtt!, equip.id);
    }

    console.log(`✅ [MQTT] ${equipamentos.length} equipamentos inscritos em ${this.subscriptions.size} tópicos distintos`);
  }

  /**
   * Subscreve a um tópico MQTT
   */
  private subscribeTopic(topic: string, equipamentoId: string) {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, []);
      this.client.subscribe(topic, (err) => {
        if (err) {
          // console.error(`❌ Erro ao subscrever tópico ${topic}:`, err);
        } else {
          // console.log(`✅ Subscrito ao tópico: ${topic}`);
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
      // console.log(`🔕 Desinscrito do tópico: ${topic}`);
    }
  }

  /**
   * Processa mensagem recebida
   */
  private async handleMessage(topic: string, payload: Buffer) {
    try {
      // Parse do payload JSON
      const dados = JSON.parse(payload.toString());

      // Obter equipamentos que escutam este tópico
      const equipamentoIds = this.subscriptions.get(topic);
      // console.log('📨 [MQTT] Equipamentos inscritos:', equipamentoIds?.length || 0);

      if (!equipamentoIds || equipamentoIds.length === 0) {
        // console.log('⚠️ [MQTT] Nenhum equipamento inscrito neste tópico');
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
              mqtt_schema: true, // ✅ CORRIGIDO: usar mqtt_schema em vez de propriedades_schema
            },
          },
        },
      });

      if (!equipamento) {
        // console.warn(`⚠️ Equipamento ${equipamentoId} não encontrado`);
        return;
      }

      // Validar dados contra o schema do tipo
      let qualidade = dados.qualidade || 'GOOD';
      const schema = equipamento.tipo_equipamento_rel?.mqtt_schema; // ✅ CORRIGIDO: usar mqtt_schema

      if (schema) {
        const validacao = this.validarDadosContraSchema(dados, schema);

        if (!validacao.valido) {
          // console.warn(
          //   `⚠️ Dados inválidos para equipamento ${equipamento.nome} (${equipamento.tipo_equipamento_rel?.nome}):`,
          //   validacao.erros,
          // );
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

      // ✅ Se é M-160, processar no novo formato (Resumo)
      const codigo = equipamento.tipo_equipamento_rel?.codigo;
      const isM160 = codigo === 'M-160' || codigo === 'M160' || codigo === 'METER_M160';

      if (isM160) {
        try {
          // Novo formato: JSON com campo Resumo (dados agregados de 30 segundos)
          if (dados.Resumo && typeof dados.Resumo === 'object') {
            await this.salvarDadosM160Resumo(equipamentoId, dados, timestampDados, qualidade);
          } else {
            console.warn(`⚠️ [M-160] Formato JSON desconhecido para equipamento ${equipamentoId}. Esperado campo "Resumo". Chaves recebidas:`, Object.keys(dados));
          }

          // ⚠️ NÃO adicionar M-160 ao buffer para evitar conflito de UNIQUE constraint
          // O processamento já salvou a leitura diretamente no banco
        } catch (error) {
          console.error(`❌ [M-160] Erro ao processar dados:`, error);
          // Em caso de erro, não adicionar ao buffer - apenas logar o erro
          // Não queremos processar dados M160 pelo fluxo de buffer que foi feito para inversores
        }
      } else {
        // Adicionar ao buffer para outros equipamentos (inversores, etc)
        this.addToBuffer(equipamentoId, timestampDados, dados, qualidade);
      }

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
      // console.log('🔌 MQTT desconectado');
    }
  }

  /**
   * Verifica se o MQTT está conectado (para health check)
   */
  public isConnected(): boolean {
    return this.client?.connected || false;
  }

  /**
   * Retorna o número de tópicos subscritos (para health check)
   */
  public getSubscribedTopicsCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Retorna lista de tópicos subscritos (para debug/monitoring)
   */
  public getSubscribedTopics(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Salva dados do M160 no novo formato (Resumo)
   * Novo formato: JSON chega agregado de 30 em 30 segundos
   */
  private async salvarDadosM160Resumo(
    equipamentoId: string,
    dados: any,
    timestamp: Date,
    qualidade: string,
  ) {
    const mqttMode = process.env.MQTT_MODE || 'production';

    try {
      const resumo = dados.Resumo;

      // Extrair timestamp do Resumo (se disponível) ou usar o fornecido
      let timestampDados = timestamp;
      if (resumo.timestamp) {
        if (typeof resumo.timestamp === 'number') {
          // Timestamp numérico (epoch em segundos ou milissegundos)
          const ts = resumo.timestamp;
          if (ts < 10000000000) {
            timestampDados = new Date(ts * 1000);
          } else {
            timestampDados = new Date(ts);
          }
        } else if (typeof resumo.timestamp === 'string') {
          // Timestamp string - pode ser formato brasileiro "DD/MM/YYYY HH:mm:ss"
          const tsString = resumo.timestamp.trim();

          // Tentar formato brasileiro: DD/MM/YYYY HH:mm:ss
          const brazilianDateMatch = tsString.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
          if (brazilianDateMatch) {
            const [_, day, month, year, hour, minute, second] = brazilianDateMatch;
            // Criar data em UTC (ou local, dependendo do contexto)
            timestampDados = new Date(
              parseInt(year),
              parseInt(month) - 1, // JavaScript months are 0-indexed
              parseInt(day),
              parseInt(hour),
              parseInt(minute),
              parseInt(second)
            );
          } else {
            // Tentar parse ISO ou outros formatos
            const ts = parseInt(tsString);
            if (!isNaN(ts)) {
              if (ts < 10000000000) {
                timestampDados = new Date(ts * 1000);
              } else {
                timestampDados = new Date(ts);
              }
            } else {
              // Tentar Date parse direto
              timestampDados = new Date(tsString);
            }
          }
        }
      }

      // Calcular potência média do período (kW)
      // energia_total (kWh) / tempo (horas) = potência (kW)
      // 30 segundos = 30/3600 horas = 0.00833... horas
      const energiaKwh = resumo.energia_total || 0;
      const tempoHoras = 30 / 3600; // 30 segundos em horas
      const potenciaMediaKw = energiaKwh / tempoHoras;

      // Montar objeto de dados processados (compatível com estrutura atual do banco)
      const dadosProcessados = {
        // Timestamp original
        timestamp: dados.timestamp || timestampDados.toISOString(),

        // Dados agregados do Resumo
        Dados: {
          // Tensões médias (V)
          Va: resumo.Va_media || 0,
          Vb: resumo.Vb_media || 0,
          Vc: resumo.Vc_media || 0,

          // Correntes médias (A)
          Ia: resumo.Ia_media || 0,
          Ib: resumo.Ib_media || 0,
          Ic: resumo.Ic_media || 0,

          // Potências médias (W)
          Pa: resumo.Pa_medio || 0,
          Pb: resumo.Pb_medio || 0,
          Pc: resumo.Pc_medio || 0,

          // Fatores de potência médios
          FPA: resumo.FPa_medio || 0,
          FPB: resumo.FPb_medio || 0,
          FPC: resumo.FPc_medio || 0,

          // Frequência média (Hz)
          freq: resumo.freq_media || 0,

          // Energia acumulada (kWh) - valores cumulativos
          phf: resumo.somatorio_phf || 0,

          // Timestamp da leitura
          timestamp: resumo.timestamp,
        },

        // ✅ NOVOS CAMPOS: Potência e energia calculados do Resumo
        potencia_kw: potenciaMediaKw, // Potência média do período (kW)
        energia_kwh: energiaKwh, // Energia consumida no período de 30s (kWh)
        total_leituras: resumo.total_leituras || 1, // Quantidade de leituras agregadas
      };

      // Em modo DEVELOPMENT: Apenas logar, NÃO salvar no banco
      if (mqttMode === 'development') {
        console.log(`📨 [DEV] M-160 Resumo recebido (não salva):`, {
          equipamento: equipamentoId,
          energia: energiaKwh.toFixed(4) + ' kWh',
          potencia: potenciaMediaKw.toFixed(2) + ' kW',
          leituras: resumo.total_leituras || 1,
          timestamp: timestampDados.toISOString()
        });
        return;
      }

      // PRODUÇÃO: Salvar diretamente no banco (sem buffer) - usar upsert para evitar conflito de UNIQUE constraint
      await this.prisma.equipamentos_dados.upsert({
        where: {
          uk_equipamento_timestamp: {
            equipamento_id: equipamentoId,
            timestamp_dados: timestampDados,
          },
        },
        update: {
          dados: dadosProcessados as any,
          fonte: 'MQTT',
          timestamp_fim: timestampDados,
          num_leituras: resumo.total_leituras || 1,
          qualidade: qualidade === 'GOOD' ? 'bom' : 'ruim',
          // ✅ CAMPOS CRÍTICOS PARA CÁLCULO DE CUSTOS
          potencia_ativa_kw: potenciaMediaKw,
          energia_kwh: energiaKwh,
        },
        create: {
          equipamento_id: equipamentoId,
          dados: dadosProcessados as any,
          fonte: 'MQTT',
          timestamp_dados: timestampDados,
          timestamp_fim: timestampDados,
          num_leituras: resumo.total_leituras || 1,
          qualidade: qualidade === 'GOOD' ? 'bom' : 'ruim',
          // ✅ CAMPOS CRÍTICOS PARA CÁLCULO DE CUSTOS
          potencia_ativa_kw: potenciaMediaKw,
          energia_kwh: energiaKwh,
        },
      });

      console.log(
        `✅ [M-160 Resumo] Salvo - Energia: ${energiaKwh.toFixed(4)} kWh | Potência: ${potenciaMediaKw.toFixed(2)} kW | Leituras: ${resumo.total_leituras || 1}`,
      );

      // ✅ NOVO FORMATO: Não precisa processar PHF via MqttIngestionService
      // O novo formato já vem com energia calculada (energia_total) e não tem PHF acumulado
      // O campo somatorio_phf é apenas informativo, não precisa calcular delta

    } catch (error) {
      console.error(`❌ [M-160 Resumo] Erro ao salvar dados:`, error);
      throw error;
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
      // console.log(`📊 [Buffer] Criado buffer para equipamento ${equipamentoId}`);
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

    // console.log(`🔄 [Buffer] Flush de ${equipamentoIds.length} buffers...`);

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

    const mqttMode = process.env.MQTT_MODE || 'production';

    // Copiar leituras antes de tentar salvar
    const leiturasSalvar = [...buffer.leituras];

    try {
      const timestamp_fim = new Date();

      // Calcular agregações para inversores
      const dadosAgregados = this.calcularAgregacoes(leiturasSalvar);

      // Determinar qualidade geral do período
      const qualidades = leiturasSalvar.map((l) => l.dados._qualidade);
      const numGood = qualidades.filter((q) => q === 'GOOD').length;
      const qualidadeGeral =
        numGood > leiturasSalvar.length / 2 ? 'bom' : numGood > 0 ? 'parcial' : 'ruim';

      // Em modo DEVELOPMENT: Apenas logar, NÃO salvar no banco
      if (mqttMode === 'development') {
        console.log(`📨 [DEV] Buffer flush simulado (não salva):`, {
          equipamento: equipamentoId,
          leituras: leiturasSalvar.length,
          qualidade: qualidadeGeral,
          timestamp_inicio: buffer.timestamp_inicio,
          dados_amostra: dadosAgregados.power?.active_total
            ? `${dadosAgregados.power.active_total}W`
            : dadosAgregados.Dados?.Pa
            ? `${dadosAgregados.Dados.Pa}W`
            : 'N/A'
        });

        // Limpar buffer mesmo sem salvar
        buffer.leituras = [];
        buffer.timestamp_inicio = new Date();
        return;
      }

      // PRODUÇÃO: Salvar normalmente no banco
      // ✅ CORREÇÃO CRÍTICA: Usar upsert() em vez de create() para evitar erro P2002
      // quando múltiplas instâncias tentam salvar o mesmo dado
      await this.prisma.equipamentos_dados.upsert({
        where: {
          uk_equipamento_timestamp: {
            equipamento_id: equipamentoId,
            timestamp_dados: buffer.timestamp_inicio,
          },
        },
        update: {
          dados: dadosAgregados as any,
          fonte: 'MQTT',
          timestamp_fim,
          num_leituras: leiturasSalvar.length,
          qualidade: qualidadeGeral,
        },
        create: {
          equipamento_id: equipamentoId,
          dados: dadosAgregados as any,
          fonte: 'MQTT',
          timestamp_dados: buffer.timestamp_inicio,
          timestamp_fim,
          num_leituras: leiturasSalvar.length,
          qualidade: qualidadeGeral,
        },
      });

      // console.log(
      //   `✅ [Buffer] Flush ${equipamentoId}: ${leiturasSalvar.length} leituras agregadas (${qualidadeGeral})`,
      // );

      // Log de informações por tipo de equipamento
      // if (dadosAgregados.Dados) {
      //   // M-160 - Multimedidor
      //   const potTotal = dadosAgregados.Dados.Pa + dadosAgregados.Dados.Pb + dadosAgregados.Dados.Pc;
      //   console.log(`   📊 [M-160] Potência Total: ${potTotal.toFixed(2)} W (${(potTotal / 1000).toFixed(2)} kW)`);
      //   console.log(`   📊 [M-160] Por Fase: A=${dadosAgregados.Dados.Pa.toFixed(2)}W | B=${dadosAgregados.Dados.Pb.toFixed(2)}W | C=${dadosAgregados.Dados.Pc.toFixed(2)}W`);
      //   console.log(`   🔌 [M-160] Tensões: Va=${dadosAgregados.Dados.Va.toFixed(1)}V | Vb=${dadosAgregados.Dados.Vb.toFixed(1)}V | Vc=${dadosAgregados.Dados.Vc.toFixed(1)}V`);
      //   console.log(`   ⚡ [M-160] Energia Importada: ${dadosAgregados.Dados.phf.toFixed(2)} kWh | Exportada: ${dadosAgregados.Dados.phr.toFixed(2)} kWh`);
      //   if (dadosAgregados.Dados.period_energy_kwh) {
      //     console.log(`   ⏱️ [M-160] Energia no período: ${dadosAgregados.Dados.period_energy_kwh} kWh`);
      //   }
      // } else if (dadosAgregados.power?.active_total !== undefined) {
      //   // Inversores
      //   console.log(
      //     `   📊 Potência Ativa: ${dadosAgregados.power.active_total} W (${(dadosAgregados.power.active_total / 1000).toFixed(2)} kW)`,
      //   );
      //   if (dadosAgregados.energy?.period_energy_kwh) {
      //     console.log(`   ⚡ Energia no período: ${dadosAgregados.energy.period_energy_kwh} kWh`);
      //   }
      // } else if (dadosAgregados.power_avg !== undefined) {
      //   // Estrutura legada
      //   console.log(
      //     `   📊 Potência: min=${dadosAgregados.power_min?.toFixed(2)} avg=${dadosAgregados.power_avg?.toFixed(2)} max=${dadosAgregados.power_max?.toFixed(2)} kW`,
      //   );
      //   console.log(`   ⚡ Energia: ${dadosAgregados.energia_kwh?.toFixed(4)} kWh`);
      // }

      // ✅ CORREÇÃO: Só limpar buffer após salvar com sucesso
      buffer.leituras = [];
      buffer.timestamp_inicio = new Date();
    } catch (error) {
      // ❌ CORREÇÃO: Não limpar buffer se deu erro - manter dados para próxima tentativa
      console.error(
        `❌ [Buffer] Erro ao fazer flush do buffer ${equipamentoId} (mantendo ${buffer.leituras.length} leituras para retry):`,
        error
      );
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

    // Verificar tipo de estrutura
    const isInversorData = ultimaLeitura.power && typeof ultimaLeitura.power === 'object';
    const isM160Data = ultimaLeitura.Dados && typeof ultimaLeitura.Dados === 'object';

    if (isM160Data) {
      // ⚠️ ATENÇÃO: Esta lógica NÃO É MAIS USADA para M160!
      // M160 agora envia dados no formato "Resumo" e são salvos diretamente via salvarDadosM160Resumo()
      // M160 NÃO passa pelo buffer, portanto esta função nunca será chamada para M160
      // Este código permanece apenas para retrocompatibilidade com possíveis equipamentos legados

      // ESTRUTURA M-160 LEGADA - Multimedidor 4Q
      // Estrutura: { Dados: { phf, phr, qhfi, qhri, Va, Vb, Vc, Ia, Ib, Ic, Pa, Pb, Pc, FPA, FPB, FPC, freq, timestamp } }

      const dadosM160 = leituras.map(l => l.dados.Dados);

      // Tensões (V)
      const Va = dadosM160.map(d => d.Va).filter(v => v != null);
      const Vb = dadosM160.map(d => d.Vb).filter(v => v != null);
      const Vc = dadosM160.map(d => d.Vc).filter(v => v != null);

      // Correntes (A)
      const Ia = dadosM160.map(d => d.Ia).filter(v => v != null);
      const Ib = dadosM160.map(d => d.Ib).filter(v => v != null);
      const Ic = dadosM160.map(d => d.Ic).filter(v => v != null);

      // Potências (W)
      const Pa = dadosM160.map(d => d.Pa).filter(v => v != null);
      const Pb = dadosM160.map(d => d.Pb).filter(v => v != null);
      const Pc = dadosM160.map(d => d.Pc).filter(v => v != null);

      // Fatores de Potência
      const FPA = dadosM160.map(d => d.FPA).filter(v => v != null);
      const FPB = dadosM160.map(d => d.FPB).filter(v => v != null);
      const FPC = dadosM160.map(d => d.FPC).filter(v => v != null);

      // Energia (kWh)
      const phf = dadosM160.map(d => d.phf).filter(v => v != null); // Energia ativa importada
      const phr = dadosM160.map(d => d.phr).filter(v => v != null); // Energia ativa exportada
      const qhfi = dadosM160.map(d => d.qhfi).filter(v => v != null); // Energia reativa indutiva
      const qhri = dadosM160.map(d => d.qhri).filter(v => v != null); // Energia reativa capacitiva

      // Frequência (Hz)
      const freq = dadosM160.map(d => d.freq).filter(v => v != null);

      agregado.Dados = {
        // Tensões (média)
        Va: Va.length > 0 ? parseFloat(this.mean(Va).toFixed(2)) : 0,
        Vb: Vb.length > 0 ? parseFloat(this.mean(Vb).toFixed(2)) : 0,
        Vc: Vc.length > 0 ? parseFloat(this.mean(Vc).toFixed(2)) : 0,

        // Correntes (média)
        Ia: Ia.length > 0 ? parseFloat(this.mean(Ia).toFixed(2)) : 0,
        Ib: Ib.length > 0 ? parseFloat(this.mean(Ib).toFixed(2)) : 0,
        Ic: Ic.length > 0 ? parseFloat(this.mean(Ic).toFixed(2)) : 0,

        // Potências (média)
        Pa: Pa.length > 0 ? parseFloat(this.mean(Pa).toFixed(2)) : 0,
        Pb: Pb.length > 0 ? parseFloat(this.mean(Pb).toFixed(2)) : 0,
        Pc: Pc.length > 0 ? parseFloat(this.mean(Pc).toFixed(2)) : 0,

        // Fatores de potência (média)
        FPA: FPA.length > 0 ? parseFloat(this.mean(FPA).toFixed(3)) : 0,
        FPB: FPB.length > 0 ? parseFloat(this.mean(FPB).toFixed(3)) : 0,
        FPC: FPC.length > 0 ? parseFloat(this.mean(FPC).toFixed(3)) : 0,

        // Energia (última leitura - são valores cumulativos)
        phf: ultimaLeitura.Dados.phf || 0,
        phr: ultimaLeitura.Dados.phr || 0,
        qhfi: ultimaLeitura.Dados.qhfi || 0,
        qhri: ultimaLeitura.Dados.qhri || 0,

        // Frequência (média)
        freq: freq.length > 0 ? parseFloat(this.mean(freq).toFixed(2)) : 0,

        // Timestamp (última leitura)
        timestamp: ultimaLeitura.Dados.timestamp,
      };

      // Calcular energia do período (kWh)
      const potenciaTotal = (agregado.Dados.Pa + agregado.Dados.Pb + agregado.Dados.Pc) / 1000; // kW
      const intervalo_horas =
        (leituras[leituras.length - 1].timestamp.getTime() - primeiraLeitura.timestamp.getTime()) / (1000 * 3600);
      agregado.Dados.period_energy_kwh = parseFloat((potenciaTotal * intervalo_horas).toFixed(4));

    } else if (isInversorData) {
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
        // CORREÇÃO: Somar energia de cada leitura (potência × tempo), não fazer média!
        const activePowers = leituras.map(l => l.dados.power?.active_total).filter(v => v != null);
        if (activePowers.length > 0) {
          // Cada leitura representa 1 minuto de consumo
          // Energia = Soma de (Potência em W / 1000 / 60) para converter W·min para kWh
          const energiaTotal = activePowers.reduce((sum, power) => {
            return sum + (power / 1000 / 60); // W para kW, minutos para horas
          }, 0);
          agregado.energy.period_energy_kwh = parseFloat(energiaTotal.toFixed(4));

          // LOG para debug da correção
          console.log(`📊 [INVERSOR] Energia calculada corretamente:`);
          console.log(`   - ${activePowers.length} leituras no buffer`);
          console.log(`   - Potência média: ${this.mean(activePowers).toFixed(0)} W`);
          console.log(`   - Energia total período: ${energiaTotal.toFixed(4)} kWh`);
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
