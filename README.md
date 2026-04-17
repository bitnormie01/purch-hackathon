# Purch Hackathon — 0xjaadu

Four submissions built as a single working system for autonomous shopping agents on the Purch x402 protocol. The core problem: agents that can execute purchases need more than API access — they need to know *when not to buy*, how the payment protocol actually works, and a voice that users trust. This repo delivers all three, plus a working agent that uses them together.

| Submission | Category | Name | Prize Target | Folder |
| :--- | :--- | :--- | :--- | :--- |
| Smart Purchase Decision Scorer | Skill | `smart-purchase-decision-scorer` | Best Skill | [./skill/](./skill/) |
| x402 Protocol Field Guide | Knowledge | `x402-protocol-field-guide` | Best Knowledge Pack | [./knowledge/](./knowledge/) |
| Penny | Persona | `penny-persona` | Best Persona | [./persona/](./persona/) |
| Auto-Equip Agent | Integration | `auto-equip-agent` | Best Integration | [./integration/](./integration/) |

> **To run the integration:** see [./integration/README.md](https://github.com/bitnormie01/purch-hackathon/tree/main/integration)

The four submissions are designed to work as a stack. The Auto-Equip Agent uses the Smart Purchase Decision Scorer as its pre-transaction guardrail: before every vault purchase, it runs a five-step scoring workflow — price sanity, vendor legitimacy, need-price fit, budget compliance, and composite scoring — and only proceeds if the result clears 65/100. When it surfaces results to the user, it speaks as Penny: direct, opinionated, and incapable of framing a bad deal as a good one. Everything the agent needs to understand the x402 protocol, handle price drift, avoid double payments, and navigate the Vault API correctly comes from the field guide. Each piece works standalone. Together they are a complete blueprint for agentic commerce that doesn't lose the user's money.

---

Built by [0xjaadu](https://github.com/0xjaadu)
