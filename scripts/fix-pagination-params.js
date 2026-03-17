const fs = require('fs');
const path = require('path');

const testPath = path.join(__dirname, '..', 'test', 'solicitacoes-servico.e2e-spec.ts');
let content = fs.readFileSync(testPath, 'utf8');

// Change query params back to numbers
content = content.replace(/page: "1", limit: "5"/g, 'page: 1, limit: 5');

fs.writeFileSync(testPath, content);
console.log('✅ Fixed pagination params to use numbers');
