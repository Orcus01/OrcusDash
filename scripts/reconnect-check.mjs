import assert from 'node:assert/strict';
import WebSocket from 'ws';
const clients=[];
async function connect(){
 const ws=new WebSocket(process.env.WS_URL??'ws://localhost:2567/ws');
 const client={ws,messages:[],listeners:new Set()};clients.push(client);
 ws.on('message',data=>{const message=JSON.parse(data.toString());client.messages.push(message);for(const listener of client.listeners)listener(message);});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});return client;
}
function wait(client,predicate,timeout=5000){
 const existing=client.messages.find(predicate);if(existing)return Promise.resolve(existing);
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client.listeners.delete(listener);reject(Error('Timed out waiting for server state'));},timeout);const listener=message=>{if(predicate(message)){clearTimeout(timer);client.listeners.delete(listener);resolve(message);}};client.listeners.add(listener);});
}
const send=(client,msg)=>client.ws.send(JSON.stringify(msg));
try {
 const a=await connect();send(a,{t:'create',name:'Reconnect A',color:0,mode:'killrace'});
 const joined=await wait(a,m=>m.t==='joined'),session=await wait(a,m=>m.t==='session');
 const b=await connect();send(b,{t:'join',code:joined.room.code,name:'Reconnect B',color:1});const bob=await wait(b,m=>m.t==='joined');
 send(a,{t:'loaded',mapId:joined.room.mapId});send(b,{t:'loaded',mapId:joined.room.mapId});
 await wait(a,m=>m.t==='room'&&m.canStart&&m.players.length===2);send(a,{t:'start'});
 await wait(a,m=>m.t==='room'&&m.phase==='playing');
 const before=(await wait(a,m=>m.t==='room'&&m.phase==='playing')).players.find(p=>p.id===joined.you);
 a.ws.terminate();
 const invalid=await connect();send(invalid,{t:'resume',token:'00000000-0000-0000-0000-000000000000'});assert.equal((await wait(invalid,m=>m.t==='error')).code,'NOT_FOUND');invalid.ws.close();
 const resumed=await connect();send(resumed,{t:'resume',token:session.token});const restored=await wait(resumed,m=>m.t==='joined');
 assert.equal(restored.you,joined.you);assert.equal(restored.room.code,joined.room.code);assert.equal(restored.room.mode,'killrace');
 assert.equal(restored.room.players.find(p=>p.id===joined.you).score,before.score);assert.equal(restored.room.players.filter(p=>!p.bot).length,2);
 assert.equal((await wait(resumed,m=>m.t==='ev'&&m.e.type==='respawn')).e.id,joined.you);
 send(resumed,{t:'leave'});await wait(b,m=>m.t==='room'&&m.hostId===bob.you);send(b,{t:'leave'});
 const expiring=await connect();send(expiring,{t:'create',name:'Expiry',color:0});await wait(expiring,m=>m.t==='joined');const expiryToken=(await wait(expiring,m=>m.t==='session')).token;expiring.ws.terminate();
 await new Promise(resolve=>setTimeout(resolve,15_500));
 const expired=await connect();send(expired,{t:'resume',token:expiryToken});assert.equal((await wait(expired,m=>m.t==='error')).code,'NOT_FOUND');
 console.log('Reconnect checks passed: same identity/room/mode/score, no duplicate seat, resumed spawn, invalid token rejection, immediate quit/host handoff, and expired seat cleanup.');
}finally{for(const c of clients){if(c.ws.readyState===WebSocket.OPEN){send(c,{t:'leave'});c.ws.close();}else c.ws.terminate();}}
