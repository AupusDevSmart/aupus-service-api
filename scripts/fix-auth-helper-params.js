const fs = require('fs');
const path = require('path');

const helperPath = path.join(__dirname, '..', 'test', 'helpers', 'auth.helper.ts');
let content = fs.readFileSync(helperPath, 'utf8');

// Fix to use the passed parameters instead of hardcoded values
content = content.replace(
  /nome: 'Test User',\s+email: 'test@test\.com',/,
  `nome: userName,
    email: userEmail,`
);

fs.writeFileSync(helperPath, content);
console.log('✅ Fixed auth helper to use parameters correctly');
