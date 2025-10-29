// minimal proxy for demo (normalize & return demo data if no provider)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const LRU = require('lru-cache');

const app = express();
app.use(cors());
app.use(express.json());
const cache = new LRU({ max: 500, maxAge: 1000 * 60 * 10 });

const PROVIDER_SEARCH_URL = process.env.PROVIDER_SEARCH_URL || '';
const PROVIDER_CARD_URL   = process.env.PROVIDER_CARD_URL   || '';

function setCache(k,v){ cache.set(k,v); }
function getCache(k){ return cache.get(k); }

async function fetchProvider(url){
  const res = await fetch(url);
  if (!res.ok) throw new Error('provider error '+res.status);
  return res.json();
}

function mapSearchItem(item){
  return {
    id: item.id || item.cardId || item.code || item._id || item.name,
    name: item.name || item.title || 'Unknown',
    set: item.set || item.setName || '',
    number: item.number || item.card_number || '',
    edition: item.edition || '',
    language: item.lang || item.language || 'EN',
    image: item.image || item.image_url || ''
  };
}

function mapCardDetail(raw){
  return {
    id: raw.id || raw.cardId || raw.name,
    name: raw.name || raw.title || 'Unknown',
    set: raw.set || raw.setName || '',
    number: raw.number || raw.card_number || '',
    edition: raw.edition || '',
    language: raw.language || 'EN',
    image: raw.image || raw.image_url || '',
    prices: raw.prices || { currency:'EUR', low:null, mid:null, high:null, history:[] },
    sources: raw.sources || []
  };
}

const DEMO_DB = [
  {
    id: "g1",
    name: "Gym Leader Charizard",
    set: "Leader's Blaze",
    number: "001/100",
    edition: "1st",
    language: "EN",
    image: "https://via.placeholder.com/420x600.png?text=Charizard",
    prices: { currency: "EUR", low: 18.5, mid: 24.99, high: 32, history: [12,14,18,22,24.99] },
    sources: [{ name: "Demo", price: 24.99, ts: new Date().toISOString() }]
  }
];

app.get('/search', async (req,res) => {
  const q = String(req.query.q||'').trim();
  if (!q) return res.json([]);
  const key = 's:'+q;
  const cached = getCache(key); if (cached) return res.json(cached);
  if (!PROVIDER_SEARCH_URL){
    const hits = DEMO_DB.filter(c => (c.name+' '+c.set+' '+c.number).toLowerCase().includes(q.toLowerCase()));
    setCache(key, hits);
    return res.json(hits);
  }
  try {
    const url = new URL(PROVIDER_SEARCH_URL);
    url.searchParams.set('q', q);
    const data = await fetchProvider(url.toString());
    const arr = Array.isArray(data) ? data : data.results || data.items || [];
    const mapped = arr.map(mapSearchItem).slice(0,50);
    setCache(key, mapped);
    res.json(mapped);
  } catch (e) {
    console.error(e);
    res.json([]);
  }
});

app.get('/cards/:id', async (req,res) => {
  const id = req.params.id;
  const key = 'c:'+id;
  const cached = getCache(key); if (cached) return res.json(cached);
  if (!PROVIDER_CARD_URL){
    const card = DEMO_DB.find(c=>c.id===id) || DEMO_DB[0];
    setCache(key, card);
    return res.json(card);
  }
  try {
    const url = PROVIDER_CARD_URL.replace('{id}', encodeURIComponent(id));
    const data = await fetchProvider(url);
    const mapped = mapCardDetail(data);
    setCache(key, mapped);
    res.json(mapped);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error:'failed' });
  }
});

app.get('/ping',(req,res)=>res.json({ok:true,ts:new Date().toISOString()}));

const port = process.env.PORT || 3000;
app.listen(port, ()=>console.log('listening',port));
