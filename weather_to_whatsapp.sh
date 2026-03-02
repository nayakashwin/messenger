#!/usr/bin/env bash

# Usage:
#   curl "https://api.openweathermap.org/data/2.5/weather?zip=63017&appid=YOUR_KEY&units=metric" | ./weather_to_whatsapp.sh
#   or
#   ./weather_to_whatsapp.sh weather.json

set -euo pipefail

# Read JSON from stdin or from file argument
if [ $# -eq 0 ]; then
    INPUT=$(cat)
else
    INPUT=$(cat "$1")
fi

# Check if we got valid data
COD=$(echo "$INPUT" | jq -r '.cod // empty')
if [ "$COD" != "200" ]; then
    echo "Error: API returned code $COD"
    echo "$INPUT" | jq .
    exit 1
fi

# Extract fields
CITY=$(echo "$INPUT" | jq -r '.name')
if [ -z "$CITY" ] || [ "$CITY" = "null" ]; then
    CITY="Unknown location"
fi

DESC=$(echo "$INPUT" | jq -r '.weather[0].description // "no description"')
DESC="${DESC^}"   # Capitalize first letter

TEMP=$(echo "$INPUT" | jq -r '.main.temp // "n/a"')
FEELS=$(echo "$INPUT" | jq -r '.main.feels_like // "n/a"')
HUMIDITY=$(echo "$INPUT" | jq -r '.main.humidity // "n/a"')
WIND_MS=$(echo "$INPUT" | jq -r '.wind.speed // "n/a"')
WIND_KMH=$(awk "BEGIN {printf \"%.1f\", $WIND_MS * 3.6}" 2>/dev/null || echo "n/a")

# Icon/emoji based on main weather condition
MAIN=$(echo "$INPUT" | jq -r '.weather[0].main // ""')
case "$MAIN" in
    Clear)          EMOJI="☀️" ;;
    Clouds)         EMOJI="☁️" ;;
    Rain|Drizzle)   EMOJI="🌧️" ;;
    Thunderstorm)   EMOJI="⛈️" ;;
    Snow)           EMOJI="❄️" ;;
    Mist|Fog|Haze)  EMOJI="🌫️" ;;
    *)              EMOJI="🌤️" ;;
esac

# Build nice message
cat << EOF
🌤️ *Current weather in $CITY*

$EMOJI $DESC
Temperature: ${TEMP}°F
Feels like:  ${FEELS}°F
Humidity:    ${HUMIDITY}%
Wind:        ${WIND_MS} m/s ≈ ${WIND_MS} mph

(Updated from OpenWeatherMap)
EOF

# Optional one-liner style (uncomment if you prefer shorter version)
# echo "$EMOJI $CITY now: ${TEMP}°C (feels ${FEELS}°C) – $DESC • Humidity ${HUMIDITY}% • Wind ${WIND_KMH} km/h"
