// ─────────────────────────────────────────────────────────────
// buyer.ts — Buy + download flow for Vault items
//
// 1. POST /x402/vault/buy  → { purchaseId, downloadToken }
// 2. GET  /x402/vault/download/:purchaseId → ZIP file
// 3. Save ZIP to ./downloads/<slug>.zip
// ─────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import type { VaultItem, VaultBuyResponse, EquippedAsset } from "./types";

const BASE_URL = "https://api.purch.xyz";
const DOWNLOADS_DIR = path.resolve(process.cwd(), "downloads");

/**
 * Ensures the downloads directory exists.
 */
function ensureDownloadsDir(): void {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }
}

/**
 * Purchases a single Vault item and downloads the ZIP.
 *
 * Costs:
 *   - Buy:      item.price USDC (x402)
 *   - Download:  $0.01 USDC (x402)
 *
 * @returns EquippedAsset with file path, or null on failure
 */
export async function buyAndDownload(
  item: VaultItem,
  walletAddress: string,
  email: string,
  fetchFn: typeof fetch
): Promise<EquippedAsset | null> {
  ensureDownloadsDir();

  // ── Step 1: Buy ──
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
  // downloadToken may expire — no processing between buy and download.
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

    // Save the ZIP file
    const zipBuffer = Buffer.from(await downloadResponse.arrayBuffer());
    const zipPath = path.join(DOWNLOADS_DIR, `${item.slug}.zip`);
    fs.writeFileSync(zipPath, zipBuffer);

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

/**
 * Purchases and downloads multiple items sequentially.
 * Returns the list of equipped assets (nulls filtered out).
 */
export async function buyAllPicks(
  items: VaultItem[],
  walletAddress: string,
  email: string,
  fetchFn: typeof fetch
): Promise<EquippedAsset[]> {
  const results: EquippedAsset[] = [];

  for (const item of items) {
    const asset = await buyAndDownload(item, walletAddress, email, fetchFn);
    if (asset) {
      results.push(asset);
    }
  }

  return results;
}
