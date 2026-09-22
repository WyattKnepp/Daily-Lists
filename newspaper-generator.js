const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { google } = require('googleapis');

// ============ CONFIG ============
const CONFIG = {
  weather: { location: 'Morton+IL+61550' },
  sleeper: {
    userId: '1083222158068797440',
    leagueId: '1250151812028182528',
    leagueName: 'Perry Dynasty',
    rosterFile: path.join(__dirname, 'newspaper/roster-snapshot.json')
  },
  sports: {
    // Google News RSS - most reliable source
    teams: [
      { name: 'Red Wings', league: 'NHL', query: 'Detroit+Red+Wings+NHL' },
      { name: 'Cowboys', league: 'NFL', query: 'Dallas+Cowboys+NFL' },
      { name: 'Tennessee Vols', league: 'NCAAF', query: 'Tennessee+Volunteers+football' },
      { name: 'Cardinals', league: 'MLB', query: 'St+Louis+Cardinals+MLB' }
    ]
  },
  calendar: {
    credentialsPath: '/home/openclaw/.openclaw/workspace/.credentials/google-service-account.json',
    calendars: {
      main: 'wyattjoeknepp@gmail.com',
      group: '0565c94cabd30d8efe08dd2332134240d02a7729a22572afecd1ef96c8d3764c@group.calendar.google.com'
    }
  },
  output: {
    html: path.join(__dirname, 'newspaper/index.html'),
    pdf: path.join(__dirname, 'newspaper/daily.pdf')
  }
};

// ============ UTILITIES ============
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    const req = client.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...options.headers
      },
      timeout: 15000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const newUrl = res.headers.location.startsWith('http') 
          ? res.headers.location 
          : `${urlObj.protocol}//${urlObj.host}${res.headers.location}`;
        return fetch(newUrl, options).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function fetchJson(url) {
  return fetch(url).then(data => JSON.parse(data));
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Chicago'
  });
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Chicago'
  });
}

// Parse simple RSS/XML
function parseRSS(xml) {
  const items = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  
  for (const item of itemMatches.slice(0, 20)) {
    const title = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || '';
    const desc = item.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/)?.[1] || '';
    const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
    
    if (title) {
      items.push({ 
        title: title.replace(/<[^>]+>/g, '').trim(),
        description: desc.replace(/<[^>]+>/g, '').trim(),
        date: pubDate ? new Date(pubDate) : null
      });
    }
  }
  return items;
}

// ============ DATA FETCHERS ============

async function getWeather() {
  try {
    const data = await fetch(`https://wttr.in/${CONFIG.weather.location}?format=j1`);
    const json = JSON.parse(data);
    const current = json.current_condition[0];
    const today = json.weather[0];
    
    return {
      temp: current.temp_F,
      condition: current.weatherDesc[0].value.trim(),
      high: today.maxtempF,
      low: today.mintempF,
      chanceOfRain: today.hourly[4]?.chanceofrain || '0'
    };
  } catch (e) {
    console.error('Weather error:', e.message);
    return null;
  }
}

async function getSportsNews() {
  const results = [];
  
  // Important keywords - things that matter
  const importantKeywords = [
    'trade', 'traded', 'trading', 'signs', 'signed', 'contract', 'deal', 'extension',
    'fired', 'hired', 'coach', 'manager', 'retires', 'retirement',
    'injured', 'injury', 'surgery', 'out for', 'ruled out', 'acl', 'torn', 'broken',
    'arrested', 'suspended', 'dies', 'dead', 'death', 'passed away', 'dies at',
    'draft', 'pick', 'prospect', 'acquisition', 'release', 'released', 'waived', 'cut',
    'playoff', 'championship', 'super bowl', 'world series', 'stanley cup',
    'record', 'historic', 'first', 'breaks', 'all-time', 'free agent'
  ];
  
  // Skip these - game recaps and daily noise
  const skipPatterns = [
    'game recap', 'game story', 'highlights', 'box score', 'prediction',
    'odds', 'betting', 'fantasy', 'dfs', 'picks', 'lineup', 'start/sit',
    'watch live', 'live stream', 'how to watch', 'preview'
  ];
  
  for (const team of CONFIG.sports.teams) {
    const teamNews = [];
    
    try {
      const url = `https://news.google.com/rss/search?q=${team.query}&hl=en-US&gl=US&ceid=US:en`;
      console.log(`Fetching ${team.name} news...`);
      const rssData = await fetch(url);
      const items = parseRSS(rssData);
      
      for (const item of items.slice(0, 15)) { // Check top 15 results
        if (teamNews.length >= 2) break; // Max 2 stories per team
        
        const titleLower = item.title.toLowerCase();
        
        // Skip noise
        if (skipPatterns.some(p => titleLower.includes(p))) continue;
        
        // Must be important
        const isImportant = importantKeywords.some(k => titleLower.includes(k));
        if (!isImportant) continue;
        
        // Clean up title (remove " - Source" suffix)
        let title = item.title.replace(/ - [^-]+$/, '').trim();
        
        teamNews.push({ title });
      }
    } catch (e) {
      console.error(`News error for ${team.name}:`, e.message);
    }
    
    results.push({
      name: team.name,
      league: team.league,
      news: teamNews
    });
  }
  
  return results;
}

async function getFantasyPlayerNews() {
  try {
    const rosters = await fetchJson(`https://api.sleeper.app/v1/league/${CONFIG.sleeper.leagueId}/rosters`);
    const userRoster = rosters.find(r => r.owner_id === CONFIG.sleeper.userId || 
      (r.co_owners && r.co_owners.includes(CONFIG.sleeper.userId)));
    
    if (!userRoster) return null;
    
    const allPlayers = await fetchJson('https://api.sleeper.app/v1/players/nfl');
    
    // Only show significant injury news, not just "Questionable"
    const significantInjuries = [];
    const significantStatuses = ['IR', 'Out', 'Doubtful', 'PUP', 'Sus'];
    
    for (const playerId of userRoster.players || []) {
      const player = allPlayers[playerId];
      if (player && player.injury_status && significantStatuses.includes(player.injury_status)) {
        significantInjuries.push({
          player: player.full_name,
          status: player.injury_status,
          notes: player.injury_notes || '',
          type: 'injury'
        });
      }
    }
    
    return {
      leagueName: CONFIG.sleeper.leagueName,
      news: significantInjuries.length > 0 ? significantInjuries : null
    };
    
  } catch (e) {
    console.error('Fantasy news error:', e.message);
    return null;
  }
}

async function getTechNews() {
  try {
    const topIds = await fetchJson('https://hacker-news.firebaseio.com/v0/topstories.json');
    const stories = [];
    
    // Major tech keywords - releases, big news, policy
    const majorKeywords = [
      'claude', 'gpt', 'llm', 'model', 'anthropic', 'openai', 'gemini',
      'android', 'ios', 'linux', 'windows', 'ported', 'released', 'launches',
      'shutdown', 'shuts down', 'acquired', 'raises', 'ipo', 'billion',
      'fbi', 'doj', 'ftc', 'sec ', 'eu ', 'banned', 'antitrust', 'regulation',
      'breakthrough', 'first', 'new', 'open source', 'open weights',
      'ai ', 'local model', 'running'
    ];
    
    // Noise to skip
    const skipPatterns = [
      'hiring', 'ama', 'ask hn', 'show hn', 'who is', 'looking for',
      'thoughts on', 'review of', 'tutorial', 'guide', 'how to',
      'i built', 'i made', 'why i', 'how i', 'my new'
    ];
    
    for (const id of topIds.slice(0, 40)) {
      if (stories.length >= 2) break;
      
      try {
        const story = await fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        if (!story || !story.title) continue;
        
        const titleLower = story.title.toLowerCase();
        
        // Skip noise
        if (skipPatterns.some(p => titleLower.includes(p))) continue;
        
        // High score stories (>500) with major keywords
        const hasMajorKeyword = majorKeywords.some(k => titleLower.includes(k));
        
        if (story.score >= 500 && hasMajorKeyword) {
          stories.push({
            title: story.title,
            points: story.score
          });
        }
      } catch (e) { /* skip */ }
    }
    
    return stories;
  } catch (e) {
    console.error('Tech news error:', e.message);
    return [];
  }
}

async function getGlobalPolitics() {
  const stories = [];
  
  try {
    // Use Google News for world news
    const url = 'https://news.google.com/rss/search?q=war+OR+tariff+OR+sanctions+OR+invasion+when:2d&hl=en-US&gl=US&ceid=US:en';
    console.log('Fetching world politics...');
    const rssData = await fetch(url);
    const items = parseRSS(rssData);
    
    // Only major geopolitical keywords
    const majorKeywords = [
      'war', 'invasion', 'invades', 'troops deployed', 'military strike', 'airstrike',
      'ukraine', 'russia', 'china', 'taiwan', 'nato', 'missile', 'nuclear',
      'tariff', 'sanctions', 'embargo', 'trade war',
      'coup', 'martial law', 'state of emergency',
      'supreme court rules', 'impeach', 'assassination'
    ];
    
    // Skip noise
    const skipPatterns = [
      'opinion', 'editorial', 'analysis:', 'what to know', 'explainer',
      'live updates', 'live blog'
    ];
    
    for (const item of items.slice(0, 20)) {
      if (stories.length >= 2) break;
      
      const titleLower = item.title.toLowerCase();
      
      // Skip noise
      if (skipPatterns.some(p => titleLower.includes(p))) continue;
      
      // Must have major keyword
      if (!majorKeywords.some(k => titleLower.includes(k))) continue;
      
      // Clean title
      let title = item.title.replace(/ - [^-]+$/, '').trim();
      
      stories.push({ title });
    }
  } catch (e) {
    console.error('Politics error:', e.message);
  }
  
  return stories;
}

async function getCalendarEvents() {
  try {
    const credentials = JSON.parse(fs.readFileSync(CONFIG.calendar.credentialsPath, 'utf8'));
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth });
    
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    const events = [];
    
    for (const [name, calendarId] of Object.entries(CONFIG.calendar.calendars)) {
      try {
        const result = await calendar.events.list({
          calendarId,
          timeMin: now.toISOString(),
          timeMax: tomorrow.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 10
        });
        
        if (result.data.items) {
          for (const event of result.data.items) {
            const start = event.start.dateTime ? new Date(event.start.dateTime) : new Date(event.start.date);
            const isToday = start.toDateString() === now.toDateString();
            events.push({
              title: event.summary,
              time: event.start.dateTime ? formatTime(start) : 'All Day',
              isToday
            });
          }
        }
      } catch (e) {
        console.error(`Calendar error for ${name}:`, e.message);
      }
    }
    
    // Sort by time, today first
    events.sort((a, b) => {
      if (a.isToday !== b.isToday) return a.isToday ? -1 : 1;
      return 0;
    });
    
    return events.filter(e => e.isToday); // Only today's events
  } catch (e) {
    console.error('Calendar error:', e.message);
    return [];
  }
}

async function getComic() {
  try {
    // XKCD has a reliable API
    const data = await fetchJson('https://xkcd.com/info.0.json');
    return {
      title: data.title,
      img: data.img,
      alt: data.alt,
      source: 'XKCD'
    };
  } catch (e) {
    console.error('Comic error:', e.message);
    return null;
  }
}

// ============ HTML GENERATION ============

function generateNewspaperHTML(data) {
  const { weather, calendar, techNews, politics, sportsNews, fantasyNews, comic, generatedAt } = data;
  
  // Build articles for summary
  const articles = [];
  let num = 1;
  
  techNews.forEach(s => articles.push({ num: num++, section: 'TECH', title: s.title }));
  politics.forEach(s => articles.push({ num: num++, section: 'WORLD', title: s.title }));
  sportsNews.filter(s => s.news?.length).forEach(sport => {
    sport.news.forEach(n => articles.push({ num: num++, section: sport.league, title: n.title }));
  });
  if (fantasyNews?.news) {
    fantasyNews.news.forEach(n => articles.push({ num: num++, section: 'FANTASY', title: `${n.player}: ${n.status}` }));
  }

  const dateStr = formatDate(generatedAt);
  
  // Check what content we have
  const hasSports = sportsNews.some(s => s.news?.length > 0);
  const hasFantasy = fantasyNews?.news?.length > 0;
  const hasTech = techNews.length > 0;
  const hasPolitics = politics.length > 0;
  const hasCalendar = calendar.length > 0;
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Daily Briefing - ${dateStr}</title>
  <style>
    @page { size: letter; margin: 0.5in; }
    @media print {
      .no-print { display: none !important; }
      body { width: 100%; padding: 0; }
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: 'Times New Roman', Georgia, serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #000;
      background: #fff;
      max-width: 8in;
      margin: 0 auto;
      padding: 0.25in;
    }
    
    .print-btn {
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 10px 20px;
      background: #000;
      color: #fff;
      border: none;
      cursor: pointer;
      font-family: sans-serif;
      font-size: 14px;
    }
    .print-btn:hover { background: #333; }
    
    .masthead {
      text-align: center;
      border-bottom: 3px double #000;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    
    .masthead h1 {
      font-size: 32pt;
      font-weight: bold;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    
    .masthead .tagline {
      font-size: 9pt;
      font-style: italic;
      margin: 3px 0;
    }
    
    .masthead .date-line {
      font-size: 9pt;
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #000;
      padding-top: 4px;
      margin-top: 4px;
    }
    
    .weather-bar {
      background: #f5f5f5;
      padding: 6px 10px;
      margin-bottom: 12px;
      font-size: 9pt;
      display: flex;
      justify-content: space-between;
      border: 1px solid #000;
    }
    
    .summary-box {
      border: 2px solid #000;
      padding: 10px;
      margin-bottom: 12px;
    }
    
    .summary-box h2 {
      font-size: 11pt;
      text-transform: uppercase;
      border-bottom: 1px solid #000;
      padding-bottom: 4px;
      margin-bottom: 8px;
      text-align: center;
    }
    
    .summary-item {
      font-size: 9pt;
      margin: 3px 0;
    }
    
    .summary-item sup { font-size: 7pt; margin-right: 2px; }
    
    .columns {
      display: flex;
      gap: 15px;
    }
    
    .column {
      flex: 1;
      border-left: 1px solid #000;
      padding-left: 12px;
    }
    
    .column:first-child {
      border-left: none;
      padding-left: 0;
      padding-right: 12px;
    }
    
    .section { margin-bottom: 15px; }
    
    .section h3 {
      font-size: 10pt;
      text-transform: uppercase;
      letter-spacing: 1px;
      border-bottom: 1px solid #000;
      padding-bottom: 2px;
      margin-bottom: 6px;
    }
    
    .article { margin-bottom: 10px; }
    
    .article-title {
      font-weight: bold;
      font-size: 10pt;
    }
    
    .article-title sup { font-size: 7pt; font-weight: normal; }
    
    .article-body {
      font-size: 9pt;
      margin-top: 2px;
    }
    
    .calendar-item {
      font-size: 9pt;
      margin: 2px 0;
    }
    
    .calendar-time { font-weight: bold; }
    
    .comic-section {
      margin-top: 15px;
      text-align: center;
      border-top: 2px solid #000;
      padding-top: 8px;
    }
    
    .comic-section h3 {
      font-size: 9pt;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    
    .comic-section img {
      max-width: 100%;
      max-height: 2.5in;
    }
    
    .comic-caption {
      font-size: 8pt;
      font-style: italic;
      margin-top: 4px;
      color: #333;
    }
    
    .empty-note {
      font-style: italic;
      color: #666;
      font-size: 9pt;
      text-align: center;
      padding: 10px;
    }
    
    .nothing-section {
      text-align: center;
      padding: 30px;
      font-style: italic;
    }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save PDF</button>

  <div class="masthead">
    <h1>The Daily Briefing</h1>
    <div class="tagline">Quality over quantity. If it matters, it's here.</div>
    <div class="date-line">
      <span>Morton, Illinois</span>
      <span>${dateStr}</span>
      <span>Personal Edition</span>
    </div>
  </div>
  
  ${weather ? `
  <div class="weather-bar">
    <span><strong>WEATHER:</strong> ${weather.condition}</span>
    <span>High ${weather.high}° / Low ${weather.low}°</span>
    <span>Rain: ${weather.chanceOfRain}%</span>
  </div>
  ` : ''}
  
  ${articles.length > 0 ? `
  <div class="summary-box">
    <h2>In This Edition</h2>
    ${articles.map(a => `
      <div class="summary-item"><sup>${a.num}</sup> <strong>${a.section}:</strong> ${a.title}</div>
    `).join('')}
  </div>
  ` : ''}
  
  <div class="columns">
    <div class="column">
      ${hasCalendar ? `
      <div class="section">
        <h3>📅 Today</h3>
        ${calendar.map(e => `
          <div class="calendar-item"><span class="calendar-time">${e.time}</span> — ${e.title}</div>
        `).join('')}
      </div>
      ` : ''}
      
      ${hasTech ? `
      <div class="section">
        <h3>Technology</h3>
        ${techNews.map(story => `
          <div class="article">
            <div class="article-title"><sup>${articles.find(a => a.title === story.title)?.num || ''}</sup> ${story.title}</div>
          </div>
        `).join('')}
      </div>
      ` : ''}
      
      ${hasPolitics ? `
      <div class="section">
        <h3>World Affairs</h3>
        ${politics.map(story => `
          <div class="article">
            <div class="article-title"><sup>${articles.find(a => a.title === story.title)?.num || ''}</sup> ${story.title}</div>
          </div>
        `).join('')}
      </div>
      ` : ''}
    </div>
    
    <div class="column">
      ${hasSports ? `
      <div class="section">
        <h3>Sports</h3>
        ${sportsNews.filter(s => s.news?.length > 0).map(sport => `
          <div class="article">
            <div class="article-title">${sport.name}</div>
            ${sport.news.map(n => `<div class="article-body">• ${n.title}</div>`).join('')}
          </div>
        `).join('')}
      </div>
      ` : ''}
      
      ${hasFantasy ? `
      <div class="section">
        <h3>Fantasy: ${fantasyNews.leagueName}</h3>
        ${fantasyNews.news.map(n => `
          <div class="article">
            <div class="article-title">${n.player}</div>
            <div class="article-body">${n.status}${n.notes ? ': ' + n.notes : ''}</div>
          </div>
        `).join('')}
      </div>
      ` : ''}
      
      ${!hasSports && !hasFantasy ? `
      <div class="empty-note">No significant sports or fantasy news today.</div>
      ` : ''}
    </div>
  </div>
  
  ${!hasTech && !hasPolitics && !hasSports && !hasFantasy && !hasCalendar ? `
  <div class="nothing-section">
    <p>Nothing significant to report today.</p>
    <p>Enjoy the quiet.</p>
  </div>
  ` : ''}
  
  ${comic ? `
  <div class="comic-section">
    <h3>${comic.source}: ${comic.title}</h3>
    <img src="${comic.img}" alt="${comic.title}">
    <div class="comic-caption">${comic.alt}</div>
  </div>
  ` : ''}
  
</body>
</html>`;
}

// ============ MAIN ============

async function generate() {
  console.log('=== Daily Briefing Generator ===');
  console.log('Started at:', new Date().toISOString());
  const generatedAt = new Date();
  
  console.log('\n[1/7] Weather...');
  const weather = await getWeather();
  console.log(weather ? `  ✓ ${weather.condition}, ${weather.high}°/${weather.low}°` : '  ✗ Failed');
  
  console.log('\n[2/7] Calendar...');
  const calendar = await getCalendarEvents();
  console.log(`  ✓ ${calendar.length} events today`);
  
  console.log('\n[3/7] Tech News...');
  const techNews = await getTechNews();
  console.log(`  ✓ ${techNews.length} significant stories`);
  techNews.forEach(s => console.log(`    - ${s.title.substring(0, 60)}...`));
  
  console.log('\n[4/7] World Politics...');
  const politics = await getGlobalPolitics();
  console.log(`  ✓ ${politics.length} significant stories`);
  politics.forEach(s => console.log(`    - ${s.title.substring(0, 60)}...`));
  
  console.log('\n[5/7] Sports News...');
  const sportsNews = await getSportsNews();
  sportsNews.forEach(s => {
    console.log(`  ${s.name}: ${s.news?.length || 0} stories`);
    s.news?.forEach(n => console.log(`    - ${n.title.substring(0, 50)}...`));
  });
  
  console.log('\n[6/7] Fantasy Player News...');
  const fantasyNews = await getFantasyPlayerNews();
  console.log(`  ✓ ${fantasyNews?.news?.length || 0} significant updates`);
  
  console.log('\n[7/7] Comic...');
  const comic = await getComic();
  console.log(comic ? `  ✓ ${comic.source}: "${comic.title}"` : '  ✗ Failed');
  
  console.log('\n--- Generating Output ---');
  const html = generateNewspaperHTML({
    weather,
    calendar,
    techNews,
    politics,
    sportsNews,
    fantasyNews,
    comic,
    generatedAt
  });
  
  fs.writeFileSync(CONFIG.output.html, html);
  console.log(`HTML: ${CONFIG.output.html}`);
  console.log('\nDone! Open /newspaper/ in browser and use Print button to save as PDF.');
}

generate().catch(console.error);
