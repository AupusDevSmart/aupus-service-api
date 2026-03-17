const fs = require('fs');
const path = require('path');

async function fixSchemaEnum() {
  console.log('🔧 Fixing StatusSolicitacaoServico enum in schema.prisma...\n');

  const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');

  try {
    // Read the schema file
    let schemaContent = fs.readFileSync(schemaPath, 'utf8');

    // Find and replace the enum
    const oldEnum = `enum StatusSolicitacaoServico {
  RASCUNHO
  AGUARDANDO
  EM_ANALISE
  APROVADA
  REJEITADA
  CANCELADA
  OS_GERADA
  CONCLUIDA
}`;

    const newEnum = `enum StatusSolicitacaoServico {
  RASCUNHO
  AGUARDANDO
  EM_ANALISE
  APROVADA
  REJEITADA
  CANCELADA
  OS_GERADA
  EM_EXECUCAO
  CONCLUIDA
}`;

    if (schemaContent.includes(oldEnum)) {
      schemaContent = schemaContent.replace(oldEnum, newEnum);

      // Write the updated content back
      fs.writeFileSync(schemaPath, schemaContent, 'utf8');

      console.log('✅ StatusSolicitacaoServico enum updated successfully!');
      console.log('   Added: EM_EXECUCAO');
    } else if (schemaContent.includes('EM_EXECUCAO')) {
      console.log('✓ StatusSolicitacaoServico enum already contains EM_EXECUCAO');
    } else {
      console.log('⚠️ Could not find the exact enum to replace');
      console.log('   Please check the schema.prisma file manually');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

fixSchemaEnum();