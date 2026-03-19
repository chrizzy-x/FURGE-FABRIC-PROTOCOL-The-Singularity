CREATE TABLE "ProtocolTokenState" (
    "id" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "maxSupply" DOUBLE PRECISION NOT NULL,
    "mintedSupply" DOUBLE PRECISION NOT NULL,
    "circulatingSupply" DOUBLE PRECISION NOT NULL,
    "currentReward" DOUBLE PRECISION NOT NULL,
    "halvingInterval" INTEGER NOT NULL,
    "nextHalvingAtBlock" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProtocolTokenState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProtocolTokenAccount" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "nonce" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProtocolTokenAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProtocolTokenEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "blockHeight" INTEGER,
    "fromAccountId" TEXT,
    "toAccountId" TEXT,
    "initiatorId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "feeAmount" DOUBLE PRECISION NOT NULL,
    "nonce" INTEGER,
    "supplyAfter" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL,
    CONSTRAINT "ProtocolTokenEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProtocolTokenAccount_ownerId_idx" ON "ProtocolTokenAccount"("ownerId");
CREATE INDEX "ProtocolTokenEvent_referenceId_idx" ON "ProtocolTokenEvent"("referenceId");
CREATE INDEX "ProtocolTokenEvent_createdAt_id_idx" ON "ProtocolTokenEvent"("createdAt", "id");
