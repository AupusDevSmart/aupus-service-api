const fs = require('fs');
const path = require('path');

const testPath = path.join(__dirname, '..', 'test', 'solicitacoes-servico.e2e-spec.ts');
let content = fs.readFileSync(testPath, 'utf8');

// Enable transform in ValidationPipe
content = content.replace(
  /app\.useGlobalPipes\(new ValidationPipe\(\)\);/,
  `app.useGlobalPipes(new ValidationPipe({ transform: true }));`
);

fs.writeFileSync(testPath, content);
console.log('✅ Enabled transform in ValidationPipe for tests');
