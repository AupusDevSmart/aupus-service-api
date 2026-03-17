const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all DTO files
const dtoFiles = glob.sync('src/modules/solicitacoes-servico/dto/*.ts', {
  cwd: path.join(__dirname, '..'),
  absolute: true
});

dtoFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Replace imports from create-solicitacao.dto with imports from @prisma/client
  const replaced = content.replace(
    /import \{ (.*?) \} from '\.\/create-solicitacao\.dto';/g,
    (match, imports) => {
      // Check if the imports include enum names
      if (imports.match(/(StatusSolicitacaoServico|TipoSolicitacaoServico|PrioridadeSolicitacao|OrigemSolicitacao)/)) {
        return `import { ${imports} } from '@prisma/client';`;
      }
      return match;
    }
  );

  if (replaced !== content) {
    fs.writeFileSync(file, replaced);
    console.log(`✅ Fixed imports in ${path.basename(file)}`);
  }
});

console.log('Done!');
