"use client";

import { useEffect, useState } from "react";
import type { TicketsResponse } from "@/features/tickets/types";

export type PaidBookings = Pick<TicketsResponse, "orderId" | "status" | "items">;

/**
 * What was stored at capture for a paid PayPal order: per offer booked,
 * failed or refunded. Reads the same endpoint as the e-tickets, so it follows
 * the same access rule. Null until the order is captured (the endpoint answers
 * 409 before that) or when there is no order.
 */
export function usePaidBookings(orderId: string | undefined): PaidBookings | null {
  const [state, setState] = useState<{ orderId: string; data: PaidBookings | null } | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    fetch(`/api/tickets?orderId=${encodeURIComponent(orderId)}`)
      .then(async (response) => {
        if (!alive) return;
        setState({ orderId, data: response.ok ? ((await response.json()) as TicketsResponse) : null });
      })
      .catch(() => alive && setState({ orderId, data: null }));
    return () => {
      alive = false;
    };
  }, [orderId]);

  return orderId && state?.orderId === orderId ? state.data : null;
}
