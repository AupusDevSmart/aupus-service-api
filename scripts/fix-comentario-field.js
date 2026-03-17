const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'modules', 'solicitacoes-servico', 'solicitacoes-servico.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Fix comentario mapping - autor is required field, not usuario_nome
content = content.replace(
  /const comentario = await this\.prisma\.comentarios_solicitacao_servico\.create\(\{\s+data: \{\s+solicitacao_id: id,\s+\.\.\.dto,\s+\} as Prisma\.comentarios_solicitacao_servicoUncheckedCreateInput,\s+\}\);/,
  `const comentario = await this.prisma.comentarios_solicitacao_servico.create({
      data: {
        solicitacao_id: id,
        comentario: dto.comentario,
        autor: dto.usuario_nome,
        autor_id: dto.usuario_id,
      },
    });`
);

fs.writeFileSync(filePath, content);
console.log('✅ Fixed comentario field mapping (autor vs usuario_nome)');
