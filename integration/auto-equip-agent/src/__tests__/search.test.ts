import { searchVault, searchAllTypes } from "../search";
import type { VaultItem } from "../types";

function makeItem(slug: string): VaultItem {
  return {
    id: `id-${slug}`,
    productType: "skill",
    slug,
    title: slug,
    cardDescription: "desc",
    price: 1.0,
    category: "productivity",
    coverImageUrl: "https://example.com/c.png",
    creator: { name: "c", type: "human" },
    downloads: 5,
    featured: false,
  };
}

function makeResponse(items: VaultItem[]): Response {
  return new Response(JSON.stringify({ items, nextCursor: null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("searchVault", () => {
  it("falls back to no-q search when q-search returns 0 items", async () => {
    const calls: string[] = [];
    const fetchFn = jest.fn(async (url: string | URL | Request) => {
      const u = url.toString();
      calls.push(u);
      if (u.includes("q=")) return makeResponse([]);
      return makeResponse([makeItem("fallback-item")]);
    }) as unknown as typeof fetch;

    const results = await searchVault("myquery", "skill", fetchFn);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/q=myquery/);
    expect(calls[1]).not.toMatch(/q=/);
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe("fallback-item");
  });

  it("does NOT fall back when q-search returns results", async () => {
    const calls: string[] = [];
    const fetchFn = jest.fn(async (url: string | URL | Request) => {
      calls.push(url.toString());
      return makeResponse([makeItem("primary-item")]);
    }) as unknown as typeof fetch;

    const results = await searchVault("myquery", "skill", fetchFn);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/q=myquery/);
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe("primary-item");
  });

  it("returns empty array gracefully when both q and fallback return 0 items", async () => {
    const fetchFn = jest.fn(
      async () => makeResponse([])
    ) as unknown as typeof fetch;

    const results = await searchVault("nothing", "skill", fetchFn);

    expect(results).toEqual([]);
  });
});

describe("searchAllTypes", () => {
  it("runs sequentially: skill finishes before knowledge starts", async () => {
    // Order of concerns: record when each productType's fetch fires and
    // resolves. If sequential, knowledge must not fire until skill resolves.
    const events: string[] = [];

    const fetchFn = jest.fn(async (url: string | URL | Request) => {
      const u = url.toString();
      const type = new URL(u).searchParams.get("productType")!;
      events.push(`start:${type}`);
      // Small async gap so that any parallel calls would overlap visibly.
      await new Promise((r) => setTimeout(r, 20));
      events.push(`end:${type}`);
      return makeResponse([makeItem(`${type}-item`)]);
    }) as unknown as typeof fetch;

    const result = await searchAllTypes("q", fetchFn);

    expect(result.skill).toHaveLength(1);
    expect(result.knowledge).toHaveLength(1);
    expect(result.persona).toHaveLength(1);

    // Sequential invariants: each type's end precedes the next type's start.
    const skillEnd = events.indexOf("end:skill");
    const knowledgeStart = events.indexOf("start:knowledge");
    const knowledgeEnd = events.indexOf("end:knowledge");
    const personaStart = events.indexOf("start:persona");

    expect(skillEnd).toBeGreaterThanOrEqual(0);
    expect(knowledgeStart).toBeGreaterThan(skillEnd);
    expect(personaStart).toBeGreaterThan(knowledgeEnd);
  }, 15000);
});
