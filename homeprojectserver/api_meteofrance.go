package homeprojectserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/ShearlingEnMouton/homeproject/models"
	"github.com/ShearlingEnMouton/library/grpctoken"
	"github.com/ShearlingEnMouton/library/logger"
	"github.com/jackc/pgx/v5"
)

const meteoFranceForecastHourlyLimit = 48

func GetMeteoFranceCurrent(w http.ResponseWriter, r *http.Request) {
	ctx, grpcToken := grpctoken.CreateContextFromHeader(r, "")

	cur := models.MeteoFranceCurrent{}
	err := DBConn.QueryRow(ctx, `
	SELECT measured_at, temp_c, humidity, wind_speed, wind_direction, pressure, precip_1h
	FROM meteofrance_observations
	WHERE station_id = $1
	ORDER BY measured_at DESC, received_at DESC
	LIMIT 1
	`, MeteoFranceStationID).Scan(&cur.MeasuredAt, &cur.TempC, &cur.Humidity, &cur.WindSpeed, &cur.WindDirection, &cur.Pressure, &cur.Precip1h)
	if errors.Is(err, pgx.ErrNoRows) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		writeStandardResponse(r, w, grpcToken, "no meteofrance observation yet")
		return
	}
	if err != nil {
		logger.Err(grpcToken, "Error GetMeteoFranceCurrent query: %s", err)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		writeStandardResponse(r, w, grpcToken, fmt.Sprintf("Error GetMeteoFranceCurrent query: %s", err))
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	response, _ := json.Marshal(cur)
	w.Write(response)
}

func GetMeteoFranceForecast(w http.ResponseWriter, r *http.Request) {
	ctx, grpcToken := grpctoken.CreateContextFromHeader(r, "")

	daily, err := queryMeteoFranceDailyForecast(ctx)
	if err != nil {
		logger.Err(grpcToken, "Error GetMeteoFranceForecast daily query: %s", err)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		writeStandardResponse(r, w, grpcToken, fmt.Sprintf("Error GetMeteoFranceForecast daily query: %s", err))
		return
	}

	hourly, err := queryMeteoFranceHourlyForecast(ctx)
	if err != nil {
		logger.Err(grpcToken, "Error GetMeteoFranceForecast hourly query: %s", err)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		writeStandardResponse(r, w, grpcToken, fmt.Sprintf("Error GetMeteoFranceForecast hourly query: %s", err))
		return
	}

	if len(daily) == 0 && len(hourly) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		writeStandardResponse(r, w, grpcToken, "no meteofrance forecast yet")
		return
	}

	res := models.MeteoFranceForecast{Daily: daily, Hourly: hourly}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	response, _ := json.Marshal(res)
	w.Write(response)
}

func queryMeteoFranceDailyForecast(ctx context.Context) ([]models.MeteoFranceDailyForecast, error) {
	rows, err := DBConn.Query(ctx, `
	SELECT forecast_date, temp_min, temp_max, humidity_min, humidity_max, precip_24h, uv, weather_desc
	FROM meteofrance_forecast_daily
	WHERE forecast_date >= CURRENT_DATE
	ORDER BY forecast_date
	`)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer rows.Close()

	daily := []models.MeteoFranceDailyForecast{}
	for rows.Next() {
		var d models.MeteoFranceDailyForecast
		var date time.Time
		if err := rows.Scan(&date, &d.TempMin, &d.TempMax, &d.HumidityMin, &d.HumidityMax, &d.Precip24h, &d.UV, &d.WeatherDesc); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		d.Date = date.Format("2006-01-02")
		daily = append(daily, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows: %w", err)
	}

	return daily, nil
}

func queryMeteoFranceHourlyForecast(ctx context.Context) ([]models.MeteoFranceHourlyForecast, error) {
	rows, err := DBConn.Query(ctx, `
	SELECT forecast_for, temp_c, windchill_c, humidity, wind_speed, wind_direction, rain_1h, clouds, weather_desc
	FROM meteofrance_forecast_hourly
	WHERE forecast_for >= now()
	ORDER BY forecast_for
	LIMIT $1
	`, meteoFranceForecastHourlyLimit)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer rows.Close()

	hourly := []models.MeteoFranceHourlyForecast{}
	for rows.Next() {
		var h models.MeteoFranceHourlyForecast
		if err := rows.Scan(&h.ForecastFor, &h.TempC, &h.WindchillC, &h.Humidity, &h.WindSpeed, &h.WindDirection, &h.Rain1h, &h.Clouds, &h.WeatherDesc); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		hourly = append(hourly, h)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows: %w", err)
	}

	return hourly, nil
}
