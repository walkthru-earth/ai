/**
 * Initial suggestion chips for the Style Editor page.
 * Designed to trigger efficient tool-calling workflows.
 */

export const styleEditorSuggestions = [
  {
    id: "se-load-colorful",
    title: "Load Colorful OSM style",
    detailedSuggestion:
      "Load the VersaTiles Colorful style from https://tiles.versatiles.org/assets/styles/colorful/en.json",
    messageId: "se-load-colorful",
  },
  {
    id: "se-dark-theme",
    title: "Switch to dark theme",
    detailedSuggestion:
      "Transform the current style into a dark theme: dark background, muted land colors, deep blue water, light roads, white labels with dark halos",
    messageId: "se-dark-theme",
  },
  {
    id: "se-hide-labels",
    title: "Toggle all labels off",
    detailedSuggestion: "Hide all symbol/label layers by setting their visibility to none",
    messageId: "se-hide-labels",
  },
  {
    id: "se-highlight-roads",
    title: "Highlight major roads",
    detailedSuggestion:
      "Make motorways, trunks, and primary roads stand out with bold colors and wider lines. Keep secondary and residential roads subtle.",
    messageId: "se-highlight-roads",
  },
  {
    id: "se-pastel",
    title: "Pastel color palette",
    detailedSuggestion:
      "Restyle all layers with soft pastel colors: light lavender water, pale green land, warm gray roads, muted labels",
    messageId: "se-pastel",
  },
];
