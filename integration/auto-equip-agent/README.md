# Auto-Equip Agent

> Autonomous Vault shopper that finds and purchases the best Skill, Knowledge Pack, and Persona for any use case — powered by the Purch x402 protocol.

## What It Does

Give it a use case in plain English. It:

1. **Searches** the Purch Vault for matching items across all three asset types
2. **Scores** each result on value, trust, and quality
3. **Shows** you the top picks with reasoning
4. **Buys & downloads** on your confirmation
5. **Outputs** an `agent-config.json` ready for integration

All payments happen automatically via x402 micropayments (USDC on Solana). No API keys. No OAuth. The wallet is the identity.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure your wallet
cp .env.example .env
# Edit .env with your Solana wallet details

# 3. Run it
npx ts-node src/index.ts "I need a productivity agent"
```

## Environment Variables

| Variable | Required | Description |
|:---|:---:|:---|
| `WALLET_SECRET_KEY` | ✅ | Solana keypair, base58-encoded (64 bytes) |
| `WALLET_ADDRESS` | ✅ | Solana public address, base58 |
| `EMAIL` | ✅ | Email for Purch purchase confirmations |
| `MAX_BUDGET_PER_ITEM` | | Max USDC per item (default: $5.00) |

## Example

```
$ npx ts-node src/index.ts "marketing automation agent"

╔══════════════════════════════════════════════════════════════╗
║                    Auto-Equip Agent                         ║
╚══════════════════════════════════════════════════════════════╝

🎯 Use case: "marketing automation agent"

📡 Searching Purch Vault...

  🔍 Searching Vault: productType=skill, q="marketing automation agent" ($0.01)
     ↳ Found 4 skill(s)
  🔍 Searching Vault: productType=knowledge, q="marketing automation agent" ($0.01)
     ↳ Found 2 knowledge(s)
  🔍 Searching Vault: productType=persona, q="marketing automation agent" ($0.01)
     ↳ Found 3 persona(s)

────────────────────────────────────────────────────────────────
  🏆 Top Picks for Your Use Case
────────────────────────────────────────────────────────────────

  ⚡ Skill: Email Campaign Automator
     Slug:   email-campaign-automator
     Price:  $1.00 USDC
     Score:  78/100
     Why:    ✓ Featured by Purch · ✓ 42 downloads (community-validated)

  📚 Knowledge Pack: Growth Hacking Playbook
     Slug:   growth-hacking-playbook
     Price:  $2.00 USDC
     Score:  65/100
     Why:    ✓ Well-documented · ✓ Strong value ratio

  🎭 Persona: Marketing Maven
     Slug:   marketing-maven
     Price:  $1.00 USDC
     Score:  72/100
     Why:    ✓ Featured by Purch · ✓ 28 downloads (community-validated)

────────────────────────────────────────────────────────────────
  💰 Estimated total: $4.06 USDC
     (3 items + search fees + download fees)
────────────────────────────────────────────────────────────────

  Purchase these 3 item(s)? (y/n) y

══════════════════════════════════════════════════════════════
  🛍️  Purchasing...
══════════════════════════════════════════════════════════════

  🛒  Buying "Email Campaign Automator" for $1.00 USDC...
      ✅ Bought — purchase abc123-...
      📥 Downloading ZIP ($0.01)...
      💾 Saved: ./downloads/email-campaign-automator.zip

  [... more purchases ...]

══════════════════════════════════════════════════════════════
  ✅ Auto-Equip Complete!
══════════════════════════════════════════════════════════════

  Items equipped:  3/3
  Total spent:     $4.06 USDC

  📁 ZIPs saved to: ./downloads/
  📄 Config saved:  ./agent-config.json
```

## Output: agent-config.json

```json
{
  "generatedAt": "2026-04-16T15:00:00.000Z",
  "useCase": "marketing automation agent",
  "totalCost": 4.06,
  "skill": {
    "slug": "email-campaign-automator",
    "title": "Email Campaign Automator",
    "file": "./downloads/email-campaign-automator.zip",
    "price": 1.00,
    "productType": "skill"
  },
  "knowledge": { ... },
  "persona": { ... },
  "searchCosts": 0.03
}
```

## Cost Breakdown

| Action | Cost |
|:---|:---|
| Search (3 product types) | $0.03 USDC |
| Buy (per item) | Item price (varies) |
| Download (per item) | $0.01 USDC |
| **Typical total (3 items @ $1 each)** | **$3.06 USDC** |

## How Scoring Works

Each Vault item is evaluated on four dimensions:

| Dimension | Weight | Signal |
|:---|:---:|:---|
| **Value** | 40% | Downloads per dollar — community validation |
| **Trust** | 30% | Featured status (+30), agent creator (+15), 10+ downloads (+15) |
| **Description** | 30% | cardDescription length as a documentation quality proxy |
| **Budget** | Gate | Hard fail if price > `MAX_BUDGET_PER_ITEM` |

Items scoring ≥ 40/100 that pass budget are eligible. Top scorer per type wins.

## Architecture

```
src/
  index.ts    — CLI orchestrator: parse → search → score → confirm → buy → config
  wallet.ts   — Loads keypair from .env, creates fetchWithPay via @x402/fetch
  search.ts   — Parallel vault/search calls (one per productType)
  scorer.ts   — Purchase Decision Scorer adapted for Vault item signals
  buyer.ts    — buy + download flow, saves ZIPs to ./downloads/
  types.ts    — All TypeScript interfaces
```

## Ecosystem

This agent is part of the Purch Hackathon submission ecosystem:

- **[Penny Persona](../penny-persona.md)** — Deal-obsessed shopping agent personality
- **[Purchase Decision Scorer](../purchase-decision-scorer.md)** — Deterministic evaluation workflow
- **[x402 Protocol Field Guide](../x402-field-guide.md)** — Technical reference for the x402 payment flow

<!-- Demo GIF placeholder: record a terminal session and replace -->
<!-- ![Auto-Equip Demo](./demo.gif) -->

## License

MIT
