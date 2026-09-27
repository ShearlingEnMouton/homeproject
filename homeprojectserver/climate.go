package homeprojectserver

import (
	"math"

	"github.com/ShearlingEnMouton/homeproject/models"
)

const (
	magnusA = 17.62
	magnusB = 243.12
)

func calculateClimate(tempC, humidity float32) *models.Climate {
	t, rh := float64(tempC), float64(humidity)
	if rh <= 0 {
		return nil
	}

	gamma := math.Log(rh/100) + magnusA*t/(magnusB+t)
	dewPoint := magnusB * gamma / (magnusA - gamma)

	saturation := 6.112 * math.Exp(magnusA*t/(magnusB+t))
	absoluteHumidity := 216.7 * (saturation * rh / 100) / (273.15 + t)

	vapour := 6.11 * math.Exp(5417.7530*(1/273.16-1/(273.15+dewPoint)))
	humidex := t + 0.5555*(vapour-10)

	return &models.Climate{
		DewPointC:        round1(dewPoint),
		AbsoluteHumidity: round1(absoluteHumidity),
		Humidex:          round1(humidex),
		MoldRisk:         moldRisk(t, rh),
	}
}

func moldRisk(tempC, humidity float64) string {
	if tempC < 5 {
		if humidity >= 90 {
			return "moderate"
		}
		return "low"
	}
	switch {
	case humidity >= 80:
		return "very_high"
	case humidity >= 70:
		return "high"
	case humidity >= 60:
		return "moderate"
	default:
		return "low"
	}
}

func round1(v float64) float32 {
	return float32(math.Round(v*10) / 10)
}
