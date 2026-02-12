const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function applyMigration() {
  console.log('🔧 Applying label offset migration...\n');

  try {
    // Add label_offset_x and label_offset_y columns
    console.log('Step 1: Adding label_offset_x column...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "equipamentos"
      ADD COLUMN IF NOT EXISTS "label_offset_x" REAL;
    `);
    console.log('✅ label_offset_x added\n');

    console.log('Step 2: Adding label_offset_y column...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "equipamentos"
      ADD COLUMN IF NOT EXISTS "label_offset_y" REAL;
    `);
    console.log('✅ label_offset_y added\n');

    console.log('🎉 Migration completed successfully!');
    console.log('\nVerifying columns...');

    // Verify
    const result = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'equipamentos'
      AND column_name LIKE 'label%'
      ORDER BY column_name;
    `;

    console.log('\nLabel-related columns:');
    console.table(result);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration();
