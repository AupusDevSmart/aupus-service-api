const fs = require('fs');
const path = require('path');

// Update auth helper to accept userId
const helperPath = path.join(__dirname, '..', 'test', 'helpers', 'auth.helper.ts');
let helperContent = fs.readFileSync(helperPath, 'utf8');

helperContent = helperContent.replace(
  /export function generateMockToken\(\): string \{[\s\S]*?sub: 'test-user-id',/,
  `export function generateMockToken(userId: string, userName: string = 'Test User', userEmail: string = 'test@test.com'): string {
  const payload = {
    sub: userId,`
);

helperContent = helperContent.replace(
  /tipo: 'ADMINISTRADOR',/,
  `role: 'ADMINISTRADOR',
    permissions: [],`
);

fs.writeFileSync(helperPath, helperContent);
console.log('✅ Updated auth helper to accept userId');

// Update test file to get userId from database
const testPath = path.join(__dirname, '..', 'test', 'solicitacoes-servico.e2e-spec.ts');
let testContent = fs.readFileSync(testPath, 'utf8');

testContent = testContent.replace(
  /await app\.init\(\);\s+\/\/ Generate auth token for tests\s+authToken = generateMockToken\(\);/,
  `await app.init();

    // Get a real user from database for auth token
    const usuario = await prisma.usuarios.findFirst({ where: { status: 'Ativo' } });
    if (!usuario) {
      throw new Error('No active user found in database for testing');
    }

    // Generate auth token for tests with real user
    authToken = generateMockToken(usuario.id, usuario.nome, usuario.email);`
);

fs.writeFileSync(testPath, testContent);
console.log('✅ Updated test to use real user ID from database');
