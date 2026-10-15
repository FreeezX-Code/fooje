// @ts-nocheck – bewusst reines JavaScript (ohne Typangaben), damit es sich auch im Browser testen lässt
// Supabase-Funktion "bring": trägt Zutaten in eure Bring!-Einkaufsliste ein.
//
// Einrichtung (siehe Anleitung im Chat): im Supabase-Dashboard unter "Edge Functions" eine Funktion
// mit dem Namen "bring" anlegen und diesen Text einfügen. Unter "Secrets" hinterlegen:
//   BRING_EMAIL      E-Mail des Bring!-Kontos für die App
//   BRING_PASSWORD   Passwort dieses Kontos
//   BRING_LIST_NAME  Name der gemeinsamen Liste (z. B. "Zuhause"); leer = Standardliste des Kontos
//
// Bring! hat keine offizielle Schnittstelle. Genutzt wird dieselbe wie von der Bring!-App
// (Vorbild: das Open-Source-Projekt "bring-api" für Home Assistant). Sie kann sich ändern.
//
// Bewusst ohne Zusatzbibliotheken geschrieben, damit sie sich leicht prüfen lässt.

const BRING_API = 'https://api.getbring.com/rest/';

// Feste Kopfzeilen wie in der Bring!-App (der Schlüssel ist öffentlich und in jeder App enthalten)
const BRING_HEADERS = {
  'X-BRING-API-KEY': 'cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp',
  'X-BRING-CLIENT': 'android',
  'X-BRING-APPLICATION': 'bring',
  'X-BRING-COUNTRY': 'DE',
};

const MAX_ITEMS = 100;

// Erlaubt Aufrufe aus dem Browser (die App liegt auf einer anderen Adresse als Supabase)
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Ist der Aufrufer ein angemeldeter Nutzer der App? (Der öffentliche Schlüssel allein reicht nicht.)
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

// Eingehende Liste prüfen: [{ name: "Nudeln", spec: "500 g" }, …]
function readItems(body) {
  if (!Array.isArray(body?.items)) return null;
  const items = body.items
    .map((item) => ({
      name: String(item?.name ?? '').trim().slice(0, 100),
      spec: String(item?.spec ?? '').trim().slice(0, 100),
    }))
    .filter((item) => item.name);
  return items.length > 0 && items.length <= MAX_ITEMS ? items : null;
}

async function bringLogin(env, fetchFn) {
  const response = await fetchFn(BRING_API + 'v2/bringauth', {
    method: 'POST',
    headers: { ...BRING_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: env.BRING_EMAIL, password: env.BRING_PASSWORD }).toString(),
  });
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new Error('Anmeldung bei Bring! fehlgeschlagen – E-Mail und Passwort in den Secrets prüfen.');
  }
  if (!response.ok) throw new Error(`Bring! antwortet beim Anmelden mit Fehler ${response.status}.`);
  const data = await response.json();
  return {
    headers: {
      ...BRING_HEADERS,
      Authorization: `${data.token_type ?? 'Bearer'} ${data.access_token}`,
      'X-BRING-USER-UUID': data.uuid,
      'X-BRING-PUBLIC-USER-UUID': data.publicUuid ?? '',
    },
    uuid: data.uuid,
    defaultListUuid: data.bringListUUID,
  };
}

// Liste nach Namen suchen (ohne Namen: Standardliste des Kontos)
async function findList(session, listName, fetchFn) {
  const response = await fetchFn(`${BRING_API}bringusers/${session.uuid}/lists`, { headers: session.headers });
  if (!response.ok) throw new Error(`Bring!-Listen konnten nicht geladen werden (Fehler ${response.status}).`);
  const { lists = [] } = await response.json();
  if (!listName) {
    const standard = lists.find((list) => list.listUuid === session.defaultListUuid);
    return { uuid: session.defaultListUuid, name: standard?.name ?? 'Standardliste' };
  }
  const match = lists.find((list) => list.name.trim().toLowerCase() === listName.trim().toLowerCase());
  if (!match) {
    const names = lists.map((list) => `„${list.name}“`).join(', ') || 'keine';
    throw new Error(`Bring!-Liste „${listName}“ nicht gefunden. Vorhanden: ${names}.`);
  }
  return { uuid: match.listUuid, name: match.name };
}

async function addItems(session, listUuid, items, fetchFn) {
  const changes = items.map((item) => ({
    accuracy: '0.0',
    altitude: '0.0',
    latitude: '0.0',
    longitude: '0.0',
    itemId: item.name,
    spec: item.spec,
    uuid: crypto.randomUUID(),
    operation: 'TO_PURCHASE',
  }));
  const response = await fetchFn(`${BRING_API}v2/bringlists/${listUuid}/items`, {
    method: 'PUT',
    headers: { ...session.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ changes, sender: '' }),
  });
  if (!response.ok) throw new Error(`Bring! hat die Zutaten nicht angenommen (Fehler ${response.status}).`);
}

// Die eigentliche Funktion. env und fetchFn sind austauschbar, damit sie sich testen lässt.
export async function handleRequest(req, env, fetchFn = fetch) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return reply(405, { error: 'Nur POST erlaubt.' });

  if (!(await isSignedIn(req, env, fetchFn))) return reply(401, { error: 'Nicht angemeldet.' });
  if (!env.BRING_EMAIL || !env.BRING_PASSWORD) {
    return reply(500, { error: 'Bring!-Zugangsdaten fehlen – BRING_EMAIL und BRING_PASSWORD in den Secrets eintragen.' });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Ungültige Anfrage.' });
  }
  const items = readItems(body);
  if (!items) return reply(400, { error: `Bitte 1 bis ${MAX_ITEMS} Zutaten schicken.` });

  try {
    const session = await bringLogin(env, fetchFn);
    const list = await findList(session, env.BRING_LIST_NAME, fetchFn);
    await addItems(session, list.uuid, items, fetchFn);
    return reply(200, { ok: true, count: items.length, list: list.name });
  } catch (error) {
    return reply(502, { error: error.message });
  }
}

// Auf dem Supabase-Server starten (im Testbrowser gibt es "Deno" nicht)
if (typeof Deno !== 'undefined') {
  Deno.serve((req) =>
    handleRequest(req, {
      SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
      SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
      BRING_EMAIL: Deno.env.get('BRING_EMAIL'),
      BRING_PASSWORD: Deno.env.get('BRING_PASSWORD'),
      BRING_LIST_NAME: Deno.env.get('BRING_LIST_NAME') ?? '',
    })
  );
}
