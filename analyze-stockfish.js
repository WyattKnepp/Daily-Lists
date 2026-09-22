const { Chess } = require('chess.js');
const { spawn } = require('child_process');
const fs = require('fs');

const STOCKFISH_PATH = '/home/openclaw/stockfish';
const DEPTH = 18;

function createEngine() {
  const engine = spawn(STOCKFISH_PATH);
  let buffer = '';
  let resolver = null;
  
  engine.stdout.on('data', (data) => {
    buffer += data.toString();
    if (resolver && buffer.includes('bestmove')) {
      resolver(buffer);
      buffer = '';
      resolver = null;
    }
  });
  
  engine.stdin.write('uci\n');
  engine.stdin.write('isready\n');
  
  return {
    analyze: (fen) => new Promise((resolve) => {
      buffer = '';
      resolver = resolve;
      engine.stdin.write(`position fen ${fen}\n`);
      engine.stdin.write(`go depth ${DEPTH}\n`);
    }),
    quit: () => engine.stdin.write('quit\n')
  };
}

function parseEval(output, whiteToMove) {
  const lines = output.split('\n').filter(l => l.includes('info depth'));
  const lastInfo = lines[lines.length - 1] || '';
  
  const scoreMatch = lastInfo.match(/score (cp|mate) (-?\d+)/);
  const bestMatch = output.match(/bestmove (\w+)/);
  
  let score = 0;
  let scoreText = '0.00';
  let isMate = false;
  
  if (scoreMatch) {
    if (scoreMatch[1] === 'cp') {
      // Stockfish gives score from side-to-move perspective
      // Convert to white's perspective
      score = parseInt(scoreMatch[2]) / 100;
      if (!whiteToMove) score = -score;
      scoreText = (score >= 0 ? '+' : '') + score.toFixed(2);
    } else {
      isMate = true;
      let mate = parseInt(scoreMatch[2]);
      if (!whiteToMove) mate = -mate;
      score = mate > 0 ? 999 : -999;
      scoreText = (mate > 0 ? '+' : '') + 'M' + Math.abs(mate);
    }
  }
  
  return { score, scoreText, isMate, bestMove: bestMatch ? bestMatch[1] : null };
}

async function analyzeGame(inputFile, outputFile) {
  const pgn = fs.readFileSync(inputFile, 'utf8');
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });
  
  const engine = createEngine();
  await new Promise(r => setTimeout(r, 500));
  
  chess.reset();
  
  let output = pgn.split('\n\n')[0] + '\n\n';
  
  // Analyze starting position (white to move)
  const startResult = await engine.analyze(chess.fen());
  let prevEval = parseEval(startResult, true);
  
  console.log(`Analyzing ${history.length} moves at depth ${DEPTH}...`);
  
  let moveNum = 1;
  let isWhiteMove = true;
  
  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    chess.move(move.san);
    
    // After move, it's opponent's turn
    const whiteToMove = move.color === 'b'; // If black just moved, white to move now
    const result = await engine.analyze(chess.fen());
    const currEval = parseEval(result, whiteToMove);
    
    // Calculate eval change from the moving side's perspective
    // If white moved: good = score went up. evalDrop = prevScore - currScore
    // If black moved: good = score went down. evalDrop = currScore - prevScore
    let evalDrop;
    if (move.color === 'w') {
      evalDrop = prevEval.score - currEval.score;
    } else {
      evalDrop = currEval.score - prevEval.score;
    }
    
    let comment = '';
    // Only flag if not a forced mate situation
    if (!prevEval.isMate && !currEval.isMate) {
      if (evalDrop > 2) {
        comment = ` { BLUNDER! [${currEval.scoreText}] }`;
      } else if (evalDrop > 1) {
        comment = ` { Mistake [${currEval.scoreText}] }`;
      } else if (evalDrop > 0.5) {
        comment = ` { Inaccuracy [${currEval.scoreText}] }`;
      }
    }
    
    // Show eval for significant positions
    if (!comment && (Math.abs(currEval.score) > 2 || currEval.isMate)) {
      comment = ` { [${currEval.scoreText}] }`;
    }
    
    if (isWhiteMove) {
      output += `${moveNum}. ${move.san}${comment} `;
    } else {
      output += `${move.san}${comment} `;
      moveNum++;
    }
    
    isWhiteMove = !isWhiteMove;
    prevEval = currEval;
    
    process.stdout.write(`\r${i+1}/${history.length}`);
  }
  
  output += '*\n';
  engine.quit();
  
  fs.writeFileSync(outputFile, output);
  console.log(`\nSaved: ${outputFile}`);
}

const input = '/home/openclaw/chess-notation/games/stone-doug-5-24-26.pgn';
const output = '/home/openclaw/chess-notation/games/stone-doug-5-24-26-analyzed.pgn';

analyzeGame(input, output).catch(console.error);
