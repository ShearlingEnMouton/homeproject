package models

import (
	"time"
)

type MeteoFranceCurrent struct {
	MeasuredAt time.Time `json:"measured_at"`

	TempC *float32 `json:"temp_c,omitempty"`

	Humidity *float32 `json:"humidity,omitempty"`

	WindSpeed *float32 `json:"wind_speed,omitempty"`

	WindDirection *float32 `json:"wind_direction,omitempty"`

	Pressure *float32 `json:"pressure,omitempty"`

	Precip1h *float32 `json:"precip_1h,omitempty"`
}
