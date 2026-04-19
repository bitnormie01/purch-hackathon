// ─────────────────────────────────────────────────────────────
// types.ts — All interfaces for the Auto-Equip Agent
// ─────────────────────────────────────────────────────────────

/** Purch Vault item as returned by GET /x402/vault/search */
export interface VaultItem {
  id: string;
  productType: ProductType;
  slug: string;
  title: string;
  cardDescription: string;
  price: number;
  category: VaultCategory;
  coverImageUrl: string;
  creator: {
    name: string;
    type: "human" | "agent";
  };
  downloads: number;
  featured: boolean;
}

/** The three product types available in Purch Vault */
export type ProductType = "skill" | "knowledge" | "persona";

/** Vault category enum values */
export type VaultCategory =
  | "marketing"
  | "development"
  | "automation"
  | "career"
  | "ios"
  | "productivity";

/** Response shape from GET /x402/vault/search */
export interface VaultSearchResponse {
  items: VaultItem[];
  nextCursor: string | null;
}

/** Response shape from POST /x402/vault/buy */
export interface VaultBuyResponse {
  purchaseId: string;
  downloadToken: string;
  item: {
    slug: string;
    title: string;
    productType: ProductType;
    price: number;
    coverImageUrl: string;
  };
}

/** Scoring result from scorer.ts — matches purchase-decision-scorer.md output schema */
export interface ScoreResult {
  compositeScore: number;
  proceedWithPurchase: boolean;
  confidenceLevel: "high" | "medium" | "low";
  reasoning: string;
  breakdown: {
    step1_priceScore: number;
    step2_vendorScore: number;
    step3_fitScore: number;
    step4_budgetScore: number;
    step5_bonus: number;
    hardFail: boolean;
  };
}

/** A vault item paired with its score */
export interface ScoredItem {
  item: VaultItem;
  score: ScoreResult;
}

/** The top pick for a single product type */
export interface TopPick {
  productType: ProductType;
  item: VaultItem;
  score: ScoreResult;
}

/** Structure for a single equipped asset in agent-config.json */
export interface EquippedAsset {
  slug: string;
  title: string;
  file: string;
  price: number;
  productType: ProductType;
}

/** The final agent-config.json shape */
export interface AgentConfig {
  generatedAt: string;
  useCase: string;
  totalCost: number;
  skill: EquippedAsset | null;
  knowledge: EquippedAsset | null;
  persona: EquippedAsset | null;
  searchCosts: number;
}

/** Environment configuration loaded from .env */
export interface EnvConfig {
  walletSecretKey: string;
  walletAddress: string;
  email: string;
  maxBudgetPerItem: number;
  userNeed: "essential" | "convenience" | "luxury";
}
