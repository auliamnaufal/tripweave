import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatOpenAI } from "@langchain/openai";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { parseTripBrief } from "@/features/planner/tripBrief";
import { Channel3Error, searchGear, similarGear, toGearProduct } from "./channel3";
import { buildGearKit, FALLBACK_NEEDS, gearNeeds, gearRoom } from "./gearKit";

const brief = parseTripBrief({
  origin: { city: "Jakarta", country: "Indonesia" },
  destination: { city: "Tokyo", country: "Japan" },
  timeZone: "Asia/Tokyo",
  travelers: 2,
  travelWindow: { startsAt: "2026-12-10T00:00:00Z", endsAt: "2026-12-14T23:59:59Z" },
  hardBudget: { currency: "USD", amountMinorUnits: 300_000 },
  preferences: ["hiking"],
  constraints: [],
  dayPlans: [{ day: 3, wish: "Mount Fuji" }],
});

afterEach(() => vi.restoreAllMocks());

const activity = { productKind: "activity", title: "Mount Fuji 5th Station day hike" } as TravelOffer;

function product(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    title: "Packable Rain Jacket",
    brands: [{ id: "b", name: "Trailco" }],
    images: [
      { url: "https://img.example.com/side.jpg", is_main_image: false },
      { url: "https://img.example.com/main.jpg", cleaned_url: "https://cdn.example.com/main-clean.png", is_main_image: true },
    ],
    offers: [
      { url: "https://shop-a.example.com/jacket", domain: "shop-a.example.com", price: { price: 89.99, compare_at_price: 120, currency: "USD" }, availability: "InStock" },
      { url: "https://shop-b.example.com/jacket", domain: "shop-b.example.com", price: { price: 79.5, currency: "USD" }, availability: "OutOfStock" },
      { url: "https://shop-c.example.com/jacket", domain: "shop-c.example.com", price: { price: 140, currency: "USD" }, availability: "InStock" },
    ],
    ...over,
  };
}

describe("gearRoom", () => {
  it("splits what's left under the budget so one of each item still fits", () => {
    expect(gearRoom(300_000, 260_000, 4)).toEqual({ budgetMinorUnits: 300_000, tripTotalMinorUnits: 260_000, leftoverMinorUnits: 40_000, travelers: 1, perItemCapMinorUnits: 10_000 });
    expect(gearRoom(300_000, 310_000, 3).perItemCapMinorUnits).toBe(0);
  });

  it("leaves room for one of each per traveller", () => {
    expect(gearRoom(300_000, 260_000, 4, 2).perItemCapMinorUnits).toBe(5_000);
  });
});

describe("toGearProduct", () => {
  it("keeps the cheapest in-stock USD offer under the cap, with the main cleaned image", () => {
    expect(toGearProduct(product(), 10_000)).toEqual({
      id: "p1",
      title: "Packable Rain Jacket",
      brand: "Trailco",
      imageUrl: "https://cdn.example.com/main-clean.png",
      priceMinorUnits: 8999,
      compareAtMinorUnits: 12_000,
      url: "https://shop-a.example.com/jacket",
      domain: "shop-a.example.com",
    });
  });

  it("drops a product with nothing buyable: over the cap, out of stock, another currency, or not https", () => {
    expect(toGearProduct(product(), 5_000)).toBeNull();
    expect(toGearProduct(product({ offers: [{ url: "https://x.example.com", domain: "x", price: { price: 10, currency: "EUR" }, availability: "InStock" }] }), 10_000)).toBeNull();
    expect(toGearProduct(product({ offers: [{ url: "http://x.example.com", domain: "x", price: { price: 10, currency: "USD" }, availability: "InStock" }] }), 10_000)).toBeNull();
    expect(toGearProduct({ title: "no id" }, 10_000)).toBeNull();
  });
});

describe("searchGear", () => {
  it("asks Channel3 for in-stock US products under the cap and returns at most three distinct links", async () => {
    const fetchStub = vi.fn(async () =>
      Response.json({ products: [product(), product({ id: "p1-dup" }), product({ id: "p2", offers: [{ ...product().offers[0], url: "https://shop-a.example.com/2" }] }), product({ id: "p3", offers: [{ ...product().offers[0], url: "https://shop-a.example.com/3" }] }), product({ id: "p4", offers: [{ ...product().offers[0], url: "https://shop-a.example.com/4" }] })] }),
    );

    const found = await searchGear("packable rain jacket", 10_000, { apiKey: "k", fetch: fetchStub as unknown as typeof fetch });

    expect(found.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.trychannel3.com/v1/search");
    expect(new Headers(init.headers).get("x-api-key")).toBe("k");
    expect(JSON.parse(init.body as string)).toMatchObject({
      query: "packable rain jacket",
      filters: { price: { max_price: 100 }, availability: ["InStock"] },
      config: { country: "US", currency: "USD" },
    });
  });

  it("throws a Channel3Error with the status when Channel3 refuses", async () => {
    const fetchStub = async () => new Response(JSON.stringify({ detail: "out of credits" }), { status: 402 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(searchGear("x", 1000, { apiKey: "k", fetch: fetchStub as unknown as typeof fetch })).rejects.toMatchObject({ name: "Channel3Error", status: 402 });
  });
});

describe("similarGear", () => {
  it("asks /v1/similar under the same cap and leaves out the product it started from", async () => {
    const fetchStub = vi.fn(async () =>
      Response.json({ products: [product(), product({ id: "p2", offers: [{ ...product().offers[0], url: "https://shop-a.example.com/2" }] })] }),
    );

    const found = await similarGear("p1", 10_000, { apiKey: "k", fetch: fetchStub as unknown as typeof fetch });

    expect(found.map((p) => p.id)).toEqual(["p2"]);
    const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.trychannel3.com/v1/similar");
    expect(new Headers(init.headers).get("x-api-key")).toBe("k");
    expect(JSON.parse(init.body as string)).toEqual({ product_id: "p1", limit: 10, filters: { price: { max_price: 100 } } });
  });

  it("drops anything over the cap even if Channel3 returns it", async () => {
    const pricey = product({ id: "p9", offers: [{ ...product().offers[0], url: "https://shop-a.example.com/9", price: { price: 500, currency: "USD" } }] });
    const fetchStub = async () => Response.json({ products: [pricey] });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await similarGear("p1", 10_000, { apiKey: "k", fetch: fetchStub as unknown as typeof fetch })).toEqual([]);
  });
});

describe("gearNeeds", () => {
  it("takes the model's picks for this trip, deduplicated and capped at four", async () => {
    const items = [
      { item: "Rain jacket", why: "Tokyo in December is cold and wet.", query: "packable rain jacket" },
      { item: "Rain shell", why: "Same thing.", query: "Packable Rain Jacket" },
      { item: "Hiking boots", why: "Mount Fuji trail.", query: "waterproof hiking boots" },
      { item: "Thermal base layer", why: "Fuji is freezing in December.", query: "thermal base layer" },
      { item: "Travel adapter", why: "Japan uses type A plugs.", query: "type a travel adapter" },
      { item: "Hand warmers", why: "Cold mornings.", query: "reusable hand warmers" },
    ];
    const invoke = vi.fn(async () => ({ content: JSON.stringify({ items }) }));
    const needs = await gearNeeds(brief, [activity], { llm: { invoke } as unknown as ChatOpenAI });

    expect(needs.map((need) => need.query)).toEqual(["packable rain jacket", "waterproof hiking boots", "thermal base layer", "type a travel adapter"]);
    const [messages] = invoke.mock.calls[0] as unknown as [{ content: string }[]];
    expect(messages[0].content).toContain("Tokyo, Japan, in December");
    expect(messages[0].content).toContain("Mount Fuji 5th Station day hike");
  });

  it("falls back to a generic kit when the model's answer isn't usable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const invoke = async () => ({ content: "Sure! Pack a jacket." });
    expect(await gearNeeds(brief, [], { llm: { invoke } as unknown as ChatOpenAI })).toEqual(FALLBACK_NEEDS);
  });
});

describe("buildGearKit", () => {
  const needs = async () => FALLBACK_NEEDS;

  it("searches each need at the per-item cap and keeps needs that found nothing", async () => {
    const search = vi.fn(async (query: string) => (query.includes("adapter") ? [toGearProduct(product(), 99_999)!] : []));
    const kit = await buildGearKit({ brief, offers: [], tripTotalMinorUnits: 270_000 }, { needs, search });

    // $300 left, 3 needs, 2 travellers: $50 each.
    expect(kit.room.perItemCapMinorUnits).toBe(5_000);
    expect(search).toHaveBeenCalledTimes(3);
    expect(search).toHaveBeenCalledWith("universal travel adapter usb-c", 5_000);
    expect(kit.items.map((item) => item.products.length)).toEqual([1, 0, 0]);
  });

  it("suggests nothing, and asks no one, when the plan leaves no room under the budget", async () => {
    const search = vi.fn();
    const pick = vi.fn(needs);
    const kit = await buildGearKit({ brief, offers: [], tripTotalMinorUnits: 299_500 }, { needs: pick, search });
    expect(kit.items).toEqual([]);
    expect(pick).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  it("reports Channel3 being down instead of an all-empty kit", async () => {
    const search = async () => {
      throw new Channel3Error("Channel3 search failed (401).", 401);
    };
    await expect(buildGearKit({ brief, offers: [], tripTotalMinorUnits: 200_000 }, { needs, search })).rejects.toBeInstanceOf(Channel3Error);
  });
});
