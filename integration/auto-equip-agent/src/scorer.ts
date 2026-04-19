// ─────────────────────────────────────────────────────────────
// scorer.ts — Purchase Decision Scorer for Vault items
//
// Implements the exact 5-step workflow from
// skill/purchase-decision-scorer.md, adapted for Vault data.
//
// Field mapping (spec → Vault):
//   productName = item.title
//   price       = item.price
//   category    = item.productType
//   vendorName  = item.creator.name
//   userBudget  = maxBudget
//   userNeed    = needLevel (default "convenience")
// ─────────────────────────────────────────────────────────────

import type { VaultItem, ScoreResult, ScoredItem, TopPick, ProductType } from "./types";

const PRICE_CEILINGS: Record<string, number> = {
  skill: 50,
  persona: 30,
  knowledge: 75,
};

type NeedLevel = "essential" | "convenience" | "luxury";

const NEED_BANDS: Record<NeedLevel, number> = {
  essential: 1.0,
  convenience: 0.5,
  luxury: 0.3,
};

export function scoreItem(
  item: VaultItem,
  maxBudget: number,
  userNeed: NeedLevel = "convenience"
): ScoreResult {
  // ── Step 1 — Price Sanity Check (weight 0.25) ──
  let step1Score: number;
  let step1Flag: string | null = null;
  let step1Reasoning: string;

  if (item.price === 0) {
    step1Score = 100;
    step1Reasoning = "FREE_ITEM: No price risk. Proceed to vendor audit.";
  } else {
    const ceiling = PRICE_CEILINGS[item.productType] ?? 1000;
    const priceRatio = item.price / ceiling;

    if (priceRatio <= 0.50) step1Score = 100;
    else if (priceRatio <= 0.80) step1Score = 80;
    else if (priceRatio <= 1.00) step1Score = 60;
    else if (priceRatio <= 1.20) step1Score = 30;
    else step1Score = 0;

    if (step1Score === 0) step1Flag = "PRICE_EXCEEDS_CEILING";

    step1Reasoning = `Price $${item.price.toFixed(2)} is ${(priceRatio * 100).toFixed(0)}% of $${ceiling.toFixed(2)} ${item.productType} ceiling.`;

    if (item.price > 10000) {
      step1Flag = step1Flag
        ? `${step1Flag},HIGH_VALUE_TRANSACTION`
        : "HIGH_VALUE_TRANSACTION";
    }
  }

  // ── Step 2 — Vendor Legitimacy Audit (weight 0.20) ──
  const vendorName = item.creator?.name ?? "";
  let step2Score: number;
  let step2Flag: string | null = null;
  let step2Reasoning: string;

  if (!vendorName || vendorName.trim() === "") {
    step2Score = 25;
    step2Flag = "VENDOR_UNKNOWN";
    step2Reasoning = "UNKNOWN_VENDOR: No vendor identity provided. Elevated risk.";
  } else {
    let s = 0;
    if (vendorName.length >= 3) s += 20;
    if (!/^(test|fake|xxx|asdf|1234|unknown)$/i.test(vendorName)) s += 30;
    s += 30; // no local blocklist — default pass
    const legitimacyChecks = [
      vendorName.length >= 5,
      /^[a-zA-Z0-9\-& ]+$/.test(vendorName),
      !/\b(best|top|cheap|discount|deals)\b/i.test(vendorName),
    ].filter(Boolean).length;
    if (legitimacyChecks >= 2) s += 20;
    step2Score = Math.min(100, s);
    step2Reasoning = `Vendor '${vendorName}' scored ${step2Score}/100 on legitimacy heuristics.`;
    if (step2Score < 40) step2Flag = "VENDOR_HIGH_RISK";
  }

  // ── Step 3 — Need-Price Fit Analysis (weight 0.20) ──
  const maxAcceptable = maxBudget * NEED_BANDS[userNeed];
  let step3Score: number;
  let step3Flag: string | null = null;
  let step3Reasoning: string;

  if (item.price === 0) {
    step3Score = 100;
    step3Reasoning = "FREE_ITEM: No budget impact regardless of need category.";
  } else {
    const fitRatio =
      maxAcceptable === 0
        ? item.price > 0
          ? Infinity
          : 0
        : item.price / maxAcceptable;

    if (fitRatio <= 0.50) step3Score = 100;
    else if (fitRatio <= 0.75) step3Score = 80;
    else if (fitRatio <= 1.00) step3Score = 60;
    else if (fitRatio <= 1.25) step3Score = 25;
    else step3Score = 0;

    if (step3Score === 0) step3Flag = "NEED_PRICE_MISMATCH";

    step3Reasoning = `Price is ${maxAcceptable > 0 ? ((fitRatio * 100).toFixed(0)) : "∞"}% of acceptable ${userNeed} spend ($${maxAcceptable.toFixed(2)}).`;

    if (userNeed === "luxury" && item.price > maxBudget * 0.30) {
      step3Flag = "LUXURY_BUDGET_TENSION";
      step3Score = Math.min(step3Score, 20);
      step3Reasoning += " LUXURY_BUDGET_TENSION: large share of budget for a luxury.";
    }
  }

  // ── Step 4 — Budget Guardrail (weight 0.25, hard gate) ──
  const budgetPass = item.price <= maxBudget;
  const step4Score = budgetPass ? 100 : 0;
  const hardFail = !budgetPass;
  let step4Flag: string | null = null;
  let step4Reasoning: string;

  if (item.price === 0) {
    step4Reasoning = "FREE_ITEM: $0 is within any budget.";
  } else if (budgetPass) {
    step4Reasoning = `Price $${item.price.toFixed(2)} within budget $${maxBudget.toFixed(2)}.`;
  } else {
    const overagePercent =
      maxBudget === 0
        ? Infinity
        : (((item.price - maxBudget) / maxBudget) * 100);
    step4Flag = "BUDGET_EXCEEDED";
    step4Reasoning = `Price $${item.price.toFixed(2)} exceeds budget $${maxBudget.toFixed(2)} by ${overagePercent === Infinity ? "∞" : overagePercent.toFixed(1)}%.`;
  }

  // ── Step 5 — Composite Scoring (weight 0.10 consistency bonus) ──
  const scores = [step1Score, step2Score, step3Score, step4Score];
  const stepsAbove60 = scores.filter((s) => s >= 60).length;
  const bonus =
    stepsAbove60 === 4 ? 10 : stepsAbove60 === 3 ? 7 : stepsAbove60 === 2 ? 4 : 0;

  const rawComposite =
    step1Score * 0.25 +
    step2Score * 0.20 +
    step3Score * 0.20 +
    step4Score * 0.25 +
    bonus;

  const compositeScore = Math.min(100, Math.max(0, Math.round(rawComposite)));

  // Confidence level
  const allFlags = [step1Flag, step2Flag, step3Flag, step4Flag].filter(Boolean);
  let confidenceLevel: "high" | "medium" | "low";
  if (scores.some((s) => s === 0) || hardFail) {
    confidenceLevel = "low";
  } else if (allFlags.length > 0) {
    confidenceLevel = "medium";
  } else if (scores.every((s) => s >= 60)) {
    confidenceLevel = "high";
  } else {
    confidenceLevel = "medium";
  }

  // Proceed decision
  const proceedWithPurchase = !hardFail && compositeScore >= 65;

  // Reasoning
  let reasoning: string;
  if (hardFail) {
    reasoning = `BUDGET_EXCEEDED: ${step4Reasoning}`;
  } else if (!proceedWithPurchase) {
    const lowestIdx = scores.indexOf(Math.min(...scores));
    const stepNames = [
      "Price Sanity Check",
      "Vendor Legitimacy Audit",
      "Need-Price Fit Analysis",
      "Budget Guardrail",
    ];
    reasoning = `LOW_COMPOSITE_SCORE: Score ${compositeScore}/100 is below the 65-point procurement threshold. Primary weakness: ${stepNames[lowestIdx]} (${scores[lowestIdx]}/100).`;
  } else {
    const highlights: string[] = [];
    if (step1Score >= 80) highlights.push("✓ Price well within range");
    if (step2Score >= 80) highlights.push("✓ Vendor verified");
    if (step3Score >= 60) highlights.push("✓ Good need-price fit");
    if (step4Score === 100) highlights.push("✓ Within budget");
    if (bonus > 0) highlights.push(`✓ Consistency bonus +${bonus}`);
    reasoning = highlights.length > 0
      ? highlights.join(" · ")
      : `Score: ${compositeScore}/100 — meets procurement threshold.`;
  }

  return {
    compositeScore,
    proceedWithPurchase,
    confidenceLevel,
    reasoning,
    breakdown: {
      step1_priceScore: step1Score,
      step2_vendorScore: step2Score,
      step3_fitScore: step3Score,
      step4_budgetScore: step4Score,
      step5_bonus: bonus,
      hardFail,
    },
  };
}

export function scoreAll(
  items: VaultItem[],
  maxBudget: number,
  userNeed: NeedLevel = "convenience"
): ScoredItem[] {
  return items
    .map((item) => ({ item, score: scoreItem(item, maxBudget, userNeed) }))
    .sort((a, b) => b.score.compositeScore - a.score.compositeScore);
}

export function pickTopPerType(
  resultsByType: Record<ProductType, VaultItem[]>,
  maxBudget: number,
  userNeed: NeedLevel = "convenience"
): Record<ProductType, TopPick | null> {
  const types: ProductType[] = ["skill", "knowledge", "persona"];
  const picks: Record<ProductType, TopPick | null> = {
    skill: null,
    knowledge: null,
    persona: null,
  };

  for (const type of types) {
    const scored = scoreAll(resultsByType[type], maxBudget, userNeed);
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
