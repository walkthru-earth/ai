/**
 * Compressed Shortbread vector tile schema reference for AI context.
 * ~400 tokens. VersaTiles styles use this schema (OpenStreetMap data).
 * The AI needs this to know valid source-layers and filter properties.
 */

export const shortbreadSchemaReference = `
Shortbread Vector Tile Schema (used by VersaTiles/OSM styles)

SOURCE-LAYERS:
ocean (fill, z0+): ocean polygons. No filter props.
water_polygons (fill, z4+): lakes, rivers. Props: kind(lake,river,reservoir,basin,dock,canal,stream)
water_lines (line, z4+): rivers, streams. Props: kind(river,canal,stream,ditch)
land (fill, z7+): land use/cover. Props: kind(forest,grass,park,cemetery,residential,industrial,commercial,farmland,orchard,vineyard,quarry,landfill,retail,military,heath,scrub,wetland,beach,sand,rock,glacier,bare_rock)
dam_polygons/dam_lines (z12+): dams
pier_polygons/pier_lines (z12+): piers/wharves
sites (fill, z14+): grounds. Props: kind(university,hospital,school,parking,playground,sports,stadium,zoo,theme_park)
streets (line, z5+): roads/paths. Props: kind(motorway,trunk,primary,secondary,tertiary,residential,living_street,pedestrian,service,track,footway,cycleway,path,steps,unclassified,construction,raceway,bridleway,bus_guideway), tunnel(bool), bridge(bool), link(bool), bicycle(str), surface(str), oneway(bool)
street_polygons (fill, z11+): pedestrian areas, parking. Props: kind(same as streets)
bridges (fill, z12+): bridge areas
ferries (line): ferry routes. Props: kind(ferry)
buildings (fill, z14+): building footprints. Props: kind(yes,residential,commercial,industrial,garage,church,school,hospital,university)
public_transport (symbol, z11+): transit stops
addresses (symbol, z14+): address labels. Props: housename, housenumber
place_labels (symbol, z3+): city/town/village names. Props: kind(country,state,city,town,village,hamlet,suburb,neighbourhood,isolated_dwelling,farm,locality), population(int)
street_labels (symbol, z10+): road names
boundary_labels (symbol, z2+): boundary names

KEY PATTERNS:
- Primary filter prop: "kind" (present on most source-layers)
- Streets hierarchy: motorway > trunk > primary > secondary > tertiary > residential > service
- Place hierarchy: country > state > city > town > village > hamlet
- Boolean road attrs: tunnel, bridge, link, oneway
- Labels are SEPARATE source-layers (place_labels, street_labels, boundary_labels)
`.trim();
