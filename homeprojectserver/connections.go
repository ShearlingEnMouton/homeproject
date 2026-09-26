package homeprojectserver

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/ShearlingEnMouton/homeproject/models"
	mqtt "github.com/eclipse/paho.mqtt.golang"
	pgxpool "github.com/jackc/pgx/v5/pgxpool"
)

var (
	DBHostname string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBConn     *pgxpool.Pool

	MQTTBroker   string
	MQTTUser     string
	MQTTPassword string
	MQTTClientID string
	MQTTClient   mqtt.Client
)

func DBUrl() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable&search_path=homeproject", DBUser, DBPassword, DBHostname, DBPort, DBName)
}

func writeStandardResponse(r *http.Request, w http.ResponseWriter, grpcToken string, message string) {
	responseObj := &models.Response{
		Token:   grpcToken,
		Message: message,
	}

	response, _ := json.Marshal(responseObj)
	w.Write(response)
}
