const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Chess } = require('chess.js');

const app = express();
const PORT = 3001;
const TOKEN = 'password';
const LISTS_DIR = path.join(__dirname, 'lists');
const CHESS_GAMES_DIR = '/home/openclaw/chess-notation/games';
const STOCKFISH_PATH = '/home/openclaw/stockfish';
const DEPTH = 18;

// Ensure chess games dir exists
if (!fs.existsSync(CHESS_GAMES_DIR)) {
  fs.mkdirSync(CHESS_GAMES_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());

// ============ CHESS ROUTES (no auth) ============
app.use('/chess', express.static('/home/openclaw/chess-notation/public'));

// Get all chess games
app.get('/chess/api/games', (req, res) => {
  const files = fs.readdirSync(CHESS_GAMES_DIR).filter(f => f.endsWith('.pgn'));
  const games = files.map(f => ({
    id: f.replace('.pgn', ''),
    filename: f,
    content: fs.readFileSync(path.join(CHESS_GAMES_DIR, f), 'utf8')
  }));
  res.json(games);
});

// Get single chess game
app.get('/chess/api/games/:id', (req, res) => {
  const file = path.join(CHESS_GAMES_DIR, req.params.id + '.pgn');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Game not found' });
  res.json({ id: req.params.id, content: fs.readFileSync(file, 'utf8') });
});

// Save chess game
app.post('/chess/api/games', (req, res) => {
  const { title, white, black, date, moves, pgn } = req.body;
  const timestamp = Date.now();
  const safeName = (title || `game-${timestamp}`).replace(/[^a-zA-Z0-9-_]/g, '-');
  const filename = `${safeName}.pgn`;
  
  let pgnContent = pgn || `[Event "Casual Game"]
[Site "?"]
[Date "${date || new Date().toISOString().split('T')[0]}"]
[White "${white || '?'}"]
[Black "${black || '?'}"]
[Result "*"]

${moves || ''}
`;
  
  fs.writeFileSync(path.join(CHESS_GAMES_DIR, filename), pgnContent);
  res.json({ ok: true, id: safeName, filename });
});

// Delete chess game
app.delete('/chess/api/games/:id', (req, res) => {
  const file = path.join(CHESS_GAMES_DIR, req.params.id + '.pgn');
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ ok: true });
});

// ============ BILLY ANALYSIS ============
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
  closing: [
    "Well, that's all she wrote, partner. Keep practicin' and you'll be a real gunslinger.",
    "That's the end of the trail for this game. Now git back on that horse!",
    "Ride on, cowpoke. You'll lasso that king next time."
  ]
};

function randomPhrase(type) {
  const phrases = cowboyPhrases[type];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

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

function uciToSan(fen, uciMove) {
  try {
    const chess = new Chess(fen);
    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);
    const promo = uciMove.length > 4 ? uciMove[4] : undefined;
    const move = chess.move({ from, to, promotion: promo });
    return move ? move.san : uciMove;
  } catch {
    return uciMove;
  }
}

// Billy Analysis Endpoint
app.get('/chess/api/billy/:id', async (req, res) => {
  try {
    const file = path.join(CHESS_GAMES_DIR, req.params.id + '.pgn');
    if (!fs.existsSync(file)) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    const pgn = fs.readFileSync(file, 'utf8');
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });
    
    // Extract headers
    const whiteName = pgn.match(/\[White "([^"]+)"\]/)?.[1] || 'White';
    const blackName = pgn.match(/\[Black "([^"]+)"\]/)?.[1] || 'Black';
    const date = pgn.match(/\[Date "([^"]+)"\]/)?.[1] || 'Unknown';
    
    const engine = createEngine();
    await new Promise(r => setTimeout(r, 500));
    
    chess.reset();
    
    const moments = [];
    let whiteAccuracy = { total: 0, count: 0 };
    let blackAccuracy = { total: 0, count: 0 };
    
    // Starting position
    const startResult = await engine.analyze(chess.fen());
    let prevEval = parseEval(startResult, true);
    
    for (let i = 0; i < history.length; i++) {
      const move = history[i];
      const fenBefore = chess.fen();
      const whiteToMoveBefore = chess.turn() === 'w';
      
      // Get best move BEFORE making the played move
      const preResult = await engine.analyze(fenBefore);
      const preEval = parseEval(preResult, whiteToMoveBefore);
      const bestMoveSan = uciToSan(fenBefore, preEval.bestMove);
      
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
      
      // Accuracy
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
      
      if (severity) {
        const moveNum = Math.floor(i / 2) + 1;
        const moveStr = move.color === 'w' ? `${moveNum}. ${move.san}` : `${moveNum}...${move.san}`;
        
        moments.push({
          moveNum,
          moveStr,
          played: move.san,
          best: bestMoveSan,
          severity,
          evalBefore: prevEval.scoreText,
          evalAfter: postEval.scoreText,
          color: move.color === 'w' ? whiteName : blackName,
          billySays: randomPhrase(severity)
        });
      }
      
      prevEval = postEval;
    }
    
    engine.quit();
    
    res.json({
      white: whiteName,
      black: blackName,
      date,
      whiteAccuracy: (whiteAccuracy.total / whiteAccuracy.count).toFixed(1),
      blackAccuracy: (blackAccuracy.total / blackAccuracy.count).toFixed(1),
      moments,
      closingQuote: randomPhrase('closing')
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ NEWSPAPER (no auth) ============
app.use('/newspaper', express.static(path.join(__dirname, 'newspaper')));

// ============ CHECKLIST ROUTES (with auth) ============
app.get('/', (req, res) => {
  const overridePath = path.join(__dirname, 'index_main.html');
  const indexPath = fs.existsSync(overridePath) ? overridePath : path.join(__dirname, 'public', 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');

  // Inject refresh button before delete button
  html = html.replace(
    '<button class="icon-btn danger" id="delete-list-btn" title="Delete list" style="display:none">',
    `<button class="icon-btn" id="refresh-btn" title="Refresh">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7a6 6 0 1 0 1.1-3.5M1 2v2.5h2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="icon-btn danger" id="delete-list-btn" title="Delete list" style="display:none">`
  );

  // Wire up refresh button before closing script
  html = html.replace(
    'init();\n  </script>',
    `document.getElementById('refresh-btn').addEventListener('click', async () => {
      if (activeList) { await switchList(activeList); } else { await init(); }
    });
    init();
  </script>`
  );

  res.send(html);
});

app.use(express.static('public'));

app.use((req, res, next) => {
  if (req.path.startsWith('/chess')) return next();
  const token = req.headers['x-token'];
  if (token !== TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

app.get('/lists', (req, res) => {
  const files = fs.readdirSync(LISTS_DIR).filter(f => f.endsWith('.md'));
  res.json(files.map(f => f.replace('.md', '')));
});

app.get('/list/:name', (req, res) => {
  const file = path.join(LISTS_DIR, req.params.name + '.md');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  res.send(fs.readFileSync(file, 'utf8'));
});

app.put('/list/:name', (req, res) => {
  const file = path.join(LISTS_DIR, req.params.name + '.md');
  fs.writeFileSync(file, req.body.content, 'utf8');
  res.json({ ok: true });
});

app.delete('/list/:name', (req, res) => {
  const file = path.join(LISTS_DIR, req.params.name + '.md');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(file);
  res.json({ ok: true });
});

app.get('/meta/:name', (req, res) => {
  const file = path.join(LISTS_DIR, req.params.name + '.json');
  if (!fs.existsSync(file)) return res.json({ D: 0, A: 0, W: 0, P: 0 });
  try { res.json(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch { res.json({ D: 0, A: 0, W: 0, P: 0 }); }
});

app.put('/meta/:name', (req, res) => {
  const file = path.join(LISTS_DIR, req.params.name + '.json');
  const { D = 0, A = 0, W = 0, P = 0 } = req.body;
  fs.writeFileSync(file, JSON.stringify({ D, A, W, P }), 'utf8');
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
