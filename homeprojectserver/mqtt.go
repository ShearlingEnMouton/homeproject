package homeprojectserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/ShearlingEnMouton/library/logger"
	mqtt "github.com/eclipse/paho.mqtt.golang"
)

const (
	shellyTopic    = "+/events/rpc"
	connectTimeout = 10 * time.Second
	saveTimeout    = 5 * time.Second
	maxClockSkew   = time.Minute
)

var minValidTime = time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

type shellyFrame struct {
	Src    string                     `json:"src"`
	Method string                     `json:"method"`
	Params map[string]json.RawMessage `json:"params"`
}

type shellyComponent struct {
	TC      *float32 `json:"tC"`
	RH      *float32 `json:"rh"`
	Battery *struct {
		Percent *int32 `json:"percent"`
	} `json:"battery"`
}

type shellyReading struct {
	DeviceID         string
	Prefix           string
	MeasuredAt       time.Time
	UsedReceivedTime bool
	TempC            *float32
	Humidity         *float32
	Battery          *int32
}

func ConnectMQTT() error {
	opts := mqtt.NewClientOptions().
		AddBroker(MQTTBroker).
		SetClientID(MQTTClientID).
		SetUsername(MQTTUser).
		SetPassword(MQTTPassword).
		SetCleanSession(false).
		SetAutoReconnect(true).
		SetDefaultPublishHandler(onShellyMessage).
		SetOnConnectHandler(func(c mqtt.Client) {
			token := c.Subscribe(shellyTopic, 1, onShellyMessage)
			if token.Wait(); token.Error() != nil {
				logger.Err("", "Error subscribing to %s: %s", shellyTopic, token.Error())
				return
			}
			logger.Info("", "MQTT connected to %s, subscribed to %s", MQTTBroker, shellyTopic)
		}).
		SetConnectionLostHandler(func(_ mqtt.Client, err error) {
			logger.Warn("", "MQTT connection lost: %s", err)
		})

	MQTTClient = mqtt.NewClient(opts)
	token := MQTTClient.Connect()
	if !token.WaitTimeout(connectTimeout) {
		return errors.New("mqtt connect timeout")
	}
	return token.Error()
}

func onShellyMessage(_ mqtt.Client, msg mqtt.Message) {
	reading, ok, err := parseShelly(msg.Topic(), msg.Payload(), time.Now())
	if err != nil {
		logger.Err("", "Error parsing MQTT message on %s: %s", msg.Topic(), err)
		return
	}
	if !ok {
		return
	}
	if reading.UsedReceivedTime {
		logger.Warn("", "Invalid device timestamp from %s, using received time", reading.DeviceID)
	}

	ctx, cancel := context.WithTimeout(context.Background(), saveTimeout)
	defer cancel()
	if err := saveReading(ctx, reading); err != nil {
		logger.Err("", "Error saving reading from %s: %s", reading.DeviceID, err)
	}
}

func parseShelly(topic string, payload []byte, received time.Time) (shellyReading, bool, error) {
	prefix, found := strings.CutSuffix(topic, "/events/rpc")
	if !found {
		return shellyReading{}, false, nil
	}

	var frame shellyFrame
	if err := json.Unmarshal(payload, &frame); err != nil {
		return shellyReading{}, false, fmt.Errorf("decode frame: %w", err)
	}
	if frame.Method != "NotifyStatus" && frame.Method != "NotifyFullStatus" {
		return shellyReading{}, false, nil
	}

	reading := shellyReading{DeviceID: frame.Src, Prefix: prefix}
	if reading.DeviceID == "" {
		reading.DeviceID = prefix
	}

	var ts float64
	for key, raw := range frame.Params {
		if key == "ts" {
			if err := json.Unmarshal(raw, &ts); err != nil {
				return shellyReading{}, false, fmt.Errorf("decode ts: %w", err)
			}
			continue
		}

		kind, _, _ := strings.Cut(key, ":")
		if kind != "temperature" && kind != "humidity" && kind != "devicepower" {
			continue
		}

		var component shellyComponent
		if err := json.Unmarshal(raw, &component); err != nil {
			return shellyReading{}, false, fmt.Errorf("decode %s: %w", key, err)
		}
		switch kind {
		case "temperature":
			reading.TempC = component.TC
		case "humidity":
			reading.Humidity = component.RH
		case "devicepower":
			if component.Battery != nil {
				reading.Battery = component.Battery.Percent
			}
		}
	}

	if reading.TempC == nil && reading.Humidity == nil && reading.Battery == nil {
		return shellyReading{}, false, nil
	}

	reading.MeasuredAt, reading.UsedReceivedTime = measuredAt(ts, received)
	return reading, true, nil
}

func measuredAt(ts float64, received time.Time) (time.Time, bool) {
	if ts <= 0 {
		return received, true
	}
	sec, frac := math.Modf(ts)
	t := time.Unix(int64(sec), int64(frac*1e9))
	if t.Before(minValidTime) || t.After(received.Add(maxClockSkew)) {
		return received, true
	}
	return t, false
}

func saveReading(ctx context.Context, r shellyReading) error {
	tx, err := DBConn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`INSERT INTO devices (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
		r.DeviceID, r.Prefix)
	if err != nil {
		return fmt.Errorf("insert device: %w", err)
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO readings (device_id, measured_at, temp_c, humidity, battery)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (device_id, measured_at) DO NOTHING`,
		r.DeviceID, r.MeasuredAt, r.TempC, r.Humidity, r.Battery)
	if err != nil {
		return fmt.Errorf("insert reading: %w", err)
	}

	return tx.Commit(ctx)
}
