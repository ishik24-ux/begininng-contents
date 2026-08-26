self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{}}catch(error){}
  event.waitUntil(self.registration.showNotification(data.title||'Beginning教材サイト',{
    body:data.body||'新しいお知らせがあります',
    icon:'/icon-192.png',
    badge:'/icon-192.png',
    data:{url:data.url||'/admin/login'},
    tag:data.tag||'beginning-notification'
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    const target=new URL(event.notification.data?.url||'/admin/login',self.location.origin).href;
    const existing=list.find(client=>client.url===target);
    return existing?existing.focus():clients.openWindow(target);
  }));
});
