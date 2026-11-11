"use client";

import { useMemo } from "react";
import { AgStudioAiModule, enableStudioDevValidations } from "ag-studio";
import { AgStudio, AgStudioProvider, createWidgets } from "ag-studio-react";
import type { InsightsData } from "@/features/insights/insightsData";
import { buildTripInsightsAi } from "@/features/insights/ai/harness";
import { moneyTrailWidget, type TripInsightsRegistry } from "@/features/insights/studio/moneyTrail";
import { initialReport, studioData, tripweaveStudioTheme } from "@/features/insights/studio/report";

if (process.env.NODE_ENV !== "production") enableStudioDevValidations();

// The AG Studio canvas itself. Client-only (loaded with ssr: false): Studio
// measures the page and its AI runs in the browser through /api/ai/responses.

type Props = { data: InsightsData; licenseKey?: string; aiEnabled: boolean; mode: "view" | "edit" };

export default function TripInsightsStudio({ data, licenseKey, aiEnabled, mode }: Props) {
  const sources = useMemo(() => studioData(data), [data]);
  const ai = useMemo(() => (aiEnabled ? buildTripInsightsAi(data) : undefined), [aiEnabled, data]);

  return (
    <AgStudioProvider licenseKey={licenseKey} modules={ai ? [AgStudioAiModule] : undefined}>
      <AgStudio<TripInsightsRegistry>
        className="ti-studio"
        theme={tripweaveStudioTheme}
        data={sources}
        initialState={initialReport}
        mode={mode}
        ai={ai}
        widgets={(config) =>
          createWidgets<TripInsightsRegistry>({
            additionalTypes: [moneyTrailWidget],
            menu: [...config.menu, { label: "Tripweave", widgetIds: ["money-trail"] }],
          })
        }
      />
    </AgStudioProvider>
  );
}
