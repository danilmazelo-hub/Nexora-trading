-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('MAIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "demo_session" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "demo_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_profile" (
    "sessionId" UUID NOT NULL,
    "displayName" VARCHAR(40) NOT NULL,
    "locale" VARCHAR(5) NOT NULL DEFAULT 'ru',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "demo_profile_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "kind" "AccountKind" NOT NULL DEFAULT 'MAIN',
    "currency" VARCHAR(10) NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "demo_session_tokenHash_key" ON "demo_session"("tokenHash");

-- CreateIndex
CREATE INDEX "demo_session_expiresAt_idx" ON "demo_session"("expiresAt");

-- CreateIndex
CREATE INDEX "account_sessionId_status_idx" ON "account"("sessionId", "status");

-- AddForeignKey
ALTER TABLE "demo_profile" ADD CONSTRAINT "demo_profile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "demo_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "demo_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
