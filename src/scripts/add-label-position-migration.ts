import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🚀 Starting migration: Add label_position to equipamentos...');

    // Check if column already exists
    const checkColumn = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'equipamentos'
      AND column_name = 'label_position'
    `;

    if (checkColumn.length > 0) {
      console.log('✅ Column label_position already exists. Skipping migration.');
      return;
    }

    // Add the column
    await prisma.$executeRaw`
      ALTER TABLE equipamentos
      ADD COLUMN label_position VARCHAR(10) DEFAULT 'top'
    `;

    console.log('✅ Column label_position added successfully');

    // Add comment
    await prisma.$executeRaw`
      COMMENT ON COLUMN equipamentos.label_position IS 'Position of the equipment label in diagram: top, bottom, left, right'
    `;

    console.log('✅ Comment added to column');

    // Create index (optional, for better query performance)
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_equipamentos_label_position
      ON equipamentos(label_position)
    `;

    console.log('✅ Index created');

    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
