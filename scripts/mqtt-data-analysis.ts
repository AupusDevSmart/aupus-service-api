import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeData() {
  console.log('\n🔍 ANÁLISE DETALHADA DOS DADOS MQTT\n');
  console.log('='.repeat(80));

  // Buscar últimos 10 registros com dados completos
  const registros = await prisma.$queryRaw<any[]>`
    SELECT
      e.nome,
      e.topico_mqtt,
      ed.timestamp_dados,
      ed.created_at,
      ed.qualidade,
      ed.dados
    FROM equipamentos_dados ed
    JOIN equipamentos e ON ed.equipamento_id = e.id
    ORDER BY ed.created_at DESC
    LIMIT 20
  `;

  console.log('\n📊 ÚLTIMOS 20 REGISTROS - ANÁLISE DE VALORES:\n');

  registros.forEach((reg, i) => {
    const dados = reg.dados;
    console.log(`${i + 1}. ${reg.nome} - ${new Date(reg.timestamp_dados).toLocaleString('pt-BR')}`);
    console.log(`   Qualidade: ${reg.qualidade}`);

    // Analisar estrutura dos dados
    if (dados.Dados) {
      const d = dados.Dados;

      // Tensões
      const tensoes = { Va: d.Va, Vb: d.Vb, Vc: d.Vc };
      const temTensoes = Object.values(tensoes).some(v => v && v !== 0);
      console.log(`   📈 Tensões (Va/Vb/Vc): ${d.Va || 0}V / ${d.Vb || 0}V / ${d.Vc || 0}V ${temTensoes ? '✅' : '❌'}`);

      // Correntes
      const correntes = { Ia: d.Ia, Ib: d.Ib, Ic: d.Ic };
      const temCorrente = Object.values(correntes).some(v => v && v !== 0);
      console.log(`   ⚡ Correntes (Ia/Ib/Ic): ${d.Ia || 0}A / ${d.Ib || 0}A / ${d.Ic || 0}A ${temCorrente ? '✅' : '❌'}`);

      // Potências
      const potencias = { Pa: d.Pa, Pb: d.Pb, Pc: d.Pc, Pt: d.Pt };
      const temPotencia = Object.values(potencias).some(v => v && v !== 0);
      console.log(`   ⚙️  Potências (Pa/Pb/Pc/Pt): ${d.Pa || 0}W / ${d.Pb || 0}W / ${d.Pc || 0}W / ${d.Pt || 0}W ${temPotencia ? '✅' : '❌'}`);

      // Fator de Potência
      const fps = { FPa: d.FPa, FPb: d.FPb, FPc: d.FPc };
      const temFP = Object.values(fps).some(v => v && v !== 0);
      console.log(`   🔋 Fator Potência (FPa/FPb/FPc): ${d.FPa || 0} / ${d.FPb || 0} / ${d.FPc || 0} ${temFP ? '✅' : '❌'}`);

      // Energia/PHF
      if (d.PHF !== undefined) {
        console.log(`   💡 PHF (Energia): ${d.PHF}kWh ${d.PHF > 0 ? '✅' : '❌'}`);
      }

      // Determinar qualidade REAL
      let qualidadeReal = 'boa';
      if (!temTensoes && !temCorrente && !temPotencia) {
        qualidadeReal = 'sem_dados';
      } else if (!temCorrente && !temPotencia) {
        qualidadeReal = 'parcial';
      }

      console.log(`   🎯 Qualidade Real: ${qualidadeReal} (BD diz: ${reg.qualidade})`);

      // Ver todos os campos
      const camposNaoZero = Object.entries(d).filter(([k, v]) => v !== 0 && v !== null).length;
      const camposTotal = Object.keys(d).length;
      console.log(`   📋 Campos não-zero: ${camposNaoZero}/${camposTotal}`);
    } else {
      console.log(`   ⚠️ Estrutura desconhecida:`, JSON.stringify(dados).substring(0, 100));
    }
    console.log();
  });

  // ESTATÍSTICAS DE CAMPOS
  console.log('\n📊 ESTATÍSTICAS DE CAMPOS COM VALORES:\n');

  const stats = await prisma.$queryRaw<any[]>`
    SELECT
      COUNT(*) as total_registros,
      COUNT(*) FILTER (WHERE (dados->'Dados'->>'Va')::NUMERIC > 0) as com_tensao_va,
      COUNT(*) FILTER (WHERE (dados->'Dados'->>'Ia')::NUMERIC > 0) as com_corrente_ia,
      COUNT(*) FILTER (WHERE (dados->'Dados'->>'Pa')::NUMERIC > 0) as com_potencia_pa,
      COUNT(*) FILTER (WHERE (dados->'Dados'->>'Pt')::NUMERIC > 0) as com_potencia_total,
      COUNT(*) FILTER (WHERE (dados->'Dados'->>'PHF')::NUMERIC > 0) as com_phf,
      AVG((dados->'Dados'->>'Va')::NUMERIC) as media_tensao_va,
      AVG((dados->'Dados'->>'Ia')::NUMERIC) as media_corrente_ia,
      AVG((dados->'Dados'->>'Pt')::NUMERIC) as media_potencia_total
    FROM equipamentos_dados
    WHERE timestamp_dados >= NOW() - INTERVAL '24 hours'
  `;

  const s = stats[0];
  console.log(`Total de registros (24h): ${s.total_registros}`);
  console.log(`\nCampos populados:`);
  console.log(`  📈 Tensão Va > 0: ${s.com_tensao_va} (${Math.round(Number(s.com_tensao_va) / Number(s.total_registros) * 100)}%)`);
  console.log(`  ⚡ Corrente Ia > 0: ${s.com_corrente_ia} (${Math.round(Number(s.com_corrente_ia) / Number(s.total_registros) * 100)}%)`);
  console.log(`  ⚙️  Potência Pa > 0: ${s.com_potencia_pa} (${Math.round(Number(s.com_potencia_pa) / Number(s.total_registros) * 100)}%)`);
  console.log(`  ⚡ Potência Total > 0: ${s.com_potencia_total} (${Math.round(Number(s.com_potencia_total) / Number(s.total_registros) * 100)}%)`);
  console.log(`  💡 PHF > 0: ${s.com_phf} (${Math.round(Number(s.com_phf) / Number(s.total_registros) * 100)}%)`);

  console.log(`\nMédias (apenas valores > 0):`);
  if (Number(s.media_tensao_va) > 0) {
    console.log(`  📈 Tensão média: ${Number(s.media_tensao_va).toFixed(2)}V`);
  }
  if (Number(s.media_corrente_ia) > 0) {
    console.log(`  ⚡ Corrente média: ${Number(s.media_corrente_ia).toFixed(2)}A`);
  }
  if (Number(s.media_potencia_total) > 0) {
    console.log(`  ⚙️  Potência média: ${Number(s.media_potencia_total).toFixed(2)}W`);
  }

  // ANÁLISE: Por que qualidade = "ruim"?
  console.log('\n\n❓ ANÁLISE: POR QUE QUALIDADE = "RUIM"?\n');

  const comTensaoSemCorrente = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*) as count
    FROM equipamentos_dados
    WHERE timestamp_dados >= NOW() - INTERVAL '24 hours'
      AND (dados->'Dados'->>'Va')::NUMERIC > 0
      AND (dados->'Dados'->>'Ia')::NUMERIC = 0
  `;

  console.log(`Registros com TENSÃO mas SEM CORRENTE: ${comTensaoSemCorrente[0].count}`);
  console.log(`\nProvável razão para qualidade "ruim":`);
  console.log(`  - Tensão está presente (rede energizada) ✅`);
  console.log(`  - Corrente está ZERO (nenhuma carga conectada) ❌`);
  console.log(`  - Sem corrente = sem potência = sem consumo`);
  console.log(`  - Sistema marcando como "ruim" porque não há consumo real`);

  console.log('\n='.repeat(80));
  console.log('\n✅ Análise completa!\n');

  await prisma.$disconnect();
}

analyzeData().catch(console.error);
