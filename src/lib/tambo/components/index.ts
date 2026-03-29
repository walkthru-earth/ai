/**
 * Component registry - aggregates all component registrations.
 * To add a new component: create/edit a file in this directory, import and add here.
 */

import type { TamboComponent } from "@tambo-ai/react";
import { dataTableComponent } from "./data-table";
import { geoMapComponent, h3MapComponent } from "./geo-map";
import { graphComponent } from "./graph";
import { objexViewerComponent } from "./objex-viewer";
import {
  dataCardComponent,
  datasetCardComponent,
  insightCardComponent,
  queryDisplayComponent,
  statsCardComponent,
  statsGridComponent,
} from "./static";
import { timeSliderComponent } from "./time-slider";

export const components: TamboComponent[] = [
  geoMapComponent,
  h3MapComponent,
  timeSliderComponent,
  statsCardComponent,
  statsGridComponent,
  dataTableComponent,
  queryDisplayComponent,
  datasetCardComponent,
  insightCardComponent,
  graphComponent,
  dataCardComponent,
  objexViewerComponent,
];
