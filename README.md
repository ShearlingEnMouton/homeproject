# homeproject

A small self-hosted dashboard for indoor climate monitoring. A Shelly H&T Gen3 sensor publishes temperature and humidity over MQTT, a Go server stores the readings in PostgreSQL and serves a web UI, and an optional Météo-France integration adds outdoor observations and forecasts.

## Features

- Ingests Shelly `events/rpc` messages from an MQTT broker (topic `+/events/rpc`).
- Stores devices and readings in PostgreSQL.
- REST API for devices, the latest reading with derived climate indicators, and readings over a time range.
- Single-page web UI embedded in the Go binary: latest values, history charts (uPlot), Korean, English and French.
- Optional Météo-France integration: hourly station observations, an hourly panel for the next 24 hours and a daily forecast.

## Stack

Go, PostgreSQL, Eclipse Mosquitto, plain JavaScript. Shared Go code lives in [library](https://github.com/ShearlingEnMouton/library). The database schema (`database/init/init.sql`) and the Mosquitto setup live in [localResources](https://github.com/ShearlingEnMouton/localResources).

## Configuration

Copy `.env.example` to `.env` and fill it in.

| Variable | Required | Description |
| --- | --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | yes | PostgreSQL connection. The server uses the `homeproject` schema. |
| `MQTT_BROKER` | yes | Broker URL, for example `tcp://localhost:1883`. |
| `MQTT_USER`, `MQTT_PASSWORD`, `MQTT_CLIENT_ID` | yes | MQTT credentials and client ID. |
| `APPLICATION_ID` | yes | Application credential from portail-api.meteofrance.fr, sent as a Basic authorization header when requesting an access token. |
| `METEOFRANCE_STATION_ID`, `METEOFRANCE_LAT`, `METEOFRANCE_LON` | no | Enable the Météo-France integration. Leave empty to run without it. |

## Run

1. Start PostgreSQL and Mosquitto from [localResources](https://github.com/ShearlingEnMouton/localResources) (`database/`).
2. Point the Shelly device at the broker with the MQTT credentials above.
3. Start the server:

```sh
docker compose up -d --build
```

The UI is served on port 8987.

## Code generation

The server stubs and models are generated from `api/restAPI.yaml` with swagger-codegen 2.4.52 and custom templates. `generate.sh` runs the image `ghcr.io/shearlingenmouton/swagger-codegen:2.4.52`, which is built from `swagger/` in [localResources](https://github.com/ShearlingEnMouton/localResources).
