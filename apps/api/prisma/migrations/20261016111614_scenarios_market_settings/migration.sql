-- CreateEnum
CREATE TYPE "DemoScenario" AS ENUM ('STARTER', 'EMPTY_PORTFOLIO', 'QUOTES_UNAVAILABLE', 'OPERATION_FAILURE');

-- CreateEnum
CREATE TYPE "ClockMode" AS ENUM ('REALTIME', 'FIXED');

-- AlterTable
ALTER TABLE "demo_session" ADD COLUMN     "resetCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scenario" "DemoScenario" NOT NULL DEFAULT 'STARTER';

-- CreateTable
CREATE TABLE "market_settings" (
    "id" VARCHAR(16) NOT NULL DEFAULT 'default',
    "seed" INTEGER NOT NULL,
    "clockMode" "ClockMode" NOT NULL DEFAULT 'REALTIME',
    "fixedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "market_settings_pkey" PRIMARY KEY ("id")
);
