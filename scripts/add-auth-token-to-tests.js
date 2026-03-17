const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'test', 'solicitacoes-servico.e2e-spec.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Add import for auth helper
content = content.replace(
  /import { APP_GUARD } from '@nestjs\/core';/,
  `import { APP_GUARD } from '@nestjs/core';
import { generateMockToken } from './helpers/auth.helper';`
);

// Add token variable
content = content.replace(
  /let equipamentoId: string;/,
  `let equipamentoId: string;
  let authToken: string;`
);

// Generate token in beforeAll
content = content.replace(
  /await app\.init\(\);/,
  `await app.init();

    // Generate auth token for tests
    authToken = generateMockToken();`
);

// Remove guard override since we'll use real JWT
content = content.replace(
  /\.overrideGuard\(JwtAuthGuard\)[\s\S]*?\.useValue\(\{[\s\S]*?canActivate: \(\) => true,[\s\S]*?\}\)[\s\S]*?(?=\.compile)/,
  ``
);

// Add .set('Authorization') to all requests - this is complex, let me do it step by step
// For POST requests
content = content.replace(
  /request\(app\.getHttpServer\(\)\)\s+\.post\(/g,
  `request(app.getHttpServer())
        .post(`
);

// Insert .set after .post
content = content.replace(
  /\.post\(([^\)]+)\)/g,
  `.post($1)
        .set('Authorization', \`Bearer \${authToken}\`)`
);

// For GET requests
content = content.replace(
  /\.get\(([^\)]+)\)/g,
  `.get($1)
        .set('Authorization', \`Bearer \${authToken}\`)`
);

// For PATCH requests
content = content.replace(
  /\.patch\(([^\)]+)\)/g,
  `.patch($1)
        .set('Authorization', \`Bearer \${authToken}\`)`
);

fs.writeFileSync(filePath, content);
console.log('✅ Added auth token to all test requests');
