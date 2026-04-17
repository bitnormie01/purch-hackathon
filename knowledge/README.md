# x402 Protocol Field Guide

This document exists because the x402 protocol is new, the official documentation is sparse, and builders are currently learning it by getting burned. It consolidates the HTTP-level mechanics of x402, Purch's specific implementation details, working TypeScript patterns, and every edge case that will cost you an afternoon if you hit it cold. Read it before writing any code against the Purch API.

**Full guide:** [x402-field-guide.md](./x402-field-guide.md)

## What's Covered

**Section 1 — What x402 Actually Is.** The wire-level HTTP exchange, explained without abstractions. Why autonomous agents need this protocol and why traditional auth flows break when there's no human at the keyboard.

**Section 2 — Purch's x402 Implementation.** How Purch structures its 402 responses, what dynamic pricing means in practice (the search price is an estimate, the 402 challenge price is the real one), the vault buy-to-download handoff, and why `txSignature` is not a parameter you ever pass directly.

**Section 3 — TypeScript Implementation Guide.** Real code: client setup with `@x402/fetch`, `@x402/svm`, and `@solana/kit`; the `wrapFetchWithPayment` pattern; vault buy with typed response handling; vault download with correct parameter construction; a complete end-to-end workflow function; and an error handling decision matrix.

**Section 4 — Edge Cases and Gotchas.** Seven failure modes with code examples: price drift between search and buy, double payment on outer retry loops, Solana confirmation delays, downloadToken expiry, hitting `/x402/buy` instead of `/x402/vault/buy` for vault items, empty search results on valid queries, and silent budget violations at the 402 challenge stage.

**Section 5 — Quick Reference Card.** All six Purch endpoints with x402 costs, required parameters, and success response shapes in one table. Common error states with one-line fixes.

## Who It's For

Agent builders integrating the Purch x402 API directly. It assumes you can read TypeScript and understand basic HTTP semantics. It does not explain Solana fundamentals or USDC mechanics — those are prerequisites.

## A Note on [VERIFY] Tags

Eight items in this guide are marked `[VERIFY]`. These are implementation details that could not be confirmed from available documentation — including the exact `downloadToken` expiry window, whether `@x402/fetch` exposes a pre-payment hook, and what the manual 402 response body looks like. They are flagged honestly rather than fabricated. If you can confirm any of them from first-hand testing or Purch source access, update the guide.

## Usage

Read Sections 1 and 2 before writing any code. Work through Section 3 when implementing. Keep the Section 5 quick-reference card open while coding. Treat Section 4 as a pre-launch checklist — each gotcha has a specific fix.

---

*Author: 0xjaadu*
