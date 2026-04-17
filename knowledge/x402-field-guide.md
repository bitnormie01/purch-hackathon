# x402 Protocol Field Guide

> **Purch Knowledge Pack · v1.0.0**
> The complete technical reference for developers building autonomous agents on the Purch x402 payment protocol.
> Written by someone who already burned 10 hours so you don't have to.

---

## Table of Contents

1. [What x402 Actually Is](#1--what-x402-actually-is)
2. [Purch's x402 Implementation](#2--purchs-x402-implementation)
3. [TypeScript Implementation Guide](#3--typescript-implementation-guide)
4. [Edge Cases and Gotchas](#4--edge-cases-and-gotchas)
5. [Quick Reference Card](#5--quick-reference-card)

---

## 1 — What x402 Actually Is

### The One-Sentence Version

HTTP status code `402 Payment Required` has existed since 1997. Every spec marked it "reserved for future use." The future showed up: autonomous agents that need to pay for things without a human clicking "Buy Now."

### What Happens at the Wire Level

Forget abstractions. Here is the exact HTTP exchange:

```
Step 1 — Agent makes a normal request
─────────────────────────────────────
POST /x402/vault/buy HTTP/1.1
Host: api.purch.xyz
Content-Type: application/json

{
  "slug": "deal-finder-persona",
  "walletAddress": "<agent-solana-wallet-base58>",
  "email": "agent@example.com"
}


Step 2 — Server returns 402, not 200
─────────────────────────────────────
HTTP/1.1 402 Payment Required

The response contains payment instructions: amount (USDC),
recipient address, and network (Solana). Your x402 client
reads these automatically.


Step 3 — x402 client handles payment transparently
───────────────────────────────────────────────────
If you're using wrapFetchWithPayment() from @x402/fetch,
this is invisible to your code. The client:
  1. Detects the 402 response.
  2. Constructs a Solana USDC transfer for the exact amount.
  3. Signs it with your agent's keypair.
  4. Submits to Solana and waits for confirmation.
  5. Retries the original request with proof of payment.

Your code sees none of this — it just gets the final 200.


Step 4 — Server verifies the on-chain payment, delivers the resource
────────────────────────────────────────────────────────────────────
HTTP/1.1 200 OK

{
  "purchaseId": "15d05c3c-...",
  "downloadToken": "bfd489b8a763168f...",
  "item": {
    "slug": "deal-finder-persona",
    "title": "Deal Finder Persona",
    "productType": "persona",
    "price": 1,
    "coverImageUrl": "https://..."
  }
}


Step 5 — Agent downloads the asset
──────────────────────────────────
GET /x402/vault/download/15d05c3c-...?downloadToken=bfd489b8a763168f...

→ Returns: application/zip
```

That's it. No OAuth. No session cookies. No API keys. No "create an account" form. The wallet *is* the identity. The payment *is* the authentication.

### Why This Matters for Autonomous Agents

Traditional commerce requires a human at the keyboard: logging in, entering card details, clicking through checkout flows. None of that works when your agent is running unsupervised at 3 AM trying to acquire a skill pack it needs for a task.

x402 replaces all of that with a single primitive: **if you can sign a transaction, you can buy things.** An agent with a funded wallet and a private key is a fully autonomous economic actor. No browser. No CAPTCHA. No human.

This is not a minor convenience. It is the difference between an agent that can *recommend* a purchase and an agent that can *make* one. x402 closes the loop.

### The Analogy You'll Remember

Think of x402 like a toll road with no booth operator. You drive up, a sign displays the price ($4.99), you toss exact change into the basket (sign a USDC transaction), the gate opens (resource delivered). The entire interaction is between your car and the road. No app download. No account. No attendant.

The only difference: the toll road checks that your coins are real before the gate moves.

---

## 2 — Purch's x402 Implementation

### How the 402 Response is Structured

When your agent hits a payment-required endpoint (`/x402/vault/buy`, `/x402/vault/search`, or `/x402/vault/download`), Purch returns a `402` status with payment instructions.

**If you're using `wrapFetchWithPayment()` from `@x402/fetch`, you never see the 402 directly.** The x402 client intercepts it, signs a USDC payment on Solana, and retries the request — all transparently. Your code receives the final 200 response as if the payment never happened.

If you're building a manual integration without the x402 client, the 402 response contains the payment amount (USDC), recipient wallet address, and network (Solana). [VERIFY: exact 402 response body schema for manual integrations — most builders should use `@x402/fetch` instead.]

Key facts about the payment layer:
| Fact | Detail |
| :--- | :--- |
| **Currency** | Always USDC on Purch today |
| **Network** | Solana |
| **No API keys** | No keys, no OAuth, no JWTs. The x402 payment *is* the authentication. |
| **Every endpoint costs** | Even search ($0.01) and download ($0.01) go through x402 |

### Dynamic Pricing Reality

This is the thing that will bite you. The price you see in search results is **not a quote. It's an estimate.**

Here's the timeline:

```
Time T+0:  GET /x402/vault/search?q=travel-persona
           → results include { price: 4.99 }

Time T+1:  Your agent deliberates, runs budget checks, etc.

Time T+5:  POST /x402/vault/buy { slug: "...", walletAddress: "...", email: "..." }
           → 402 challenge price: 5.49   ← DIFFERENT
```

The price drifted. Maybe the seller updated it. Maybe it's demand-based. Doesn't matter — **the 402 response price is the canonical price.** The search result price was informational.

**How an agent should handle this:**

1. **Always re-read the price from the 402 response.** Never assume the search price is final.
2. **Compute drift:** `abs(402price - searchPrice) / searchPrice`
3. **If drift > 5%:** Re-run your budget validation (or the [Smart Purchase Decision Scorer](./purchase-decision-scorer.md)) with the updated price before signing.
4. **If drift > 20%:** Abort. Something is wrong, or the market moved significantly. Log it and surface to the user.
5. **If drift <= 5%:** Proceed. Minor fluctuations are normal.

```typescript
const drift = Math.abs(challengePrice - searchPrice) / searchPrice;

if (drift > 0.20) {
  throw new Error(`PRICE_DRIFT_ABORT: ${(drift * 100).toFixed(1)}% drift exceeds safety threshold`);
}

if (drift > 0.05) {
  // Re-evaluate with updated price before signing
  const recheck = await evaluatePurchase({ ...params, price: challengePrice });
  if (!recheck.proceedWithPurchase) {
    throw new Error(`PRICE_DRIFT_REJECTED: Re-evaluation failed after ${(drift * 100).toFixed(1)}% drift`);
  }
}
```

### The Vault buy → download Handoff

After a successful `/x402/vault/buy`, you get two values you need for the download:

| Value | What It Proves | Where It Comes From |
| :--- | :--- | :--- |
| `purchaseId` | That a specific purchase record exists in Purch's system (UUID) | Returned in the `/x402/vault/buy` response body |
| `downloadToken` | That your agent is authorized to download *this specific purchase* | Returned in the `/x402/vault/buy` response body |

You also get an `item` object with `slug`, `title`, `productType`, `price`, and `coverImageUrl` — useful for logging but not needed for download.

The download call:

```
GET /x402/vault/download/<purchaseId>?downloadToken=<token>
```

That's two params, not three. `txSignature` is **not** a parameter for the download endpoint. The x402 payment for the download call ($0.01) is handled transparently by your x402 client, same as every other endpoint.

**Why both values?** Defense in depth.
- `purchaseId` alone → anyone who guesses/leaks the UUID could download.
- `downloadToken` alone → no link to a real purchase, could be forged.
- Both together → proves you bought this thing and you have the secret token issued at purchase time.

### How Payment Works Under the Hood

If you're using `wrapFetchWithPayment()` from `@x402/fetch` (and you should be), the entire payment flow is transparent:

```
1. Your code calls fetchWithPay("POST /x402/vault/buy", { slug, walletAddress, email })
2. x402 client sends the request
3. Server returns 402 with USDC amount
4. x402 client signs a Solana USDC transfer
5. x402 client submits tx and waits for confirmation
6. x402 client retries the original request with payment proof
7. Your code receives the 200 with { purchaseId, downloadToken, item }
```

You never touch `txSignature` directly. You never parse 402 responses. You never construct Solana transactions. The x402 client does all of it. Your code looks like a normal `fetch` call that happens to cost money.

### What "Price Equals the Product Total (Dynamic)" Actually Means

The SKILL.md says:
- Physical goods (`/x402/buy`): "Price equals the product total (dynamic)"
- Vault items (`/x402/vault/buy`): "Price equals the item price (dynamic)"

In practice, this means:

1. **There is no cart.** Each buy call is a single item transaction.
2. **The price is set at the moment of the 402 challenge,** not at search time.
3. **For physical goods,** "product total" likely includes any applicable fees, shipping calculations, etc. — it's the all-in number. [VERIFY: whether physical goods pricing includes tax/shipping or if those are separate — Vault items do not have this ambiguity.]
4. **For Vault items** (skills, personas, knowledge packs), it's simpler: the item has a price, and that's what you pay.

**Budget management implication:** Your agent cannot pre-compute exact totals from search results. It must:
- Treat search prices as *estimates* for budgeting
- Reserve a buffer (recommend 10–20% above advertised price)
- Make the final go/no-go decision only after receiving the 402 challenge price

---

## 3 — TypeScript Implementation Guide

This is real code you can adapt, not pseudocode. Every pattern here reflects the actual Purch API surface.

### 3.1 — Setting Up the x402 Client

```bash
# Install the required packages
npm install @x402/fetch @x402/svm @solana/kit
```

```typescript
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { SOLANA_MAINNET_CAIP2 } from "@x402/svm";
import { ExactSvmScheme } from "@x402/svm";

// Your agent's Solana wallet secret key (Uint8Array, 64 bytes)
const signer = await createKeyPairSignerFromBytes(walletSecretKey);

// Register the Solana payment scheme
const client = new x402Client();
client.register(SOLANA_MAINNET_CAIP2, new ExactSvmScheme(signer));

// Wrap fetch — this is the only thing that changes in your code
const fetchWithPay = wrapFetchWithPayment(fetch, client);

// Now use fetchWithPay exactly like fetch.
// 402 responses are intercepted, paid, and retried automatically.
```

That's the entire setup. No API keys. No env vars for authentication. The wallet *is* your identity.

### 3.2 — Using fetchWithPay (the Core Pattern)

With `wrapFetchWithPayment`, the x402 payment loop is invisible. You write normal `fetch` calls:

```typescript
// This is all you need. The 402 → pay → retry loop happens automatically.
const response = await fetchWithPay("https://api.purch.xyz/x402/vault/buy", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    slug: "deal-finder-persona",
    walletAddress: signer.address,
    email: "agent@example.com",
  }),
});

// You get the 200 response directly — payment was handled transparently
const result = await response.json();
console.log(result.purchaseId, result.downloadToken);
```

**What happens under the hood:**
1. `fetchWithPay` sends your POST request.
2. Server returns `402 Payment Required` with a USDC amount.
3. The x402 client signs a Solana USDC transfer using your keypair.
4. The x402 client waits for on-chain confirmation.
5. The x402 client retries the original request with payment proof.
6. You receive the final `200 OK` response.

You never see the 402. You never touch a transaction signature. You never parse payment instructions.

### 3.3 — Extracting purchaseId and downloadToken

After a successful `/x402/vault/buy`, the response contains everything you need:

```typescript
// Verified response schema from POST /x402/vault/buy
interface VaultBuyResponse {
  purchaseId: string;    // UUID, e.g., "15d05c3c-..."
  downloadToken: string; // hex string, e.g., "bfd489b8a763168f..."
  item: {
    slug: string;        // e.g., "deal-finder-persona"
    title: string;
    productType: "skill" | "knowledge" | "persona";
    price: number;       // USDC, e.g., 1
    coverImageUrl: string;
  };
}

async function buyVaultItem(
  slug: string,
  walletAddress: string,
  email: string,
  fetchFn: typeof fetch // pass in your fetchWithPay
): Promise<VaultBuyResponse> {

  const response = await fetchFn("https://api.purch.xyz/x402/vault/buy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, walletAddress, email }),
  });

  if (!response.ok) {
    throw new Error(`vault/buy failed: ${response.status} ${await response.text()}`);
  }

  const result = await response.json() as VaultBuyResponse;

  // Validate the response has what we need for download
  if (!result.purchaseId || !result.downloadToken) {
    throw new Error(
      `Incomplete vault/buy response. Got: ` +
      `purchaseId=${!!result.purchaseId}, downloadToken=${!!result.downloadToken}`
    );
  }

  return result;
}
```

### 3.4 — Complete Vault Download

```typescript
/**
 * Downloads a Vault asset after successful purchase.
 * Requires purchaseId (path) and downloadToken (query param).
 * The download endpoint itself costs $0.01 via x402 — use fetchWithPay.
 *
 * IMPORTANT: Call this IMMEDIATELY after buyVaultItem.
 * Do not insert heavy processing between buy and download.
 */
async function downloadVaultAsset(
  purchaseId: string,
  downloadToken: string,
  fetchFn: typeof fetch // pass in your fetchWithPay
): Promise<ArrayBuffer> {

  const url = new URL(
    `https://api.purch.xyz/x402/vault/download/${encodeURIComponent(purchaseId)}`
  );
  url.searchParams.set("downloadToken", downloadToken);
  // NOTE: txSignature is NOT a parameter here. Just purchaseId + downloadToken.

  const response = await fetchFn(url.toString(), { method: "GET" });

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Download authorization failed for purchase ${purchaseId}. ` +
      `The downloadToken may have expired or been used.`
    );
  }

  if (response.status === 404) {
    throw new Error(
      `Purchase ${purchaseId} not found. Verify the purchaseId is correct.`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Download failed with status ${response.status}: ${await response.text()}`
    );
  }

  // Vault assets are returned as ZIP files (application/zip)
  return response.arrayBuffer();
}
```

### 3.5 — Full End-to-End Workflow

Putting it all together — search, evaluate, buy, download:

```typescript
async function acquireVaultAsset(
  query: string,
  walletAddress: string,
  email: string,
  budget: number,
  fetchFn: typeof fetch // your fetchWithPay instance
): Promise<ArrayBuffer> {

  // ── Step 1: Search ──
  // Note: even search costs $0.01 via x402
  const searchResponse = await fetchFn(
    `https://api.purch.xyz/x402/vault/search?q=${encodeURIComponent(query)}`
  );

  if (!searchResponse.ok) {
    throw new Error(`Vault search failed: ${searchResponse.status}`);
  }

  const searchData = await searchResponse.json();
  const { items, nextCursor } = searchData; // cursor-based pagination

  if (!items || items.length === 0) {
    throw new Error(
      `No Vault items found for query "${query}". ` +
      `Try broader terms or different filters — see Gotcha #6.`
    );
  }

  const bestMatch = items[0]; // Or implement your own ranking logic

  // ── Step 2: Evaluate (pre-transaction guardrail) ──
  // Uses the SEARCH price for initial screening.
  // The real price is determined at buy time by the 402 challenge.
  if (bestMatch.price > budget) {
    throw new Error(
      `BUDGET_EXCEEDED: "${bestMatch.title}" costs $${bestMatch.price}, ` +
      `budget is $${budget}. (Search price — actual may differ.)`
    );
  }

  // ── Step 3: Buy (x402 handles payment transparently) ──
  const buyResult = await buyVaultItem(
    bestMatch.slug,  // Use slug, not id
    walletAddress,
    email,
    fetchFn
  );

  // Log the actual price paid vs search price
  if (buyResult.item.price !== bestMatch.price) {
    console.warn(
      `⚠️ Price drift: searched at $${bestMatch.price}, paid $${buyResult.item.price}`
    );
  }

  // ── Step 4: Download ──
  // Do this IMMEDIATELY after buy — downloadToken may expire
  const zipData = await downloadVaultAsset(
    buyResult.purchaseId,
    buyResult.downloadToken,
    fetchFn
  );

  console.log(`✅ Acquired "${buyResult.item.title}" — purchase ${buyResult.purchaseId}`);

  return zipData;
}
```

### 3.6 — Error Handling Strategy

```typescript
// Custom error classes for different failure modes

class PurchApiError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "PurchApiError";
  }
}

class PurchPaymentError extends Error {
  constructor(
    message: string,
    public txSignature: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "PurchPaymentError";
  }
}

// Error handling decision matrix
function handlePurchError(error: unknown): "retry" | "abort" | "escalate" {

  if (error instanceof PurchPaymentError) {
    // You PAID but something went wrong after. NEVER retry the payment.
    // The tx is on-chain. Retrying = double payment.
    // Escalate to human or support.
    console.error(
      `⚠️ PAYMENT SUBMITTED BUT DELIVERY FAILED.\n` +
      `TX: ${error.txSignature}\n` +
      `Status: ${error.statusCode}\n` +
      `DO NOT RETRY. Contact support with the tx signature.`
    );
    return "escalate";
  }

  if (error instanceof PurchApiError) {
    switch (error.statusCode) {
      case 402:
        // This shouldn't surface if your payment loop is correct.
        // If it does, your payment was not recognized.
        return "escalate";

      case 404:
        // Item doesn't exist. Don't retry.
        return "abort";

      case 429:
        // Rate limited. Wait and retry.
        return "retry";

      case 500:
      case 502:
      case 503:
        // Server error. Retry with backoff — but only for non-payment requests.
        return "retry";

      default:
        return "abort";
    }
  }

  // Unknown error — don't retry blindly
  return "abort";
}
```

---

## 4 — Edge Cases and Gotchas

This section is worth more than the rest of the document combined. Every item here represents real failure modes.

---

### Gotcha #1 — Price Drift Between Search and Buy

**Problem:** Your agent searches for a Vault item, sees `$4.99`, passes budget validation, calls `/x402/vault/buy`, and the 402 challenge comes back at `$5.49`. Your agent signs for `$4.99`. The transaction is rejected or — worse — it goes through but Purch doesn't recognize it as sufficient payment.

**Why:** Prices on Purch are dynamic. The search endpoint returns a snapshot. By the time your agent calls the buy endpoint, the seller or system may have adjusted the price. There is no "price lock" between search and buy. [VERIFY: whether there is any price-hold mechanism or cache window.]

**Fix:**
1. Never use the search price for the actual payment. Always extract the price from the 402 challenge response.
2. Compare the challenge price to the search price. If drift exceeds 5%, re-run your budget evaluation.
3. If drift exceeds 20%, abort entirely — something unexpected changed.

```typescript
const driftPercent = Math.abs(challengePrice - searchPrice) / searchPrice;
if (driftPercent > 0.05) {
  // Re-evaluate before signing
}
if (driftPercent > 0.20) {
  throw new Error("PRICE_DRIFT_ABORT");
}
```

---

### Gotcha #2 — Double Payment on Retry (Idempotency)

**Problem:** Your `fetchWithPay` call to `/x402/vault/buy` fails partway through — the x402 client signed and submitted a Solana USDC transfer, but the retry to Purch timed out. Your agent's outer retry logic wraps the whole `fetchWithPay` call and tries again. Now the x402 client signs *another* payment. You've paid twice for one item.

**Why:** Solana transactions are irreversible. There is no undo. If your agent wraps `fetchWithPay` in a generic retry loop, each attempt creates a new on-chain payment. The x402 client does not know about your outer retry logic. [VERIFY: whether the `@x402/fetch` client has built-in idempotency or deduplication.]

**Fix:**
1. **Do not wrap `fetchWithPay` calls in a retry loop for payment endpoints.** If the call fails, you may have already paid.
2. Check on-chain whether the USDC transfer succeeded before attempting any retry.
3. If payment succeeded but the server response was lost, contact Purch support with the transaction signature from your Solana wallet's recent transactions.
4. For non-payment endpoints (like `/x402/vault/search`), retries are safe — the $0.01 cost is negligible.

```typescript
// WRONG — retrying the entire fetchWithPay, including payment
for (let i = 0; i < 3; i++) {
  try {
    return await fetchWithPay("https://api.purch.xyz/x402/vault/buy", opts);
  } catch {
    continue; // ← THIS MAY PAY AGAIN
  }
}

// RIGHT — single attempt, then check on-chain if it fails
try {
  return await fetchWithPay("https://api.purch.xyz/x402/vault/buy", opts);
} catch (error) {
  // Check your wallet's recent transactions to see if payment went through.
  // If it did, you need to contact support — do NOT retry.
  console.error("Buy failed. Check on-chain before retrying.", error);
  throw error;
}
```

---

### Gotcha #3 — Solana Transaction Confirmation Delay

**Problem:** The x402 client signs a USDC transfer and submits it to Solana, but the Purch server can't verify the payment on-chain yet because the transaction hasn't reached the required confirmation level. The buy request fails even though the payment was submitted.

**Why:** Solana has multiple commitment levels. A transaction can be `processed` (seen by the node), `confirmed` (voted on by supermajority), or `finalized` (rooted, irreversible). If your agent sends the tx signature after only `processed` status, the Purch server checking at `confirmed` or `finalized` level won't find it yet. Slot times are typically ~400ms, but under congestion, confirmation can take several seconds.

**Fix:**
1. After submitting the transaction, wait for at least `confirmed` commitment before retrying Purch.
2. Use `finalized` if you can tolerate the extra latency (~6–12 seconds) — it's the safest option for high-value purchases.
3. Implement a polling loop with timeout, not a fixed delay.

```typescript
async function waitForSolanaConfirmation(
  txSignature: string,
  options: { commitment: "confirmed" | "finalized"; timeoutMs: number }
): Promise<void> {
  const { commitment, timeoutMs } = options;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const status = await connection.getSignatureStatus(txSignature);
    const confirmationStatus = status?.value?.confirmationStatus;

    if (confirmationStatus === commitment || confirmationStatus === "finalized") {
      return; // Transaction is confirmed at the desired level
    }

    if (status?.value?.err) {
      throw new Error(
        `Solana transaction failed: ${JSON.stringify(status.value.err)}`
      );
    }

    await sleep(500); // Poll every 500ms
  }

  throw new Error(
    `Solana confirmation timeout after ${timeoutMs}ms for tx ${txSignature}. ` +
    `The transaction may still confirm — check on-chain before retrying payment.`
  );
}
```

---

### Gotcha #4 — downloadToken Expiry Window

**Problem:** Your agent successfully calls `/x402/vault/buy`, receives the `purchaseId` and `downloadToken`, then does some other processing before calling `/x402/vault/download`. By the time it calls download, the token has expired. The download returns 401/403.

**Why:** The `downloadToken` is intentionally short-lived. It's a one-time-use (or time-limited) credential that proves the download is happening as part of the same session as the purchase. [VERIFY: exact expiry — likely 5–15 minutes. Possibly single-use.]

**Fix:**
1. **Call download immediately after buy.** Do not insert any logic between the buy response and the download call. Budget checks, logging, notifications — all of that happens *before* buy or *after* download. Never between them.
2. If you absolutely must delay, persist the `downloadToken` and `purchaseId` and implement a retry that checks for expiry errors.
3. If the token has expired, there is likely no way to get a new one without a new purchase. [VERIFY: whether Purch supports token refresh or re-download for a given purchaseId.]

```typescript
// WRONG — doing work between buy and download
const buyResult = await buyVaultItem(slug, walletAddress, email, fetchWithPay);
await notifyUser(buyResult);           // ← this takes time
await updateDatabase(buyResult);       // ← this takes time
const zip = await downloadVaultAsset(   // ← token may be expired
  buyResult.purchaseId,
  buyResult.downloadToken,
  fetchWithPay
);

// RIGHT — download immediately, then do everything else
const buyResult = await buyVaultItem(slug, walletAddress, email, fetchWithPay);
const zip = await downloadVaultAsset(
  buyResult.purchaseId,
  buyResult.downloadToken,
  fetchWithPay
);
// THEN do your bookkeeping
await notifyUser(buyResult);
await updateDatabase(buyResult);
```

---

### Gotcha #5 — Using /x402/buy Instead of /x402/vault/buy for Vault Items

**Problem:** Your agent finds a Vault item (a skill, persona, or knowledge pack) via `/x402/vault/search`, then sends the purchase request to `/x402/buy` instead of `/x402/vault/buy`. The response is either a 404, a cryptic error, or — worst case — the server interprets it as a physical goods purchase request and the flow breaks entirely.

**Why:** There are two buy endpoints:
- `/x402/buy` → for physical goods (Amazon/Shopify products)
- `/x402/vault/buy` → for digital Vault assets (skills, personas, knowledge packs)

They look similar. Copy-paste errors and autocomplete are the usual culprits. The endpoints have different internal routing, different pricing logic, and return different response shapes.

**Fix:**
1. Use the search endpoint to determine the item type. If you found it via `/x402/vault/search`, buy it via `/x402/vault/buy`.
2. If you found it via `/x402/search` or `/x402/shop`, buy it via `/x402/buy`.
3. Build a helper that enforces this mapping:

```typescript
function getBuyEndpoint(source: "vault" | "marketplace"): string {
  return source === "vault" ? "/x402/vault/buy" : "/x402/buy";
}

function getDownloadEndpoint(purchaseId: string): string {
  // Only Vault items have a download step
  return `/x402/vault/download/${purchaseId}`;
}
```

4. **Visual mnemonic:** If the path has `vault` in the search, it needs `vault` in the buy. No vault in search, no vault in buy.

---

### Gotcha #6 — Empty Vault Search Results for a Valid Query

**Problem:** Your agent queries `/x402/vault/search?q=travel+persona` and gets back an empty result set. The developer assumes the API is broken. It's not.

**Why:** The Purch Vault is a curated marketplace. It does not have the inventory density of Amazon. A query that seems perfectly reasonable ("travel persona") may return zero results because:
1. No one has published a Vault item with those keywords yet.
2. The `q` parameter is keyword-based. "travel persona" may not match an item titled "Globetrotter Agent Personality."
3. You may get better results using the structured filters: `category` (marketing, development, automation, career, ios, productivity) and `productType` (skill, knowledge, persona), along with `minPrice`/`maxPrice`.

**Fix:**
1. **Always handle zero results gracefully.** An empty result is not an error — it's valid data.
2. Try broader search terms. If "travel persona" returns nothing, try just "travel" or just "persona."
3. Use structured filters (`productType=persona&category=development`) instead of relying solely on keyword search.
4. The response includes a `nextCursor` field for pagination — if it's non-null, there are more results. Pass `cursor=<nextCursor>` to get the next page.
5. **Do not retry the same query in a loop.** If the Vault doesn't have it, it doesn't have it.

```typescript
const results = await searchVault(query);

if (results.length === 0) {
  // Try broader terms before giving up
  const broaderQuery = query.split(/\s+/).slice(0, 1).join(" "); // first word only
  const broaderResults = await searchVault(broaderQuery);

  if (broaderResults.length === 0) {
    return {
      status: "NO_RESULTS",
      message: `No Vault items found for "${query}" or "${broaderQuery}".`,
      suggestion: "Try different keywords or check the Vault catalog directly."
    };
  }

  return broaderResults;
}
```

---

### Gotcha #7 — Budget Validation Timing: Approved at Search, Busted at Buy

**Problem:** Your agent searches, finds an item at $4.50, validates it against a $5.00 budget, approves the purchase, and calls `/x402/vault/buy`. The 402 challenge comes back at $5.25. The agent's budget validation already passed — it doesn't re-check — so it signs the transaction. The user just spent more than their budget allowed.

**Why:** Budget validation typically runs during the evaluate step, which uses the search price. But the search price is an estimate. Between search and buy, the price can drift upward past the budget ceiling. If it drifts above budget:
- The agent already approved the spend based on stale data.
- The `@x402/fetch` client signs the payment automatically when it sees the 402 — it doesn't know about your budget.
- The budget constraint is silently violated.

**Fix:**
1. **Compare the search price to the confirmed price in the buy response.** The `item.price` field in the vault/buy response tells you what was actually paid.
2. If `buyResult.item.price > budget`, log a budget violation and flag it for the user — but note the payment already happened at this point.
3. For pre-payment budget enforcement, you'd need to handle the 402 loop manually instead of using `wrapFetchWithPayment`. [VERIFY: whether `@x402/fetch` exposes a `beforePayment` hook for pre-signing validation.]

```typescript
// Inside your manual 402 handler, BEFORE signing:
const challengePrice = paymentChallenge.paymentRequired.price;

if (challengePrice > agentBudget) {
  throw new Error(
    `BUDGET_EXCEEDED_AT_CHALLENGE: Item was $${searchPrice} at search, ` +
    `but 402 challenge price is $${challengePrice}. ` +
    `Budget is $${agentBudget}. Aborting before payment.`
  );
}

// Also re-run the scorer if drift is significant
if (Math.abs(challengePrice - searchPrice) / searchPrice > 0.05) {
  const recheck = await runSkill("smart-purchase-decision-scorer", {
    ...originalParams,
    price: challengePrice,
  });
  if (!recheck.proceedWithPurchase) {
    throw new Error(`RECHECK_FAILED: ${recheck.failureReason}`);
  }
}

// Compare after buy to detect drift
if (buyResult.item.price > agentBudget) {
  console.error(`BUDGET_VIOLATED: paid $${buyResult.item.price}, budget was $${agentBudget}`);
}
```

This is the only gotcha where the failure mode is *silent* — everything appears to work, but the user's budget constraint was violated. The other gotchas at least throw errors.

---

## 5 — Quick Reference Card

### Endpoint Reference

| Method | Endpoint | x402 Cost | Key Parameters | Success Response Contains |
| :--- | :--- | :---: | :--- | :--- |
| **GET** | `/x402/search` | $0.01 | `q` (query string), filters | Product listings with name, price, category, vendor |
| **POST** | `/x402/shop` | $0.10 | Natural language query in body | AI-curated product results |
| **GET** | `/x402/vault/search` | $0.01 | `q`, `category`, `productType`, `minPrice`, `maxPrice`, `cursor`, `limit` | `items[]` (slug, title, price, productType, etc.), `nextCursor` |
| **POST** | `/x402/buy` | Item price | Product details in body | Purchase confirmation [VERIFY: exact fields for marketplace buy] |
| **POST** | `/x402/vault/buy` | Item price | `slug` (string), `walletAddress` (base58), `email` (string) | `purchaseId`, `downloadToken`, `item` (slug, title, productType, price, coverImageUrl) |
| **GET** | `/x402/vault/download/:purchaseId` | $0.01 | `downloadToken` (query param) | ZIP file (application/zip) |

### Error State Reference

| Error State | What It Means | One-Line Fix |
| :--- | :--- | :--- |
| `402 Payment Required` | Not an error if you're using raw `fetch`. This IS the x402 payment flow. Use `wrapFetchWithPayment(fetch, client)` to handle it automatically. | Switch to `fetchWithPay` from `@x402/fetch` or handle the 402 challenge manually. |
| `401/403 on download` | Your `downloadToken` is expired or already used. | Call download **immediately** after buy — no delays between. |
| `404 on buy` | The `slug` doesn't exist, or you're hitting `/x402/buy` for a Vault item (wrong endpoint). | Confirm the item exists via `/x402/vault/search`, and use `/x402/vault/buy` for Vault items. |
| `Payment succeeded but no response` | The x402 client paid on-chain but the server response was lost (network timeout). | Do NOT retry — you may double-pay. Check your wallet's recent transactions. Contact support. |
| `Empty search results` | The Vault doesn't have items matching your query. Not a bug. | Broaden search terms, or use structured filters (`productType`, `category`). The Vault is curated, not exhaustive. |
| `Budget exceeded after buy` | Search price was within budget, but the actual item price (in buy response) was higher. Payment already went through. | Compare `buyResult.item.price` against budget post-purchase. For pre-payment enforcement, handle the 402 flow manually. |

---

## Metadata

| Field | Value |
| :--- | :--- |
| **name** | `x402-protocol-field-guide` |
| **version** | `1.0.0` |
| **author** | `0xjaadu` |
| **license** | `MIT` |
| **category** | `Knowledge` |
| **platform** | `purch-vault` |
| **compatible-skills** | `smart-purchase-decision-scorer` |
| **tags** | `x402`, `http-402`, `payment-protocol`, `solana`, `USDC`, `agentic-commerce`, `purch-api`, `developer-guide`, `machine-to-machine-payments` |
| **description** | The definitive field guide for developers building autonomous agents on the Purch x402 payment protocol. Covers the HTTP-level payment flow, Purch's specific implementation details, TypeScript code patterns, and every edge case that will waste your afternoon if you don't know about them. |

---

> **A note on `[VERIFY]` tags:** This document flags a small number of implementation details that could not be confirmed from the available documentation alone. These tags are intentional. If you're building on Purch and can confirm or correct any of them, please update this guide. A living document that admits uncertainty is more useful than a static one that confidently invents details.
