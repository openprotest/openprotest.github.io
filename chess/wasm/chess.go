package main

import (
	"errors"
	"fmt"
	"math"
	"math/rand"
	"strconv"
	"strings"
)

type Game struct {
	placement [8][8]Piece
	color     PieceColor
	castling  string
	enPassant string
	halfMove  string
	fullMove  string
}

type PieceType byte

const (
	Pawn   = 0b00000001
	Knight = 0b00000010
	Bishop = 0b00000100
	Rook   = 0b00001000
	Queen  = 0b00010000
	King   = 0b00100000
)

type PieceColor byte

const (
	Black = 0
	White = 1
)

type Piece struct {
	piece PieceType
	color PieceColor
}

type Position struct {
	x, y int
}

type Move struct {
	p0, p1 Position
}

func loadFen(fen *string) (Game, error) {
	var placement [8][8]Piece
	var color PieceColor
	var castling string
	var enPassant string
	var halfMove string
	var fullMove string

	var array []string = strings.Split(*fen, " ")

	if len(array) < 4 {
		return Game{}, errors.New("invalid fen")
	}

	var pos_x int = 0
	var pos_y int = 0

	for i := 0; i < len(array[0]); i++ {
		var target string = string(array[0][i])

		if target == "/" {
			pos_x = 0
			pos_y++
			continue
		}

		if v, err := strconv.Atoi(target); err == nil { //is a number
			pos_x += v
			continue
		}

		switch target {
		case "p":
			placement[pos_x][pos_y] = Piece{piece: Pawn, color: Black}
			break
		case "n":
			placement[pos_x][pos_y] = Piece{piece: Knight, color: Black}
			break
		case "b":
			placement[pos_x][pos_y] = Piece{piece: Bishop, color: Black}
			break
		case "r":
			placement[pos_x][pos_y] = Piece{piece: Rook, color: Black}
			break
		case "q":
			placement[pos_x][pos_y] = Piece{piece: Queen, color: Black}
			break
		case "k":
			placement[pos_x][pos_y] = Piece{piece: King, color: Black}
			break

		case "P":
			placement[pos_x][pos_y] = Piece{piece: Pawn, color: White}
			break
		case "N":
			placement[pos_x][pos_y] = Piece{piece: Knight, color: White}
			break
		case "B":
			placement[pos_x][pos_y] = Piece{piece: Bishop, color: White}
			break
		case "R":
			placement[pos_x][pos_y] = Piece{piece: Rook, color: White}
			break
		case "Q":
			placement[pos_x][pos_y] = Piece{piece: Queen, color: White}
			break
		case "K":
			placement[pos_x][pos_y] = Piece{piece: King, color: White}
			break
		}

		pos_x++
	}

	if array[1] == "w" {
		color = White
	} else {
		color = Black
	}

	castling = array[2]
	enPassant = array[3]
	halfMove = array[4]
	fullMove = array[5]

	return Game{placement, color, castling, enPassant, halfMove, fullMove}, nil
}

func moveToString(move Move) string {
	if move.p0.x == 0 && move.p0.y == 0 && move.p1.x == 0 && move.p1.y == 0 {
		return ""
	}

	var builder strings.Builder
	builder.WriteString(fmt.Sprintf("%c", 97+move.p0.x))
	builder.WriteString(strconv.Itoa(8 - move.p0.y))
	builder.WriteString("-")
	builder.WriteString(fmt.Sprintf("%c", 97+move.p1.x))
	builder.WriteString(strconv.Itoa(8 - move.p1.y))
	return builder.String()
}

func flipColor(color PieceColor) PieceColor {
	if color == White {
		return Black
	} else {
		return White
	}
}

func printPosition(game *Game) {
	for y := 0; y < 8; y++ {
		print(8 - y)
		print("  ")
		for x := 0; x < 8; x++ {
			var l string

			switch game.placement[x][y].piece {
			case 0b00000000:
				l = " "
				break

			case Pawn:
				l = "p"
				break

			case Knight:
				l = "n"
				break

			case Bishop:
				l = "b"
				break

			case Rook:
				l = "r"
				break

			case Queen:
				l = "q"
				break

			case King:
				l = "k"
				break
			}

			if game.placement[x][y].color == White {
				print(strings.ToUpper(l))
			} else {
				print(l)
			}
			print(" ")

		}
		println(" ")
	}

	println(" ")
}

func pawnMoves(game *Game, color PieceColor, p *Position) []Move {
	var moves []Move

	if game.placement[p.x][p.y].color == White {

		if game.placement[p.x][p.y-1].piece == 0 { //1 squares forward
			moves = append(moves, Move{Position{p.x, p.y}, Position{p.x, p.y - 1}})
		}

		if p.y == 6 && //2 squares forward
			game.placement[p.x][p.y-2].piece == 0 && game.placement[p.x][p.y-1].piece == 0 {
			moves = append(moves, Move{Position{p.x, p.y}, Position{p.x, p.y - 2}})
		}

		if p.x > 0 && //capture left
			game.placement[p.x-1][p.y-1].piece != 0 &&
			game.placement[p.x-1][p.y-1].color != color {
			moves = append(moves, Move{Position{p.x, p.y}, Position{p.x - 1, p.y - 1}})
		}

		if p.x < 7 && //capture right
			game.placement[p.x+1][p.y-1].piece != 0 &&
			game.placement[p.x+1][p.y-1].color != color {
			moves = append(moves, Move{Position{p.x, p.y}, Position{p.x + 1, p.y - 1}})
		}

		if game.enPassant != "-" { //enPassant
			var enPassant_x int = int(byte(game.enPassant[0]) - 97)
			var enPassant_y int = int(8 - byte(game.enPassant[1]))
			if enPassant_y == p.y && math.Abs(float64(enPassant_x-p.x)) == 1 {
				moves = append(moves, Move{Position{p.x, p.y}, Position{enPassant_x, enPassant_y - 1}})
			}
		}

	} else { //black

		if game.placement[p.x][p.y+1].piece == 0 { //1 squares forward
			moves = append(moves, Move{Position{p.x, p.y}, Position{p.x, p.y + 1}})
		}

		if p.y == 1 && //2 squares forward
			game.placement[p.x][p.y+2].piece == 0 && game.placement[p.x][p.y+1].piece == 0 {
			moves = append(moves, Move{Position{p.x, p.y}, Position{p.x, p.y + 2}})
		}

		if p.x > 0 && //capture left
			game.placement[p.x-1][p.y+1].piece != 0 &&
			game.placement[p.x-1][p.y+1].color != color {
			moves = append(moves, Move{Position{p.x, p.y}, Position{p.x - 1, p.y + 1}})
		}

		if p.x < 7 && //capture right
			game.placement[p.x+1][p.y+1].piece != 0 &&
			game.placement[p.x+1][p.y+1].color != color {
			moves = append(moves, Move{Position{p.x, p.y}, Position{p.x + 1, p.y + 1}})
		}

		if game.enPassant != "-" { //enPassant
			var enPassant_x int = int(byte(game.enPassant[0]) - 97)
			var enPassant_y int = 8 - int(game.enPassant[1])
			if enPassant_y == p.y && math.Abs(float64(enPassant_x-p.x)) == 1 {
				moves = append(moves, Move{Position{p.x, p.y}, Position{enPassant_x, enPassant_y + 1}})
			}
		}
	}

	return moves
}

func knightMoves(game *Game, color PieceColor, p *Position) []Move {
	var moves []Move

	var offsets [8][2]int = [8][2]int{
		{-2, -1},
		{-2, 1},
		{-1, -2},
		{-1, 2},
		{1, -2},
		{1, 2},
		{2, -1},
		{2, 1},
	}

	for _, offset := range offsets {
		var x int = p.x + offset[0]
		var y int = p.y + offset[1]

		if (x < 0 || x > 7) || (y < 0 || y > 7) {
			continue
		}

		if game.placement[x][y].piece != 0 && game.placement[x][y].color == color {
			continue
		}

		moves = append(moves, Move{Position{p.x, p.y}, Position{x, y}})
	}

	return moves
}

func bishopMoves(game *Game, color PieceColor, p *Position) []Move {
	var moves []Move

	for i := 1; i < 8; i++ {
		var x int = p.x - i
		var y int = p.y - i

		if x < 0 || y < 0 {
			break
		}
		if game.placement[x][y].piece != 0 && game.placement[x][y].color == color {
			break
		}
		moves = append(moves, Move{Position{p.x, p.y}, Position{x, y}})
		if game.placement[x][y].piece != 0 && game.placement[x][y].color != color {
			break
		}
	}

	for i := 1; i < 8; i++ {
		var x int = p.x - i
		var y int = p.y + i
		if x < 0 || y > 7 {
			break
		}
		if game.placement[x][y].piece != 0 && game.placement[x][y].color == color {
			break
		}
		moves = append(moves, Move{Position{p.x, p.y}, Position{x, y}})
		if game.placement[x][y].piece != 0 && game.placement[x][y].color != color {
			break
		}
	}

	for i := 1; i < 8; i++ {
		var x int = p.x + i
		var y int = p.y - i
		if x > 7 || y < 0 {
			break
		}
		if game.placement[x][y].piece != 0 && game.placement[x][y].color == color {
			break
		}
		moves = append(moves, Move{Position{p.x, p.y}, Position{x, y}})
		if game.placement[x][y].piece != 0 && game.placement[x][y].color != color {
			break
		}
	}

	for i := 1; i < 8; i++ {
		var x int = p.x + i
		var y int = p.y + i
		if x > 7 || y > 7 {
			break
		}
		if game.placement[x][y].piece != 0 && game.placement[x][y].color == color {
			break
		}
		moves = append(moves, Move{Position{p.x, p.y}, Position{x, y}})
		if game.placement[x][y].piece != 0 && game.placement[x][y].color != color {
			break
		}
	}

	return moves
}

func rockMoves(game *Game, color PieceColor, p *Position) []Move {
	var moves []Move

	for i := int(p.x) - 1; i > -1; i-- {
		if game.placement[i][p.y].piece != 0 && game.placement[i][p.y].color == color {
			break
		}
		moves = append(moves, Move{Position{p.x, p.y}, Position{i, p.y}})
		if game.placement[i][p.y].piece != 0 && game.placement[i][p.y].color != color {
			break
		}
	}

	for i := int(p.x) + 1; i < 8; i++ {
		if game.placement[i][p.y].piece != 0 && game.placement[i][p.y].color == color {
			break
		}
		moves = append(moves, Move{Position{p.x, p.y}, Position{i, p.y}})
		if game.placement[i][p.y].piece != 0 && game.placement[i][p.y].color != color {
			break
		}
	}

	for i := int(p.y) - 1; i > -1; i-- {
		if game.placement[p.x][i].piece != 0 && game.placement[p.x][i].color == color {
			break
		}
		moves = append(moves, Move{Position{p.x, p.y}, Position{p.x, i}})
		if game.placement[p.x][i].piece != 0 && game.placement[p.x][i].color != color {
			break
		}
	}

	for i := int(p.y) + 1; i < 8; i++ {
		if game.placement[p.x][i].piece != 0 && game.placement[p.x][i].color == color {
			break
		}
		moves = append(moves, Move{Position{p.x, p.y}, Position{p.x, i}})
		if game.placement[p.x][i].piece != 0 && game.placement[p.x][i].color != color {
			break
		}
	}

	return moves
}

func kingMoves(game *Game, color PieceColor, p *Position) []Move {
	var moves []Move

	var offset [8][2]int = [8][2]int{
		{-1, -1}, {0, -1}, {1, -1},
		{-1, 0}, {1, 0},
		{-1, 1}, {0, 1}, {1, 1},
	}

	for i := 0; i < 8; i++ {
		var x int = p.x + offset[i][0]
		var y int = p.y + offset[i][1]

		if x < 0 || x > 7 || y < 0 || y > 7 {
			continue
		}
		if game.placement[x][y].piece != 0 && game.placement[x][y].color == color {
			continue
		}
		moves = append(moves, Move{Position{p.x, p.y}, Position{x, y}})
	}

	if color == White {
		if strings.Index(game.castling, "Q") > -1 &&
			game.placement[0][7].piece == Rook && game.placement[0][7].color == White &&
			game.placement[1][7].piece == 0 &&
			game.placement[2][7].piece == 0 &&
			game.placement[3][7].piece == 0 { //white queen side castling
			moves = append(moves, Move{Position{p.x, p.y}, Position{1, p.y}})
		}

		if strings.Index(game.castling, "K") > -1 &&
			game.placement[7][7].piece == Rook && game.placement[7][7].color == White &&
			game.placement[5][7].piece == 0 &&
			game.placement[6][7].piece == 0 { //white kingside castling
			moves = append(moves, Move{Position{p.x, p.y}, Position{6, p.y}})
		}

	} else { //black king
		if strings.Index(game.castling, "q") > -1 &&
			game.placement[0][0].piece == Rook && game.placement[0][7].color == Black &&
			game.placement[1][0].piece == 0 &&
			game.placement[2][0].piece == 0 &&
			game.placement[3][0].piece == 0 { //black queen side castling
			moves = append(moves, Move{Position{p.x, p.y}, Position{1, p.y}})
		}

		if strings.Index(game.castling, "k") > -1 &&
			game.placement[7][0].piece == Rook && game.placement[7][7].color == Black &&
			game.placement[5][0].piece == 0 &&
			game.placement[6][0].piece == 0 { //black kingside castling
			moves = append(moves, Move{Position{p.x, p.y}, Position{6, p.y}})
		}
	}

	return moves
}

func getPieces(game *Game, color PieceColor) []Position {
	var pieces []Position

	if color == White {
		for y := 0; y < 8; y++ {
			for x := 0; x < 8; x++ {
				if game.placement[x][y].color == White {
					pieces = append(pieces, Position{x: x, y: y})
				}
			}
		}
	} else {
		for y := 0; y < 8; y++ {
			for x := 0; x < 8; x++ {
				if game.placement[x][y].color == Black {
					pieces = append(pieces, Position{x: x, y: y})
				}
			}
		}
	}

	return pieces
}

func pseudoLegalMoves(game *Game, color PieceColor) []Move {
	var pieces []Position = getPieces(game, color)

	var moves []Move

	for i := 0; i < len(pieces); i++ {
		var piece Piece = game.placement[pieces[i].x][pieces[i].y]

		switch piece.piece {
		case Pawn:
			var tmp []Move = pawnMoves(game, piece.color, &pieces[i])
			moves = append(moves, tmp...)

		case Knight:
			var tmp []Move = knightMoves(game, piece.color, &pieces[i])
			moves = append(moves, tmp...)

		case Bishop:
			var tmp []Move = bishopMoves(game, piece.color, &pieces[i])
			moves = append(moves, tmp...)

		case Rook:
			var tmp []Move = rockMoves(game, piece.color, &pieces[i])
			moves = append(moves, tmp...)

		case Queen:
			var tmp []Move = bishopMoves(game, piece.color, &pieces[i])
			moves = append(moves, tmp...)

			tmp = rockMoves(game, piece.color, &pieces[i])
			moves = append(moves, tmp...)

		case King:
			var tmp []Move = kingMoves(game, piece.color, &pieces[i])
			moves = append(moves, tmp...)
		}
	}

	return moves
}

func legalMoves(game *Game, color PieceColor) []Move {
	//var enemyControl [8][8]bool = getEnemyControl(game)
	var pseudoLegal []Move = pseudoLegalMoves(game, color)
	var moves []Move

	for i := 0; i < len(pseudoLegal); i++ {
		var clone Game = makeMove(*game, pseudoLegal[i])
		if !inCheck(clone, color) {
			moves = append(moves, pseudoLegal[i])
		}
	}

	return moves
}

func getEnemyControl(game *Game) [8][8]bool {
	var area [8][8]bool

	var pieces []Position = getPieces(game, flipColor(game.color))
	var moves []Move

	for i := 0; i < len(pieces); i++ {
		var piece Piece = game.placement[pieces[i].x][pieces[i].y]

		switch piece.piece {
		case Pawn:
			if piece.color == White {
				if pieces[i].x > 0 {
					area[pieces[i].x-1][pieces[i].y-1] = true
				}
				if pieces[i].x < 7 {
					area[pieces[i].x+1][pieces[i].y-1] = true
				}
			} else {
				if pieces[i].x > 0 {
					area[pieces[i].x-1][pieces[i].y+1] = true
				}
				if pieces[i].x < 7 {
					area[pieces[i].x+1][pieces[i].y+1] = true
				}
			}

		case Knight:
			var tmp []Move = knightMoves(game, piece.color, &pieces[i])
			moves = append(moves, tmp...)

		case Bishop:
			var tmp []Move = bishopMoves(game, piece.color, &pieces[i])
			moves = append(moves, tmp...)

		case Rook:
			var tmp []Move = rockMoves(game, piece.color, &pieces[i])
			moves = append(moves, tmp...)

		case Queen:
			var tmp []Move = bishopMoves(game, piece.color, &pieces[i])
			moves = append(moves, tmp...)

			tmp = rockMoves(game, piece.color, &pieces[i])
			moves = append(moves, tmp...)

		case King:
			var tmp []Move = kingMoves(game, piece.color, &pieces[i])
			moves = append(moves, tmp...)
		}
	}

	for i := 0; i < len(moves); i++ {
		area[moves[i].p1.x][moves[i].p1.y] = true
	}

	return area
}

func makeMove(game Game, move Move) Game {
	//TODO: en passant
	//TODO: castling
	//TODO: ...

	if game.placement[move.p0.x][move.p0.y].piece == Pawn && math.Abs(float64(move.p0.y-move.p1.y)) == 2 { //en passant flag
		game.enPassant = string([]byte{97 + byte(move.p1.x), 8 - byte(move.p1.y)})
	} else {
		game.enPassant = "-"
	}

	if game.placement[move.p0.x][move.p0.y].piece == Pawn && move.p0.x != move.p1.x && game.placement[move.p1.x][move.p1.y].piece == 0 { //en passant
		game.placement[move.p1.x][move.p0.y] = Piece{0, Black}
	}

	//castling flags
	if game.placement[move.p0.x][move.p0.y].piece == King {
		if game.placement[move.p0.x][move.p0.y].color == White {
			game.castling = strings.Replace(game.castling, "K", "", 1)
			game.castling = strings.Replace(game.castling, "R", "", 1)
		} else {
			game.castling = strings.Replace(game.castling, "k", "", 1)
			game.castling = strings.Replace(game.castling, "r", "", 1)
		}
	}
	if game.placement[move.p0.x][move.p0.y].piece == Rook {
		if game.placement[move.p0.x][move.p0.y].color == White { //white rock
			if move.p0.x == 0 && move.p0.y == 7 { //queen side
				game.castling = strings.Replace(game.castling, "Q", "", 1)
			}
			if move.p0.x == 7 && move.p0.y == 7 { //kingside
				game.castling = strings.Replace(game.castling, "K", "", 1)
			}
		} else { //black rock
			if move.p0.x == 0 && move.p0.y == 0 { //queen side
				game.castling = strings.Replace(game.castling, "q", "", 1)
			}
			if move.p0.x == 7 && move.p0.y == 0 { //kingside
				game.castling = strings.Replace(game.castling, "k", "", 1)
			}
		}
	}
	if len(game.castling) == 0 {
		game.castling = "-"
	}

	//castling
	if game.placement[move.p0.x][move.p0.y].piece == King {
		if game.placement[move.p0.x][move.p0.y].color == White {
			if int(move.p0.x)-int(move.p1.x) == 2 { //queen side
				game.placement[3][7] = Piece{Rook, White}
				game.placement[0][7] = Piece{0, White}
			} else if int(move.p0.x)-int(move.p1.x) == -2 { //king side
				game.placement[5][7] = Piece{Rook, White}
				game.placement[7][7] = Piece{0, White}
			}

		} else { //black king
			if int(move.p0.x)-int(move.p1.x) == 2 { //queen side
				game.placement[3][0] = Piece{Rook, Black}
				game.placement[0][0] = Piece{0, Black}
			} else if int(move.p0.x)-int(move.p1.x) == -2 { //king side
				game.placement[5][0] = Piece{Rook, Black}
				game.placement[7][0] = Piece{0, Black}
			}
		}
	}

	//move
	game.placement[move.p1.x][move.p1.y] = game.placement[move.p0.x][move.p0.y]
	game.placement[move.p0.x][move.p0.y] = Piece{0, Black}

	//promote
	if game.placement[move.p1.x][move.p1.y].piece == Pawn {
		if game.placement[move.p1.x][move.p1.y].color == White && move.p1.y == 0 { //white pawn
			game.placement[move.p1.x][move.p1.y] = Piece{Queen, Black}

		} else if game.placement[move.p1.x][move.p1.y].color == Black && move.p1.y == 7 { //black pawn
			game.placement[move.p1.x][move.p1.y] = Piece{Queen, Black}
		}
	}

	game.color = flipColor(game.color)

	return game
}

func inCheck(game Game, color PieceColor) bool {
	var kingsPosition Position
	for y := 0; y < 8; y++ { //find king
		for x := 0; x < 8; x++ {
			if game.placement[x][y].piece == King && game.placement[x][y].color == color {
				kingsPosition = Position{x, y}
				break
			}
		}
	}

	var pieces []Position = getPieces(&game, flipColor(color))

	for i := 0; i < len(pieces); i++ {
		var piece Piece = game.placement[pieces[i].x][pieces[i].y]

		switch piece.piece {
		case Pawn:
			var moves []Move = pawnMoves(&game, piece.color, &pieces[i])
			for i := 0; i < len(moves); i++ {
				if moves[i].p1.x == kingsPosition.x && moves[i].p1.y == kingsPosition.y {
					return true
				}
			}

		case Knight:
			var moves []Move = knightMoves(&game, piece.color, &pieces[i])
			for i := 0; i < len(moves); i++ {
				if moves[i].p1.x == kingsPosition.x && moves[i].p1.y == kingsPosition.y {
					return true
				}
			}

		case Bishop:
			var moves []Move = bishopMoves(&game, piece.color, &pieces[i])
			for i := 0; i < len(moves); i++ {
				if moves[i].p1.x == kingsPosition.x && moves[i].p1.y == kingsPosition.y {
					return true
				}
			}

		case Rook:
			var moves []Move = rockMoves(&game, piece.color, &pieces[i])
			for i := 0; i < len(moves); i++ {
				if moves[i].p1.x == kingsPosition.x && moves[i].p1.y == kingsPosition.y {
					return true
				}
			}

		case Queen:
			var moves []Move = bishopMoves(&game, piece.color, &pieces[i])
			for i := 0; i < len(moves); i++ {
				if moves[i].p1.x == kingsPosition.x && moves[i].p1.y == kingsPosition.y {
					return true
				}
			}

			moves = rockMoves(&game, piece.color, &pieces[i])
			for i := 0; i < len(moves); i++ {
				if moves[i].p1.x == kingsPosition.x && moves[i].p1.y == kingsPosition.y {
					return true
				}
			}

		case King:
			var moves []Move = kingMoves(&game, piece.color, &pieces[i])
			for i := 0; i < len(moves); i++ {
				if moves[i].p1.x == kingsPosition.x && moves[i].p1.y == kingsPosition.y {
					return true
				}
			}
		}
	}

	return false
}

func evaluate(game *Game) int {
	var whitePieces []Position = getPieces(game, White)
	var blackPieces []Position = getPieces(game, Black)

	var score int = 0

	for i := 0; i < len(whitePieces); i++ {
		switch game.placement[whitePieces[i].x][whitePieces[i].y].piece {
		case Pawn:
			score += 100
			break

		case Knight:
			score += 300
			break

		case Bishop:
			score += 301
			break

		case Rook:
			score += 500
			break

		case Queen:
			score += 900
			break
		}
	}

	for i := 0; i < len(blackPieces); i++ {
		switch game.placement[blackPieces[i].x][blackPieces[i].y].piece {
		case Pawn:
			score -= 100

		case Knight:
			score -= 300
			break

		case Bishop:
			score -= 301
			break

		case Rook:
			score -= 500
			break

		case Queen:
			score -= 900
			break
		}
	}

	var perspective int
	if game.color == White {
		perspective = 1
	} else {
		perspective = -1
	}

	//TODO: more complex evaluation

	return score * -perspective
}

func calculate(game *Game, depth int) (Move, int) {
	moves := legalMoves(game, game.color)
	bestMove := moves[0]
	bestScore := math.MinInt32

	for _, move := range moves {
		clone := makeMove(*game, move)
		score := alphaBetaPruning(&clone, depth-1, math.MinInt32, math.MaxInt32, false)

		if score != 0 {
			//printPosition(&next)
			print("d:")
			print(depth)
			print(" m:")
			print(move.p1.x)
			print(",")
			print(move.p1.y)
			print(" e:")
			print(score)
			println(" ")
			//println("- - - - - - - -")
			//println(" ")
		}

		if score > bestScore {
			bestScore = score
			bestMove = move
		}
	}

	return bestMove, bestScore
}

func alphaBetaPruning(game *Game, depth int, alpha, beta int, maximizingPlayer bool) int {
	if depth == 0 {
		return evaluate(game)
	}

	moves := legalMoves(game, game.color)
	if !maximizingPlayer {
		moves = legalMoves(game, flipColor(game.color))
	}

	if maximizingPlayer {
		maxScore := math.MinInt32
		for _, move := range moves {
			clone := makeMove(*game, move)
			score := alphaBetaPruning(&clone, depth-1, alpha, beta, false)
			maxScore = max(maxScore, score)
			alpha = max(alpha, score)
			if beta <= alpha {
				break
			}
		}
		return maxScore
	} else {
		minScore := math.MaxInt32
		for _, move := range moves {
			clone := makeMove(*game, move)
			score := alphaBetaPruning(&clone, depth-1, alpha, beta, true)
			minScore = min(minScore, score)
			beta = min(beta, score)
			if beta <= alpha {
				break
			}
		}
		return minScore
	}
}

func randomMove(game *Game) Move {
	var moves []Move = legalMoves(game, game.color)

	if len(moves) == 0 {
		return Move{}
	}

	return moves[rand.Intn(len(moves))]
}
