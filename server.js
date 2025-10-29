// --- Provider fetch + mapping for the API shape you provided ---
async function fetchProvider(rawUrl){
  const headers = {};
  if (process.env.PROVIDER_API_KEY){
    headers['Authorization'] = `Bearer ${process.env.PROVIDER_API_KEY}`;
  }
  const res = await fetch(rawUrl, { headers });
  if (!res.ok) {
    const txt = await res.text().catch(()=>'<no body>');
    throw new Error('provider error '+res.status+' '+txt);
  }
  return res.json();
}

function mapSearchItem(item){
  // maps one item from provider's data array to widget search result
  return {
    id: item.id || item.tcgplayerId || item.name,
    name: item.name || 'Unknown',
    set: item.set || '',
    number: item.number || '',
    edition: item.edition || '',
    language: item.language || 'EN',
    // try to find a variant image or fallback to empty string
    image: item.image || item['image-url'] || '',
    // include raw variants so detail view can pick prices later
    _rawVariants: item.variants || []
  };
}

function mapCardDetail(raw){
  // raw is expected to be a single item object (not wrapped) or provider product response
  const item = raw && raw.data && Array.isArray(raw.data) ? raw.data[0] : raw;
  const firstVariant = (item && item.variants && item.variants[0]) || null;
  const mid = firstVariant ? Number(firstVariant.price) : null;
  return {
    id: item.id || item.tcgplayerId || item.name,
    name: item.name || 'Unknown',
    set: item.set || '',
    number: item.number || '',
    edition: item.edition || '',
    language: item.language || 'EN',
    image: item.image || item['image-url'] || '',
    prices: {
      currency: 'USD',
      low: mid !== null ? mid : null,
      mid: mid !== null ? mid : null,
      high: mid !== null ? mid : null,
      history: []
    },
    sources: (item.variants || []).map(v => ({
      id: v.id || '',
      condition: v.condition || '',
      printing: v.printing || '',
      price: v.price || null,
      lastUpdated: v.lastUpdated ? new Date(v.lastUpdated * 1000).toISOString() : null
    }))
  };
}

// --- /search handler that uses provider response shape ---
app.get('/search', async (req,res) => {
  const q = String(req.query.q||'').trim();
  if (!q) return res.json([]);
  const key = 's:'+q;
  const cached = getCache(key); if (cached) return res.json(cached);

  if (!process.env.PROVIDER_SEARCH_URL){
    const hits = DEMO_DB.filter(c => (c.name+' '+c.set+' '+c.number).toLowerCase().includes(q.toLowerCase()));
    setCache(key, hits);
    return res.json(hits);
  }

  try {
    const url = new URL(process.env.PROVIDER_SEARCH_URL);
    url.searchParams.set('q', q);
    const data = await fetchProvider(url.toString());
    // provider returns { data: [ ... ] }
    const arr = data && data.data ? data.data : [];
    const mapped = arr.map(mapSearchItem).slice(0,50);
    setCache(key, mapped);
    res.json(mapped);
  } catch (e) {
    console.error(e);
    res.json([]);
  }
});

// --- /cards/:id handler that fetches single item (either provider supports id endpoint or we fallback) ---
app.get('/cards/:id', async (req,res) => {
  const id = req.params.id;
  const key = 'c:'+id;
  const cached = getCache(key); if (cached) return res.json(cached);

  if (!process.env.PROVIDER_CARD_URL){
    const card = DEMO_DB.find(c=>c.id===id) || DEMO_DB[0];
    setCache(key, card);
    return res.json(card);
  }

  try {
    const urlTemplate = process.env.PROVIDER_CARD_URL;
    const urlStr = urlTemplate.replace('{id}', encodeURIComponent(id));
    const data = await fetchProvider(urlStr);
    const mapped = mapCardDetail(data);
    setCache(key, mapped);
    res.json(mapped);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error:'failed', detail: String(e) });
  }
});
