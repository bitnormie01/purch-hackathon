# Smart Purchase Decision Scorer

> **Purch Vault Skill · v1.0.0**
> A deterministic evaluation workflow for autonomous agents to audit any purchase before committing funds via the Purch x402 payment protocol.

---

## 1. Skill Metadata

| Field         | Value                                                                                      |
| :------------ | :----------------------------------------------------------------------------------------- |
| **name**      | `smart-purchase-decision-scorer`                                                           |
| **version**   | `1.0.0`                                                                                    |
| **author**    | `0xjaadu`                                                                                  |
| **license**   | `MIT`                                                                                      |
| **description** | Evaluates a purchase opportunity across five weighted dimensions — price sanity, vendor legitimacy, need-price fit, budget compliance, and composite scoring — and returns a deterministic buy/no-buy decision with full reasoning. Designed to slot in as a pre-transaction guardrail in any Purch x402 agent workflow. |
| **tags**      | `purchase-evaluation`, `budget-guard`, `vendor-audit`, `x402`, `agentic-commerce`, `decision-engine`, `risk-scoring` |
| **category**  | `Skill`                                                                                    |
| **platform**  | `purch-vault`                                                                              |

---

## 2. Input Schema

All inputs are **required** unless marked otherwise. The agent MUST validate types and constraints before executing the workflow.

```jsonc
{
  "productName": {
    "type": "string",
    "minLength": 1,
    "description": "The display name of the product or Vault asset being evaluated."
  },
  "price": {
    "type": "number",
    "minimum": 0,
    "unit": "USD",
    "description": "The listed price of the product. May be 0 for free items."
  },
  "category": {
    "type": "string",
    "minLength": 1,
    "description": "Product category (e.g., 'electronics', 'skill', 'persona', 'knowledge', 'apparel')."
  },
  "vendorName": {
    "type": "string",
    "description": "Name of the vendor or publisher. May be empty string if unknown."
  },
  "userBudget": {
    "type": "number",
    "minimum": 0,
    "unit": "USD",
    "description": "The user's maximum spending limit for this transaction."
  },
  "userNeed": {
    "type": "string",
    "enum": ["essential", "convenience", "luxury"],
    "description": "The user's self-declared urgency category for this purchase."
  }
}
```

**Validation gate:** If any required field is missing or fails its type/constraint check, the skill MUST return immediately with:
```json
{
  "compositeScore": 0,
  "proceedWithPurchase": false,
  "confidenceLevel": "low",
  "stepBreakdown": [],
  "failureReason": "INPUT_VALIDATION_FAILED: <field> — <reason>"
}
```

---

## 3. Evaluation Workflow

The workflow executes **five sequential steps**. Each step produces a normalized score from 0–100 and a weight. The final composite score is the weighted sum.

| Step | Name                  | Weight |
| :--- | :-------------------- | :----- |
| 1    | Price Sanity Check    | 0.25   |
| 2    | Vendor Legitimacy Audit | 0.20 |
| 3    | Need-Price Fit Analysis | 0.20 |
| 4    | Budget Guardrail      | 0.25   |
| 5    | Composite Scoring     | 0.10   |

Total weight: **1.00**

---

### Step 1 — Price Sanity Check

**Objective:** Determine whether the listed price is within a reasonable range for its category.

**Logic:**

1. Define category-specific price ceilings (USD):

   | Category       | Ceiling |
   | :------------- | ------: |
   | `skill`        |   50.00 |
   | `persona`      |   30.00 |
   | `knowledge`    |   75.00 |
   | `electronics`  | 5000.00 |
   | `apparel`      |  500.00 |
   | `software`     |  300.00 |
   | `subscription` |  100.00 |
   | *(default)*    | 1000.00 |

2. Compute `priceRatio = price / categoryCeiling`.

3. Assign score:
   - `priceRatio <= 0.50` → **100** (well within range)
   - `0.50 < priceRatio <= 0.80` → **80**
   - `0.80 < priceRatio <= 1.00` → **60**
   - `1.00 < priceRatio <= 1.20` → **30** (exceeds ceiling by up to 20%)
   - `priceRatio > 1.20` → **0** (significantly over ceiling)

4. **Special case — price is 0:** Assign score **100**. Set reasoning: `"FREE_ITEM: No price risk. Proceed to vendor audit."`

**Pass threshold:** score >= 30
**Fail behavior:** If score is 0, flag `"PRICE_EXCEEDS_CEILING"` but do NOT abort — allow downstream steps to contribute.

**Output:**
```json
{
  "step": 1,
  "name": "Price Sanity Check",
  "score": <0-100>,
  "reasoning": "<string>",
  "flag": "<string | null>"
}
```

---

### Step 2 — Vendor Legitimacy Audit

**Objective:** Assess whether the vendor/publisher is trustworthy enough to transact with.

**Logic:**

1. **If `vendorName` is empty string or null:**
   - Assign score **25**.
   - Set reasoning: `"UNKNOWN_VENDOR: No vendor identity provided. Elevated risk."`.
   - Set flag: `"VENDOR_UNKNOWN"`.

2. **If `vendorName` is provided**, evaluate against the following heuristics:

   | Signal                                               | Score Modifier |
   | :--------------------------------------------------- | :------------- |
   | Vendor name length >= 3 characters                   | +20            |
   | Vendor name does not contain suspicious patterns*    | +30            |
   | Vendor name is not on a known blocklist**            | +30            |
   | Vendor name passes legitimacy check (see below)      | +20            |

   *Suspicious patterns:* strings matching regex `^(test|fake|xxx|asdf|1234|unknown)$` (case-insensitive).

   **Known blocklist:** Agent maintains a local blocklist. If none exists, this check scores +30 by default (no evidence of fraud).

   ***Legitimacy check:*** Vendor name passes if it meets **2 or more** of the following criteria. Score +20 if passes, +0 if fails. No partial credit.
   - Name length >= 5 characters.
   - Contains no special characters except hyphens (`-`) and ampersands (`&`).
   - Does not contain generic filler words: `best`, `top`, `cheap`, `discount`, `deals` (case-insensitive).
   - Does not consist entirely of random alphanumeric characters (i.e., does not match regex `^[a-zA-Z0-9]{6,}$` where no recognizable word segment of length >= 3 exists).

3. Cap the total score at **100**.

**Pass threshold:** score >= 40
**Fail behavior:** If score < 40, set flag `"VENDOR_HIGH_RISK"`.

**Output:**
```json
{
  "step": 2,
  "name": "Vendor Legitimacy Audit",
  "score": <0-100>,
  "reasoning": "<string>",
  "flag": "<string | null>"
}
```

---

### Step 3 — Need-Price Fit Analysis

**Objective:** Evaluate whether the price is justified relative to the user's declared need urgency.

**Logic:**

Define acceptable price bands per need category as a fraction of `userBudget`:

| userNeed       | Max Acceptable Spend (% of budget) | Tolerance Multiplier |
| :------------- | :--------------------------------- | :------------------- |
| `essential`    | 100%                               | 1.0                  |
| `convenience`  | 50%                                | 0.8                  |
| `luxury`       | 30%                                | 0.6                  |

1. Compute `maxAcceptable = userBudget * maxAcceptablePercent`.
2. Compute `fitRatio = price / maxAcceptable`.
   - If `maxAcceptable` is 0 (budget is $0), set `fitRatio = Infinity` (unless price is also 0, then `fitRatio = 0`).

3. Assign score:
   - `fitRatio <= 0.50` → **100**
   - `0.50 < fitRatio <= 0.75` → **80**
   - `0.75 < fitRatio <= 1.00` → **60**
   - `1.00 < fitRatio <= 1.25` → **25**
   - `fitRatio > 1.25` → **0**

4. **Luxury + tight budget flag:**
   If `userNeed == "luxury"` AND `price > userBudget * 0.30`, set flag `"LUXURY_BUDGET_TENSION"` and cap step score at **min(score, 20)** — the agent must surface this to the user.

**Pass threshold:** score >= 25
**Fail behavior:** If score is 0, set flag `"NEED_PRICE_MISMATCH"`.

**Output:**
```json
{
  "step": 3,
  "name": "Need-Price Fit Analysis",
  "score": <0-100>,
  "reasoning": "<string>",
  "flag": "<string | null>"
}
```

---

### Step 4 — Budget Guardrail

**Objective:** Hard compliance check — does the price fit within the user's stated budget?

**This is a binary gate.** Unlike other steps, a failure here forces `proceedWithPurchase = false` regardless of composite score.

**Logic:**

1. If `price <= userBudget` → score **100**, pass.
2. If `price > userBudget`:
   - Compute `overagePercent = ((price - userBudget) / userBudget) * 100`.
   - If `userBudget == 0` and `price > 0`: `overagePercent = Infinity`.
   - Assign score **0**.
   - Set flag `"BUDGET_EXCEEDED"`.
   - Set `hardFail = true`.

3. **Special case — price is 0:**
   - Score **100**, pass. A free item never violates a budget.

**Pass threshold:** score == 100 (binary — no partial credit)
**Fail behavior:** `hardFail = true` → the final output MUST set `proceedWithPurchase = false` and `failureReason = "BUDGET_EXCEEDED: Price $<price> exceeds budget $<userBudget> by <overagePercent>%."`.

**Output:**
```json
{
  "step": 4,
  "name": "Budget Guardrail",
  "score": <0 | 100>,
  "reasoning": "<string>",
  "flag": "<string | null>",
  "hardFail": <boolean>
}
```

---

### Step 5 — Composite Scoring

**Objective:** Aggregate all step scores into a single decision metric, applying cross-step intelligence.

**Logic:**

1. Compute the raw weighted score:
   ```
   rawComposite = (step1.score * 0.25)
                + (step2.score * 0.20)
                + (step3.score * 0.20)
                + (step4.score * 0.25)
                + (step5_bonus)
   ```

2. **Step 5 bonus** (weight 0.10) is an internal consistency reward:
   - If ALL steps 1–4 scored >= 60 → bonus = **100 * 0.10 = 10 points**.
   - If 3 of 4 steps scored >= 60 → bonus = **70 * 0.10 = 7 points**.
   - If 2 of 4 steps scored >= 60 → bonus = **40 * 0.10 = 4 points**.
   - Otherwise → bonus = **0 points**.

3. `compositeScore = round(rawComposite)`, clamped to `[0, 100]`.

4. Determine `confidenceLevel`:
   - If all 4 step scores are >= 60 → `"high"`.
   - If any step has a flag but no `hardFail` → `"medium"`.
   - If any step scored 0 OR a `hardFail` exists → `"low"`.

5. Determine `proceedWithPurchase`:
   - If `step4.hardFail == true` → **false** (budget is sacrosanct).
   - Else if `compositeScore >= 65` → **true**.
   - Else → **false**.

6. If `proceedWithPurchase == false`, populate `failureReason`:
   - If `hardFail` → `"BUDGET_EXCEEDED: ..."` (from step 4).
   - Else → `"LOW_COMPOSITE_SCORE: Score <compositeScore>/100 is below the 65-point procurement threshold. Primary weakness: <lowestScoringStep.name> (<lowestScoringStep.score>/100)."`.

**Output:** See Section 4 (Output Schema).

---

## 4. Output Schema

The skill MUST return the following JSON object:

```jsonc
{
  "compositeScore": {
    "type": "integer",
    "minimum": 0,
    "maximum": 100,
    "description": "Weighted aggregate of all evaluation steps."
  },
  "proceedWithPurchase": {
    "type": "boolean",
    "description": "true if compositeScore >= 65 AND no hardFail. false otherwise."
  },
  "confidenceLevel": {
    "type": "string",
    "enum": ["high", "medium", "low"],
    "description": "Agent's confidence in the decision based on step score distribution."
  },
  "stepBreakdown": {
    "type": "array",
    "items": {
      "step": "integer",
      "name": "string",
      "score": "integer (0-100)",
      "reasoning": "string",
      "flag": "string | null"
    },
    "description": "Per-step score, reasoning, and any flags raised."
  },
  "failureReason": {
    "type": "string | null",
    "description": "Populated ONLY when proceedWithPurchase is false. Contains the specific reason for rejection."
  }
}
```

### Example — Passing Output
```json
{
  "compositeScore": 82,
  "proceedWithPurchase": true,
  "confidenceLevel": "high",
  "stepBreakdown": [
    { "step": 1, "name": "Price Sanity Check",      "score": 80, "reasoning": "Price $12.99 is 26% of $50.00 electronics ceiling.", "flag": null },
    { "step": 2, "name": "Vendor Legitimacy Audit",  "score": 100, "reasoning": "Vendor 'Acme Tools' passed all heuristic checks.", "flag": null },
    { "step": 3, "name": "Need-Price Fit Analysis",  "score": 60, "reasoning": "Price is 65% of acceptable convenience spend ($20.00).", "flag": null },
    { "step": 4, "name": "Budget Guardrail",         "score": 100, "reasoning": "Price $12.99 within budget $50.00.", "flag": null }
  ],
  "failureReason": null
}
```

### Example — Failing Output
```json
{
  "compositeScore": 38,
  "proceedWithPurchase": false,
  "confidenceLevel": "low",
  "stepBreakdown": [
    { "step": 1, "name": "Price Sanity Check",      "score": 0,   "reasoning": "Price $450.00 is 150% of $300.00 software ceiling.", "flag": "PRICE_EXCEEDS_CEILING" },
    { "step": 2, "name": "Vendor Legitimacy Audit",  "score": 25,  "reasoning": "No vendor name provided.", "flag": "VENDOR_UNKNOWN" },
    { "step": 3, "name": "Need-Price Fit Analysis",  "score": 25,  "reasoning": "Price is 112% of acceptable essential spend.", "flag": "NEED_PRICE_MISMATCH" },
    { "step": 4, "name": "Budget Guardrail",         "score": 0,   "reasoning": "Price $450.00 exceeds budget $400.00 by 12.5%.", "flag": "BUDGET_EXCEEDED" }
  ],
  "failureReason": "BUDGET_EXCEEDED: Price $450.00 exceeds budget $400.00 by 12.5%."
}
```

---

## 5. Integration with Purch x402 Flow

This skill functions as a **pre-transaction guardrail**. It executes between the discovery phase and the payment phase of the standard Purch agent workflow.

### Sequence Diagram

```
User Request
     │
     ▼
┌──────────────────────┐
│  1. DISCOVERY         │   GET /x402/search
│     Find product      │   GET /x402/vault/search
│     Parse price       │   POST /x402/shop
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  2. EVALUATE          │   ◀── THIS SKILL
│     Run Decision      │
│     Scorer            │
└──────────┬───────────┘
           │
       ┌───┴───┐
       │       │
    proceed  abort
    = true   = false
       │       │
       ▼       ▼
┌──────────┐  ┌──────────────────┐
│ 3. PAY   │  │ Return to user:  │
│ POST     │  │ failureReason +  │
│ /x402/   │  │ stepBreakdown    │
│ vault/   │  │ (no funds spent) │
│ buy      │  └──────────────────┘
└────┬─────┘
     │
     ▼
┌──────────────────────┐
│  4. VERIFY & DOWNLOAD │   GET /x402/vault/download/:purchaseId
│     Capture purchaseId│       ?downloadToken=...
│     Retrieve asset    │
└──────────────────────┘
```

### Agent Pseudocode

```typescript
// 1. Discovery
const searchResults = await fetch("https://api.purch.xyz/x402/vault/search?q=travel+persona");
const product = searchResults.items[0];

// 2. Evaluate — invoke this skill
const decision = await runSkill("smart-purchase-decision-scorer", {
  productName: product.name,
  price: product.price,
  category: product.category,
  vendorName: product.vendor,
  userBudget: agent.config.budget,
  userNeed: agent.config.needLevel // "essential" | "convenience" | "luxury"
});

// 3. Gate
if (!decision.proceedWithPurchase) {
  return {
    status: "PURCHASE_BLOCKED",
    reason: decision.failureReason,
    score: decision.compositeScore,
    breakdown: decision.stepBreakdown
  };
}

// 4. Pay — handle x402 flow
const buyResponse = await fetch("https://api.purch.xyz/x402/vault/buy", {
  method: "POST",
  body: JSON.stringify({ slug: product.slug }),
  // AgentCash handles 402 challenge + Solana tx signing automatically
});

// 5. Download
const asset = await fetch(
  `https://api.purch.xyz/x402/vault/download/${buyResponse.purchaseId}` +
  `?downloadToken=${buyResponse.downloadToken}`
);
```

### Price Drift Handling

If the price returned by `/x402/vault/buy` (the dynamic 402 challenge price) differs from the price originally evaluated:

1. Compute `drift = abs(challengePrice - evaluatedPrice) / evaluatedPrice`.
2. If `drift > 0.05` (5% tolerance), **re-run this skill** with the updated `challengePrice` before signing.
3. If the re-evaluation returns `proceedWithPurchase = false`, abort the transaction.

---

## 6. Edge Cases

### 6.1 — Price is $0 (Free Item)

| Step | Behavior |
| :--- | :------- |
| Step 1 (Price Sanity) | Score **100**. Reasoning: `"FREE_ITEM: No price risk."` |
| Step 2 (Vendor Audit) | Runs normally. Free items from unknown vendors still carry risk. |
| Step 3 (Need-Price Fit) | Score **100**. `fitRatio = 0`. Reasoning: `"FREE_ITEM: No budget impact regardless of need category."` |
| Step 4 (Budget Guardrail) | Score **100**. `$0 <= any budget`. |
| Step 5 (Composite) | Will score high (typically 90+) unless vendor is flagged. |

**Net effect:** Free items almost always pass unless the vendor is explicitly blocklisted or unidentifiable.

### 6.2 — userNeed is "luxury" but Budget is Tight

**Definition of "tight":** `price > userBudget * 0.30`.

| Condition | Result |
| :-------- | :----- |
| `price <= userBudget * 0.30` | Normal scoring. No flag. |
| `price > userBudget * 0.30` AND `price <= userBudget` | Step 3 sets flag `"LUXURY_BUDGET_TENSION"`. Step 3 score capped at **20**. Step 4 passes (within budget). Composite score will be depressed — likely below 65 → `proceedWithPurchase = false`. |
| `price > userBudget` | Step 3 flags `"LUXURY_BUDGET_TENSION"`. Step 4 triggers `hardFail`. Result: guaranteed rejection. |

**Rationale:** Luxury purchases consuming a disproportionate share of available budget represent poor financial hygiene. The scorer surfaces this tension to the user without outright banning luxury purchases — if the price is a small fraction of budget, luxury is fine.

### 6.3 — vendorName is Empty or Unknown

| Condition | Step 2 Score | Flag | Effect on Composite |
| :-------- | :----------- | :--- | :------------------ |
| `vendorName == ""` or `null` | **25** | `VENDOR_UNKNOWN` | Reduces composite by ~15 points. A strong price and budget fit can still yield a passing score. |

**Agent guidance:** When `VENDOR_UNKNOWN` is flagged, the agent SHOULD (if capable) attempt secondary verification via:
1. Searching the vendor name in previous transaction history.
2. Cross-referencing with Vault publisher metadata from the `/x402/vault/search` response.
3. Prompting the user for confirmation before proceeding.

If none of these mitigations are possible, the score stands as-is.

### 6.4 — userBudget is $0

| Step | Behavior |
| :--- | :------- |
| Step 3 | If `price > 0`: `maxAcceptable = 0`, `fitRatio = Infinity`, score **0**. Flag: `"NEED_PRICE_MISMATCH"`. |
| Step 3 | If `price == 0`: `fitRatio = 0`, score **100**. |
| Step 4 | If `price > 0`: `hardFail = true`. `overagePercent = Infinity`. |
| Step 4 | If `price == 0`: score **100**. |

**Net effect:** A $0 budget only permits free items.

### 6.5 — Extremely High Price (> $10,000)

Regardless of category ceiling, any `price > 10000` triggers an additional flag `"HIGH_VALUE_TRANSACTION"` appended to Step 1's output. This is informational — it does not modify the score but signals to the calling agent that human-in-the-loop confirmation is strongly recommended.

---

## Appendix: Scoring Quick Reference

```
compositeScore = (step1 * 0.25) + (step2 * 0.20) + (step3 * 0.20) + (step4 * 0.25) + (consistencyBonus * 0.10)

proceedWithPurchase = (compositeScore >= 65) AND (step4.hardFail == false)

confidenceLevel:
  "high"   → all steps >= 60, no flags
  "medium" → any flag present, no hardFail
  "low"    → any step == 0 OR hardFail
```
