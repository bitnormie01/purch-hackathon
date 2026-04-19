// ─────────────────────────────────────────────────────────────
// scorer.ts — Smart Purchase Decision Scorer
//
// Standalone reference implementation of the 5-step workflow
// defined in purchase-decision-scorer.md.
//
// Takes 6 inputs, returns the spec's output schema exactly.
// ─────────────────────────────────────────────────────────────

export interface ScorerInput {
  productName: string;
  price: number;
  category: string;
  vendorName: string;
  userBudget: number;
  userNeed: "essential" | "convenience" | "luxury";
}

export interface StepResult {
  step: number;
  name: string;
  score: number;
  reasoning: string;
  flag: string | null;
  hardFail?: boolean;
}

export interface ScorerOutput {
  compositeScore: number;
  proceedWithPurchase: boolean;
  confidenceLevel: "high" | "medium" | "low";
  stepBreakdown: StepResult[];
  failureReason: string | null;
}

const PRICE_CEILINGS: Record<string, number> = {
  skill: 50,
  persona: 30,
  knowledge: 75,
  electronics: 5000,
  apparel: 500,
  software: 300,
  subscription: 100,
};
const DEFAULT_CEILING = 1000;

const NEED_BANDS: Record<string, number> = {
  essential: 1.0,
  convenience: 0.5,
  luxury: 0.3,
};

export function runScorer(input: ScorerInput): ScorerOutput {
  // ── Input Validation Gate ──
  const missing: string[] = [];
  if (!input.productName || input.productName.length === 0) missing.push("productName");
  if (input.price == null || input.price < 0) missing.push("price");
  if (!input.category || input.category.length === 0) missing.push("category");
  if (input.vendorName == null) missing.push("vendorName");
  if (input.userBudget == null || input.userBudget < 0) missing.push("userBudget");
  if (!input.userNeed || !["essential", "convenience", "luxury"].includes(input.userNeed))
    missing.push("userNeed");

  if (missing.length > 0) {
    return {
      compositeScore: 0,
      proceedWithPurchase: false,
      confidenceLevel: "low",
      stepBreakdown: [],
      failureReason: `INPUT_VALIDATION_FAILED: ${missing.join(", ")} — missing or invalid`,
    };
  }

  const steps: StepResult[] = [];

  // ── Step 1 — Price Sanity Check (weight 0.25) ──
  let step1Score: number;
  let step1Flag: string | null = null;
  let step1Reasoning: string;

  if (input.price === 0) {
    step1Score = 100;
    step1Reasoning = "FREE_ITEM: No price risk. Proceed to vendor audit.";
  } else {
    const ceiling = PRICE_CEILINGS[input.category] ?? DEFAULT_CEILING;
    const priceRatio = input.price / ceiling;

    if (priceRatio <= 0.50) step1Score = 100;
    else if (priceRatio <= 0.80) step1Score = 80;
    else if (priceRatio <= 1.00) step1Score = 60;
    else if (priceRatio <= 1.20) step1Score = 30;
    else step1Score = 0;

    if (step1Score === 0) step1Flag = "PRICE_EXCEEDS_CEILING";

    step1Reasoning = `Price $${input.price.toFixed(2)} is ${(priceRatio * 100).toFixed(0)}% of $${ceiling.toFixed(2)} ${input.category} ceiling.`;

    if (input.price > 10000) {
      step1Flag = step1Flag
        ? `${step1Flag},HIGH_VALUE_TRANSACTION`
        : "HIGH_VALUE_TRANSACTION";
    }
  }

  steps.push({ step: 1, name: "Price Sanity Check", score: step1Score, reasoning: step1Reasoning, flag: step1Flag });

  // ── Step 2 — Vendor Legitimacy Audit (weight 0.20) ──
  let step2Score: number;
  let step2Flag: string | null = null;
  let step2Reasoning: string;

  if (!input.vendorName || input.vendorName.trim() === "") {
    step2Score = 25;
    step2Flag = "VENDOR_UNKNOWN";
    step2Reasoning = "UNKNOWN_VENDOR: No vendor identity provided. Elevated risk.";
  } else {
    let s = 0;
    if (input.vendorName.length >= 3) s += 20;
    if (!/^(test|fake|xxx|asdf|1234|unknown)$/i.test(input.vendorName)) s += 30;
    s += 30; // no local blocklist — default pass
    const legitimacyChecks = [
      input.vendorName.length >= 5,
      /^[a-zA-Z0-9\-& ]+$/.test(input.vendorName),
      !/\b(best|top|cheap|discount|deals)\b/i.test(input.vendorName),
    ].filter(Boolean).length;
    if (legitimacyChecks >= 2) s += 20;
    step2Score = Math.min(100, s);
    step2Reasoning = `Vendor '${input.vendorName}' scored ${step2Score}/100 on legitimacy heuristics.`;
    if (step2Score < 40) step2Flag = "VENDOR_HIGH_RISK";
  }

  steps.push({ step: 2, name: "Vendor Legitimacy Audit", score: step2Score, reasoning: step2Reasoning, flag: step2Flag });

  // ── Step 3 — Need-Price Fit Analysis (weight 0.20) ──
  const maxAcceptable = input.userBudget * NEED_BANDS[input.userNeed];
  let step3Score: number;
  let step3Flag: string | null = null;
  let step3Reasoning: string;

  if (input.price === 0) {
    step3Score = 100;
    step3Reasoning = "FREE_ITEM: No budget impact regardless of need category.";
  } else {
    const fitRatio =
      maxAcceptable === 0
        ? input.price > 0 ? Infinity : 0
        : input.price / maxAcceptable;

    if (fitRatio <= 0.50) step3Score = 100;
    else if (fitRatio <= 0.75) step3Score = 80;
    else if (fitRatio <= 1.00) step3Score = 60;
    else if (fitRatio <= 1.25) step3Score = 25;
    else step3Score = 0;

    if (step3Score === 0) step3Flag = "NEED_PRICE_MISMATCH";

    step3Reasoning = `Price is ${maxAcceptable > 0 ? (fitRatio * 100).toFixed(0) : "∞"}% of acceptable ${input.userNeed} spend ($${maxAcceptable.toFixed(2)}).`;

    if (input.userNeed === "luxury" && input.price > input.userBudget * 0.30) {
      step3Flag = "LUXURY_BUDGET_TENSION";
      step3Score = Math.min(step3Score, 20);
      step3Reasoning += " LUXURY_BUDGET_TENSION: large share of budget for a luxury.";
    }
  }

  steps.push({ step: 3, name: "Need-Price Fit Analysis", score: step3Score, reasoning: step3Reasoning, flag: step3Flag });

  // ── Step 4 — Budget Guardrail (weight 0.25, hard gate) ──
  const budgetPass = input.price <= input.userBudget;
  const step4Score = budgetPass ? 100 : 0;
  const hardFail = !budgetPass;
  let step4Flag: string | null = null;
  let step4Reasoning: string;

  if (input.price === 0) {
    step4Reasoning = "FREE_ITEM: $0 is within any budget.";
  } else if (budgetPass) {
    step4Reasoning = `Price $${input.price.toFixed(2)} within budget $${input.userBudget.toFixed(2)}.`;
  } else {
    const overagePercent =
      input.userBudget === 0
        ? Infinity
        : ((input.price - input.userBudget) / input.userBudget) * 100;
    step4Flag = "BUDGET_EXCEEDED";
    step4Reasoning = `Price $${input.price.toFixed(2)} exceeds budget $${input.userBudget.toFixed(2)} by ${overagePercent === Infinity ? "∞" : overagePercent.toFixed(1)}%.`;
  }

  steps.push({ step: 4, name: "Budget Guardrail", score: step4Score, reasoning: step4Reasoning, flag: step4Flag, hardFail });

  // ── Step 5 — Composite Scoring (weight 0.10 consistency bonus) ──
  const scores = [step1Score, step2Score, step3Score, step4Score];
  const stepsAbove60 = scores.filter((s) => s >= 60).length;
  const bonusRaw = stepsAbove60 === 4 ? 100 : stepsAbove60 === 3 ? 70 : stepsAbove60 === 2 ? 40 : 0;
  const bonus = bonusRaw * 0.10;

  const rawComposite =
    step1Score * 0.25 +
    step2Score * 0.20 +
    step3Score * 0.20 +
    step4Score * 0.25 +
    bonus;

  const compositeScore = Math.min(100, Math.max(0, Math.round(rawComposite)));

  let step5Reasoning: string;
  if (stepsAbove60 === 4) step5Reasoning = `All 4 steps scored >= 60. Consistency bonus: +${bonus.toFixed(0)} points.`;
  else if (stepsAbove60 === 3) step5Reasoning = `3 of 4 steps scored >= 60. Consistency bonus: +${bonus.toFixed(0)} points.`;
  else if (stepsAbove60 === 2) step5Reasoning = `2 of 4 steps scored >= 60. Consistency bonus: +${bonus.toFixed(0)} points.`;
  else step5Reasoning = "Fewer than 2 steps scored >= 60. No consistency bonus.";

  steps.push({ step: 5, name: "Composite Scoring", score: compositeScore, reasoning: step5Reasoning, flag: null });

  // ── Confidence Level ──
  const allFlags = steps.filter((s) => s.flag != null);
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

  // ── Proceed Decision ──
  const proceedWithPurchase = !hardFail && compositeScore >= 65;

  // ── Failure Reason ──
  let failureReason: string | null = null;
  if (!proceedWithPurchase) {
    if (hardFail) {
      failureReason = `BUDGET_EXCEEDED: ${step4Reasoning}`;
    } else {
      const lowestIdx = scores.indexOf(Math.min(...scores));
      const stepNames = ["Price Sanity Check", "Vendor Legitimacy Audit", "Need-Price Fit Analysis", "Budget Guardrail"];
      failureReason = `LOW_COMPOSITE_SCORE: Score ${compositeScore}/100 is below the 65-point procurement threshold. Primary weakness: ${stepNames[lowestIdx]} (${scores[lowestIdx]}/100).`;
    }
  }

  return {
    compositeScore,
    proceedWithPurchase,
    confidenceLevel,
    stepBreakdown: steps,
    failureReason,
  };
}
