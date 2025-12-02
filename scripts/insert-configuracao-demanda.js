const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function insertConfiguracaoDemanda() {
  try {
    // Unidade com os inversores
    const unidadeId = 'cmhcfvf5k0001jqo8nff75bcv';

    // Verificar se já existe configuração
    const existing = await prisma.$queryRaw`
      SELECT id FROM configuracao_demanda WHERE unidade_id = ${unidadeId}
    `;

    if (existing.length === 0) {
      // IDs dos equipamentos confirmados
      const equipamentosIds = [
        {
          id: 'cmhcfyoj30003jqo8bhhaexlp',
          nome: 'Inversor 1',
          tipo: 'INVERSOR',
          fluxoEnergia: 'GERACAO',
          selecionado: true,
          multiplicador: 1
        },
        {
          id: 'cmhdd6wkv001kjqo8rl39taa6',
          nome: 'Inversor 2',
          tipo: 'INVERSOR',
          fluxoEnergia: 'GERACAO',
          selecionado: true,
          multiplicador: 1
        },
        {
          id: 'cmhddtv0h0024jqo8h4dzm4gq',
          nome: 'Inversor 3',
          tipo: 'INVERSOR',
          fluxoEnergia: 'GERACAO',
          selecionado: true,
          multiplicador: 1
        }
      ];

      // Gerar ID único
      const configId = 'cfg' + Date.now().toString(36) + Math.random().toString(36).substr(2);
      const now = new Date();

      await prisma.$executeRaw`
        INSERT INTO configuracao_demanda (
          id,
          unidade_id,
          fonte,
          equipamentos_ids,
          mostrar_detalhes,
          intervalo_atualizacao,
          aplicar_perdas,
          fator_perdas,
          valor_contratado,
          percentual_adicional,
          created_at,
          updated_at
        ) VALUES (
          ${configId},
          ${unidadeId},
          'AGRUPAMENTO',
          ${JSON.stringify(equipamentosIds)}::json,
          true,
          30,
          true,
          3.0,
          1500.0,
          10.0,
          ${now},
          ${now}
        )
      `;

      console.log('✅ Configuração de demanda inserida com sucesso!');
      console.log('   ID:', configId);
      console.log('   Unidade:', unidadeId);
      console.log('   Equipamentos:', equipamentosIds.map(e => e.nome).join(', '));
      console.log('   Valor Contratado: 1500 kW');
    } else {
      console.log('ℹ️ Configuração já existe para esta unidade');

      // Atualizar configuração existente
      const now = new Date();
      const equipamentosIds = [
        {
          id: 'cmhcfyoj30003jqo8bhhaexlp',
          nome: 'Inversor 1',
          tipo: 'INVERSOR',
          fluxoEnergia: 'GERACAO',
          selecionado: true,
          multiplicador: 1
        },
        {
          id: 'cmhdd6wkv001kjqo8rl39taa6',
          nome: 'Inversor 2',
          tipo: 'INVERSOR',
          fluxoEnergia: 'GERACAO',
          selecionado: true,
          multiplicador: 1
        },
        {
          id: 'cmhddtv0h0024jqo8h4dzm4gq',
          nome: 'Inversor 3',
          tipo: 'INVERSOR',
          fluxoEnergia: 'GERACAO',
          selecionado: true,
          multiplicador: 1
        }
      ];

      await prisma.$executeRaw`
        UPDATE configuracao_demanda
        SET
          equipamentos_ids = ${JSON.stringify(equipamentosIds)}::json,
          valor_contratado = 1500.0,
          percentual_adicional = 10.0,
          updated_at = ${now}
        WHERE unidade_id = ${unidadeId}
      `;

      console.log('✅ Configuração atualizada com sucesso!');
    }

    // Verificar dados inseridos
    const configs = await prisma.$queryRaw`
      SELECT
        c.id,
        c.unidade_id,
        c.fonte,
        c.equipamentos_ids,
        c.valor_contratado,
        c.percentual_adicional,
        u.nome as unidade_nome
      FROM configuracao_demanda c
      JOIN unidades u ON u.id = c.unidade_id
    `;

    console.log('\n📊 Configurações existentes:');
    configs.forEach(config => {
      console.log(`\n   Unidade: ${config.unidade_nome}`);
      console.log(`   Fonte: ${config.fonte}`);
      const equips = typeof config.equipamentos_ids === 'string'
        ? JSON.parse(config.equipamentos_ids)
        : config.equipamentos_ids;
      console.log(`   Equipamentos configurados: ${equips.length}`);
      equips.forEach(e => {
        console.log(`      - ${e.nome} (${e.id})`);
      });
      console.log(`   Valor Contratado: ${config.valor_contratado} kW`);
      console.log(`   Percentual Adicional: ${config.percentual_adicional}%`);
    });

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

insertConfiguracaoDemanda();