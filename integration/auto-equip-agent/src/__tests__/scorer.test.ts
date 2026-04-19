import { scoreItem } from "../scorer";
import type { VaultItem } from "../types";

function makeItem(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: "test-id",
    productType: "skill",
    slug: "test-slug",
    title: "Test Item",
    cardDescription:
      "A solid, thoroughly documented description that explains exactly what this item does and why you should use it.",
    price: 1.0,
    category: "productivity",
    coverImageUrl: "https://example.com/cover.png",
    creator: { name: "test-creator", type: "human" },
    downloads: 25,
    featured: false,
    ...overrides,
  };
}

describe("scoreItem (5-step Purchase Decision Scorer)", () => {
  it("compositeScore never exceeds 100", () => {
    const item = makeItem({
      price: 0.01,
      creator: { name: "Trusted Vendor Co", type: "agent" },
    });
    const result = scoreItem(item, 100);
    expect(result.compositeScore).toBeLessThanOrEqual(100);
  });

  it("compositeScore never goes below 0", () => {
    const item = makeItem({
      price: 999,
      creator: { name: "", type: "human" },
    });
    const result = scoreItem(item, 1);
    expect(result.compositeScore).toBeGreaterThanOrEqual(0);
  });

  it("proceedWithPurchase is false when composite score < 65", () => {
    // Unknown vendor + high price relative to ceiling → low score
    const item = makeItem({
      price: 80,
      productType: "skill", // ceiling = $50
      creator: { name: "", type: "human" },
    });
    const result = scoreItem(item, 100);
    expect(result.compositeScore).toBeLessThan(65);
    expect(result.proceedWithPurchase).toBe(false);
  });

  it("proceedWithPurchase is true when composite score >= 65", () => {
    const item = makeItem({
      price: 1.0,
      productType: "skill",
      creator: { name: "Acme Tools", type: "human" },
    });
    const result = scoreItem(item, 100);
    expect(result.compositeScore).toBeGreaterThanOrEqual(65);
    expect(result.proceedWithPurchase).toBe(true);
  });

  it("budget hard fail: proceedWithPurchase always false when price > budget", () => {
    const item = makeItem({
      price: 100,
      creator: { name: "Acme Tools", type: "agent" },
    });
    const result = scoreItem(item, 5);
    expect(result.proceedWithPurchase).toBe(false);
    expect(result.breakdown.hardFail).toBe(true);
    expect(result.breakdown.step4_budgetScore).toBe(0);
    expect(result.reasoning).toMatch(/BUDGET_EXCEEDED/);
  });

  it("free item (price=0) does not cause division by zero", () => {
    const item = makeItem({ price: 0 });
    const result = scoreItem(item, 100);
    expect(Number.isFinite(result.compositeScore)).toBe(true);
    expect(Number.isNaN(result.compositeScore)).toBe(false);
    expect(result.breakdown.hardFail).toBe(false);
    expect(result.breakdown.step1_priceScore).toBe(100);
    expect(result.breakdown.step4_budgetScore).toBe(100);
  });

  it("unknown vendor scores low on step2", () => {
    const item = makeItem({ creator: { name: "", type: "human" } });
    const result = scoreItem(item, 100);
    expect(result.breakdown.step2_vendorScore).toBe(25);
  });

  it("luxury need level caps step3 when price > 30% of budget", () => {
    const item = makeItem({ price: 4.0, productType: "persona" });
    const result = scoreItem(item, 10, "luxury");
    expect(result.breakdown.step3_fitScore).toBeLessThanOrEqual(20);
  });

  it("consistency bonus: all steps >= 60 earns bonus", () => {
    const item = makeItem({
      price: 1.0,
      productType: "skill",
      creator: { name: "Verified Corp", type: "human" },
    });
    const result = scoreItem(item, 100, "convenience");
    // All steps should be >= 60 for a cheap item with a good vendor
    expect(result.breakdown.step5_bonus).toBeGreaterThan(0);
  });

  it("confidenceLevel is high when all steps >= 60 with no flags", () => {
    const item = makeItem({
      price: 1.0,
      creator: { name: "Verified Corp", type: "human" },
    });
    const result = scoreItem(item, 100);
    expect(result.confidenceLevel).toBe("high");
  });

  it("confidenceLevel is low when any step scores 0", () => {
    const item = makeItem({ price: 100 });
    const result = scoreItem(item, 5);
    expect(result.confidenceLevel).toBe("low");
  });
});
