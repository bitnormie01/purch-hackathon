---
title: Sources & Attributions
---

# Sources

## Primary Sources
- Purch official documentation: https://purch.xyz
- Purch API documentation: https://api.purch.xyz/docs
- Purch Vault skill file: `SKILL.md` (purch-vault skill definition, verified endpoint schemas)
- x402 protocol specification: https://www.x402.org

## Package Sources
- `@x402/fetch` — x402 payment-wrapped fetch client: https://www.npmjs.com/package/@x402/fetch
- `@x402/svm` — Solana payment scheme for x402: https://www.npmjs.com/package/@x402/svm
- `@solana/kit` — Solana keypair and transaction utilities: https://www.npmjs.com/package/@solana/kit
- `@x402/fetch` GitHub source: https://github.com/coinbase/x402

## Verification Sources
- Live API schema verified via direct endpoint testing on Solana mainnet
- `integration/auto-equip-agent/src/wallet.ts` — working x402 client setup (confirmed imports and pattern)
- `integration/auto-equip-agent/src/buyer.ts` — working buy + download flow (confirmed response schema)
- `integration/auto-equip-agent/src/search.ts` — working search flow (confirmed query parameters)

## Author
Built by 0xjaadu (github.com/bitnormie01) for the Purch Hackathon.
GitHub: https://github.com/bitnormie01/purch-hackathon/tree/main/knowledge
