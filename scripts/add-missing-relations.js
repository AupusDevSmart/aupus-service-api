const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

// Adicionar relação categoria em tipos_equipamentos
const tiposEquipamentosOld = `model tipos_equipamentos {
  id                  String         @id @db.Char(26)
  codigo              String         @unique @db.VarChar(50)
  nome                String         @db.VarChar(100)
  largura_padrao      Int            @default(32)
  altura_padrao       Int            @default(32)
  icone_svg           String?
  propriedades_schema Json?
  created_at          DateTime       @default(now())
  updated_at          DateTime       @updatedAt
  categoria_id        String         @db.Char(26)
  fabricante          String         @db.VarChar(100)
  mqtt_schema         Json?
  equipamentos        equipamentos[]

  @@index([categoria_id])
  @@index([fabricante])
}`;

const tiposEquipamentosNew = `model tipos_equipamentos {
  id                  String                   @id @db.Char(26)
  codigo              String                   @unique @db.VarChar(50)
  nome                String                   @db.VarChar(100)
  largura_padrao      Int                      @default(32)
  altura_padrao       Int                      @default(32)
  icone_svg           String?
  propriedades_schema Json?
  created_at          DateTime                 @default(now())
  updated_at          DateTime                 @updatedAt
  categoria_id        String                   @db.Char(26)
  fabricante          String                   @db.VarChar(100)
  mqtt_schema         Json?
  categoria           categorias_equipamentos  @relation(fields: [categoria_id], references: [id])
  equipamentos        equipamentos[]

  @@index([categoria_id])
  @@index([fabricante])
}`;

schema = schema.replace(tiposEquipamentosOld, tiposEquipamentosNew);

fs.writeFileSync(schemaPath, schema);
console.log('✅ Relação categoria adicionada em tipos_equipamentos');
