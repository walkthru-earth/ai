/**
 * Geo-personalized suggestion chips — shown to users on first visit.
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
    ];
  }
  // Fallback when geo-IP is blocked or unavailable
  return [
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
  ];
}
