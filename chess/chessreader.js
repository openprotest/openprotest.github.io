class ChessReader {
    constructor(chess) {
        this.chess       = chess;
        this.stream      = null;
        this.fen         = null; //the last position read
        this.hintSide    = null; //the side at the bottom of the shared board, until chosen
        this.hint        = null; //the engine's move, see UpdateHint
        this.hintRequest = null; //the engine's pending answer, see UpdateHint
    }

    async Start() {
        let stream;
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false, selfBrowserSurface: "exclude" });
        }
        catch { //cancelled, or not allowed
            return;
        }

        this.stream = stream;
        this.chess.reader = this;
        //stopped from the browser's sharing bar, or the shared window closed
        stream.getVideoTracks()[0].addEventListener("ended", ()=> this.Stop());
        stream.addEventListener("inactive", ()=> this.Stop());

        this.video = document.createElement("video");
        this.video.muted = true;
        this.video.srcObject = stream;
        this.video.play();

        this.preview = document.createElement("div");
        this.preview.className = "chess-readpreview";
        this.canvas = document.createElement("canvas");
        this.status = document.createElement("div");
        this.status.textContent = "Reading...";
        this.hintText = document.createElement("div");
        this.sideButton = document.createElement("div");
        this.sideButton.className = "chess-readside";
        this.sideButton.onclick = ()=> this.SwitchSide();
        this.preview.append(this.canvas, this.status, this.hintText, this.sideButton);
        this.chess.content.appendChild(this.preview);
        this.chess.readButton.classList.add("chess-active");
        this.PlaceHistory();

        this.ReadFrame();
    }

    Stop() {
        if (!this.stream) return;

        clearTimeout(this.timer);
        for (const track of this.stream.getTracks()) track.stop();
        this.stream = null;
        this.preview.remove();
        this.preview = null;
        this.chess.readButton.classList.remove("chess-active");
        this.PlaceHistory();
        this.ClearHint();

        const chess = this.chess;
        chess.reader = null;
        if (!chess.isGameOver) chess.PlayAiMove(); //it waited while reading
    }

    PlaceHistory() {
        this.chess.sidepanel.style.top = this.preview ? `${this.preview.offsetTop + this.preview.offsetHeight + 4}px` : "";
    }

    async ReadFrame() {
        if (!this.stream) return;
        if (!this.stream.active) { //ended without an event
            this.Stop();
            return;
        }

        const video = this.video;
        if (video.videoWidth > 0) {
            const canvas = this.canvas;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            ctx.drawImage(video, 0, 0);

            const templates = await ChessReader.GetReadTemplates();
            if (!this.stream) return; //stopped meanwhile

            const reading = ChessReader.ReadBoard(ctx.getImageData(0, 0, canvas.width, canvas.height), templates);
            ChessReader.DrawReading(ctx, reading);
            this.ApplyReading(reading);
            this.PlaceHistory(); //the preview's height follows the shared window's shape, and the status' lines
        }

        this.timer = setTimeout(()=> this.ReadFrame(), 1000);
    }

    ApplyReading(reading) {
        if (reading.error) {
            this.status.textContent = reading.error;
            return;
        }

        const chess = this.chess;

        //the side in check is the one to move, whatever the highlights said: they can be missing, or covered
        const fields = reading.fen.split(" ");
        const game = chess.ParseFen(`${fields[0]} ${fields[1]} - -`);
        const other = fields[1] === "w" ? "b" : "w";
        if (chess.InCheck(game, other) && !chess.InCheck(game, fields[1])) {
            fields[1] = other;
            fields[3] = "-"; //it came from the other side's last move
        }
        const fen = fields.join(" ");

        const imported = chess.ImportFen(fen);
        this.status.textContent = imported.error ? imported.error : "";
        if (imported.error || imported.fen === this.fen) return;
        if (this.isSwitched && imported.fen.split(" ")[0] === this.fen.split(" ")[0]) return; //switched by hand, see SwitchSide
        this.isSwitched = false;

        this.fen = imported.fen;
        chess.NewGame(imported.fen, reading.flipped ? "ai" : "ui", reading.flipped ? "ui" : "ai"); //the ai waits, see Chess.PlayAiMove

        if (this.hintSide) this.UpdateHint();
        else this.SetHintSide(reading.flipped ? "b" : "w");
    }

    SwitchSide() {
        const side = this.hintSide === "w" ? "b" : "w";
        if (this.fen) {
            const fields = this.fen.split(" ");
            fields[1] = side;
            fields[3] = "-";
            this.fen = fields.join(" ");
            this.isSwitched = true;
            this.chess.NewGame(this.fen);
        }
        this.SetHintSide(side);
    }

    SetHintSide(side) {
        this.hintSide = side;
        this.sideButton.style.backgroundImage = side === "w" ? "url(chess/king-light.svg)" : "url(chess/king.svg)";
        this.sideButton.setAttribute("tip-below", side === "w" ? "Engine plays white" : "Engine plays black");
        this.UpdateHint();
    }

    async UpdateHint() {
        const chess = this.chess;
        this.ClearHint();
        this.hintRequest = null; //an answer still on its way is for an earlier position or side
        if (!this.stream || !this.fen) return;

        if (chess.isGameOver) {
            this.hintText.textContent = chess.GetGameResult()?.text ?? "";
            return;
        }

        const name = this.hintSide === "w" ? "White" : "Black";
        if (chess.game.activecolor !== this.hintSide) {
            this.hintText.textContent = `Engine (${name}): waits for ${this.hintSide === "w" ? "black" : "white"}'s move`;
            return;
        }

        const fen = chess.GetCurrentFen();
        const request = this.hintRequest = {};
        this.hintText.textContent = `Engine (${name}): thinking...`;

        const aiMove = await chess.AskEngine(fen, Chess.LEVEL_MAX, chess.positions.join(","));
        if (this.hintRequest !== request || !this.stream || chess.GetCurrentFen() !== fen) return; //asked again, or stopped
        this.hintRequest = null;

        const move = chess.ParseAiMove(aiMove);
        if (!move) {
            this.hintText.textContent = `Engine (${name}): no move`;
            return;
        }

        this.hint = move;
        this.DrawHint();
        const promotion = move.promotion ? "=" + move.promotion.toUpperCase() : "";
        this.hintText.textContent = `Engine (${name}): ${chess.GetMoveNotation(move.p0, move.p1)}${promotion}`;
    }

    ClearHint() {
        this.hint = null;
        this.chess.hintLayer.textContent = "";
    }

    DrawHint() {
        const chess = this.chess;
        chess.hintLayer.textContent = "";
        if (!this.hint) return;

        chess.hintLayer.appendChild(chess.CreateArrow(this.hint.p0, this.hint.p1));
    }

    static READ = {
        minSquare  : 16, //px, of a board found
        minRead    : 30, //px, of a board read: smaller, some pieces look alike
        edge       : 40, //between two pixels, for the lines between the squares
        background : 50, //from a square's color, for what's not a piece
        highlight  : 40, //from a square's color, for the last move's squares
        sameShape  : .13, //between the silhouettes of identical pieces, different types measure .2 and more
        duplicate  : .08, //the cost of a type taken by two groups of a color, against a closer template
        labelCorner: .34, //of a square, the corner of a coordinate
        covered    : .6,  //of a side of the board unlike its squares: covered
        shade      : .8,  //of a square's color, the darkest under the move dots and the capture rings
    };

    static readTemplates = null;

    static GetReadTemplates() {
        ChessReader.readTemplates ??= Promise.all(Object.entries(Chess.PIECE_NAMES).map(([type, name])=> new Promise(resolve=> {
            const image = new Image();
            image.onload = ()=> resolve({ type: type, image: image, shapes: {} });
            image.src = `chess/${name}.svg`;
        })));
        return ChessReader.readTemplates;
    }

    static TemplateShapes(templates, n) {
        n = Math.max(12, Math.round(Math.min(n, 96)));
        return templates.map(template=> {
            if (!template.shapes[n]) {
                const canvas = document.createElement("canvas");
                canvas.width = canvas.height = n;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                ctx.drawImage(template.image, 0, 0, n, n);
                const data = ctx.getImageData(0, 0, n, n).data;

                const passable = new Uint8Array(n * n);
                for (let i = 0; i < n * n; i++) passable[i] = data[i * 4 + 3] < 128 ? 1 : 0;
                const outside = ChessReader.FillOutside(passable, n);

                const mask = outside.map(o=> 1 - o); //the cut-out details filled, as a read silhouette is
                template.shapes[n] = ChessReader.DescribeShape(mask, n);
            }
            return { type: template.type, shape: template.shapes[n] };
        });
    }

    static FillOutside(passable, n) {
        const outside = new Uint8Array(n * n);
        const stack = [];
        const visit = i=> {
            if (passable[i] && !outside[i]) {
                outside[i] = 1;
                stack.push(i);
            }
        };

        for (let k = 0; k < n; k++) {
            visit(k);
            visit((n - 1) * n + k);
            visit(k * n);
            visit(k * n + n - 1);
        }

        while (stack.length > 0) {
            const i = stack.pop();
            const x = i % n;
            if (x > 0)     visit(i - 1);
            if (x < n - 1) visit(i + 1);
            if (i >= n)    visit(i - n);
            if (i < n * (n - 1)) visit(i + n);
        }
        return outside;
    }

    static DescribeShape(mask, n, square = n) {
        let left = n, top = n, right = -1, bottom = -1;
        for (let y = 0; y < n; y++)
            for (let x = 0; x < n; x++)
                if (mask[y * n + x]) {
                    left = Math.min(left, x); right = Math.max(right, x);
                    top = Math.min(top, y); bottom = Math.max(bottom, y);
                }

        //each cell, the share of the shape in the pixels under it. at least one: a small shape, as a coordinate, is enlarged
        const w = right - left + 1, h = bottom - top + 1, g = 16;
        const grid = new Float32Array(g * g);
        for (let gy = 0; gy < g; gy++) {
            const y0 = top + Math.floor(gy * h / g), y1 = Math.max(y0 + 1, top + Math.floor((gy + 1) * h / g));
            for (let gx = 0; gx < g; gx++) {
                const x0 = left + Math.floor(gx * w / g), x1 = Math.max(x0 + 1, left + Math.floor((gx + 1) * w / g));
                let sum = 0;
                for (let y = y0; y < y1; y++)
                    for (let x = x0; x < x1; x++) sum += mask[y * n + x];
                grid[gy * g + gx] = sum / ((y1 - y0) * (x1 - x0));
            }
        }

        return { grid: grid, height: h / square, aspect: w / h, box: { left: left, top: top, width: w, height: h } };
    }

    static ShapeDistance(a, b) {
        let sum = 0;
        for (let i = 0; i < a.grid.length; i++) sum += Math.abs(Math.min(1, a.grid[i]) - Math.min(1, b.grid[i]));
        return sum / a.grid.length + Math.abs(a.height - b.height) * .5 + Math.abs(a.aspect - b.aspect) * .3;
    }

    static ColorDistance(a, b) {
        return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    }

    static IsShade(pixel, color) {
        const k = Math.max(ChessReader.READ.shade, Math.min(1, (pixel[0] * color[0] + pixel[1] * color[1] + pixel[2] * color[2]) / (color[0] * color[0] + color[1] * color[1] + color[2] * color[2] || 1)));
        return ChessReader.ColorDistance(pixel, [k * color[0], k * color[1], k * color[2]]) < ChessReader.READ.background * .4;
    }

    static IsDot(image, left, top, size, color) {
        const { width, data } = image;
        const center = [0, 0, 0];
        for (let y = -1; y <= 1; y++)
            for (let x = -1; x <= 1; x++) {
                const i = (Math.floor(top + size / 2) + y) * width * 4 + (Math.floor(left + size / 2) + x) * 4;
                for (let c = 0; c < 3; c++) center[c] += data[i + c] / 9;
            }
        return ChessReader.IsShade(center, color) && ChessReader.ColorDistance(center, color) >= ChessReader.READ.background * .4;
    }

    //Whether a piece could move from a square to another of a placement, [y][x] from the 8th rank: by how it moves, over
    //free squares. Whatever is on the two squares, and checks, aside.
    static CouldMove(placement, letter, from, to) {
        const dx = to.x - from.x, dy = to.y - from.y, ax = Math.abs(dx), ay = Math.abs(dy);
        if (ax === 0 && ay === 0) return false;
        const isWhite = letter === letter.toUpperCase();
        const isClear = ()=> { //the squares between, on a line
            for (let k = 1; k < Math.max(ax, ay); k++)
                if (placement[from.y + Math.sign(dy) * k][from.x + Math.sign(dx) * k]) return false;
            return true;
        };

        switch (letter.toLowerCase()) {
            case "n": return ax * ay === 2;
            case "k": return Math.max(ax, ay) === 1 || ay === 0 && ax === 2 && from.x === 4 && from.y === (isWhite ? 7 : 0);
            case "r": return (ax === 0 || ay === 0) && isClear();
            case "b": return ax === ay && isClear();
            case "q": return (ax === 0 || ay === 0 || ax === ay) && isClear();
            case "p": {
                const forward = isWhite ? -1 : 1;
                return dy === forward && ax <= 1 || ax === 0 && dy === 2 * forward && from.y === (isWhite ? 6 : 1) && isClear();
            }
        }
        return false;
    }

    //The lines between the squares along one direction: 7 equally spaced peaks of a profile of edges.
    //Returns the candidates {start, size, strength}, the first line found and the spacing.
    static FindLines(profile) {
        const minLength = 8 * ChessReader.READ.minSquare * .7;
        const peaks = [];
        for (let i = 1; i < profile.length - 1; i++)
            if (profile[i] >= minLength && profile[i] >= profile[i - 1] && profile[i] >= profile[i + 1] && (profile[i] > profile[i - 1] || profile[i] > profile[i + 1]))
                peaks.push(i); //a line blurred over two pixels makes two

        const nearest = (position, tolerance)=> { //the peak closest to a position, or -1
            let low = 0, high = peaks.length - 1;
            while (low < high) {
                const middle = (low + high) >> 1;
                if (peaks[middle] < position) low = middle + 1; else high = middle;
            }
            let best = -1;
            for (const k of [low - 1, low])
                if (k >= 0 && k < peaks.length && Math.abs(peaks[k] - position) <= tolerance && (best < 0 || Math.abs(peaks[k] - position) < Math.abs(best - position)))
                    best = peaks[k];
            return best;
        };

        const lines = [];
        for (let a = 0; a < peaks.length; a++) {
            for (let b = a + 1; b < peaks.length; b++) {
                const size = peaks[b] - peaks[a];
                if (size < ChessReader.READ.minSquare) continue;
                if (peaks[a] + 6 * size >= profile.length) break;

                const tolerance = Math.max(3, size * .05); //a scaled line's edge can be 3 pixels wide, its peak on any
                const matched = [peaks[a], peaks[b]];
                for (let k = 2; k <= 6; k++) { //the spacing is fractional: refined on each line found
                    const spacing = (matched[k - 1] - matched[0]) / (k - 1);
                    const peak = nearest(matched[k - 1] + spacing, tolerance);
                    if (peak < 0) break;
                    matched.push(peak);
                }
                if (matched.length < 7) continue;

                //each line at the center of its peak, a line is between the two pixels its edge marks: half a pixel on.
                //the 7, fitted by least squares
                const centers = matched.map(peak=> {
                    for (let i = Math.max(0, peak - 2); i <= Math.min(profile.length - 1, peak + 2); i++)
                        if (profile[i] > profile[peak]) peak = i; //the strongest nearby, a weaker edge can be beside a line
                    const from = Math.max(0, peak - 2), to = Math.min(profile.length - 1, peak + 2);
                    let floor = Infinity;
                    for (let i = from; i <= to; i++) floor = Math.min(floor, profile[i]);
                    let sum = 0, weight = 0;
                    for (let i = from; i <= to; i++) { sum += i * (profile[i] - floor); weight += profile[i] - floor; }
                    return (weight > 0 ? sum / weight : peak) + .5;
                });
                const spacing = centers.reduce((sum, o, k)=> sum + (k - 3) * o, 0) / 28; //the sum of (k - 3)², for k 0 to 6
                const fitted = { start: centers.reduce((sum, o)=> sum + o, 0) / 7 - 3 * spacing, size: spacing, strength: matched.reduce((sum, o)=> sum + profile[o], 0) };
                const same = lines.findIndex(o=> Math.abs(o.start - fitted.start) < 3 && Math.abs(o.size - fitted.size) < 2);
                if (same < 0) lines.push(fitted);
                else if (fitted.strength > lines[same].strength) lines[same] = fitted;
            }
        }

        return lines.sort((a, b)=> b.strength - a.strength).slice(0, 6);
    }

    //The color of a square, the median on a ring inside its edges, clear of most pieces and of the coordinates, and of the
    //blur between the squares: a few pixels, much of a small square.
    static SquareColor(image, left, top, size) {
        const { width, data } = image;
        const inset = Math.max(.06, 2.5 / size);
        const samples = [[], [], []];
        for (let t = 0; t < 8; t++) {
            const u = inset + (1 - 2 * inset) * t / 7;
            for (const [a, b] of [[u, inset], [u, 1 - inset], [inset, u], [1 - inset, u]]) {
                const i = (Math.floor(top + b * size) * width + Math.floor(left + a * size)) * 4;
                for (let c = 0; c < 3; c++) samples[c].push(data[i + c]);
            }
        }
        return samples.map(o=> o.sort((a, b)=> a - b)[o.length >> 1]);
    }

    //Whether a side of a board is covered, by the window's edge or by another part of the page: along it, on the outer pixels
    //of the squares' regions, unlike the squares' colors and their blends with the coordinates'. The pieces don't reach there.
    static IsCovered(image, board) {
        const { width, data } = image;
        const { left, top, size, colors, bases } = board;
        const inset = ChessReader.SquareInset(size), n = Math.floor(size) - inset * 2;

        for (let side = 0; side < 4; side++) {
            let unlike = 0, count = 0;
            for (let t = 0; t < 8; t++) {
                const k = [t, 56 + t, t * 8, t * 8 + 7][side];
                const x0 = Math.round(left + (k % 8) * size) + inset, y0 = Math.round(top + (k >> 3) * size) + inset; //as ReadSquare's
                const color = colors[k], span = [0, 1, 2].map(c=> bases[1 - ((k % 8) + (k >> 3)) % 2][c] - color[c]);
                const length = span.reduce((sum, o)=> sum + o * o, 0) || 1;
                for (let s = 0; s < 12; s++) {
                    const along = Math.floor((.1 + .8 * s / 11) * n);
                    const [x, y] = [[x0 + along, y0], [x0 + along, y0 + n - 1], [x0, y0 + along], [x0 + n - 1, y0 + along]][side];
                    const i = (y * width + x) * 4;
                    const pixel = [data[i], data[i + 1], data[i + 2]];
                    const blend = Math.max(0, Math.min(1, [0, 1, 2].reduce((sum, c)=> sum + (pixel[c] - color[c]) * span[c], 0) / length));
                    if (ChessReader.ColorDistance(pixel, color) >= ChessReader.READ.background && !ChessReader.IsShade(pixel, color) &&
                        ChessReader.ColorDistance(pixel, [0, 1, 2].map(c=> color[c] + blend * span[c])) >= ChessReader.READ.background / 2) unlike++;
                    count++;
                }
            }
            if (unlike > count * ChessReader.READ.covered) return true;
        }
        return false;
    }

    //Finds a board in an image: the grid of the lines between its squares, checked on the alternating colors of its squares.
    //Returns {left, top, size, colors, bases}, the colors of its 64 squares and of the light and the dark ones, or null.
    static FindBoard(image) {
        const { width: w, height: h, data } = image;
        const edge = ChessReader.READ.edge;

        //across each column, and down each row, the edges between the pixels on either side
        const columns = new Float32Array(w), rows = new Float32Array(h);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const i = (y * w + x) * 4, l = i - 4, r = i + 4, u = i - w * 4, d = i + w * 4;
                if (Math.abs(data[l] - data[r]) + Math.abs(data[l + 1] - data[r + 1]) + Math.abs(data[l + 2] - data[r + 2]) > edge) columns[x]++;
                if (Math.abs(data[u] - data[d]) + Math.abs(data[u + 1] - data[d + 1]) + Math.abs(data[u + 2] - data[d + 2]) > edge) rows[y]++;
            }
        }

        let best = null;
        const downs = ChessReader.FindLines(rows);
        for (const across of ChessReader.FindLines(columns)) {
            for (const down of downs) {
                if (Math.abs(across.size - down.size) > across.size * .03) continue;
                const size = (across.size + down.size) / 2;

                //the 7 lines found are 7 of the 9, outer edges included: the inner ones, or one off
                for (let n = 0; n <= 2; n++) {
                    for (let m = 0; m <= 2; m++) {
                        const left = across.start - n * size, top = down.start - m * size;
                        if (left < 0 || top < 0 || left + 8 * size > w || top + 8 * size > h) continue;

                        const colors = [];
                        for (let j = 0; j < 8; j++)
                            for (let i = 0; i < 8; i++)
                                colors.push(ChessReader.SquareColor(image, left + i * size, top + j * size, size));

                        //the light squares alike, the dark ones alike, and the two apart
                        const median = parity=> [0, 1, 2].map(c=> colors.filter((o, k)=> (k % 8 + (k >> 3)) % 2 === parity).map(o=> o[c]).sort((a, b)=> a - b)[16]);
                        const bases = [median(0), median(1)];
                        const separation = ChessReader.ColorDistance(bases[0], bases[1]);
                        const spread = colors.reduce((sum, o, k)=> sum + ChessReader.ColorDistance(o, bases[(k % 8 + (k >> 3)) % 2]), 0) / 64;
                        const score = separation - 3 * spread;

                        if (separation > 60 && spread < separation / 4 && (!best || score > best.score))
                            best = { left: left, top: top, size: size, colors: colors, bases: bases, score: score };
                    }
                }
            }
        }
        return best;
    }

    //Of a square, the pixels left out of its region: clear of the blur between squares, a piece can be .05 off the edge.
    static SquareInset(size) {
        return Math.max(1, Math.round(size * .03));
    }

    //A square's piece: its silhouette is what a flood fill from the square's edges, over its color, can't reach. Over its
    //darker shades too, a selected piece's move dot or capture ring.
    //The coordinates are in the other square color, passable too in their corners, with their blurred edges: any blend of
    //the two colors, closely. Only there, and only closely: a piece's outline, blurred on a small board, is grey near a blend
    //of them, and the fill would leak in.
    //Returns the region read, {x0, y0, n, mask}, the piece's silhouette in it, and the piece {isWhite, shape, box} or null.
    //The box is in the image.
    static ReadSquare(image, left, top, size, color, labelColor, corners = []) {
        const { width, data } = image;
        const inset = ChessReader.SquareInset(size);
        const x0 = Math.round(left) + inset, y0 = Math.round(top) + inset;
        const n = Math.floor(size) - inset * 2;
        const background = ChessReader.READ.background;

        //the distance of a pixel from the blends of the two colors, the closest point on the line between them
        const span = [0, 1, 2].map(c=> labelColor[c] - color[c]);
        const length = span.reduce((sum, o)=> sum + o * o, 0) || 1;

        const corner = Math.round(n * ChessReader.READ.labelCorner);
        const isLabelArea = (x, y)=> corners.some(o=> o === "top-left" ? x < corner && y < corner : x >= n - corner && y >= n - corner);

        const passable = new Uint8Array(n * n);
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const i = ((y0 + y) * width + x0 + x) * 4;
                const pixel = [data[i], data[i + 1], data[i + 2]];
                if (ChessReader.ColorDistance(pixel, color) < background || ChessReader.IsShade(pixel, color)) {
                    passable[y * n + x] = 1;
                }
                else if (isLabelArea(x, y)) {
                    const t = Math.max(0, Math.min(1, ((pixel[0] - color[0]) * span[0] + (pixel[1] - color[1]) * span[1] + (pixel[2] - color[2]) * span[2]) / length));
                    passable[y * n + x] = ChessReader.ColorDistance(pixel, [0, 1, 2].map(c=> color[c] + t * span[c])) < background / 2 ? 1 : 0;
                }
            }
        }
        const outside = ChessReader.FillOutside(passable, n);

        //the largest blob, anything else is a smaller one: a coordinate touching nothing, or noise
        const blob = new Int32Array(n * n).fill(-1);
        let largest = [];
        for (let start = 0; start < n * n; start++) {
            if (outside[start] || blob[start] >= 0) continue;
            const pixels = [start];
            blob[start] = start;
            for (let k = 0; k < pixels.length; k++) {
                const i = pixels[k], x = i % n;
                for (const next of [x > 0 ? i - 1 : -1, x < n - 1 ? i + 1 : -1, i - n, i + n]) {
                    if (next < 0 || next >= n * n || outside[next] || blob[next] >= 0) continue;
                    blob[next] = start;
                    pixels.push(next);
                }
            }
            if (pixels.length > largest.length) largest = pixels;
        }
        const region = { x0: x0, y0: y0, n: n, mask: new Uint8Array(n * n), piece: null };
        if (largest.length < n * n * .06) return region;

        const mask = region.mask;
        let light = 0;
        for (const i of largest) {
            mask[i] = 1;
            const p = ((y0 + Math.floor(i / n)) * width + x0 + i % n) * 4;
            if (.299 * data[p] + .587 * data[p + 1] + .114 * data[p + 2] > 150) light++;
        }

        const shape = ChessReader.DescribeShape(mask, n, size);
        region.piece = {
            isWhite: light / largest.length > .5,
            shape: shape,
            box: { left: x0 + shape.box.left, top: y0 + shape.box.top, width: shape.box.width, height: shape.box.height }
        };
        return region;
    }

    static labelTemplates = null;

    //The coordinates' characters, drawn bold, the shapes the read ones are matched against.
    static GetLabelTemplates() {
        if (ChessReader.labelTemplates) return ChessReader.labelTemplates;

        const n = 64;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = n;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.font = "bold 48px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ChessReader.labelTemplates = {};
        for (const character of "12345678abcdefgh") {
            ctx.clearRect(0, 0, n, n);
            ctx.fillText(character, n / 2, n / 2);
            const data = ctx.getImageData(0, 0, n, n).data;
            const mask = new Uint8Array(n * n);
            for (let i = 0; i < n * n; i++) mask[i] = data[i * 4 + 3] > 128 ? 1 : 0;
            ChessReader.labelTemplates[character] = ChessReader.DescribeShape(mask, n);
        }
        return ChessReader.labelTemplates;
    }

    static ReadLabel(image, region, corner, color, labelColor) {
        const { width, data } = image;
        const { x0, y0, n, mask } = region;
        const size = Math.round(n * ChessReader.READ.labelCorner);
        const left = corner === "top-left" ? 0 : n - size, top = corner === "top-left" ? 0 : n - size;

        const span = [0, 1, 2].map(c=> labelColor[c] - color[c]);
        const length = span.reduce((sum, o)=> sum + o * o, 0) || 1;

        const glyph = new Uint8Array(size * size);
        let count = 0;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (mask[(top + y) * n + left + x]) continue; //the piece's
                const i = ((y0 + top + y) * width + x0 + left + x) * 4;
                const t = ((data[i] - color[0]) * span[0] + (data[i + 1] - color[1]) * span[1] + (data[i + 2] - color[2]) * span[2]) / length;
                if (t < .5) continue;
                const blend = [0, 1, 2].map(c=> color[c] + Math.min(1, t) * span[c]);
                if (ChessReader.ColorDistance([data[i], data[i + 1], data[i + 2]], blend) >= ChessReader.READ.background) continue;
                glyph[y * size + x] = 1;
                count++;
            }
        }
        if (count < size * size * .03) return null;

        const shape = ChessReader.DescribeShape(glyph, size);
        shape.box = { left: x0 + left + shape.box.left, top: y0 + top + shape.box.top, width: shape.box.width, height: shape.box.height };
        return shape;
    }

    static GlyphDistance(a, b) {
        let sum = 0;
        for (let i = 0; i < a.grid.length; i++) sum += Math.abs(Math.min(1, a.grid[i]) - Math.min(1, b.grid[i]));
        return sum / a.grid.length + Math.abs(a.aspect - b.aspect) * .3;
    }

    static ReadBoard(image, templates) {
        const board = ChessReader.FindBoard(image);
        if (!board) return { error: "No chess board found" };
        const { left, top, size, colors, bases } = board;
        if (size < ChessReader.READ.minRead) return { error: `The board is too small to read (${Math.floor(size * 8)}px), make the window larger`, board: board, squares: [] };
        if (ChessReader.IsCovered(image, board)) return { error: "The board is partly hidden, make the window larger", board: board, squares: [] };
        templates = ChessReader.TemplateShapes(templates, size);

        const squares = [];
        for (let j = 0; j < 8; j++) {
            for (let i = 0; i < 8; i++) {
                const k = j * 8 + i, parity = (i + j) % 2;
                const corners = [i === 0 ? "top-left" : null, j === 7 ? "bottom-right" : null].filter(o=> o); //the coordinates'
                const region = ChessReader.ReadSquare(image, left + i * size, top + j * size, size, colors[k], bases[1 - parity], corners);
                squares.push({
                    i: i, j: j, piece: region.piece, region: region,
                    isHighlighted: ChessReader.ColorDistance(colors[k], bases[parity]) > ChessReader.READ.highlight,
                    isDot: !region.piece && ChessReader.IsDot(image, left + i * size, top + j * size, size, colors[k])
                });
            }
        }

        //groups of alike silhouettes, both colors together, a set's two colors are mostly the same shapes. from a group for each
        //piece, the two closest on average merge, while they're alike, and while there're more groups than types: noise split them
        const pieces = squares.filter(o=> o.piece);
        const distances = pieces.map(a=> pieces.map(b=> ChessReader.ShapeDistance(a.piece.shape, b.piece.shape)));
        const groups = pieces.map((o, k)=> ({ members: [o], indices: [k] }));
        const linkage = (a, b)=> {
            let sum = 0;
            for (const x of a.indices) for (const y of b.indices) sum += distances[x][y];
            return sum / (a.indices.length * b.indices.length);
        };
        while (groups.length > 1) {
            let a = 0, b = 1, closest = Infinity;
            for (let x = 0; x < groups.length; x++)
                for (let y = x + 1; y < groups.length; y++) {
                    const d = linkage(groups[x], groups[y]);
                    if (d < closest) { closest = d; a = x; b = y; }
                }
            if (closest >= ChessReader.READ.sameShape && groups.length <= 7) break;
            groups[a].members.push(...groups[b].members);
            groups[a].indices.push(...groups[b].indices);
            groups.splice(b, 1);
        }

        //the types of the groups, every combination: the closest to the templates within the rules. a group's distance to a
        //template is its pieces' average, a small board's silhouettes are noisy
        const types = templates.map(o=> o.type);
        const costs = groups.map(g=> templates.map(t=> g.members.reduce((sum, o)=> sum + ChessReader.ShapeDistance(o.piece.shape, t.shape), 0) / g.members.length));
        const assigned = new Array(groups.length);
        let bestCost = Infinity, best = null;
        const search = (g, cost)=> {
            if (cost >= bestCost) return;
            if (g === groups.length) {
                for (const isWhite of [true, false]) {
                    const of = type=> groups.filter((o, k)=> assigned[k] === type).flatMap(o=> o.members).filter(o=> o.piece.isWhite === isWhite);
                    if (of("k").length !== 1 || of("p").length > 8) return;
                }
                //a type once in a color's groups, unless noise split it
                let duplicates = 0;
                for (const isWhite of [true, false])
                    for (const type of types) {
                        const count = groups.filter((o, k)=> assigned[k] === type && o.members.some(m=> m.piece.isWhite === isWhite)).length;
                        duplicates += Math.max(0, count - 1);
                    }
                if (cost + duplicates * ChessReader.READ.duplicate < bestCost) {
                    bestCost = cost + duplicates * ChessReader.READ.duplicate;
                    best = [...assigned];
                }
                return;
            }
            for (let t = 0; t < types.length; t++) {
                if (types[t] === "p" && groups[g].members.some(o=> o.j === 0 || o.j === 7)) continue;
                assigned[g] = types[t];
                search(g + 1, cost + costs[g][t]);
            }
        };
        search(0, 0);
        if (!best) return { error: "No king for each side found", board: board, squares: squares };

        groups.forEach((group, k)=> group.members.forEach(o=> o.type = best[k]));
        for (const square of squares)
            if (square.piece) square.letter = square.piece.isWhite ? square.type.toUpperCase() : square.type;

        //orientation, from the coordinates: the ranks down the left column read 8 to 1, or 1 to 8 when flipped, and the files
        //along the bottom row a to h, or h to a. each read one is matched to both, the closer order wins
        const characters = ChessReader.GetLabelTemplates();
        const labels = [];
        let normal = 0, reversed = 0;
        for (let k = 0; k < 8; k++) {
            for (const [square, corner, asNormal, asReversed] of [
                [squares[k * 8], "top-left", String(8 - k), String(k + 1)],                  //a rank
                [squares[56 + k], "bottom-right", "abcdefgh"[k], "abcdefgh"[7 - k]] //a file
            ]) {
                const parity = (square.i + square.j) % 2;
                const label = ChessReader.ReadLabel(image, square.region, corner, colors[square.j * 8 + square.i], bases[1 - parity]);
                if (!label) continue;
                normal += ChessReader.GlyphDistance(label, characters[asNormal]);
                reversed += ChessReader.GlyphDistance(label, characters[asReversed]);
                labels.push(label);
            }
        }

        let flipped = false;
        if (labels.length >= 4 && Math.abs(normal - reversed) > labels.length * .01) {
            flipped = reversed < normal;
        }
        else { //no coordinates: the pawns, or the kings, of each side on its own half
            const meanRow = letter=> {
                const rows = squares.filter(o=> o.letter === letter).map(o=> o.j);
                return rows.length ? rows.reduce((a, b)=> a + b, 0) / rows.length : null;
            };
            const white = meanRow("P") ?? meanRow("K"), black = meanRow("p") ?? meanRow("k");
            if (white !== null && black !== null) flipped = white < black; //white's side at the top
        }

        //the position, rows from the 8th rank
        const placement = [...Array(8)].map(()=> Array(8).fill(null));
        const at = square=> flipped ? { x: 7 - square.i, y: 7 - square.j } : { x: square.i, y: square.j };
        for (const square of squares)
            if (square.letter) { const p = at(square); placement[p.y][p.x] = square.letter; }

        //the side to move, from the last move's squares: the piece on its target moved. a selected piece highlights its square
        //too, of the side to move: alone, it's all there is. with a last move, the target of the two is the one its piece could
        //have come to from the emptied square, or else the one the dots aren't the moves of: the other is selected
        let active = "w", enpassant = "-";
        const highlighted = squares.filter(o=> o.isHighlighted);
        const emptied = highlighted.filter(o=> !o.letter), occupied = highlighted.filter(o=> o.letter);
        let toSquare = null;
        if (emptied.length === 1 && occupied.length === 1) {
            toSquare = occupied[0];
        }
        else if (emptied.length === 1 && occupied.length === 2 && occupied[0].piece.isWhite !== occupied[1].piece.isWhite) {
            const from = at(emptied[0]);
            const [a, b] = occupied.map(o=> ChessReader.CouldMove(placement, o.letter, from, at(o)));
            if (a !== b) {
                toSquare = a ? occupied[0] : occupied[1];
            }
            else {
                const dots = squares.filter(o=> o.isDot).map(at);
                const fit = o=> dots.reduce((sum, d)=> sum + (ChessReader.CouldMove(placement, o.letter, at(o), d) ? 1 : -1), 0); //as selected
                const [fitA, fitB] = occupied.map(fit);
                if (fitA !== fitB) toSquare = fitA > fitB ? occupied[1] : occupied[0];
            }
        }
        else if (highlighted.length === 1 && highlighted[0].letter) {
            active = highlighted[0].piece.isWhite ? "w" : "b";
        }

        if (toSquare) {
            const from = at(emptied[0]), to = at(toSquare);
            active = toSquare.piece.isWhite ? "b" : "w";
            if (toSquare.type === "p" && from.x === to.x && Math.abs(from.y - to.y) === 2)
                enpassant = String.fromCharCode(97 + to.x) + (8 - (from.y + to.y) / 2);
        }

        let castling = "";
        if (placement[7][4] === "K" && placement[7][7] === "R") castling += "K";
        if (placement[7][4] === "K" && placement[7][0] === "R") castling += "Q";
        if (placement[0][4] === "k" && placement[0][7] === "r") castling += "k";
        if (placement[0][4] === "k" && placement[0][0] === "r") castling += "q";

        const ranks = placement.map(row=> row.map(o=> o ?? "1").join("").replace(/1+/g, o=> o.length));
        return {
            fen: `${ranks.join("/")} ${active} ${castling || "-"} ${enpassant} 0 1`,
            flipped: flipped,
            board: board,
            squares: squares,
            labels: labels
        };
    }

    static DrawReading(ctx, reading) {
        if (!reading.board) return;
        const { left, top, size } = reading.board;
        const line = Math.max(2, size / 24);

        ctx.lineWidth = line;
        ctx.strokeStyle = "rgb(255,102,0)";
        for (let k = 0; k <= 8; k++) {
            ctx.beginPath();
            ctx.moveTo(left + k * size, top);
            ctx.lineTo(left + k * size, top + 8 * size);
            ctx.moveTo(left, top + k * size);
            ctx.lineTo(left + 8 * size, top + k * size);
            ctx.stroke();
        }

        //the coordinates read, for the orientation
        ctx.lineWidth = line / 2;
        ctx.strokeStyle = "rgb(255,0,255)";
        for (const label of reading.labels ?? []) ctx.strokeRect(label.box.left, label.box.top, label.box.width, label.box.height);
        ctx.lineWidth = line;

        ctx.font = `600 ${Math.round(size * .32)}px sans-serif`;
        ctx.textBaseline = "top";
        for (const square of reading.squares) {
            const x = left + square.i * size, y = top + square.j * size;

            if (square.isHighlighted) {
                ctx.strokeStyle = "rgb(0,160,255)";
                ctx.strokeRect(x + line * 2, y + line * 2, size - line * 4, size - line * 4);
            }

            if (square.isDot) {
                ctx.strokeStyle = "rgb(0,160,255)";
                ctx.beginPath();
                ctx.arc(x + size / 2, y + size / 2, size * .2, 0, Math.PI * 2);
                ctx.stroke();
            }

            if (!square.piece) continue;
            const box = square.piece.box;
            ctx.lineWidth = line / 2;
            ctx.strokeStyle = square.piece.isWhite ? "rgb(255,255,255)" : "rgb(0,0,0)";
            ctx.strokeRect(box.left, box.top, box.width, box.height);
            ctx.lineWidth = line;

            if (square.letter) {
                ctx.fillStyle = "rgba(255,102,0,.85)";
                ctx.fillRect(x + line, y + line, size * .32, size * .36);
                ctx.fillStyle = "rgb(255,255,255)";
                ctx.fillText(square.letter, x + line * 1.5, y + line * 1.5);
            }
        }
    }
}
