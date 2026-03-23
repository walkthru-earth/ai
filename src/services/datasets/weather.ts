import type { DatasetDefinition } from "./types";
import { S3_BASE } from "./types";

const WEATHER_BASE = `${S3_BASE}/indices/weather/model=GraphCast_GFS`;

export const weatherDataset: DatasetDefinition = {
  id: "weather",
  name: "AI Weather Forecast (GraphCast)",
  description:
    "NOAA GraphCast AI weather forecasts. Temp, wind, shear, humidity, moisture flux, pressure, precip, geopotential. Res 1-5. " +
    "FORECAST STRUCTURE: Each file = 5-day horizon (21 timestamps, 6-hourly in 'timestamp' column). " +
    "For multi-day forecasts, query ONE file — do NOT build URLs for future dates (only latest run exists). " +
    "Use buildParquetUrl('weather') to resolve latest date. Filter: WHERE CAST(timestamp AS TIMESTAMP) <= CAST((SELECT MIN(timestamp) FROM ...) AS TIMESTAMP) + INTERVAL 'N hours'. " +
    "Clamp precip: GREATEST(precipitation_mm_6hr, 0).",
  columns: [
    "h3_index",
    "timestamp",
    "temperature_2m_C",
    "temperature_850hPa_C",
    "temp_diff_850hPa_2m_C",
    "wind_speed_10m_ms",
    "wind_direction_10m_deg",
    "wind_speed_850hPa_ms",
    "wind_direction_850hPa_deg",
    "wind_u_10m_ms",
    "wind_v_10m_ms",
    "wind_u_850hPa_ms",
    "wind_v_850hPa_ms",
    "wind_shear_magnitude_ms",
    "wind_shear_direction_deg",
    "specific_humidity_gkg",
    "moisture_flux_u",
    "moisture_flux_v",
    "moisture_flux_magnitude",
    "pressure_msl_hPa",
    "precipitation_mm_6hr",
    "vertical_velocity_500hPa_Pas",
    "geopotential_500hPa_m",
    "geopotential_anomaly_500hPa_m",
  ],
  columnDescriptions: {
    h3_index: "H3 hexagonal cell identifier (BigInt)",
    timestamp: "Forecast timestamp (UTC)",
    temperature_2m_C: "Air temperature at 2 meters above ground (Celsius)",
    temperature_850hPa_C: "Temperature at 850 hPa pressure level (Celsius)",
    temp_diff_850hPa_2m_C: "Temperature difference between 850hPa and 2m (Celsius, inversion indicator)",
    wind_speed_10m_ms: "Wind speed at 10 meters above ground (m/s)",
    wind_direction_10m_deg: "Wind direction at 10m (degrees, 0-360)",
    wind_speed_850hPa_ms: "Wind speed at 850 hPa (m/s)",
    wind_direction_850hPa_deg: "Wind direction at 850 hPa (degrees, 0-360)",
    wind_u_10m_ms: "U-component (east-west) of wind at 10m (m/s)",
    wind_v_10m_ms: "V-component (north-south) of wind at 10m (m/s)",
    wind_u_850hPa_ms: "U-component of wind at 850 hPa (m/s)",
    wind_v_850hPa_ms: "V-component of wind at 850 hPa (m/s)",
    wind_shear_magnitude_ms: "Wind shear magnitude between surface and 850hPa (m/s)",
    wind_shear_direction_deg: "Wind shear direction (degrees, 0-360)",
    specific_humidity_gkg: "Specific humidity (g/kg)",
    moisture_flux_u: "U-component of moisture flux",
    moisture_flux_v: "V-component of moisture flux",
    moisture_flux_magnitude: "Moisture flux magnitude",
    pressure_msl_hPa: "Mean sea level pressure (hectopascals)",
    precipitation_mm_6hr: "6-hour accumulated precipitation (mm)",
    vertical_velocity_500hPa_Pas: "Vertical velocity at 500 hPa (Pa/s, negative = upward)",
    geopotential_500hPa_m: "Geopotential height at 500 hPa (meters)",
    geopotential_anomaly_500hPa_m: "Geopotential anomaly at 500 hPa (meters, deviation from climatology)",
  },
  urlPattern: `${WEATHER_BASE}/date={date}/hour={hour}/h3_res={h3_res}/data.parquet`,
  h3ResRange: [1, 5],
  defaultH3Res: 3,
  category: "weather",
};
