const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Novo schema JSON para M160 compatível com formato Resumo
 * Baseado no JSON real que você forneceu
 */
const NOVO_SCHEMA_M160 = {
  type: 'object',
  required: ['Resumo'],
  properties: {
    // ✅ CAMPO PRINCIPAL - Resumo com dados agregados
    Resumo: {
      type: 'object',
      required: ['energia_total', 'timestamp', 'total_leituras'],
      properties: {
        // Contadores acumulados
        somatorio_phf: {
          type: 'number',
          minimum: 0,
          description: 'Energia ativa importada acumulada total (kWh)'
        },
        somatorio_phr: {
          type: 'number',
          minimum: 0,
          description: 'Energia ativa exportada acumulada total (kWh)'
        },

        // Consumo no período de 30 segundos
        consumo_total_phf: {
          type: 'number',
          minimum: 0,
          description: 'Consumo de energia importada nos últimos 30s (kWh)'
        },
        consumo_total_phr: {
          type: 'number',
          minimum: 0,
          description: 'Consumo de energia exportada nos últimos 30s (kWh)'
        },

        // ⭐ CAMPO MAIS IMPORTANTE
        energia_total: {
          type: 'number',
          minimum: 0,
          description: 'Energia total consumida no período de 30s (kWh)'
        },

        // Tensões médias (30 leituras)
        Va_media: {
          type: 'number',
          minimum: 0,
          maximum: 500,
          description: 'Tensão média fase A (V)'
        },
        Vb_media: {
          type: 'number',
          minimum: 0,
          maximum: 500,
          description: 'Tensão média fase B (V)'
        },
        Vc_media: {
          type: 'number',
          minimum: 0,
          maximum: 500,
          description: 'Tensão média fase C (V)'
        },

        // Correntes médias (30 leituras)
        Ia_media: {
          type: 'number',
          minimum: 0,
          description: 'Corrente média fase A (A)'
        },
        Ib_media: {
          type: 'number',
          minimum: 0,
          description: 'Corrente média fase B (A)'
        },
        Ic_media: {
          type: 'number',
          minimum: 0,
          description: 'Corrente média fase C (A)'
        },

        // Fatores de potência médios (30 leituras)
        FPa_medio: {
          type: 'number',
          minimum: -1,
          maximum: 1,
          description: 'Fator de potência médio fase A'
        },
        FPb_medio: {
          type: 'number',
          minimum: -1,
          maximum: 1,
          description: 'Fator de potência médio fase B'
        },
        FPc_medio: {
          type: 'number',
          minimum: -1,
          maximum: 1,
          description: 'Fator de potência médio fase C'
        },

        // Energia por fase (30 segundos)
        energia_a: {
          type: 'number',
          minimum: 0,
          description: 'Energia consumida fase A no período (kWh)'
        },
        energia_b: {
          type: 'number',
          minimum: 0,
          description: 'Energia consumida fase B no período (kWh)'
        },
        energia_c: {
          type: 'number',
          minimum: 0,
          description: 'Energia consumida fase C no período (kWh)'
        },

        // Metadados
        total_leituras: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Número de leituras agregadas (geralmente 30)'
        },
        timestamp: {
          type: 'integer',
          minimum: 0,
          description: 'Timestamp Unix da última leitura (segundos)'
        }
      }
    },

    // ✅ ARRAYS DE HISTÓRICO (opcionais, não validados rigorosamente)
    kwh: {
      type: 'array',
      items: { type: 'number', minimum: 0 },
      description: 'Histórico de 30 leituras de energia (kWh)'
    },
    kvarh: {
      type: 'array',
      items: { type: 'number' },
      description: 'Histórico de 30 leituras de energia reativa (kVArh)'
    },
    Va: {
      type: 'array',
      items: { type: 'number', minimum: 0 },
      description: 'Histórico de 30 leituras de tensão fase A (V)'
    },
    Vb: {
      type: 'array',
      items: { type: 'number', minimum: 0 },
      description: 'Histórico de 30 leituras de tensão fase B (V)'
    },
    Vc: {
      type: 'array',
      items: { type: 'number', minimum: 0 },
      description: 'Histórico de 30 leituras de tensão fase C (V)'
    },
    Ia: {
      type: 'array',
      items: { type: 'number', minimum: 0 },
      description: 'Histórico de 30 leituras de corrente fase A (A)'
    },
    Ib: {
      type: 'array',
      items: { type: 'number', minimum: 0 },
      description: 'Histórico de 30 leituras de corrente fase B (A)'
    },
    Ic: {
      type: 'array',
      items: { type: 'number', minimum: 0 },
      description: 'Histórico de 30 leituras de corrente fase C (A)'
    },
    FPa: {
      type: 'array',
      items: { type: 'number', minimum: -1, maximum: 1 },
      description: 'Histórico de 30 leituras de fator de potência fase A'
    },
    FPb: {
      type: 'array',
      items: { type: 'number', minimum: -1, maximum: 1 },
      description: 'Histórico de 30 leituras de fator de potência fase B'
    },
    FPc: {
      type: 'array',
      items: { type: 'number', minimum: -1, maximum: 1 },
      description: 'Histórico de 30 leituras de fator de potência fase C'
    }
  }
};

/**
 * Campos que serão extraídos e usados pela aplicação
 * (apenas do Resumo, arrays são ignorados)
 */
const CAMPOS_USADOS = [
  'Resumo.somatorio_phf',
  'Resumo.somatorio_phr',
  'Resumo.energia_total',      // ⭐ PRINCIPAL
  'Resumo.Va_media',
  'Resumo.Vb_media',
  'Resumo.Vc_media',
  'Resumo.Ia_media',
  'Resumo.Ib_media',
  'Resumo.Ic_media',
  'Resumo.FPa_medio',
  'Resumo.FPb_medio',
  'Resumo.FPc_medio',
  'Resumo.energia_a',
  'Resumo.energia_b',
  'Resumo.energia_c',
  'Resumo.total_leituras',
  'Resumo.timestamp'
];

async function atualizarSchemaM160() {
  try {
    console.log('='.repeat(80));
    console.log('ATUALIZANDO SCHEMA DO M160');
    console.log('='.repeat(80));
    console.log('');

    // Atualizar METER_M160 (principal)
    console.log('📝 Atualizando tipo: METER_M160 (ID: tipo-meter-m160-001)');

    const resultado = await prisma.tipos_equipamentos.update({
      where: {
        id: 'tipo-meter-m160-001'
      },
      data: {
        propriedades_schema: NOVO_SCHEMA_M160
      }
    });

    console.log('✅ Schema atualizado com sucesso!');
    console.log('');
    console.log('📋 Novo schema salvo:');
    console.log(JSON.stringify(NOVO_SCHEMA_M160, null, 2));
    console.log('');

    console.log('📊 Campos que serão usados pela aplicação:');
    CAMPOS_USADOS.forEach(campo => {
      console.log(`   - ${campo}`);
    });
    console.log('');

    console.log('='.repeat(80));
    console.log('✅ ATUALIZAÇÃO CONCLUÍDA COM SUCESSO!');
    console.log('='.repeat(80));
    console.log('');
    console.log('⚠️ PRÓXIMOS PASSOS:');
    console.log('   1. Atualizar mqtt.service.ts para extrair dados do Resumo');
    console.log('   2. Atualizar mqtt-ingestion.service.ts para processar novo formato');
    console.log('   3. Atualizar frontend (useDadosM160.ts, useDadosDemanda.ts)');
    console.log('   4. Testar com JSON real do MQTT');
    console.log('');

  } catch (error) {
    console.error('❌ Erro ao atualizar schema:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar atualização
atualizarSchemaM160();
