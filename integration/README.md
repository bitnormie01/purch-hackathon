# Auto-Equip Agent

Given a task description, this agent searches the Purch Vault for the most relevant skill, persona, or knowledge pack, scores each result against your budget and need level, and — on your approval — purchases and downloads the best match via the x402 payment protocol. The downloaded asset is written to `agent-config.json` so downstream agents can load it immediately. Run with `--dry-run` to see scores and prices before any funds move.

## Prerequisites

- Node.js 18 or later
- A Solana wallet funded with USDC (devnet or mainnet)
- Packages installed via `npm install`: `@x402/fetch`, `@x402/svm`, `@solana/kit`

## Setup

**Step 1.** Install dependencies.
```bash
npm install
```

**Step 2.** Configure your wallet.
```bash
cp .env.example .env
# Set WALLET_SECRET_KEY (base58-encoded 64-byte keypair) and EMAIL in .env
```

**Step 3.** Run the agent.
```bash
npx ts-node src/index.ts "your use case here" --dry-run
```

Remove `--dry-run` when you're ready to spend real USDC.

## Example Output

```
$ npx ts-node src/index.ts "deal-finding shopping agent" --dry-run

🔍 Searching Vault for "deal-finding shopping agent"...
   Found 4 items  ·  category: all  ·  nextCursor: null

┌──────────────────────────────────────────────────────────────────┐
│  #1  deal-finder-persona                       $2.00 USDC        │
│      persona  ·  vendor: 0xmarkets                               │
│      Score: 82/100  ✅ PROCEED                                   │
│      Price: 100  Vendor: 80  Fit: 80  Budget: 100  Bonus: 10    │
├──────────────────────────────────────────────────────────────────┤
│  #2  market-research-toolkit                   $1.50 USDC        │
│      skill  ·  vendor: buildwithai                               │
│      Score: 74/100  ✅ PROCEED                                   │
│      Price: 100  Vendor: 80  Fit: 60  Budget: 100  Bonus: 7     │
├──────────────────────────────────────────────────────────────────┤
│  #3  autonomous-shopper-v2                     $3.00 USDC        │
│      skill  ·  vendor: (unknown)                                 │
│      Score: 67/100  ✅ PROCEED (marginal — VENDOR_UNKNOWN)       │
│      Price: 100  Vendor: 25  Fit: 60  Budget: 100  Bonus: 7     │
└──────────────────────────────────────────────────────────────────┘

🏆 Top pick: deal-finder-persona @ $2.00 USDC  (score: 82)

-- DRY RUN: no payment submitted --
   Would write: ./agent-config.json
   Estimated total: $2.03 USDC  (item $2.00 + protocol fees $0.03)
```

## How It Works

`src/index.ts` runs four stages in sequence:

1. **Search** — calls `GET /x402/vault/search` ($0.01 via x402) and collects the top results for your query.
2. **Score** — passes each result through the five-step scoring logic in `src/scorer.ts`. Items that don't clear 65/100 are filtered before display.
3. **Confirm** — in interactive mode, displays scored results and waits for your approval. In `--dry-run` mode, stops here with a cost estimate.
4. **Buy + Download** — calls `POST /x402/vault/buy` with `{ slug, walletAddress, email }`, receives `{ purchaseId, downloadToken, item }`, then immediately calls `GET /x402/vault/download/:purchaseId?downloadToken=...` ($0.01 via x402). Writes the result to `agent-config.json`.

The x402 payment loop (402 response → sign USDC transaction → retry) is handled transparently by `@x402/fetch`. The agent code never touches transaction signatures.

## Connection to Other Submissions

`src/scorer.ts` implements the same five-step logic defined in [../skill/purchase-decision-scorer.md](../skill/purchase-decision-scorer.md). The Penny persona ([../persona/penny-persona.md](../persona/penny-persona.md)) is itself a purchasable Vault asset — search for `penny-persona` and the agent will score, buy, and write the system prompt to your config. The x402 implementation follows the patterns documented in [../knowledge/x402-field-guide.md](../knowledge/x402-field-guide.md), including price drift handling and the double-payment guard on buy retries.

## Cost Breakdown

| Operation | Cost |
| :--- | :--- |
| Vault search | $0.01 USDC |
| Vault item purchase | Variable (shown before you confirm) |
| Vault download | $0.01 USDC |
| **Fixed protocol fees per run** | **$0.03 USDC** |

---

*Author: 0xjaadu*
