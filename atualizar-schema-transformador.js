const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Atualizando schema do Transformador...\n');

  try {
    // 1. Buscar o tipo Transformador
    const transformador = await prisma.tipos_equipamentos.findUnique({
      where: { codigo: 'TRANSFORMADOR' },
    });

    if (!transformador) {
      console.error('❌ Tipo TRANSFORMADOR não encontrado no banco de dados');
      return;
    }

    console.log('✅ Transformador encontrado:', transformador.nome);
    console.log('📋 Schema atual:', JSON.stringify(transformador.propriedades_schema, null, 2));

    // 2. Definir novo schema com campos técnicos corretos
    const novoSchema = {
      campos: [
        {
          campo: 'Potência Nominal',
          tipo: 'number',
          unidade: 'kVA',
          obrigatorio: true,
          descricao: 'Potência nominal do transformador'
        },
        {
          campo: 'Tensão Primária',
          tipo: 'number',
          unidade: 'kV',
          obrigatorio: true,
          descricao: 'Tensão do lado primário'
        },
        {
          campo: 'Tensão Secundária',
          tipo: 'number',
          unidade: 'kV',
          obrigatorio: true,
          descricao: 'Tensão do lado secundário'
        },
        {
          campo: 'Tipo de TAP',
          tipo: 'select',
          opcoes: ['Com Carga', 'Sem Carga'],
          obrigatorio: true,
          descricao: 'Tipo de comutador de tap'
        },
        {
          campo: 'Quantidade de TAPs',
          tipo: 'number',
          obrigatorio: true,
          descricao: 'Número total de posições de tap (ex: 7, 25, 34)'
        },
        {
          campo: 'Tensão Referência',
          tipo: 'number',
          unidade: 'kV',
          obrigatorio: false,
          descricao: 'Tensão de referência para o tap (ex: 30 kV)'
        },
        {
          campo: 'TAP Referência',
          tipo: 'number',
          obrigatorio: false,
          descricao: 'Posição de tap de referência (ex: 4)'
        },
        {
          campo: 'Frequência',
          tipo: 'number',
          unidade: 'Hz',
          obrigatorio: false,
          valor_padrao: 60,
          descricao: 'Frequência nominal'
        },
        {
          campo: 'Grupo de Ligação',
          tipo: 'text',
          obrigatorio: false,
          descricao: 'Grupo de ligação (ex: Dyn1, Dyn11, Yyn0)'
        },
        {
          campo: 'Impedância',
          tipo: 'number',
          unidade: '%',
          obrigatorio: false,
          descricao: 'Impedância percentual'
        },
        {
          campo: 'Perdas em Vazio',
          tipo: 'number',
          unidade: 'W',
          obrigatorio: false,
          descricao: 'Perdas em vazio'
        },
        {
          campo: 'Perdas em Carga',
          tipo: 'number',
          unidade: 'W',
          obrigatorio: false,
          descricao: 'Perdas totais em carga'
        },
        {
          campo: 'Tipo de Resfriamento',
          tipo: 'select',
          opcoes: ['ONAN', 'ONAF', 'OFAF', 'OFWF'],
          obrigatorio: false,
          descricao: 'Tipo de sistema de resfriamento'
        },
        {
          campo: 'Peso Total',
          tipo: 'number',
          unidade: 'kg',
          obrigatorio: false,
          descricao: 'Peso total do transformador'
        },
        {
          campo: 'Volume de Óleo',
          tipo: 'number',
          unidade: 'L',
          obrigatorio: false,
          descricao: 'Volume de óleo isolante'
        }
      ]
    };

    console.log('\n📝 Novo schema a ser aplicado:');
    console.log(JSON.stringify(novoSchema, null, 2));

    // 3. Atualizar o tipo de equipamento
    const atualizado = await prisma.tipos_equipamentos.update({
      where: { codigo: 'TRANSFORMADOR' },
      data: {
        propriedades_schema: novoSchema,
      },
    });

    console.log('\n✅ Schema do Transformador atualizado com sucesso!');
    console.log('📊 Campos técnicos adicionados:');
    novoSchema.campos.forEach((campo, index) => {
      const obr = campo.obrigatorio ? '(obrigatório)' : '(opcional)';
      const unid = campo.unidade ? ` [${campo.unidade}]` : '';
      const tipo = campo.tipo === 'select' ? ` - opções: ${campo.opcoes.join(', ')}` : '';
      console.log(`  ${index + 1}. ${campo.campo}${unid} ${obr}${tipo}`);
    });

    // 4. Verificar equipamentos existentes do tipo TRANSFORMADOR
    const equipamentos = await prisma.equipamentos.count({
      where: { tipo_equipamento_id: transformador.id }
    });

    if (equipamentos > 0) {
      console.log(`\n⚠️  Atenção: Existem ${equipamentos} equipamento(s) do tipo TRANSFORMADOR no banco.`);
      console.log('   Os campos técnicos existentes serão preservados.');
      console.log('   Novos equipamentos terão os campos atualizados disponíveis.');
    }

    console.log('\n🎉 Atualização concluída!');
  } catch (error) {
    console.error('\n❌ Erro ao atualizar schema:', error);
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
