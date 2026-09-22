const { Chess } = require('chess.js');
const fs = require('fs');

async function lichessEval(fen) {
  const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function analyze() {
  const pgn = fs.readFileSync('/home/openclaw/chess-notation/games/stone-doug-5-24-26.pgn', 'utf8');
  
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });
  
  chess.reset();
  
  let output = pgn.split('\n\n')[0] + '\n\n';
  let prevScore = 0;
  let moveNum = 1;
  let isWhite = true;
  
  const startEval = await lichessEval(chess.fen());
  if (startEval?.pvs?.[0]?.cp !== undefined) {
    prevScore = startEval.pvs[0].cp / 100;
  }
  
  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    chess.move(move.san);
    
    await new Promise(r => setTimeout(r, 400));
    
    const evalData = await lichessEval(chess.fen());
    let score = 0;
    let scoreText = '';
    let comment = '';
    
    if (evalData?.pvs?.[0]) {
      const pv = evalData.pvs[0];
      if (pv.cp !== undefined) {
        score = pv.cp / 100;
        scoreText = (pv.cp >= 0 ? '+' : '') + (pv.cp / 100).toFixed(2);
      } else if (pv.mate !== undefined) {
        score = pv.mate > 0 ? 100 : -100;
        scoreText = (pv.mate > 0 ? '+' : '') + 'M' + Math.abs(pv.mate);
      }
    }
    
    const color = move.color === 'w' ? 'White' : 'Black';
    const evalChange = move.color === 'w' ? prevScore - score : score - prevScore;
    
    if (evalChange > 2) {
      comment = ` { BLUNDER! ${color} drops ${evalChange.toFixed(1)}. [${scoreText}] }`;
    } else if (evalChange > 1) {
      comment = ` { Mistake. [${scoreText}] }`;
    } else if (evalChange > 0.5) {
      comment = ` { Inaccuracy. [${scoreText}] }`;
    } else if (Math.abs(score) > 3 || scoreText.includes('M')) {
      comment = ` { [${scoreText}] }`;
    }
    
    if (isWhite) {
      output += `${moveNum}. ${move.san}${comment} `;
    } else {
      output += `${move.san}${comment} `;
      moveNum++;
    }
    
    isWhite = !isWhite;
    prevScore = score;
    
    process.stdout.write(`\rAnalyzed ${i+1}/${history.length}`);
  }
  
  output += '*\n';
  
  fs.writeFileSync('/home/openclaw/chess-notation/games/stone-doug-5-24-26-analyzed.pgn', output);
  console.log('\nSaved: stone-doug-5-24-26-analyzed.pgn');
}

analyze().catch(console.error);
