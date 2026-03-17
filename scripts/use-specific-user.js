const fs = require('fs');
const path = require('path');

const testPath = path.join(__dirname, '..', 'test', 'solicitacoes-servico.e2e-spec.ts');
let testContent = fs.readFileSync(testPath, 'utf8');

testContent = testContent.replace(
  /\/\/ Get a real user from database for auth token\s+const usuario = await prisma\.usuarios\.findFirst\({ where: { status: 'Ativo' } }\);/,
  `// Get specific admin user from database for auth token
    const usuario = await prisma.usuarios.findFirst({ where: { email: 'admin@email.com' } });`
);

fs.writeFileSync(testPath, testContent);
console.log('✅ Updated test to use specific admin user (admin@email.com)');
