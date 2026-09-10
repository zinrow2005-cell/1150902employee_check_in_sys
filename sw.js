// W456 FIX392-R6-ORG1-H8
const CACHE='wts-employee-portal-current-20260910-fix392-r6-org1-h8';
const ASSETS=['./','index.html','style.css?v=4563926','app.js?v=4563926','config.js?v=4563926','manifest.webmanifest','assets/wts-logo-original.png','assets/wts-name-handwritten-white.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./'))));});
