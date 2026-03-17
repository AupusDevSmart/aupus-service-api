const fs = require('fs');
const path = require('path');

const testPath = path.join(__dirname, '..', 'test', 'solicitacoes-servico.e2e-spec.ts');
let content = fs.readFileSync(testPath, 'utf8');

// Fix enum values - OUTROS -> OUTRO, MELHORIA -> MODIFICACAO
content = content.replace(/tipo: 'OUTROS'/g, "tipo: 'OUTRO'");
content = content.replace(/tipo: 'MELHORIA'/g, "tipo: 'MODIFICACAO'");

// Fix query params to be numbers instead of strings
content = content.replace(/page: 1, limit: 5/g, 'page: "1", limit: "5"');

fs.writeFileSync(testPath, content);
console.log('✅ Fixed enum values and query params in tests');
