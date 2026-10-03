package main

import (
	"strings"
	"syscall/js"
)

func main() {
	c := make(chan struct{}, 0)
	js.Global().Set("ChessAi", js.FuncOf(calc))
	<-c
}

func calc(this js.Value, i []js.Value) (result any) {
	//a panic would exit the go program, and every later call would fail. answer "" (no move) instead
	defer func() {
		if r := recover(); r != nil {
			println("ChessAi:", r)
			result = ""
		}
	}()

	var fen string = i[0].String()

	//the difficulty level, 1 to 5, see levels
	var level int = 4
	if len(i) > 1 && i[1].Type() == js.TypeNumber {
		level = min(max(i[1].Int(), 1), len(levels))
	}

	game, err := loadFen(&fen)

	if err != nil {
		return err.Error()
	}

	//printPosition(&game)

	//positions of the game so far, comma separated (see positionKey)
	var history map[string]bool = map[string]bool{}
	if len(i) > 2 && i[2].Type() == js.TypeString {
		for key := range strings.SplitSeq(i[2].String(), ",") {
			history[key] = true
		}
	}

	//var move Move = randomMove(&game)
	var move, inBook = bookMove(&game)
	if !inBook {
		move, _ = calculate(&game, levels[level-1].depth, levels[level-1].margin, history)
	}

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
