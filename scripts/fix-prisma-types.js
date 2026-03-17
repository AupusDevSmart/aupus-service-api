const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'modules', 'solicitacoes-servico', 'solicitacoes-servico.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: update method - add type casting
content = content.replace(
  /data: updateDto,\s+include: {/,
  `data: updateDto as Prisma.solicitacoes_servicoUncheckedUpdateInput,
        include: {`
);

// Fix 2: adicionarComentario method - add type casting
content = content.replace(
  /const comentario = await this\.prisma\.comentarios_solicitacao_servico\.create\(\{\s+data: \{\s+solicitacao_id: id,\s+\.\.\.dto,\s+\},\s+\}\);/,
  `const comentario = await this.prisma.comentarios_solicitacao_servico.create({
      data: {
        solicitacao_id: id,
        ...dto,
      } as Prisma.comentarios_solicitacao_servicoUncheckedCreateInput,
    });`
);

// Fix 3: Remove programacao_os from findOne include (doesn't exist as relation)
content = content.replace(
  /programacao_os: true,\s+/,
  ''
);

fs.writeFileSync(filePath, content);
console.log('✅ Fixed Prisma type issues in solicitacoes-servico.service.ts');
