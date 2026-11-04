const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const os = require('os');
const path = require('path');
const {spawn, spawnSync} = require('child_process');
const {webcrypto} = require('crypto');

function historyResetTest() {
  const source = fs.readFileSync('js/court.js', 'utf8');
  const start = source.indexOf('  function resetCourtOnce(dryRun)');
  assert.ok(start >= 0);
  const migration = source.slice(start, source.indexOf('  resetCourtOnce(false);', start));
  const court = {'court-count':'17','court-saved':'12500','court-appeals':'[{"item":"test"}]','court-used':'{"used":[1]}','court-sound':'1','court-pet-faces':'{}','court-history-reset-20261104':'done','court-archive':'[{"number":"old"}]'};
  const preserved = {'calc-history':'[123]','rates-cache':'{}','other-data':'keep'};
  const storage = new Map(Object.entries({...court,...preserved}));
  const ctx = {localStorage:{get length(){return storage.size;},key:i=>Array.from(storage.keys())[i],getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
  vm.createContext(ctx);
  vm.runInContext(migration,ctx);
  const before = [...storage];
  const preview = vm.runInContext('resetCourtOnce(true)',ctx);
  assert.equal(preview.length,Object.keys(court).length);
  assert.deepEqual([...storage],before);
  vm.runInContext('resetCourtOnce(false)',ctx);
  for(const key of Object.keys(court)) assert.equal(storage.has(key),false);
  for(const [key,value] of Object.entries(preserved)) assert.equal(storage.get(key),value);
  storage.set('court-archive','[{"number":"new"}]');
  storage.set('court-saved','500');
  vm.runInContext('resetCourtOnce(false)',ctx);
  assert.equal(storage.get('court-archive'),'[{"number":"new"}]');
  assert.equal(storage.get('court-saved'),'500');
  vm.runInNewContext(migration+'resetCourtOnce(false);',{localStorage:{getItem(){throw Error('unavailable');}}});
  console.log('Full reset: dry run, all court keys cleared once, other sections and new cases preserved');
}

async function clientTest() {
  const source = fs.readFileSync('js/court.js', 'utf8');
  const setup = source.slice(source.indexOf('  const sharedCounter'), source.indexOf('  const WAIT_DAYS'));
  const next = source.slice(source.indexOf('  async function nextNumber()'), source.indexOf('  // Подать:'));
  let allocated = 0, loseResponse = true;
  const numbers = new Map();
  const ctx = {location:{protocol:'https:'}, crypto:webcrypto, AbortController, setTimeout, clearTimeout,
    renderStats(){}, async fetch(url, options) {
      assert.equal(url, 'api/court-counter.php');
      const id = JSON.parse(options.body).requestId;
      if (!numbers.has(id)) numbers.set(id, ++allocated);
      if (loseResponse) { loseResponse = false; throw Error('lost response'); }
      return {ok:true, async json(){return {number:numbers.get(id),count:allocated};}};
    }};
  vm.createContext(ctx);
  vm.runInContext(setup + next + '\nthis.next = nextNumber; this.newCase = () => { numberRequest = null; };',ctx);
  await assert.rejects(ctx.next());
  const now = new Date();
  const prefix = String(now.getFullYear()).slice(2) + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '-';
  assert.equal(await ctx.next(), prefix + '001');
  assert.equal(allocated,1);
  ctx.newCase();
  assert.equal(await ctx.next(),prefix + '002');
  ctx.fetch = async () => ({ok:false});
  await assert.rejects(ctx.next());
  assert.equal(allocated,2);
  console.log('Client: lost response retry, separate sessions and server failure OK');
}

async function serverTest(php) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'nosugarfin-counter-'));
  const publicDir = path.join(root,'public_html');
  fs.mkdirSync(path.join(publicDir,'api'),{recursive:true});
  fs.copyFileSync('api/court-counter.php',path.join(publicDir,'api/court-counter.php'));
  // Seed an old database: reset must clear it and restart the sequence at one.
  const privateDir = path.join(root,'nosugarfin-private');
  fs.mkdirSync(privateDir);
  const seedCode = "$db=new PDO('sqlite:'.$argv[1]);$db->exec('CREATE TABLE cases (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL UNIQUE)');$db->exec(\"INSERT INTO cases(id, request_id) VALUES (41, 'old')\");";
  const seed = spawnSync(php,['-n','-d','extension_dir='+path.join(path.dirname(php),'ext'),'-d','extension=pdo_sqlite','-r',seedCode,path.join(privateDir,'court.sqlite')],{windowsHide:true,encoding:'utf8'});
  assert.equal(seed.status,0,seed.stderr);
  const listener = require('net').createServer();
  await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const port = listener.address().port;
  await new Promise(resolve=>listener.close(resolve));
  const server = spawn(php,['-n','-d','extension_dir='+path.join(path.dirname(php),'ext'),'-d','extension=pdo_sqlite','-S','127.0.0.1:'+port,'-t',publicDir],{windowsHide:true,stdio:'ignore'});
  let processError;
  server.on('error',error=>{processError=error;});
  const url='http://127.0.0.1:'+port+'/api/court-counter.php';
  const request = id => fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Court-Request':'1'},body:JSON.stringify({requestId:id})});
  try {
    let ready=false;
    for(let i=0;i<60;i++) {
      if(processError)throw processError;
      try { const r=await fetch(url); if(r.ok){assert.equal((await r.json()).count,0);ready=true;break;} } catch {}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(ready,'PHP server did not start');
    assert.equal((await fetch(url,{method:'POST'})).status,403);
    assert.equal((await request('bad')).status,400);
    const responses = await Promise.all(Array.from({length:20},(_,i)=>request((i+1).toString(16).padStart(32,'0'))));
    const values=await Promise.all(responses.map(r=>r.json()));
    assert.equal(new Set(values.map(v=>v.number)).size,20);
    assert.equal((await (await request('1'.padStart(32,'0'))).json()).number,1);
    assert.equal((await (await fetch(url)).json()).count,20);
    assert.ok(fs.existsSync(path.join(root,'nosugarfin-private','court.sqlite')));
    assert.equal((await fetch(url+'/../../nosugarfin-private/court.sqlite')).status,404);
    console.log('Server: old count 41 reset, sequence restarted, 20 allocations retained across repeated requests, duplicate retry and private storage OK');
  } finally { server.kill(); }
}
(async()=>{historyResetTest();await clientTest();if(process.argv[2])await serverTest(process.argv[2]);else console.log('Pass PHP executable as argument to test server.');})().catch(e=>{console.error(e);process.exitCode=1;});
