-- CreateEnum
CREATE TYPE "LedgerSystemCode" AS ENUM ('DEMO_FUNDING', 'DEMO_PNL', 'FEES');

-- CreateEnum
CREATE TYPE "LedgerTxType" AS ENUM ('DEMO_FUNDING', 'DEMO_TEST_CREDIT', 'REVERSAL');

-- CreateTable
CREATE TABLE "ledger_account" (
    "id" UUID NOT NULL,
    "accountId" UUID,
    "systemCode" "LedgerSystemCode",
    "asset" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transaction" (
    "id" UUID NOT NULL,
    "scope" VARCHAR(64) NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "type" "LedgerTxType" NOT NULL,
    "memo" VARCHAR(200),
    "reversalOfId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "ledgerAccountId" UUID NOT NULL,
    "asset" VARCHAR(16) NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_account_id_asset_key" ON "ledger_account"("id", "asset");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_account_accountId_asset_key" ON "ledger_account"("accountId", "asset");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_account_systemCode_asset_key" ON "ledger_account"("systemCode", "asset");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transaction_reversalOfId_key" ON "ledger_transaction"("reversalOfId");

-- CreateIndex
CREATE INDEX "ledger_transaction_scope_createdAt_idx" ON "ledger_transaction"("scope", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transaction_scope_idempotencyKey_key" ON "ledger_transaction"("scope", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ledger_entry_ledgerAccountId_idx" ON "ledger_entry"("ledgerAccountId");

-- CreateIndex
CREATE INDEX "ledger_entry_transactionId_idx" ON "ledger_entry"("transactionId");

-- AddForeignKey
ALTER TABLE "ledger_account" ADD CONSTRAINT "ledger_account_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "ledger_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ledger_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_ledgerAccountId_asset_fkey" FOREIGN KEY ("ledgerAccountId", "asset") REFERENCES "ledger_account"("id", "asset") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- D05 ledger invariants enforced by PostgreSQL (the service checks them too, for clear errors).
-- ---------------------------------------------------------------------------------------------

-- A bucket belongs to exactly one owner: a user account OR a system counterpart.
ALTER TABLE "ledger_account" ADD CONSTRAINT "ledger_account_single_owner"
  CHECK (("accountId" IS NOT NULL) <> ("systemCode" IS NOT NULL));

-- Zero postings are meaningless.
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_amount_nonzero" CHECK ("amount" <> 0);

-- Every transaction must sum to zero separately for each asset. Deferred to COMMIT so all entries of
-- one transaction are inserted first; an unbalanced transaction is rolled back as a whole.
CREATE FUNCTION ledger_check_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  bad_asset text;
BEGIN
  SELECT e."asset" INTO bad_asset
    FROM "ledger_entry" e
   WHERE e."transactionId" = NEW."transactionId"
   GROUP BY e."asset"
  HAVING SUM(e."amount") <> 0
   LIMIT 1;
  IF bad_asset IS NOT NULL THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced for asset %', NEW."transactionId", bad_asset
      USING ERRCODE = 'check_violation', CONSTRAINT = 'ledger_entries_balanced';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "ledger_entries_balanced"
  AFTER INSERT ON "ledger_entry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_check_balanced();

-- Append-only: postings and transactions are never edited or deleted; corrections are reversals.
CREATE FUNCTION ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger is append-only: % on % is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $$;

CREATE TRIGGER "ledger_entry_append_only" BEFORE UPDATE OR DELETE ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
CREATE TRIGGER "ledger_transaction_append_only" BEFORE UPDATE OR DELETE ON "ledger_transaction"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
