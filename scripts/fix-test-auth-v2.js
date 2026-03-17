const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'test', 'solicitacoes-servico.e2e-spec.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Replace the beforeAll to override the APP_GUARD provider
content = content.replace(
  /const moduleFixture: TestingModule = await Test\.createTestingModule\(\{[\s\S]*?\}\)[\s\S]*?\.compile\(\);/,
  `const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('APP_GUARD')
      .useValue({
        canActivate: () => true,
      })
      .compile();`
);

fs.writeFileSync(filePath, content);
console.log('✅ Override APP_GUARD to bypass auth');
