-- CreateIndex
CREATE INDEX "candle_instrumentId_interval_openTime_idx" ON "candle"("instrumentId", "interval", "openTime" DESC);

-- D13: store and compare times in UTC regardless of the server's local zone (columns are timestamptz).
DO $$ BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
END $$;

-- Candle sanity: high/low bound the open/close, close time follows open time.
ALTER TABLE "candle"
  ADD CONSTRAINT "candle_ohlc_bounds" CHECK ("low" <= LEAST("open", "close") AND "high" >= GREATEST("open", "close")),
  ADD CONSTRAINT "candle_time_order" CHECK ("closeTime" > "openTime");
