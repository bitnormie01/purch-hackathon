---
title: Usage Guide
---

# Smart Purchase Decision Scorer — Usage Guide

## What This Skill Does
A 5-step pre-purchase scoring workflow for Purch agents.
Before calling POST /x402/vault/buy or POST /x402/buy,
run this skill to validate the purchase decision.

## Input Fields
- productName (string)
- price (number, USD)
- category (string)
- vendorName (string)
- userBudget (number, USD)
- userNeed: "essential" | "convenience" | "luxury"

## Output Fields
- compositeScore (0-100)
- proceedWithPurchase (boolean — true only if score >= 65)
- confidenceLevel: "high" | "medium" | "low"
- stepBreakdown (per-step score and reasoning)
- failureReason (string, only if proceedWithPurchase is false)

## Integration
See SKILL.md Section 5 for full x402 integration example.

## GitHub
https://github.com/bitnormie01/purch-hackathon/tree/main/skill
