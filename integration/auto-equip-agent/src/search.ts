// ─────────────────────────────────────────────────────────────
// search.ts — Vault search: one call per productType, returns
//             top results for skill, knowledge, and persona
// ─────────────────────────────────────────────────────────────

import type { ProductType, VaultItem, VaultSearchResponse } from "./types";

const BASE_URL = "https://api.purch.xyz";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const fetchResults = async (includeQuery: boolean): Promise<VaultItem[]> => {
    const url = new URL(`${BASE_URL}/x402/vault/search`);
    if (includeQuery) {
      url.searchParams.set("q", query);
    }
    url.searchParams.set("productType", type);
    url.searchParams.set("limit", String(limit));

    console.log(`  🌐 GET ${url.toString()}`);

    const response = await fetchFn(url.toString());

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Vault search failed [${response.status}]: ${body}`);
    }

    const data = (await response.json()) as VaultSearchResponse;
    return data.items;
  };

  console.log(`  🔍 Searching Vault: productType=${type}, q="${query}" ($0.01)`);

  try {
    let items = await fetchResults(true);
    console.log(`     ↳ Found ${items.length} ${type}(s) with q="${query}"`);

    if (items.length === 0) {
      console.log(`     ↳ No matches — retrying without q (browse all ${type}s)`);
      await sleep(300); // avoid back-to-back 429s
      items = await fetchResults(false);
      console.log(`     ↳ Found ${items.length} ${type}(s) in browse fallback`);
    }

    return items;
  } catch (error) {
    console.error(`  ❌ Search failed for ${type}:`, (error as Error).message);
    return [];
  }
}

/**
 * Runs three sequential vault searches — one for each product type,
 * with a 500ms delay between each to avoid 429 rate limits.
 * Returns a map of productType → VaultItem[].
 *
 * Total cost: 3 × $0.01 = $0.03 USDC
 */
export async function searchAllTypes(
  query: string,
  fetchFn: typeof fetch
): Promise<Record<ProductType, VaultItem[]>> {
  console.log("\n📡 Searching Purch Vault...\n");

  const skillResults = await searchVault(query, "skill", fetchFn);
  await sleep(500);
  const knowledgeResults = await searchVault(query, "knowledge", fetchFn);
  await sleep(500);
  const personaResults = await searchVault(query, "persona", fetchFn);

  return {
    skill: skillResults,
    knowledge: knowledgeResults,
    persona: personaResults,
  };
}
