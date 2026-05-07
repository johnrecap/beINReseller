const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SENSITIVE_KEYS = new Set([
  'sessionData',
  'cookies',
  'storageState',
  'viewState',
  '__VIEWSTATE',
  '__VIEWSTATEGENERATOR',
  '__EVENTVALIDATION',
]);

function redact(value) {
  if (!value) return { value, changed: false };

  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const redacted = redact(item);
      changed = changed || redacted.changed;
      return redacted.value;
    });
    return { value: items, changed };
  }

  if (typeof value === 'object') {
    let changed = false;
    const output = {};

    for (const [key, entry] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key)) {
        changed = true;
        continue;
      }

      const redacted = redact(entry);
      changed = changed || redacted.changed;
      output[key] = redacted.value;
    }

    return { value: output, changed };
  }

  return { value, changed: false };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const take = 200;
  let cursor;
  let scanned = 0;
  let changed = 0;

  do {
    const operations = await prisma.operation.findMany({
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      where: { NOT: { responseData: null } },
      select: { id: true, responseData: true },
      orderBy: { id: 'asc' },
    });

    for (const operation of operations) {
      scanned += 1;
      const redacted = redact(operation.responseData);
      if (!redacted.changed) continue;

      changed += 1;
      if (apply) {
        await prisma.operation.update({
          where: { id: operation.id },
          data: { responseData: redacted.value },
        });
      }
    }

    cursor = operations.length > 0 ? operations[operations.length - 1].id : undefined;
    if (operations.length < take) break;
  } while (cursor);

  console.log(`${apply ? 'Updated' : 'Would update'} ${changed} of ${scanned} operations`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
