#!/bin/bash
set -e

echo "Generating homeproject package"
protoc --go_out=homeprojectrpc --go_opt=paths=source_relative  --go-grpc_out=homeprojectrpc --go-grpc_opt=paths=source_relative homeproject.proto

echo "cleaning modules"
go mod tidy

set +e
echo "Building package"
goBuildResult=$(go build -a -installsuffix cgo -o app . 2>&1)
if [[ "$?" != "0" ]]; then
    echo -e "\e[31m!!Building package: fail \e[0m"
    echo -e "$goBuildResult"
    exit 
fi