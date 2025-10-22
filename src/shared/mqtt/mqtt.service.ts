import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as mqtt from 'mqtt';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter } from 'events';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

@Injectable()
export class MqttService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private client: mqtt.MqttClient;
  private subscriptions: Map<string, string[]> = new Map(); // topic -> [equipamentoIds]
  private ajv: Ajv;

  constructor(private readonly prisma: PrismaService) {
    super();
    // Inicializar Ajv com formatos adicionais
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
  }

  async onModuleInit() {
    await this.connect();
  }

  onModuleDestroy() {
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
      // Parse do payload JSON
      const dados = JSON.parse(payload.toString());

      // Obter equipamentos que escutam este tópico
      const equipamentoIds = this.subscriptions.get(topic);
      if (!equipamentoIds || equipamentoIds.length === 0) {
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
      console.error('❌ Erro ao compilar schema:', error);
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
      const dadosSalvos = await this.prisma.equipamentos_dados.create({
        data: {
          equipamento_id: equipamentoId,
          dados: dados as any,
          fonte: 'MQTT',
          timestamp_dados: dados.timestamp
            ? new Date(dados.timestamp)
            : new Date(),
          qualidade,
        },
      });

      // Atualizar status do equipamento se veio no payload
      if (dados.status && dados.status !== equipamento.status) {
        await this.prisma.equipamentos.update({
          where: { id: equipamentoId },
          data: { status: dados.status },
        });
      }

      // Emitir evento para WebSocket
      this.emit('equipamento_dados', {
        equipamentoId,
        diagramaId: equipamento.diagrama_id,
        dados: dadosSalvos,
      });

      if (qualidade === 'GOOD') {
        console.log(`✅ Dados válidos salvos para equipamento ${equipamento.nome}`);
      } else {
        console.log(`⚠️ Dados com erros salvos para equipamento ${equipamento.nome} (qualidade: ${qualidade})`);
      }
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
}
