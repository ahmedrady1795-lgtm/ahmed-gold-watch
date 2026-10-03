self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',e=>{e.notification.close();const target=e.notification?.data?.url||'/';e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(w=>{const same=w.find(c=>{try{return new URL(c.url).pathname===target;}catch{return false;}});return same?same.focus():self.clients.openWindow(target);}));});
