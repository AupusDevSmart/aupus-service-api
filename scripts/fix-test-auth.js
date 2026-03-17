const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'test', 'solicitacoes-servico.e2e-spec.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Add imports
content = content.replace(
  /import { Test, TestingModule } from '@nestjs\/testing';\s+import { INestApplication, ValidationPipe } from '@nestjs\/common';/,
  `import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';`
);

content = content.replace(
  /import { PrismaService } from '\.\.\/src\/shared\/prisma\/prisma\.service';/,
  `import { PrismaService } from '../src/shared/prisma/prisma.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';`
);

// Override guard
content = content.replace(
  /const moduleFixture: TestingModule = await Test\.createTestingModule\(\{\s+imports: \[AppModule\],\s+\}\)\.compile\(\);/,
  `const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: 'test-user-id', nome: 'Test User' }; // Mock user
          return true;
        },
      })
      .compile();`
);

fs.writeFileSync(filePath, content);
console.log('✅ Added JWT auth bypass for tests');
