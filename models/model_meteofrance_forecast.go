package models

import (
	"time"
)

type MeteoFranceDailyForecast struct {
	Date string `json:"date"`

	TempMin *float32 `json:"temp_min,omitempty"`

	TempMax *float32 `json:"temp_max,omitempty"`

	HumidityMin *float32 `json:"humidity_min,omitempty"`

	HumidityMax *float32 `json:"humidity_max,omitempty"`

	Precip24h *float32 `json:"precip_24h,omitempty"`

	UV *float32 `json:"uv,omitempty"`

	WeatherDesc string `json:"weather_desc,omitempty"`
}

type MeteoFranceHourlyForecast struct {
	ForecastFor time.Time `json:"forecast_for"`

	TempC *float32 `json:"temp_c,omitempty"`

	WindchillC *float32 `json:"windchill_c,omitempty"`

	Humidity *float32 `json:"humidity,omitempty"`

	WindSpeed *float32 `json:"wind_speed,omitempty"`

	WindDirection *float32 `json:"wind_direction,omitempty"`

	Rain1h *float32 `json:"rain_1h,omitempty"`

	Clouds *float32 `json:"clouds,omitempty"`

	WeatherDesc string `json:"weather_desc,omitempty"`
}

type MeteoFranceForecast struct {
	Daily []MeteoFranceDailyForecast `json:"daily"`

	Hourly []MeteoFranceHourlyForecast `json:"hourly"`
}
