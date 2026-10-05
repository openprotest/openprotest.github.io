class Chess extends Window {
    static FEN_START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    static LEVEL_DEFAULT = 3;
    static LEVEL_MAX = 10;
    static PIECE_NAMES = { k:"king", q:"queen", r:"rook", n:"knight", b:"bishop", p:"pawn" };
    static REFRACTION_SCALE = .275;
    static PIECE_TONE = { w:{ slope:1, intercept:.35 }, b:{ slope:.7, intercept:-.12 } }; //of the refracted board: an intercept shifts it without flattening it, as the tint does
    static TILT = 45;          //deg, of the board in perspective
    static TILT_MAX = 60;      //deg, as far as an orbit tilts it
    static PERSPECTIVE = 2.5;  //the viewer's distance, in board sizes
    static THICKNESS = .05;    //of the board's sides in perspective, in board sizes
    static PIECE_FOOT = .93;   //where the piece images stand, in squares
    static PIECE_HEIGHT = { pawn:.68, rook:.74, knight:.81, bishop:.83, queen:.84, king:.83 }; //of the piece images, from the foot up

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
    static soundBuffers = {}; //name: the promise of its rendered buffer, see RenderSound

    static IsMuted() { //for every chess window, and remembered
        return localStorage.getItem("chess_mute") === "true";
    }

    static PlaySound(name) {
        const sound = Chess.SOUNDS[name];
        if (!sound || Chess.IsMuted()) return;

        try {
            Chess.audioContext ??= new AudioContext();
            Chess.soundBuffers[name] ??= Chess.RenderSound(sound);
        }
        catch {
            return;
        }

        const ctx = Chess.audioContext;
        if (ctx.state === "suspended") ctx.resume();

        Chess.soundBuffers[name].then(buffer=> {
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start();
        }).catch(()=> {});
    }

    static RenderSound(sound) {
        const ctx = new OfflineAudioContext(1, 24000, 48000);
        const now = 0;

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

            const anchors = buzz.harmonics;
            const count = anchors[anchors.length - 1][0];
            const real = new Float32Array(count + 1), imag = new Float32Array(count + 1);
            for (let k = 1; k <= count; k++) {
                const j = anchors.findIndex(o=> o[0] >= k);
                const [k1, v1] = anchors[j], [k0, v0] = anchors[Math.max(0, j - 1)];
                real[k] = k1 === k0 ? v1 : v0 + (v1 - v0) * (k - k0) / (k1 - k0); //cosine phase, a pulse like a buzzer
            }

            const osc = ctx.createOscillator();
            osc.frequency.value = buzz.freq;
            osc.setPeriodicWave(ctx.createPeriodicWave(real, imag, { disableNormalization: true }));

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

        return ctx.startRendering();
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
        this.board.oncontextmenu = event => { //no menu, a right-click cancels a drag
            event.preventDefault();
            this.Board_mouseleave(event, false);
        };
        this.board.addEventListener("touchmove",   event => this.Board_mousemove(event, true));
        this.board.addEventListener("touchend",    event => this.Board_mouseup(event, true));
        this.board.addEventListener("touchcancel", event => this.Board_mouseleave(event, true));

        this.board.addEventListener("mousedown", event => this.Mark_mousedown(event)); //right-click notes
        this.content.addEventListener("mousedown", event => this.Orbit_mousedown(event)); //around the board

        this.content.appendChild(this.board);

        //the board's sides and the shadow under them, seen in perspective. under the board, with its box and transform, see AfterResize
        //apart from the board: sharing a 3d context with it, chrome draws the board blurry
        this.slab = document.createElement("div");
        this.slab.className = "chess-slab";
        this.slabTurn = document.createElement("div"); //turns with the svg, the same transform at the same pace, see Orient and FlipBoard
        this.slabTurn.className = "chess-slab-turn";
        for (const name of ["shadow", "front", "right", "back", "left"]) {
            const face = document.createElement("div");
            face.className = name === "shadow" ? "chess-slab-shadow" : `chess-slab-side chess-slab-${name}`;
            this.slabTurn.appendChild(face);
        }
        this.slab.appendChild(this.slabTurn);
        this.content.appendChild(this.slab); //after the board, for the board's classes, see chess.css

        //the pieces each side took in a box, and the material it's ahead by past its end, see UpdateCaptures and PlaceCaptures
        this.captures = {};
        for (const side of ["w", "b"]) {
            const group = document.createElement("div");
            group.className = "chess-captures-group";
            const box = document.createElement("div");
            box.className = "chess-captures";
            const advantage = document.createElement("div");
            advantage.className = "chess-advantage";
            group.append(box, advantage);
            this.content.appendChild(group);
            this.captures[side] = { group: group, box: box, advantage: advantage };
        }

        this.playerA = this.params?.playerA ?? "ui"; //white
        this.playerB = this.params?.playerB ?? "ai"; //black
        const level = value=> Math.min(Chess.LEVEL_MAX, Math.max(1, parseInt(value) || Chess.LEVEL_DEFAULT));
        this.levelA = level(this.params?.levelA ?? this.params?.level); //white's engine. a game saved before had one level for both
        this.levelB = level(this.params?.levelB ?? this.params?.level); //black's

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
        this.marksLayer = Chess.CreateSvg("g"); //right-clicked squares, see Mark_mousedown
        this.coordsLayer = Chess.CreateSvg("g");
        this.indicatorsLayer = Chess.CreateSvg("g");
        this.piecesLayer = Chess.CreateSvg("g");
        this.arrowsLayer = Chess.CreateSvg("g", { class:"chess-arrows-layer" }); //right-dragged, over the pieces
        this.hintLayer = Chess.CreateSvg("g", { class:"chess-hint-layer" }); //the engine's move while reading, see ChessReader.UpdateHint
        this.sceneLayer = Chess.CreateSvg("g", { id:`${this.uid}-scene` }); //a moving piece refracts a copy of this, other pieces included
        this.liftLayer = Chess.CreateSvg("g"); //moving pieces, over the scene and outside it, see LiftPiece
        this.boardLayer.append(this.squaresLayer, this.highlightsLayer, this.marksLayer, this.coordsLayer);
        this.sceneLayer.append(this.boardLayer, this.indicatorsLayer, this.piecesLayer, this.arrowsLayer, this.hintLayer);
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
        this.isFlipped = this.GetPlayerSide() === "b"; //the player's side at the bottom
        this.is3d = this.params?.is3d === true; //flat, unless it's restored as it was left, see SavePosition
        this.tilt = this.is3d ? Chess.TILT : 0; //deg, of the board: 0 flat, Chess.TILT in perspective, or where an orbit takes it
        this.spin = 0;     //deg, the board turns on its center while orbiting
        this.orbit = null; //where the drag around the board started, see Orbit_mousedown
        this.marking = null; //the right-drag on the board, see Mark_mousedown
        this.pieceCount = 0; //for the ids, a piece refracts the one behind it by id
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
            rank.style.fill = i % 2 === 0 ? "rgb(72,72,72)" : "rgb(108,108,108)";
            this.coordsLayer.appendChild(rank);
            this.rankLabels.push(rank);

            const file = Chess.CreateSvg("text", { class:"chess-coord", x:i + .94, y:7.94, "text-anchor":"end" });
            file.style.fill = i % 2 === 0 ? "rgb(108,108,108)" : "rgb(72,72,72)";
            this.coordsLayer.appendChild(file);
            this.fileLabels.push(file);
        }

        this.Layout();

        this.menubar = document.createElement("div");
        this.menubar.className = "chess-menubar";
        this.content.appendChild(this.menubar);

        const newButton = this.CreateMenuButton("New game", "url(chess/pawn.svg)");
        newButton.style.backgroundSize = "40px 40px";
        newButton.style.backgroundPosition = "50% -2px";

        const fenButton = this.CreateMenuButton("Copy FEN", "url(mono/copy.svg)");
        const flipButton = this.CreateMenuButton("Flip board", "url(mono/update.svg)");
        this.perspectiveButton = this.CreateMenuButton("Perspective", "url(mono/perspective.svg)"); //lit in perspective
        const readButton = this.CreateMenuButton("Screen reader", "url(mono/screenrecord.svg)");
        this.muteButton = this.CreateMenuButton("Mute", "url(mono/sound.svg)"); //its icon and tip follow the setting, see UpdateMuteButton

        //spread over the bar's 250px, 2px in from either end, see chess.css
        const buttons = [newButton, fenButton, flipButton, this.perspectiveButton, readButton, this.muteButton];
        buttons.forEach((button, i)=> button.style.left = `${Math.round(2 + i * (250 - 4 - 40) / (buttons.length - 1))}px`);
        this.menubar.append(...buttons);

        this.sidepanel = document.createElement("div");
        this.sidepanel.className = "chess-sidepanel";
        this.content.appendChild(this.sidepanel);

        this.moveslist = document.createElement("div");
        this.moveslist.className = "chess-moveslist";
        this.sidepanel.appendChild(this.moveslist);

        newButton.onclick = ()=> this.NewGameDialog();
        flipButton.onclick = ()=> this.FlipBoard();
        this.perspectiveButton.onclick = ()=> this.TogglePerspective();
        this.perspectiveButton.classList.toggle("chess-active", this.is3d);
        fenButton.onclick = ()=> this.FenDialog();
        readButton.onclick = ()=> this.ReadMode();
        this.muteButton.onclick = ()=> this.ToggleMute();
        this.UpdateMuteButton();
        this.readButton = readButton; //lit while reading
        this.reader = null; //a ChessReader, while reading

        this.engine = null;
        this.engineRunning = null;
        this.engineWaiting = null;
        this.aiRequest = null;

        this.win.addEventListener("keydown", event=> {
            if (event.target.closest("input, select, textarea") || this.win.querySelector(".win-dim")) return; //typing, or in a dialog
            if (event.key === "ArrowLeft") this.ShowMove(this.view - 1);
            else if (event.key === "ArrowRight") this.ShowMove(this.view + 1);
            else if (event.key === "Home") this.ShowMove(0);
            else if (event.key === "End") this.ShowMove(this.history.length - 1);
            else return;
            event.preventDefault();
        });

        setTimeout(()=> { this.AfterResize(); }, WIN.ANIME_DURATION);
        setTimeout(()=> { this.AfterResize(); }, 1000);

        this.LoadGame(this.params);
        this.AfterResize(); //in perspective from the start, if it's so

        if (this.playerA === "ai" || this.playerB === "ai") {
            this.StartEngine(); //loading, while the player makes the first move
            if (!this.CheckGameOver()) this.PlayAiMove(); //restored on the ai's turn, or a finished game
        }
    }

    ToggleMute() {
        localStorage.setItem("chess_mute", Chess.IsMuted() ? "false" : "true");
        for (const win of WIN.array) //the other chess windows' buttons too
            if (win instanceof Chess) win.UpdateMuteButton();
    }

    UpdateMuteButton() {
        const isMuted = Chess.IsMuted();
        this.muteButton.style.backgroundImage = isMuted ? "url(mono/mute.svg)" : "url(mono/sound.svg)";
        this.muteButton.setAttribute("tip-below", isMuted ? "Unmute" : "Mute");
    }

    CreateMenuButton(name, icon) {
        const button = document.createElement("div");
        button.setAttribute("tip-below", name);
        button.style.backgroundImage = icon;
        return button;
    }

    NewGameDialog() {
        const dialog = this.DialogBox("300px");
        if (dialog === null) return;

        const innerBox  = dialog.innerBox;
        const dialogBox = innerBox.parentElement;
        const btnOK     = dialog.btnOK;

        dialogBox.style.maxWidth = "680px";
        innerBox.style.padding = "20px 20px 0 20px";
        btnOK.value = "Start";

        const AddLabel = (parent, text, width)=> {
            const label = document.createElement("div");
            label.textContent = text;
            label.style.display = "inline-block";
            label.style.minWidth = width;
            parent.appendChild(label);
            return label;
        };

        //a row for each side: a human or the engine, and the engine's level
        const rows = {};
        for (const [side, name, player, level] of [["w", "White", this.playerA, this.levelA], ["b", "Black", this.playerB, this.levelB]]) {
            const row = document.createElement("div");
            row.style.display = "flex";
            row.style.alignItems = "center"; //the pawn's middle on the text's
            row.style.marginBottom = "12px";
            row.style.whiteSpace = "nowrap";
            innerBox.appendChild(row);

            const pawn = document.createElement("div");
            pawn.style.flex = "none";
            pawn.style.width = pawn.style.height = "48px";
            pawn.style.marginRight = "8px";
            pawn.style.background = "url(chess/pawn.svg) center calc(50% - 4px) / contain no-repeat"; //the drawing's middle is lower than its image's, see PIECE_HEIGHT
            if (side === "w") pawn.style.filter = "invert(1) drop-shadow(0 0 1px rgba(0,0,0,.6))"; //a light pawn, outlined on the light pane
            row.appendChild(pawn);

            AddLabel(row, name, "84px");

            const radios = {};
            for (const [value, text] of [["ui", "Human"], ["ai", "Engine"]]) {
                const radio = document.createElement("input");
                radio.type = "radio";
                radio.name = `${this.uid}-player-${side}`;
                radio.id = `${this.uid}-player-${side}-${value}`;
                radio.checked = value === player;

                const label = document.createElement("label");
                label.htmlFor = radio.id;
                label.textContent = text;
                label.style.marginRight = "16px";

                row.append(radio, label);
                radios[value] = radio;
            }

            const levelBox = document.createElement("div"); //only for the engine
            levelBox.style.display = "inline-block";
            levelBox.style.transition = "opacity .2s";
            row.appendChild(levelBox);

            AddLabel(levelBox, "Level:", "48px");

            const levelRange = document.createElement("input");
            levelRange.type = "range";
            levelRange.min = "1";
            levelRange.max = Chess.LEVEL_MAX;
            levelRange.step = "1";
            levelRange.value = level;
            levelRange.style.width = "140px";
            levelRange.style.verticalAlign = "middle";

            const levelValue = AddLabel(levelBox, level, "20px");
            levelValue.style.marginLeft = "8px";
            levelValue.style.fontWeight = "600";
            levelRange.oninput = ()=> levelValue.textContent = levelRange.value;
            levelBox.insertBefore(levelRange, levelValue);

            rows[side] = {
                radios: radios,
                levelRange: levelRange,
                IsEngine: ()=> radios.ai.checked,
                Set: (isEngine, level)=> {
                    radios[isEngine ? "ai" : "ui"].checked = true;
                    levelRange.value = level;
                    levelValue.textContent = level;
                },
                Update: ()=> {
                    levelRange.disabled = !radios.ai.checked;
                    levelBox.style.opacity = radios.ai.checked ? "1" : ".4";
                }
            };
        }

        innerBox.appendChild(document.createElement("br"));

        AddLabel(innerBox, "From FEN:", "120px");
        const fenInput = document.createElement("input");
        fenInput.type = "text";
        fenInput.placeholder = "Starting position";
        fenInput.value = Chess.FEN_START;
        fenInput.spellcheck = false;
        fenInput.style.width = "calc(100% - 128px)";
        innerBox.appendChild(fenInput);

        const status = document.createElement("div");
        status.style.margin = "8px 0 0 128px";
        innerBox.appendChild(status);

        let imported = { fen: Chess.FEN_START };
        let lastActive = "w";

        const Update = ()=> {
            rows.w.Update();
            rows.b.Update();

            if (imported.error) {
                status.textContent = imported.error;
                status.style.color = "var(--clr-error)";
                btnOK.disabled = true;
                return;
            }

            const active = imported.fen ? imported.fen.split(" ")[1] : "w";
            status.textContent = `${active === "w" ? "White" : "Black"} to move, ${rows[active].IsEngine() ? "the computer moves first" : "you move first"}`;
            status.style.color = "";
            btnOK.disabled = false;
        };

        fenInput.oninput = ()=> {
            const text = fenInput.value.trim();
            imported = text.length === 0 ? { fen: null } : this.ImportFen(text);

            const active = imported.fen ? imported.fen.split(" ")[1] : "w";
            if (!imported.error && active !== lastActive) { //a new side to move: against the engine, most likely the human's. it can still be changed
                lastActive = active;
                const other = rows[active === "w" ? "b" : "w"];
                if (rows[active].IsEngine() && !other.IsEngine()) {
                    const level = rows[active].levelRange.value;
                    rows[active].Set(false, other.levelRange.value);
                    other.Set(true, level);
                }
            }

            Update();
        };

        for (const row of [rows.w, rows.b])
            row.radios.ui.onchange = row.radios.ai.onchange = Update;
        Update();

        fenInput.onkeydown = event=> {
            if (event.key === "Enter") btnOK.onclick();
        };

        btnOK.onclick = ()=> {
            if (imported.error) return;
            dialog.Close();
            this.levelA = parseInt(rows.w.levelRange.value);
            this.levelB = parseInt(rows.b.levelRange.value);
            this.NewGame(imported.fen, rows.w.IsEngine() ? "ai" : "ui", rows.b.IsEngine() ? "ai" : "ui");
        };

        setTimeout(()=> fenInput.select(), 0); //a paste replaces it
    }

    FenDialog() {
        if (this.history.length === 0) return; //nothing loaded yet

        const dialog = this.DialogBox("150px");
        if (dialog === null) return;

        const innerBox  = dialog.innerBox;
        const dialogBox = innerBox.parentElement;
        const btnOK     = dialog.btnOK;
        btnOK.value     = "Copy";

        dialogBox.style.maxWidth = "640px";
        innerBox.style.padding = "40px 40px 0 40px";

        const fenInput = document.createElement("input");
        fenInput.type = "text";
        fenInput.readOnly = true;
        fenInput.spellcheck = false;
        fenInput.style.width = "calc(100% - 8px)"; //its margins
        fenInput.value = this.ExportFen(this.history[this.view].fen);
        innerBox.appendChild(fenInput);

        btnOK.onclick = ()=> {
            Promise.resolve()
            .then(()=> navigator.clipboard.writeText(fenInput.value)) //throws where there's no clipboard, as on plain http
            .then(()=> dialog.Close())
            .catch(()=> fenInput.select()); //left selected, to copy by hand
        };

        fenInput.onkeydown = event=> {
            if (event.key === "Enter") btnOK.onclick();
        };

        setTimeout(()=> fenInput.select(), 0);
    }

    ReadMode() {
        if (this.reader) this.reader.Stop();
        else new ChessReader(this).Start();
    }

    Close() { //override
        this.reader?.Stop();
        this.StopEngine();
        super.Close();
    }

    GetPlayerSide() {
        return this.playerA === "ai" && this.playerB === "ui" ? "b" : "w";
    }

    StartEngine() {
        if (this.engine) return;

        this.engine = new Worker("chess/chessworker.js");
        this.engine.onmessage = event=> {
            const running = this.engineRunning;
            this.engineRunning = null;
            running?.resolve(event.data.move);
            this.SendEngineRequest();
        };
        this.engine.onerror = event=> { //the worker failed to load: no answers
            console.error("Chess engine:", event.message);
            this.StopEngine();
        };
    }

    StopEngine() {
        this.engine?.terminate();
        this.engine = null;
        this.engineRunning?.resolve(null);
        this.engineWaiting?.resolve(null);
        this.engineRunning = this.engineWaiting = null;
    }

    AskEngine(fen, level, positions) {
        this.StartEngine();
        this.engineWaiting?.resolve(null);
        return new Promise(resolve=> {
            this.engineWaiting = { resolve: resolve, message: { fen: fen, level: level, positions: positions } };
            this.SendEngineRequest();
        });
    }

    SendEngineRequest() {
        if (this.engineRunning || !this.engineWaiting) return;
        this.engineRunning = this.engineWaiting;
        this.engineWaiting = null;
        this.engine.postMessage(this.engineRunning.message);
    }

    IsAiTurn() {
        return this.game.activecolor === "w" && this.playerA === "ai" ||
               this.game.activecolor === "b" && this.playerB === "ai";
    }

    PlayAiMove(delay = 500) {
        if (!this.IsAiTurn() || this.reader) return; //while reading, the board follows the shared one

        setTimeout(async ()=> {
            if (this.isClosed || this.isGameOver || this.reader) return;
            if (!this.IsAiTurn() || !this.IsLive()) return; //played by an earlier call, or showing history

            const fen = this.GetCurrentFen();
            if (this.aiRequest?.fen === fen) return; //asked already, by an earlier call

            const request = this.aiRequest = { fen: fen };
            const level = this.game.activecolor === "w" ? this.levelA : this.levelB;
            const aiMove = await this.AskEngine(fen, level, this.positions.join(","));
            if (this.aiRequest !== request) return; //a game loaded meanwhile, see LoadGame
            this.aiRequest = null;

            //the board moved on while the engine searched, or it's showing history: asked again from there, see ShowMove
            if (this.isClosed || this.isGameOver || this.reader || !this.IsLive() || this.GetCurrentFen() !== fen) return;

            let move = this.ParseAiMove(aiMove);
            if (!move) { //no answer, or an error from the engine. a legal move keeps the game going instead of stalling
                console.warn("ChessAi returned an invalid move:", aiMove);
                move = this.GetRandomLegalMove();
                if (!move) return;
            }

            this.PlayMove(move.p0, move.p1, null, move.promotion);
        }, delay);
    }

    ParseAiMove(aiMove) {
        if (typeof aiMove !== "string" || !/^[a-h][1-8]-[a-h][1-8][qrbn]?$/.test(aiMove)) return null;

        const p0 = {x: aiMove.charCodeAt(0) - 97, y: 8 - parseInt(aiMove[1])};
        const p1 = {x: aiMove.charCodeAt(3) - 97, y: 8 - parseInt(aiMove[4])};

        if (this.GetPieceColor(p0, this.game) !== this.game.activecolor) return null;
        if (!this.GetLegalMoves(p0, this.game).some(o=> o.x === p1.x && o.y === p1.y)) return null;

        return { p0: p0, p1: p1, promotion: aiMove[5] ?? null };
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

    CheckGameOver() {
        const result = this.GetGameResult();
        if (!result) return false;

        this.isGameOver = true;

        const divResult = document.createElement("div");
        divResult.className = "chess-score";
        divResult.textContent = result.score;
        this.moveslist.appendChild(divResult);

        if (this.reader) return true;

        const cover = document.createElement("div");
        cover.className = "chess-cover";
        this.content.appendChild(cover);

        const box = document.createElement("div");
        box.className = "chess-result";
        cover.appendChild(box);

        //the winner's king, or both for a draw. images, the cover's divs are the promotion's pieces
        const kings = { "1-0": ["king-light"], "0-1": ["king"] }[result.score] ?? ["king-light", "king"];
        for (const name of kings) {
            const king = document.createElement("img");
            king.src = `chess/${name}.svg`;
            king.draggable = false;
            box.appendChild(king);
        }

        const label = document.createElement("p");
        label.textContent = result.text;
        box.appendChild(label);

        cover.onclick = ()=> cover.remove(); //look at the final position. a new game is on the menu bar

        return true;
    }

    //[playerA] plays white, [playerB] black: "ui" or "ai". the same players again when they're left out
    NewGame(fen = null, playerA = this.playerA, playerB = this.playerB) {
        this.isGameOver = false;
        for (const cover of this.content.querySelectorAll(".chess-cover")) cover.remove();

        this.playerA = playerA;
        this.playerB = playerB;

        this.LoadGame(fen);

        const isFlipping = this.isFlipped !== (this.GetPlayerSide() === "b"); //the player's side at the bottom
        if (isFlipping) this.FlipBoard();

        //the ai opens when it plays white, or when the fen gives it the move. after the flip
        if (!this.CheckGameOver()) this.PlayAiMove(isFlipping ? 900 : 500);
    }

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
        this.aiRequest = null; //the ai's move of the previous game, if it's still searching, is dropped

        this.moveslist.textContent = "";
        for (let i = 1; i < history.length; i++)
            this.AddChessNotation(i);
        this.SelectMove();
        this.UpdateCaptures();

        this.SavePosition();
    }

    SavePosition() {
        if (!this.game.fen) return; //nothing loaded yet
        this.params = { history: this.history, playerA: this.playerA, playerB: this.playerB, levelA: this.levelA, levelB: this.levelB, is3d: this.is3d };
    }

    IsLive() {
        return this.view === this.history.length - 1;
    }

    ShowMove(index) {
        index = Math.max(0, Math.min(this.history.length - 1, index));
        if (index === this.view) return;
        if (this.selected || this.isPromotionPending) return;

        const before = this.ParseFen(this.history[this.view].fen).placement;
        const isStep = Math.abs(index - this.view) === 1; //a move apart, it slides. further, it's placed anew
        this.view = index;

        const game = this.IsLive() ? this.game : this.ParseFen(this.history[index].fen);
        if (isStep)
            this.SlidePlacement(before, game.placement, game.lastmove);
        else
            this.RenderPlacement(game.placement, game.lastmove);

        this.board.inert = !this.IsLive();
        this.SelectMove();
        this.UpdateCaptures();

        if (this.IsLive()) this.PlayAiMove(); //the ai waits while history is shown
    }

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

            this.menubar.style.width = "250px";

            offset = -125;
        }
        else {
            this.sidepanel.style.visibility = "hidden";
            this.sidepanel.style.opacity = "0";
            this.sidepanel.style.transform = "translateX(100%)";

            this.menubar.style.width = "44px";

            offset = 0;
        }

        this.board.classList.toggle("chess-board-small", min < 400); //hides the coordinates

        this.board.style.width = min + "px";
        this.board.style.height = min + "px";
        this.board.style.left = (w - min) / 2 + offset + "px";
        this.board.style.top = (h - min) / 2 + "px";

        if (this.tilt > 0) {
            const distance = Chess.PERSPECTIVE, tilt = this.tilt * Math.PI / 180;
            const back = .63; //the half board, and the back rank that stands over its edge: a king, about a square
            const near = distance / (distance - .5 * Math.sin(tilt)); //the front edge comes nearer and widens
            const far = distance / (distance + back * Math.sin(tilt));
            const thickness = Chess.THICKNESS; //the front side's lower edge
            const top = -back * Math.cos(tilt) * far; //projected, in board sizes from the center
            const bottom = (.5 * Math.cos(tilt) + thickness * Math.sin(tilt)) * distance / (distance - .5 * Math.sin(tilt) + thickness * Math.cos(tilt));

            const scale = Math.min(1, (w + offset * 2) * .95 / (near * min), h * .95 / ((bottom - top) * min));
            const shift = -(top + bottom) / 2 * scale * min; //centers the projection, not the board

            this.projection = { scale: scale, shift: shift, distance: distance * min, tilt: tilt };
            this.board.style.transform = `translateY(${shift}px) scale(${scale}) perspective(${distance * min}px) rotateX(${this.tilt}deg)`;
            this.svg.style.rotate = ".01deg"; //unseen. square to the perspective, chrome draws the board and the pieces blurry
        }
        else {
            this.projection = null;
            this.board.style.transform = "";
            this.svg.style.rotate = "";
        }

        this.board.style.setProperty("--chess-rise", Math.min(1, this.tilt / Chess.TILT)); //the pieces' glass gets denser in perspective, see chess.css

        for (const property of ["width", "height", "left", "top", "transform", "--chess-rise"]) //the slab, under it
            this.slab.style.setProperty(property, this.board.style.getPropertyValue(property));
        this.slab.style.setProperty("--chess-thickness", `${Chess.THICKNESS * min}px`);

        this.PlaceCaptures();
    }

    //Flat, by the board's left corners: in a column to the left, or in a row over and under, where there's more room.
    //In perspective, in a row in the window's corners. The top one is the side's at the top.
    //Scaled down, towards their corners, when they don't fit or run into each other.
    PlaceCaptures() {
        const gap = 12, thickness = 28; //a piece and the padding, see chess.css
        const w = this.content.clientWidth, h = this.content.clientHeight;
        const left = parseFloat(this.board.style.left), top = parseFloat(this.board.style.top), size = parseFloat(this.board.style.width);
        const isBeside = left > top; //more room to the left than over and under
        const isColumn = !this.is3d && isBeside;
        const room = (isBeside ? left : top) - 2 * gap;
        const groups = this.isFlipped ? [this.captures.w, this.captures.b] : [this.captures.b, this.captures.w];

        for (const { group, box } of groups) {
            const isTop = group === groups[0].group;
            const place = { left: null, right: null, top: null, bottom: null }; //null is auto

            if (this.is3d) {
                place.left = gap;
                place[isTop ? "top" : "bottom"] = gap;
            }
            else if (isBeside) {
                place.right = w - left + gap;
                if (isTop) place.top = top;
                else place.bottom = h - top - size;
            }
            else {
                place.left = left;
                if (isTop) place.bottom = h - top + gap;
                else place.top = top + size + gap;
            }

            for (const [name, value] of Object.entries(place))
                group.style[name] = value === null ? "auto" : value + "px";

            group.style.flexDirection = box.style.flexDirection = !isColumn ? "row" : isTop ? "column" : "column-reverse"; //a column grows away from the corner
            group.style.transformOrigin = `${isColumn ? "right" : "left"} ${(isTop === (this.is3d || isBeside)) ? "top" : "bottom"}`; //the corner it's placed by
            group.classList.remove("chess-captures-cramped"); //shown, to be measured
        }

        //their lengths unscaled, a transform doesn't change the layout's
        const lengths = groups.map(o=> isColumn ? o.group.offsetHeight : o.group.offsetWidth);
        let scale = this.is3d ? 1 : Math.min(1, room / thickness); //across, by the board
        if (isColumn) scale = Math.min(scale, (size - gap) / (lengths[0] + lengths[1])); //along the board's side, both of them
        else scale = Math.min(scale, (w - (this.is3d ? gap : left) - gap) / Math.max(...lengths)); //rows, to the window's edge

        for (const { group } of groups) {
            group.style.transform = scale < 1 ? `scale(${scale})` : "";
            group.classList.toggle("chess-captures-cramped", scale < 1 / 3); //too small to make out
        }
    }

    //the pieces each side took by the shown position, the most valuable first
    UpdateCaptures() {
        const order = "qrbnp";
        const taken = { w: [], b: [] };
        for (let i = 1; i <= this.view; i++) {
            const [before, mover] = this.history[i - 1].fen.split(" ");
            const after = this.history[i].fen.split(" ")[0];
            for (const type of order) {
                const piece = mover === "w" ? type : type.toUpperCase(); //the other side's
                if (before.split(piece).length > after.split(piece).length) taken[mover].push(type);
            }
        }

        for (const side of ["w", "b"]) {
            const box = this.captures[side].box;
            for (const type of order) {
                const count = taken[side].filter(o=> o === type).length;
                const shown = [...box.children].filter(o=> o.pieceType === type);
                for (const img of shown.slice(count)) img.remove(); //taken back: an earlier move shown

                for (let i = shown.length; i < count; i++) { //new ones fade in, see chess.css
                    const img = document.createElement("img");
                    img.src = `chess/${Chess.PIECE_NAMES[type]}.svg`;
                    img.pieceType = type;
                    img.draggable = false;
                    if (side === "b") img.className = "chess-captured-white"; //black took white's
                    const next = [...box.children].find(o=> order.indexOf(o.pieceType) > order.indexOf(type));
                    box.insertBefore(img, next ?? null);
                }
            }
        }

        //the material ahead, on the board, after the side's captures. promotions count too
        const values = { p:1, n:3, b:3, r:5, q:9 };
        let material = 0; //white's ahead of black's
        for (const piece of this.history[this.view].fen.split(" ")[0]) {
            const value = values[piece.toLowerCase()];
            if (value) material += piece === piece.toUpperCase() ? value : -value;
        }

        for (const side of ["w", "b"]) {
            const ahead = side === "w" ? material : -material;
            this.captures[side].advantage.textContent = ahead > 0 ? `+${ahead}` : ""; //empty, it hides
        }

        this.PlaceCaptures(); //longer, they may need scaling
    }

    FlipBoard() {
        if (this.selected || this.orbit) return;

        this.isFlipped = !this.isFlipped;
        this.board.classList.add("chess-steering", "chess-flipping"); //no transitions. the coordinates hide while it turns
        this.Layout(false);
        this.PlaceCaptures(); //they swap, with the sides
        this.spin = 180 - (-this.spin % 360 + 360) % 360; //half around, it looks as it did. in -180..180, the short way back
        this.Orient();
        this.SettleView(600, ()=> this.board.classList.remove("chess-flipping")); //the coordinates fade back in
    }

    TogglePerspective() {
        if (this.selected || this.orbit) return;

        this.is3d = !this.is3d;
        this.SavePosition(); //for this window, after a refresh
        this.perspectiveButton.classList.toggle("chess-active", this.is3d);
        this.SettleView(400); //the pieces stand up as the board tilts
    }

    //Eases the view to rest, unturned and tilted as the top view or the perspective, frame by frame. The board, its slab and the
    //pieces move together, see Orient: with a transition each, the browser runs some composited and some not, and they drift apart.
    //Restarted, it goes on from where it is, and the one it replaces is done at the end too.
    SettleView(duration, done = null) {
        const previous = this.StopView(false);
        const view = this.content.ownerDocument.defaultView; //popped out, it's another one
        const spin0 = this.spin, tilt0 = this.tilt, tilt = this.is3d ? Chess.TILT : 0;
        const start = performance.now();

        const frame = now=> {
            const t = Math.min(1, Math.max(0, (now - start) / duration));
            const k = t * t * (3 - 2 * t); //eases in and out
            this.spin = spin0 * (1 - k);
            this.tilt = tilt0 + (tilt - tilt0) * k;
            this.Orient();
            if (t < 1) {
                this.SortPieces(); //from the back, as it turns
                this.settling.id = view.requestAnimationFrame(frame);
            }
            else {
                this.StopView();
            }
        };

        this.settling = { view: view, id: view.requestAnimationFrame(frame), done: ()=> { previous?.(); done?.(); } };
        this.board.classList.add("chess-steering"); //no transitions, see chess.css
        this.UpdateRefractions();
    }

    //Stops it where it is. Done, unless it's restarted: then the one restarting it takes what's left to do
    StopView(isDone = true) {
        if (!this.settling) return null;
        const { view, id, done } = this.settling;
        view.cancelAnimationFrame(id);
        this.settling = null;
        if (!isDone) return done;

        this.board.getBoundingClientRect(); //the last frame in place first, or the pieces' transitions start from the one before it
        this.board.classList.remove("chess-steering");
        done();
        this.SortPieces(); //and they refract the ones behind them again, see UpdateRefractions
        return null;
    }

    Orbit_mousedown(event) {
        if (event.button !== 0 || event.target !== this.content) return;
        if (this.selected || this.orbit || this.board.classList.contains("chess-flipping")) return;

        event.preventDefault(); //no text selection along the way
        this.win.focus({ preventScroll: true }); //for the arrow keys, as the click would

        const doc = this.content.ownerDocument; //popped out, it's another one
        const move = event=> this.Orbit_mousemove(event);
        const up = ()=> this.Orbit_mouseup();
        doc.addEventListener("mousemove", move);
        doc.addEventListener("mouseup", up);

        this.StopView(); //caught on its way back, it goes on from there
        this.orbit = {
            x0: event.clientX,
            y0: event.clientY,
            spin0: this.spin,
            tilt0: this.tilt,
            isDragged: false, //or it's a click, see Orbit_mouseup
            release: ()=> {
                doc.removeEventListener("mousemove", move);
                doc.removeEventListener("mouseup", up);
            }
        };

        this.board.classList.add("chess-steering"); //follows the mouse, no transitions
        this.content.style.cursor = "grabbing";
        this.UpdateRefractions();
    }

    Orbit_mousemove(event) {
        if (event.buttons !== 1) { //released outside
            this.Orbit_mouseup();
            return;
        }

        const dx = event.clientX - this.orbit.x0, dy = event.clientY - this.orbit.y0;
        this.orbit.isDragged ||= Math.abs(dx) + Math.abs(dy) > 3;
        this.content.classList.toggle("chess-orbit-dragged", this.orbit.isDragged); //the captured pieces hide, see chess.css
        this.spin = ((this.orbit.spin0 - dx * .5) % 360 + 540) % 360 - 180; //the front follows the mouse. in -180..180, so it goes back the short way
        this.tilt = Math.max(0, Math.min(Chess.TILT_MAX, this.orbit.tilt0 - dy * .25));
        this.Orient();
        this.SortPieces(); //from the back, as it's turned
    }

    Orbit_mouseup() {
        if (!this.orbit) return;
        if (!this.orbit.isDragged) this.ClearMarks(); //a click around the board, as one on it
        this.orbit.release();
        this.orbit = null;

        this.content.classList.remove("chess-orbit-dragged");
        this.content.style.cursor = "";
        this.SettleView(400);
    }

    Mark_mousedown(event) {
        if (event.button === 0) {
            this.ClearMarks();
            return;
        }
        if (event.button !== 2 || event.buttons !== 2 || this.marking) return; //only the right button, not while a piece is dragged

        const from = this.SquareAt(event);
        if (!from) return;

        const doc = this.content.ownerDocument; //popped out, it's another one
        const move = event=> this.Mark_mousemove(event);
        const up = event=> this.Mark_mouseup(event);
        doc.addEventListener("mousemove", move);
        doc.addEventListener("mouseup", up);

        this.marking = {
            from: from,
            to: from, //null off the board
            squareColor: event.ctrlKey ? "orange" : event.altKey ? "blue" : "red",
            arrowColor: event.ctrlKey ? "red" : event.altKey ? "blue" : "orange",
            draft: null, //the arrow, while it's drawn
            release: ()=> {
                doc.removeEventListener("mousemove", move);
                doc.removeEventListener("mouseup", up);
            }
        };
    }

    Mark_mousemove(event) {
        const marking = this.marking;
        if (!(event.buttons & 2)) { //released outside
            marking.draft?.remove();
            marking.release();
            this.marking = null;
            return;
        }

        const to = this.SquareAt(event);
        if (Chess.IsSameSquare(to, marking.to)) return;
        marking.to = to;

        marking.draft?.remove();
        marking.draft = to && !Chess.IsSameSquare(to, marking.from) ? this.CreateArrow(marking.from, to, marking.arrowColor) : null;
        if (marking.draft) this.arrowsLayer.appendChild(marking.draft);
    }

    Mark_mouseup(event) {
        if (event.button !== 2) return;

        const { from, to, squareColor, arrowColor, draft } = this.marking;
        draft?.remove();
        this.marking.release();
        this.marking = null;

        if (!to) return; //let go off the board
        if (Chess.IsSameSquare(from, to))
            this.ToggleMark(from, squareColor);
        else
            this.ToggleArrow(from, to, arrowColor);
    }

    ToggleMark(p, color) {
        const old = [...this.marksLayer.children].find(o=> Chess.IsSameSquare(o.boardPosition, p));
        old?.remove();
        if (old?.classList.contains(`chess-mark-${color}`)) return; //the same again takes it off

        const mark = Chess.CreateSvg("rect", { class:`chess-mark-${color}`, width:1, height:1 });
        this.PlaceOnSquare(mark, p.x, p.y);
        this.marksLayer.appendChild(mark);
    }

    ToggleArrow(p0, p1, color) {
        const old = [...this.arrowsLayer.children].find(o=> Chess.IsSameSquare(o.p0, p0) && Chess.IsSameSquare(o.p1, p1));
        old?.remove();
        if (old?.classList.contains(`chess-arrow-${color}`)) return; //the same again takes it off

        this.arrowsLayer.appendChild(this.CreateArrow(p0, p1, color));
    }

    ClearMarks() {
        this.marksLayer.textContent = "";
        this.arrowsLayer.textContent = "";
    }

    SquareAt(event) {
        const point = this.ClientToBoard(event);
        if (point.x < 0 || point.y < 0 || point.x >= 8 || point.y >= 8) return null;
        return this.FromDisplay(Math.floor(point.x), Math.floor(point.y));
    }

    static IsSameSquare(a, b) { //either may be null
        return a?.x === b?.x && a?.y === b?.y;
    }

    CreateArrow(p0, p1, color = null) {
        const arrow = Chess.CreateSvg("g", color ? { class:`chess-arrow-${color}` } : {});
        arrow.append(Chess.CreateSvg("polyline"), Chess.CreateSvg("polygon"));
        this.PlaceArrow(arrow, p0, p1);
        return arrow;
    }

    PlaceArrow(arrow, p0, p1) {
        arrow.p0 = p0;
        arrow.p1 = p1;

        const a = this.ToDisplay(p0.x, p0.y), b = this.ToDisplay(p1.x, p1.y);
        const x0 = a.x + .5, y0 = a.y + .5, x1 = b.x + .5, y1 = b.y + .5;

        //a knight's jump bends: the long way first, then the short
        const isKnight = Math.abs((x1 - x0) * (y1 - y0)) === 2;
        const [cx, cy] = !isKnight ? [x0, y0] : Math.abs(x1 - x0) === 2 ? [x1, y0] : [x0, y1];

        const length = Math.hypot(x1 - cx, y1 - cy);
        const ux = (x1 - cx) / length, uy = (y1 - cy) / length; //along its last leg
        const px = -uy, py = ux; //across it
        const head = .4, width = .22, tip = .15;

        const [shaft, arrowhead] = arrow.children;
        shaft.setAttribute("points", [
            [x0, y0],
            ...(isKnight ? [[cx, cy]] : []),
            [x1 - ux * (head + tip - .02), y1 - uy * (head + tip - .02)]
        ].map(o=> o.join(",")).join(" "));
        arrowhead.setAttribute("points", [
            [x1 - ux * tip, y1 - uy * tip],
            [x1 - ux * (head + tip) + px * width, y1 - uy * (head + tip) + py * width],
            [x1 - ux * (head + tip) - px * width, y1 - uy * (head + tip) - py * width]
        ].map(o=> o.join(",")).join(" "));
    }

    Orient() {
        this.AfterResize();
        this.Turn(this.spin ? `rotate(${this.spin}deg)` : "", this.spin);
        for (const piece of [...this.piecesLayer.children, ...this.liftLayer.children])
            this.SetPieceDisplayPosition(piece, piece.displayPosition.x, piece.displayPosition.y, piece.scale, -this.spin);
    }

    //The svg and the slab under it, the same way
    Turn(transform, angle) {
        this.svg.style.transform = transform;
        this.slabTurn.style.transform = transform;
        this.slabTurn.style.setProperty("--chess-spin", `${angle}deg`); //for the sides' light
    }

    ToDisplay(x, y) {
        return this.isFlipped ? { x: 7 - x, y: 7 - y } : { x: x, y: y };
    }

    FromDisplay(x, y) {
        return this.ToDisplay(x, y); //mirroring is its own inverse
    }

    PlaceOnSquare(element, x, y, inset = 0) {
        element.boardPosition = { x: x, y: y };
        element.inset = inset;
        const d = this.ToDisplay(x, y);
        element.setAttribute("x", d.x + inset);
        element.setAttribute("y", d.y + inset);
    }

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

        for (const arrow of this.arrowsLayer.children)
            this.PlaceArrow(arrow, arrow.p0, arrow.p1);

        this.reader?.DrawHint();
    }

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

        const foot = Chess.PIECE_FOOT;
        const rise = Math.min(1, this.tilt / Chess.TILT); //flat, the pieces lie on the board. they stand up as it tilts
        const step = (foot - .6) * rise; //standing pieces step back to the center of their square
        let stand = 1, lean = 0;
        if (this.tilt > 0) {
            const tilt = this.tilt * Math.PI / 180, distance = Chess.PERSPECTIVE;
            const turn = -rotation * Math.PI / 180; //the svg turns opposite to the piece, so this is where it's seen while the board flips
            const depth = 4 + (x - 3.5) * Math.sin(turn) + (y - 3.5) * Math.cos(turn) + foot - step - .5; //of the foot, in squares
            const across = (x - 3.5) * Math.cos(turn) - (y - 3.5) * Math.sin(turn); //of the foot from the board's center line, in squares
            const v = (depth - 4) / 8; //from the board's center towards the viewer, in board sizes
            const near = distance / (distance - v * Math.sin(tilt)); //the perspective's scale at the foot
            const upright = (distance - v * Math.sin(tilt)) * .95 / (distance * Math.cos(tilt)) * 1.2;
            stand = 1 + (upright - 1) * rise;
            //the perspective bends uprights towards its vanishing point, more the further they are from the center line. this bends them back
            lean = Math.atan(-across * near * Math.sin(tilt) * stand / (distance * 8)) * 180 / Math.PI * rise;
        }

        //in an svg, px are user units: squares. the board copy gets the inverse, so it stays aligned with the board
        piece.style.transform = `translate(${x}px, ${y}px) translate(.5px, .5px) rotate(${rotation}deg) scale(${scale}) translate(-.5px, -.5px) translate(0px, ${foot - step}px) scale(1, ${stand}) skewX(${lean}deg) translate(0px, ${-foot}px)`;
        piece.hit.style.transform = `translate(0px, ${foot}px) skewX(${-lean}deg) scale(1, ${1 / stand}) translate(0px, ${step - foot}px)`; //stays on its square, the one it's picked from
        piece.reflection.style.fillOpacity = this.tilt / Chess.TILT_MAX; //none in the top view, fading in all the way up. paint only: under the perspective, chrome draws an opacity too coarse
        piece.copy.style.transform = `translate(0px, ${foot}px) skewX(${-lean}deg) scale(1, ${1 / stand}) translate(0px, ${step - foot}px) translate(.5px, .5px) scale(${1 / scale}) rotate(${-rotation}deg) translate(-.5px, -.5px) translate(${-x}px, ${-y}px)`;
    }

    SortPieces() {
        const turn = this.spin * Math.PI / 180;
        const depth = piece=> (piece.displayPosition.x - 3.5) * Math.sin(turn) + (piece.displayPosition.y - 3.5) * Math.cos(turn); //by rank, unless it's turned
        const pieces = [...this.piecesLayer.children].sort((a, b)=> depth(a) - depth(b));
        for (let i = 0; i < pieces.length; i++) {
            if (this.piecesLayer.children[i] !== pieces[i]) { //moves only what's out of place
                this.piecesLayer.insertBefore(pieces[i], this.piecesLayer.children[i]);
            }
        }

        this.UpdateRefractions();
    }

    UpdateRefractions() {
        const isStill = this.is3d && !this.board.classList.contains("chess-steering");
        const resting = [...this.piecesLayer.children];

        for (const piece of [...resting, ...this.liftLayer.children]) {
            const d = piece.displayPosition;
            const behind = isStill && piece.parentNode === this.piecesLayer ? resting.find(o=> o.displayPosition.x === d.x && o.displayPosition.y === d.y - 1) : null;
            const href = behind ? `#${behind.id}` : null;

            if (piece.behindCopy.getAttribute("href") === href) continue; //a new href rebuilds the copy
            if (href) piece.behindCopy.setAttribute("href", href);
            else piece.behindCopy.removeAttribute("href");
        }
    }

    LiftPiece(piece) {
        clearTimeout(piece.landTimer);
        if (piece.parentNode === this.liftLayer) return;

        this.liftLayer.appendChild(piece);
        this.UpdateRefractions(); //the piece in front lets go of it, before it refracts the scene, that piece included
        piece.boardCopy.setAttribute("href", `#${this.uid}-scene`);
        getComputedStyle(piece).transform;
    }

    LandPiece(piece) {
        clearTimeout(piece.landTimer);
        if (piece.parentNode !== this.liftLayer || piece.classList.contains("chess-dragging")) return;

        this.piecesLayer.appendChild(piece);
        piece.boardCopy.setAttribute("href", `#${this.uid}-board`); //first, in the scene it can't refract the scene
        this.SortPieces();
    }

    ClientToBoard(point) {
        const rect = this.content.getBoundingClientRect();
        const zoom = rect.width / this.content.offsetWidth; //the window scales while it opens
        const size = this.board.offsetWidth;

        //from the board's center, the transform-origin
        let x = (point.clientX - rect.left) / zoom - this.content.clientLeft - this.board.offsetLeft - size / 2;
        let y = (point.clientY - rect.top) / zoom - this.content.clientTop - this.board.offsetTop - size / 2;

        if (this.projection) { //back along the line of sight, to the tilted plane
            const { scale, shift, distance, tilt } = this.projection;
            x /= scale;
            y = (y - shift) / scale;
            const v = y * distance / (distance * Math.cos(tilt) + y * Math.sin(tilt));
            x *= (distance - v * Math.sin(tilt)) / distance;
            y = v;
        }

        return { x: x * 8 / size + 4, y: y * 8 / size + 4 };
    }

    LoadFen(notation) {
        const game = this.ParseFen(notation);
        if (!game) return;

        this.game = game;
        this.RenderPlacement(this.game.placement, this.game.lastmove);
        this.positions = [this.PositionKey()];
    }

    ImportFen(notation) {
        const fields = notation.trim().split(/\s+/);
        if (fields.length < 4 || fields.length > 6) return { error: "A FEN has 4 to 6 fields, separated by spaces" };
        const [placement, active, castling, enpassant, halfmove = "0", fullmove = "1"] = fields;

        const ranks = placement.split("/");
        if (ranks.length !== 8) return { error: "The placement needs 8 ranks, separated by /" };
        for (let i = 0; i < 8; i++) {
            if (!/^[pnbrqkPNBRQK1-8]+$/.test(ranks[i])) return { error: `Rank ${8 - i}: unknown piece` };
            const count = [...ranks[i]].reduce((sum, o)=> sum + (isNaN(o) ? 1 : parseInt(o)), 0);
            if (count !== 8) return { error: `Rank ${8 - i} has ${count} squares, not 8` };
        }
        if (/[pP]/.test(ranks[0] + ranks[7])) return { error: "Pawns can't stand on the first or last rank" };
        if (placement.split("K").length !== 2 || placement.split("k").length !== 2) return { error: "Each side needs exactly one king" };

        if (active !== "w" && active !== "b") return { error: "The side to move is w or b" };
        if (!/^(-|K?Q?k?q?)$/.test(castling)) return { error: "Castling is - or some of KQkq, in that order" };
        if (!/^\d+$/.test(halfmove) || !/^[1-9]\d*$/.test(fullmove)) return { error: "The move counters are numbers" };

        const game = this.ParseFen(`${placement} ${active} - -`);

        const homes = { K:["K", 7, 7, "R"], Q:["K", 0, 7, "R"], k:["k", 7, 0, "r"], q:["k", 0, 0, "r"] }; //king, rook's x, rank's y, rook
        for (const right of castling.replace("-", "")) {
            const [king, rookX, y, rook] = homes[right];
            if (game.placement[4][y] !== king || game.placement[rookX][y] !== rook)
                return { error: `Castling ${right} needs its king and rook on their starting squares` };
        }

        let passant = "-";
        if (enpassant !== "-") {
            if (!/^[a-h][36]$/.test(enpassant)) return { error: "The en passant square is on rank 3 or 6" };
            if ((enpassant[1] === "3") !== (active === "b")) return { error: "The en passant square is behind a pawn of the side that just moved" };
            passant = enpassant[0] + (enpassant[1] === "3" ? "4" : "5");
            if (game.placement[enpassant.charCodeAt(0) - 97][8 - parseInt(passant[1])] !== (active === "b" ? "P" : "p"))
                return { error: `No pawn on ${passant} to take en passant` };
        }

        if (this.InCheck(game, active === "w" ? "b" : "w"))
            return { error: `${active === "w" ? "Black" : "White"} is in check, but it's not their move` };

        return { fen: `${placement} ${active} ${castling} ${passant} ${halfmove} ${fullmove}` };
    }

    ExportFen(notation) {
        const fields = notation.split(" ").slice(0, 6);
        if (fields[3] !== "-") fields[3] = fields[3][0] + (fields[3][1] === "4" ? "3" : "6");
        return fields.join(" ");
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

        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                if (placement[x][y] === null) continue;
                this.AddPiece(placement[x][y], { x: x, y: y });
            }
        }

        this.SortPieces();

        this.ClearSelection();
        this.ClearIndicators();
        this.ClearMarks();
        this.reader?.ClearHint();
        this.MarkLastMove(lastmove);
    }

    SlidePlacement(before, after, lastmove) {
        const pieces = [...this.piecesLayer.children, ...this.liftLayer.children];
        const left = [], arrived = [];
        for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++) {
                if (before[x][y] === after[x][y]) continue;
                if (before[x][y] !== null) left.push({ type: before[x][y], element: pieces.find(o=> o.getAttribute("p") === `${x}${y}`) });
                if (after[x][y] !== null) arrived.push({ type: after[x][y], x: x, y: y });
            }

        if (left.some(o=> !o.element)) { //the board is out of step with the history
            this.RenderPlacement(after, lastmove);
            return;
        }

        const color = type=> type === type.toUpperCase() ? "w" : "b";
        for (const square of arrived) {
            const piece = left.find(o=> o.type === square.type) ?? left.find(o=> color(o.type) === color(square.type));
            if (piece) {
                left.splice(left.indexOf(piece), 1);
                this.MovePiece(piece.element, square.x, square.y);
                if (piece.type !== square.type) this.SetPieceType(piece.element, square.type);
            }
            else {
                this.AddPiece(square.type, square);
            }
        }

        for (const piece of left)
            piece.element.remove();

        this.SortPieces();

        this.ClearSelection();
        this.ClearIndicators();
        this.ClearMarks();
        this.reader?.ClearHint();
        this.MarkLastMove(lastmove);
    }

    MarkLastMove(move) {
        for (const element of this.highlightsLayer.querySelectorAll(".chess-lastmove-from, .chess-lastmove-to")) {
            element.remove();
        }

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
        const piece = Chess.CreateSvg("g", { id:`${this.uid}-piece${++this.pieceCount}`, class: isWhite ? "chess-piece chess-white" : "chess-piece" });

        piece.hit = Chess.CreateSvg("rect", { class:"chess-piece-hit", width:1, height:1 }); //takes the pointer events

        piece.glass = Chess.CreateSvg("g", { class:"chess-piece-glass" });
        piece.refraction = Chess.CreateSvg("g");
        piece.copy = Chess.CreateSvg("g", { class:"chess-piece-copy" }); //what it refracts, aligned with the board
        piece.boardCopy = Chess.CreateSvg("use", { href:`#${this.uid}-board` });
        piece.behindCopy = Chess.CreateSvg("use"); //the piece behind it, see UpdateRefractions
        const tint = Chess.CreateSvg("rect", { class:"chess-piece-tint", width:1, height:1 });

        //in perspective, the board reflects the piece: mirrored on its foot, it stands as tall, and fades out. under the glass, over the pieces behind
        piece.reflection = Chess.CreateSvg("g", { class:"chess-piece-reflection", transform:`translate(0, ${2 * Chess.PIECE_FOOT}) scale(1, -1)` });
        piece.reflectionShape = Chess.CreateSvg("rect", { width:1, height:1 });
        piece.reflection.appendChild(piece.reflectionShape);

        piece.copy.append(piece.boardCopy, piece.behindCopy);
        piece.refraction.appendChild(piece.copy);
        piece.glass.append(piece.refraction, tint);
        piece.append(piece.reflection, piece.glass, piece.hit);

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
        piece.reflection.setAttribute("mask", `url(#${this.GetReflectionMask(name)})`);
        piece.reflectionShape.setAttribute("mask", `url(#${this.GetPieceMask(name)})`);
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

    GetReflectionMask(name) {
        const id = `${this.uid}-reflection-${name}`;
        if (this.defs.querySelector(`#${id}`)) return id;

        const range = Chess.PIECE_HEIGHT[name] / 3;
        const top = Chess.PIECE_FOOT - range;

        const gradient = Chess.CreateSvg("linearGradient", { id:`${id}-gradient`, gradientUnits:"userSpaceOnUse", x1:0, y1:Chess.PIECE_FOOT, x2:0, y2:top });
        gradient.append(Chess.CreateSvg("stop", { offset:0, "stop-color":"#fff" }), Chess.CreateSvg("stop", { offset:1, "stop-color":"#fff", "stop-opacity":0 }));

        const mask = Chess.CreateSvg("mask", { id:id, maskUnits:"userSpaceOnUse", x:-.5, y:top, width:2, height:range, style:"mask-type:alpha" });
        mask.appendChild(Chess.CreateSvg("rect", { x:-.5, y:top, width:2, height:range, fill:`url(#${id}-gradient)` }));
        this.defs.append(gradient, mask);
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
            brightness.appendChild(Chess.CreateSvg(channel, { type:"linear", ...Chess.PIECE_TONE[color] }));

        filter.append(map, displacement, brightness);
        this.defs.appendChild(filter);

        Chess.GetPieceMap(name).then(href=> map.setAttribute("href", href));
        return id;
    }

    PlayMove(p0, p1, element, promotion = null) {
        if (p0.x === p1.x && p0.y === p1.y) return;
        if (this.isClosed) return;
        this.reader?.ClearHint();

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
            this.UpdateCaptures();
            this.SavePosition();
        };

        if (isPromotion) {
            if (this.IsAiTurn()) {
                const type = promotion ?? "q";
                this.game.placement[p1.x][p1.y] = this.game.activecolor === "w" ? type.toUpperCase() : type;
                this.SetPieceType(element, type);
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
        if (!isTouch && event.button === 2) { //a right-click while dragging cancels, it doesn't drop
            this.Board_mouseleave(event, isTouch);
            return;
        }

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
