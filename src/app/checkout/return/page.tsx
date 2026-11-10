"use client";

import { useEffect } from "react";
import { PAYPAL_RETURN_MESSAGE, type PayPalReturnMessage } from "@/features/live/paypalReturn";
import "@/components/app/app.css";

// PayPal's return_url / cancel_url (set in experience_context). PayPal sends
// the buyer here after they approve or cancel on PayPal's own page. Approval
// is not payment: capture still happens server-side on /booked, which checks
// the order's real status with PayPal before any money is treated as received.

export default function PayPalReturnPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cancelled = params.has("cancelled");
    const message: PayPalReturnMessage = { type: PAYPAL_RETURN_MESSAGE, cancelled, orderId: params.get("token") };

    // Opened as a popup from /checkout: hand the result back and close.
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(message, window.location.origin);
        window.close();
        return;
      } catch {
        /* fall through to same-tab navigation */
      }
    }
    // Same-tab flow (popup blocked): continue here.
    window.location.replace(cancelled ? "/checkout" : "/booked");
  }, []);

  return (
    <main className="co-page-body" style={{ display: "grid", placeItems: "center", minHeight: "60vh", textAlign: "center" }}>
      <p>Returning from PayPal… You can close this window if it stays open.</p>
    </main>
  );
}
