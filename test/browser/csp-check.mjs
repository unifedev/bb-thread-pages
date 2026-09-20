import http from "node:http";
import { chromium, firefox, webkit } from "playwright";
const CSP = ["default-src * data: blob: 'unsafe-inline' 'unsafe-eval'","script-src * data: blob: 'unsafe-inline' 'unsafe-eval'","frame-src 'none'","child-src blob:","object-src 'none'","base-uri 'self'","sandbox allow-scripts allow-forms"].join("; ");
const inner = `<!doctype html><base href="/files/b/"><script>
let sameOrigin='no'; try{ void parent.document.title; sameOrigin='YES'; }catch(e){}
let api='no'; try{ api = String(typeof parent.threadPage); }catch(e){ api='throws'; }
parent.postMessage({kind:'inner', origin: self.origin, sameOrigin, api, base: document.baseURI},'*');
addEventListener('message', e=>{ if(e.ports[0]) e.ports[0].postMessage('port-ok'); });
<\/script><p>inner</p>`;
const doc = `<!doctype html><title>host</title><script>window.threadPage={x:1};
const out={}; addEventListener('message', e=>{ if(e.data&&e.data.kind==='inner'){ Object.assign(out,e.data, {sourceOk: e.source===document.querySelector('#f').contentWindow, evOrigin:e.origin});
 const ch=new MessageChannel(); ch.port1.onmessage=m=>{out.port=m.data; parent.postMessage({kind:'result', out},'*');}; e.source.postMessage({k:1},'*',[ch.port2]); } });
addEventListener('DOMContentLoaded',()=>{ const f=document.createElement('iframe'); f.id='f'; f.setAttribute('sandbox','allow-scripts allow-forms'); f.srcdoc=${JSON.stringify(inner).replace(/</g,"\\u003c")}; document.body.appendChild(f);
 const g=document.createElement('iframe'); g.id='g'; g.srcdoc=${JSON.stringify(inner.replace("kind:'inner'","kind:'inner2'")).replace(/</g,"\\u003c")}; document.body.appendChild(g);
 addEventListener('message', e=>{ if(e.data&&e.data.kind==='inner2') parent.postMessage({kind:'result2', out:e.data},'*'); });
 const u=document.createElement('iframe'); u.src='/other'; u.onload=()=>parent.postMessage({kind:'urlframe',loaded:true},'*'); document.body.appendChild(u); });
<\/script><body>`;
const shell = `<!doctype html><title>shell</title><iframe sandbox="allow-scripts allow-forms" src="/doc"></iframe><script>window.results={}; addEventListener('message',e=>{ if(e.data&&e.data.kind) window.results[e.data.kind]=e.data; });</script>`;
const server = http.createServer((req,res)=>{ if(req.url==='/doc'){res.setHeader('content-security-policy',CSP);res.setHeader('content-type','text/html');res.end(doc);} else if(req.url==='/other'){res.setHeader('content-type','text/html');res.end('<p>other</p><script>parent.parent.postMessage({kind:"otherRan"},"*")</script>');} else {res.setHeader('content-type','text/html');res.end(shell);} });
await new Promise(r=>server.listen(0,'127.0.0.1',r)); const port=server.address().port;
for (const [name,engine] of [['chromium',chromium],['firefox',firefox],['webkit',webkit]]) {
  try { const b=await engine.launch(); const p=await b.newPage(); p.on("console",m=>console.log("  ["+name+"]",m.text())); p.on("pageerror",e=>console.log("  ["+name+" err]",e.message)); await p.goto(`http://127.0.0.1:${port}/`); await p.waitForTimeout(1500);
    console.log(name, JSON.stringify(await p.evaluate(()=>window.results))); await b.close(); } catch(e){ console.log(name,'ERROR',e.message.split('\n')[0]); }
}
server.close();
