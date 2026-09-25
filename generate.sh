#!/bin/bash
set -e

microservice_package="homeprojectserver"
go_module="github.com/ShearlingEnMouton/homeproject"

echo "Generating models"
mkdir -p models
docker run --rm -v ${PWD}:/local --user $(id -u):$(id -g) ghcr.io/shearlingenmouton/swagger-codegen:2.4.52 generate -i /local/api/restAPI.yaml -l go-server -o /local -t /templates --additional-properties hideGenerationTimestamp=true,goModule=${go_module} -Dservice -Dmodels -DpackageName=models
mv go/* models
rm -rf go

echo "Generating api"
mkdir -p ${microservice_package}
docker run --rm -v ${PWD}:/local --user $(id -u):$(id -g) ghcr.io/shearlingenmouton/swagger-codegen:2.4.52 generate -i /local/api/restAPI.yaml -l go-server -o /local -t /templates --additional-properties hideGenerationTimestamp=true,goModule=${go_module} -Dservice -DpackageName=${microservice_package}
rm -f go/model_*
mv go/* ${microservice_package}
rm -rf go