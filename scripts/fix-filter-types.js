const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'modules', 'solicitacoes-servico', 'solicitacoes-servico.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Fix filter type issues by adding type assertions
content = content.replace(
  /if \(tipo\) where\.tipo = tipo;/,
  `if (tipo) where.tipo = tipo as any;`
);

content = content.replace(
  /if \(origem\) where\.origem = origem;/,
  `if (origem) where.origem = origem as any;`
);

fs.writeFileSync(filePath, content);
console.log('✅ Fixed filter type issues');
