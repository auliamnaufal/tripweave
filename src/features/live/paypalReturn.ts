/** postMessage from /checkout/return (PayPal's return/cancel URL) back to the /checkout tab. */
export const PAYPAL_RETURN_MESSAGE = "tripweave:paypal-return";

export type PayPalReturnMessage = { type: typeof PAYPAL_RETURN_MESSAGE; cancelled: boolean; orderId: string | null };

export function isPayPalReturnMessage(data: unknown): data is PayPalReturnMessage {
  return typeof data === "object" && data !== null && (data as { type?: unknown }).type === PAYPAL_RETURN_MESSAGE;
}
