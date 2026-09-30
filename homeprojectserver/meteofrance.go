package homeprojectserver

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/ShearlingEnMouton/library/logger"
)

const (
	meteoFranceTokenURL           = "https://portail-api.meteofrance.fr/token"
	meteoFranceObservationBaseURL = "https://public-api.meteofrance.fr/public/DPObs/v2"
	meteoFranceForecastURL        = "https://webservice.meteofrance.com/forecast"
	// Static public token used by the open-source meteofrance-api client and
	// Home Assistant's official integration for the unofficial forecast service.
	meteoFranceForecastToken = "__Wj7dVSTjV9YGu1guveLyDq0g7S7TfTjaHBTPTpO0kj8__"
)

var (
	meteoFranceHTTPClient = &http.Client{Timeout: 10 * time.Second}
	meteoFranceToken      string
)

type tokenResponse struct {
	AccessToken string `json:"access_token"`
}

func obtainMeteoFranceToken(ctx context.Context) error {
	body := strings.NewReader(url.Values{"grant_type": {"client_credentials"}}.Encode())

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, meteoFranceTokenURL, body)
	if err != nil {
		logger.Err("", "Failed to create GetToken request: %s", err)
		return err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Basic %s", ApplicationId))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := meteoFranceHTTPClient.Do(req)
	if err != nil {
		logger.Err("", "GetToken request execution failed: %s", err)
		return err
	}
	defer resp.Body.Close()

	tokenResp := &tokenResponse{}
	if err := json.NewDecoder(resp.Body).Decode(tokenResp); err != nil {
		logger.Err("", "Failed to decode token response: %s", err)
		return err
	}

	meteoFranceToken = tokenResp.AccessToken
	return nil
}

func meteoFranceRequest(ctx context.Context, method, reqURL string) (*http.Response, error) {
	if meteoFranceToken == "" {
		if err := obtainMeteoFranceToken(ctx); err != nil {
			return nil, err
		}
	}

	resp, err := doMeteoFranceRequest(ctx, method, reqURL)
	if err != nil {
		return nil, err
	}

	if meteoFranceTokenExpired(resp) {
		resp.Body.Close()
		if err := obtainMeteoFranceToken(ctx); err != nil {
			return nil, err
		}
		return doMeteoFranceRequest(ctx, method, reqURL)
	}

	return resp, nil
}

func doMeteoFranceRequest(ctx context.Context, method, reqURL string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", meteoFranceToken))
	req.Header.Set("Accept", "application/json")
	return meteoFranceHTTPClient.Do(req)
}

func meteoFranceTokenExpired(resp *http.Response) bool {
	if resp.StatusCode != http.StatusUnauthorized {
		return false
	}
	if !strings.Contains(resp.Header.Get("Content-Type"), "application/json") {
		return false
	}
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return false
	}
	resp.Body = io.NopCloser(strings.NewReader(string(bodyBytes)))
	return strings.Contains(string(bodyBytes), "Invalid JWT token")
}

// --- Observation (official DPObs API) ---
//
// meteoFranceObservation holds one hourly station reading. Field extraction
// below follows the WMO SYNOP-style abbreviated codes (t, u, ff, dd, pres,
// rr1) documented for Meteo-France's public observation API, and is written
// defensively (multiple candidate keys, tolerant of either a GeoJSON
// FeatureCollection or a flat JSON array/object) because it has not yet been
// exercised against a live response: the Application backing APPLICATION_ID
// still needs to be subscribed to the "Donnees d'Observation" (DPObs)
// product on portail-api.meteofrance.fr before the API stops returning 403.
type meteoFranceObservation struct {
	StationID     string
	MeasuredAt    time.Time
	TempC         *float32
	Humidity      *float32
	WindSpeed     *float32
	WindDirection *float32
	Pressure      *float32
	Precip1h      *float32
}

func fetchMeteoFranceObservation(ctx context.Context, stationID string) (*meteoFranceObservation, error) {
	reqURL := fmt.Sprintf("%s/station/horaire?id_station=%s&format=json", meteoFranceObservationBaseURL, url.QueryEscape(stationID))

	resp, err := meteoFranceRequest(ctx, http.MethodGet, reqURL)
	if err != nil {
		return nil, fmt.Errorf("observation request: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("observation read body: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("observation request failed: status %d: %s", resp.StatusCode, string(raw))
	}

	obs, err := parseMeteoFranceObservation(raw, stationID)
	if err != nil {
		return nil, fmt.Errorf("observation parse: %w", err)
	}
	return obs, nil
}

func parseMeteoFranceObservation(raw []byte, stationID string) (*meteoFranceObservation, error) {
	props, err := latestObservationProperties(raw)
	if err != nil {
		return nil, err
	}

	obs := &meteoFranceObservation{StationID: stationID}

	validity := extractObservationString(props, "validity_time", "reference_time", "date")
	if validity != "" {
		if t, err := time.Parse(time.RFC3339, validity); err == nil {
			obs.MeasuredAt = t
		} else if t, err := time.Parse("2006-01-02T15:04:05Z", validity); err == nil {
			obs.MeasuredAt = t
		}
	}
	if obs.MeasuredAt.IsZero() {
		obs.MeasuredAt = time.Now().UTC()
	}

	if tempK := extractObservationFloat(props, "t", "T"); tempK != nil {
		c := *tempK - 273.15
		obs.TempC = &c
	}
	obs.Humidity = extractObservationFloat(props, "u", "U", "humidity")
	obs.WindSpeed = extractObservationFloat(props, "ff", "FF")
	obs.WindDirection = extractObservationFloat(props, "dd", "DD")
	if pressurePa := extractObservationFloat(props, "pres", "PRES"); pressurePa != nil {
		h := *pressurePa / 100
		obs.Pressure = &h
	}
	obs.Precip1h = extractObservationFloat(props, "rr1", "RR1")

	if obs.TempC == nil && obs.Humidity == nil && obs.WindSpeed == nil {
		logger.Warn("", "Meteo-France observation: no known fields recognized, raw keys: %v", observationKeys(props))
	}

	return obs, nil
}

// latestObservationProperties accepts either a GeoJSON FeatureCollection
// (the documented shape for public-api.meteofrance.fr), a flat array of
// records, or a single flat object, and returns the most recent record's
// fields as a generic string-keyed map.
func latestObservationProperties(raw []byte) (map[string]json.RawMessage, error) {
	var fc struct {
		Features []struct {
			Properties map[string]json.RawMessage `json:"properties"`
		} `json:"features"`
	}
	if err := json.Unmarshal(raw, &fc); err == nil && len(fc.Features) > 0 {
		return fc.Features[len(fc.Features)-1].Properties, nil
	}

	var arr []map[string]json.RawMessage
	if err := json.Unmarshal(raw, &arr); err == nil && len(arr) > 0 {
		return arr[len(arr)-1], nil
	}

	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err == nil && len(obj) > 0 {
		return obj, nil
	}

	return nil, fmt.Errorf("unrecognized observation response shape")
}

func extractObservationFloat(props map[string]json.RawMessage, keys ...string) *float32 {
	for _, k := range keys {
		raw, ok := props[k]
		// A JSON null unmarshals into a non-pointer float64 as a silent no-op
		// (no error, value stays 0), which would otherwise be indistinguishable
		// from a real reading of 0 - so null has to be filtered out explicitly.
		if !ok || strings.TrimSpace(string(raw)) == "null" {
			continue
		}
		var v float64
		if err := json.Unmarshal(raw, &v); err == nil {
			f := float32(v)
			return &f
		}
		var s string
		if err := json.Unmarshal(raw, &s); err == nil {
			if f, err := strconv.ParseFloat(s, 64); err == nil {
				f32 := float32(f)
				return &f32
			}
		}
	}
	return nil
}

func extractObservationString(props map[string]json.RawMessage, keys ...string) string {
	for _, k := range keys {
		raw, ok := props[k]
		if !ok {
			continue
		}
		var v string
		if err := json.Unmarshal(raw, &v); err == nil {
			return v
		}
	}
	return ""
}

func observationKeys(props map[string]json.RawMessage) []string {
	keys := make([]string, 0, len(props))
	for k := range props {
		keys = append(keys, k)
	}
	return keys
}

func saveMeteoFranceObservation(ctx context.Context, o *meteoFranceObservation) error {
	_, err := DBConn.Exec(ctx, `
		INSERT INTO meteofrance_observations
			(station_id, measured_at, temp_c, humidity, wind_speed, wind_direction, pressure, precip_1h)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (station_id, measured_at) DO NOTHING
	`, o.StationID, o.MeasuredAt, o.TempC, o.Humidity, o.WindSpeed, o.WindDirection, o.Pressure, o.Precip1h)
	if err != nil {
		return fmt.Errorf("insert observation: %w", err)
	}
	return nil
}

// --- Forecast (unofficial webservice.meteofrance.com API) ---
//
// Response shape confirmed against a live call: top-level keys position,
// updated_on, daily_forecast, forecast, probability_forecast.

type meteoFranceForecastResponse struct {
	Position struct {
		Lat  float64 `json:"lat"`
		Lon  float64 `json:"lon"`
		Name string  `json:"name"`
	} `json:"position"`
	UpdatedOn     int64                       `json:"updated_on"`
	DailyForecast []meteoFranceDailyForecast  `json:"daily_forecast"`
	Forecast      []meteoFranceHourlyForecast `json:"forecast"`
}

type meteoFranceDailyForecast struct {
	Dt int64 `json:"dt"`
	T  struct {
		Min *float32 `json:"min"`
		Max *float32 `json:"max"`
	} `json:"T"`
	Humidity struct {
		Min *float32 `json:"min"`
		Max *float32 `json:"max"`
	} `json:"humidity"`
	Precipitation struct {
		H24 *float32 `json:"24h"`
	} `json:"precipitation"`
	UV         *float32 `json:"uv"`
	Weather12H struct {
		Desc string `json:"desc"`
	} `json:"weather12H"`
}

type meteoFranceHourlyForecast struct {
	Dt int64 `json:"dt"`
	T  struct {
		Value     *float32 `json:"value"`
		Windchill *float32 `json:"windchill"`
	} `json:"T"`
	Humidity *float32 `json:"humidity"`
	Wind     struct {
		Speed     *float32 `json:"speed"`
		Direction *float32 `json:"direction"`
	} `json:"wind"`
	Rain struct {
		H1 *float32 `json:"1h"`
	} `json:"rain"`
	Clouds  *float32 `json:"clouds"`
	Weather struct {
		Desc string `json:"desc"`
	} `json:"weather"`
}

func fetchMeteoFranceForecast(ctx context.Context, lat, lon float64) (*meteoFranceForecastResponse, error) {
	reqURL := fmt.Sprintf("%s?lat=%s&lon=%s&token=%s",
		meteoFranceForecastURL,
		strconv.FormatFloat(lat, 'f', -1, 64),
		strconv.FormatFloat(lon, 'f', -1, 64),
		meteoFranceForecastToken,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("forecast request build: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := meteoFranceHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("forecast request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("forecast request failed: status %d: %s", resp.StatusCode, string(body))
	}

	var fc meteoFranceForecastResponse
	if err := json.NewDecoder(resp.Body).Decode(&fc); err != nil {
		return nil, fmt.Errorf("forecast decode: %w", err)
	}
	return &fc, nil
}

func saveMeteoFranceForecast(ctx context.Context, fc *meteoFranceForecastResponse) error {
	tx, err := DBConn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx)

	issuedAt := time.Now().UTC()
	if fc.UpdatedOn > 0 {
		issuedAt = time.Unix(fc.UpdatedOn, 0).UTC()
	}

	for _, d := range fc.DailyForecast {
		_, err = tx.Exec(ctx, `
			INSERT INTO meteofrance_forecast_daily
				(issued_at, forecast_date, temp_min, temp_max, humidity_min, humidity_max, precip_24h, uv, weather_desc)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT (forecast_date) DO UPDATE SET
				issued_at = EXCLUDED.issued_at,
				temp_min = EXCLUDED.temp_min,
				temp_max = EXCLUDED.temp_max,
				humidity_min = EXCLUDED.humidity_min,
				humidity_max = EXCLUDED.humidity_max,
				precip_24h = EXCLUDED.precip_24h,
				uv = EXCLUDED.uv,
				weather_desc = EXCLUDED.weather_desc
		`, issuedAt, time.Unix(d.Dt, 0).UTC().Format("2006-01-02"),
			d.T.Min, d.T.Max, d.Humidity.Min, d.Humidity.Max, d.Precipitation.H24, d.UV, d.Weather12H.Desc)
		if err != nil {
			return fmt.Errorf("insert daily forecast: %w", err)
		}
	}

	for _, h := range fc.Forecast {
		_, err = tx.Exec(ctx, `
			INSERT INTO meteofrance_forecast_hourly
				(issued_at, forecast_for, temp_c, windchill_c, humidity, wind_speed, wind_direction, rain_1h, clouds, weather_desc)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			ON CONFLICT (forecast_for) DO UPDATE SET
				issued_at = EXCLUDED.issued_at,
				temp_c = EXCLUDED.temp_c,
				windchill_c = EXCLUDED.windchill_c,
				humidity = EXCLUDED.humidity,
				wind_speed = EXCLUDED.wind_speed,
				wind_direction = EXCLUDED.wind_direction,
				rain_1h = EXCLUDED.rain_1h,
				clouds = EXCLUDED.clouds,
				weather_desc = EXCLUDED.weather_desc
		`, issuedAt, time.Unix(h.Dt, 0).UTC(),
			h.T.Value, h.T.Windchill, h.Humidity, h.Wind.Speed, h.Wind.Direction, h.Rain.H1, h.Clouds, h.Weather.Desc)
		if err != nil {
			return fmt.Errorf("insert hourly forecast: %w", err)
		}
	}

	return tx.Commit(ctx)
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := obtainMeteoFranceToken(ctx); err != nil {
		logger.Err("", "Failed to retreive access token: %s", err)
		return
	}
	logger.Debug("", meteoFranceToken)
}
