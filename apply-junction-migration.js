const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function applyMigration() {
  console.log('🔧 Applying junction points migration...\n');

  try {
    // Step 1: Make columns nullable
    console.log('Step 1: Making equipamento_origem_id and equipamento_destino_id nullable...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "equipamentos_conexoes"
      ALTER COLUMN "equipamento_origem_id" DROP NOT NULL;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "equipamentos_conexoes"
      ALTER COLUMN "equipamento_destino_id" DROP NOT NULL;
    `);
    console.log('✅ Columns made nullable\n');

    // Step 2: Add origem columns
    console.log('Step 2: Adding origem junction point columns...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "equipamentos_conexoes"
      ADD COLUMN IF NOT EXISTS "origem_tipo" VARCHAR(20) DEFAULT 'equipamento';
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "equipamentos_conexoes"
      ADD COLUMN IF NOT EXISTS "origem_grid_x" INTEGER;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "equipamentos_conexoes"
      ADD COLUMN IF NOT EXISTS "origem_grid_y" INTEGER;
    `);
    console.log('✅ Origem columns added\n');

    // Step 3: Add destino columns
    console.log('Step 3: Adding destino junction point columns...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "equipamentos_conexoes"
      ADD COLUMN IF NOT EXISTS "destino_tipo" VARCHAR(20) DEFAULT 'equipamento';
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "equipamentos_conexoes"
      ADD COLUMN IF NOT EXISTS "destino_grid_x" INTEGER;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "equipamentos_conexoes"
      ADD COLUMN IF NOT EXISTS "destino_grid_y" INTEGER;
    `);
    console.log('✅ Destino columns added\n');

    // Step 4: Update existing records
    console.log('Step 4: Updating existing records with default values...');
    await prisma.$executeRawUnsafe(`
      UPDATE "equipamentos_conexoes"
      SET "origem_tipo" = 'equipamento'
      WHERE "origem_tipo" IS NULL;
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE "equipamentos_conexoes"
      SET "destino_tipo" = 'equipamento'
      WHERE "destino_tipo" IS NULL;
    `);
    console.log('✅ Existing records updated\n');

    console.log('🎉 Migration completed successfully!');
    console.log('\nVerifying columns...');

    // Verify
    const result = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'equipamentos_conexoes'
      AND column_name LIKE '%tipo%' OR column_name LIKE '%grid%'
      ORDER BY column_name;
    `;

    console.log('\nNew columns:');
    console.table(result);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration();
