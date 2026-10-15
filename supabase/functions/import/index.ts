// @ts-nocheck – bewusst reines JavaScript (ohne Typangaben), damit es sich auch im Browser testen lässt
// Supabase-Funktion "import": lädt eine Rezept-Webseite oder ein TikTok-Video und liest die Rezeptdaten aus.
//
// Webseiten: Rezeptdaten im Format Schema.org (JSON-LD), wie sie die meisten Rezeptseiten enthalten.
//            Fehlen sie, wird der Seitentext mitgeschickt (für die Aufbereitung durch Claude).
// TikTok:    die Videobeschreibung über die offizielle Einbettungs-Schnittstelle (oEmbed).
//            Was nur im Video gesprochen oder gezeigt wird, ist nicht auslesbar.
//
// Bewusst ohne Zusatzbibliotheken geschrieben, damit sie sich leicht prüfen lässt.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_PAGE_BYTES = 3_000_000;
const MAX_IMAGE_BYTES = 5_000_000;
const MAX_PAGE_TEXT = 15_000;
const MIN_PAGE_TEXT = 200; // weniger Text: kein Rezept auf der Seite
const TIMEOUT_MS = 10_000;

// Wie ein normaler Browser auftreten – manche Seiten liefern sonst nichts
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.5',
};

function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

// ---- Sicherheit ----

async function isSignedIn(req, env, fetchFn) {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const response = await fetchFn(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY },
  });
  if (!response.ok) return false;
  const user = await response.json();
  return Boolean(user?.id) && user.role === 'authenticated';
}

// Nur normale Internetadressen – keine internen Server, keine Adressen im eigenen Netz
export function isPublicUrl(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (!host.includes('.') && !host.includes(':')) return false;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return false;
  if (host.includes(':') && (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80'))) return false;
  return true;
}

// Laden mit Zeit- und Größenbegrenzung; prüft auch das Ziel nach Weiterleitungen
async function fetchLimited(url, fetchFn, maxBytes, extraHeaders = {}) {
  const response = await fetchFn(url, {
    headers: { ...BROWSER_HEADERS, ...extraHeaders },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const finalUrl = response.url || url;
  if (!isPublicUrl(finalUrl)) throw new Error('Diese Adresse kann nicht geladen werden.');
  if (!response.ok) throw new Error(`Die Seite antwortet mit Fehler ${response.status}.`);
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new Error('Die Seite ist zu groß.');
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) throw new Error('Die Seite ist zu groß.');
  return { response, finalUrl, buffer };
}

// ---- Texte aufräumen ----

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', deg: '°', frac12: '½', frac14: '¼', frac34: '¾' };

export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, code) => {
    if (code[0] === '#') {
      const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : match;
    }
    return ENTITIES[code] ?? match;
  });
}

// HTML-Tags entfernen, Leerraum zusammenfassen
export function cleanText(text) {
  return decodeEntities(String(text ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

// ---- Schema.org-Rezept auslesen ----

// Alle JSON-LD-Blöcke einer Seite
export function readJsonLd(html) {
  const blocks = [];
  const pattern = /<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      blocks.push(JSON.parse(match[1].trim()));
    } catch {
      // Manche Seiten haben fehlerhaftes JSON – überspringen
    }
  }
  return blocks;
}

const isRecipe = (node) => {
  const type = node?.['@type'];
  return type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
};

// Sucht das Rezept auch in Listen und "@graph"
export function findRecipe(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findRecipe(child);
      if (found) return found;
    }
    return null;
  }
  if (isRecipe(node)) return node;
  return findRecipe(node['@graph']) ?? findRecipe(node.mainEntity) ?? null;
}

// "PT1H30M" → 90
export function durationMinutes(text) {
  const match = String(text ?? '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!match || !match[0] || match[0] === 'P') return null;
  const minutes = Number(match[1] ?? 0) * 1440 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return minutes > 0 ? minutes : null;
}

// "4 Portionen", ["4", "4 servings"], 4 → 4
export function yieldNumber(value) {
  const list = Array.isArray(value) ? value : [value];
  for (const item of list) {
    const match = String(item ?? '').match(/\d+/);
    if (match && Number(match[0]) > 0 && Number(match[0]) < 100) return Number(match[0]);
  }
  return null;
}

// Zubereitung kann Text, Liste, HowToStep oder HowToSection sein → Liste von Schritten
export function flattenInstructions(value) {
  if (!value) return [];
  if (typeof value === 'string') {
    return cleanText(value).split(/\n+/).map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) return value.flatMap(flattenInstructions);
  if (typeof value === 'object') {
    if (value.itemListElement) return flattenInstructions(value.itemListElement);
    if (value.text) return flattenInstructions(value.text);
    if (value.name) return flattenInstructions(value.name);
  }
  return [];
}

function imageUrl(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return imageUrl(value[0]);
  return value.url ?? value.contentUrl ?? null;
}

function listOfWords(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(',');
  return list.map((word) => cleanText(word)).filter(Boolean);
}

export function recipeFromSchema(recipe) {
  const total = durationMinutes(recipe.totalTime);
  const parts = (durationMinutes(recipe.prepTime) ?? 0) + (durationMinutes(recipe.cookTime) ?? 0);
  return {
    title: cleanText(recipe.name),
    description: cleanText(recipe.description).slice(0, 1000),
    ingredients: (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : []).map(cleanText).filter(Boolean),
    steps: flattenInstructions(recipe.recipeInstructions),
    servings: yieldNumber(recipe.recipeYield),
    prep_time_minutes: total ?? (parts > 0 ? parts : null),
    keywords: [...listOfWords(recipe.keywords), ...listOfWords(recipe.recipeCategory), ...listOfWords(recipe.recipeCuisine)].slice(0, 20),
    image_url: imageUrl(recipe.image),
  };
}

// Inhalt eines Meta-Tags, z. B. og:title / og:image
function metaContent(html, property) {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`, 'i');
  const tag = html.match(pattern)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content) : null;
}

// Offizielle Adresse der Seite (<link rel="canonical">), sonst die geladene Adresse ohne Zusätze
// – damit dasselbe Rezept immer dieselbe Quelle hat
export function canonicalUrl(html, finalUrl) {
  const tag = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0];
  const href = tag?.match(/href=["']([^"']+)["']/i)?.[1];
  if (href) {
    try {
      const url = new URL(decodeEntities(href), finalUrl).href;
      if (isPublicUrl(url)) return url;
    } catch {
      // ungültige Angabe – geladene Adresse nehmen
    }
  }
  const url = new URL(finalUrl);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|ref$|si$)/i.test(key)) url.searchParams.delete(key);
  }
  return url.href;
}

// Seitentext ohne Skripte, Stile und Navigation (für Seiten ohne Rezeptdaten)
export function pageText(html) {
  const body = html
    .replace(/<(script|style|noscript|svg|nav|header|footer|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  return cleanText(body.replace(/<\/(p|div|li|h\d|tr)>/gi, '\n')).slice(0, MAX_PAGE_TEXT);
}

// ---- Laden ----

async function importWebPage(url, fetchFn) {
  const { finalUrl, buffer } = await fetchLimited(url, fetchFn, MAX_PAGE_BYTES, { Accept: 'text/html,application/xhtml+xml' });
  const html = new TextDecoder('utf-8').decode(buffer);
  const sourceUrl = canonicalUrl(html, finalUrl);
  const recipe = readJsonLd(html).map(findRecipe).find(Boolean);
  if (recipe) {
    const data = recipeFromSchema(recipe);
    if (data.image_url) data.image_url = new URL(data.image_url, finalUrl).href;
    return { kind: 'web', structured: true, source_url: sourceUrl, ...data, page_text: '' };
  }
  // Keine Rezeptdaten: Titel, Bild und Seitentext für Claude – aber nur, wenn überhaupt nennenswert Text da ist
  const text = pageText(html);
  if (text.length < MIN_PAGE_TEXT) throw new Error('Auf dieser Seite wurde kein Rezept gefunden.');
  const image = metaContent(html, 'og:image');
  return {
    kind: 'web',
    structured: false,
    source_url: sourceUrl,
    title: cleanText(metaContent(html, 'og:title') ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''),
    description: cleanText(metaContent(html, 'og:description') ?? ''),
    ingredients: [],
    steps: [],
    servings: null,
    prep_time_minutes: null,
    keywords: [],
    image_url: image ? new URL(image, finalUrl).href : null,
    page_text: text,
  };
}

export const isTikTok = (url) => /(^|\.)tiktok\.com$/i.test(new URL(url).hostname);

async function importTikTok(url, fetchFn) {
  // Kurzlinks (vm.tiktok.com/…) zuerst auflösen; Zusätze nach "?" weglassen (einheitliche Quelle)
  let videoUrl = url.split('?')[0];
  if (!/\/video\/\d+/.test(url)) {
    const { finalUrl } = await fetchLimited(url, fetchFn, MAX_PAGE_BYTES);
    videoUrl = finalUrl.split('?')[0];
  }
  const { buffer } = await fetchLimited(`https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`, fetchFn, 200_000);
  const data = JSON.parse(new TextDecoder().decode(buffer));
  const caption = cleanText(data.title ?? '');
  if (!caption) throw new Error('Dieses TikTok hat keine Beschreibung, aus der sich ein Rezept lesen lässt.');
  return {
    kind: 'tiktok',
    structured: false,
    source_url: videoUrl,
    title: '',
    description: caption,
    author: data.author_name ?? '',
    ingredients: [],
    steps: [],
    servings: null,
    prep_time_minutes: null,
    keywords: [],
    image_url: data.thumbnail_url ?? null,
    page_text: caption,
  };
}

// Bild laden und als Text (Base64) mitschicken, damit die App es wie ein eigenes Foto behandeln kann
async function loadImage(url, fetchFn) {
  if (!url || !isPublicUrl(url)) return null;
  try {
    const { response, buffer } = await fetchLimited(url, fetchFn, MAX_IMAGE_BYTES, { Accept: 'image/*' });
    const type = response.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return null;
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { type, data: btoa(binary) };
  } catch {
    return null; // Ohne Bild geht es auch
  }
}

// ---- Die eigentliche Funktion ----

export async function handleRequest(req, env, fetchFn = fetch) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return reply(405, { error: 'Nur POST erlaubt.' });
  if (!(await isSignedIn(req, env, fetchFn))) return reply(401, { error: 'Nicht angemeldet.' });

  let body;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Ungültige Anfrage.' });
  }
  const url = String(body?.url ?? '').trim();
  if (!isPublicUrl(url)) return reply(400, { error: 'Bitte einen gültigen Link (https://…) einfügen.' });

  try {
    const result = isTikTok(url) ? await importTikTok(url, fetchFn) : await importWebPage(url, fetchFn);
    result.image = await loadImage(result.image_url, fetchFn);
    return reply(200, result);
  } catch (error) {
    const message = error.name === 'TimeoutError' ? 'Die Seite hat zu lange nicht geantwortet.' : error.message;
    return reply(502, { error: message });
  }
}

if (typeof Deno !== 'undefined') {
  Deno.serve((req) =>
    handleRequest(req, {
      SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
      SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
    })
  );
}
