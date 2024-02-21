$Env:GOARCH ="amd64"
$Env:GOOS = "windows"
go build -o chess.exe main.go chess.go
.\chess.exe