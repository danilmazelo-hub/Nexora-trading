-- CreateTable
CREATE TABLE "quote" (
    "instrumentId" VARCHAR(32) NOT NULL,
    "source" VARCHAR(48) NOT NULL,
    "bid" DECIMAL(38,18),
    "ask" DECIMAL(38,18),
    "last" DECIMAL(38,18),
    "changePct" DECIMAL(20,8),
    "changePeriod" VARCHAR(16) NOT NULL,
    "observedAt" TIMESTAMPTZ(3),
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quote_pkey" PRIMARY KEY ("instrumentId","source")
);

-- CreateTable
CREATE TABLE "candle" (
    "instrumentId" VARCHAR(32) NOT NULL,
    "source" VARCHAR(48) NOT NULL,
    "interval" VARCHAR(4) NOT NULL,
    "openTime" TIMESTAMPTZ(3) NOT NULL,
    "closeTime" TIMESTAMPTZ(3) NOT NULL,
    "open" DECIMAL(38,18) NOT NULL,
    "high" DECIMAL(38,18) NOT NULL,
    "low" DECIMAL(38,18) NOT NULL,
    "close" DECIMAL(38,18) NOT NULL,
    "volume" DECIMAL(38,8) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candle_pkey" PRIMARY KEY ("instrumentId","source","interval","openTime")
);

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candle" ADD CONSTRAINT "candle_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
