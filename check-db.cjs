require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});
async function main() {
  const accounts = await prisma.beinAccount.findMany({
    select: { id: true, username: true, password: true, totpSecret: true, label: true }
  });
  console.log(JSON.stringify(accounts, null, 2));
  await prisma.$disconnect();
}
main().catch(console.error);
