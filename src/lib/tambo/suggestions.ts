/**
 * Geo-personalized suggestion chips - shown to users on first visit.
 * Edit this file to add/change suggestion topics.
 */

import type { GeoIP } from "@/lib/use-geo-ip";

/** Build initial suggestions personalized to user's geo-IP location. Falls back to global suggestions. */
export function buildInitialSuggestions(geo: GeoIP | null) {
  const city = geo?.city;
  const country = geo?.country;
  if (city && country) {
    return [
      {
        id: "s-weather",
        title: `Weather forecast in ${city}`,
        detailedSuggestion: `Show me the 5-day weather forecast for ${city}, ${country}`,
        messageId: "s-weather",
      },
      {
        id: "s-buildings",
        title: `Buildings in ${city}`,
        detailedSuggestion: `Show me building density in ${city}, ${country}`,
        messageId: "s-buildings",
      },
      {
        id: "s-walkability",
        title: `Walkability near ${city}`,
        detailedSuggestion: `How walkable is ${city}, ${country}? Show road types, pedestrian infra, and destinations.`,
        messageId: "s-walkability",
      },
      {
        id: "s-population",
        title: "Population growth",
        detailedSuggestion: `Where is population growing fastest near ${city} by 2100?`,
        messageId: "s-population",
      },
      {
        id: "s-terrain",
        title: "Terrain analysis",
        detailedSuggestion: `Show me terrain elevation around ${city}`,
        messageId: "s-terrain",
      },
      // Extended pool - loaded on scroll
      {
        id: "s-building-types",
        title: `Building types in ${city}`,
        detailedSuggestion: `What types of buildings are in ${city}? Show residential, commercial, religious, education breakdown.`,
        messageId: "s-building-types",
      },
      {
        id: "s-15min",
        title: `15-min city: ${city}`,
        detailedSuggestion: `Is ${city} a 15-minute city? Show amenity diversity, transit access, and walkability.`,
        messageId: "s-15min",
      },
      {
        id: "s-heat",
        title: "Heat vulnerability",
        detailedSuggestion: `How vulnerable is ${city} to urban heat? Show building density, green cover, and temperature.`,
        messageId: "s-heat",
      },
      {
        id: "s-places",
        title: `Places in ${city}`,
        detailedSuggestion: `What places of interest are around ${city}? Show restaurants, shops, hospitals, schools, parks.`,
        messageId: "s-places",
      },
      {
        id: "s-transport",
        title: `Transport near ${city}`,
        detailedSuggestion: `Show me road and transport network around ${city} - road types, rail, cycling infra.`,
        messageId: "s-transport",
      },
    ];
  }
  // Fallback when geo-IP is blocked or unavailable
  return [
    {
      id: "s-weather",
      title: "Weather forecast",
      detailedSuggestion: "Show me the 5-day weather forecast for Cairo",
      messageId: "s-weather",
    },
    {
      id: "s-buildings",
      title: "Building density",
      detailedSuggestion: "Show me building density in Tokyo",
      messageId: "s-buildings",
    },
    {
      id: "s-walkability",
      title: "Walkability analysis",
      detailedSuggestion: "How walkable is Amsterdam? Show road types, pedestrian infra, and amenity density.",
      messageId: "s-walkability",
    },
    {
      id: "s-population",
      title: "Population growth",
      detailedSuggestion: "Where is population growing fastest by 2100?",
      messageId: "s-population",
    },
    {
      id: "s-terrain",
      title: "Terrain analysis",
      detailedSuggestion: "Show me the highest elevations in the Himalayas",
      messageId: "s-terrain",
    },
    // Extended pool - loaded on scroll
    {
      id: "s-building-types",
      title: "Building types",
      detailedSuggestion: "What types of buildings are in Cairo? Show residential, commercial, religious breakdown.",
      messageId: "s-building-types",
    },
    {
      id: "s-15min",
      title: "15-minute city",
      detailedSuggestion: "Is Barcelona a 15-minute city? Show amenity diversity, transit, and walkability.",
      messageId: "s-15min",
    },
    {
      id: "s-heat",
      title: "Heat vulnerability",
      detailedSuggestion: "How vulnerable is Dubai to urban heat? Show building density, green cover, and temperature.",
      messageId: "s-heat",
    },
    {
      id: "s-places",
      title: "Places of interest",
      detailedSuggestion:
        "What places of interest are around London? Show restaurants, shops, hospitals, schools, parks.",
      messageId: "s-places",
    },
    {
      id: "s-transport",
      title: "Transport network",
      detailedSuggestion: "Show me road and transport network around Berlin - road types, rail, cycling infra.",
      messageId: "s-transport",
    },
  ];
}
