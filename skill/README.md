# Smart Purchase Decision Scorer

A deterministic five-step scoring workflow that gives any Purch agent a principled buy/no-buy decision before committing funds. Without it, agents either approve every purchase blindly or rely on ad-hoc budget checks that miss vendor legitimacy, price fairness, and need-value alignment. Download from the Purch Vault or copy `purchase-decision-scorer.md` directly into your agent's context to use it.

**Full spec:** [purchase-decision-scorer.md](./purchase-decision-scorer.md)

## What It Does

The skill takes six inputs describing a product and the user's situation, runs five sequential evaluation steps, and returns a composite score plus a binary `proceedWithPurchase` decision with full reasoning. A score of 65 or above means proceed; below 65 means block. Step 4 (Budget Guardrail) is a hard gate — a budget violation forces `proceedWithPurchase: false` regardless of the composite score.

| Step | Name | Weight |
| :--- | :--- | :---: |
| 1 | Price Sanity Check | 0.25 |
| 2 | Vendor Legitimacy Audit | 0.20 |
| 3 | Need-Price Fit Analysis | 0.20 |
| 4 | Budget Guardrail (hard gate) | 0.25 |
| 5 | Composite Scoring (consistency bonus) | 0.10 |

Each step produces a normalized 0–100 score with explicit numeric thresholds — no vague heuristics. The full logic, edge case handling, and integration pseudocode are in the spec.

## Input / Output

| | Fields |
| :--- | :--- |
| **Input** (6 required) | `productName`, `price`, `category`, `vendorName`, `userBudget`, `userNeed` (`"essential"` \| `"convenience"` \| `"luxury"`) |
| **Output** | `compositeScore` (0–100), `proceedWithPurchase` (bool), `confidenceLevel` (`"high"` \| `"medium"` \| `"low"`), `stepBreakdown` (per-step scores and flags), `failureReason` (string \| null) |

## Connection to Auto-Equip Agent

The Auto-Equip Agent (see [../integration/](../integration/)) runs this skill before every vault purchase. When the scorer raises a flag like `PRICE_EXCEEDS_CEILING` or `VENDOR_UNKNOWN`, the agent translates it into Penny's voice rather than surfacing raw scores to the user. The scorer is the math; Penny is the voice. The integration also re-runs the scorer if the 402 challenge price drifts more than 5% from the search price.

## Usage

Download `smart-purchase-decision-scorer` from the Purch Vault, or copy `purchase-decision-scorer.md` into your agent's context window. The skill is self-contained — no external dependencies beyond the six input fields listed above.

---

*Author: 0xjaadu*
