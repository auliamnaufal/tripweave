import { z } from "zod";
import { capturePlanOrder } from "@/features/payments/paypal";

export const runtime = "nodejs";

const captureRequestSchema = z.object({
  orderId: z.string().min(1),
});

export async function POST(request: Request) {
  let input: { orderId: string };
  try {
    input = captureRequestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid payment request." }, { status: 400 });
  }

  try {
    const { status } = await capturePlanOrder(input.orderId);
    return Response.json({ status });
  } catch {
    return Response.json({ error: "Payment could not be completed." }, { status: 503 });
  }
}
