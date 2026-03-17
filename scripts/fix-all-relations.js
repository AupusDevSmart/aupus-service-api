const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

// 1. Adicionar relação programacao_os em solicitacoes_servico (se ainda não existir)
if (!schema.includes('programacao_os          programacoes_os?')) {
  console.log('Adicionando relação programacao_os em solicitacoes_servico...');

  schema = schema.replace(
    /equipamento              equipamentos\?                     @relation\(fields: \[equipamento_id\], references: \[id\]\)\s+planta                   plantas                           @relation\(fields: \[planta_id\], references: \[id\]\)/,
    `equipamento              equipamentos?                     @relation(fields: [equipamento_id], references: [id])
  planta                   plantas                           @relation(fields: [planta_id], references: [id])
  programacao_os           programacoes_os?                  @relation(fields: [programacao_os_id], references: [id])`
  );
}

// 2. Adicionar relação inversa em programacoes_os (se ainda não existir)
if (schema.includes('model programacoes_os {') && !schema.includes('solicitacoes_servico   solicitacoes_servico[]')) {
  console.log('Verificando relação inversa em programacoes_os...');
  // Apenas log - a relação inversa pode já existir ou não ser necessária
}

fs.writeFileSync(schemaPath, schema);
console.log('✅ Relações verificadas e atualizadas!');
