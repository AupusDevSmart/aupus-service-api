const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'test', 'solicitacoes-servico.e2e-spec.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Simpl approach - just override the guard directly
content = content.replace(
  /const mockAuthGuard = \{[\s\S]*?\};[\s\S]*?const moduleFixture: TestingModule = await Test\.createTestingModule\(\{[\s\S]*?\}\)[\s\S]*?\.overrideProvider\(APP_GUARD\)[\s\S]*?\.useValue\(mockAuthGuard\)[\s\S]*?\.compile\(\);/,
  `const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile();`
);

fs.writeFileSync(filePath, content);
console.log('✅ Simplified test - override guard directly');
