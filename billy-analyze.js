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
  engine.stdin.write('setoption name MultiPV value 2\n');
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
  const lines = output.split('\n').filter(l => l.includes('info depth ' + DEPTH));
  
  let bestLine = null;
  let secondLine = null;
  
  for (const line of lines) {
    const pvMatch = line.match(/multipv (\d+)/);
    if (pvMatch) {
      if (pvMatch[1] === '1') bestLine = line;
      if (pvMatch[1] === '2') secondLine = line;
    }
  }
  
  if (!bestLine) bestLine = lines[lines.length - 1] || '';
  
  const scoreMatch = bestLine.match(/score (cp|mate) (-?\d+)/);
  const pvMatch = bestLine.match(/ pv (.+)/);
  const bestMatch = output.match(/bestmove (\w+)/);
  
  let score = 0;
  let scoreText = '0.00';
  let isMate = false;
  
  if (scoreMatch) {
    if (scoreMatch[1] === 'cp') {
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
  
  return { 
    score, 
    scoreText, 
    isMate, 
    bestMove: bestMatch ? bestMatch[1] : null,
    pv: pvMatch ? pvMatch[1].split(' ').slice(0, 5) : []
  };
}

function uciToSan(chess, uciMove) {
  const tempChess = new Chess(chess.fen());
  try {
    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);
    const promo = uciMove.length > 4 ? uciMove[4] : undefined;
    const move = tempChess.move({ from, to, promotion: promo });
    return move ? move.san : uciMove;
  } catch {
    return uciMove;
  }
}

const cowboyPhrases = {
  blunder: [
    "Well, partner, that move there was rougher than a buckin' bronco.",
    "Yeehaw, that's a tumble off the horse right there.",
    "That move's about as useful as a screen door on a submarine, partner.",
    "Whoa there! That's a real barn-burner of a mistake."
  ],
  mistake: [
    "Now hold your horses, that wasn't the best trail to ride.",
    "That's a bit like shootin' yourself in the boot, partner.",
    "Reckon you coulda done better there, cowpoke."
  ],
  inaccuracy: [
    "That ain't quite straight shootin', but it ain't terrible neither.",
    "You're a little off the trail there, but still in the saddle."
  ],
  good: [
    "Now that's ridin' tall in the saddle!",
    "Slicker than a greased pig, that move!",
    "You're shootin' straight, partner!"
  ],
  opening: [
    "Alright partner, let's mosey through this here game.",
    "Saddle up, let's see what kinda chess rodeo we got here."
  ],
  closing: [
    "Well, that's all she wrote, partner. Keep practicin' and you'll be a real gunslinger.",
    "That's the end of the trail for this game. Now git back on that horse!"
  ]
};

function randomPhrase(type) {
  const phrases = cowboyPhrases[type];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

async function analyzeGame(inputFile, outputFile) {
  const pgn = fs.readFileSync(inputFile, 'utf8');
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });
  
  // Extract headers
  const whiteMatch = pgn.match(/\[White "([^"]+)"\]/);
  const blackMatch = pgn.match(/\[Black "([^"]+)"\]/);
  const dateMatch = pgn.match(/\[Date "([^"]+)"\]/);
  const whiteName = whiteMatch ? whiteMatch[1] : 'White';
  const blackName = blackMatch ? blackMatch[1] : 'Black';
  const date = dateMatch ? dateMatch[1] : 'Unknown';
  
  const engine = createEngine();
  await new Promise(r => setTimeout(r, 500));
  
  chess.reset();
  
  const analysis = [];
  const criticalMoments = [];
  let whiteAccuracy = { total: 0, count: 0 };
  let blackAccuracy = { total: 0, count: 0 };
  
  // Starting position
  const startResult = await engine.analyze(chess.fen());
  let prevEval = parseEval(startResult, true);
  
  console.log(`Analyzing ${history.length} moves...`);
  
  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    const fenBefore = chess.fen();
    const whiteToMoveBefore = chess.turn() === 'w';
    
    // Get best move BEFORE making the played move
    const preResult = await engine.analyze(fenBefore);
    const preEval = parseEval(preResult, whiteToMoveBefore);
    const bestMoveSan = uciToSan(chess, preEval.bestMove);
    
    chess.move(move.san);
    
    const whiteToMoveAfter = chess.turn() === 'w';
    const postResult = await engine.analyze(chess.fen());
    const postEval = parseEval(postResult, whiteToMoveAfter);
    
    // Eval drop from moving player's perspective
    let evalDrop;
    if (move.color === 'w') {
      evalDrop = prevEval.score - postEval.score;
    } else {
      evalDrop = postEval.score - prevEval.score;
    }
    
    // Accuracy calculation (simplified)
    const accuracy = Math.max(0, 100 - Math.abs(evalDrop) * 20);
    if (move.color === 'w') {
      whiteAccuracy.total += accuracy;
      whiteAccuracy.count++;
    } else {
      blackAccuracy.total += accuracy;
      blackAccuracy.count++;
    }
    
    let severity = null;
    if (!prevEval.isMate && !postEval.isMate) {
      if (evalDrop > 2) severity = 'blunder';
      else if (evalDrop > 1) severity = 'mistake';
      else if (evalDrop > 0.5) severity = 'inaccuracy';
    }
    
    const moveNum = Math.floor(i / 2) + 1;
    const moveStr = move.color === 'w' ? `${moveNum}. ${move.san}` : `${moveNum}...${move.san}`;
    
    if (severity) {
      criticalMoments.push({
        moveNum,
        moveStr,
        played: move.san,
        best: bestMoveSan,
        severity,
        evalBefore: prevEval.scoreText,
        evalAfter: postEval.scoreText,
        color: move.color === 'w' ? whiteName : blackName
      });
    }
    
    prevEval = postEval;
    process.stdout.write(`\r${i+1}/${history.length}`);
  }
  
  engine.quit();
  
  // Generate Billy's lesson
  let lesson = `# 🤠 Billy's Chess Lesson\n\n`;
  lesson += `**Game:** ${whiteName} vs ${blackName}\n`;
  lesson += `**Date:** ${date}\n\n`;
  lesson += `---\n\n`;
  lesson += `## Howdy, Partner!\n\n`;
  lesson += `${randomPhrase('opening')}\n\n`;
  
  // Accuracy
  const whiteAcc = (whiteAccuracy.total / whiteAccuracy.count).toFixed(1);
  const blackAcc = (blackAccuracy.total / blackAccuracy.count).toFixed(1);
  lesson += `## 🎯 Accuracy Scores\n\n`;
  lesson += `- **${whiteName} (White):** ${whiteAcc}%\n`;
  lesson += `- **${blackName} (Black):** ${blackAcc}%\n\n`;
  
  // Critical moments
  if (criticalMoments.length > 0) {
    lesson += `## 🔥 Critical Moments\n\n`;
    lesson += `These here are the spots where the game went sideways:\n\n`;
    
    for (const moment of criticalMoments) {
      const emoji = moment.severity === 'blunder' ? '💀' : moment.severity === 'mistake' ? '⚠️' : '📍';
      lesson += `### ${emoji} ${moment.moveStr} (${moment.severity.toUpperCase()})\n\n`;
      lesson += `**${moment.color}** played **${moment.played}**\n\n`;
      lesson += `${randomPhrase(moment.severity)}\n\n`;
      lesson += `- **Better move:** ${moment.best}\n`;
      lesson += `- **Eval before:** ${moment.evalBefore} → **After:** ${moment.evalAfter}\n\n`;
    }
  } else {
    lesson += `## 🌟 Clean Game!\n\n`;
    lesson += `Well I'll be! Both players rode straight and true. No major blunders to speak of.\n\n`;
  }
  
  // Closing
  lesson += `---\n\n`;
  lesson += `## 🏁 Final Words from Billy\n\n`;
  lesson += `${randomPhrase('closing')}\n\n`;
  lesson += `*This analysis was done at depth ${DEPTH} using Stockfish 17.1*\n`;
  
  fs.writeFileSync(outputFile, lesson);
  console.log(`\nSaved: ${outputFile}`);
}

// Get input file from command line or use default
const input = process.argv[2] || '/home/openclaw/chess-notation/games/stone-doug-5-24-26.pgn';
const baseName = input.replace('.pgn', '');
const output = `${baseName}-lesson.md`;

analyzeGame(input, output).catch(console.error);
