const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Função helper para converter snake_case para Título Legível
function toTitleCase(str) {
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    // Correções de acentuação
    .replace('Tensao', 'Tensão')
    .replace('Corrente', 'Corrente')
    .replace('Potencia', 'Potência')
    .replace('Frequencia', 'Frequência')
    .replace('Eficiencia', 'Eficiência')
    .replace('Numero', 'Número')
    .replace('Maximo', 'Máximo')
    .replace('Maxima', 'Máxima')
    .replace('Minimo', 'Mínimo')
    .replace('Minima', 'Mínima')
    .replace('Bateria', 'Bateria')
    .replace('Oleo', 'Óleo')
    .replace('Protecao', 'Proteção')
    .replace('Comunicacao', 'Comunicação')
    .replace('Atuacao', 'Atuação')
    .replace('Alimentacao', 'Alimentação')
    .replace('Precisao', 'Precisão')
    .replace('Rotacao', 'Rotação')
    .replace('Ligacao', 'Ligação')
    .replace('Servico', 'Serviço')
    .replace('Secao', 'Seção')
    .replace('Seccionadora', 'Seccionadora')
    .replace('Juncao', 'Junção')
    .replace('Transversal', 'Transversal')
    .replace('Operacao', 'Operação')
    .replace('Fabricacao', 'Fabricação')
    .replace('Dimensoes', 'Dimensões')
    .replace('Autonomia', 'Autonomia')
    .replace('Impedancia', 'Impedância')
    .replace('Acionamento', 'Acionamento')
    .replace('Utilizacao', 'Utilização')
    .replace('Mascara', 'Máscara')
    .replace('Topologia', 'Topologia')
    .replace('Categoria', 'Categoria')
    .replace('Funcoes', 'Funções')
    .replace('Licencas', 'Licenças')
    .replace('Redundancia', 'Redundância')
    .replace('Isolamento', 'Isolamento')
    .replace('Configuracao', 'Configuração')
    .replace('Alimentados', 'Alimentados')
    .replace('Celulas', 'Células');
}

async function main() {
  console.log('🔧 Atualizando TODOS os tipos de equipamentos para formato legível...\n');

  try {
    // ⚠️ IMPORTANTE: Tipos com MQTT usam propriedades_schema para JSON Schema MQTT, não campos técnicos!
    const tiposComMqtt = ['METER_M160', 'INVERSOR', 'PIVO'];

    const tipos = await prisma.tipos_equipamentos.findMany({
      where: {
        propriedades_schema: {
          path: ['campos'],
          not: null
        },
        codigo: {
          notIn: tiposComMqtt // ⚠️ EXCLUIR tipos com MQTT ativo
        }
      },
      orderBy: { nome: 'asc' }
    });

    console.log(`📊 Total de tipos com campos técnicos: ${tipos.length}`);
    console.log(`⚠️  Tipos com MQTT excluídos (schema MQTT protegido): ${tiposComMqtt.join(', ')}\n`);

    let atualizados = 0;
    let erros = 0;

    for (const tipo of tipos) {
      try {
        console.log(`\n📝 Processando: ${tipo.nome} (${tipo.codigo})`);

        if (!tipo.propriedades_schema || !tipo.propriedades_schema.campos) {
          console.log('   ⚠️  Sem campos técnicos, pulando...');
          continue;
        }

        const camposAtualizados = tipo.propriedades_schema.campos.map(campo => {
          // Se o campo já está em formato legível (tem letra maiúscula no início), não alterar
          const primeiraLetra = campo.campo.charAt(0);
          const estaEmFormatoLegivel = primeiraLetra === primeiraLetra.toUpperCase() && !campo.campo.includes('_');

          if (estaEmFormatoLegivel) {
            console.log(`   ✓ ${campo.campo} (já legível)`);
            return campo;
          }

          // Se é 'undefined', manter como está (será corrigido manualmente)
          if (campo.campo === 'undefined') {
            console.log(`   ⚠️  ${campo.campo} (campo inválido, manter)`);
            return campo;
          }

          const novoNome = toTitleCase(campo.campo);
          console.log(`   🔄 ${campo.campo} → ${novoNome}`);

          return {
            ...campo,
            campo: novoNome
          };
        });

        // Atualizar no banco
        await prisma.tipos_equipamentos.update({
          where: { id: tipo.id },
          data: {
            propriedades_schema: {
              campos: camposAtualizados
            }
          }
        });

        console.log(`   ✅ ${tipo.codigo} atualizado com sucesso!`);
        atualizados++;

      } catch (error) {
        console.error(`   ❌ Erro ao atualizar ${tipo.codigo}:`, error.message);
        erros++;
      }
    }

    console.log('\n' + '='.repeat(100));
    console.log(`\n📊 Resumo:`);
    console.log(`   ✅ Atualizados: ${atualizados}`);
    console.log(`   ❌ Erros: ${erros}`);
    console.log(`\n🎉 Atualização concluída!`);

  } catch (error) {
    console.error('\n❌ Erro geral:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
