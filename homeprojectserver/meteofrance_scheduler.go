package homeprojectserver

import (
	"context"
	"sync"
	"time"

	"github.com/ShearlingEnMouton/library/logger"
)

const (
	meteoFrancePollInterval    = time.Hour
	meteoFrancePollTimeout     = 20 * time.Second
	meteoFranceMinRefresh      = 10 * time.Minute
	meteoFranceOnDemandTimeout = 8 * time.Second
)

var (
	meteoFranceRefreshMu   sync.Mutex
	meteoFranceLastRefresh time.Time
)

// StartMeteoFranceScheduler polls the Meteo-France observation and forecast
// APIs on an hourly interval and stores the results, until ctx is done. It
// fetches once immediately (in the background) so data shows up right away
// rather than waiting a full interval after startup.
func StartMeteoFranceScheduler(ctx context.Context) {
	go runMeteoFranceScheduler(ctx)
}

func runMeteoFranceScheduler(ctx context.Context) {
	refreshMeteoFranceIfStale(ctx)

	ticker := time.NewTicker(meteoFrancePollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			refreshMeteoFranceIfStale(ctx)
		}
	}
}

// refreshMeteoFranceIfStale fetches from Meteo-France unless a fetch already
// ran in the last meteoFranceMinRefresh. The mutex makes concurrent callers
// (scheduler, page loads) share one fetch and serialises the token handling.
func refreshMeteoFranceIfStale(ctx context.Context) {
	meteoFranceRefreshMu.Lock()
	defer meteoFranceRefreshMu.Unlock()
	if time.Since(meteoFranceLastRefresh) < meteoFranceMinRefresh {
		return
	}
	meteoFranceLastRefresh = time.Now()
	pollMeteoFranceOnce(ctx)
}

// refreshMeteoFranceOnDemand is called by the API handlers so a page load
// sees fresh data. It is detached from the request so a closed tab does not
// abort the fetch, and bounded so a slow upstream only delays the page briefly.
func refreshMeteoFranceOnDemand(ctx context.Context) {
	rctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), meteoFranceOnDemandTimeout)
	defer cancel()
	refreshMeteoFranceIfStale(rctx)
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
