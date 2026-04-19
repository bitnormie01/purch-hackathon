// ─────────────────────────────────────────────────────────────
// wallet.ts — Loads wallet from .env, sets up x402 fetchWithPay
// ─────────────────────────────────────────────────────────────

import {
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
} from "@solana/kit";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactSvmScheme, SOLANA_MAINNET_CAIP2 } from "@x402/svm";
import bs58 from "bs58";
import dotenv from "dotenv";
import type { EnvConfig } from "./types";

dotenv.config();

/**
 * Loads and validates environment variables.
 * Fails fast with clear messages if anything is missing.
 */
export function loadEnvConfig(): EnvConfig {
  const walletSecretKey = process.env.WALLET_SECRET_KEY;
  const walletAddress = process.env.WALLET_ADDRESS;
  const email = process.env.EMAIL;
  const maxBudgetRaw = process.env.MAX_BUDGET_PER_ITEM;

  if (!walletSecretKey) {
    throw new Error(
      "Missing WALLET_SECRET_KEY in .env. " +
        "This must be your Solana wallet's base58-encoded secret key."
    );
  }

  if (!walletAddress) {
    throw new Error(
      "Missing WALLET_ADDRESS in .env. " +
        "This must be your Solana wallet's public address (base58)."
    );
  }

  if (!email) {
    throw new Error(
      "Missing EMAIL in .env. " +
        "Purch requires an email for purchase confirmations."
    );
  }

  const maxBudgetPerItem = maxBudgetRaw ? parseFloat(maxBudgetRaw) : 5.0;
  if (isNaN(maxBudgetPerItem) || maxBudgetPerItem <= 0) {
    throw new Error(
      `Invalid MAX_BUDGET_PER_ITEM: "${maxBudgetRaw}". Must be a positive number.`
    );
  }

  const needLevelRaw = process.env.NEED_LEVEL ?? "convenience";
  const validNeeds = ["essential", "convenience", "luxury"] as const;
  if (!validNeeds.includes(needLevelRaw as any)) {
    throw new Error(
      `Invalid NEED_LEVEL: "${needLevelRaw}". Must be one of: ${validNeeds.join(", ")}.`
    );
  }
  const userNeed = needLevelRaw as "essential" | "convenience" | "luxury";

  return { walletSecretKey, walletAddress, email, maxBudgetPerItem, userNeed };
}

/**
 * Creates a fetchWithPay function that wraps native fetch with
 * automatic x402 payment handling via Solana USDC.
 *
 * Every call through this function automatically:
 *  1. Detects 402 responses
 *  2. Signs a USDC transfer on Solana
 *  3. Retries the request with payment proof
 */
export async function createFetchWithPay(
  secretKeyBase58: string
): Promise<typeof fetch> {
  // Decode base58 secret key to Uint8Array
  const secretKeyBytes = bs58.decode(secretKeyBase58);

  // Support both common export formats:
  //   - 64 bytes: full Solana CLI keypair (priv + pub)
  //   - 32 bytes: Phantom / Solflare (private key only)
  let signer;
  if (secretKeyBytes.length === 64) {
    signer = await createKeyPairSignerFromBytes(secretKeyBytes);
  } else if (secretKeyBytes.length === 32) {
    signer = await createKeyPairSignerFromPrivateKeyBytes(secretKeyBytes);
  } else {
    throw new Error(
      `Wallet secret key must decode to 32 or 64 bytes. Got ${secretKeyBytes.length}. ` +
        "Phantom exports 32 bytes; Solana CLI keypairs are 64 bytes."
    );
  }

  // Set up the x402 client with the Solana payment scheme
  const client = new x402Client();
  client.register(SOLANA_MAINNET_CAIP2, new ExactSvmScheme(signer));

  // Wrap native fetch — all 402 payments are now automatic
  const fetchWithPay = wrapFetchWithPayment(fetch, client);

  return fetchWithPay;
}
