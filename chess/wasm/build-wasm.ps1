$Env:GOARCH ="wasm"
$Env:GOOS = "js"
go build -o ..\chess.wasm main.go chess.go