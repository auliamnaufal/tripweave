import { z } from "zod";
import { refundCapture } from "@/features/payments/paypal";

export const runtime = "nodejs";

const refundRequestSchema = z.object({
  captureId: z.string().min(1),
  amountMinorUnits: z.number().int().positive(),
  reason: z.string().optional(),
});

export async function POST(request: Request) {
  let input: { captureId: string; amountMinorUnits: number; reason?: string };
  try {
    input = refundRequestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid refund request." }, { status: 400 });
  }

  try {
    const result = await refundCapture(input.captureId, input.amountMinorUnits, input.reason);
    return Response.json(result);
  } catch {
    // Covers PayPal's own errors for a bad capture id, an amount exceeding
    // what's left to refund, or a capture that isn't refundable. Same status
    // as the other payment routes use for "PayPal didn't come through" (see order/route.ts).
    return Response.json({ error: "Refund could not be completed." }, { status: 503 });
  }
}
