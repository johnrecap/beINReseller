-- Commit these values before the following migration uses them in CHECK constraints.
-- Keep the already-published 20261013120000 migration unchanged for checksum continuity.
ALTER TYPE "FulfillmentAuthority" ADD VALUE IF NOT EXISTS 'AUTOMATED_REPORT';
ALTER TYPE "FulfillmentProofKind" ADD VALUE IF NOT EXISTS 'SOLD_REPORT_SAME_DAY';
ALTER TYPE "ProviderInvoiceClaimKind" ADD VALUE IF NOT EXISTS 'SOLD_REPORT_SAME_DAY';
