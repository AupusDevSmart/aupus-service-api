/**
 * Script para verificar dados M160 salvos no banco
 *
 * Uso: node verificar-dados-m160.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('\n🔍 VERIFICAÇÃO DE DADOS M160 NO BANCO\n');
  console.log('='.repeat(80));

  // 1. Buscar equipamentos M160
  const equipamentosM160 = await prisma.equipamentos.findMany({
    where: {
      tipo_equipamento: {
        in: ['M160', 'METER_M160']
      }
    },
    include: {
      unidade: {
        include: {
          concessionaria: true
        }
      }
    }
  });

  if (equipamentosM160.length === 0) {
    console.log('❌ Nenhum equipamento M160 encontrado');
    return;
  }

  console.log(`\n✅ Encontrados ${equipamentosM160.length} equipamento(s) M160:\n`);

  for (const eq of equipamentosM160) {
    console.log(`📊 Equipamento: ${eq.nome} (ID: ${eq.id})`);
    console.log(`   Unidade: ${eq.unidade?.nome || 'N/A'}`);
    console.log(`   Grupo: ${eq.unidade?.grupo || 'N/A'}`);
    console.log(`   Irrigante: ${eq.unidade?.irrigante ? 'SIM' : 'NÃO'}`);
    console.log(`   Concessionária: ${eq.unidade?.concessionaria?.nome || 'N/A'}`);
    console.log('');

    // 2. Buscar últimas leituras
    const ultimasLeituras = await prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: eq.id
      },
      orderBy: {
        timestamp_dados: 'desc'
      },
      take: 5
    });

    if (ultimasLeituras.length === 0) {
      console.log('   ⚠️  Nenhuma leitura encontrada');
      console.log('');
      continue;
    }

    console.log(`   📈 Últimas ${ultimasLeituras.length} leituras:\n`);

    ultimasLeituras.forEach((leitura, index) => {
      const timestamp = new Date(leitura.timestamp_dados);
      const energiaKwh = leitura.energia_kwh;
      const potenciaKw = leitura.potencia_ativa_kw;
      const dados = leitura.dados;

      console.log(`   ${index + 1}. ${timestamp.toLocaleString('pt-BR')}`);

      // Verificar se os campos críticos estão preenchidos
      if (energiaKwh !== null && energiaKwh !== undefined) {
        console.log(`      ✅ energia_kwh: ${parseFloat(energiaKwh).toFixed(6)} kWh`);
      } else {
        console.log(`      ❌ energia_kwh: NULL (PROBLEMA!)`);
      }

      if (potenciaKw !== null && potenciaKw !== undefined) {
        console.log(`      ✅ potencia_ativa_kw: ${parseFloat(potenciaKw).toFixed(3)} kW`);
      } else {
        console.log(`      ❌ potencia_ativa_kw: NULL (PROBLEMA!)`);
      }

      console.log(`      📋 qualidade: ${leitura.qualidade || 'N/A'}`);
      console.log(`      📋 num_leituras: ${leitura.num_leituras || 'N/A'}`);

      // Verificar estrutura do JSON dados
      if (dados && dados.Dados) {
        const d = dados.Dados;
        console.log(`      📦 Dados JSON:`);
        console.log(`         - Tensões: Va=${d.Va || 0}V, Vb=${d.Vb || 0}V, Vc=${d.Vc || 0}V`);
        console.log(`         - Correntes: Ia=${d.Ia || 0}A, Ib=${d.Ib || 0}A, Ic=${d.Ic || 0}A`);
        console.log(`         - Potências: Pa=${d.Pa || 0}W, Pb=${d.Pb || 0}W, Pc=${d.Pc || 0}W`);
        console.log(`         - FP: FPA=${d.FPA || 0}, FPB=${d.FPB || 0}, FPC=${d.FPC || 0}`);
        console.log(`         - Frequência: ${d.freq || 0} Hz`);
      } else {
        console.log(`      ⚠️  Campo 'dados.Dados' não encontrado`);
      }

      console.log('');
    });

    // 3. Estatísticas do último dia
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    ontem.setHours(0, 0, 0, 0);

    const hoje = new Date();
    hoje.setHours(23, 59, 59, 999);

    const leiturasHoje = await prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: eq.id,
        timestamp_dados: {
          gte: ontem,
          lte: hoje
        }
      }
    });

    if (leiturasHoje.length > 0) {
      const totalEnergia = leiturasHoje.reduce((sum, l) => {
        const energia = l.energia_kwh ? parseFloat(l.energia_kwh) : 0;
        return sum + energia;
      }, 0);

      const potenciasValidas = leiturasHoje
        .filter(l => l.potencia_ativa_kw !== null)
        .map(l => parseFloat(l.potencia_ativa_kw));

      const potenciaMedia = potenciasValidas.length > 0
        ? potenciasValidas.reduce((sum, p) => sum + p, 0) / potenciasValidas.length
        : 0;

      const potenciaMaxima = potenciasValidas.length > 0
        ? Math.max(...potenciasValidas)
        : 0;

      console.log(`   📊 ESTATÍSTICAS DAS ÚLTIMAS 24 HORAS:`);
      console.log(`      - Total de leituras: ${leiturasHoje.length}`);
      console.log(`      - Energia total: ${totalEnergia.toFixed(3)} kWh`);
      console.log(`      - Potência média: ${potenciaMedia.toFixed(2)} kW`);
      console.log(`      - Potência máxima: ${potenciaMaxima.toFixed(2)} kW`);
      console.log(`      - Leituras com energia NULL: ${leiturasHoje.filter(l => !l.energia_kwh).length}`);
      console.log(`      - Leituras com potência NULL: ${leiturasHoje.filter(l => !l.potencia_ativa_kw).length}`);
    } else {
      console.log(`   ⚠️  Nenhuma leitura nas últimas 24 horas`);
    }

    console.log('\n' + '='.repeat(80) + '\n');
  }

  console.log('\n✅ Verificação concluída!\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
