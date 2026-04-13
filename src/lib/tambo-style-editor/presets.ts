/**
 * Style presets - curated starting points for the style editor.
 * VersaTiles styles use the Shortbread vector tile schema (OpenStreetMap data).
 */

export interface StylePreset {
  id: string;
  name: string;
  description: string;
  url: string;
  tags: string[];
  /** Preview color for UI (dominant map color) */
  color: string;
}

const VERSATILES_CDN = "https://tiles.versatiles.org/assets/styles";

export const stylePresets: StylePreset[] = [
  {
    id: "colorful",
    name: "Colorful",
    description: "Vibrant full-color OpenStreetMap style with rich detail",
    url: `${VERSATILES_CDN}/colorful/style.json`,
    tags: ["osm", "color", "default"],
    color: "#7bc67e",
  },
  {
    id: "colorful-en",
    name: "Colorful (English)",
    description: "Colorful style with English labels",
    url: `${VERSATILES_CDN}/colorful/en.json`,
    tags: ["osm", "color", "english"],
    color: "#7bc67e",
  },
  {
    id: "eclipse",
    name: "Eclipse",
    description: "Dark mode with warm tones, inverted luminosity",
    url: `${VERSATILES_CDN}/eclipse/style.json`,
    tags: ["dark", "night"],
    color: "#1a1208",
  },
  {
    id: "eclipse-en",
    name: "Eclipse (English)",
    description: "Dark mode with English labels",
    url: `${VERSATILES_CDN}/eclipse/en.json`,
    tags: ["dark", "night", "english"],
    color: "#1a1208",
  },
  {
    id: "graybeard",
    name: "Graybeard",
    description: "Desaturated grayscale, clean and minimal",
    url: `${VERSATILES_CDN}/graybeard/style.json`,
    tags: ["gray", "minimal", "neutral"],
    color: "#c8c8c8",
  },
  {
    id: "neutrino",
    name: "Neutrino",
    description: "Muted pastel tones, soft and elegant",
    url: `${VERSATILES_CDN}/neutrino/style.json`,
    tags: ["pastel", "soft", "muted"],
    color: "#e8ddd4",
  },
  {
    id: "shadow",
    name: "Shadow",
    description: "Ultra-dark, dimmed and desaturated",
    url: `${VERSATILES_CDN}/shadow/style.json`,
    tags: ["dark", "minimal", "dim"],
    color: "#0d0d0d",
  },
  {
    id: "satellite",
    name: "Satellite",
    description: "Satellite imagery with vector overlay labels",
    url: `${VERSATILES_CDN}/satellite/style.json`,
    tags: ["satellite", "imagery", "aerial"],
    color: "#2d4a2d",
  },
  {
    id: "terrain",
    name: "Terrain",
    description: "Satellite with 3D terrain and hillshade",
    url: `${VERSATILES_CDN}/terrain/style.json`,
    tags: ["3d", "terrain", "hillshade"],
    color: "#5a7a3d",
  },
  {
    id: "maplibre-demo",
    name: "MapLibre Demo",
    description: "Simple world map with country boundaries",
    url: "https://demotiles.maplibre.org/style.json",
    tags: ["simple", "demo", "countries"],
    color: "#D8F2FF",
  },
];
