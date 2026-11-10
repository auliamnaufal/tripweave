"use client";

import { useState } from "react";
import "./deal.css";

// A PayPal *sandbox* personal account for whoever runs the demo (judges
// included), shown only when both values are configured. Sandbox accounts
// hold test money only; never put a real PayPal login here.
const EMAIL = process.env.NEXT_PUBLIC_PAYPAL_SANDBOX_BUYER_EMAIL;
const PASSWORD = process.env.NEXT_PUBLIC_PAYPAL_SANDBOX_BUYER_PASSWORD;

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the value is still visible to select */
    }
  }
  return (
    <div className="sbx-field">
      <span className="sbx-label">{label}</span>
      <code className="sbx-value">{value}</code>
      <button type="button" className="sbx-copy" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function SandboxBuyer() {
  if (!EMAIL || !PASSWORD) return null;
  return (
    <div className="sbx" role="note" aria-label="PayPal sandbox test buyer">
      <p className="sbx-title">
        <b>Test checkout</b> · PayPal sandbox, no real money
      </p>
      <CopyField label="Email" value={EMAIL} />
      <CopyField label="Password" value={PASSWORD} />
      <p className="sbx-hint">In the PayPal window: log in with these, then press <b>Pay Now</b>.</p>
    </div>
  );
}


