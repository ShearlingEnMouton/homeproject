package homeprojectserver

import (
	"context"
	"time"

	"github.com/ShearlingEnMouton/library/logger"
)

const (
	meteoFrancePollInterval = time.Hour
	meteoFrancePollTimeout  = 20 * time.Second
)

// StartMeteoFranceScheduler polls the Meteo-France observation and forecast
// APIs on an hourly interval and stores the results, until ctx is done. It
// fetches once immediately (in the background) so data shows up right away
// rather than waiting a full interval after startup.
func StartMeteoFranceScheduler(ctx context.Context) {
	go runMeteoFranceScheduler(ctx)
}

func runMeteoFranceScheduler(ctx context.Context) {
	pollMeteoFranceOnce(ctx)

	ticker := time.NewTicker(meteoFrancePollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			pollMeteoFranceOnce(ctx)
		}
	}
}

func pollMeteoFranceOnce(ctx context.Context) {
	pollMeteoFranceObservation(ctx)
	pollMeteoFranceForecast(ctx)
}

func pollMeteoFranceObservation(ctx context.Context) {
	octx, cancel := context.WithTimeout(ctx, meteoFrancePollTimeout)
	defer cancel()

	obs, err := fetchMeteoFranceObservation(octx, MeteoFranceStationID)
	if err != nil {
		logger.Err("", "Meteo-France observation fetch failed: %s", err)
		return
	}
	if err := saveMeteoFranceObservation(octx, obs); err != nil {
		logger.Err("", "Meteo-France observation save failed: %s", err)
	}
}

func pollMeteoFranceForecast(ctx context.Context) {
	fctx, cancel := context.WithTimeout(ctx, meteoFrancePollTimeout)
	defer cancel()

	fc, err := fetchMeteoFranceForecast(fctx, MeteoFranceLat, MeteoFranceLon)
	if err != nil {
		logger.Err("", "Meteo-France forecast fetch failed: %s", err)
		return
	}
	if err := saveMeteoFranceForecast(fctx, fc); err != nil {
		logger.Err("", "Meteo-France forecast save failed: %s", err)
	}
}
