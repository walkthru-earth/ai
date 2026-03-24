/**
 * TimeSlider component registration — time-aware playback for weather forecasts.
 */

import type { TamboComponent } from "@tambo-ai/react";
import { InteractableTimeSlider, timeSliderSchema } from "@/components/tambo/time-slider";

export const timeSliderComponent: TamboComponent = {
  name: "TimeSlider",
  description:
    "Time-aware playback slider with play/pause/prev/next controls. " +
    "Cross-filters GeoMap (shows spatial snapshot at selected timestamp) and Graph (reference line at current moment). " +
    "Use for weather forecasts and any timestamped H3/spatial data. " +
    "Pass queryId from the AREA query (all cells x all timestamps). " +
    "timestampColumn should match the time column in the SQL query (default: 'time_label'). " +
    "Timezone auto-detected from browser — converts UTC to user's local time for display. " +
    "ALWAYS include alongside GeoMap and Graph for weather queries.",
  component: InteractableTimeSlider,
  propsSchema: timeSliderSchema,
};
