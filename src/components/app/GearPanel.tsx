"use client";

import { useState } from "react";
import { Icon } from "@/components/brand/Icon";
import { fetchGearKit, fetchSimilarGear, type GearKitResult, type SimilarGearResult } from "@/features/live/client";
import "./gear.css";
import { GearKitSk, GearProductsSk } from "@/components/app/Skeleton";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd = (minor: number) => money.format(minor / 100);

type Product = GearKitResult["items"][number]["products"][number];
type Similar = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; result: SimilarGearResult };

type State = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; kit: GearKitResult };

/**
 * "Pack for it": gear for this trip from real retailers (Channel3), priced
 * to fit what's left under the budget. On request only, so opening a trip
 * doesn't spend searches. Every product is a link to the retailer, and none
 * of it is in the Trip Order or the PayPal payment.
 */
export function GearPanel({ quoteId }: { quoteId: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  // "More like this", per product: Channel3 /v1/similar under the same cap.
  const [similar, setSimilar] = useState<Record<string, Similar>>({});
  const [openSimilar, setOpenSimilar] = useState<string | null>(null);

  async function moreLike(product: Product) {
    setOpenSimilar((open) => (open === product.id ? null : product.id));
    if (similar[product.id]?.kind === "ready" || similar[product.id]?.kind === "loading") return;
    setSimilar((all) => ({ ...all, [product.id]: { kind: "loading" } }));
    try {
      const result = await fetchSimilarGear(quoteId, product.id);
      setSimilar((all) => ({ ...all, [product.id]: { kind: "ready", result } }));
    } catch (error) {
      setSimilar((all) => ({ ...all, [product.id]: { kind: "error", message: error instanceof Error ? error.message : "I couldn’t find anything similar." } }));
    }
  }

  async function load() {
    setState({ kind: "loading" });
    try {
      setState({ kind: "ready", kit: await fetchGearKit(quoteId) });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "I couldn’t put a gear list together." });
    }
  }

  const kit = state.kind === "ready" ? state.kit : null;
  const found = kit?.items.filter((item) => item.products.length > 0) ?? [];

  return (
    <section className="gear" aria-labelledby="gear-title" aria-busy={state.kind === "loading"}>
      <header className="gear-head">
        <div>
          <p className="gear-kicker">Pack for it</p>
          <h3 id="gear-title" className="gear-title">
            Gear for this trip, within what’s left of your budget
          </h3>
        </div>
        {state.kind !== "ready" && (
          <button type="button" className="btn gear-btn" onClick={() => void load()} disabled={state.kind === "loading"}>
            <Icon name="search" size={15} /> {state.kind === "loading" ? "Searching stores…" : state.kind === "error" ? "Try again" : "Find gear"}
          </button>
        )}
      </header>

      {state.kind === "idle" && (
        <p className="gear-fine">The agent picks what this trip calls for, then searches real US retailers for it. Separate from your trip payment.</p>
      )}
      {state.kind === "error" && (
        <p className="gear-fine is-error" role="alert">
          {state.message}
        </p>
      )}

      {state.kind === "loading" && <GearKitSk />}

      {kit && kit.items.length === 0 && (
        <p className="gear-fine">Your plan uses the whole budget, so there’s nothing to suggest without going over it.</p>
      )}

      {kit && kit.items.length > 0 && (
        <>
          <p className="gear-room">
            <Icon name="wallet" size={15} />
            <span>
              {usd(kit.room.leftoverMinorUnits)} left under your limit · each pick at or under <b>{usd(kit.room.perItemCapMinorUnits)}</b>, so one of each
              {kit.room.travelers > 1 ? ` for all ${kit.room.travelers} travellers` : ""} still fits.
            </span>
          </p>
          <ul className="gear-needs">
            {kit.items.map(({ need, products }) => (
              <li key={need.query} className="gear-need">
                <p className="gear-need-name">{need.item}</p>
                <p className="gear-need-why">{need.why}</p>
                {products.length === 0 ? (
                  <p className="gear-fine">Nothing in stock within {usd(kit.room.perItemCapMinorUnits)}.</p>
                ) : (
                  <ul className="gear-products">
                    {products.map((product) => (
                      <li key={product.url}>
                        <a className="gear-product" href={product.url} target="_blank" rel="noopener noreferrer sponsored">
                          {product.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.imageUrl} alt="" loading="lazy" />
                          ) : (
                            <span className="gear-noimg" aria-hidden="true" />
                          )}
                          <span className="gear-product-text">
                            <span className="gear-product-title">{product.title}</span>
                            <span className="gear-product-meta">
                              <b>{usd(product.priceMinorUnits)}</b>
                              {product.compareAtMinorUnits && <s>{usd(product.compareAtMinorUnits)}</s>} · {product.domain}
                            </span>
                          </span>
                        </a>
                        <button
                          type="button"
                          className="gear-more"
                          aria-expanded={openSimilar === product.id}
                          aria-controls={`gear-similar-${product.id}`}
                          onClick={() => void moreLike(product)}
                        >
                          {openSimilar === product.id ? "Hide similar" : "More like this"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {products.map((product) =>
                  openSimilar === product.id ? <SimilarList key={product.id} product={product} state={similar[product.id]} /> : null,
                )}
              </li>
            ))}
          </ul>
          {found.length > 0 && (
            <p className="gear-fine">
              Bought from the retailer, not through Tripweave, and not part of your PayPal trip payment. Products and prices via Channel3. {kit.disclosure}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function SimilarList({ product, state }: { product: Product; state: Similar | undefined }) {
  return (
    <div id={`gear-similar-${product.id}`} className="gear-similar" aria-live="polite" aria-busy={state?.kind === "loading"}>
      <p className="gear-similar-head">Like “{product.title}”, still within {state?.kind === "ready" ? usd(state.result.capMinorUnits) : "your cap"}</p>
      {(!state || state.kind === "loading") && (
        <>
          <p className="sr-only" role="status">
            Asking Channel3 for close matches…
          </p>
          <GearProductsSk count={2} />
        </>
      )}
      {state?.kind === "error" && (
        <p className="gear-fine is-error" role="alert">
          {state.message}
        </p>
      )}
      {state?.kind === "ready" &&
        (state.result.products.length === 0 ? (
          <p className="gear-fine">Nothing close to it in stock within the cap.</p>
        ) : (
          <ul className="gear-products">
            {state.result.products.map((alt) => (
              <li key={alt.url}>
                <a className="gear-product" href={alt.url} target="_blank" rel="noopener noreferrer sponsored">
                  {alt.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={alt.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="gear-noimg" aria-hidden="true" />
                  )}
                  <span className="gear-product-text">
                    <span className="gear-product-title">{alt.title}</span>
                    <span className="gear-product-meta">
                      <b>{usd(alt.priceMinorUnits)}</b>
                      {alt.compareAtMinorUnits && <s>{usd(alt.compareAtMinorUnits)}</s>} · {alt.domain}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ))}
      {state?.kind === "ready" && state.result.products.length > 0 && <p className="gear-fine">{state.result.disclosure}</p>}
    </div>
  );
}
