/* A cache belongs to this app and scope; unrelated PWAs are never deleted. */
const PREFIX = "violin-ear-trainer";
const CACHE_NAME = PREFIX + ':' + encodeURIComponent(self.registration.scope) + ':3.0.10';
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./vendor/WebAudioFontPlayer.js",
  "./i18n.js",
  "./training-core.js",
  "./answer-timer.js",
  "./ap-science.js",
  "./training-tracker.js",
  "./ap-focus-model.js",
  "./relative-course.js",
  "./unified-model.js",
  "./unified-copy.js",
  "./app.js",
  "./vendor/0000_JCLive_sf2_file.js",
  "./vendor/0400_JCLive_sf2_file.js"
];
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'})));
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const owned=PREFIX+':'+encodeURIComponent(self.registration.scope)+':';
  for(const name of await caches.keys()) if(name.startsWith(owned)&&name!==CACHE_NAME) await caches.delete(name);
  await self.clients.claim();
 })());
});
// The page asks for this only after the learner taps "Update" outside a round.
self.addEventListener('message',event=>{
 if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||!event.request.url.startsWith(self.registration.scope))return;
 const url=new URL(event.request.url);
 const scopePath=new URL(self.registration.scope).pathname;
 const appPage=event.request.mode==='navigate' && (url.pathname===scopePath || url.pathname===scopePath+'index.html');
 if(url.search && !appPage)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE_NAME),cached=await cache.match(appPage ? './index.html' : event.request);
  if(cached)return cached;
  try{return await fetch(event.request);}
  catch(_){return event.request.mode==='navigate' ? (await cache.match('./index.html')||Response.error()) : Response.error();}
 })());
});
