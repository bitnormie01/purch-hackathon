// ─────────────────────────────────────────────────────────────
// search.ts — Vault search: one call per productType, returns
//             top results for skill, knowledge, and persona
// ─────────────────────────────────────────────────────────────

import type { ProductType, VaultItem, VaultSearchResponse } from "./types";

const BASE_URL = "https://api.purch.xyz";

/**
 * Searches the Purch Vault for items matching a query and product type.
 * Each call costs $0.01 USDC via x402 (handled transparently by fetchWithPay).
 *
 * @param query    - Natural language use case description
 * @param type     - Filter to a single product type
 * @param fetchFn  - The fetchWithPay function from wallet.ts
 * @param limit    - Max results to return (default 10)
 * @returns        - Array of VaultItems, sorted by relevance
 */
export async function searchVault(
  query: string,
  type: ProductType,
  fetchFn: typeof fetch,
  limit: number = 10
): Promise<VaultItem[]> {
  const url = new URL(`${BASE_URL}/x402/vault/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("productType", type);
  url.searchParams.set("limit", String(limit));

  console.log(`  🔍 Searching Vault: productType=${type}, q="${query}" ($0.01)`);

  try {
    const response = await fetchFn(url.toString());

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Vault search failed [${response.status}]: ${body}`);
    }

    const data = (await response.json()) as VaultSearchResponse;

    console.log(`     ↳ Found ${data.items.length} ${type}(s)`);

    return data.items;
  } catch (error) {
    console.error(`  ❌ Search failed for ${type}:`, (error as Error).message);
    return [];
  }
}

/**
 * Runs three parallel vault searches — one for each product type.
 * Returns a map of productType → VaultItem[].
 *
 * Total cost: 3 × $0.01 = $0.03 USDC
 */
export async function searchAllTypes(
  query: string,
  fetchFn: typeof fetch
): Promise<Record<ProductType, VaultItem[]>> {
  const types: ProductType[] = ["skill", "knowledge", "persona"];

  console.log("\n📡 Searching Purch Vault...\n");

  // Parallel search — all three fire simultaneously
  const results = await Promise.all(
    types.map((type) => searchVault(query, type, fetchFn))
  );

  return {
    skill: results[0],
    knowledge: results[1],
    persona: results[2],
  };
}
