const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function addPermissionMetadata() {
  console.log('Adding display_name and description columns to permissions table...\n');

  try {
    // Add columns if they don't exist
    await prisma.$executeRawUnsafe(`
      ALTER TABLE permissions
      ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) NULL,
      ADD COLUMN IF NOT EXISTS description TEXT NULL;
    `);

    console.log('✅ Columns added successfully!\n');

    // Update existing permissions to have display_name = name
    const result = await prisma.$executeRawUnsafe(`
      UPDATE permissions
      SET display_name = name
      WHERE display_name IS NULL;
    `);

    console.log(`✅ Updated ${result} existing permissions with display_name\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

addPermissionMetadata();
