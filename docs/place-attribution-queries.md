# Place-attribution queries (which countries and cities)

The H3 datasets (weather, terrain, population, buildings, places) carry no country or city names, only H3 cells. To answer questions like "which countries or cities have temperature above 40 C right now", we filter the H3 dataset to the cells of interest, derive coordinates from the cell, then join a public reference layer to attach names.

This doc holds verified, copy-paste queries for those questions. The in-app AI already knows this pattern (see `src/lib/tambo/context/reference-layers.ts`). These same queries run in the DuckDB CLI or via the MotherDuck MCP.

## Reference layers

- Country boundaries GeoJSON, `https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson`. Name field is `f.properties.name`.
- World cities parquet (city, country_code, country, lat, lon, population, 33k rows), `https://raw.githubusercontent.com/tabaqatdev/gdelt-cng/refs/heads/main/data_helpers/world_cities.parquet`.

## Weather notes

- The weather file is a 5-day forecast with 21 six-hourly steps. "Now" means the latest step, so filter with `timestamp = (SELECT MAX(timestamp) FROM file)`.
- Surface temperature column is `temperature_2m_C`.
- Resolve the latest forecast date from the state file, then build the URL. Example URL used below, `.../indices/weather/model=GraphCast_GFS/date=2026-06-01/hour=12/h3_res=4/data.parquet`.
- Use H3 res 3 for fast global scans, res 4 or 5 for a single region or sharper city matches.
- The city H3 resolution MUST match the weather file resolution, compute `h3_latlng_to_cell(lat, lon, <same res>)`.

## Q1. Which countries have temperature above 40 C now

```sql
WITH hot AS (
  SELECT temperature_2m_C AS value,
         h3_cell_to_lat(h3_index) AS lat,
         h3_cell_to_lng(h3_index) AS lng
  FROM 'https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/walkthru-earth/indices/weather/model=GraphCast_GFS/date=2026-06-01/hour=12/h3_res=4/data.parquet'
  WHERE timestamp = (SELECT MAX(timestamp) FROM 'https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/walkthru-earth/indices/weather/model=GraphCast_GFS/date=2026-06-01/hour=12/h3_res=4/data.parquet')
    AND temperature_2m_C > 40
),
countries AS (
  SELECT f.properties.name AS country,
         ST_GeomFromGeoJSON(to_json(f.geometry)) AS geom
  FROM (SELECT unnest(features) AS f
        FROM read_json_auto('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson'))
)
SELECT c.country,
       COUNT(*) AS hot_cells,
       ROUND(MAX(h.value), 1) AS peak_c,
       ROUND(AVG(h.value), 1) AS avg_c
FROM hot h
JOIN countries c ON ST_Contains(c.geom, ST_Point(h.lng, h.lat))
GROUP BY ALL
ORDER BY peak_c DESC;
```

Sample result (forecast issued 2026-06-01, latest step 2026-06-06 12:00 UTC).

| country | hot_cells | peak_c |
|---|---|---|
| Ethiopia | 16 | 45.5 |
| Pakistan | 91 | 45.4 |
| Saudi Arabia | 368 | 45.2 |
| Oman | 156 | 45.0 |
| Iran | 48 | 44.0 |

23 countries in total, also Iraq, Sudan, India, UAE, Algeria, Libya, Kuwait, Yemen, Tunisia, Eritrea, Qatar, Egypt, Mali, Djibouti, Chad, Mauritania.

## Q2. Which major cities have temperature above 40 C now

```sql
WITH hot AS (
  SELECT h3_index, temperature_2m_C AS value
  FROM 'https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/walkthru-earth/indices/weather/model=GraphCast_GFS/date=2026-06-01/hour=12/h3_res=4/data.parquet'
  WHERE timestamp = (SELECT MAX(timestamp) FROM 'https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/walkthru-earth/indices/weather/model=GraphCast_GFS/date=2026-06-01/hour=12/h3_res=4/data.parquet')
    AND temperature_2m_C > 40
),
cities AS (
  SELECT city, country_code, population,
         h3_latlng_to_cell(lat, lon, 4)::BIGINT AS h3_index
  FROM 'https://raw.githubusercontent.com/tabaqatdev/gdelt-cng/refs/heads/main/data_helpers/world_cities.parquet'
  WHERE population > 200000
)
SELECT c.city, c.country_code, c.population, ROUND(h.value, 1) AS temp_c
FROM cities c
JOIN hot h USING (h3_index)
ORDER BY temp_c DESC, c.population DESC;
```

Sample result, top cities over 200k population.

| city | country | pop | temp_c |
|---|---|---|---|
| Dadu | PK | 201k | 44.6 |
| Larkana | PK | 364k | 44.1 |
| Abadan | IR | 370k | 44.0 |
| Basrah | IQ | 1.3M | 43.7 |
| Ahvaz | IR | 841k | 43.4 |
| Makkah | SA | 1.6M | 41.7 |
| Baghdad | IQ | 7.2M | 40.7 |

## MotherDuck note (two-step)

On MotherDuck, joining the remote S3 weather file with a second remote parquet in one plan that also calls H3 functions throws `INTERNAL Error: Failed to find function parquet_scan()`. Split it. Materialize the hot cells first, then join the cities file to the local table.

```sql
CREATE OR REPLACE TEMP TABLE hot_cells AS
SELECT h3_index, temperature_2m_C AS t
FROM 'https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/walkthru-earth/indices/weather/model=GraphCast_GFS/date=2026-06-01/hour=12/h3_res=4/data.parquet'
WHERE timestamp = (SELECT MAX(timestamp) FROM 'https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/walkthru-earth/indices/weather/model=GraphCast_GFS/date=2026-06-01/hour=12/h3_res=4/data.parquet')
  AND temperature_2m_C > 40;

WITH cities AS (
  SELECT city, country_code, population,
         h3_latlng_to_cell(lat, lon, 4)::BIGINT AS h3_index
  FROM read_parquet('https://raw.githubusercontent.com/tabaqatdev/gdelt-cng/refs/heads/main/data_helpers/world_cities.parquet')
  WHERE population > 200000
)
SELECT c.city, c.country_code, c.population, ROUND(h.t, 1) AS temp_c
FROM cities c JOIN hot_cells h USING (h3_index)
ORDER BY temp_c DESC;
```

Also note, H3 functions force the plan onto the MotherDuck server, which does not follow the `github.com/.../raw/` redirect. Use the direct `raw.githubusercontent.com` URL. Do not run `LOAD h3` or `LOAD spatial` over the MotherDuck connection, they run server-side automatically.

In DuckDB-WASM (the in-app engine) the single-query forms in Q1 and Q2 work as written, no temp table needed.

## More questions, same pattern

Swap the file and the WHERE clause, keep the join layer the same.

- Coldest inhabited places, `temperature_2m_C < 0` on the weather file.
- Heaviest forecast rain, `precipitation_mm_6hr > 20`, column `precipitation_mm_6hr`.
- Windiest cities, `wind_speed_10m_ms > 15`.
- Most populous cities in a country, population file `pop_2025`, filter the country with the boundary join.
- Highest-altitude cities, terrain file `elev`, join cities.
- Densest building stock by country, building file `count` or `volume_density_m3_per_km2`.

## Files changed to enable this in-app

- `src/lib/tambo/context/reference-layers.ts`, new context module with the two reference layers and the SQL patterns the AI follows.
- `src/lib/tambo/context/index.ts`, wires `referenceLayers` into the AI context.
- `src/lib/tambo/suggestions.ts`, adds a "Where is it hottest now" suggestion chip.

Token cost stays low because results never reach the model. `runSQL` stores the full result in the query store and returns only a queryId plus three sample rows, the components read the data from the store by queryId.
