package main

import (
	"syscall/js"
)

func main() {
	c := make(chan struct{}, 0)
	js.Global().Set("ChessAi", js.FuncOf(calc))
	<-c
}

func calc(this js.Value, i []js.Value) interface{} {
	var fen string = i[0].String()
	//var depth string = i[1].String()

	game, err := loadFen(&fen)

	if err != nil {
		return err.Error()
	}

	//printPosition(&game)

	//var move Move = randomMove(&game)
	var move, _ = calculate(&game, 3)

	return moveToString(move)
}

/*
func main() {
	var initialPosition string = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
	game, err := loadFen(&initialPosition)

	if err != nil {
		println(err.Error())
	}

	calculate(&game, Move{}, 5)
}
*/
