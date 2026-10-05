package main

import (
	"errors"
	"math/bits"
	"math/rand"
	"slices"
	"strings"
	"time"
)

// Squares are indexed 0..63 as y*8+x, where y=0 is rank 8 and x=0 is file a.
// Each square holds a piece byte: piece type in the low 3 bits, color in bit 3.
type Game struct {
	board     [64]byte
	color     PieceColor
	castling  byte    // castleWK | castleWQ | castleBK | castleBQ
	enPassant int8    // square a pawn can capture onto en passant, or -1
	kings     [2]int8 // king square per color
	hash      uint64  // Zobrist hash of the position, see computeHash
}

type PieceType = byte

const (
	Empty  PieceType = 0
	Pawn   PieceType = 1
	Knight PieceType = 2
	Bishop PieceType = 3
	Rook   PieceType = 4
	Queen  PieceType = 5
	King   PieceType = 6
)

type PieceColor = byte

const (
	Black PieceColor = 0
	White PieceColor = 1
)

const (
	castleWK byte = 1 << iota
	castleWQ
	castleBK
	castleBQ
)

type Move struct {
	from, to int8
}

const (
	maxPly    = 64
	maxMoves  = 256
	mateScore = 1000000
	infinity  = 2000000

	deltaMargin  = 200 //largest positional swing a capture is expected to add on top of the captured material
	endgamePhase = 8   //from this game phase down there is no random pick, see calculate

	//pruning, see alphaBeta. by remaining depth: the levels of depth 3 and less search every move to its full depth
	nullMinDepth = 3 //from which a null move is tried
	lmrMinDepth  = 3 //from which late moves are reduced
	lmrFullMoves = 3 //legal moves searched to full depth before the reductions start

	//the search runs in a worker, the page doesn't wait on it: the budget is how long the player does
	nodeBudget        = 3000000         //nodes per move, enough for 99.9% of the depth 9 searches measured, about 2s in a browser
	timeBudget        = 3 * time.Second //backstop for slow devices and browsers
	checkEvasionDepth = 4               //quiescence plies that search every check evasion
)

var pieceValue = [7]int{0, 100, 300, 301, 500, 900, 0}

// Piece-square tables from white's point of view, indexed like the board (a8 first).
// Values from Tomasz Michniewski's "Simplified Evaluation Function".
var pieceTables = [7][64]int{
	Pawn: {
		0, 0, 0, 0, 0, 0, 0, 0,
		50, 50, 50, 50, 50, 50, 50, 50,
		10, 10, 20, 30, 30, 20, 10, 10,
		5, 5, 10, 25, 25, 10, 5, 5,
		0, 0, 0, 20, 20, 0, 0, 0,
		5, -5, -10, 0, 0, -10, -5, 5,
		5, 10, 10, -20, -20, 10, 10, 5,
		0, 0, 0, 0, 0, 0, 0, 0,
	},
	Knight: { //at 60%: mobility rewards a central knight too, and the full table developed the knights before the pawns
		-30, -24, -18, -18, -18, -18, -24, -30,
		-24, -12, 0, 0, 0, 0, -12, -24,
		-18, 0, 6, 9, 9, 6, 0, -18,
		-18, 3, 9, 12, 12, 9, 3, -18,
		-18, 0, 9, 12, 12, 9, 0, -18,
		-18, 3, 6, 9, 9, 6, 3, -18,
		-24, -12, 0, 3, 3, 0, -12, -24,
		-30, -24, -18, -18, -18, -18, -24, -30,
	},
	Bishop: {
		-20, -10, -10, -10, -10, -10, -10, -20,
		-10, 0, 0, 0, 0, 0, 0, -10,
		-10, 0, 5, 10, 10, 5, 0, -10,
		-10, 5, 5, 10, 10, 5, 5, -10,
		-10, 0, 10, 10, 10, 10, 0, -10,
		-10, 10, 10, 10, 10, 10, 10, -10,
		-10, 5, 0, 0, 0, 0, 5, -10,
		-20, -10, -10, -10, -10, -10, -10, -20,
	},
	Rook: {
		0, 0, 0, 0, 0, 0, 0, 0,
		5, 10, 10, 10, 10, 10, 10, 5,
		-5, 0, 0, 0, 0, 0, 0, -5,
		-5, 0, 0, 0, 0, 0, 0, -5,
		-5, 0, 0, 0, 0, 0, 0, -5,
		-5, 0, 0, 0, 0, 0, 0, -5,
		-5, 0, 0, 0, 0, 0, 0, -5,
		0, 0, 0, 5, 5, 0, 0, 0,
	},
	Queen: {
		-20, -10, -10, -5, -5, -10, -10, -20,
		-10, 0, 0, 0, 0, 0, 0, -10,
		-10, 0, 5, 5, 5, 5, 0, -10,
		-5, 0, 5, 5, 5, 5, 0, -5,
		0, 0, 5, 5, 5, 5, 0, -5,
		-10, 5, 5, 5, 5, 5, 0, -10,
		-10, 0, 5, 0, 0, 0, 0, -10,
		-20, -10, -10, -5, -5, -10, -10, -20,
	},
}

var kingMiddlegameTable = [64]int{
	-30, -40, -40, -50, -50, -40, -40, -30,
	-30, -40, -40, -50, -50, -40, -40, -30,
	-30, -40, -40, -50, -50, -40, -40, -30,
	-30, -40, -40, -50, -50, -40, -40, -30,
	-20, -30, -30, -40, -40, -30, -30, -20,
	-10, -20, -20, -20, -20, -20, -20, -10,
	20, 20, 0, 0, 0, 0, 20, 20,
	20, 30, 10, 0, 0, 10, 30, 20,
}

var kingEndgameTable = [64]int{
	-50, -40, -30, -20, -20, -30, -40, -50,
	-30, -20, -10, 0, 0, -10, -20, -30,
	-30, -10, 20, 30, 30, 20, -10, -30,
	-30, -10, 30, 40, 40, 30, -10, -30,
	-30, -10, 30, 40, 40, 30, -10, -30,
	-30, -10, 20, 30, 30, 20, -10, -30,
	-30, -30, 0, 0, 0, 0, -30, -30,
	-50, -30, -30, -30, -30, -30, -30, -50,
}

// game phase: 24 with all pieces on the board, 0 with only kings and pawns
var phaseWeight = [7]int{0, 0, 1, 1, 2, 4, 0}

const maxPhase = 24

// Pawn structure, see pawnStructure. A passed pawn's bonus is by how many ranks it has advanced from its start,
// in the middlegame and in the endgame, where it's pushed to promotion.
var (
	passedMiddle = [6]int{5, 10, 15, 25, 40, 60}
	passedEnd    = [6]int{10, 15, 25, 45, 75, 120}
)

const (
	isolatedMiddle = -10 //no pawn of its own on the files beside it to defend it
	isolatedEnd    = -15
	doubledMiddle  = -10 //for each pawn behind another of its own, on the same file
	doubledEnd     = -20
)

// King safety, a middlegame term, see kingShelter. On the king's file and the two beside it, by how many ranks ahead
// the nearest pawn of its own stands: 1, 2, 3 or more.
var shelterDistance = [4]int{0, 0, -10, -20}

const (
	noShelter = -30 //no pawn of its own ahead on the file
	openFile  = -15 //and no enemy pawn either: an open line for the rooks and the queen
)

// Mobility, see mobility: for each square a piece can move to, from the count of a typical piece,
// so an average one scores 0, in the middlegame and in the endgame.
var (
	mobilityCenter = [7]int{Knight: 4, Bishop: 6, Rook: 7, Queen: 13}
	mobilityMiddle = [7]int{Knight: 4, Bishop: 5, Rook: 2, Queen: 1}
	mobilityEnd    = [7]int{Knight: 4, Bishop: 5, Rook: 4, Queen: 2}
)

// material lead from which the winning side hunts the lone king (mop-up)
const mopUpLead = 250

// pieceSquare[piece][sq] is material plus position, signed from white's point of view. Kings are scored separately.
var pieceSquare [16][64]int

func makePiece(t PieceType, c PieceColor) byte { return t | c<<3 }
func pieceType(p byte) PieceType               { return p & 7 }
func pieceColor(p byte) PieceColor             { return p >> 3 }

func flipColor(color PieceColor) PieceColor { return color ^ 1 }

// precomputed move tables
var (
	knightTargets [64][]int8
	kingTargets   [64][]int8
	pawnCaptures  [2][64][]int8 // squares a pawn of [color] on [sq] attacks
	rays          [64][8][]int8 // 0-3 orthogonal, 4-7 diagonal
	castleMask    [64]byte      // castling rights kept when a piece moves from or to [sq]
)

// pawn structure masks, a bit per square
var (
	passedMask    [2][64]uint64 // the squares ahead of a pawn of [color] on [sq], on its file and the two beside it
	aheadMask     [2][64]uint64 // the squares ahead of it, on its file
	adjacentFiles [8]uint64     // the files beside [file]
	fileMask      [8]uint64
	knightMask    [64]uint64    // the knight's targets from [sq]
	rayMask       [64][8]uint64 // the squares of rays[sq][d]
	rayDown       [8]bool       // whether the squares of rays in direction [d] come in decreasing order
)

// Zobrist keys: a position's hash is the XOR of the keys of its pieces on their squares, its castling rights,
// its en passant file and the side to move. A move updates it with the few keys it changes.
var (
	zobristPiece     [16][64]uint64
	zobristCastling  [16]uint64
	zobristEnPassant [8]uint64
	zobristWhite     uint64
)

func init() {
	onBoard := func(x, y int) bool { return x >= 0 && x < 8 && y >= 0 && y < 8 }

	knightOffsets := [8][2]int{{-2, -1}, {-2, 1}, {-1, -2}, {-1, 2}, {1, -2}, {1, 2}, {2, -1}, {2, 1}}
	kingOffsets := [8][2]int{{-1, -1}, {0, -1}, {1, -1}, {-1, 0}, {1, 0}, {-1, 1}, {0, 1}, {1, 1}}
	directions := [8][2]int{{0, -1}, {0, 1}, {-1, 0}, {1, 0}, {-1, -1}, {1, -1}, {-1, 1}, {1, 1}}

	for sq := range 64 {
		x, y := sq%8, sq/8

		for _, o := range knightOffsets {
			if onBoard(x+o[0], y+o[1]) {
				knightTargets[sq] = append(knightTargets[sq], int8((y+o[1])*8+x+o[0]))
			}
		}
		for _, o := range kingOffsets {
			if onBoard(x+o[0], y+o[1]) {
				kingTargets[sq] = append(kingTargets[sq], int8((y+o[1])*8+x+o[0]))
			}
		}
		for _, dx := range [2]int{-1, 1} {
			if onBoard(x+dx, y-1) { //white pawns move up the board
				pawnCaptures[White][sq] = append(pawnCaptures[White][sq], int8((y-1)*8+x+dx))
			}
			if onBoard(x+dx, y+1) {
				pawnCaptures[Black][sq] = append(pawnCaptures[Black][sq], int8((y+1)*8+x+dx))
			}
		}
		for d, dir := range directions {
			for i := 1; onBoard(x+dir[0]*i, y+dir[1]*i); i++ {
				rays[sq][d] = append(rays[sq][d], int8((y+dir[1]*i)*8+x+dir[0]*i))
				rayMask[sq][d] |= 1 << ((y+dir[1]*i)*8 + x + dir[0]*i)
			}
			rayDown[d] = dir[1] < 0 || dir[1] == 0 && dir[0] < 0
		}
		for _, t := range knightTargets[sq] {
			knightMask[sq] |= 1 << t
		}

		castleMask[sq] = 0b1111
		fileMask[x] |= 1 << sq

		for t := range 64 { //white pawns move up the board
			var tx, ty int = t % 8, t / 8
			if tx < x-1 || tx > x+1 {
				continue
			}
			if tx != x {
				adjacentFiles[x] |= 1 << t
			}
			if ty < y {
				passedMask[White][sq] |= 1 << t
				if tx == x {
					aheadMask[White][sq] |= 1 << t
				}
			} else if ty > y {
				passedMask[Black][sq] |= 1 << t
				if tx == x {
					aheadMask[Black][sq] |= 1 << t
				}
			}
		}

		for t := Pawn; t <= Queen; t++ {
			pieceSquare[makePiece(t, White)][sq] = pieceValue[t] + pieceTables[t][sq]
			pieceSquare[makePiece(t, Black)][sq] = -pieceValue[t] - pieceTables[t][sq^56] //mirror vertically
		}
	}

	castleMask[0] &^= castleBQ             //a8
	castleMask[4] &^= castleBK | castleBQ  //e8
	castleMask[7] &^= castleBK             //h8
	castleMask[56] &^= castleWQ            //a1
	castleMask[60] &^= castleWK | castleWQ //e1
	castleMask[63] &^= castleWK            //h1

	var r *rand.Rand = rand.New(rand.NewSource(1)) //a fixed seed, so a search can be repeated
	for p := range zobristPiece {
		for sq := range 64 {
			zobristPiece[p][sq] = r.Uint64()
		}
	}
	for i := range zobristCastling {
		zobristCastling[i] = r.Uint64()
	}
	for i := range zobristEnPassant {
		zobristEnPassant[i] = r.Uint64()
	}
	zobristWhite = r.Uint64()
}

func squareOf(x, y int) int8 { return int8(y*8 + x) }

func squareName(sq int8) string {
	return string([]byte{'a' + byte(sq%8), '8' - byte(sq/8)})
}

func loadFen(fen *string) (Game, error) {
	var game Game = Game{enPassant: -1, kings: [2]int8{-1, -1}}

	var array []string = strings.Fields(*fen)

	if len(array) < 2 {
		return Game{}, errors.New("invalid fen")
	}

	var pos_x int = 0
	var pos_y int = 0

	for i := 0; i < len(array[0]); i++ {
		var c byte = array[0][i]

		if c == '/' {
			pos_x = 0
			pos_y++
			continue
		}

		if c >= '1' && c <= '8' {
			pos_x += int(c - '0')
			continue
		}

		if pos_x > 7 || pos_y > 7 {
			return Game{}, errors.New("invalid fen")
		}

		var color PieceColor = Black
		if c >= 'A' && c <= 'Z' {
			color = White
			c += 'a' - 'A'
		}

		var t PieceType
		switch c {
		case 'p':
			t = Pawn
			if pos_y == 0 || pos_y == 7 { //a pawn can't stay on the last rank, auto-promote like chess.js
				if (color == White) != (pos_y == 0) {
					return Game{}, errors.New("invalid fen: pawn on the first rank")
				}
				t = Queen
			}
		case 'n':
			t = Knight
		case 'b':
			t = Bishop
		case 'r':
			t = Rook
		case 'q':
			t = Queen
		case 'k':
			t = King
			game.kings[color] = squareOf(pos_x, pos_y)
		default:
			return Game{}, errors.New("invalid fen")
		}

		game.board[squareOf(pos_x, pos_y)] = makePiece(t, color)
		pos_x++
	}

	if game.kings[White] < 0 || game.kings[Black] < 0 {
		return Game{}, errors.New("invalid fen: missing king")
	}

	if array[1] == "w" {
		game.color = White
	} else {
		game.color = Black
	}

	if len(array) > 2 {
		for _, c := range array[2] {
			switch c {
			case 'K':
				game.castling |= castleWK
			case 'Q':
				game.castling |= castleWQ
			case 'k':
				game.castling |= castleBK
			case 'q':
				game.castling |= castleBQ
			}
		}
	}

	if len(array) > 3 && len(array[3]) == 2 {
		var x int = int(array[3][0]) - 'a'
		var rank int = int(array[3][1]) - '0'
		if x >= 0 && x < 8 {
			switch rank {
			case 3, 6: //standard fen: the square behind the pawn
				game.enPassant = squareOf(x, 8-rank)
			case 4: //chess.js: the white pawn that just moved two squares
				game.enPassant = squareOf(x, 5)
			case 5: //chess.js: the black pawn that just moved two squares
				game.enPassant = squareOf(x, 2)
			}
		}
	}

	game.hash = game.computeHash()

	return game, nil
}

func moveToString(move Move) string {
	if move.from == move.to {
		return ""
	}
	return squareName(move.from) + "-" + squareName(move.to)
}

func printPosition(game *Game) {
	const letters = " pnbrqk"
	for y := range 8 {
		print(8 - y)
		print("  ")
		for x := range 8 {
			var p byte = game.board[y*8+x]
			var l byte = letters[pieceType(p)]
			if p != 0 && pieceColor(p) == White {
				l -= 'a' - 'A'
			}
			print(string(l))
			print(" ")
		}
		println(" ")
	}

	println(" ")
}

// isAttacked reports whether any piece of color [by] attacks square [sq].
func (game *Game) isAttacked(sq int8, by PieceColor) bool {
	var b *[64]byte = &game.board

	for _, t := range pawnCaptures[flipColor(by)][sq] {
		if b[t] == makePiece(Pawn, by) {
			return true
		}
	}
	for _, t := range knightTargets[sq] {
		if b[t] == makePiece(Knight, by) {
			return true
		}
	}
	for _, t := range kingTargets[sq] {
		if b[t] == makePiece(King, by) {
			return true
		}
	}

	var queen byte = makePiece(Queen, by)
	for d := range 8 {
		var slider byte = makePiece(Rook, by)
		if d >= 4 {
			slider = makePiece(Bishop, by)
		}
		for _, t := range rays[sq][d] {
			if b[t] != 0 {
				if b[t] == slider || b[t] == queen {
					return true
				}
				break
			}
		}
	}

	return false
}

func (game *Game) inCheck(color PieceColor) bool {
	return game.isAttacked(game.kings[color], flipColor(color))
}

// pseudoLegalMoves appends every move for the side to move to [moves], without checking if it leaves the king in check.
// Castling is fully validated here. Pawns always promote to queen.
// With [capturesOnly] quiet moves are skipped, except promotions.
func pseudoLegalMoves(game *Game, moves []Move, capturesOnly bool) []Move {
	var b *[64]byte = &game.board
	var color PieceColor = game.color
	var enemy PieceColor = flipColor(color)
	var quiet bool = !capturesOnly

	for from := range int8(64) {
		var p byte = b[from]
		if p == 0 || pieceColor(p) != color {
			continue
		}

		switch pieceType(p) {
		case Pawn:
			var forward int8 = 8
			var startRank int8 = 1
			if color == White {
				forward = -8
				startRank = 6
			}

			if to := from + forward; to < 0 || to > 63 { //pawn on the last rank, only possible from a malformed fen
				continue
			} else if b[to] == 0 && (quiet || to < 8 || to >= 56) { //1 square forward
				moves = append(moves, Move{from, to})
				if quiet && from/8 == startRank && b[to+forward] == 0 { //2 squares forward
					moves = append(moves, Move{from, to + forward})
				}
			}

			for _, to := range pawnCaptures[color][from] { //captures and en passant
				if (b[to] != 0 && pieceColor(b[to]) == enemy) || to == game.enPassant {
					moves = append(moves, Move{from, to})
				}
			}

		case Knight:
			for _, to := range knightTargets[from] {
				if (b[to] == 0 && quiet) || (b[to] != 0 && pieceColor(b[to]) == enemy) {
					moves = append(moves, Move{from, to})
				}
			}

		case Bishop:
			moves = slidingMoves(b, enemy, from, 4, 8, quiet, moves)

		case Rook:
			moves = slidingMoves(b, enemy, from, 0, 4, quiet, moves)

		case Queen:
			moves = slidingMoves(b, enemy, from, 0, 8, quiet, moves)

		case King:
			for _, to := range kingTargets[from] {
				if (b[to] == 0 && quiet) || (b[to] != 0 && pieceColor(b[to]) == enemy) {
					moves = append(moves, Move{from, to})
				}
			}
			if quiet {
				moves = castlingMoves(game, from, moves)
			}
		}
	}

	return moves
}

func slidingMoves(b *[64]byte, enemy PieceColor, from int8, dirFrom, dirTo int, quiet bool, moves []Move) []Move {
	for d := dirFrom; d < dirTo; d++ {
		for _, to := range rays[from][d] {
			if b[to] == 0 {
				if quiet {
					moves = append(moves, Move{from, to})
				}
				continue
			}
			if pieceColor(b[to]) == enemy {
				moves = append(moves, Move{from, to})
			}
			break
		}
	}
	return moves
}

func castlingMoves(game *Game, from int8, moves []Move) []Move {
	var b *[64]byte = &game.board
	var color PieceColor = game.color
	var enemy PieceColor = flipColor(color)

	var home int8 = 4
	var kingSide, queenSide byte = castleBK, castleBQ
	if color == White {
		home = 60
		kingSide, queenSide = castleWK, castleWQ
	}

	if from != home || game.castling&(kingSide|queenSide) == 0 || game.isAttacked(home, enemy) {
		return moves
	}

	var rook byte = makePiece(Rook, color)

	if game.castling&kingSide != 0 &&
		b[home+1] == 0 && b[home+2] == 0 && b[home+3] == rook &&
		!game.isAttacked(home+1, enemy) && !game.isAttacked(home+2, enemy) {
		moves = append(moves, Move{home, home + 2})
	}

	if game.castling&queenSide != 0 &&
		b[home-1] == 0 && b[home-2] == 0 && b[home-3] == 0 && b[home-4] == rook &&
		!game.isAttacked(home-1, enemy) && !game.isAttacked(home-2, enemy) {
		moves = append(moves, Move{home, home - 2})
	}

	return moves
}

func legalMoves(game *Game) []Move {
	var pseudoLegal []Move = pseudoLegalMoves(game, make([]Move, 0, maxMoves), false)
	var moves []Move

	for _, move := range pseudoLegal {
		var next Game = *game
		next.makeMove(move)
		if !next.inCheck(game.color) {
			moves = append(moves, move)
		}
	}

	return moves
}

// makeMove plays [move] in place. Callers that need the previous position should copy the Game first.
func (game *Game) makeMove(move Move) {
	var b *[64]byte = &game.board
	var piece byte = b[move.from]
	var color PieceColor = pieceColor(piece)
	var enPassant int8 = game.enPassant
	var castling byte = game.castling

	var hash uint64 = game.hash ^ zobristPiece[piece][move.from] ^ zobristPiece[piece][move.to] ^ zobristWhite
	if b[move.to] != 0 {
		hash ^= zobristPiece[b[move.to]][move.to]
	}
	if enPassant >= 0 {
		hash ^= zobristEnPassant[enPassant%8]
	}

	b[move.to] = piece
	b[move.from] = 0
	game.enPassant = -1

	switch pieceType(piece) {
	case Pawn:
		switch move.to - move.from {
		case 16, -16: //en passant flag, only when an enemy pawn can take: else it's the same position as without, for the hash
			var square int8 = (move.from + move.to) / 2
			for _, t := range pawnCaptures[color][square] {
				if b[t] == makePiece(Pawn, flipColor(color)) {
					game.enPassant = square
					hash ^= zobristEnPassant[square%8]
					break
				}
			}
		case 7, 9, -7, -9:
			if move.to == enPassant { //en passant capture
				var captured int8 = move.from/8*8 + move.to%8
				hash ^= zobristPiece[b[captured]][captured]
				b[captured] = 0
			}
		}
		if move.to < 8 || move.to >= 56 { //promote
			b[move.to] = makePiece(Queen, color)
			hash ^= zobristPiece[piece][move.to] ^ zobristPiece[b[move.to]][move.to]
		}

	case King:
		game.kings[color] = move.to
		if move.to-move.from == 2 { //kingside castling
			hash ^= zobristPiece[b[move.from+3]][move.from+3] ^ zobristPiece[b[move.from+3]][move.from+1]
			b[move.from+1] = b[move.from+3]
			b[move.from+3] = 0
		} else if move.to-move.from == -2 { //queenside castling
			hash ^= zobristPiece[b[move.from-4]][move.from-4] ^ zobristPiece[b[move.from-4]][move.from-1]
			b[move.from-1] = b[move.from-4]
			b[move.from-4] = 0
		}
	}

	game.castling &= castleMask[move.from] & castleMask[move.to]
	game.color = flipColor(game.color)
	game.hash = hash ^ zobristCastling[castling] ^ zobristCastling[game.castling]
}

// makeNullMove passes the move to the other side, see alphaBeta.
func (game *Game) makeNullMove() {
	if game.enPassant >= 0 {
		game.hash ^= zobristEnPassant[game.enPassant%8]
		game.enPassant = -1
	}
	game.color = flipColor(game.color)
	game.hash ^= zobristWhite
}

// hasPieces reports whether [color] has more than pawns and the king.
func hasPieces(game *Game, color PieceColor) bool {
	for _, p := range game.board {
		if p != 0 && pieceColor(p) == color && pieceType(p) >= Knight && pieceType(p) <= Queen {
			return true
		}
	}
	return false
}

// computeHash is the Zobrist hash of the position from scratch. makeMove keeps it up to date as it plays.
func (game *Game) computeHash() uint64 {
	var hash uint64 = zobristCastling[game.castling]
	for sq, p := range game.board {
		if p != 0 {
			hash ^= zobristPiece[p][sq]
		}
	}
	if game.enPassant >= 0 {
		hash ^= zobristEnPassant[game.enPassant%8]
	}
	if game.color == White {
		hash ^= zobristWhite
	}
	return hash
}

// evaluate scores the position from the perspective of the side to move:
// material and piece-square bonuses, with the king table blended from middlegame to endgame as pieces come off,
// the pawn structure, the pawns sheltering the kings, and how freely the pieces move.
func evaluate(game *Game) int {
	var score int = 0
	var phase int = 0
	var material [2]int
	var pawns [2]uint64
	var occupied [2]uint64

	for sq, p := range game.board {
		if p == 0 {
			continue
		}
		score += pieceSquare[p][sq]
		phase += phaseWeight[pieceType(p)]
		material[pieceColor(p)] += pieceValue[pieceType(p)]

		if pieceType(p) == Pawn {
			pawns[pieceColor(p)] |= 1 << sq
		}
		occupied[pieceColor(p)] |= 1 << sq
	}

	if phase > maxPhase { //possible after promotions
		phase = maxPhase
	}

	var white int8 = game.kings[White]
	var black int8 = game.kings[Black] ^ 56
	var kingMiddle int = kingMiddlegameTable[white] - kingMiddlegameTable[black]
	var kingEnd int = kingEndgameTable[white] - kingEndgameTable[black]
	score += (kingMiddle*phase + kingEnd*(maxPhase-phase)) / maxPhase

	score += pawnStructure(&pawns, phase)
	score += kingShelter(game, &pawns) * phase / maxPhase
	score += mobility(game, &pawns, &occupied, phase)

	//mop-up: with a clear material lead, drive the enemy king to the edge and bring the own king closer,
	//so a won endgame makes progress towards mate instead of shuffling
	if lead := material[White] - material[Black]; lead >= mopUpLead {
		score += mopUp(game.kings[White], game.kings[Black]) * (maxPhase - phase) / maxPhase
	} else if -lead >= mopUpLead {
		score -= mopUp(game.kings[Black], game.kings[White]) * (maxPhase - phase) / maxPhase
	}

	if game.color == White {
		return score
	}
	return -score
}

// pawnStructure scores the pawns of both sides, white minus black, blended from middlegame to endgame by [phase].
// A passed pawn has no enemy pawn ahead to stop it, on its file or the two beside it: the front one of its file is
// scored by how far it has come. An isolated pawn can't be defended by another, and a doubled one blocks its own.
func pawnStructure(pawns *[2]uint64, phase int) int {
	var middle, end int = 0, 0

	for color := Black; color <= White; color++ {
		var own, enemy uint64 = pawns[color], pawns[flipColor(color)]
		var sign int = 1
		if color == Black {
			sign = -1
		}

		for rest := own; rest != 0; rest &= rest - 1 {
			var sq int = bits.TrailingZeros64(rest)

			if own&aheadMask[color][sq] != 0 {
				middle += sign * doubledMiddle
				end += sign * doubledEnd
			} else if enemy&passedMask[color][sq] == 0 {
				var advanced int = 6 - sq/8 //ranks from its start
				if color == Black {
					advanced = sq/8 - 1
				}
				middle += sign * passedMiddle[advanced]
				end += sign * passedEnd[advanced]
			}

			if own&adjacentFiles[sq%8] == 0 {
				middle += sign * isolatedMiddle
				end += sign * isolatedEnd
			}
		}
	}

	return (middle*phase + end*(maxPhase-phase)) / maxPhase
}

// mobility scores how freely the pieces move, white minus black, blended from middlegame to endgame by [phase]:
// the squares each knight, bishop, rook and queen can move to, empty or with an enemy piece,
// and not attacked by an enemy pawn, where the piece would be lost for a pawn.
// On bitboards: a ray's squares reach up to its first piece, and the squares past it are its own ray's from there.
func mobility(game *Game, pawns, occupied *[2]uint64, phase int) int {
	var pawnAttacks = [2]uint64{ //white pawns take up the board, to the files beside
		Black: (pawns[Black]&^fileMask[0])<<7 | (pawns[Black]&^fileMask[7])<<9,
		White: (pawns[White]&^fileMask[0])>>9 | (pawns[White]&^fileMask[7])>>7,
	}
	var all uint64 = occupied[White] | occupied[Black]
	var middle, end int = 0, 0

	for rest := all &^ pawns[White] &^ pawns[Black]; rest != 0; rest &= rest - 1 {
		var sq int = bits.TrailingZeros64(rest)
		var t PieceType = pieceType(game.board[sq])
		if t == King {
			continue
		}
		var color PieceColor = pieceColor(game.board[sq])

		var reach uint64 = knightMask[sq]
		if t != Knight {
			reach = 0
			var first, last int = 0, 8 //the queen's directions, rays 0-3 orthogonal, 4-7 diagonal
			if t == Bishop {
				first = 4
			} else if t == Rook {
				last = 4
			}
			for d := first; d < last; d++ {
				var ray uint64 = rayMask[sq][d]
				if blockers := ray & all; blockers != 0 {
					var blocker int = bits.TrailingZeros64(blockers)
					if rayDown[d] {
						blocker = 63 - bits.LeadingZeros64(blockers)
					}
					ray &^= rayMask[blocker][d]
				}
				reach |= ray
			}
		}
		var count int = bits.OnesCount64(reach &^ occupied[color] &^ pawnAttacks[flipColor(color)])

		var sign int = 1
		if color == Black {
			sign = -1
		}
		middle += sign * mobilityMiddle[t] * (count - mobilityCenter[t])
		end += sign * mobilityEnd[t] * (count - mobilityCenter[t])
	}

	return (middle*phase + end*(maxPhase-phase)) / maxPhase
}

// kingShelter scores the pawns in front of each king, white minus black. On the king's file and the two beside it,
// the nearest pawn of its own ahead shields it, the closer the better, and a file without one is a way in.
// The king table already draws the king to a castled corner: this keeps its pawns in front of it.
func kingShelter(game *Game, pawns *[2]uint64) int {
	var score int = 0

	for color := Black; color <= White; color++ {
		var x, y int = int(game.kings[color] % 8), int(game.kings[color] / 8)
		var shelter int = 0

		for file := max(0, x-1); file <= min(7, x+1); file++ {
			var ahead uint64 = pawns[color] & aheadMask[color][y*8+file]
			if ahead == 0 {
				shelter += noShelter
				if (pawns[White]|pawns[Black])&fileMask[file] == 0 {
					shelter += openFile
				}
				continue
			}

			var distance int //to the nearest: ahead is up the board for white
			if color == White {
				distance = y - (63-bits.LeadingZeros64(ahead))/8
			} else {
				distance = bits.TrailingZeros64(ahead)/8 - y
			}
			shelter += shelterDistance[min(distance, 3)]
		}

		if color == White {
			score += shelter
		} else {
			score -= shelter
		}
	}

	return score
}

func mopUp(winner, loser int8) int {
	abs := func(v int) int {
		if v < 0 {
			return -v
		}
		return v
	}
	var lx, ly int = int(loser % 8), int(loser / 8)
	var wx, wy int = int(winner % 8), int(winner / 8)

	var fromCenter int = max(3-lx, lx-4) + max(3-ly, ly-4) //0 in the center, 6 in a corner
	var kingsDistance int = abs(lx-wx) + abs(ly-wy)

	return 10*fromCenter + 4*(14-kingsDistance)
}

// positionKey is the piece placement and the side to move, as in the first two fields of a fen.
// chess.js sends the positions of the game in the same form, to avoid repetitions.
func positionKey(game *Game) string {
	const letters = " pnbrqk"
	var sb strings.Builder
	for y := range 8 {
		if y > 0 {
			sb.WriteByte('/')
		}
		var blank byte = 0
		for x := range 8 {
			var p byte = game.board[y*8+x]
			if p == 0 {
				blank++
				continue
			}
			if blank > 0 {
				sb.WriteByte('0' + blank)
				blank = 0
			}
			var l byte = letters[pieceType(p)]
			if pieceColor(p) == White {
				l -= 'a' - 'A'
			}
			sb.WriteByte(l)
		}
		if blank > 0 {
			sb.WriteByte('0' + blank)
		}
	}
	if game.color == White {
		sb.WriteString(" w")
	} else {
		sb.WriteString(" b")
	}
	return sb.String()
}

const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

// Opening book: lines of up to 4 moves from the starting position, in from-to notation (castling is the king's move).
// Positions are matched by positionKey, so a line is also followed when the game transposes into it.
// A move's weight is the number of lines that play it, so main lines come up more often.
// A move marked with "?" is never picked, it's there only to book the answer to it.
var bookLines = []string{
	//1.e4 e5
	"e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6",  //Ruy Lopez
	"e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1 f6e4",  //Ruy Lopez, Berlin
	"e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6",  //Italian
	"e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d3 f8c5",  //Two Knights
	"e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 f3g5? d7d5", //Two Knights, Ng5
	"e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6",  //Scotch
	"e2e4 e7e5 g1f3 b8c6 b1c3 g8f6 f1b5 f8b4",  //Four Knights
	"e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4",  //Petrov
	"e2e4 e7e5 g1f3 d7d6 d2d4 e5d4 f3d4 g8f6",  //Philidor
	"e2e4 e7e5 b1c3 g8f6 g2g3 d7d5 e4d5 f6d5",  //Vienna
	"e2e4 e7e5 f1c4 g8f6 d2d3 c7c6 g1f3 d7d5",  //Bishop's Opening
	"e2e4 e7e5 f2f4? e5f4 g1f3 d7d6 d2d4 g7g5", //King's Gambit
	"e2e4 e7e5 d1h5? b8c6 f1c4 g7g6 h5f3 g8f6", //early queen
	"e2e4 e7e5 f1c4 b8c6 d1h5? g7g6 h5f3 g8f6", //early queen
	//1.e4 others
	"e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6", //Sicilian, Open
	"e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6", //Sicilian, Classical
	"e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 b8c6", //Sicilian, Taimanov
	"e2e4 c7c5 g1f3 b8c6 f1b5 g7g6 e1g1 f8g7", //Sicilian, Rossolimo
	"e2e4 c7c5 c2c3 d7d5 e4d5 d8d5 d2d4 g8f6", //Sicilian, Alapin
	"e2e4 c7c5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7", //Sicilian, Closed
	"e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7", //French, Classical
	"e2e4 e7e6 d2d4 d7d5 b1c3 f8b4 e4e5 c7c5", //French, Winawer
	"e2e4 e7e6 d2d4 d7d5 e4e5 c7c5 c2c3 b8c6", //French, Advance
	"e2e4 e7e6 d2d4 d7d5 b1d2 g8f6 e4e5 f6d7", //French, Tarrasch
	"e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5", //Caro-Kann, Classical
	"e2e4 c7c6 d2d4 d7d5 e4e5 c8f5 g1f3 e7e6", //Caro-Kann, Advance
	"e2e4 c7c6 d2d4 d7d5 e4d5 c6d5 f1d3 b8c6", //Caro-Kann, Exchange
	"e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6", //Scandinavian
	"e2e4 d7d6 d2d4 g8f6 b1c3 g7g6 g1f3 f8g7", //Pirc
	"e2e4 g7g6 d2d4 f8g7 b1c3 d7d6 g1f3 g8f6", //Modern
	"e2e4 g8f6 e4e5 f6d5 d2d4 d7d6 g1f3 c8g4", //Alekhine
	"e2e4 b8c6? d2d4",
	"e2e4 b7b6? d2d4",
	"e2e4 a7a6? d2d4",
	//1.d4
	"d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7", //Queen's Gambit Declined
	"d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 g1f3 c7c6", //Semi-Slav
	"d2d4 d7d5 c2c4 d5c4 g1f3 g8f6 e2e3 e7e6", //Queen's Gambit Accepted
	"d2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4", //Slav
	"d2d4 d7d5 g1f3 g8f6 c1f4 e7e6 e2e3 c7c5", //London
	"d2d4 d7d5 c1f4 g8f6 e2e3 c7c5 c2c3 b8c6", //London
	"d2d4 g8f6 g1f3 g7g6 c1f4 f8g7 e2e3 e8g8", //London
	"d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6", //King's Indian
	"d2d4 g8f6 c2c4 g7g6 b1c3 d7d5 c4d5 f6d5", //Grünfeld
	"d2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8", //Nimzo-Indian
	"d2d4 g8f6 c2c4 e7e6 g1f3 b7b6 g2g3 c8b7", //Queen's Indian
	"d2d4 g8f6 c2c4 e7e6 g2g3 d7d5 f1g2 f8e7", //Catalan
	"d2d4 g8f6 c2c4 c7c5 d4d5 e7e6 b1c3 e6d5", //Benoni
	"d2d4 g8f6 c1g5 f6e4 g5f4 d7d5 e2e3 c7c5", //Trompowsky
	"d2d4 f7f5 g2g3 g8f6 f1g2 g7g6 g1f3 f8g7", //Dutch, Leningrad
	"d2d4 d7d6 e2e4 g8f6",                     //into the Pirc
	"d2d4 g7g6 e2e4 f8g7",                     //into the Modern
	"d2d4 e7e6 c2c4 g8f6",
	"d2d4 c7c5? d4d5",
	"d2d4 e7e5? d4e5",
	//flank openings
	"c2c4 e7e5 b1c3 g8f6 g1f3 b8c6 g2g3 d7d5", //English, Four Knights
	"c2c4 c7c5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7", //English, Symmetrical
	"c2c4 g8f6 b1c3 g7g6 g2g3 f8g7 f1g2 e8g8", //English
	"g1f3 d7d5 g2g3 g8f6 f1g2 e7e6 e1g1 f8e7", //Réti
	"g1f3 d7d5 d2d4 g8f6 c2c4 e7e6 b1c3 f8e7", //into the Queen's Gambit
	"g1f3 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6", //into the King's Indian
	//answers to the other first moves
	"a2a3? e7e5", "a2a4? e7e5", "b2b3? e7e5", "b2b4? e7e5", "c2c3? d7d5", "d2d3? d7d5", "e2e3? e7e5", "f2f3? e7e5",
	"f2f4? d7d5", "g2g3? d7d5", "g2g4? d7d5", "h2h3? e7e5", "h2h4? d7d5", "b1a3? e7e5", "b1c3? d7d5", "g1h3? d7d5",
}

type bookEntry struct {
	move   Move
	weight int
}

// book holds the moves of bookLines by position (see positionKey).
var book = map[string][]bookEntry{}

// parseSquare is the inverse of squareName, -1 if [name] is not a square.
func parseSquare(name string) int8 {
	if len(name) != 2 || name[0] < 'a' || name[0] > 'h' || name[1] < '1' || name[1] > '8' {
		return -1
	}
	return squareOf(int(name[0]-'a'), int('8'-name[1]))
}

// builds the book. it plays the lines, so it runs after the move tables are ready (init functions run in source order)
func init() {
	var fen string = startFen
	start, _ := loadFen(&fen)

	for _, line := range bookLines {
		var game Game = start

		for _, token := range strings.Fields(line) {
			var name string = strings.TrimSuffix(token, "?")
			var move Move = Move{-1, -1}
			if len(name) == 4 {
				move = Move{parseSquare(name[:2]), parseSquare(name[2:])}
			}

			if !slices.Contains(legalMoves(&game), move) {
				println("chess: illegal book move", token, "in", line)
				break
			}

			if name == token {
				var key string = positionKey(&game)
				if i := slices.IndexFunc(book[key], func(e bookEntry) bool { return e.move == move }); i >= 0 {
					book[key][i].weight++
				} else {
					book[key] = append(book[key], bookEntry{move, 1})
				}
			}

			game.makeMove(move)
		}
	}
}

// bookMove picks one of the position's book moves at random, by weight. False when the position is not in the book.
func bookMove(game *Game) (Move, bool) {
	var entries []bookEntry = book[positionKey(game)]
	if len(entries) == 0 {
		return Move{}, false
	}

	//positionKey leaves out the castling rights, so a book castling might not be legal here
	var legal []Move = legalMoves(game)
	var candidates []bookEntry
	var total int = 0
	for _, entry := range entries {
		if slices.Contains(legal, entry.move) {
			candidates = append(candidates, entry)
			total += entry.weight
		}
	}

	if total == 0 {
		return Move{}, false
	}

	var r int = rand.Intn(total)
	for _, entry := range candidates {
		if r < entry.weight {
			return entry.move, true
		}
		r -= entry.weight
	}

	return Move{}, false
}

// The transposition table: the scores and best moves of the positions searched, by hash, kept between moves.
// A position reached again, by another move order or in a deeper iteration, takes its score from the table
// when the entry was searched as deep, and its best move is searched first otherwise.
const ttBits = 20 //1M entries of 16 bytes

type ttEntry struct {
	check      uint32 //the upper half of the hash, the lower one is the index
	score      int32
	move       Move
	depth      int8
	bound      uint8 //0 for an empty entry
	generation uint8
}

const (
	boundExact uint8 = iota + 1
	boundLower       //the score is at least this: the search cut off at beta
	boundUpper       //the score is at most this: no move raised alpha
)

var (
	tt         [1 << ttBits]ttEntry
	generation uint8 //of the running search: older searches' entries are the first to go
	ttDepth    int   //the depth the table was filled at, see calculate
)

func probeTT(hash uint64) *ttEntry {
	var entry *ttEntry = &tt[hash&(1<<ttBits-1)]
	if entry.bound == 0 || entry.check != uint32(hash>>32) {
		return nil
	}
	return entry
}

// storeTT keeps a search result, unless the slot holds a deeper one of this search: it saved more work.
func storeTT(hash uint64, depth, ply, score int, bound uint8, move Move) {
	var entry *ttEntry = &tt[hash&(1<<ttBits-1)]
	if entry.generation == generation && int(entry.depth) > depth {
		return
	}

	var check uint32 = uint32(hash >> 32)
	if move == (Move{}) && entry.check == check { //no move raised alpha, keep the one found before
		move = entry.move
	}

	//mate scores count from the root, and the position can be met at another ply: kept counting from the position
	if score > mateScore-maxPly {
		score += ply
	} else if score < -mateScore+maxPly {
		score -= ply
	}

	*entry = ttEntry{check, int32(score), move, int8(depth), bound, generation}
}

// ttScore is an entry's score, counting a mate from the root again.
func ttScore(entry *ttEntry, ply int) int {
	var score int = int(entry.score)
	if score > mateScore-maxPly {
		return score - ply
	} else if score < -mateScore+maxPly {
		return score + ply
	}
	return score
}

type searcher struct {
	moves   [maxPly][maxMoves]Move
	order   [maxPly][maxMoves]int32
	killers [maxPly][2]Move

	nodes    int
	deadline time.Time
	aborted  bool //out of nodes or time, the running iteration is discarded
}

// visit counts a node, and reports false once the search is out of nodes or time.
func (s *searcher) visit() bool {
	s.nodes++
	if s.nodes > nodeBudget || s.nodes&1023 == 0 && time.Now().After(s.deadline) {
		s.aborted = true
	}
	return !s.aborted
}

// orderScore ranks the table's move first, then captures by most valuable victim / least valuable attacker,
// then promotions, then killer moves.
func (s *searcher) orderScore(game *Game, move Move, ply int, hashMove Move) int32 {
	if move == hashMove {
		return 1 << 30
	}

	var attacker PieceType = pieceType(game.board[move.from])
	var victim PieceType = pieceType(game.board[move.to])
	var score int32 = 0

	if victim != 0 {
		score = 10000 + int32(victim)*16 - int32(attacker)
	} else if attacker == Pawn && move.to == game.enPassant {
		score = 10000 + int32(Pawn)*16 - int32(Pawn)
	} else if move == s.killers[ply][0] {
		score = 9000
	} else if move == s.killers[ply][1] {
		score = 8000
	}

	if attacker == Pawn && (move.to < 8 || move.to >= 56) {
		score += 20000
	}

	return score
}

// scoreMoves fills the move ordering scores for [moves] at [ply]. [hashMove] is the table's, or the zero Move.
func (s *searcher) scoreMoves(game *Game, moves []Move, ply int, hashMove Move) []int32 {
	var order []int32 = s.order[ply][:len(moves)]
	for i, move := range moves {
		order[i] = s.orderScore(game, move, ply, hashMove)
	}
	return order
}

// pickMove swaps the best remaining move into [i]. Cutoffs usually happen early, so a full sort is wasted work.
func pickMove(moves []Move, order []int32, i int) {
	var best int = i
	for j := i + 1; j < len(moves); j++ {
		if order[j] > order[best] {
			best = j
		}
	}
	moves[i], moves[best] = moves[best], moves[i]
	order[i], order[best] = order[best], order[i]
}

// The difficulty levels, 1 to 9, each searching as deep as its number, and the margin of the random pick, see calculate.
// Root moves this close to the best are picked from at random, with all pieces on the board: a weak level's mistakes.
var levels = [...]struct{ depth, margin int }{
	{1, 150},
	{2, 80},
	{3, 40},
	{4, 15},
	{5, 0},
	{6, 0},
	{7, 0},
	{8, 0},
	{9, 0},
}

// calculate finds the best move. Moves into a position from [history] (see positionKey) score as a draw,
// so a winning side does not repeat itself, and a losing side takes the repetition.
// Search stops at the node and time budget, and returns the best move of the deepest depth searched (see below for an
// unfinished one), or one at random among the moves that score within [nearEqual] of it, so the engine doesn't play the same game every time.
func calculate(game *Game, depth int, nearEqual int, history map[string]bool) (Move, int) {
	var s *searcher = &searcher{deadline: time.Now().Add(timeBudget)}
	var moves []Move = legalMoves(game)

	if len(moves) == 0 {
		if game.inCheck(game.color) {
			return Move{}, -mateScore
		}
		return Move{}, 0
	}

	//the table's entries are as deep as the level that searched them: a lower level using them would play above itself
	if depth != ttDepth {
		clear(tt[:])
		ttDepth = depth
	}
	generation++

	//the margin tapers off as pieces come off, and the endgame is played exactly: there, small differences
	//(pushing a pawn, driving the king to the edge) are what makes progress, and even random ties put a mate off
	var margin int = max(0, nearEqual*(gamePhase(game)-endgamePhase)/(maxPhase-endgamePhase))
	var scores []int = make([]int, len(moves))
	var nearBest []Move //moves of the deepest depth searched within [margin] of the best
	var bestScore int = -infinity

	//iterative deepening: the best move of each iteration is searched first in the next, improving cutoffs
	for d := 1; d <= depth; d++ {
		var alpha int = -infinity
		var bestIndex int = -1
		var searched int = 0

		for i, move := range moves {
			var next Game = *game
			next.makeMove(move)

			//the window opens [margin] below the best, so the moves close to it get an exact score
			var floor int = -infinity
			if alpha > -infinity {
				floor = alpha - margin - 1
			}

			var score int
			if history[positionKey(&next)] {
				score = 0 //repetition, a draw
			} else {
				score = -s.alphaBeta(&next, d-1, 1, -infinity, -floor, true)
			}

			if s.aborted {
				break
			}

			scores[i] = score
			searched++

			if score > alpha {
				alpha = score
				bestIndex = i
			}
		}

		//out of budget before the first move, the previous depth's best, got through: the previous depth's result stays.
		//after it, the depth's best so far is kept: it scored at least as well as the previous best, at this depth
		if s.aborted && bestIndex < 0 {
			break
		}

		//a move that failed low scores [floor], below alpha-margin, so it's never taken for a near-best
		nearBest = nearBest[:0]
		for i := range searched {
			if scores[i] >= alpha-margin {
				nearBest = append(nearBest, moves[i])
			}
		}

		var best Move = moves[bestIndex]
		copy(moves[1:bestIndex+1], moves[:bestIndex])
		moves[0] = best
		bestScore = alpha

		if s.aborted {
			break
		}
	}

	//with a mate on the board, the fastest one. a slower mate within the margin could put it off forever
	if margin > 0 && bestScore > -mateScore+maxPly && bestScore < mateScore-maxPly {
		return nearBest[rand.Intn(len(nearBest))], bestScore
	}

	return moves[0], bestScore
}

// gamePhase is maxPhase with all pieces on the board, down to 0 with only kings and pawns.
func gamePhase(game *Game) int {
	var phase int = 0
	for _, p := range game.board {
		phase += phaseWeight[pieceType(p)]
	}
	return min(phase, maxPhase)
}

// alphaBeta is a negamax search: scores are always from the perspective of the side to move.
// [allowNull] is false right after a null move: a second one would only give the move back.
func (s *searcher) alphaBeta(game *Game, depth int, ply int, alpha, beta int, allowNull bool) int {
	if !s.visit() {
		return 0
	}

	if depth == 0 || ply >= maxPly {
		return s.quiesce(game, ply, 0, alpha, beta)
	}

	var hashMove Move
	if entry := probeTT(game.hash); entry != nil {
		hashMove = entry.move
		if int(entry.depth) >= depth {
			var score int = ttScore(entry, ply)
			if entry.bound == boundExact || entry.bound == boundLower && score >= beta || entry.bound == boundUpper && score <= alpha {
				return min(max(score, alpha), beta) //within the window, as the search fails hard
			}
		}
	}

	var color PieceColor = game.color
	var inCheck bool = game.inCheck(color)

	//null move pruning: when the side to move could pass, and a shallower search still fails high, a real move would too.
	//not in check, where passing is illegal, and not with only pawns left: having to move can be what loses there (zugzwang)
	if allowNull && depth >= nullMinDepth && !inCheck && beta < mateScore-maxPly && hasPieces(game, color) && evaluate(game) >= beta {
		var reduction int = 2
		if depth >= 6 {
			reduction = 3
		}

		var next Game = *game
		next.makeNullMove()
		var score int = -s.alphaBeta(&next, depth-1-reduction, ply+1, -beta, -beta+1, false)
		if s.aborted {
			return 0
		}
		if score >= beta {
			return beta
		}
	}

	var moves []Move = pseudoLegalMoves(game, s.moves[ply][:0], false)
	var order []int32 = s.scoreMoves(game, moves, ply, hashMove)

	var legal int = 0
	var bestMove Move
	var bound uint8 = boundUpper

	for i := range moves {
		pickMove(moves, order, i)

		var move Move = moves[i]
		var next Game = *game
		next.makeMove(move)
		if next.inCheck(color) {
			continue
		}
		legal++

		//late move reductions: past the first moves, with the table's move, the captures and the killers in front, a quiet
		//move rarely raises alpha. it gets a shallower null window search first, and the full one only if it does.
		//not when in check, or when the move gives check: tactics
		var score int
		if depth >= lmrMinDepth && legal > lmrFullMoves && order[i] == 0 && !inCheck && !next.inCheck(next.color) {
			var reduction int = 1
			if depth >= 5 && legal > 2*lmrFullMoves {
				reduction = 2
			}

			score = -s.alphaBeta(&next, depth-1-reduction, ply+1, -alpha-1, -alpha, true)
			if score > alpha && !s.aborted {
				score = -s.alphaBeta(&next, depth-1, ply+1, -beta, -alpha, true)
			}
		} else {
			score = -s.alphaBeta(&next, depth-1, ply+1, -beta, -alpha, true)
		}

		if s.aborted { //the scores are void, keep them out of the table
			return 0
		}

		if score > alpha {
			alpha = score
			bestMove = move
			bound = boundExact
			if alpha >= beta {
				if game.board[move.to] == 0 && move != s.killers[ply][0] {
					s.killers[ply][1] = s.killers[ply][0]
					s.killers[ply][0] = move
				}
				storeTT(game.hash, depth, ply, beta, boundLower, move)
				return beta
			}
		}
	}

	if legal == 0 {
		if inCheck {
			return -mateScore + ply //prefer faster mates
		}
		return 0 //stalemate
	}

	storeTT(game.hash, depth, ply, alpha, bound, bestMove)
	return alpha
}

// quiesce keeps searching captures and promotions past the depth limit until the position is quiet,
// so the evaluation is never taken in the middle of an exchange (horizon effect).
// When in check every evasion is searched instead, so mates at the horizon are still seen.
// Only for the first [checkEvasionDepth] plies of [qdepth]: past that, captures that give check would keep
// alternating with evasions, and the tree grows exponentially in positions with many pieces en prise.
func (s *searcher) quiesce(game *Game, ply, qdepth int, alpha, beta int) int {
	if !s.visit() {
		return 0
	}

	if ply >= maxPly {
		return evaluate(game)
	}

	var color PieceColor = game.color
	var inCheck bool = qdepth < checkEvasionDepth && game.inCheck(color)
	var standPat int = -infinity

	if !inCheck { //stand pat: the side to move is not forced to capture
		standPat = evaluate(game)
		if standPat >= beta {
			return beta
		}
		if standPat > alpha {
			alpha = standPat
		}
	}

	var moves []Move = pseudoLegalMoves(game, s.moves[ply][:0], !inCheck)
	var order []int32 = s.scoreMoves(game, moves, ply, Move{})
	var legal int = 0

	for i := range moves {
		pickMove(moves, order, i)

		//delta pruning: skip captures that can't raise the score to alpha even when winning the piece for free
		var victim PieceType = pieceType(game.board[moves[i].to])
		if !inCheck && victim != 0 && order[i] < 20000 && standPat+pieceValue[victim]+deltaMargin <= alpha {
			continue
		}

		var next Game = *game
		next.makeMove(moves[i])
		if next.inCheck(color) {
			continue
		}
		legal++

		var score int = -s.quiesce(&next, ply+1, qdepth+1, -beta, -alpha)
		if score > alpha {
			alpha = score
			if alpha >= beta {
				return beta
			}
		}
	}

	if inCheck && legal == 0 {
		return -mateScore + ply
	}

	return alpha
}

func randomMove(game *Game) Move {
	var moves []Move = legalMoves(game)

	if len(moves) == 0 {
		return Move{}
	}

	return moves[rand.Intn(len(moves))]
}
