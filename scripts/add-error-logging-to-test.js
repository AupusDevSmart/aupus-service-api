const fs = require('fs');
const path = require('path');

const testPath = path.join(__dirname, '..', 'test', 'solicitacoes-servico.e2e-spec.ts');
let content = fs.readFileSync(testPath, 'utf8');

// Add error logging to the first POST test
content = content.replace(
  /\.expect\(201\)\s+\.then\(\(response\) => \{\s+expect\(response\.body\)\.toHaveProperty\('id'\);/,
  `.expect((res) => {
          if (res.status !== 201) {
            console.log('❌ Error response:', JSON.stringify(res.body, null, 2));
          }
        })
        .expect(201)
        .then((response) => {
          expect(response.body).toHaveProperty('id');`
);

fs.writeFileSync(testPath, content);
console.log('✅ Added error logging to test');
