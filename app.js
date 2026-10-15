// Einstiegspunkt der App. Hier kommen in den nächsten Schritten Login und Rezepte dazu.
console.log('App gestartet');

// Service Worker anmelden (macht die App installierbar und offline startfähig)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch((error) => {
    console.error('Service Worker konnte nicht angemeldet werden:', error);
  });
}
