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

describe("scoreItem", () => {
  it("compositeScore never exceeds 100", () => {
    // Stack every possible bonus: max downloads, featured, agent creator,
    // long description, very cheap price.
    const item = makeItem({
      price: 0.01,
      downloads: 100_000,
      featured: true,
      creator: { name: "bot", type: "agent" },
      cardDescription: "x".repeat(500),
    });
    const result = scoreItem(item, 100);
    expect(result.compositeScore).toBeLessThanOrEqual(100);
  });

  it("compositeScore never goes below 0", () => {
    // Worst case: no downloads, no description, not featured, human creator.
    const item = makeItem({
      downloads: 0,
      featured: false,
      cardDescription: "",
      creator: { name: "nobody", type: "human" },
    });
    const result = scoreItem(item, 100);
    expect(result.compositeScore).toBeGreaterThanOrEqual(0);
  });

  it("proceedWithPurchase is false when composite score < 65", () => {
    // No description (descScore=0), no downloads (valueScore=10),
    // not featured, human creator (trustScore=40).
    // Composite = 10*0.4 + 40*0.3 + 0*0.3 = 16 → below 65.
    const item = makeItem({
      downloads: 0,
      cardDescription: "",
      featured: false,
      creator: { name: "nobody", type: "human" },
    });
    const result = scoreItem(item, 100);
    expect(result.compositeScore).toBeLessThan(65);
    expect(result.proceedWithPurchase).toBe(false);
  });

  it("proceedWithPurchase is true when composite score >= 65", () => {
    // Featured + good downloads + long description → should clear 65.
    const item = makeItem({
      price: 1.0,
      downloads: 200,
      featured: true,
      creator: { name: "pro", type: "agent" },
      cardDescription:
        "This is a thoroughly-written description that clearly explains the item, its purpose, and the trade-offs involved in picking it.",
    });
    const result = scoreItem(item, 100);
    expect(result.compositeScore).toBeGreaterThanOrEqual(65);
    expect(result.proceedWithPurchase).toBe(true);
  });

  it("budget hard fail: proceedWithPurchase always false when price > budget", () => {
    // Even an otherwise-perfect item must fail if it exceeds the budget.
    const item = makeItem({
      price: 100,
      downloads: 10_000,
      featured: true,
      creator: { name: "pro", type: "agent" },
      cardDescription: "x".repeat(500),
    });
    const result = scoreItem(item, 5);
    expect(result.proceedWithPurchase).toBe(false);
    expect(result.breakdown.budgetPass).toBe(false);
    expect(result.reasoning).toMatch(/BUDGET_FAIL/);
  });

  it("featured item scores higher than non-featured identical item", () => {
    const base = makeItem({ featured: false });
    const featured = makeItem({ featured: true });
    const a = scoreItem(base, 100);
    const b = scoreItem(featured, 100);
    expect(b.compositeScore).toBeGreaterThan(a.compositeScore);
  });

  it("free item (price=0) does not cause division by zero", () => {
    const item = makeItem({ price: 0, downloads: 10 });
    const result = scoreItem(item, 100);
    expect(Number.isFinite(result.compositeScore)).toBe(true);
    expect(Number.isNaN(result.compositeScore)).toBe(false);
    expect(result.breakdown.budgetPass).toBe(true);
  });
});
