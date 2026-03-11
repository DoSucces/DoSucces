// GoSuccess – Netlify Serverless Function
// Path: netlify/functions/stats.js
// Endpoint: /.netlify/functions/stats
//
// Calls the Roblox API directly from Netlify's servers.
// No CORS proxies needed — fast, reliable, and private.

const PLACE_IDS = [8287908355, 17247995332, 117685246722846, 128641742072134];

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 25000; // 25 seconds

async function rGet(url) {
  const r = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "GoSuccess/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function getUniverseIds() {
  const data = await rGet(
    `https://games.roblox.com/v1/games/multiget-place-details?placeIds=${PLACE_IDS.join(",")}`
  );
  return data.map((p) => ({ placeId: p.placeId, universeId: p.universeId }));
}

async function getFavorites(uid) {
  try {
    const d = await rGet(`https://games.roblox.com/v1/games/${uid}/favorites/count`);
    return d.favoritesCount || 0;
  } catch {
    return 0;
  }
}

exports.handler = async function () {
  const headers = {
    "Access-Control-Allow-Origin": "https://gosuccess.net",
    "Access-Control-Allow-Methods": "GET",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=25",
  };

  // Serve cache if still fresh
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) {
    return { statusCode: 200, headers, body: JSON.stringify(_cache) };
  }

  try {
    const places = await getUniverseIds();
    const uids = places.map((p) => p.universeId);

    // Fetch game stats + all favorites in parallel
    const [gamesData, ...favs] = await Promise.all([
      rGet(`https://games.roblox.com/v1/games?universeIds=${uids.join(",")}`),
      ...uids.map(getFavorites),
    ]);

    const games = gamesData.data.map((g, i) => ({
      placeId: places[i].placeId,
      universeId: uids[i],
      visits: g.visits || 0,
      playing: g.playing || 0,
      favorites: favs[i] || 0,
    }));

    _cache = { ok: true, games, ts: Date.now() };
    _cacheTime = Date.now();

    return { statusCode: 200, headers, body: JSON.stringify(_cache) };
  } catch (err) {
    // Return error info but don't crash — site uses fallbacks
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
