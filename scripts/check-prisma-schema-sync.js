const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const appSchemaPath = path.join(repoRoot, 'prisma', 'schema.prisma');
const workerSchemaPath = path.join(repoRoot, 'worker', 'prisma', 'schema.prisma');

function readNormalizedSchema(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

const appSchema = readNormalizedSchema(appSchemaPath);
const workerSchema = readNormalizedSchema(workerSchemaPath);

if (appSchema !== workerSchema) {
  console.error('Prisma schema mismatch detected.');
  console.error('Keep prisma/schema.prisma and worker/prisma/schema.prisma identical in the same commit.');
  process.exit(1);
}

console.log('Prisma schema sync check passed.');
