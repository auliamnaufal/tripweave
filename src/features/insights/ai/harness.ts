import {
  createAiHarness,
  directLlmRunner,
  type AgAiExecuteToolConfig,
  type AgAiHarnessSetup,
  type AgAiTool,
  type AgStudioApi,
} from "ag-studio";
import { auditTripOrders, type InsightsData } from "@/features/insights/insightsData";
import { responsesAdapter } from "./responsesAdapter";

// The Trip spend dashboard's agent team: AG Studio's built-in agents (lead,
// planning, data, page, widget) plus Tripweave's own "auditor". The built-in
// lead is kept as the front agent but can now hand off to the auditor; the
// auditor reads the Trip Orders through a tool that computes every number in
// code (auditTripOrders) and hands dashboard edits back to the built-in page
// agent. The model explains and arranges; it never sets an amount.

/** The built-in agents the lead already delegates to, plus ours. */
const LEAD_TARGETS = ["planning", "data", "page", "widget", "auditor"] as const;

const VOCABULARY = `Tripweave vocabulary (use it exactly):
- A Trip Order is one PayPal payment for a whole itinerary (flights, stay, things to do).
- Each line is booked with its supplier after PayPal captures the payment. A line that can't be booked is refunded to the traveller's PayPal automatically.
- Paid = booked + refunded + pending for every Trip Order. "Reconciles: Yes" means that holds to the cent.
- Flights come from Duffel (live test data); stays and activities may be simulated partners. Say "simulated" when the data column says so; never imply a simulated booking is real.`;

export function buildTripInsightsAi(data: InsightsData): AgAiHarnessSetup {
  const adapter = responsesAdapter({ endpoint: "/api/ai/responses" });

  return ({ api: coreApi }) => {
    // Setup params are typed with the core API; inside <AgStudio> it is the full Studio API.
    const api = coreApi as AgStudioApi;
    return createAiHarness(api, ({ builtIn, tools }) => {
      const reconcileConfig: AgAiExecuteToolConfig<{ tripId?: string }, unknown> = {
        name: "reconcile_trip_orders",
        description:
          "Per paid Trip Order: what PayPal captured, how much was booked, refunded or still pending, whether it reconciles, and every line that wasn't booked. Pass a trip id or PayPal order id to check one order, or nothing for all.",
        params: (s) => s.object({ tripId: s.string({ description: "Trip id or PayPal order id. Omit to check every Trip Order." }).optional() }),
        execute: ({ tripId }, ctx) => {
          const audit = auditTripOrders(data, tripId || undefined);
          if (audit.length === 0) return ctx.error(tripId ? `No paid Trip Order matches "${tripId}".` : "There are no paid Trip Orders yet.");
          return ctx.success(JSON.stringify(audit));
        },
      };
      const reconcile: AgAiTool = api.defineAiTool(reconcileConfig);

      const auditor = directLlmRunner({
        id: "auditor",
        name: "Trip Order auditor",
        description:
          "Explains where the money of each PayPal Trip Order went: booked, refunded or pending, and whether it reconciles. Hand off any question about refunds, failed bookings, what was paid or a specific PayPal order.",
        schema: (s) => s.undefined(),
        adapter,
        instructions: () =>
          `You audit Tripweave Trip Orders.\n${VOCABULARY}\n` +
          "Always call reconcile_trip_orders first and quote only the numbers it returns. Lead with the answer (e.g. \"$150 of $2,750 came back to your PayPal\"), then the lines behind it. " +
          "If the traveller wants it on the dashboard, delegate to the page agent with a precise request (widget type, fields from the bookings or trips tables, filter such as outcome = Refunded).",
        tools: () => [reconcile, tools.delegateTo(["page", "widget"])],
        maxTurns: 12,
      });

      const lead = builtIn.lead;
      const extendedLead = directLlmRunner({
        ...lead,
        adapter,
        instructions: (ctx, params) =>
          `${lead.instructions?.(ctx, params) ?? ""}\n\n${VOCABULARY}\n` +
          "Delegate questions about refunds, failed bookings, what a Trip Order paid for or whether it reconciles to the auditor agent.",
        // Same tools as the built-in lead, with its delegate tool widened to reach the auditor.
        tools: (ctx, params) => [...(lead.tools?.(ctx, params) ?? []).filter((tool) => tool.name !== "delegate_to"), tools.delegateTo(LEAD_TARGETS)],
      });

      return {
        agents: [
          extendedLead,
          ...Object.values(builtIn)
            .filter((definition) => definition.id !== "lead")
            .map((definition) => directLlmRunner({ ...definition, adapter })),
          auditor,
        ],
        primary: "lead",
        promptStarters: [
          { label: "Where did my money go?", prompt: "For each of my Trip Orders, where did the PayPal payment go: booked, refunded or pending? Does it add up?" },
          { label: "Refunds", prompt: "Which bookings were refunded to my PayPal, and why?" },
          { label: "Spend by platform", prompt: "Add a column chart of what I paid per booking platform, split by outcome." },
        ],
      };
    });
  };
}
