// ─────────────────────────────────────────────────────────────
// index.ts — CLI entry point for the Auto-Equip Agent
//
// Usage:  npx ts-node src/index.ts "I need a productivity agent"
//
// Flow:
//   1. Parse use case from argv
//   2. Three sequential vault/search calls (skill, knowledge, persona)
//   3. Score results via scorer.ts (5-step Purchase Decision Scorer)
//   4. Display top picks with scores
//   5. Confirmation prompt
//   6. Buy + download each pick
//   7. Write agent-config.json
//   8. Print total cost
// ─────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import readline from "readline";
import { loadEnvConfig, createFetchWithPay } from "./wallet";
import { searchAllTypes } from "./search";
import { pickTopPerType, scoreAll } from "./scorer";
import { buyAndDownload } from "./buyer";
import type {
  AgentConfig,
  EquippedAsset,
  ProductType,
  TopPick,
} from "./types";

// ── Helpers ──

const PRODUCT_TYPE_EMOJI: Record<ProductType, string> = {
  skill: "⚡",
  knowledge: "📚",
  persona: "🎭",
};

const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  skill: "Skill",
  knowledge: "Knowledge Pack",
  persona: "Persona",
};

/**
 * Prompts the user for a yes/no confirmation.
 */
function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

/**
 * Formats a price as USDC with 2 decimal places.
 */
function usd(amount: number): string {
  return `$${amount.toFixed(2)} USDC`;
}

/**
 * Prints a formatted summary of a top pick.
 */
function printPick(pick: TopPick): void {
  const emoji = PRODUCT_TYPE_EMOJI[pick.productType];
  const label = PRODUCT_TYPE_LABEL[pick.productType];
  const { item, score } = pick;
  const { breakdown } = score;
  const verdict = score.proceedWithPurchase ? "✅ PROCEED" : "❌ BLOCK";

  console.log(
    `\n  ${emoji} ${label}: ${item.title}`
  );
  console.log(`     Slug:   ${item.slug}`);
  console.log(`     Price:  ${usd(item.price)}`);
  console.log(`     Score:  ${score.compositeScore}/100  ${verdict}`);
  console.log(`     Price: ${breakdown.step1_priceScore}  Vendor: ${breakdown.step2_vendorScore}  Fit: ${breakdown.step3_fitScore}  Budget: ${breakdown.step4_budgetScore}  Bonus: ${breakdown.step5_bonus}`);
  console.log(`     Why:    ${score.reasoning}`);
}

/**
 * Writes the agent-config.json atomically.
 */
function writeAgentConfig(config: AgentConfig): void {
  const configPath = path.resolve(process.cwd(), "agent-config.json");
  const tmpPath = configPath + ".tmp";

  // Write to temp file first, then rename (atomic on most filesystems)
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2) + "\n");
  fs.renameSync(tmpPath, configPath);

  console.log(`\n📄 Wrote ${configPath}`);
}

// ── Main ──

async function main(): Promise<void> {
  // ── 1. Parse use case from argv ──
  const rawArgs = process.argv.slice(2);
  const dryRun = rawArgs.includes("--dry-run");
  const useCase = rawArgs.filter((a) => a !== "--dry-run").join(" ").trim();

  if (!useCase) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    Auto-Equip Agent                         ║
║     Autonomous Vault shopper for Purch x402 ecosystem       ║
╚══════════════════════════════════════════════════════════════╝

Usage:
  npx ts-node src/index.ts "<use case description>"

Examples:
  npx ts-node src/index.ts "I need a productivity agent"
  npx ts-node src/index.ts "Build me a marketing automation bot"
  npx ts-node src/index.ts "Customer support agent for e-commerce"
`);
    process.exit(1);
  }

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    Auto-Equip Agent                         ║
╚══════════════════════════════════════════════════════════════╝
`);
  console.log(`🎯 Use case: "${useCase}"`);
  if (dryRun) {
    console.log(`🚫 Mode:     DRY RUN (search + score only, no purchases)`);
  }
  console.log("");

  // ── 2. Load environment + create fetchWithPay ──
  const env = loadEnvConfig();
  console.log(`💳 Wallet:  ${env.walletAddress}`);
  console.log(`📧 Email:   ${env.email}`);
  console.log(`💰 Budget:  ${usd(env.maxBudgetPerItem)} per item\n`);

  const fetchWithPay = await createFetchWithPay(env.walletSecretKey);

  // ── 3. Three sequential vault/search calls ──
  const searchResults = await searchAllTypes(useCase, fetchWithPay);
  const searchCosts = 0.03; // 3 searches × $0.01

  // Check if we found anything at all
  const totalItems =
    searchResults.skill.length +
    searchResults.knowledge.length +
    searchResults.persona.length;

  if (totalItems === 0) {
    console.log("\n😔 No items found in the Vault for this use case.");
    console.log("   Try a different description or broader terms.");
    console.log(`\n   Search cost: ${usd(searchCosts)}`);
    process.exit(0);
  }

  // ── 4. Score and pick top per type ──
  const picks = pickTopPerType(searchResults, env.maxBudgetPerItem, env.userNeed);
  const validPicks = (
    Object.entries(picks) as [ProductType, TopPick | null][]
  ).filter(([, pick]) => pick !== null) as [ProductType, TopPick][];

  if (validPicks.length === 0) {
    console.log("\n😔 No items passed the scoring threshold.");
    console.log("   All items either exceeded budget or scored below minimum.");
    console.log(`\n   Search cost: ${usd(searchCosts)}`);
    process.exit(0);
  }

  // ── 5. Display picks ──
  console.log("\n" + "─".repeat(60));
  console.log("  🏆 Top Picks for Your Use Case");
  console.log("─".repeat(60));

  let estimatedItemCost = 0;
  for (const [, pick] of validPicks) {
    printPick(pick);
    estimatedItemCost += pick.item.price;
  }

  // Also show what we didn't find
  const types: ProductType[] = ["skill", "knowledge", "persona"];
  for (const type of types) {
    if (!picks[type]) {
      const emoji = PRODUCT_TYPE_EMOJI[type];
      const label = PRODUCT_TYPE_LABEL[type];
      if (searchResults[type].length === 0) {
        console.log(`\n  ${emoji} ${label}: No items found`);
      } else {
        console.log(`\n  ${emoji} ${label}: Found ${searchResults[type].length} items, none passed scoring`);
      }
    }
  }

  // Download cost estimate: $0.01 per pick. Actual cost recomputed after
  // purchases below, since downloads only happen on successful buys.
  const estimatedDownloadCosts = validPicks.length * 0.01;
  const estimatedTotal = estimatedItemCost + searchCosts + estimatedDownloadCosts;

  console.log("\n" + "─".repeat(60));
  console.log(`  💰 Estimated total: ${usd(estimatedTotal)}`);
  console.log(`     (${validPicks.length} items + search fees + download fees)`);
  console.log("─".repeat(60));

  // ── 6. Confirmation prompt (skipped in dry-run) ──
  if (dryRun) {
    console.log("\n  🚫 DRY RUN — no purchases made.");
    console.log(`  Search cost: ${usd(searchCosts)} (already spent — searches are always live)`);
    process.exit(0);
  }

  const proceed = await confirm(
    `\n  Purchase these ${validPicks.length} item(s)? (y/n) `
  );

  if (!proceed) {
    console.log("\n  ✋ Cancelled. No purchases made.");
    console.log(`  Search cost: ${usd(searchCosts)} (already spent)`);
    process.exit(0);
  }

  // ── 7. Buy + download each pick ──
  console.log("\n" + "═".repeat(60));
  console.log("  🛍️  Purchasing...");
  console.log("═".repeat(60));

  const equipped: Record<ProductType, EquippedAsset | null> = {
    skill: null,
    knowledge: null,
    persona: null,
  };

  let totalItemCost = 0;

  for (const [type, pick] of validPicks) {
    const asset = await buyAndDownload(
      pick.item,
      env.walletAddress,
      env.email,
      fetchWithPay,
      env.maxBudgetPerItem,
      env.userNeed
    );

    if (asset) {
      equipped[type] = asset;
      totalItemCost += asset.price;
    }
  }

  // ── 8. Write agent-config.json ──
  // Actual download cost: one $0.01 call per SUCCESSFUL buy (failed buys
  // never reach the download step).
  const successCount = Object.values(equipped).filter(Boolean).length;
  const downloadCosts = successCount * 0.01;
  const totalCost = totalItemCost + searchCosts + downloadCosts;

  const config: AgentConfig = {
    generatedAt: new Date().toISOString(),
    useCase,
    totalCost: parseFloat(totalCost.toFixed(2)),
    skill: equipped.skill,
    knowledge: equipped.knowledge,
    persona: equipped.persona,
    searchCosts,
  };

  writeAgentConfig(config);

  // ── 9. Final summary ──
  console.log("\n" + "═".repeat(60));
  console.log("  ✅ Auto-Equip Complete!");
  console.log("═".repeat(60));
  console.log(`\n  Items equipped:  ${successCount}/${validPicks.length}`);
  console.log(`  Search costs:    ${usd(searchCosts)}`);
  console.log(`  Download costs:  ${usd(downloadCosts)}`);
  console.log(`  Item costs:      ${usd(totalItemCost)}`);
  console.log(`  ──────────────────────`);
  console.log(`  Total spent:     ${usd(totalCost)}`);

  if (successCount > 0) {
    console.log(`\n  📁 ZIPs saved to: ./downloads/`);
    console.log(`  📄 Config saved:  ./agent-config.json`);
    console.log(
      `\n  Your agent is ready. Load the config and equip your assets.`
    );
  }

  console.log("");
}

// ── Run ──
main().catch((error) => {
  console.error("\n💥 Fatal error:", error.message || error);
  process.exit(1);
});
