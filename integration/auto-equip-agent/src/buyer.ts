// ─────────────────────────────────────────────────────────────
// buyer.ts — Buy + download flow for Vault items
//
// 1. Probe /x402/vault/buy for 402 challenge price (drift check)
// 2. POST /x402/vault/buy via fetchWithPay → { purchaseId, downloadToken }
// 3. GET  /x402/vault/download/:purchaseId → ZIP file
// 4. Save ZIP to ./downloads/<slug>.zip
// ─────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import type { VaultItem, VaultBuyResponse, EquippedAsset } from "./types";
import { scoreItem } from "./scorer";

const BASE_URL = "https://api.purch.xyz";
const DOWNLOADS_DIR = path.resolve(process.cwd(), "downloads");

function ensureDownloadsDir(): void {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }
}

export async function buyAndDownload(
  item: VaultItem,
  walletAddress: string,
  email: string,
  fetchFn: typeof fetch,
  maxBudget: number = 5.0,
  userNeed: "essential" | "convenience" | "luxury" = "convenience"
): Promise<EquippedAsset | null> {
  ensureDownloadsDir();

  // ── Step 1a: Probe for the real 402 price BEFORE paying ──
  try {
    const probeResponse = await fetch(`${BASE_URL}/x402/vault/buy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: item.slug, walletAddress, email }),
    });

    if (probeResponse.status === 402) {
      try {
        const challenge = (await probeResponse.json()) as Record<string, any>;
        const challengePrice = challenge?.amount ?? challenge?.paymentRequired?.price;

        if (challengePrice != null && item.price > 0) {
          const drift = Math.abs(challengePrice - item.price) / item.price;

          if (drift > 0.05) {
            console.log(`  ⚠️  Price drifted ${(drift * 100).toFixed(1)}% ($${item.price} → $${challengePrice}) — re-scoring...`);
            const reScore = scoreItem({ ...item, price: challengePrice }, maxBudget, userNeed);
            if (!reScore.proceedWithPurchase) {
              console.log(`  ❌ Re-score blocked purchase at new price $${challengePrice}`);
              return null;
            }
            console.log(`  ✓  Re-score passed at $${challengePrice} (${reScore.compositeScore}/100)`);
          }
        }
      } catch {
        // 402 body not parseable — proceed with original price
      }
    }
  } catch {
    // Probe failed — proceed with the buy anyway
  }

  // ── Step 1b: Buy via fetchWithPay ──
  console.log(`\n  🛒  Buying "${item.title}" (${item.slug}) for $${item.price} USDC...`);

  let buyResult: VaultBuyResponse;
  try {
    const buyResponse = await fetchFn(`${BASE_URL}/x402/vault/buy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: item.slug,
        walletAddress,
        email,
      }),
    });

    if (!buyResponse.ok) {
      const body = await buyResponse.text();
      throw new Error(`Buy failed [${buyResponse.status}]: ${body}`);
    }

    buyResult = (await buyResponse.json()) as VaultBuyResponse;
    console.log(`      ✅ Bought "${buyResult.item.title}" — purchase ${buyResult.purchaseId}`);
  } catch (error) {
    console.error(`      ❌ Buy failed for "${item.title}":`, (error as Error).message);
    return null;
  }

  // ── Step 2: Download IMMEDIATELY after buy ──
  const downloadUrl = new URL(
    `${BASE_URL}/x402/vault/download/${encodeURIComponent(buyResult.purchaseId)}`
  );
  downloadUrl.searchParams.set("downloadToken", buyResult.downloadToken);

  console.log(`      📥 Downloading ZIP ($0.01)...`);

  try {
    const downloadResponse = await fetchFn(downloadUrl.toString());

    if (!downloadResponse.ok) {
      const body = await downloadResponse.text();
      throw new Error(`Download failed [${downloadResponse.status}]: ${body}`);
    }

    const zipBuffer = Buffer.from(await downloadResponse.arrayBuffer());
    const zipPath = path.join(DOWNLOADS_DIR, `${item.slug}.zip`);
    const tmpPath = zipPath + ".tmp";
    fs.writeFileSync(tmpPath, zipBuffer);
    fs.renameSync(tmpPath, zipPath);

    const sizeMB = (zipBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`      💾 Saved: ${zipPath} (${sizeMB} MB)`);

    return {
      slug: item.slug,
      title: buyResult.item.title,
      file: `./downloads/${item.slug}.zip`,
      price: buyResult.item.price,
      productType: item.productType,
    };
  } catch (error) {
    console.error(
      `      ❌ Download failed for "${item.title}":`,
      (error as Error).message
    );
    console.error(
      `      ⚠️  Payment was successful (purchase ${buyResult.purchaseId}). ` +
        "The downloadToken may have expired. Contact Purch support."
    );
    return null;
  }
}

export async function buyAllPicks(
  items: VaultItem[],
  walletAddress: string,
  email: string,
  fetchFn: typeof fetch,
  maxBudget: number = 5.0,
  userNeed: "essential" | "convenience" | "luxury" = "convenience"
): Promise<EquippedAsset[]> {
  const results: EquippedAsset[] = [];

  for (const item of items) {
    const asset = await buyAndDownload(item, walletAddress, email, fetchFn, maxBudget, userNeed);
    if (asset) {
      results.push(asset);
    }
  }

  return results;
}
