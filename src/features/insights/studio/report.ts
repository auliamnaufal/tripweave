import { studioTheme, type AgDataSourcesDefinition, type AgReportState } from "ag-studio";
import type { InsightsData } from "@/features/insights/insightsData";
import type { TripInsightsRegistry } from "./moneyTrail";

// AG Studio configuration for the Trip spend dashboard: the two tables and how
// they relate, the opening report, and a theme built from Tripweave's tokens.

const money = { format: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }) };
const day = { format: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }) };

export function studioData(data: InsightsData): AgDataSourcesDefinition<TripInsightsRegistry> {
  return {
    description:
      "A traveller's paid Tripweave Trip Orders. Each trip is one PayPal payment for a whole itinerary; each booking is one line of it (flight, stay or activity) and what happened to it after capture: Booked, Paid direct, Refunded (back to the traveller's PayPal), Failed or Pending.",
    sources: [
      {
        id: "trips",
        name: "Trip Orders",
        description: "One row per PayPal payment (Trip Order).",
        primaryKeyField: "tripId",
        data: data.trips.map((t) => ({ ...t, paidOn: new Date(`${t.paidOn}T12:00:00`) })),
        fields: [
          { id: "tripId", name: "Trip id", format: "textFormat", hide: true },
          { id: "trip", name: "Trip", format: "textFormat" },
          { id: "paypalOrderId", name: "PayPal order", format: "textFormat" },
          { id: "destination", name: "Destination", format: "textFormat" },
          { id: "paidOn", name: "Paid on", format: "dateFormat", formatOptions: day },
          { id: "status", name: "Status", format: "textFormat" },
          { id: "travellers", name: "Travellers", format: "integerFormat" },
          { id: "items", name: "Items", format: "integerFormat" },
          { id: "paidUsd", name: "Paid with PayPal", format: "currencyFormat", formatOptions: money, description: "What PayPal captured for the Trip Order." },
          { id: "bookedUsd", name: "Booked", format: "currencyFormat", formatOptions: money },
          { id: "refundedUsd", name: "Refunded", format: "currencyFormat", formatOptions: money, description: "Sent back to the traveller's PayPal for lines that couldn't be booked." },
          { id: "pendingUsd", name: "Pending", format: "currencyFormat", formatOptions: money },
          { id: "reconciles", name: "Reconciles", format: "textFormat", description: "Yes when paid = booked + refunded + pending to the cent." },
        ],
      },
      {
        id: "bookings",
        name: "Bookings",
        description: "One row per line of a Trip Order and its outcome.",
        primaryKeyField: "bookingId",
        data: data.bookings.map((b) => ({ ...b, startsOn: new Date(`${b.startsOn}T12:00:00`) })),
        fields: [
          { id: "bookingId", name: "Booking id", format: "textFormat", hide: true },
          { id: "tripId", name: "Trip id", format: "textFormat", hide: true },
          { id: "trip", name: "Trip", format: "textFormat" },
          { id: "kind", name: "Kind", format: "textFormat" },
          { id: "item", name: "Item", format: "textFormat" },
          { id: "platform", name: "Platform", format: "textFormat" },
          { id: "data", name: "Data", format: "textFormat", description: "Live: real supplier API data. Simulated: a stand-in partner for the demo." },
          { id: "startsOn", name: "Date", format: "dateFormat", formatOptions: day },
          { id: "amountUsd", name: "Amount", format: "currencyFormat", formatOptions: money },
          { id: "outcome", name: "Outcome", format: "textFormat" },
          { id: "bookingRef", name: "Booking ref", format: "textFormat" },
        ],
      },
    ],
    relationships: [{ id: "booking-trip", type: "many-to-one", source: "bookings.tripId", target: "trips.tripId" }],
  };
}

const sum = (id: string) => [{ id, aggregation: "sum" as const }];
const title = (text: string) => ({ title: { enabled: true, text } });

export const initialReport: AgReportState<TripInsightsRegistry> = {
  selectedPageId: "spend",
  panels: { data: { collapsed: true }, filters: { collapsed: true } },
  pages: [
    {
      id: "spend",
      widgets: {
        paid: { type: "value", dataMapping: { value: sum("trips.paidUsd") }, format: title("Paid with PayPal") },
        booked: { type: "value", dataMapping: { value: sum("trips.bookedUsd") }, format: title("Booked with suppliers") },
        refunded: { type: "value", dataMapping: { value: sum("trips.refundedUsd") }, format: title("Back to your PayPal") },
        orders: { type: "value", dataMapping: { value: [{ id: "trips.tripId", aggregation: "countd" }] }, format: title("Trip Orders") },
        trail: {
          type: "money-trail",
          dataMapping: { trip: [{ id: "bookings.trip" }], outcome: [{ id: "bookings.outcome" }], amount: sum("bookings.amountUsd") },
          format: title("Where each PayPal payment went"),
        },
        byKind: {
          type: "donut-chart",
          dataMapping: { categoryKey: [{ id: "bookings.kind" }], valueKey: sum("bookings.amountUsd") },
          format: title("Spend by kind"),
        },
        byPlatform: {
          type: "column-chart-stacked",
          dataMapping: { categoryKey: [{ id: "bookings.platform" }], valueKey: sum("bookings.amountUsd"), legendKey: [{ id: "bookings.outcome" }] },
          format: title("Spend by platform and outcome"),
        },
        lines: {
          type: "grid",
          dataMapping: {
            cols: [
              { id: "bookings.trip" },
              { id: "bookings.startsOn" },
              { id: "bookings.kind" },
              { id: "bookings.item" },
              { id: "bookings.platform" },
              { id: "bookings.data" },
              { id: "bookings.outcome" },
              { id: "bookings.amountUsd" },
              { id: "bookings.bookingRef" },
            ],
          },
          format: title("Every line you paid for"),
        },
      },
      widgetLayout: {
        paid: { xTrack: 0, yTrack: 0, xSpan: 6, ySpan: 6 },
        booked: { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 6 },
        refunded: { xTrack: 12, yTrack: 0, xSpan: 6, ySpan: 6 },
        orders: { xTrack: 18, yTrack: 0, xSpan: 6, ySpan: 6 },
        trail: { xTrack: 0, yTrack: 6, xSpan: 24, ySpan: 12 },
        byKind: { xTrack: 0, yTrack: 18, xSpan: 10, ySpan: 16 },
        byPlatform: { xTrack: 10, yTrack: 18, xSpan: 14, ySpan: 16 },
        lines: { xTrack: 0, yTrack: 34, xSpan: 24, ySpan: 20 },
      },
    },
  ],
};

// Every value is a Tripweave token, so Studio reads as part of the page.
const token = (name: string) => `var(--${name})`;
const line = (name: string) => ({ width: 1, color: token(name) });
const PALETTE = ["forest-700", "ember", "sand", "forest-500", "ember-deep", "paper-3", "forest-900", "ink-soft"];

export const tripweaveStudioTheme = studioTheme.withParams({
  fontFamily: token("font-sans-stack"),
  fontSize: 14,
  textColor: token("ink"),
  foregroundColor: token("ink"),
  subtleTextColor: token("ink-soft"),
  backgroundColor: token("surface"),
  borderColor: token("line"),
  accentColor: token("forest-700"),
  iconColor: token("forest-700"),
  rowHoverColor: token("paper-2"),

  studioWrapperBorder: false,
  studioWrapperBorderRadius: 0,
  studioWrapperBackgroundColor: token("paper"),
  studioCanvasBorder: false,
  studioCanvasShadow: false,
  studioCanvasBackgroundColor: token("paper"),
  studioCanvasPadding: 12,
  studioCanvasRowHeight: 18,
  studioCanvasFontFamily: token("font-sans-stack"),

  studioWidgetBackgroundColor: token("surface"),
  studioWidgetBorder: line("line"),
  studioWidgetBorderRadius: 16,
  studioWidgetPadding: 12,
  studioWidgetTitleFontFamily: token("font-sans-stack"),
  studioWidgetTitleFontSize: 15,
  studioWidgetTitleFontWeight: 600,
  studioWidgetTitleTextColor: token("ink"),

  gridFontFamily: token("font-sans-stack"),
  gridHeaderBackgroundColor: token("surface"),
  gridHeaderTextColor: token("ink-soft"),
  gridRowBorder: line("line"),
  gridWrapperBorder: false,

  chartFontFamily: token("font-sans-stack"),
  chartTextColor: token("ink"),
  chartSubtleTextColor: token("ink-soft"),
  chartAxisLineColor: token("line-strong"),
  chartGridLineColor: token("line"),
  ...Object.fromEntries(
    PALETTE.flatMap((name, i) => [
      [`chartPaletteFills${i + 1}Color`, token(name)],
      [`chartPaletteStrokes${i + 1}Color`, token(name)],
    ]),
  ),
});
