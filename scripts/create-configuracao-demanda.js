const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createConfiguracaoDemandaTable() {
  try {
    // Criar a tabela configuracao_demanda
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS configuracao_demanda (
        id CHAR(26) NOT NULL PRIMARY KEY,
        unidade_id CHAR(26) NOT NULL UNIQUE,
        fonte VARCHAR(20) NOT NULL DEFAULT 'AGRUPAMENTO',
        equipamentos_ids JSON NOT NULL,
        mostrar_detalhes BOOLEAN NOT NULL DEFAULT true,
        intervalo_atualizacao INTEGER NOT NULL DEFAULT 30,
        aplicar_perdas BOOLEAN NOT NULL DEFAULT true,
        fator_perdas DECIMAL(5,2) NOT NULL DEFAULT 3.0,
        valor_contratado DECIMAL(10,2),
        percentual_adicional DECIMAL(5,2) DEFAULT 10.0,
        created_at TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by CHAR(26),
        updated_by CHAR(26),
        CONSTRAINT fk_configuracao_demanda_unidade FOREIGN KEY (unidade_id) REFERENCES unidades(id) ON DELETE CASCADE,
        CONSTRAINT fk_configuracao_demanda_created_by FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL,
        CONSTRAINT fk_configuracao_demanda_updated_by FOREIGN KEY (updated_by) REFERENCES usuarios(id) ON DELETE SET NULL
      );
    `;

    console.log('✅ Tabela configuracao_demanda criada com sucesso!');

    // Criar índice
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_configuracao_demanda_unidade ON configuracao_demanda(unidade_id);
    `;

    console.log('✅ Índice criado com sucesso!');

    // Inserir configuração de exemplo para a unidade de teste
    const unidadeId = 'cmhcfvf5k0001jqo8nff75bcv'; // Unidade com os inversores

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
          percentual_adicional
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
          10.0
        )
      `;

      console.log('✅ Configuração de exemplo inserida!');
      console.log('   Unidade:', unidadeId);
      console.log('   Equipamentos:', equipamentosIds.map(e => e.nome).join(', '));
    } else {
      console.log('ℹ️ Configuração já existe para esta unidade');
    }

    // Verificar dados inseridos
    const configs = await prisma.$queryRaw`
      SELECT
        c.id,
        c.unidade_id,
        c.fonte,
        c.equipamentos_ids,
        c.valor_contratado,
        u.nome as unidade_nome
      FROM configuracao_demanda c
      JOIN unidades u ON u.id = c.unidade_id
    `;

    console.log('\n📊 Configurações existentes:');
    configs.forEach(config => {
      console.log(`   - ${config.unidade_nome}: ${config.fonte}`);
      const equips = typeof config.equipamentos_ids === 'string'
        ? JSON.parse(config.equipamentos_ids)
        : config.equipamentos_ids;
      console.log(`     Equipamentos: ${equips.length}`);
      console.log(`     Valor Contratado: ${config.valor_contratado} kW`);
    });

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createConfiguracaoDemandaTable();