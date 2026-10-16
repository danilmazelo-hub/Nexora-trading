-- CreateEnum
CREATE TYPE "Market" AS ENUM ('crypto', 'stocks', 'indices', 'forex', 'commodities');

-- CreateEnum
CREATE TYPE "InstrumentStatus" AS ENUM ('ACTIVE', 'UNAVAILABLE', 'DISABLED');

-- CreateTable
CREATE TABLE "instrument" (
    "id" VARCHAR(32) NOT NULL,
    "market" "Market" NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "baseAsset" VARCHAR(16) NOT NULL,
    "quoteAsset" VARCHAR(16) NOT NULL,
    "tickSize" DECIMAL(38,18) NOT NULL,
    "quantityStep" DECIMAL(38,18) NOT NULL,
    "contractMultiplier" DECIMAL(38,18) NOT NULL,
    "maxLeverage" INTEGER NOT NULL,
    "categories" TEXT[],
    "unit" VARCHAR(16),
    "status" "InstrumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" VARCHAR(32) NOT NULL,
    "refPrice" DECIMAL(38,18) NOT NULL,
    "dailyVolatility" DECIMAL(10,6) NOT NULL,
    "liquidityUsd" DECIMAL(24,0) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "instrument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "instrument_market_status_sortOrder_idx" ON "instrument"("market", "status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "instrument_market_symbol_key" ON "instrument"("market", "symbol");

-- D04 invariants enforced by the database: units must be positive.
ALTER TABLE "instrument"
  ADD CONSTRAINT "instrument_tick_size_positive" CHECK ("tickSize" > 0),
  ADD CONSTRAINT "instrument_quantity_step_positive" CHECK ("quantityStep" > 0),
  ADD CONSTRAINT "instrument_multiplier_positive" CHECK ("contractMultiplier" > 0),
  ADD CONSTRAINT "instrument_max_leverage_positive" CHECK ("maxLeverage" >= 1),
  ADD CONSTRAINT "instrument_ref_price_positive" CHECK ("refPrice" > 0);
