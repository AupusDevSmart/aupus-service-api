import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Determina qualidade baseado nos dados reais do M160
 */
function determinarQualidadeM160(dados: any): 'boa' | 'parcial' | 'ruim' {
  if (!dados.Dados) {
    return 'ruim'; // Estrutura inválida
  }

  const d = dados.Dados;

  // Verificar se tem tensões
  const temTensao = (d.Va > 0 || d.Vb > 0 || d.Vc > 0);

  // Verificar se tem corrente
  const temCorrente = (d.Ia > 0 || d.Ib > 0 || d.Ic > 0);

  // Verificar se tem potência
  const temPotencia = (d.Pa > 0 || d.Pb > 0 || d.Pc > 0 || d.Pt > 0);

  // Regras de qualidade:
  // BOA: Tem tensão + corrente + potência (consumo real)
  // PARCIAL: Tem tensão mas sem corrente (instalação sem carga - normal)
  // RUIM: Sem tensão (desligado/desconectado)

  if (!temTensao) {
    return 'ruim'; // Sem tensão = equipamento desligado/problema
  }

  if (temCorrente && temPotencia) {
    return 'boa'; // Tudo funcionando, medindo consumo real
  }

  // Tem tensão mas sem corrente = instalação energizada mas sem carga
  // Isso é NORMAL em muitos casos (ex: noite, final de semana)
  return 'parcial';
}

async function fixQualidade() {
  console.log('\n🔧 CORRIGINDO QUALIDADE DOS DADOS HISTÓRICOS\n');
  console.log('='.repeat(80));

  try {
    // Buscar todos os registros com qualidade 'ruim' das últimas 48h
    const registros = await prisma.equipamentos_dados.findMany({
      where: {
        qualidade: 'ruim',
        timestamp_dados: {
          gte: new Date(Date.now() - 48 * 60 * 60 * 1000) // Últimas 48h
        }
      },
      select: {
        id: true,
        equipamento_id: true,
        dados: true,
        qualidade: true
      }
    });

    console.log(`📊 Encontrados ${registros.length} registros com qualidade "ruim"\n`);

    let corrigidos = 0;
    let mantidos = 0;
    let erros = 0;

    const stats = {
      boa: 0,
      parcial: 0,
      ruim: 0
    };

    for (const registro of registros) {
      try {
        const qualidadeNova = determinarQualidadeM160(registro.dados);

        // Se mudou, atualizar
        if (qualidadeNova !== 'ruim') {
          await prisma.equipamentos_dados.update({
            where: { id: registro.id },
            data: { qualidade: qualidadeNova }
          });

          corrigidos++;
          stats[qualidadeNova]++;

          if (corrigidos <= 10) {
            console.log(`✅ ${registro.id.substring(0, 8)} | ruim → ${qualidadeNova}`);
          }
        } else {
          mantidos++;
          stats.ruim++;
        }
      } catch (error) {
        erros++;
        console.error(`❌ Erro ao processar ${registro.id}:`, error);
      }
    }

    if (corrigidos > 10) {
      console.log(`   ... e mais ${corrigidos - 10} registros corrigidos`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n📊 RESULTADO:\n');
    console.log(`Total processados: ${registros.length}`);
    console.log(`✅ Corrigidos: ${corrigidos}`);
    console.log(`   - Para BOA: ${stats.boa}`);
    console.log(`   - Para PARCIAL: ${stats.parcial}`);
    console.log(`⚪ Mantidos como RUIM: ${mantidos}`);
    console.log(`❌ Erros: ${erros}\n`);

    // Estatísticas finais
    const statsFinais = await prisma.equipamentos_dados.groupBy({
      by: ['qualidade'],
      where: {
        timestamp_dados: {
          gte: new Date(Date.now() - 48 * 60 * 60 * 1000)
        }
      },
      _count: true
    });

    console.log('📈 DISTRIBUIÇÃO ATUAL (últimas 48h):\n');
    statsFinais.forEach(s => {
      const icon = s.qualidade === 'boa' ? '✅' : s.qualidade === 'parcial' ? '⚠️' : '❌';
      console.log(`${icon} ${s.qualidade}: ${s._count} registros`);
    });

    console.log('\n✅ Correção concluída!\n');

  } catch (error) {
    console.error('\n❌ Erro fatal:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixQualidade();
