const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'test', 'solicitacoes-servico.e2e-spec.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Add APP_GUARD import
content = content.replace(
  /import { JwtAuthGuard } from '\.\.\/src\/modules\/auth\/guards\/jwt-auth\.guard';/,
  `import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { APP_GUARD } from '@nestjs/core';`
);

// Replace the beforeAll to override using APP_GUARD token
content = content.replace(
  /const moduleFixture: TestingModule = await Test\.createTestingModule\(\{[\s\S]*?\}\)[\s\S]*?\.compile\(\);/,
  `const mockAuthGuard = {
      canActivate: (context: ExecutionContext) => {
        const req = context.switchToHttp().getRequest();
        req.user = { id: 'test-user-id', nome: 'Test User' };
        return true;
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(APP_GUARD)
      .useValue(mockAuthGuard)
      .compile();`
);

fs.writeFileSync(filePath, content);
console.log('✅ Override APP_GUARD with token');
