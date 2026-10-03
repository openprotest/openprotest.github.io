class Chess extends Window {
    static FEN_START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    static PIECE_NAMES = { k:"king", q:"queen", r:"rook", n:"knight", b:"bishop", p:"pawn" };
    static REFRACTION_SCALE = .4;
    static PIECE_BRIGHTNESS = { w:1.2, b:.6 };

    static instances = 0;
    static pieceMaps = {};

    static CreateSvg(tag, attributes = {}) {
        const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
        for (const name in attributes) element.setAttribute(name, attributes[name]);
        return element;
    }

    static GetPieceMap(name) {
        if (Chess.pieceMaps[name]) return Chess.pieceMaps[name];

        Chess.pieceMaps[name] = new Promise(resolve=> {
            const size   = 128;
            const radius = 6;

            const image = new Image();
            image.onload = ()=> {
                const canvas = document.createElement("canvas");
                canvas.width = canvas.height = size;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(image, 0, 0, size, size);
                const pixels = ctx.getImageData(0, 0, size, size);

                let height = new Float32Array(size * size);
                for (let i = 0; i < size * size; i++)
                    height[i] = pixels.data[i * 4 + 3] / 255;

                const blur = (source, horizontal)=> {
                    const target = new Float32Array(size * size);
                    for (let a = 0; a < size; a++) {
                        let sum = 0;
                        for (let b = -radius; b <= radius; b++) {
                            const c = Math.min(size - 1, Math.max(0, b));
                            sum += source[horizontal ? a * size + c : c * size + a];
                        }
                        for (let b = 0; b < size; b++) {
                            target[horizontal ? a * size + b : b * size + a] = sum / (radius * 2 + 1);
                            const add = Math.min(size - 1, b + radius + 1), remove = Math.max(0, b - radius);
                            sum += source[horizontal ? a * size + add : add * size + a] - source[horizontal ? a * size + remove : remove * size + a];
                        }
                    }
                    return target;
                };
                for (let i = 0; i < 3; i++) height = blur(blur(height, true), false);

                //the steepest slope maps to full displacement
                const gradients = new Float32Array(size * size * 2);
                let max = 0;
                for (let y = 0; y < size; y++) {
                    for (let x = 0; x < size; x++) {
                        const i = y * size + x;
                        const gx = height[y * size + Math.min(size - 1, x + 1)] - height[y * size + Math.max(0, x - 1)];
                        const gy = height[Math.min(size - 1, y + 1) * size + x] - height[Math.max(0, y - 1) * size + x];
                        gradients[i * 2] = gx;
                        gradients[i * 2 + 1] = gy;
                        max = Math.max(max, Math.hypot(gx, gy));
                    }
                }

                for (let i = 0; i < size * size; i++) {
                    pixels.data[i * 4]     = 128 - 127 * gradients[i * 2] / max; //downhill is outward
                    pixels.data[i * 4 + 1] = 128 - 127 * gradients[i * 2 + 1] / max;
                    pixels.data[i * 4 + 2] = 128;
                    pixels.data[i * 4 + 3] = 255;
                }
                ctx.putImageData(pixels, 0, 0);
                resolve(canvas.toDataURL("image/png"));
            };
            image.src = `chess/${name}.svg`;
        });

        return Chess.pieceMaps[name];
    }

    static SOUNDS = {
        move: { volume:0.5, lowpass:1000, hits: [
            { at:0, noise:{ gain:4.29, freq:470, q:1.2, decay:0.00262 }, partials:[[469,0.0706,0.00829], [932,0.21,0.00469], [662,0.0302,0.00736], [1170,0.171,0.00224], [1320,0.0793,0.00658], [200,0.0494,0.0055]] }
        ]},
        capture: { volume:0.5, lowpass:1200, hits: [ //a light touch, then the hit
            { at:0, noise:{ gain:0.711, freq:134, q:1, decay:0.000395 }, partials:[[586,0.0224,0.00469], [1230,0.0206,0.00641]] },
            { at:0.0065, noise:{ gain:3.87, freq:487, q:0.9, decay:0.000943 }, partials:[[1470,0.0608,0.00109], [1240,0.199,0.00414], [938,0.0553,0.00061], [1700,0.102,0.00542], [627,0.106,0.00569], [250,0.0553,0.00159], [1990,0.0517,0.00853]] },
            { at:0.019, noise:{ gain:0.631, freq:274, q:1, decay:0.00263 } }
        ]},
        check: { hits: [
            { at:0, noise:{ gain:0.0434, freq:1950, q:0.5, decay:0.0117 } },
            { at:0.0095, noise:{ gain:0.303, freq:3280, q:0.5, decay:0.00586 }, partials:[[961,0.069,0.00152], [1050,0.127,0.005], [668,0.156,0.00694], [873,0.129,0.00559], [1470,0.199,0.00438], [500,0.0203,0.00411]] },
            { at:0.0225, noise:{ gain:0.758, freq:237, q:1, decay:0.00152 } },
            { at:0.0265, noise:{ gain:0.445, freq:3090, q:1, decay:0.000252 } }
        ]},
    };

    static audioContext = null;
    static noiseBuffer = null;
    static periodicWaves = {};

    static PlaySound(name) {
        const sound = Chess.SOUNDS[name];
        if (!sound) return;

        try {
            Chess.audioContext ??= new AudioContext();
        }
        catch {
            return;
        }

        const ctx = Chess.audioContext;
        if (ctx.state === "suspended") ctx.resume();
        const now = ctx.currentTime + 0.005;

        if (!Chess.noiseBuffer) {
            //seeded and at a fixed rate: the clicks are a few samples long and were tuned on this exact noise
            Chess.noiseBuffer = ctx.createBuffer(1, 9600, 48000);
            const data = Chess.noiseBuffer.getChannelData(0);
            let seed = 1;
            for (let i = 0; i < data.length; i++) {
                seed = seed * 16807 % 2147483647;
                data[i] = seed / 1073741823.5 - 1;
            }
        }

        let output = ctx.destination;
        if (sound.lowpass) {
            const filter = ctx.createBiquadFilter();
            filter.type = "lowpass";
            filter.frequency.value = sound.lowpass;
            filter.connect(output);
            output = filter;
        }
        if (sound.volume !== undefined) {
            const volume = ctx.createGain();
            volume.gain.value = sound.volume;
            volume.connect(output);
            output = volume;
        }

        //plays [source] through [node] at [gain], decaying exponentially by [decay]
        const strike = (source, node, at, gain, decay, attack)=> {
            const envelope = ctx.createGain();
            envelope.gain.setValueAtTime(0, at);
            envelope.gain.linearRampToValueAtTime(gain, at + attack);
            envelope.gain.setTargetAtTime(0, at + attack, decay);
            node.connect(envelope);
            envelope.connect(output);
            source.start(at);
            source.stop(at + attack + decay * 8);
        };

        for (const hit of sound.hits ?? []) {
            const at = now + hit.at;

            if (hit.noise) {
                const source = ctx.createBufferSource();
                source.buffer = Chess.noiseBuffer;
                const filter = ctx.createBiquadFilter();
                filter.type = "bandpass";
                filter.frequency.value = hit.noise.freq;
                filter.Q.value = hit.noise.q;
                source.connect(filter);
                strike(source, filter, at, hit.noise.gain, hit.noise.decay, 0.0005);
            }

            for (const [freq, gain, decay] of hit.partials ?? []) {
                const osc = ctx.createOscillator();
                osc.frequency.value = freq;
                strike(osc, osc, at, gain, decay, 0.001);
            }
        }

        if (sound.buzz) {
            const buzz = sound.buzz;

            if (!Chess.periodicWaves[name]) {
                const anchors = buzz.harmonics;
                const count = anchors[anchors.length - 1][0];
                const real = new Float32Array(count + 1), imag = new Float32Array(count + 1);
                for (let k = 1; k <= count; k++) {
                    const j = anchors.findIndex(o=> o[0] >= k);
                    const [k1, v1] = anchors[j], [k0, v0] = anchors[Math.max(0, j - 1)];
                    real[k] = k1 === k0 ? v1 : v0 + (v1 - v0) * (k - k0) / (k1 - k0); //cosine phase, a pulse like a buzzer
                }
                Chess.periodicWaves[name] = ctx.createPeriodicWave(real, imag, { disableNormalization: true });
            }

            const osc = ctx.createOscillator();
            osc.frequency.value = buzz.freq;
            osc.setPeriodicWave(Chess.periodicWaves[name]);

            const envelope = ctx.createGain();
            envelope.gain.setValueAtTime(0, now);
            envelope.gain.linearRampToValueAtTime(buzz.gain, now + buzz.attack);
            envelope.gain.setValueAtTime(buzz.gain, now + buzz.attack + buzz.hold);
            envelope.gain.linearRampToValueAtTime(0, now + buzz.attack + buzz.hold + buzz.release);

            osc.connect(envelope);
            envelope.connect(output);
            osc.start(now);
            osc.stop(now + buzz.attack + buzz.hold + buzz.release + 0.01);
        }
    }

    constructor(args) {
        super([64,64,64]);

        this.params = args ?? null;

        Window.AddCssDependencies("chess/chess.css");

        this.SetTitle("Chess");
        this.SetIcon("chess/king.svg");
        this.content.style.overflow = "hidden";

        this.board = document.createElement("div");
        this.board.className = "chess-board";
        
        this.board.onmousemove   = event => this.Board_mousemove(event, false);
        this.board.onmouseup     = event => this.Board_mouseup(event, false);
        this.board.onmouseleave  = event => this.Board_mouseleave(event, false);
        this.board.addEventListener("touchmove",   event => this.Board_mousemove(event, true));
        this.board.addEventListener("touchend",    event => this.Board_mouseup(event, true));
        this.board.addEventListener("touchcancel", event => this.Board_mouseleave(event, true));
        
        this.content.appendChild(this.board);

        this.playerA = "ui";
        this.playerB = "ai";

        this.game = {
            fen: null,
            placement: [],
            activecolor: "w",
            castling: "KQkq",
            enpassant: "-",
            halfmove: 0,
            fullmove: 1,
            lastmove: null
        };

        this.uid = `chess${++Chess.instances}`;
        this.svg = Chess.CreateSvg("svg", { class:"chess-svg", viewBox:"0 0 8 8" });
        this.board.appendChild(this.svg);

        this.defs = Chess.CreateSvg("defs");
        this.boardLayer = Chess.CreateSvg("g", { id:`${this.uid}-board` }); //the pieces refract a copy of this layer
        this.squaresLayer = Chess.CreateSvg("g");
        this.highlightsLayer = Chess.CreateSvg("g");
        this.coordsLayer = Chess.CreateSvg("g");
        this.indicatorsLayer = Chess.CreateSvg("g");
        this.piecesLayer = Chess.CreateSvg("g");
        this.sceneLayer = Chess.CreateSvg("g", { id:`${this.uid}-scene` }); //a moving piece refracts a copy of this, other pieces included
        this.liftLayer = Chess.CreateSvg("g"); //moving pieces, over the scene and outside it, see LiftPiece
        this.boardLayer.append(this.squaresLayer, this.highlightsLayer, this.coordsLayer);
        this.sceneLayer.append(this.boardLayer, this.indicatorsLayer, this.piecesLayer);
        this.svg.append(this.defs, this.sceneLayer, this.liftLayer);

        this.squares = [[], [], [], [], [], [], [], []];
        for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++) {
                const square = Chess.CreateSvg("rect", {
                    class : (x + y) % 2 === 0 ? "chess-square chess-square-light" : "chess-square chess-square-dark",
                    width : 1,
                    height: 1
                });
                square.boardPosition = { x: x, y: y };
                this.squaresLayer.appendChild(square);
                this.squares[x][y] = square;
            }

        this.legalMoves = [];
        this.indicators = [];
        this.isFlipped = false;
        this.isGameOver = false;
        this.positions = []; //PositionKey of every position of the game, for repetitions
        this.history = [];   //{fen, san} of every position, the first one is the starting position with no move
        this.view = 0;       //index of the shown position in history, the board is inert unless it's the last
        this.isPromotionPending = false;

        //ranks on the left column, files on the bottom row. their text follows the flip, see Layout
        this.rankLabels = [];
        this.fileLabels = [];
        for (let i = 0; i < 8; i++) {
            const rank = Chess.CreateSvg("text", { class:"chess-coord", x:.06, y:i + .06, "dominant-baseline":"hanging" });
            rank.style.fill = i % 2 === 0 ? "rgb(84,84,84)" : "rgb(108,108,108)";
            this.coordsLayer.appendChild(rank);
            this.rankLabels.push(rank);

            const file = Chess.CreateSvg("text", { class:"chess-coord", x:i + .94, y:7.94, "text-anchor":"end" });
            file.style.fill = i % 2 === 0 ? "rgb(108,108,108)" : "rgb(84,84,84)";
            this.coordsLayer.appendChild(file);
            this.fileLabels.push(file);
        }

        this.Layout();

        this.sidepanel = document.createElement("div");
        this.sidepanel.className = "chess-sidepanel";
        this.content.appendChild(this.sidepanel);

        this.moveslist = document.createElement("div");
        this.moveslist.className = "chess-moveslist";
        this.sidepanel.appendChild(this.moveslist);

        this.win.addEventListener("keydown", event=> {
            if (event.key === "ArrowLeft") this.ShowMove(this.view - 1);
            else if (event.key === "ArrowRight") this.ShowMove(this.view + 1);
            else if (event.key === "Home") this.ShowMove(0);
            else if (event.key === "End") this.ShowMove(this.history.length - 1);
            else return;
            event.preventDefault();
        });

        setTimeout(() => { this.AfterResize(); }, WIN.ANIME_DURATION);
        setTimeout(() => { this.AfterResize(); }, 1000);

        if (this.playerA === "ai" || this.playerB === "ai") {
            this.InitWasmChessAi();
        }
        else {
            this.LoadGame(this.params);
        }
    }

    InitWasmChessAi() {
        const go = new Go();
        WebAssembly.instantiateStreaming(fetch("chess/chess.wasm"), go.importObject).then((result) => {
            this.LoadGame(this.params);

            go.run(result.instance);

            if (!this.CheckGameOver()) this.PlayAiMove(); //restored on the ai's turn, or a finished game
        });
    }

    IsAiTurn() {
        return this.game.activecolor === "w" && this.playerA === "ai" ||
               this.game.activecolor === "b" && this.playerB === "ai";
    }

    PlayAiMove(delay = 500) {
        if (!this.IsAiTurn()) return;

        setTimeout(()=> {
            if (this.isClosed || this.isGameOver) return;
            if (!this.IsAiTurn() || !this.IsLive()) return; //played by an earlier call, or showing history

            let aiMove = null;
            try {
                aiMove = ChessAi(this.GetCurrentFen(), 1, this.positions.join(","));
            }
            catch (ex) {
                console.error(ex);
            }

            let move = this.ParseAiMove(aiMove);
            if (!move) { //no answer, or an error from the engine. a legal move keeps the game going instead of stalling
                console.warn("ChessAi returned an invalid move:", aiMove);
                move = this.GetRandomLegalMove();
                if (!move) return;
            }

            this.PlayMove(move.p0, move.p1, null);
        }, delay);
    }

    //Returns {p0, p1} from the engine's "e2-e4" form, or null if it's not a legal move of the side to move.
    ParseAiMove(aiMove) {
        if (typeof aiMove !== "string" || !/^[a-h][1-8]-[a-h][1-8]$/.test(aiMove)) return null;

        const p0 = {x: aiMove.charCodeAt(0) - 97, y: 8 - parseInt(aiMove[1])};
        const p1 = {x: aiMove.charCodeAt(3) - 97, y: 8 - parseInt(aiMove[4])};

        if (this.GetPieceColor(p0, this.game) !== this.game.activecolor) return null;
        if (!this.GetLegalMoves(p0, this.game).some(o=> o.x === p1.x && o.y === p1.y)) return null;

        return { p0: p0, p1: p1 };
    }

    GetRandomLegalMove() {
        const moves = [];
        for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++)
                if (this.GetPieceColor({x:x, y:y}, this.game) === this.game.activecolor)
                    for (const p1 of this.GetLegalMoves({x:x, y:y}, this.game))
                        moves.push({ p0: {x:x, y:y}, p1: p1 });

        if (moves.length === 0) return null;
        return moves[Math.floor(Math.random() * moves.length)];
    }

    //Piece placement and side to move, the part of the fen that repeats (the engine uses the same form).
    PositionKey() {
        return this.GetCurrentFen().split(" ").slice(0, 2).join(" ");
    }

    HasLegalMove(color) {
        for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++)
                if (this.GetPieceColor({x:x, y:y}, this.game) === color && this.GetLegalMoves({x:x, y:y}, this.game).length > 0)
                    return true;
        return false;
    }

    //Returns the result of the game, or null while it goes on.
    GetGameResult() {
        const color = this.game.activecolor;

        if (!this.HasLegalMove(color)) {
            if (this.InCheck(this.game, color))
                return color === "w" ? { text:"Checkmate, black wins", score:"0-1" } : { text:"Checkmate, white wins", score:"1-0" };
            return { text:"Stalemate, draw", score:"½-½" };
        }

        const key = this.PositionKey();
        if (this.positions.filter(o=> o === key).length >= 3)
            return { text:"Draw by threefold repetition", score:"½-½" };

        if (this.game.halfmove >= 100)
            return { text:"Draw by the fifty-move rule", score:"½-½" };

        const pieces = this.game.placement.flat().filter(o=> o !== null && o.toLowerCase() !== "k");
        if (pieces.length === 0 || pieces.length === 1 && "nNbB".includes(pieces[0]))
            return { text:"Draw, insufficient material", score:"½-½" };

        return null;
    }

    //Ends the game if it is over, and shows the result. Returns true when over.
    CheckGameOver() {
        const result = this.GetGameResult();
        if (!result) return false;

        this.isGameOver = true;

        const divResult = document.createElement("div");
        divResult.className = "chess-score";
        divResult.textContent = result.score;
        this.moveslist.appendChild(divResult);

        const cover = document.createElement("div");
        cover.className = "chess-cover";
        this.content.appendChild(cover);

        const box = document.createElement("div");
        box.className = "chess-result";
        cover.appendChild(box);

        const label = document.createElement("p");
        label.textContent = result.text;
        box.appendChild(label);

        const btnNewGame = document.createElement("input");
        btnNewGame.type = "button";
        btnNewGame.value = "New game";
        box.appendChild(btnNewGame);

        cover.onclick = ()=> cover.remove(); //look at the final position
        box.onclick = event=> event.stopPropagation();
        btnNewGame.onclick = ()=> {
            cover.remove();
            this.NewGame();
        };

        return true;
    }

    NewGame() {
        this.isGameOver = false;
        for (const cover of this.content.querySelectorAll(".chess-cover")) cover.remove();

        this.LoadGame(null);
        this.PlayAiMove();
    }

    //Loads a game from params: the moves history, a single fen, or nothing for a new game.
    LoadGame(params) {
        let history;
        if (Array.isArray(params?.history) && params.history.length > 0)
            history = params.history;
        else if (typeof params === "string" && params.length > 0)
            history = [{ fen: params, san: null }];
        else
            history = [{ fen: Chess.FEN_START, san: null }];

        this.LoadFen(history[history.length - 1].fen);

        this.history = history;
        this.view = history.length - 1;
        this.board.inert = false;
        this.isPromotionPending = false;
        this.positions = history.map(o=> o.fen.split(" ").slice(0, 2).join(" "));

        this.moveslist.textContent = "";
        for (let i = 1; i < history.length; i++)
            this.AddChessNotation(i);
        this.SelectMove();

        this.SavePosition();
    }

    //Keeps the moves history in params, which LOADER.StoreSession saves when the page unloads.
    SavePosition() {
        if (!this.game.fen) return; //nothing loaded yet
        this.params = { history: this.history };
    }

    IsLive() {
        return this.view === this.history.length - 1;
    }

    //Shows the position at an index of the history. The board is inert, unless it's the last position.
    ShowMove(index) {
        index = Math.max(0, Math.min(this.history.length - 1, index));
        if (index === this.view) return;
        if (this.selected || this.isPromotionPending) return;

        this.view = index;

        if (this.IsLive()) {
            this.RenderPlacement(this.game.placement, this.game.lastmove);
        }
        else {
            const game = this.ParseFen(this.history[index].fen);
            this.RenderPlacement(game.placement, game.lastmove);
        }

        this.board.inert = !this.IsLive();
        this.SelectMove();

        if (this.IsLive()) this.PlayAiMove(); //the ai waits while history is shown
    }

    //Highlights the shown move in the moves list, and scrolls it into view.
    SelectMove() {
        for (const element of this.moveslist.querySelectorAll(".chess-move-selected"))
            element.classList.remove("chess-move-selected");

        const element = this.moveslist.querySelector(`.chess-move[index="${this.view}"]`);
        if (!element) {
            if (this.view === 0) this.moveslist.scrollTop = 0;
            return;
        }

        element.classList.add("chess-move-selected");

        if (element.offsetTop < this.moveslist.scrollTop)
            this.moveslist.scrollTop = element.offsetTop;
        else if (element.offsetTop + element.offsetHeight > this.moveslist.scrollTop + this.moveslist.clientHeight)
            this.moveslist.scrollTop = element.offsetTop + element.offsetHeight - this.moveslist.clientHeight;
    }

    AfterResize() { //override
        let w = this.content.clientWidth;
        let h = this.content.clientHeight;
        let min = Math.min(w, h) * .95;
        let offset = 0;

        if (w > h && w - min > 250) {
            this.sidepanel.style.visibility = "visible";
            this.sidepanel.style.opacity = "1";
            this.sidepanel.style.transform = "none";
            offset = -125;
        }
        else {
            this.sidepanel.style.visibility = "hidden";
            this.sidepanel.style.opacity = "0";
            this.sidepanel.style.transform = "translateX(100%)";
            offset = 0;
        }

        this.board.classList.toggle("chess-board-small", min < 400); //hides the coordinates

        this.board.style.width = min + "px";
        this.board.style.height = min + "px";
        this.board.style.left = (w - min) / 2 + offset + "px";
        this.board.style.top = (h - min) / 2 + "px";
    }

    //Turns the board by 180deg, with the pieces on it. The pieces counter-turn, so they stay upright.
    FlipBoard() {
        if (this.selected) return;

        this.isFlipped = !this.isFlipped;
        const pieces = [...this.piecesLayer.children, ...this.liftLayer.children];

        //at once: everything to its mirrored square and the board turned by 180deg, so nothing has moved on screen yet
        this.board.classList.add("chess-instant", "chess-flipping");
        this.Layout(false);
        for (const piece of pieces) {
            const d = piece.displayPosition;
            this.SetPieceDisplayPosition(piece, d.x, d.y, piece.scale, -180);
        }
        this.svg.style.transform = "rotate(180deg)";
        getComputedStyle(this.svg).transform; //the transitions start from here

        //then the board turns back to 0, and each piece the opposite way at the same pace
        this.board.classList.remove("chess-instant");
        this.svg.style.transform = "rotate(0deg)";
        for (const piece of pieces) {
            const d = piece.displayPosition;
            this.SetPieceDisplayPosition(piece, d.x, d.y, piece.scale, 0);
        }

        clearTimeout(this.flipTimer);
        this.flipTimer = setTimeout(()=> {
            this.board.classList.remove("chess-flipping"); //the coordinates fade back in
            this.svg.style.transform = "";
        }, 650);
    }

    ToDisplay(x, y) {
        return this.isFlipped ? { x: 7 - x, y: 7 - y } : { x: x, y: y };
    }

    FromDisplay(x, y) {
        return this.ToDisplay(x, y); //mirroring is its own inverse
    }

    //Positions an element of a square (square, highlight or indicator) at board coordinates.
    PlaceOnSquare(element, x, y, inset = 0) {
        element.boardPosition = { x: x, y: y };
        element.inset = inset;
        const d = this.ToDisplay(x, y);
        element.setAttribute("x", d.x + inset);
        element.setAttribute("y", d.y + inset);
    }

    //Positions everything for the current orientation. The pieces slide there, unless [slide] is false.
    Layout(slide = true) {
        for (const element of this.svg.querySelectorAll("rect"))
            if (element.boardPosition) this.PlaceOnSquare(element, element.boardPosition.x, element.boardPosition.y, element.inset);

        for (const element of this.indicatorsLayer.children) {
            const d = this.ToDisplay(element.boardPosition.x, element.boardPosition.y);
            element.setAttribute("cx", d.x + .5);
            element.setAttribute("cy", d.y + .5);
        }

        for (let i = 0; i < 8; i++) {
            this.rankLabels[i].textContent = this.isFlipped ? i + 1 : 8 - i;
            this.fileLabels[i].textContent = String.fromCharCode(this.isFlipped ? 104 - i : 97 + i);
        }

        for (const piece of [...this.piecesLayer.children, ...this.liftLayer.children]) { //copied, MovePiece moves them between the layers
            const p = piece.getAttribute("p");
            if (slide) {
                this.MovePiece(piece, parseInt(p[0]), parseInt(p[1]));
            }
            else {
                const d = this.ToDisplay(parseInt(p[0]), parseInt(p[1]));
                this.SetPieceDisplayPosition(piece, d.x, d.y);
            }
        }
    }

    //Moves a piece to a square, with the move transition. It's lifted while it slides, so it refracts the pieces it passes over.
    MovePiece(piece, x, y) {
        piece.setAttribute("p", `${x}${y}`);
        const d = this.ToDisplay(x, y);

        const from = piece.displayPosition;
        const isDragging = piece.classList.contains("chess-dragging");

        if (from && (from.x !== d.x || from.y !== d.y || piece.scale !== 1) && !isDragging)
            this.LiftPiece(piece);

        if (piece.parentNode === this.liftLayer && !isDragging) { //moving, or dropped where it was picked
            clearTimeout(piece.landTimer);
            piece.landTimer = setTimeout(()=> this.LandPiece(piece), 450); //after the .4s transition
        }

        this.SetPieceDisplayPosition(piece, d.x, d.y, 1);
    }

    SetPieceDisplayPosition(piece, x, y, scale = piece.scale ?? 1, rotation = piece.rotation ?? 0) {
        piece.displayPosition = { x: x, y: y };
        piece.scale = scale;
        piece.rotation = rotation;
        //in an svg, px are user units: squares. the board copy gets the inverse, so it stays aligned with the board
        piece.style.transform = `translate(${x}px, ${y}px) translate(.5px, .5px) rotate(${rotation}deg) scale(${scale}) translate(-.5px, -.5px)`;
        piece.boardCopy.style.transform = `translate(.5px, .5px) scale(${1 / scale}) rotate(${-rotation}deg) translate(-.5px, -.5px) translate(${-x}px, ${-y}px)`;
    }

    LiftPiece(piece) {
        clearTimeout(piece.landTimer);
        if (piece.parentNode === this.liftLayer) return;

        this.liftLayer.appendChild(piece);
        piece.boardCopy.setAttribute("href", `#${this.uid}-scene`);
        getComputedStyle(piece).transform;
    }

    LandPiece(piece) {
        clearTimeout(piece.landTimer);
        if (piece.parentNode !== this.liftLayer || piece.classList.contains("chess-dragging")) return;

        this.piecesLayer.appendChild(piece);
        piece.boardCopy.setAttribute("href", `#${this.uid}-board`);
    }

    ClientToBoard(point) {
        const rect = this.svg.getBoundingClientRect();
        return {
            x: (point.clientX - rect.left) * 8 / rect.width,
            y: (point.clientY - rect.top) * 8 / rect.height
        };
    }

    LoadFen(notation) {
        const game = this.ParseFen(notation);
        if (!game) return;

        this.game = game;
        this.RenderPlacement(this.game.placement, this.game.lastmove);
        this.positions = [this.PositionKey()];
    }

    ParseFen(notation) {
        let array = notation.split(" ");
        if (array.length < 4) return null;
        let placement = array[0];

        const game = {
            fen: notation,
            placement: [],
            activecolor: array[1],
            castling: array[2],
            enpassant: array[3],
            halfmove: parseInt(array[4]) || 0,
            fullmove: parseInt(array[5]) || 1,
            lastmove: /^[a-h][1-8][a-h][1-8]$/.test(array[6]) ? array[6] : null //non-standard 7th field
        };

        for (let i = 0; i < 8; i++) {
            game.placement[i] = [null, null, null, null, null, null, null, null];
        }

        let position = { x: 0, y: 0 };
        for (let i = 0; i < placement.length; i++) {
            let target = placement[i];
            if (target === "/") {
                position.x = 0;
                position.y += 1;
                continue;
            }

            if (!isNaN(target)) {
                position.x += parseInt(target);
                continue;
            }

            if (position.y === 0 && target === "P") //auto-promote
                target = "Q";
            else if (position.y === 7 && target === "p")
                target = "q";

            game.placement[position.x][position.y] = target;
            position.x += 1;
        }

        return game;
    }

    RenderPlacement(placement, lastmove) {
        this.piecesLayer.textContent = "";
        this.liftLayer.textContent = "";

        for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++)
                if (placement[x][y] !== null)
                    this.AddPiece(placement[x][y], { x: x, y: y });

        this.ClearSelection();
        this.ClearIndicators();
        this.MarkLastMove(lastmove);
    }

    MarkLastMove(move) {
        for (const element of this.highlightsLayer.querySelectorAll(".chess-lastmove-from, .chess-lastmove-to"))
            element.remove();

        if (!move) return;

        const from = Chess.CreateSvg("rect", { class:"chess-lastmove-from", width:1, height:1 });
        const to = Chess.CreateSvg("rect", { class:"chess-lastmove-to", width:1, height:1 });
        this.PlaceOnSquare(from, move.charCodeAt(0) - 97, 8 - parseInt(move[1]));
        this.PlaceOnSquare(to, move.charCodeAt(2) - 97, 8 - parseInt(move[3]));
        this.highlightsLayer.prepend(from, to); //under the selection
    }

    SelectSquare(x, y) {
        this.ClearSelection();
        const selection = Chess.CreateSvg("rect", { class:"chess-selection", width:.93, height:.93 });
        this.PlaceOnSquare(selection, x, y, .035);
        this.highlightsLayer.appendChild(selection);
    }

    ClearSelection() {
        for (const element of this.highlightsLayer.querySelectorAll(".chess-selection"))
            element.remove();
    }

    GetCurrentFen() {
        let notaion = "";
        let x = 0, y = 0, blank = 0;

        while (true) {
            if (this.game.placement[x][y] === null) {
                blank++;
            }
            else {
                if (blank > 0) {
                    notaion += blank;
                    blank = 0;
                }
                notaion += this.game.placement[x][y];
            }

            x++;

            if (x > 7) {
                if (blank > 0) {
                    notaion += blank;
                    blank = 0;
                }
                if (y !== 7) notaion += "/";
                y++;
                x = 0;
            }

            if (y > 7) break;
        }

        notaion += " " + this.game.activecolor;
        notaion += " " + this.game.castling;
        notaion += " " + this.game.enpassant;
        notaion += " " + this.game.halfmove;
        notaion += " " + this.game.fullmove;
        if (this.game.lastmove) notaion += " " + this.game.lastmove;
        return notaion;
    }

    AddPiece(type, position) {
        const isWhite = type === type.toUpperCase();
        const piece = Chess.CreateSvg("g", { class: isWhite ? "chess-piece chess-white" : "chess-piece" });

        const hit = Chess.CreateSvg("rect", { class:"chess-piece-hit", width:1, height:1 }); //takes the pointer events

        piece.glass = Chess.CreateSvg("g", { class:"chess-piece-glass" });
        piece.refraction = Chess.CreateSvg("g");
        piece.boardCopy = Chess.CreateSvg("use", { href:`#${this.uid}-board` });
        const tint = Chess.CreateSvg("rect", { class:"chess-piece-tint", width:1, height:1 });

        piece.refraction.appendChild(piece.boardCopy);
        piece.glass.append(piece.refraction, tint);
        piece.append(piece.glass, hit);

        piece.onmousedown = event => this.Piece_mousedown(event, false, piece);
        piece.addEventListener("touchstart", event => this.Piece_mousedown(event, true, piece)); //ontouch* handlers don't fire where touch is off by default, like desktop chrome

        this.piecesLayer.appendChild(piece);

        this.MovePiece(piece, position.x, position.y);
        this.SetPieceType(piece, type);
    }

    SetPieceType(piece, type) {
        const name = Chess.PIECE_NAMES[type.toLowerCase()];
        const color = piece.classList.contains("chess-white") ? "w" : "b";
        piece.pieceName = name;

        piece.glass.setAttribute("mask", `url(#${this.GetPieceMask(name)})`);
        piece.refraction.setAttribute("filter", `url(#${this.GetPieceFilter(name, color)})`);
    }

    GetPieceMask(name) {
        const id = `${this.uid}-mask-${name}`;
        if (this.defs.querySelector(`#${id}`)) return id;

        const mask = Chess.CreateSvg("mask", { id:id, maskUnits:"userSpaceOnUse", x:0, y:0, width:1, height:1, style:"mask-type:alpha" });
        mask.appendChild(Chess.CreateSvg("image", { href:`chess/${name}.svg`, width:1, height:1 }));
        this.defs.appendChild(mask);
        return id;
    }

    GetPieceFilter(name, color) {
        const id = `${this.uid}-refract-${name}-${color}`;
        if (this.defs.querySelector(`#${id}`)) return id;

        const filter = Chess.CreateSvg("filter", {
            id: id,
            filterUnits: "userSpaceOnUse", primitiveUnits: "userSpaceOnUse",
            x: -.25, y: -.25, width: 1.5, height: 1.5, //room for the displacement to sample around the square
            "color-interpolation-filters": "sRGB"
        });

        const map = Chess.CreateSvg("feImage", { x:0, y:0, width:1, height:1, preserveAspectRatio:"none", result:"map" });
        const displacement = Chess.CreateSvg("feDisplacementMap", { in:"SourceGraphic", in2:"map", scale:Chess.REFRACTION_SCALE, xChannelSelector:"R", yChannelSelector:"G" });
        const brightness = Chess.CreateSvg("feComponentTransfer");
        for (const channel of ["feFuncR", "feFuncG", "feFuncB"])
            brightness.appendChild(Chess.CreateSvg(channel, { type:"linear", slope:Chess.PIECE_BRIGHTNESS[color] }));

        filter.append(map, displacement, brightness);
        this.defs.appendChild(filter);

        Chess.GetPieceMap(name).then(href=> map.setAttribute("href", href));
        return id;
    }

    PlayMove(p0, p1, element) {
        if (p0.x === p1.x && p0.y === p1.y) return;
        if (this.isClosed) return;

        let isCapture = false;

        const pieces = Array.from(this.board.querySelectorAll(".chess-piece"));
        
        //the element of the piece on a square, by its "p" attribute
        const findPiece = (x, y)=> pieces.find(piece => piece !== element && piece.getAttribute("p") === `${x}${y}`);

        if (!element)
            element = findPiece(p0.x, p0.y);

        //notation needs the position before the move, promotion and check are added once it's played
        let san = this.GetMoveNotation(p0, p1);

        if (this.game.placement[p0.x][p0.y].toLowerCase() === "p" && Math.abs(p0.y - p1.y) === 2) { //en passant flag
            this.game.enpassant = String.fromCharCode(97 + p1.x) + (8 - p1.y);
        }
        else {
            this.game.enpassant = "-";
        }

        if (this.game.placement[p0.x][p0.y].toLowerCase() === "p" && p0.x !== p1.x && this.game.placement[p1.x][p1.y] === null) { //en passant
            this.game.placement[p1.x][p0.y] = null;
            isCapture = true;

            const captured = findPiece(p1.x, p0.y);
            if (captured) captured.remove();
        }

        //castling flags
        if (this.game.placement[p0.x][p0.y] === "K") this.game.castling = this.game.castling.replace("K", "").replace("Q", "");
        if (this.game.placement[p0.x][p0.y] === "k") this.game.castling = this.game.castling.replace("k", "").replace("q", "");
        if (this.game.placement[p0.x][p0.y] === "R" && p0.x === 0 && p0.y === 7) this.game.castling = this.game.castling.replace("Q", "");
        if (this.game.placement[p0.x][p0.y] === "R" && p0.x === 7 && p0.y === 7) this.game.castling = this.game.castling.replace("K", "");
        if (this.game.placement[p0.x][p0.y] === "r" && p0.x === 0 && p0.y === 0) this.game.castling = this.game.castling.replace("q", "");
        if (this.game.placement[p0.x][p0.y] === "r" && p0.x === 7 && p0.y === 0) this.game.castling = this.game.castling.replace("k", "");
        if (this.game.castling === "") this.game.castling = "-";

        //castling
        if (this.game.placement[p0.x][p0.y].toLowerCase() === "k" && Math.abs(p0.x - p1.x) === 2) {
            const rookX0 = p1.x < p0.x ? 0 : 7; //queenside or kingside
            const rookX1 = p1.x < p0.x ? 3 : 5;

            this.game.placement[rookX1][p0.y] = this.game.placement[rookX0][p0.y];
            this.game.placement[rookX0][p0.y] = null;

            const rook = findPiece(rookX0, p0.y);
            if (rook) this.MovePiece(rook, rookX1, p0.y);
        }

        if (this.game.placement[p1.x][p1.y] !== null) { //capture a piece
            const captured = findPiece(p1.x, p1.y);
            if (captured) captured.remove();
            isCapture = true;
        }

        //fifty-move rule counter, reset by pawn moves and captures
        if (isCapture || this.game.placement[p0.x][p0.y].toLowerCase() === "p") {
            this.game.halfmove = 0;
        }
        else {
            this.game.halfmove++;
        }

        if (this.game.activecolor === "b") this.game.fullmove++;

        this.game.placement[p1.x][p1.y] = this.game.placement[p0.x][p0.y];
        this.game.placement[p0.x][p0.y] = null;
        
        this.MovePiece(element, p1.x, p1.y);

        const isPromotion = this.game.placement[p1.x][p1.y] === "P" && p1.y === 0 ||
                            this.game.placement[p1.x][p1.y] === "p" && p1.y === 7;

        let isSoundPlayed = false;

        //once the position is final, the move goes to the history
        const record = ()=> {
            if (isPromotion) san += "=" + this.game.placement[p1.x][p1.y].toUpperCase();
            const check = this.GetCheckNotation();
            san += check;

            if (check) Chess.PlaySound("check");
            else if (!isSoundPlayed) Chess.PlaySound(isCapture ? "capture" : "move");

            this.positions.push(this.PositionKey());
            this.history.push({ fen: this.GetCurrentFen(), san: san });
            this.view = this.history.length - 1;
            this.AddChessNotation(this.view);
            this.SelectMove();
            this.SavePosition();
        };

        if (isPromotion) {
            //ai always promotes to queen
            if (this.game.activecolor === "w" && this.playerA === "ai") {
                this.game.placement[p1.x][p1.y] = "Q";
                this.SetPieceType(element, "q");
            }
            else if (this.game.activecolor === "b" && this.playerB === "ai") {
                this.game.placement[p1.x][p1.y] = "q";
                this.SetPieceType(element, "q");
            }
            else {
                //the position is only final once a piece is picked. the piece has landed, so it sounds now
                this.isPromotionPending = true;
                Chess.PlaySound(isCapture ? "capture" : "move");
                isSoundPlayed = true;
                const callback = ()=>{
                    this.isPromotionPending = false;
                    record();
                    if (!this.CheckGameOver()) this.PlayAiMove(0);
                };
                this.PromoteDialog(p1, element, callback);
            }
        }

        this.game.activecolor = this.game.activecolor === "w" ? "b" : "w";

        this.ClearSelection();

        this.game.lastmove = `${String.fromCharCode(97+p0.x)}${8-p0.y}${String.fromCharCode(97+p1.x)}${8-p1.y}`;
        this.MarkLastMove(this.game.lastmove);

        if (this.isPromotionPending) return; //continues in the promote dialog callback

        record();

        if (!this.CheckGameOver()) this.PlayAiMove();
    }

    //Standard algebraic notation of a move, from the position before it's played. Without promotion and check.
    GetMoveNotation(p0, p1) {
        const piece = this.game.placement[p0.x][p0.y];
        const type = piece.toLowerCase();
        const file = String.fromCharCode(97 + p0.x);
        const rank = String(8 - p0.y);
        const target = String.fromCharCode(97 + p1.x) + (8 - p1.y);

        if (type === "k" && Math.abs(p1.x - p0.x) === 2)
            return p1.x > p0.x ? "O-O" : "O-O-O";

        if (type === "p") //a diagonal pawn move is always a capture, en passant included
            return p0.x !== p1.x ? `${file}x${target}` : target;

        //other pieces of the same kind that can move to the same square
        let isAmbiguous = false, sameFile = false, sameRank = false;
        for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++) {
                if (x === p0.x && y === p0.y) continue;
                if (this.game.placement[x][y] !== piece) continue;
                if (!this.GetLegalMoves({ x: x, y: y }, this.game).some(o=> o.x === p1.x && o.y === p1.y)) continue;
                isAmbiguous = true;
                if (x === p0.x) sameFile = true;
                if (y === p0.y) sameRank = true;
            }

        let from = "";
        if (isAmbiguous) {
            if (!sameFile) from = file;
            else if (!sameRank) from = rank;
            else from = file + rank;
        }

        const capture = this.game.placement[p1.x][p1.y] !== null ? "x" : "";
        return type.toUpperCase() + from + capture + target;
    }

    //"+" for check, "#" for checkmate, of the side to move.
    GetCheckNotation() {
        const color = this.game.activecolor;
        if (!this.InCheck(this.game, color)) return "";
        return this.HasLegalMove(color) ? "+" : "#";
    }

    PromoteDialog(p, element, callback) {
        const cover = document.createElement("div");
        cover.className = "chess-cover";
        this.content.appendChild(cover);

        const container = document.createElement("div");
        cover.appendChild(container);

        const q = document.createElement("div");
        q.style.backgroundImage = "url(chess/queen.svg)";
        container.appendChild(q);

        const r = document.createElement("div");
        r.style.backgroundImage = "url(chess/rook.svg)";
        container.appendChild(r);

        const b = document.createElement("div");
        b.style.backgroundImage = "url(chess/bishop.svg)";
        container.appendChild(b);

        const n = document.createElement("div");
        n.style.backgroundImage = "url(chess/knight.svg)";
        container.appendChild(n);

        let color = this.GetPieceColor(p, this.game);

        q.onclick = ()=>{
            this.content.removeChild(cover);
            this.game.placement[p.x][p.y] = color === "w" ? "Q" : "q";
            this.SetPieceType(element, "q");
            callback();
        };

        r.onclick = ()=>{
            this.content.removeChild(cover);
            this.game.placement[p.x][p.y] = color === "w" ? "R" : "r";
            this.SetPieceType(element, "r");
            callback();
        };

        b.onclick = ()=>{
            this.content.removeChild(cover);
            this.game.placement[p.x][p.y] = color === "w" ? "B" : "b";
            this.SetPieceType(element, "b");
            callback();
        };

        n.onclick = ()=>{
            this.content.removeChild(cover);
            this.game.placement[p.x][p.y] = color === "w" ? "N" : "n";
            this.SetPieceType(element, "n");
            callback();
        };
    }

    //Adds the move at an index of the history to the moves list, as rows of: number, white move, black move.
    AddChessNotation(index) {
        const entry = this.history[index];
        const after = entry.fen.split(" ");
        const isWhite = after[1] === "b"; //black to move after a white move
        const number = isWhite ? parseInt(after[5]) : parseInt(after[5]) - 1;

        if (isWhite || index === 1) { //new row, a game can start on black's move
            const divNumber = document.createElement("div");
            divNumber.className = "chess-move-number";
            divNumber.textContent = `${number}.`;
            this.moveslist.appendChild(divNumber);

            if (!isWhite) {
                const divEmpty = document.createElement("div");
                divEmpty.className = "chess-move-empty";
                divEmpty.textContent = "...";
                this.moveslist.appendChild(divEmpty);
            }
        }

        const divMove = document.createElement("div");
        divMove.className = "chess-move";
        divMove.textContent = entry.san;
        divMove.setAttribute("index", index);
        divMove.onclick = ()=> this.ShowMove(index);
        this.moveslist.appendChild(divMove);
    }

    ClearIndicators() {
        for (let i = 0; i < this.indicators.length; i++)
            this.indicators[i].parentElement.removeChild(this.indicators[i]);

        this.indicators = [];
    }
    
    GetPieceColor(p, game) {
        if (game.placement[p.x][p.y] === null) return null;
        if (game.placement[p.x][p.y] === game.placement[p.x][p.y].toLowerCase()) return "b";
        return "w";
    }

    GetPseudoLegalMoves(p, game) {
        let piece = game.placement[p.x][p.y];
        let color = this.GetPieceColor(p, game);
        let moves = [];

        const pawnMoves = () => {
            if (color === "w") {
                if (game.placement[p.x][p.y - 1] === null) //1 squares forward
                    moves.push({ x: p.x, y: p.y - 1 });

                if (p.y === 6 && //2 squares forward
                    game.placement[p.x][p.y - 1] === null &&
                    game.placement[p.x][p.y - 2] === null) 
                    moves.push({ x: p.x, y: p.y - 2 });

                if (p.x > 0 && //capture left
                    game.placement[p.x - 1][p.y - 1] !== null &&
                    this.GetPieceColor({ x: p.x - 1, y: p.y - 1 }, game) !== color)
                    moves.push({ x: p.x - 1, y: p.y - 1 });

                if (p.x < 7 && //capture right
                    game.placement[p.x + 1][p.y - 1] !== null &&
                    this.GetPieceColor({ x: p.x + 1, y: p.y - 1 }, game) !== color)
                    moves.push({ x: p.x + 1, y: p.y - 1 });

                if (game.enpassant !== "-") { //enpassant
                    let x = game.enpassant.charCodeAt(0) - 97;
                    let y = 8 - parseInt(game.enpassant[1]);
                    if (y === p.y && Math.abs(x - p.x) === 1)
                        moves.push({ x: x, y: y - 1 });
                }
            }
            else {
                if (game.placement[p.x][p.y + 1] === null) //1 squares forward
                    moves.push({ x: p.x, y: p.y + 1 });

                if (p.y === 1 && //2 squares forward
                    game.placement[p.x][p.y + 1] === null &&
                    game.placement[p.x][p.y + 2] === null)
                    moves.push({ x: p.x, y: p.y + 2 });

                if (p.x > 0 && //capture left
                    game.placement[p.x - 1][p.y + 1] !== null &&
                    this.GetPieceColor({ x: p.x - 1, y: p.y + 1 }, game) !== color)
                    moves.push({ x: p.x - 1, y: p.y + 1 });

                if (p.x < 7 && //capture right
                    game.placement[p.x + 1][p.y + 1] !== null &&
                    this.GetPieceColor({ x: p.x + 1, y: p.y + 1 }, game) !== color)
                    moves.push({ x: p.x + 1, y: p.y + 1 });

                if (game.enpassant !== "-") { //enpassant
                    let x = game.enpassant.charCodeAt(0) - 97;
                    let y = 8 - parseInt(game.enpassant[1]);
                    if (y === p.y && Math.abs(x - p.x) === 1)
                        moves.push({ x: x, y: y + 1 });
                }
                
            }
        };

        const knightMoves = () => {
            const offset = [
                { x: -2, y: -1 },
                { x: -2, y: 1 },
                { x: -1, y: -2 },
                { x: -1, y: 2 },
                { x: 1, y: -2 },
                { x: 1, y: 2 },
                { x: 2, y: -1 },
                { x: 2, y: 1 }
            ];

            for (let i = 0; i < offset.length; i++) {
                let x = p.x + offset[i].x, y = p.y + offset[i].y;
                if (x < 0 || x > 7 || y < 0 || y > 7) continue;
                if (this.GetPieceColor({ x: x, y: y }, game) === color) continue;
                moves.push({ x: x, y: y });
            }
        };

        const bishopMoves = () => {
            for (let i = 1; i < 8; i++) {
                if (p.x - i < 0 || p.y - i < 0) break;
                if (this.GetPieceColor({ x: p.x - i, y: p.y - i }, game) === color) break;
                moves.push({ x: p.x - i, y: p.y - i });
                if (game.placement[p.x - i][p.y - i] !== null && this.GetPieceColor({ x: p.x - i, y: p.y - i }, game) !== color) break;
            }
            for (let i = 1; i < 8; i++) {
                if (p.x - i < 0 || p.y + i > 7) break;
                if (this.GetPieceColor({ x: p.x - i, y: p.y + i }, game) === color) break;
                moves.push({ x: p.x - i, y: p.y + i });
                if (game.placement[p.x - i][p.y + i] !== null && this.GetPieceColor({ x: p.x - i, y: p.y + i }, game) !== color) break;
            }
            for (let i = 1; i < 8; i++) {
                if (p.x + i > 7 || p.y - i < 0) break;
                if (this.GetPieceColor({ x: p.x + i, y: p.y - i }, game) === color) break;
                moves.push({ x: p.x + i, y: p.y - i });
                if (game.placement[p.x + i][p.y - i] !== null && this.GetPieceColor({ x: p.x + i, y: p.y - i }, game) !== color) break;
            }
            for (let i = 1; i < 8; i++) {
                if (p.x + i > 7 || p.y + i > 7) break;
                if (this.GetPieceColor({ x: p.x + i, y: p.y + i }, game) === color) break;
                moves.push({ x: p.x + i, y: p.y + i });
                if (game.placement[p.x + i][p.y + i] !== null && this.GetPieceColor({ x: p.x + i, y: p.y + i }, game) !== color) break;
            }
        };

        const rockMoves = () => {
            for (let i = p.x - 1; i > -1; i--) {
                if (this.GetPieceColor({ x: i, y: p.y }, game) === color) break;
                moves.push({ x: i, y: p.y });
                if (game.placement[i][p.y] !== null && this.GetPieceColor({ x: i, y: p.y }, game) !== color) break;
            }
            for (let i = p.x + 1; i < 8; i++) {
                if (this.GetPieceColor({ x: i, y: p.y }, game) === color) break;
                moves.push({ x: i, y: p.y });
                if (game.placement[i][p.y] !== null && this.GetPieceColor({ x: i, y: p.y }, game) !== color) break;
            }
            for (let i = p.y - 1; i > -1; i--) {
                if (this.GetPieceColor({ x: p.x, y: i }, game) === color) break;
                moves.push({ x: p.x, y: i });
                if (game.placement[p.x][i] !== null && this.GetPieceColor({ x: p.x, y: i }, game) !== color) break;
            }
            for (let i = p.y + 1; i < 8; i++) {
                if (this.GetPieceColor({ x: p.x, y: i }, game) === color) break;
                moves.push({ x: p.x, y: i });
                if (game.placement[p.x][i] !== null && this.GetPieceColor({ x: p.x, y: i }, game) !== color) break;
            }
        };

        const kingMoves = () => {
            const offset = [
                { x: -1, y: -1 },
                { x: -1, y: 0 },
                { x: -1, y: 1 },
                { x: 0, y: -1 },
                { x: 0, y: 1 },
                { x: 1, y: -1 },
                { x: 1, y: 0 },
                { x: 1, y: 1 }
            ];

            for (let i = 0; i < offset.length; i++) {
                let x = p.x + offset[i].x, y = p.y + offset[i].y;
                if (x < 0 || x > 7 || y < 0 || y > 7) continue;
                if (this.GetPieceColor({ x: x, y: y }, game) === color) continue;
                moves.push({ x: x, y: y });
            }

            if (color === "w") {
                if (game.castling.indexOf("Q") > -1 &&
                    game.placement[0][7] === "R" &&
                    game.placement[1][7] === null &&
                    game.placement[2][7] === null &&
                    game.placement[3][7] === null) { //white queenside castling
                    moves.push({ x: p.x - 2, y: p.y });
                }

                if (game.castling.indexOf("K") > -1 &&
                    game.placement[7][7] === "R" &&
                    game.placement[5][7] === null &&
                    game.placement[6][7] === null) { //white kingside castling
                    moves.push({ x: p.x + 2, y: p.y });
                }

            }
            else if (color === "b") {
                if (game.castling.indexOf("q") > -1 &&
                    game.placement[0][0] === "r" &&
                    game.placement[1][0] === null &&
                    game.placement[2][0] === null &&
                    game.placement[3][0] === null) { //black queenside castling
                    moves.push({ x: p.x - 2, y: p.y });
                }

                if (game.castling.indexOf("k") > -1 &&
                    game.placement[7][0] === "r" &&
                    game.placement[5][0] === null &&
                    game.placement[6][0] === null) { //black kingside castling
                    moves.push({ x: p.x + 2, y: p.y });
                }
            }
        };

        switch (piece.toLowerCase()) {
            case "p":
                pawnMoves();
                break;

            case "n":
                knightMoves();
                break;

            case "b":
                bishopMoves();
                break;

            case "r":
                rockMoves();
                break;

            case "q":
                bishopMoves();
                rockMoves();
                break;

            case "k":
                kingMoves();
                break;
        }

        return moves;
    }

    GetLegalMoves(p, game) {
        const piece = game.placement[p.x][p.y];
        const color = this.GetPieceColor(p, game);
        const enemyColor = game.activecolor === "w" ? "b" : "w";
        
        const enemyControl = this.GetControlledSquares(game, enemyColor);
        const pseudoLegal = this.GetPseudoLegalMoves(p, game);
        let legal = [];
        
        /*let kingsPosition = null;
        let target = this.game.activecolor === "w" ? "K" : "k";
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                if (this.game.placement[x][y] === target) {
                    kingsPosition = { x: x, y: y };
                    break;
                }
            }
            if (kingsPosition) break;
        }*/

        for (let i = 0; i < pseudoLegal.length; i++) {
            if (piece.toLowerCase() === "k") {
                if (enemyControl[pseudoLegal[i].x][pseudoLegal[i].y]) { //king moves into check
                    continue;
                }

                if (color === "w") {
                    if (Math.abs(p.x - pseudoLegal[i].x) === 2 && enemyControl[4][7]) //castling while in check
                        continue;
                    if (p.x-pseudoLegal[i].x === -2 && enemyControl[5][7] || p.x-pseudoLegal[i].x === 2 && enemyControl[3][7]) //castling through check
                        continue;
                }

                if (color === "b") {
                    if (Math.abs(p.x - pseudoLegal[i].x) === 2 && enemyControl[4][0]) //castling while in check
                        continue;
                    if (p.x-pseudoLegal[i].x === -2 && enemyControl[5][0] || p.x-pseudoLegal[i].x === 2 && enemyControl[3][0]) //castling through check
                        continue;
                }
            }

            let clone = {
                fen        : null,
                placement  : structuredClone(this.game.placement),
                activecolor: this.game.activecolor === "w" ? "b" : "w",
                castling   : this.game.castling,
                enpassant  : this.game.enpassant,
                halfmove   : null,
                fullmove   : null,
                lastmove   : null
            };
            clone.placement[pseudoLegal[i].x][pseudoLegal[i].y] = clone.placement[p.x][p.y];
            clone.placement[p.x][p.y] = null;
            
            if (this.InCheck(clone, color)) {
                continue;
            }
            
            legal.push(pseudoLegal[i]);
        }
        
        return legal;
    }

    GetControlledSquares(game, color) {
        let area = [];
        for (let i = 0; i < 8; i++) {
            area.push([false, false, false, false, false, false, false, false]);
        }

        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {

                if (game.placement[x][y] === null) continue;
            
                let p = { x: x, y: y };
                let piece = game.placement[x][y];
                let pieceColor = this.GetPieceColor(p, game);
            
                if (color !== pieceColor) continue;
                
                if (piece.toLowerCase() === "p") { //count only captures for pawns
                    if (pieceColor === "w") {
                        if (x > 0) area[x-1][y-1] = true;
                        if (x < 7) area[x+1][y-1] = true;
                    }
                    else {
                        if (x > 0) area[x-1][y+1] = true;
                        if (x < 7) area[x+1][y+1] = true;
                    }

                }
                else {
                    let moves = this.GetPseudoLegalMoves(p, game);
                    for (let k = 0; k < moves.length; k++) {
                        area[moves[k].x][moves[k].y] = true;
                    }
                }

            }
        }

        return area;
    }

    InCheck(game, color) {
        const target = color === "w" ? "K" : "k";
        const enemyColor = color === "w" ? "b" : "w";
        let kingsPosition = null;
        
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                if (game.placement[x][y] === target) {
                    kingsPosition = { x: x, y: y };
                    break;
                }
            }   
            if (kingsPosition) break;
        }

        let control = this.GetControlledSquares(game, enemyColor);
        return control[kingsPosition.x][kingsPosition.y];
    }

    Piece_mousedown(event, isTouch, piece) {
        if (event.buttons !== 1 && !isTouch) {
            this.Board_mouseleave();
            return;
        }

        if (isTouch && event.touches.length > 1) {
            return;
        }

        const p = piece.getAttribute("p");
        this.file0 = parseInt(p[0]);
        this.rank0 = parseInt(p[1]);

        const point = this.ClientToBoard(isTouch ? event.touches[0] : event);
        this.grab = { x: point.x - piece.displayPosition.x, y: point.y - piece.displayPosition.y };

        this.selected = piece;
        this.LiftPiece(this.selected); //on top of the other pieces, refracting them
        this.selected.classList.add("chess-dragging");

        this.board.style.cursor = "none";

        if (this.game.activecolor === "w" && this.playerA === "ai") {
            return;
        }
        if (this.game.activecolor === "b" && this.playerB === "ai") {
            return;
        }
        if (this.isGameOver) return;

        let pieceColor = this.GetPieceColor({x:this.file0, y:this.rank0}, this.game);
        if (pieceColor !== this.game.activecolor) return;

        if (isTouch) { //bigger, to be seen around the finger
            const position = this.selected.displayPosition;
            this.SetPieceDisplayPosition(this.selected, position.x, position.y, 1.2);
        }

        this.SelectSquare(this.file0, this.rank0);

        this.ClearIndicators();

        this.legalMoves = this.GetLegalMoves({ x: this.file0, y: this.rank0 }, this.game);
        for (let i = 0; i < this.legalMoves.length; i++) {
            const move = this.legalMoves[i];
            const isCapture = this.game.placement[move.x][move.y] !== null ||
                this.game.placement[this.file0][this.rank0].toLowerCase() === "p" && this.file0 !== move.x; //en passant

            const indicator = Chess.CreateSvg("circle", {
                class: isCapture ? "chess-move-indicator chess-capture-indicator" : "chess-move-indicator",
                r: isCapture ? .42 : .15
            });
            indicator.boardPosition = { x: move.x, y: move.y };
            const d = this.ToDisplay(move.x, move.y);
            indicator.setAttribute("cx", d.x + .5);
            indicator.setAttribute("cy", d.y + .5);
            this.indicatorsLayer.appendChild(indicator);
            this.indicators.push(indicator);
        }
    }

    Board_mousemove(event, isTouch) {
        if (event.buttons !== 1 && !isTouch) return;

        if (isTouch && event.touches.length > 1) {
            this.Board_mouseleave(event, isTouch);
            return;
        }

        if (this.selected) {
            const point = this.ClientToBoard(isTouch ? event.touches[0] : event);
            if (isTouch) point.y -= 1; //above the finger

            //in display squares, the piece may hang half a square over the edge
            const x = Math.max(-.5, Math.min(7.5, point.x - this.grab.x));
            const y = Math.max(-.5, Math.min(7.5, point.y - this.grab.y));

            this.SetPieceDisplayPosition(this.selected, x, y);
        }
    }

    Board_mouseup(event, isTouch) {
        if (this.selected) {
            const position = this.selected.displayPosition;
            const target = this.FromDisplay(
                Math.max(0, Math.min(7, Math.round(position.x))),
                Math.max(0, Math.min(7, Math.round(position.y)))
            );

            this.selected.classList.remove("chess-dragging");
            this.board.style.cursor = "inherit";

            let isLegal = this.legalMoves.find(move => move.x === target.x && move.y === target.y);
            if (isLegal) {
                this.PlayMove({ x: this.file0, y: this.rank0 }, { x: target.x, y: target.y }, this.selected);
            }
            else { //undo
                this.MovePiece(this.selected, this.file0, this.rank0);
                //Chess.PlaySound("illegal");
            }

            this.ClearSelection();
            this.legalMoves = [];
        }

        this.selected = null;
        this.ClearIndicators();
    }

    Board_mouseleave(event, isTouch) {
        if (!this.selected) return;

        this.selected.classList.remove("chess-dragging");
        this.MovePiece(this.selected, this.file0, this.rank0);
        this.selected = null;

        this.ClearSelection();
        this.board.style.cursor = "inherit";

        this.legalMoves = [];
        this.ClearIndicators();
    }

}
