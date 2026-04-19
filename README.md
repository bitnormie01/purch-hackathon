# Purch Hackathon — 0xjaadu

Four submissions built as a single working system for autonomous shopping agents on the Purch x402 protocol. The core problem: agents that can execute purchases need more than API access — they need to know *when not to buy*, how the payment protocol actually works, and a voice that users trust. This repo delivers all three, plus a working agent that uses them together.

| Submission | Category | Name | Prize Target | Folder |
| :--- | :--- | :--- | :--- | :--- |
| **Smart Purchase Decision Scorer** | Skill | `smart-purchase-decision-scorer` | Best Skill | [./skill/](./skill/) |
| **x402 Protocol Field Guide** | Knowledge | `x402-protocol-field-guide` | Best Knowledge Pack | [./knowledge/](./knowledge/) |
| **Penny** | Persona | `penny-persona` | Best Persona | [./persona/](./persona/) |
| **Auto-Equip Agent** | Integration | `auto-equip-agent` | Best Integration | [./integration/](./integration/) |

The four submissions are designed to work as a stack:
- **Best Skill:** A production-ready, runnable TypeScript implementation of the 5-step Purchase Decision Scorer. It performs deterministic evaluations of price sanity, vendor legitimacy, and budget fit.
- **Best Knowledge Pack:** The definitive x402 Field Guide. Now features a Quickstart section for 5-minute integrations and zero unresolved `[VERIFY]` tags—every claim is tested and confirmed against the protocol.
- **Best Persona:** Penny. Features a dedicated Purch Vault variant system prompt and new example conversations (Conversation 6) showing her navigating digital marketplaces with her signature "deal-obsessed" voice.
- **Best Integration:** The Auto-Equip Agent. A working CLI that finds, scores, buys, and downloads the best Vault assets for any use case. Its scoring logic is now fully aligned with the 5-step Skill specification, including price-drift re-scoring.

Each piece works standalone. Together they are a complete blueprint for agentic commerce that doesn't lose the user's money.

---

Built by [0xjaadu](https://github.com/bitnormie01)
