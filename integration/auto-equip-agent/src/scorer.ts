// ─────────────────────────────────────────────────────────────
// scorer.ts — Purchase decision scoring for Vault items
//
// Adapted from the Smart Purchase Decision Scorer workflow.
// Evaluates Vault items on four dimensions:
//   1. Value     — downloads per dollar (community signal)
//   2. Trust     — featured status + creator type
//   3. Quality   — cardDescription length/substance
//   4. Budget    — hard fail if price > user budget
// ─────────────────────────────────────────────────────────────

import type { VaultItem, ScoreResult, ScoredItem, TopPick, ProductType } from "./types";

/**
 * Scores a single Vault item against the budget ceiling.
 *
 * Score ranges:
 *   - compositeScore: 0–100
 *   - proceedWithPurchase: true if score >= 65 AND budget passes
 *
 * Weights:
 *   - Value:       40% (download volume relative to price)
 *   - Trust:       30% (featured + creator signals)
 *   - Description: 30% (content quality proxy)
 */
export function scoreItem(item: VaultItem, maxBudget: number): ScoreResult {
  // ── Budget Gate (hard fail) ──
  const budgetPass = item.price <= maxBudget;

  if (!budgetPass) {
    return {
      compositeScore: 0,
      proceedWithPurchase: false,
      reasoning: `BUDGET_FAIL: $${item.price} exceeds $${maxBudget} limit.`,
      breakdown: {
        valueScore: 0,
        trustScore: 0,
        descriptionScore: 0,
        budgetPass: false,
      },
    };
  }

  // ── Value Score (0–100) ──
  // Downloads per dollar, normalized.
  // 50+ downloads/dollar = perfect score. 0 downloads = floor of 10.
  const downloadsPerDollar = item.price > 0 ? item.downloads / item.price : item.downloads;
  const valueScore = Math.min(100, Math.max(10, downloadsPerDollar * 2));

  // ── Trust Score (0–100) ──
  // Base score of 40. Bonuses applied for trust signals.
  let trustScore = 40;

  if (item.featured) {
    trustScore += 30; // Curated by Purch team
  }

  if (item.creator.type === "agent") {
    trustScore += 15; // Agent-created items are purpose-built
  }

  if (item.downloads >= 10) {
    trustScore += 15; // Community-validated
  }

  trustScore = Math.min(100, trustScore);

  // ── Description Quality Score (0–100) ──
  // Length is a rough proxy for how well the creator documented the item.
  const descLen = (item.cardDescription || "").length;
  let descriptionScore: number;

  if (descLen === 0) {
    descriptionScore = 0; // No description = red flag
  } else if (descLen < 30) {
    descriptionScore = 20; // Minimal effort
  } else if (descLen < 50) {
    descriptionScore = 50; // Acceptable
  } else if (descLen < 120) {
    descriptionScore = 75; // Good
  } else {
    descriptionScore = 100; // Thorough
  }

  // ── Composite Score ──
  const compositeScore = Math.round(
    valueScore * 0.4 + trustScore * 0.3 + descriptionScore * 0.3
  );

  // ── Decision ──
  const proceedWithPurchase = compositeScore >= 65;

  // ── Reasoning ──
  const reasons: string[] = [];

  if (item.featured) reasons.push("✓ Featured by Purch");
  if (item.downloads >= 10) reasons.push(`✓ ${item.downloads} downloads (community-validated)`);
  if (descLen >= 50) reasons.push("✓ Well-documented");
  if (descLen < 30 && descLen > 0) reasons.push("⚠ Sparse description");
  if (descLen === 0) reasons.push("✗ No description");
  if (item.price === 0) reasons.push("✓ Free item");
  if (valueScore >= 60) reasons.push("✓ Strong value ratio");
  if (valueScore < 30) reasons.push("⚠ Low download-to-price ratio");

  const reasoning =
    reasons.length > 0
      ? reasons.join(" · ")
      : `Score: ${compositeScore}/100 — meets minimum threshold.`;

  return {
    compositeScore,
    proceedWithPurchase,
    reasoning,
    breakdown: {
      valueScore: Math.round(valueScore),
      trustScore,
      descriptionScore,
      budgetPass,
    },
  };
}

/**
 * Scores all items in a list and returns them sorted by composite score (desc).
 */
export function scoreAll(items: VaultItem[], maxBudget: number): ScoredItem[] {
  return items
    .map((item) => ({ item, score: scoreItem(item, maxBudget) }))
    .sort((a, b) => b.score.compositeScore - a.score.compositeScore);
}

/**
 * Given search results for all three product types, returns the top pick per type.
 * Returns null for a type if no items pass the scoring threshold.
 */
export function pickTopPerType(
  resultsByType: Record<ProductType, VaultItem[]>,
  maxBudget: number
): Record<ProductType, TopPick | null> {
  const types: ProductType[] = ["skill", "knowledge", "persona"];
  const picks: Record<ProductType, TopPick | null> = {
    skill: null,
    knowledge: null,
    persona: null,
  };

  for (const type of types) {
    const scored = scoreAll(resultsByType[type], maxBudget);
    const top = scored.find((s) => s.score.proceedWithPurchase);

    if (top) {
      picks[type] = {
        productType: type,
        item: top.item,
        score: top.score,
      };
    }
  }

  return picks;
}
