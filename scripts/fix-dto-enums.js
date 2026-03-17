const fs = require('fs');
const path = require('path');

const dtoPath = path.join(__dirname, '..', 'src', 'modules', 'solicitacoes-servico', 'dto', 'create-solicitacao.dto.ts');
let content = fs.readFileSync(dtoPath, 'utf8');

// Remove local enum definitions and import from Prisma
content = content.replace(
  /export enum TipoSolicitacaoServico \{[\s\S]*?\}\s+export enum PrioridadeSolicitacao \{[\s\S]*?\}\s+export enum OrigemSolicitacao \{[\s\S]*?\}\s+export enum StatusSolicitacaoServico \{[\s\S]*?\}/,
  ``
);

// Add import from Prisma
content = content.replace(
  /} from 'class-validator';/,
  `} from 'class-validator';
import {
  TipoSolicitacaoServico,
  PrioridadeSolicitacao,
  OrigemSolicitacao,
  StatusSolicitacaoServico,
} from '@prisma/client';`
);

fs.writeFileSync(dtoPath, content);
console.log('✅ Fixed DTO to use Prisma enums');
