//The chess engine, off the page's thread: a search can take seconds, and the page stays responsive meanwhile.
//Answers {fen, level, positions} with {move}: ChessAi's answer ("e2-e4", "" for none), or null if it failed.

importScripts("../wasm_exec.js");

const go = new Go();
const ready = WebAssembly.instantiateStreaming(fetch("chess.wasm"), go.importObject)
    .then(result=> { go.run(result.instance); }); //runs main, which sets ChessAi and waits for its calls

onmessage = async event=> {
    const { fen, level, positions } = event.data;

    let move = null;
    try {
        await ready;
        move = ChessAi(fen, level, positions);
    }
    catch (ex) {
        console.error(ex);
    }

    postMessage({ move: move });
};
