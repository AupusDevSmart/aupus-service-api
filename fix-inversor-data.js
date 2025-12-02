const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixInversorData() {
  try {
    console.log('\n=== CORRIGINDO DADOS DOS INVERSORES ===\n');

    // Buscar todos os dados dos inversores que não têm potencia_ativa_kw preenchida
    const dadosSemPotencia = await prisma.equipamentos_dados.findMany({
      where: {
        equipamento: {
          nome: {
            contains: 'Inversor'
          }
        },
        potencia_ativa_kw: null
      },
      select: {
        id: true,
        equipamento_id: true,
        dados: true,
        timestamp_dados: true,
      },
      take: 1000 // Processar em lotes
    });

    console.log(`Encontrados ${dadosSemPotencia.length} registros para corrigir\n`);

    let atualizados = 0;
    let erros = 0;

    for (const registro of dadosSemPotencia) {
      try {
        const dados = registro.dados;

        // Extrair potência ativa (power.active_total em W, converter para kW)
        let potenciaKw = null;
        if (dados?.power?.active_total !== undefined) {
          potenciaKw = Number(dados.power.active_total) / 1000;
        }

        // Extrair energia (energy.daily_yield em kWh)
        let energiaKwh = null;
        if (dados?.energy?.daily_yield !== undefined) {
          energiaKwh = Number(dados.energy.daily_yield);
        }

        // Extrair PHF (energy.total_yield em kWh)
        let phfAtual = null;
        if (dados?.energy?.total_yield !== undefined) {
          phfAtual = Number(dados.energy.total_yield);
        }

        // Atualizar registro se tiver pelo menos um valor
        if (potenciaKw !== null || energiaKwh !== null || phfAtual !== null) {
          await prisma.equipamentos_dados.update({
            where: { id: registro.id },
            data: {
              potencia_ativa_kw: potenciaKw,
              energia_kwh: energiaKwh,
              phf_atual: phfAtual
            }
          });

          atualizados++;

          if (atualizados % 100 === 0) {
            console.log(`Processados ${atualizados} registros...`);
          }
        }
      } catch (error) {
        erros++;
        console.error(`Erro ao atualizar registro ${registro.id}:`, error.message);
      }
    }

    console.log(`\n=== RESUMO ===`);
    console.log(`Registros atualizados: ${atualizados}`);
    console.log(`Erros: ${erros}`);

    // Verificar resultado
    console.log(`\n=== VERIFICANDO RESULTADO ===\n`);

    const inversor1 = await prisma.equipamentos_dados.findFirst({
      where: {
        equipamento: {
          nome: 'Inversor 1'
        }
      },
      orderBy: {
        timestamp_dados: 'desc'
      }
    });

    if (inversor1) {
      console.log(`Inversor 1 - Última leitura:`);
      console.log(`  Timestamp: ${inversor1.timestamp_dados}`);
      console.log(`  Potência: ${inversor1.potencia_ativa_kw} kW`);
      console.log(`  Energia: ${inversor1.energia_kwh} kWh`);
      console.log(`  PHF: ${inversor1.phf_atual} kWh`);
    }

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixInversorData();
