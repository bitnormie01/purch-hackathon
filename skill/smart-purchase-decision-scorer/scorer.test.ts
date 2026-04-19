import { runScorer, ScorerInput, ScorerOutput } from "./scorer";

describe("Smart Purchase Decision Scorer", () => {
  // ── Passing scenario ──
  it("passing scenario: compositeScore >= 65, proceedWithPurchase true", () => {
    const input: ScorerInput = {
      productName: "Acme Widget",
      price: 12.99,
      category: "electronics",
      vendorName: "Acme Tools",
      userBudget: 50.0,
      userNeed: "convenience",
    };

    const result = runScorer(input);

    expect(result.proceedWithPurchase).toBe(true);
    expect(result.compositeScore).toBeGreaterThanOrEqual(65);
    expect(result.confidenceLevel).toBe("high");
    expect(result.failureReason).toBeNull();
    expect(result.stepBreakdown).toHaveLength(5);
    expect(result.stepBreakdown[0].name).toBe("Price Sanity Check");
    expect(result.stepBreakdown[1].name).toBe("Vendor Legitimacy Audit");
    expect(result.stepBreakdown[2].name).toBe("Need-Price Fit Analysis");
    expect(result.stepBreakdown[3].name).toBe("Budget Guardrail");
    expect(result.stepBreakdown[4].name).toBe("Composite Scoring");
  });

  // ── Budget exceeded hardFail ──
  it("budget exceeded: hardFail, proceedWithPurchase false", () => {
    const input: ScorerInput = {
      productName: "Expensive Software",
      price: 450.0,
      category: "software",
      vendorName: "",
      userBudget: 400.0,
      userNeed: "essential",
    };

    const result = runScorer(input);

    expect(result.proceedWithPurchase).toBe(false);
    expect(result.stepBreakdown[3].score).toBe(0);
    expect(result.stepBreakdown[3].flag).toBe("BUDGET_EXCEEDED");
    expect(result.stepBreakdown[3].hardFail).toBe(true);
    expect(result.failureReason).toContain("BUDGET_EXCEEDED");
    expect(result.confidenceLevel).toBe("low");
  });

  // ── Free item ──
  it("free item: step1 = 100, step3 = 100, step4 = 100", () => {
    const input: ScorerInput = {
      productName: "Free Starter Pack",
      price: 0,
      category: "skill",
      vendorName: "Purch Official",
      userBudget: 10.0,
      userNeed: "convenience",
    };

    const result = runScorer(input);

    expect(result.stepBreakdown[0].score).toBe(100); // Price Sanity
    expect(result.stepBreakdown[2].score).toBe(100); // Need-Price Fit
    expect(result.stepBreakdown[3].score).toBe(100); // Budget Guardrail
    expect(result.proceedWithPurchase).toBe(true);
    expect(result.compositeScore).toBeGreaterThanOrEqual(90);
  });

  // ── Luxury + tight budget → LUXURY_BUDGET_TENSION ──
  it("luxury + tight budget: LUXURY_BUDGET_TENSION flag, score capped", () => {
    const input: ScorerInput = {
      productName: "Fancy Persona Pack",
      price: 8.0,
      category: "persona",
      vendorName: "Premium Creator",
      userBudget: 10.0,
      userNeed: "luxury",
    };

    const result = runScorer(input);

    const step3 = result.stepBreakdown[2];
    expect(step3.flag).toBe("LUXURY_BUDGET_TENSION");
    expect(step3.score).toBeLessThanOrEqual(20);
  });

  // ── Unknown vendor → VENDOR_UNKNOWN ──
  it("unknown vendor: VENDOR_UNKNOWN, step2 = 25", () => {
    const input: ScorerInput = {
      productName: "Mystery Skill",
      price: 5.0,
      category: "skill",
      vendorName: "",
      userBudget: 20.0,
      userNeed: "convenience",
    };

    const result = runScorer(input);

    expect(result.stepBreakdown[1].score).toBe(25);
    expect(result.stepBreakdown[1].flag).toBe("VENDOR_UNKNOWN");
  });

  // ── Zero budget + nonzero price → hardFail ──
  it("zero budget + nonzero price: hardFail", () => {
    const input: ScorerInput = {
      productName: "Budget Buster",
      price: 5.0,
      category: "skill",
      vendorName: "Legit Store",
      userBudget: 0,
      userNeed: "essential",
    };

    const result = runScorer(input);

    expect(result.proceedWithPurchase).toBe(false);
    expect(result.stepBreakdown[3].hardFail).toBe(true);
    expect(result.stepBreakdown[3].flag).toBe("BUDGET_EXCEEDED");
    expect(result.stepBreakdown[2].score).toBe(0); // fitRatio = Infinity
    expect(result.confidenceLevel).toBe("low");
  });

  // ── Input validation ──
  it("input validation: missing fields return INPUT_VALIDATION_FAILED", () => {
    const result = runScorer({
      productName: "",
      price: -1,
      category: "",
      vendorName: "",
      userBudget: -1,
      userNeed: "invalid" as any,
    });

    expect(result.proceedWithPurchase).toBe(false);
    expect(result.compositeScore).toBe(0);
    expect(result.failureReason).toContain("INPUT_VALIDATION_FAILED");
    expect(result.stepBreakdown).toHaveLength(0);
  });
});
