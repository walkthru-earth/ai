/**
 * Compressed MapLibre Style Spec reference for AI context.
 * ~1200 tokens. Property names only, no explanations (AI knows the spec from training).
 * Focus: what properties exist per layer type, expression shortcuts, common gotchas.
 */

export const maplibreSpecReference = `
MapLibre Style v8 Quick Ref

ROOT: version:8, name, sources:{}, layers:[], sprite, glyphs, center:[lng,lat], zoom, bearing, pitch, light, terrain:{source,exaggeration}, sky, transition:{duration,delay}

SOURCES:
vector: {type,url|tiles[],minzoom,maxzoom,attribution}
raster: {type,url|tiles[],tileSize:256|512}
raster-dem: {type,url|tiles[],encoding:mapbox|terrarium}
geojson: {type,data:url|obj,cluster,clusterRadius,clusterMaxZoom,generateId}
image: {type,url,coordinates:[[lng,lat]x4]}

LAYERS (paint|layout):
background: bg-color,bg-opacity,bg-pattern
fill: fill-color,fill-opacity,fill-outline-color,fill-pattern,fill-antialias,fill-translate | fill-sort-key,visibility
line: line-color,line-opacity,line-width,line-gap-width,line-blur,line-dasharray,line-translate,line-offset,line-gradient | line-cap,line-join,line-sort-key,visibility
symbol: icon-color,icon-halo-color,icon-halo-width,icon-opacity,text-color,text-halo-color,text-halo-width,text-halo-blur,text-opacity | symbol-placement,icon-image,icon-size,icon-rotate,icon-anchor,icon-allow-overlap,text-field,text-font,text-size,text-max-width,text-anchor,text-transform,text-offset,text-allow-overlap,visibility
circle: circle-radius,circle-color,circle-blur,circle-opacity,circle-stroke-width,circle-stroke-color | circle-sort-key,visibility
heatmap: heatmap-radius,heatmap-weight,heatmap-intensity,heatmap-color,heatmap-opacity | visibility
fill-extrusion: fe-color,fe-height,fe-base,fe-opacity,fe-translate,fe-pattern,fe-vertical-gradient | visibility
raster: raster-opacity,raster-hue-rotate,raster-brightness-min,raster-brightness-max,raster-saturation,raster-contrast,raster-resampling | visibility
hillshade: hs-illumination-direction,hs-exaggeration,hs-shadow-color,hs-highlight-color,hs-accent-color | visibility

COMMON LAYER PROPS: id,type,source,source-layer,minzoom,maxzoom,filter,layout:{visibility}

EXPRESSIONS:
get: ["get","prop"] | has: ["has","prop"] | ==: ["==",a,b] | !=,>,>=,<,<=
all/any: ["all",...exprs] | case: ["case",c1,v1,c2,v2,...,fallback]
match: ["match",["get","prop"],v1,out1,v2,out2,...,fallback]
interpolate: ["interpolate",["linear"|["exponential",base]],["zoom"|["get","prop"]],stop1,val1,stop2,val2,...]
step: ["step",["zoom"],default,stop1,val1,stop2,val2,...]
coalesce: ["coalesce",e1,e2,...] | concat: ["concat",...] | to-string/to-number/to-color
format: ["format",str,{font-scale,text-font},...] (for text-field)
math: +,-,*,/,^,abs,min,max,round,ceil,floor | string: upcase,downcase,slice
color: ["rgb",r,g,b] | ["rgba",r,g,b,a]
zoom: ["zoom"] (current zoom level)
`.trim();
