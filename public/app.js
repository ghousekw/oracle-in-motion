/* ===== Oracle in Motion: app (navigation, lesson player, subtitles, voice, notes, playground) =====
   Needs: Motion (motion.js), SIM (dist/sim.js), LESSONS (+ HI, DIAG, EXTRA, AUDIO / AUDIO2 when present). */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const escRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const pad2=n=>String(n).padStart(2,'0');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const RM=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
const store={get(k,d){try{const v=localStorage.getItem('oim.'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}},set(k,v){try{localStorage.setItem('oim.'+k,JSON.stringify(v));}catch(e){}}};
const md=s=>esc(s).replace(/`([^`]+)`/g,'<code>$1</code>');

/* ---------- theme (applied first to avoid a flash) */
const root=document.documentElement;
(function(){const t=store.get('theme',null);if(t==='dark'||t==='light')root.setAttribute('data-theme',t);})();
function effTheme(){const a=root.getAttribute('data-theme');if(a==='dark'||a==='light')return a;return window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
function paintThemeBtn(){const d=effTheme()==='dark';$('themeIcon').innerHTML=d?'<circle cx="8" cy="8" r="3.2" fill="currentColor"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>':'<path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7z" fill="currentColor"/>';
  $('bTheme').setAttribute('aria-label',d?'Light mode on karo':'Dark mode on karo');}
$('bTheme').addEventListener('click',()=>{const n=effTheme()==='dark'?'light':'dark';root.setAttribute('data-theme',n);store.set('theme',n);paintThemeBtn();});
if(window.matchMedia)try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',paintThemeBtn);}catch(e){}
paintThemeBtn();

/* ---------- lesson data */
const DBA_SECTIONS=['Shuruaat','Oracle Database Architecture','Database Administrative Tasks','Managing Tablespaces','Users & Privileges','Roles','User Profiles','Data Migration','Database Links','Useful Tips'];
const NXC=c=>c==='py'||c==='forms'||c==='reports';
const COURSES=[
  {id:'sql',name:'SQL Basics',secs:['Shuruaat','Querying data','Sorting data','Filtering data','Joining tables','Grouping data','Subquery','Set Operators','Pivoting data','Limiting rows','Managing table structures','Data types','Constraints','Modifying data','Temporary tables','Views','Indexes','Synonyms','Sequences']},
  {id:'fn',name:'Functions',secs:['Comparison functions','String functions','Date functions','Aggregate functions','Analytic functions']},
  {id:'plsql',name:'PL/SQL',secs:['Getting started','Conditional control','Loops','SELECT INTO','Exception handlers','Records','Cursors','Procedures and functions','Packages','Triggers','Collections']},
  {id:'py',name:'Python + Oracle',secs:['Python + Oracle']},
  {id:'forms',name:'Oracle Forms 12c',secs:['Administration','Development']},
  {id:'reports',name:'Oracle Reports 12c',secs:['Administration','Development']},
  {id:'dba',name:'DBA',secs:DBA_SECTIONS.slice(1)},
  {id:'linux',name:'Linux (Zero to Expert)',secs:['Shuruaat aur Filesystem','Files Padhna, Dhoondhna aur Links','Pipes, Redirection aur Log Analysis','User Management, Permissions aur sudo','Process Management aur System Monitoring','Storage, Disks, Mounts aur Backups','Networking, Ports aur Remote Access','Package Management aur Automation','Enterprise Hardening aur Production Incidents']}
];
if(typeof HI!=='undefined')LESSONS.forEach(l=>{if(l.v2)return;const h=HI[l.id];if(!h)return;
  ['summary','simple','points','words'].forEach(k=>{if(h[k])l[k]=h[k];});
  if(h.say)h.say.forEach((s,i)=>{if(l.steps[i])l.steps[i].say=s;});
  if(h.check)l.check=Object.assign({},l.check,h.check);});
const byId={};
LESSONS.forEach(l=>{if(byId[l.id])console.warn('duplicate lesson id',l.id);byId[l.id]=l;});
if(typeof EXTRA!=='undefined')Object.keys(EXTRA).forEach(id=>{const l=byId[id];if(!l)return;if(EXTRA[id].title){l.origTitle=l.title;l.title=EXTRA[id].title;}['syntax','scenario','setup','tasks','mistakes','codeTitle'].forEach(k=>{if(EXTRA[id][k]!=null)l[k]=EXTRA[id][k];});});
const trD=s=>(typeof DIAG!=='undefined'&&s!=null&&DIAG[s]!=null)?DIAG[s]:s;
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
LESSONS.forEach((l,i)=>{l.ord=i;
  if(!l.v2){if(l.id==='basics'){l.course='sql';l.secName='Shuruaat';}else{l.course='dba';l.secName=DBA_SECTIONS[l.sec]||'DBA';}}
  else l.secName=l.sec||'Lessons';});
const ALL=[];
COURSES.forEach(c=>{
  const ls=LESSONS.filter(l=>l.course===c.id);
  const order=c.secs.slice();
  ls.forEach(l=>{const k=norm(l.secName);let i=order.findIndex(s=>norm(s)===k);
    if(i<0)i=order.findIndex(s=>norm(s).startsWith(k)||k.startsWith(norm(s)));
    if(i<0){order.push(l.secName);i=order.length-1;}l.secIdx=i;l.secName=order[i];});
  ls.sort((a,b)=>a.secIdx-b.secIdx||a.ord-b.ord);
  c.lessons=ls;c.order=order;ls.forEach((l,i)=>{l.n=i+1;l.c=c;ALL.push(l);});
});
ALL.forEach((l,i)=>{l.gi=i;});

/* ---------- progress */
let done=new Set(store.get('done',[]));
try{const old=JSON.parse(localStorage.getItem('dbaMotion.done')||'[]');old.forEach(x=>done.add(x));}catch(e){}
let passed=new Set(store.get('tasks',[]));
const saveDone=()=>store.set('done',[...done]);

/* ---------- sidebar */
const app=$('app');
let cur=null,navCourse=null;const openSecs=new Set();
function courseRows(){
  $('courses').innerHTML=COURSES.filter(c=>c.lessons.length).map(c=>{const d=c.lessons.filter(l=>done.has(l.id)).length;
    return '<button class="course" role="tab" type="button" data-c="'+c.id+'" aria-selected="'+(navCourse===c.id)+'"><b>'+esc(c.name)+'</b><span>'+d+' / '+c.lessons.length+'</span><i style="--p:'+(d/c.lessons.length*100).toFixed(1)+'%"></i></button>';}).join('');
  $('courses').querySelectorAll('.course').forEach(b=>b.addEventListener('click',()=>{navCourse=b.dataset.c;$('q').value='';courseRows();buildNav();$('nav').scrollTop=0;}));
}
const tick='<svg class="tick" width="14" height="14" viewBox="0 0 14 14" aria-label="dekh liya"><path d="M2.5 7.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const li=l=>'<li><a href="#'+l.id+'" data-id="'+l.id+'"'+(done.has(l.id)?' class="done"':'')+(cur&&cur.id===l.id?' aria-current="page"':'')+'><span class="n">'+pad2(l.n)+'</span><span>'+esc(l.title)+'</span>'+tick+'</a></li>';
function buildNav(){
  const q=$('q').value.trim().toLowerCase();let h='';
  if(q){const words=q.split(/\s+/);
    COURSES.forEach(c=>{const hits=c.lessons.filter(l=>{const hay=(l.title+' '+(l.origTitle||'')+' '+l.id+' '+l.secName+' '+(l.summary||'')).toLowerCase();return words.every(w=>hay.includes(w));});
      if(hits.length)h+='<div class="grp">'+esc(c.name)+'</div><ul>'+hits.slice(0,60).map(li).join('')+'</ul>';});
    if(!h)h='<p class="none">"'+esc(q)+'" se koi lesson nahi mila.</p>';}
  else{const c=COURSES.find(x=>x.id===navCourse)||COURSES[0];
    c.order.forEach((s,si)=>{const ls=c.lessons.filter(l=>l.secIdx===si);if(!ls.length)return;const key=c.id+'|'+si;
      const d=ls.filter(l=>done.has(l.id)).length;
      h+='<details data-k="'+esc(key)+'"'+(openSecs.has(key)?' open':'')+'><summary>'+esc(s)+'<span class="c">'+d+'/'+ls.length+'</span></summary><ul>'+ls.map(li).join('')+'</ul></details>';});}
  const nav=$('nav');nav.innerHTML=h;
  nav.querySelectorAll('details').forEach(d=>d.addEventListener('toggle',()=>{if(d.open)openSecs.add(d.dataset.k);else openSecs.delete(d.dataset.k);}));
}
function refreshNav(){courseRows();buildNav();const a=$('nav').querySelector('a[aria-current="page"]');if(a){const n=$('nav');const top=a.offsetTop-n.clientHeight/3;if(a.offsetTop<n.scrollTop||a.offsetTop>n.scrollTop+n.clientHeight-30)n.scrollTop=top;}}
$('q').addEventListener('input',buildNav);
$('q').addEventListener('keydown',e=>{if(e.key==='Escape'){$('q').value='';buildNav();}});
$('nav').addEventListener('click',e=>{const a=e.target.closest('a[data-id]');if(!a)return;closeDrawer();if(mode!=='lesson')setMode('lesson');});
function closeDrawer(){app.classList.remove('drawer');$('scrim').hidden=true;}
$('bMenu').addEventListener('click',()=>{const o=!app.classList.contains('drawer');app.classList.toggle('drawer',o);$('scrim').hidden=!o;if(o)setTimeout(()=>{const a=$('nav').querySelector('a[aria-current="page"]');if(a)a.focus();},60);});
$('scrim').addEventListener('click',closeDrawer);

/* ---------- stage */
const svg=$('stage');
const stage=Motion.create(svg,{tr:s=>(cur&&!cur.v2)?trD(s):s,reducedMotion:RM});
let step=0,stepStart=0,stepEnd=0,advanceAt=Infinity,playing=false,speed=1,lastT=0;
let sentIdx=0,sents=[],sentW=[];
const splitSay=s=>{const m=s.replace(/`[^`]*`/g,x=>x.replace(/[.!?]/g,'\u00b7'));const out=[];const re=/(?<=[.!?])\s+/g;let last=0,r;while((r=re.exec(m))){out.push(s.slice(last,r.index));last=r.index+r[0].length;}out.push(s.slice(last));return out.filter(x=>x.trim());};
const splitVo=s=>String(s||'').split(/(?<=[\u0964?!])\s*/).filter(x=>x.trim());
const readMs=t=>Math.max(3200,String(t).length*55);

/* caption with glossary terms */
function termRes(l){return(l.words||[]).map((w,i)=>{const core=String(w[0]).split(' / ')[0].replace(/\s*\(.*\)$/,'').trim();if(!core)return null;
  const head=/^[A-Za-z0-9_]/.test(core)?'(^|[^A-Za-z0-9_$])':'()';const tail=/[A-Za-z0-9_]$/.test(core)?'(?=$|[^A-Za-z0-9_])':'';
  return{i,re:new RegExp(head+'('+escRe(core)+'(?:s|es)?)'+tail,'i'),len:core.length};}).filter(Boolean).sort((a,b)=>b.len-a.len);}
let TR=[];
function richText(text,used){/* escape text and wrap the first use of each glossary term */
  const marks=[];
  for(const t of TR){if(used.has(t.i))continue;const m=t.re.exec(text);if(!m)continue;const st=m.index+m[1].length,en=st+m[2].length;
    if(marks.some(k=>st<k.en&&en>k.st))continue;marks.push({st,en,i:t.i});used.add(t.i);}
  marks.sort((a,b)=>a.st-b.st);let o='',p=0;
  for(const k of marks){o+=esc(text.slice(p,k.st))+'<span class="gl" tabindex="0" data-w="'+k.i+'">'+esc(text.slice(k.st,k.en))+'</span>';p=k.en;}
  return o+esc(text.slice(p));}
function richCaption(s,used){return s.split('`').map((part,i)=>i%2?'<code>'+richText(part,used)+'</code>':richText(part,used)).join('');}
function captionHtml(say,used){used=used||new Set();return splitSay(say).map((x,i)=>'<span class="sn" data-s="'+i+'"><span class="tx">'+richCaption(x,used)+'</span></span>').join(' ');}
function sizeCaption(){if(!cur)return;const cap=$('caption');const m=$('measure');m.className='caption';m.style.width=cap.clientWidth+'px';let mx=0;
  for(const st of cur.steps){m.innerHTML=captionHtml(st.say||'');mx=Math.max(mx,m.offsetHeight);}cap.style.minHeight=mx?mx+'px':'';m.innerHTML='';}
let rsT=0;window.addEventListener('resize',()=>{cancelAnimationFrame(rsT);rsT=requestAnimationFrame(sizeCaption);});
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>sizeCaption());

function setSentence(i,force){i=clamp(i,0,Math.max(0,sents.length-1));if(i===sentIdx&&!force)return;sentIdx=i;
  $('caption').querySelectorAll('.sn').forEach(el=>el.classList.toggle('now',+el.dataset.s===i));}
function sentFromFrac(fr){let acc=0;for(let i=0;i<sentW.length;i++){acc+=sentW[i];if(fr<acc)return i;}return sentW.length-1;}

/* step UI */
function updateStepUI(){
  const n=cur.steps.length,st=cur.steps[step];
  $('stepN').textContent='STEP '+(step+1)+' / '+n;
  sents=splitSay(st.say||'');const tot=sents.reduce((a,x)=>a+x.length,0)||1;sentW=sents.map(x=>x.length/tot);
  const used=new Set();$('caption').innerHTML=captionHtml(st.say||'',used);sentIdx=-1;setSentence(0,true);
  document.querySelectorAll('#words .w').forEach(d=>d.classList.toggle('on',used.has(+d.dataset.i)));
  const dots=$('dots').children;for(let i=0;i<dots.length;i++){dots[i].className='dot'+(i<step?' seen':'')+(i===step?' on':'');dots[i].setAttribute('aria-current',i===step?'step':'false');}
  $('bPrev').disabled=step===0;
  stage.setMeta(('Lesson '+pad2(cur.n)+' / '+pad2(cur.c.lessons.length)+' · step '+(step+1)+' / '+n).toUpperCase());
  svg.setAttribute('aria-label',cur.title+'. Step '+(step+1)+': '+String(st.say||'').replace(/`/g,''));
  paintPlayState();
}
function paintPlayState(){$('caption').classList.toggle('all',!playing);}
function goStep(k,animate){
  if(!cur)return;k=clamp(k,0,cur.steps.length-1);
  const len=stage.goStep(k,animate);step=k;stepStart=stage.clock;stepEnd=stage.clock+(animate?len:0);
  advanceAt=Math.max(stepEnd+1300,stage.clock+readMs(cur.steps[k].say||''));
  setupCode(k,animate);$('endcard').hidden=true;updateStepUI();
  stopVoice();if(playing&&voiceOn)speakStep();
}
function advance(){if(step<cur.steps.length-1)goStep(step+1,true);else finish();}
let autoNext=store.get('autoNext',false),autoTimer=0;
function cancelAutoNext(){if(autoTimer){clearInterval(autoTimer);autoTimer=0;if($('endGo'))$('endGo').textContent='Agla lesson';}}
function paintAuto(){const b=$('bAuto');if(!b)return;b.setAttribute('aria-pressed',autoNext?'true':'false');}
if($('bAuto')){$('bAuto').addEventListener('click',()=>{autoNext=!autoNext;store.set('autoNext',autoNext);cancelAutoNext();paintAuto();});paintAuto();}
function finish(){stopVoice();setPlaying(false);advanceAt=Infinity;cancelAutoNext();
  if(!done.has(cur.id)){done.add(cur.id);saveDone();refreshNav();}
  const nx=ALL[cur.gi+1];$('endNext').textContent=nx?'Agla: '+nx.title:'Saare lessons ho gaye. Shabaash!';
  $('endGo').hidden=!nx;if(nx){$('endGo').href='#'+nx.id;$('endGo').textContent='Agla lesson';}$('endPractice').hidden=!(cur.tasks&&cur.tasks.length);$('endcard').hidden=false;
  const dots=$('dots').children;for(let i=0;i<dots.length;i++)dots[i].className='dot seen';
  if(autoNext&&nx&&mode==='lesson'){let rem=3;$('endGo').textContent='Agla ('+rem+'s)...';autoTimer=setInterval(()=>{if(mode!=='lesson'||$('endcard').hidden||!autoNext){cancelAutoNext();return;}rem--;if(rem<=0){cancelAutoNext();location.hash=nx.id;}else $('endGo').textContent='Agla ('+rem+'s)...';},1000);}}
function setPlaying(p){playing=p;$('bPlay').setAttribute('aria-label',p?'Pause':'Play');
  $('playIcon').innerHTML=p?'<path d="M3.5 2h3.2v12H3.5zM9.3 2h3.2v12H9.3z"/>':'<path d="M4 2l10 6-10 6z"/>';paintPlayState();}

/* ---------- code card */
const SQLKW=new Set(('SELECT FROM WHERE AND OR NOT NULL IS IN LIKE ESCAPE BETWEEN EXISTS ANY ALL SOME ORDER BY GROUP HAVING AS DISTINCT UNIQUE ASC DESC NULLS FIRST LAST FETCH NEXT ROWS ROW ONLY OFFSET PERCENT TIES WITH JOIN INNER LEFT RIGHT FULL OUTER CROSS NATURAL ON USING UNION INTERSECT MINUS CASE WHEN THEN ELSE END INSERT INTO VALUES UPDATE SET DELETE MERGE MATCHED TRUNCATE CREATE ALTER DROP RENAME TABLE VIEW INDEX SEQUENCE SYNONYM PUBLIC PRIVATE TEMPORARY GLOBAL COMMIT ROLLBACK SAVEPOINT PRESERVE CONSTRAINT PRIMARY FOREIGN KEY REFERENCES CHECK DEFAULT CASCADE CONSTRAINTS ADD MODIFY COLUMN COLUMNS UNUSED DISABLE ENABLE VALIDATE NOVALIDATE GENERATED ALWAYS IDENTITY VIRTUAL INVISIBLE VISIBLE PIVOT UNPIVOT FOR OVER PARTITION RANGE UNBOUNDED PRECEDING FOLLOWING CURRENT DECLARE BEGIN EXCEPTION RAISE RETURN RETURNING LOOP WHILE EXIT CONTINUE GOTO IF ELSIF CURSOR OPEN CLOSE BULK COLLECT FORALL TYPE RECORD OF VARRAY PACKAGE BODY FUNCTION PROCEDURE TRIGGER BEFORE AFTER INSTEAD EACH NEW OLD REPLACE CONSTANT ROWTYPE EXECUTE IMMEDIATE OUT NOCOPY DETERMINISTIC PRAGMA AUTONOMOUS_TRANSACTION OTHERS NUMBER VARCHAR2 VARCHAR CHAR NCHAR NVARCHAR2 CLOB BLOB NCLOB DATE TIMESTAMP INTERVAL YEAR MONTH DAY HOUR MINUTE SECOND ZONE LOCAL TIME INTEGER INT FLOAT BINARY_FLOAT BINARY_DOUBLE BOOLEAN TRUE FALSE PLS_INTEGER BINARY_INTEGER LONG RAW ROWID SYSDATE SYSTIMESTAMP ROWNUM LEVEL PRIOR CONNECT START GRANT REVOKE TO IDENTIFIED USER ROLE ROLES PROFILE TABLESPACE DATAFILE TEMPFILE SIZE AUTOEXTEND MAXSIZE UNLIMITED INCLUDING CONTENTS DATAFILES KEEP STARTUP SHUTDOWN NOMOUNT MOUNT DATABASE ABORT TRANSACTIONAL NORMAL FORCE QUOTA ACCOUNT LOCK UNLOCK PASSWORD EXPIRE ADMIN OPTION NONE LIMIT ORGANIZATION EXTERNAL DIRECTORY ACCESS PARAMETERS LOCATION FIELDS TERMINATED LINK SYSTEM BIGFILE SMALLFILE PRIVILEGES EXEC SYSDBA DESCRIBE SHOW SERVEROUTPUT PURGE FLASHBACK RECYCLEBIN EXPLAIN PLAN COMMENT MODE SHARE EXCLUSIVE NOWAIT WAIT SKIP LOCKED LOAD DATA READ WRITE ORACLE_LOADER').split(' '));
const PYKW=new Set('import from as def return if elif else for while in not and or is None True False with try except finally raise class pass break continue lambda yield global nonlocal assert del async await'.split(' '));
function hlSql(s){
  let out='';const pm=s.match(/^(SQL>|RMAN>|LSNRCTL>|\$|C:\\[^>]*>|\s+\d+\s\s)\s?/);
  if(pm){out+='<span class="s-pr">'+esc(pm[0])+'</span>';s=s.slice(pm[0].length);}
  if(/^\s*(ORA-|TNS-|SP2-|PLS-|ERROR)/.test(s))return out+'<span class="s-err">'+esc(s)+'</span>';
  if(!pm&&/^\s*(Database altered|Database closed|Database dismounted|ORACLE instance|Tablespace |User |Grant succeeded|Revoke succeeded|Role |Profile |Table |View |Session altered|Database link |Directory |Synonym |Load completed|Job |PL\/SQL procedure|Index |Password changed|Procedure created|Function created|Package |Trigger |Sequence |Commit complete|Rollback complete|\d+ rows? |no rows)/.test(s))return out+'<span class="s-ok">'+esc(s)+'</span>';
  const re=/(--.*$)|(\/\*.*?(?:\*\/|$))|('(?:[^']|'')*'?)|("[^"]*"?)|(\b\d+(?:\.\d+)?[KMGkmg]?\b)|(:[A-Za-z_][\w$#]*)|([A-Za-z_][\w$#]*)(\s*\()?|(\s+)|([\s\S])/g;let m;
  while((m=re.exec(s))){
    if(m[1]||m[2])out+='<span class="s-com">'+esc(m[1]||m[2])+'</span>';
    else if(m[3]||m[4])out+='<span class="s-str">'+esc(m[3]||m[4])+'</span>';
    else if(m[5])out+='<span class="s-num">'+esc(m[5])+'</span>';
    else if(m[6])out+='<span class="s-fn">'+esc(m[6])+'</span>';
    else if(m[7]){const w=m[7],U=w.toUpperCase();
      if(SQLKW.has(U))out+='<span class="s-kw">'+esc(w)+'</span>';
      else if(m[8]||/^(DBA|ALL|USER|V\$|SESSION|DATABASE|ROLE)_[A-Z_$]+$/i.test(w)||/^V\$/i.test(w)||/^DBMS_/i.test(w))out+='<span class="s-fn">'+esc(w)+'</span>';
      else out+=esc(w);
      if(m[8])out+=esc(m[8]);}
    else out+=esc(m[9]||m[10]);
  }
  return out;
}
function hlPy(s){
  let out='';const pm=s.match(/^(>>>|\.\.\.|\$)\s?/);if(pm){out+='<span class="s-pr">'+esc(pm[0])+'</span>';s=s.slice(pm[0].length);}
  if(/^(Traceback|\w+Error:|oracledb\.\w+Error)/.test(s))return out+'<span class="s-err">'+esc(s)+'</span>';
  const re=/(#.*$)|([rbfRBF]{0,2}"""[\s\S]*?(?:"""|$)|[rbfRBF]{0,2}'(?:[^'\\]|\\.)*'?|[rbfRBF]{0,2}"(?:[^"\\]|\\.)*"?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)(\s*\()?|(\s+)|([\s\S])/g;let m;
  while((m=re.exec(s))){
    if(m[1])out+='<span class="s-com">'+esc(m[1])+'</span>';
    else if(m[2])out+='<span class="s-str">'+esc(m[2])+'</span>';
    else if(m[3])out+='<span class="s-num">'+esc(m[3])+'</span>';
    else if(m[4]){const w=m[4];if(PYKW.has(w))out+='<span class="s-kw">'+esc(w)+'</span>';else if(m[5])out+='<span class="s-fn">'+esc(w)+'</span>';else out+=esc(w);if(m[5])out+=esc(m[5]);}
    else out+=esc(m[6]||m[7]);
  }
  return out;
}
const SHKW=new Set(('if then else elif fi for in while do done case esac function select until return exit echo printf read test export unset readonly local set shift trap wait eval exec source alias unalias ulimit cd pwd ls cat head tail less more grep egrep fgrep sed awk cut tr sort uniq wc find xargs tee gzip gunzip tar rsync ssh scp ssh-keygen sudo su useradd usermod userdel groupadd groupmod groupdel passwd id whoami w who last ps top htop pgrep pkill kill killall systemctl journalctl service chkconfig dmesg uname hostname uptime free vmstat iostat mpstat df du mount umount lsblk blkid fdisk mkfs parted ip ifconfig ping traceroute netstat ss lsof curl wget dig nslookup host iptables ufw firewalld crontab at sysctl timedatectl date history').split(' '));
function hlSh(s){
  let out='';const pm=s.match(/^((?:[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+:[^#$]*[#$]|\$|#)\s?)/);
  if(pm){out+='<span class="s-pr">'+esc(pm[0])+'</span>';s=s.slice(pm[0].length);}
  if(/^\s*(bash:|chmod:|chown:|kill:|grep:|sed:|awk:|tar:|rsync:|systemctl:|journalctl:|curl:|ssh:|crontab:|find:|cat:|mkdir:|rm:|cp:|mv:|mount:|umount:|df:|du:|ss:|lsof:|ip:|ps:|free:|top:|vmstat:|dmesg:|Error|error|Failed|failed|Permission denied|No such file or directory|command not found|Operation not permitted)/i.test(s))return out+'<span class="s-err">'+esc(s)+'</span>';
  if(!pm&&/^\s*(Created symlink|Removed symlink|Active: active|OK|success)/i.test(s))return out+'<span class="s-ok">'+esc(s)+'</span>';
  const re=/(#.*$)|('(?:[^']|'')*'?)|("(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_][\w.-]*\b)|(-{1,2}[A-Za-z0-9_-]+)|(\s+)|([\s\S])/g;
  let m;
  while((m=re.exec(s))){
    if(m[1])out+='<span class="s-com">'+esc(m[1])+'</span>';
    else if(m[2]||m[3])out+='<span class="s-str">'+esc(m[2]||m[3])+'</span>';
    else if(m[4])out+='<span class="s-num">'+esc(m[4])+'</span>';
    else if(m[5]){const w=m[5];if(SHKW.has(w))out+='<span class="s-kw">'+esc(w)+'</span>';else out+=esc(w);}
    else if(m[6])out+='<span class="s-fn">'+esc(m[6])+'</span>';
    else out+=esc(m[7]||m[8]);
  }
  return out;
}
const hlLine=(s,lang)=>{if(lang==='linux'||lang==='sh')return hlSh(s);if(lang==='py'||lang===true)return hlPy(s);return hlSql(s);};
const hlBlock=(text,lang)=>String(text).split('\n').map(x=>hlLine(x,lang)).join('\n');
function codeLinesOf(st){const c=st.code;if(c==null)return[];const out=[];
  (Array.isArray(c)?c:[c]).forEach(x=>{if(typeof x==='number')out.push(x);else{const m=String(x).match(/^(\d+)-(\d+)$/);if(m)for(let i=+m[1];i<=+m[2];i++)out.push(i);else out.push(+x);}});return out;}
let codeSt=null;
function setupCode(k,animate){
  const lines=cur.code||[];const status=lines.map(()=>'pending');
  for(let i=0;i<k;i++)codeLinesOf(cur.steps[i]).forEach(j=>{status[j]='done';});
  const act=codeLinesOf(cur.steps[k]);act.forEach(j=>{status[j]='active';});
  const typed=lines.map(t=>({len:t.length,t0:0,dur:0}));
  if(animate&&!RM){let d=0;act.forEach(j=>{if(!lines[j])return;const len=lines[j].length;const dur=Math.min(1200,len*20+60);typed[j]={len,t0:stage.clock+d,dur};d+=dur+60;});}
  codeSt={status,typed,key:'',scrolled:false};
}
function renderCode(){
  if(!codeSt||!cur)return;const lines=cur.code||[];const now=stage.clock;
  const ns=codeSt.typed.map(t=>t.dur?Math.round(clamp((now-t.t0)/t.dur,0,1)*t.len):t.len);
  const key=codeSt.status.join()+'|'+ns.join();if(key===codeSt.key)return;codeSt.key=key;const lang=cur.course==='linux'?'linux':(cur.course==='py'?'py':'sql');
  $('code').innerHTML=lines.map((t,i)=>{const st=codeSt.status[i];const n=ns[i];const typing=st==='active'&&n<t.length;
    return '<span class="ln '+st+'">'+(hlLine(t.slice(0,n),lang)||' ')+(typing?'<span class="cur"></span>':'')+'</span>';}).join('');
  if(!codeSt.scrolled){codeSt.scrolled=true;const a=$('code').querySelector('.ln.active');const sc=document.querySelector('.code-scroll');
    if(a&&sc){const top=a.offsetTop-12;if(top<sc.scrollTop||top+a.offsetHeight>sc.scrollTop+sc.clientHeight)sc.scrollTop=Math.max(0,top-sc.clientHeight/3);}}
}
function copyText(text,btn){const label=btn.textContent;const ok=()=>{btn.textContent='Copied';setTimeout(()=>btn.textContent=label,1500);};
  const fb=()=>{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();let r=false;try{r=document.execCommand('copy');}catch(e){}ta.remove();if(r)ok();else{btn.textContent='Copy nahi hua';setTimeout(()=>btn.textContent=label,1500);}};
  try{navigator.clipboard.writeText(text).then(ok,fb);}catch(e){fb();}}
$('copyBtn').addEventListener('click',()=>copyText((cur.code||[]).join('\n'),$('copyBtn')));
function runnable(l){
  const out=[];let inFile=false;
  for(const raw of (l.code||[])){
    const t=raw.trim();
    if(/^--\s*[\w~./\\-]+\.(par|ctl|dat|csv)\b/i.test(t)){inFile=true;out.push(raw);continue;}
    if(inFile){if(/^(\$|C:\\|SQL>|RMAN>|LSNRCTL>|--\s)/i.test(t))inFile=false;else{out.push('-- '+raw);continue;}}
    if(/^\s*(ORA-|PLS-|TNS-|SP2-|KUP-|LRM-|ERROR|--\s*output|Database (closed|dismounted|altered)\.|ORACLE instance shut down\.|Load completed|\d+ Rows successfully loaded|STATUS\s+DATABASE_STATUS|(MOUNTED|OPEN)\s+ACTIVE)/i.test(raw))continue;
    if(/^\$\s*lsnrctl\s*$/i.test(t)||/^LSNRCTL>\s*exit\b/i.test(t))continue;
    if(/^LSNRCTL>\s*/i.test(t)){out.push('lsnrctl '+t.replace(/^LSNRCTL>\s*/i,''));continue;}
    if(/^\$\s*sqlplus\b.*as\s+sysdba/i.test(t)){out.push('CONNECT / AS SYSDBA');continue;}
    out.push(raw.replace(/^(SQL>|RMAN>|\$|C:\\[^>]*>)\s?/,''));
  }
  return out.join('\n');
}
$('codeTry').addEventListener('click',()=>{if(!cur)return;if(NXC(cur.course)){copyText((cur.code||[]).join('\n'),$('codeTry'));return;}openPlay(runnable(cur));});

/* ---------- voice-over */
const A2=(typeof AUDIO2!=='undefined')?AUDIO2:{};const A1=(typeof AUDIO!=='undefined')?AUDIO:{};
function clipOf(id,which){
  const a=A2[id];if(a){const c=which==='intro'?a.i:(a.s||[])[which];if(!c)return null;return{src:a.f,start:c[0],dur:c[1],offs:c[2]||null,sprite:true};}
  const b=A1[id];if(!b)return null;
  if(which==='intro')return b.intro==null?null:{src:'audio/'+id+'/intro.mp3',start:0,dur:b.intro,offs:null,sprite:false};
  const d=b.steps&&b.steps[which];return d==null?null:{src:'audio/'+id+'/s'+pad2(which+1)+'.mp3',start:0,dur:d,offs:null,sprite:false};
}
const hasVoice=id=>!!(A2[id]||A1[id]);
const player=new Audio();player.preload='auto';
let voiceOn=!store.get('voiceOff',false),vTok=0,clip=null,voiceWait=false,vTimer=0,introOn=false;
function setRate(){try{player.playbackRate=speed;player.preservesPitch=true;}catch(e){}}
function endClip(tok){if(!clip||clip.tok!==tok)return;const c=clip;clip=null;clearTimeout(vTimer);if(c.sprite){try{player.pause();}catch(e){}}if(c.onEnd)c.onEnd();}
function voiceTick(){if(!clip||player.paused)return;if(clip.sprite&&player.currentTime>=clip.start+clip.dur-0.02)endClip(clip.tok);}
player.addEventListener('timeupdate',voiceTick);
player.addEventListener('ended',()=>{if(clip)endClip(clip.tok);});
player.addEventListener('error',()=>{if(clip)endClip(clip.tok);});
function armWatchdog(tok,remain){clearTimeout(vTimer);vTimer=setTimeout(()=>{if(clip&&clip.tok===tok)endClip(tok);},(remain/speed)*1500+5000);}
function playClip(c,onEnd){
  vTok++;const tok=vTok;clearTimeout(vTimer);const sk=Math.max(0,c.seekOff||0);clip=Object.assign({},c,{tok,onEnd});setRate();
  const abs=new URL(c.src,location.href).href;let p;
  const seek=()=>{if(!clip||clip.tok!==tok)return;try{player.currentTime=c.start+sk;}catch(e){}player.muted=false;};
  if(player.src!==abs){player.muted=true;player.src=c.src;player.addEventListener('loadedmetadata',seek,{once:true});try{p=player.play();}catch(e){p=null;}}
  else{seek();try{p=player.play();}catch(e){p=null;}}
  if(p&&p.catch)p.catch(err=>{if(!clip||clip.tok!==tok)return;if(err&&err.name==='NotAllowedError'){clip=null;voiceWait=false;setPlaying(false);showStart(true);}else if(err&&err.name==='AbortError'){}else endClip(tok);});
  armWatchdog(tok,Math.max(1,(c.dur||20)-sk));
}
function stopVoice(){vTok++;clearTimeout(vTimer);try{player.pause();}catch(e){}clip=null;voiceWait=false;setIntro(false);}
function speakStep(seekOff){if(!voiceOn||!cur)return;const c=clipOf(cur.id,step);if(!c)return;
  voiceWait=true;const k=step;
  playClip(seekOff?Object.assign({},c,{seekOff}):c,()=>{if(k!==step)return;voiceWait=false;advanceAt=Math.max(stepEnd+500,stage.clock+450);});}
$('caption').addEventListener('click',e=>{
  if(!cur||e.target.closest('.gl'))return;
  const sn=e.target.closest('.sn[data-s]');if(!sn)return;
  const idx=+sn.dataset.s;cancelAutoNext();showStart(false);$('endcard').hidden=true;setSentence(idx,true);setPlaying(true);
  const c=voiceOn&&clipOf(cur.id,step);
  const fr=sentW.slice(0,idx).reduce((a,b)=>a+b,0);
  if(c){const off=(c.offs&&c.offs[idx]!=null)?c.offs[idx]:fr*(c.dur||0);speakStep(off);}
  else{const tot=readMs(cur.steps[step].say||'');stepStart=stage.clock-fr*tot;advanceAt=stepStart+tot+1100;}
});
function pauseVoice(){clearTimeout(vTimer);try{player.pause();}catch(e){}}
function resumeVoice(){
  if(clip&&!clip.intro&&player.currentTime>=clip.start&&player.currentTime<clip.start+clip.dur-0.05){voiceWait=true;setRate();const p=player.play();if(p&&p.catch)p.catch(()=>{});armWatchdog(clip.tok,clip.dur-(player.currentTime-clip.start));}
  else speakStep();
}
function setVoice(on){voiceOn=on;store.set('voiceOff',!on);paintVoice();
  if(on){if(playing)speakStep();}else{stopVoice();advanceAt=Math.max(stepEnd+600,stage.clock+900);}}
function paintVoice(){const b=$('bVoice');const has=cur&&hasVoice(cur.id);b.setAttribute('aria-pressed',voiceOn&&has?'true':'false');b.disabled=!has;
  b.title=has?(voiceOn?'Awaaz band karo':'Awaaz on karo'):'Is lesson ki awaaz abhi nahi hai';$('bSuno').hidden=!(cur&&clipOf(cur.id,'intro'));}
function setIntro(on){introOn=on;const b=$('bSuno');b.lastChild.textContent=on?'Ruko':'Suno';}
$('bVoice').addEventListener('click',()=>setVoice(!voiceOn));
$('bSuno').addEventListener('click',()=>{if(!cur)return;if(introOn){stopVoice();return;}const c=clipOf(cur.id,'intro');if(!c)return;
  showStart(false);setPlaying(false);stopVoice();advanceAt=Infinity;setIntro(true);playClip(Object.assign(c,{intro:true}),()=>setIntro(false));});
function showStart(v){$('startOver').hidden=!v;}
function begin(){showStart(false);$('endcard').hidden=true;setPlaying(true);goStep(0,true);}
$('startOver').addEventListener('click',begin);

/* ---------- transport */
$('bPlay').addEventListener('click',()=>{
  if(!cur)return;
  if(playing){setPlaying(false);pauseVoice();return;}
  showStart(false);
  if(!$('endcard').hidden){begin();return;}
  setPlaying(true);
  if(voiceOn&&clipOf(cur.id,step))resumeVoice();else advanceAt=Math.max(stepEnd+600,stage.clock+900);
});
$('bPrev').addEventListener('click',()=>goStep(step-1,true));
$('bNext').addEventListener('click',()=>{if(step>=cur.steps.length-1)finish();else goStep(step+1,true);});
$('bRestart').addEventListener('click',()=>{showStart(false);setPlaying(true);goStep(0,true);});
$('endReplay').addEventListener('click',begin);
$('endPractice').addEventListener('click',()=>openPlay(null,0));
const SPEEDS=[1,1.25,1.5,2,0.75];
$('bSpeed').addEventListener('click',()=>{speed=SPEEDS[(SPEEDS.indexOf(speed)+1)%SPEEDS.length];setRate();$('bSpeed').textContent=speed+'×';$('bSpeed').setAttribute('aria-label','Speed '+speed+'×');});
let ccOn=store.get('cc',true);
function paintCC(){$('bCC').setAttribute('aria-pressed',ccOn?'true':'false');$('subs').hidden=!ccOn;}
$('bCC').addEventListener('click',()=>{ccOn=!ccOn;store.set('cc',ccOn);paintCC();if(ccOn)sizeCaption();});
paintCC();

/* glossary tooltip */
const tip=$('tip');let tipFor=null;
function showTip(el){const l=cur;if(!l)return;const w=(l.words||[])[+el.dataset.w];if(!w)return;tipFor=el;
  tip.innerHTML='<b>'+esc(w[0])+'</b>'+md(w[1]);tip.hidden=false;const r=el.getBoundingClientRect();const tw=tip.offsetWidth,th=tip.offsetHeight;
  let x=r.left+r.width/2-tw/2;x=clamp(x,8,window.innerWidth-tw-8);let y=r.top-th-8;if(y<8)y=r.bottom+8;tip.style.left=x+'px';tip.style.top=y+'px';}
function hideTip(){tip.hidden=true;tipFor=null;}
document.addEventListener('mouseover',e=>{const g=e.target.closest&&e.target.closest('.gl');if(g)showTip(g);else if(tipFor&&!tip.hidden)hideTip();});
document.addEventListener('focusin',e=>{if(e.target.classList&&e.target.classList.contains('gl'))showTip(e.target);});
document.addEventListener('focusout',e=>{if(e.target.classList&&e.target.classList.contains('gl'))hideTip();});
document.addEventListener('click',e=>{const g=e.target.closest&&e.target.closest('.gl');if(g){e.preventDefault();if(tipFor===g&&!tip.hidden)hideTip();else showTip(g);}else hideTip();});

/* ---------- notes tabs */
let tab=store.get('tab','samjho');
const rp=$('rp');
function tabVisible(t){if(!cur)return t==='samjho';
  if(t==='syntax')return !!cur.syntax;if(t==='galti')return !!(cur.mistakes&&cur.mistakes.length);if(t==='practice')return !!(cur.tasks&&cur.tasks.length);if(t==='test')return !!cur.check;if(t==='shabd')return !!(cur.words&&cur.words.length);return true;}
function setTab(t,save){if(!tabVisible(t))t='samjho';tab=t;if(save)store.set('tab',t);
  document.querySelectorAll('#tabs .tab').forEach(b=>{b.setAttribute('aria-selected',b.dataset.tab===t?'true':'false');b.tabIndex=b.dataset.tab===t?0:-1;});
  document.querySelectorAll('#panels .panel').forEach(p=>{p.hidden=p.id!=='p-'+t;});
  $('panels').scrollTop=0;}
$('tabs').addEventListener('click',e=>{const b=e.target.closest('.tab');if(b)setTab(b.dataset.tab,true);});
$('tabs').addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;const bs=[...document.querySelectorAll('#tabs .tab')].filter(b=>!b.hidden&&getComputedStyle(b).display!=='none');
  let i=bs.findIndex(b=>b.dataset.tab===tab);i=(i+(e.key==='ArrowRight'?1:-1)+bs.length)%bs.length;setTab(bs[i].dataset.tab,true);bs[i].focus();e.preventDefault();});

function renderNotes(l){
  const py=l.course==='py',isLx=l.course==='linux',nx=NXC(l.course)&&!py;
  const lang=isLx?'linux':(py?'py':'sql');
  $('simple').textContent=l.simple||'';$('simpleBox').hidden=!l.simple;
  $('summary').innerHTML=md(l.summary||'');
  $('points').innerHTML=(l.points||[]).map(p=>'<li>'+md(p)+'</li>').join('');
  $('scene').innerHTML=md(l.scenario||'');$('sceneBox').hidden=!l.scenario;
  $('srcLink').href=l.url||'https://www.oracletutorial.com/';try{$('srcLink').textContent=new URL(l.url||'https://www.oracletutorial.com/').hostname.replace(/^www\./,'');}catch(e){}
  /* syntax */
  const sx=l.syntax;
  $('p-syntax').innerHTML=sx?'<h3>Syntax</h3><pre class="cb">'+hlBlock(sx.code||'',lang)+'</pre>'+((sx.parts&&sx.parts.length)?'<h3>Har hissa kya karta hai</h3><div class="parts">'+sx.parts.map(p=>'<div><code>'+esc(p[0])+'</code><span>'+md(p[1])+'</span></div>').join('')+'</div>':''):'';
  /* words */
  $('words').innerHTML=(l.words||[]).map((w,i)=>'<div class="w" data-i="'+i+'"><dt>'+esc(w[0])+'</dt><dd>'+md(w[1])+'</dd></div>').join('');
  /* mistakes */
  const ms=l.mistakes||[];
  const misNote=isLx?'Beginners Linux mein yeh galtiyan sabse zyada karte hain. Galat command chala ke dekho, error khud samjho, phir sahi command.':(nx||py?'Beginners yeh galtiyan sabse zyada karte hain. Galat aur sahi code ko milake dekho, farq samajh aa jayega.':'Beginners yeh galtiyan sabse zyada karte hain. Galat wala chala ke dekho, error khud dekho, phir sahi wala.');
  $('p-galti').innerHTML=ms.length?'<p class="note">'+misNote+'</p>'+ms.map((m,i)=>{
    const errLab=m.err==='no rows'?'koi row nahi':m.err==='wrong'?'galat result':m.err;
    return '<div class="mis"><div class="row bad"><div class="lab"><span>Galat</span><span class="chipe">'+esc(errLab)+'</span></div><pre>'+hlBlock(m.bad||'',m.py?'py':lang)+'</pre>'+(m.py||py||m.nx||nx?'':'<div><button class="lk" type="button" data-try="bad" data-i="'+i+'">Playground mein chala ke dekho</button></div>')+'</div>'+
      '<div class="row"><p class="why">'+md(m.why||'')+'</p></div>'+
      '<div class="row fix"><div class="lab"><span>Sahi</span></div><pre>'+hlBlock(m.fix||'',m.py?'py':lang)+'</pre>'+(m.py||py||m.nx||nx?'':'<div><button class="lk" type="button" data-try="fix" data-i="'+i+'">Playground mein chalao</button></div>')+'</div></div>';}).join(''):'';
  $('p-galti').querySelectorAll('[data-try]').forEach(b=>b.addEventListener('click',()=>{const m=ms[+b.dataset.i];openPlay(b.dataset.try==='bad'?m.bad:m.fix);}));
  /* practice */
  const ts=l.tasks||[];
  const pracNote=isLx?'Yeh tasks interactive Linux Playground mein karo. Har task ka bash command chalao aur <b>Check karo</b>.':(nx?'Yeh kaam Forms Builder, Reports Builder ya server par hota hai, browser mein nahi chalta. Pehle khud socho ya apne system par karo, phir <b>Jawab dekho</b>. SQL wale tasks yahin Playground mein ho jayenge.':py?'Python wale tasks apne computer par chalao (<code>pip install oracledb</code>). SQL wale tasks yahin Playground mein ho jayenge.':'Yeh tasks Playground mein karo. Wahan browser ke andar Oracle jaisa database chalta hai, aur <b>Check karo</b> batata hai ki jawab sahi hai ya nahi.');
  $('p-practice').innerHTML=ts.length?'<p class="note">'+pracNote+'</p>'+
    ts.map((t,i)=>'<div class="task'+(passed.has(l.id+'#'+i)?' passed':'')+'"><div class="th"><span class="num">'+(i+1)+'</span><span class="tt">'+md(t.t)+'</span></div>'+
      (t.ans?'<div class="acts"><button class="btn ghost" type="button" data-sol="'+i+'">Jawab dekho</button></div><pre class="cb" data-solbox="'+i+'" hidden>'+hlBlock(t.ans,false)+'</pre>':t.py?'<pre class="cb">'+hlBlock(t.py,true)+'</pre><div class="acts"><button class="btn ghost" type="button" data-copy="'+i+'">Code copy karo</button></div>':
      '<div class="acts"><button class="btn" type="button" data-go="'+i+'">Playground mein karo</button><button class="btn ghost" type="button" data-hintl="'+i+'">Hint lo</button><button class="btn ghost" type="button" data-sol="'+i+'">Jawab dekho</button></div><div class="hintbox" data-hintlbox="'+i+'" hidden></div><pre class="cb" data-solbox="'+i+'" hidden>'+hlBlock(t.sql||'',lang)+'</pre>')+'</div>').join(''):'';
  $('p-practice').querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>openPlay(null,+b.dataset.go)));
  $('p-practice').querySelectorAll('[data-hintl]').forEach(b=>b.addEventListener('click',()=>cycleHint(b,$('p-practice').querySelector('[data-hintlbox="'+b.dataset.hintl+'"]'),ts[+b.dataset.hintl])));
  $('p-practice').querySelectorAll('[data-sol]').forEach(b=>b.addEventListener('click',()=>{const p=$('p-practice').querySelector('[data-solbox="'+b.dataset.sol+'"]');p.hidden=!p.hidden;b.textContent=p.hidden?'Jawab dekho':'Jawab chhupao';}));
  $('p-practice').querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',()=>copyText(ts[+b.dataset.copy].py,b)));
  /* test */
  renderCheck(l);
  /* tab labels and visibility */
  const bd=(id,n)=>{const b=$(id);b.querySelector('.bd')&&b.querySelector('.bd').remove();if(n)b.insertAdjacentHTML('beforeend','<span class="bd">'+n+'</span>');};
  ['syntax','shabd','galti','practice','test'].forEach(t=>{$('t-'+t).hidden=!tabVisible(t);});
  bd('t-practice',ts.length);
  setTab(tab,false);
}
function renderCheck(l){
  const c=l.check;if(!c){$('checkQ').textContent='';$('checkA').innerHTML='';return;}
  $('checkQ').innerHTML=md(c.q);const why=$('checkWhy');why.hidden=true;
  $('checkA').innerHTML=c.a.map((t,i)=>'<button type="button" class="opt" data-i="'+i+'"><span class="k">'+'ABCD'[i]+'</span><span>'+md(t)+'</span></button>').join('');
  $('checkA').querySelectorAll('.opt').forEach(b=>b.addEventListener('click',()=>{
    const i=+b.dataset.i;$('checkA').querySelectorAll('.opt').forEach(x=>{x.disabled=true;const j=+x.dataset.i;if(j===c.c)x.classList.add('right');else if(j===i)x.classList.add('wrong');});
    why.innerHTML='<b>'+(i===c.c?'Sahi jawab!':'Galat, koi baat nahi.')+'</b> '+md(c.why);why.hidden=false;}));
}

/* ---------- load a lesson */
function loadLesson(id,opts){
  opts=opts||{};const l=byId[id]||ALL[0];if(!l)return;
  stopVoice();cur=l;navCourse=l.c.id;store.set('last',l.id);TR=termRes(l);
  stage.load(l);
  $('eyebrow').innerHTML='<b>'+esc(l.c.name)+'</b> · '+esc(l.secName)+' · Lesson '+pad2(l.n)+' / '+pad2(l.c.lessons.length);
  $('title').textContent=l.title;document.title=l.title+' · Oracle in Motion';
  $('codeTitle').textContent=l.codeTitle||(l.course==='linux'?'Bash Terminal':l.course==='py'?'Python':l.course==='plsql'?'PL/SQL':'SQL*Plus');
  $('codeTry').textContent=NXC(l.course)?'Copy code':'Playground';$('codeTry').hidden=NXC(l.course);
  $('dots').innerHTML=l.steps.map((s,i)=>'<button class="dot" type="button" aria-label="Step '+(i+1)+'" data-i="'+i+'"><i></i></button>').join('');
  $('dots').querySelectorAll('.dot').forEach(d=>d.addEventListener('click',()=>{showStart(false);goStep(+d.dataset.i,true);}));
  const prev=ALL[l.gi-1],next=ALL[l.gi+1];$('bPrevL').disabled=!prev;$('bNextL').disabled=!next;
  $('bPrevL').title=prev?'Pichhla: '+prev.title:'';$('bNextL').title=next?'Agla: '+next.title:'';
  renderNotes(l);paintVoice();refreshNav();
  const sec=l.c.id+'|'+l.secIdx;if(!openSecs.has(sec)){openSecs.add(sec);buildNav();refreshNav();}
  $('startSub').textContent=hasVoice(l.id)&&voiceOn?'Hindi voice-over ke saath · awaaz on rakho':'Captions ke saath'+(hasVoice(l.id)?'':' · is lesson ki awaaz jald aayegi');
  goStep(0,!opts.rest);sizeCaption();
  if(mode==='play')renderTasks();
  if(opts.rest){setPlaying(false);advanceAt=Infinity;showStart(true);return;}
  showStart(false);setPlaying(true);if(voiceOn)speakStep();
}
$('bPrevL').addEventListener('click',()=>{const p=ALL[cur.gi-1];if(p)location.hash=p.id;});
$('bNextL').addEventListener('click',()=>{const n=ALL[cur.gi+1];if(n)location.hash=n.id;});

/* ---------- main loop */
function loop(t){
  const dt=lastT?Math.min(60,t-lastT):16;lastT=t;
  stage.frame(dt*speed);renderCode();voiceTick();
  if(cur){
    let fr=-1;
    if(clip&&!clip.intro&&voiceWait){const rel=player.currentTime-clip.start;fr=clamp(rel/(clip.dur||1),0,1);
      if(clip.offs&&clip.offs.length===sents.length){let i=0;for(let j=0;j<clip.offs.length;j++)if(rel>=clip.offs[j]-0.05)i=j;setSentence(i);}else if(!player.paused)setSentence(sentFromFrac(fr));}
    else if(playing&&isFinite(advanceAt)){fr=clamp((stage.clock-stepStart)/Math.max(1,advanceAt-1100-stepStart),0,1);setSentence(sentFromFrac(Math.min(.999,fr)));}
    const d=$('dots').children[step];if(d&&d.firstChild&&$('endcard').hidden){const w=playing&&fr>=0?fr:0;d.firstChild.style.width=(w*100).toFixed(1)+'%';}
    if(playing&&!voiceWait&&stage.clock>=advanceAt)advance();
  }
  requestAnimationFrame(loop);
}

/* ---------- keyboard & modals */
function toggleKeysModal(show){const m=$('keysModal');if(!m)return;m.hidden=show==null?!m.hidden:!show;}
if($('bKeys'))$('bKeys').addEventListener('click',()=>toggleKeysModal(true));
if($('keysClose'))$('keysClose').addEventListener('click',()=>toggleKeysModal(false));
if($('keysModal'))$('keysModal').addEventListener('click',e=>{if(e.target===$('keysModal'))toggleKeysModal(false);});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if($('erModal')&&!$('erModal').hidden){$('erModal').hidden=true;return;}if($('keysModal')&&!$('keysModal').hidden){toggleKeysModal(false);return;}}
  const tg=e.target;
  if(tg&&(tg.tagName==='SELECT'||tg.tagName==='INPUT'||tg.tagName==='TEXTAREA'||tg.isContentEditable))return;
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key==='?'){e.preventDefault();toggleKeysModal();return;}
  if(e.key==='p'||e.key==='P'){if($('pModalBack')&&!$('pModalBack').hidden)return;e.preventDefault();setMode(mode==='lesson'?'play':'lesson');return;}
  if(mode!=='lesson'||!cur)return;
  if(e.key===' '&&!(tg&&(tg.tagName==='BUTTON'||tg.tagName==='A'))){e.preventDefault();$('bPlay').click();}
  else if(e.key==='ArrowRight'&&!(tg&&tg.closest&&tg.closest('#tabs'))){e.preventDefault();$('bNext').click();}
  else if(e.key==='ArrowLeft'&&!(tg&&tg.closest&&tg.closest('#tabs'))){e.preventDefault();if(step>0)$('bPrev').click();}
  else if(e.key==='['){const p=ALL[cur.gi-1];if(p){e.preventDefault();location.hash=p.id;}}
  else if(e.key===']'){const n=ALL[cur.gi+1];if(n){e.preventDefault();location.hash=n.id;}}
  else if(e.key==='v'||e.key==='V'){if(hasVoice(cur.id)){e.preventDefault();setVoice(!voiceOn);}}
  else if(e.key==='c'||e.key==='C'){e.preventDefault();$('bCC').click();}
});

/* ================= playground ================= */
let mode='lesson';
const con=$('con'),edIn=$('edIn'),edHl=$('edHl'),acBox=$('acBox'),acList=$('acList');
let pg=null,lpg=null,setupDone=new Set(),hist=store.get('hist',[]),hIdx=-1,lastRun='',pgLog=[],promptNow='SQL>',secretNow=false,activeTask=-1,autoSysdba=false;
let gridOn=store.get('grid',true),openTables=new Set();
function paintGridMode(){con.classList.toggle('ascii-mode',!gridOn);if($('pGrid'))$('pGrid').setAttribute('aria-pressed',gridOn?'true':'false');}
paintGridMode();
if($('pGrid'))$('pGrid').addEventListener('click',()=>{gridOn=!gridOn;store.set('grid',gridOn);paintGridMode();});
const needSysdba=l=>!!(l&&l.as&&/SYSDBA/i.test(l.as)&&!/then\s+ot/i.test(l.as));
function newPg(){pg=SIM.create({});pg.run('SET SERVEROUTPUT ON');setupDone=new Set();pgLog=[];autoSysdba=false;}
function conLine(cls,text,html){const d=document.createElement('div');d.className=cls;if(html!=null)d.innerHTML=html;else d.textContent=text;con.appendChild(d);
  while(con.childElementCount>3000)con.firstChild.remove();}
const conEnd=()=>{con.scrollTop=con.scrollHeight;};
function welcome(){con.innerHTML='';
  if(cur&&cur.course==='linux'){
    conLine('sys','Linux Terminal (Bash). Virtual enterprise production host: prod-db01 (AlmaLinux 9 / Oracle Linux 9).');
    conLine('sys','Available: ls, cat, grep, awk, sed, ps, top, free, df, systemctl, journalctl, tar, rsync, ip, ss, lsof, curl, etc.');
    conLine('sys','Shuru karo:  ls -la /var/log   ya   systemctl status nginx   ya   df -h');
    conLine('out','');
    return;
  }
  conLine('sys','Oracle Playground. Yeh browser ke andar chalne wala chhota Oracle hai (asli Oracle nahi, par same SQL, PL/SQL, DBA commands aur errors).');
  conLine('sys','Sample tables (customers, orders, products, employees...) "Tables" mein ya "ER Map" button se dekho. DBA lessons mein session khud SYSDBA ho jaata hai.');
  conLine('sys','SERVEROUTPUT ON hai. Shuru karo:  SELECT * FROM customers FETCH FIRST 5 ROWS ONLY;');conLine('out','');}
const isPlusLine=s=>/^\s*(CONN(ECT)?|DISC(ONNECT)?|EXIT|QUIT|SHO(W)?|DESC(RIBE)?|STARTUP|SHUTDOWN|HELP|CLEAR|SET|VAR(IABLE)?|PRINT|EXEC(UTE)?|HOST|!|lsnrctl|expdp|impdp|sqlldr|cat|ls|mkdir)\b/i.test(s);
const isPlBlock=t=>/^\s*(DECLARE|BEGIN|<<|CREATE\s+(OR\s+REPLACE\s+)?(EDITIONABLE\s+|NONEDITIONABLE\s+)?(PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE)\b)/i.test(t);
function terminate(t,simRef){const p=simRef||pg;if(p&&p.isComplete(t))return t;const s=t.replace(/\s+$/,'');if(!s)return s;const lastL=s.split('\n').filter(x=>x.trim()).pop()||'';if(isPlusLine(lastL))return s;return isPlBlock(s)?s+'\n/':s+';';}
function ensureSetup(l){
  if(l&&l.course==='linux'){
    if(!lpg)lpg=LINUX_SIM.create();
    setPrompt(lpg.prompt());
    edIn.setAttribute('placeholder','ls -la /var/log');
    if(!l.setup||setupDone.has(l.id)){conEnd();return;}
    setupDone.add(l.id);pgLog=[];
    try{lpg.run(l.setup);}catch(e){}
    conLine('sys','-- Linux lab environment ready: prod-db01');conEnd();
    return;
  }
  edIn.setAttribute('placeholder','SELECT * FROM customers FETCH FIRST 5 ROWS ONLY;');
  if(!pg)newPg();
  if(needSysdba(l)){
    if(pg.state().user!=='SYS AS SYSDBA'){pg.run('CONNECT / AS SYSDBA');autoSysdba=true;conLine('sys','-- Is DBA lesson ke liye session: SYS AS SYSDBA.');}
  }else if(autoSysdba){
    autoSysdba=false;
    if(pg.state().inst!=='OPEN'){pg.run('CONNECT / AS SYSDBA');pg.run('STARTUP');}
    if(pg.state().user==='SYS AS SYSDBA'){pg.run('CONNECT ot/oracle');conLine('sys','-- Wapas OT user session par connect ho gaye.');}
  }
  if(!l||!l.setup||setupDone.has(l.id)){conEnd();return;}
  setupDone.add(l.id);pgLog=[];
  const before=new Set(pg.state().tables.map(t=>t.owner+'.'+t.name));let r;try{r=pg.run(terminate(l.setup,pg));}catch(e){r={lines:[]};}
  const made=pg.state().tables.filter(t=>!before.has(t.owner+'.'+t.name)).map(t=>t.name.toLowerCase());
  const errs=(r.lines||[]).filter(x=>x.k==='err'&&/^(ORA|PLS)-/.test(x.t));
  conLine('sys','-- Lesson "'+l.title+'" ka setup chala diya'+(made.length?': nayi tables '+made.join(', '):'')+(errs.length?' ('+errs.length+' statement pehle se bane hue the)':'')+'.');conEnd();
}
function paintEd(){edHl.innerHTML=(secretNow?'':hlBlock(edIn.value,cur&&cur.course==='linux'?'linux':(cur&&cur.course==='py'?'py':'sql')))+'\n ';edHl.style.transform='translateY('+(-edIn.scrollTop)+'px)';}
edIn.addEventListener('scroll',()=>{edHl.style.transform='translateY('+(-edIn.scrollTop)+'px)';});
function setPrompt(p,secret){promptNow=p||'SQL>';secretNow=!!secret;$('pPrompt').textContent=promptNow.trim();edIn.classList.toggle('secret',secretNow);if(secretNow)closeAc();paintEd();}
function echo(text){
  if(secretNow){conLine('in',null,'<span class="p">'+esc(promptNow)+'</span>');return;}
  const ls=text.replace(/\s+$/,'').split('\n');
  const isLx=cur&&cur.course==='linux';
  ls.forEach((x,i)=>conLine('in',null,(i===0?'<span class="p">'+esc(promptNow.trim()==='SQL>'?'SQL> ':promptNow)+'</span>':'<span class="p">'+String(i+1).padStart(3,' ')+'  </span>')+(isLx?hlSh(x):hlSql(x))));
}
function toCsv(g){
  const q=s=>{if(s==null)return'';const x=String(s);return/[,"\n\r]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x;};
  return[g.cols.map(q).join(',')].concat(g.cells.map(r=>r.map(q).join(','))).join('\n');
}
function appendQueryBlock(g,asciiLines){
  const wrap=document.createElement('div');wrap.className='qwrap';
  const asc=document.createElement('div');asc.className='qascii';
  asciiLines.forEach(x=>{const d=document.createElement('div');d.className=x.k||'out';d.textContent=x.t;asc.appendChild(d);});
  const gr=document.createElement('div');gr.className='qgrid';
  const shown=g.cells.length,more=g.total>shown?' ('+shown+' of '+g.total+' dikhaye)':'';
  const lbl=(g.total===1?'1 row selected.':g.total+' rows selected.')+more;
  let th='<tr><th class="rn">#</th>'+g.cols.map((c,ci)=>'<th'+(g.isNum[ci]?' class="numc"':'')+'>'+esc(c)+'</th>').join('')+'</tr>';
  let tb=g.cells.map((row,ri)=>'<tr><td class="rn">'+(ri+1)+'</td>'+row.map((v,ci)=>v==null?'<td><span class="null-pill">NULL</span></td>':'<td'+(g.isNum[ci]?' class="numc"':'')+' title="'+esc(v.length>40?v:'')+'">'+esc(v)+'</td>').join('')+'</tr>').join('');
  gr.innerHTML='<div class="qgrid-bar"><span>'+esc(lbl)+'</span><div><button type="button" class="qcsv">Copy CSV</button></div></div><div class="qgrid-sc"><table><thead>'+th+'</thead><tbody>'+tb+'</tbody></table></div>';
  gr.querySelector('.qcsv').addEventListener('click',e=>copyText(toCsv(g),e.currentTarget));
  wrap.appendChild(asc);wrap.appendChild(gr);con.appendChild(wrap);
  while(con.childElementCount>3000)con.firstChild.remove();
}
function runText(text){
  if(cur&&cur.course==='linux'){
    if(!lpg)lpg=LINUX_SIM.create();
    closeAc();echo(text);let r;
    try{r=lpg.run(text);}catch(e){r={code:1,out:'bash: internal error: '+(e&&e.message||e),lines:[{k:'err',t:'bash: internal error: '+(e&&e.message||e)}]};}
    if(r.clear)con.innerHTML='';
    const lines=r.lines||(r.out||'').split('\n').map(t=>({k:r.code!==0?'err':'out',t}));
    lines.forEach(x=>{if(x.t!==undefined)conLine(x.k||'out',x.t);});
    setPrompt(lpg.prompt());
    const tx=text.replace(/\s+$/,'');
    if(tx&&hist[hist.length-1]!==tx){hist.push(tx);if(hist.length>80)hist.shift();store.set('hist',hist);}lastRun=text;
    if(r.code===0&&tx){pgLog.push(tx);if(pgLog.length>25)pgLog.shift();}
    hIdx=-1;conEnd();refreshSchema();return r;
  }
  if(!pg)newPg();
  closeAc();const wasSecret=secretNow;echo(text);let r;
  try{r=pg.run(text);}catch(e){r={lines:[{k:'err',t:'ORA-00600: internal error code, arguments: ['+(e&&e.message||e)+']'}],grids:[],prompt:null};}
  if(r.clear)con.innerHTML='';
  const lines=r.lines||[],grids=r.grids||[];
  for(let i=0;i<lines.length;i++){
    const x=lines[i];
    if(x.qi!=null&&grids[x.qi]){const qi=x.qi,grp=[];while(i<lines.length&&lines[i].qi===qi){grp.push(lines[i]);i++;}i--;appendQueryBlock(grids[qi],grp);}
    else conLine(x.k||'out',x.t);
  }
  setPrompt(r.prompt,r.secret);
  if(!wasSecret){const tx=text.replace(/\s+$/,'');if(tx&&hist[hist.length-1]!==tx){hist.push(tx);if(hist.length>80)hist.shift();store.set('hist',hist);}lastRun=text;
    const hasErr=lines.some(x=>x.k==='err');if(!hasErr&&tx){pgLog.push(tx);if(pgLog.length>25)pgLog.shift();}}
  hIdx=-1;conEnd();refreshSchema();return r;
}

/* ---------- SQL editor autocomplete */
let acItems=[],acIdx=0;
function closeAc(){acItems=[];acIdx=0;if(acBox)acBox.hidden=true;}
function getAcCandidates(prefix,dotTbl){
  if(!pg)return[];
  const st=pg.state(),me=st.schema||st.user||'OT';
  const P=prefix.toUpperCase();const out=[],seen=new Set();
  const add=(val,kind,pri)=>{const k=val.toUpperCase();if(seen.has(k)||k===P)return;if(P&&!k.startsWith(P))return;seen.add(k);out.push({val,kind,pri});};
  if(dotTbl){
    const dt=dotTbl.toUpperCase();
    let tName=dt;
    const aliasRe=new RegExp('\\b([A-Za-z_][\\w$#]*)\\s+(?:AS\\s+)?'+escRe(dotTbl)+'\\b','i');
    const am=edIn.value.match(aliasRe);if(am&&!SQLKW.has(am[1].toUpperCase()))tName=am[1].toUpperCase();
    const cols=pg.tableInfo(me,tName)||pg.tableInfo('OT',tName);
    if(cols)cols.forEach(c=>add(c.name.toLowerCase(),'col',1));
    return out.slice(0,10);
  }
  st.tables.filter(t=>t.owner===me).forEach(t=>{
    add(t.name.toLowerCase(),'table',1);
    const cols=pg.tableInfo(me,t.name);if(cols)cols.forEach(c=>add(c.name.toLowerCase(),'col',2));
  });
  st.views.filter(v=>v.owner===me).forEach(v=>add(v.name.toLowerCase(),'view',2));
  st.seqs.filter(v=>v.owner===me).forEach(v=>add(v.name.toLowerCase(),'seq',3));
  ['v$instance','v$sga','v$datafile','v$controlfile','v$logfile','v$bgprocess','v$session','dba_users','dba_tablespaces','dba_data_files','dba_temp_files','dba_roles','dba_profiles','dba_db_links','user_tables','all_tables','dual'].forEach(v=>add(v,'view',3));
  SQLKW.forEach(k=>add(k,'kw',4));
  out.sort((a,b)=>a.pri-b.pri||(a.val<b.val?-1:1));
  return out.slice(0,8);
}
function renderAc(){
  if(!acBox||!acItems.length){closeAc();return;}
  acBox.hidden=false;
  acList.innerHTML=acItems.map((it,i)=>'<button type="button" class="acitem'+(i===acIdx?' on':'')+'" data-aci="'+i+'"><span>'+esc(it.val)+'</span><em>'+esc(it.kind)+'</em></button>').join('');
}
function updateAc(force){
  if(secretNow||(cur&&(cur.course==='py'||cur.course==='linux'))||edIn.selectionStart!==edIn.selectionEnd){closeAc();return;}
  const pos=edIn.selectionStart,before=edIn.value.slice(0,pos);
  const dm=before.match(/([A-Za-z_][\w$#]*)\.([A-Za-z_][\w$#]*)$/);
  if(dm){acItems=getAcCandidates(dm[2],dm[1]);acIdx=0;renderAc();return;}
  const wm=before.match(/([A-Za-z_$][\w$#]*)$/);
  const word=wm?wm[1]:'';
  if(!force&&word.length<2){closeAc();return;}
  acItems=getAcCandidates(word,null);acIdx=0;renderAc();
}
function applyAc(i){
  const it=acItems[i];if(!it)return;
  const pos=edIn.selectionStart,before=edIn.value.slice(0,pos),after=edIn.value.slice(pos);
  const m=before.match(/([A-Za-z_$][\w$#]*)$/);
  const start=m?pos-m[1].length:pos;
  edIn.value=before.slice(0,start)+it.val+after;
  edIn.selectionStart=edIn.selectionEnd=start+it.val.length;
  closeAc();paintEd();edIn.focus();
}
if(acList)acList.addEventListener('mousedown',e=>{const b=e.target.closest('[data-aci]');if(!b)return;e.preventDefault();applyAc(+b.dataset.aci);});
edIn.addEventListener('input',()=>{hIdx=-1;paintEd();updateAc(false);});
edIn.addEventListener('blur',()=>setTimeout(closeAc,140));

function submit(force){
  let text=edIn.value;
  if(!text.trim()&&!secretNow){if(force)conLine('dim','(editor khaali hai)');conEnd();return;}
  if(force&&!secretNow)text=terminate(text);
  edIn.value='';closeAc();paintEd();runText(text);
}
edIn.addEventListener('keydown',e=>{
  if(e.key===' '&&e.ctrlKey){e.preventDefault();updateAc(true);return;}
  if(acItems.length&&acBox&&!acBox.hidden){
    if(e.key==='Escape'){e.preventDefault();closeAc();return;}
    if(e.key==='Tab'&&!e.shiftKey){e.preventDefault();applyAc(acIdx);return;}
    if(e.key==='ArrowDown'&&hIdx<0){e.preventDefault();acIdx=(acIdx+1)%acItems.length;renderAc();return;}
    if(e.key==='ArrowUp'&&hIdx<0&&edIn.value.trim()){e.preventDefault();acIdx=(acIdx-1+acItems.length)%acItems.length;renderAc();return;}
  }
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();submit(true);return;}
  if(e.key==='Enter'&&!e.shiftKey){const t=edIn.value;if(secretNow||(t.trim()&&pg&&pg.isComplete(t))){e.preventDefault();submit(false);}return;}
  if(e.key==='Tab'&&!e.shiftKey){e.preventDefault();const s=edIn.selectionStart,en=edIn.selectionEnd;edIn.value=edIn.value.slice(0,s)+'  '+edIn.value.slice(en);edIn.selectionStart=edIn.selectionEnd=s+2;paintEd();return;}
  const v=edIn.value;
  if(e.key==='ArrowUp'&&hist.length&&(!v.includes('\n')||edIn.selectionStart===0)&&edIn.selectionStart===edIn.selectionEnd&&(edIn.selectionStart===0||!v.includes('\n'))){
    e.preventDefault();hIdx=hIdx<0?hist.length-1:Math.max(0,hIdx-1);edIn.value=hist[hIdx];closeAc();paintEd();return;}
  if(e.key==='ArrowDown'&&hIdx>=0&&(!v.includes('\n')||edIn.selectionStart===v.length)){e.preventDefault();hIdx++;if(hIdx>=hist.length){hIdx=-1;edIn.value='';}else edIn.value=hist[hIdx];closeAc();paintEd();}
});
$('pRun').addEventListener('click',()=>{submit(true);edIn.focus();});
$('pClear').addEventListener('click',()=>{con.innerHTML='';edIn.focus();});
let resetArm=0;
$('pReset').addEventListener('click',()=>{const b=$('pReset');
  if(Date.now()-resetArm>3000){resetArm=Date.now();b.textContent='Pakka? Phir dabao';setTimeout(()=>{b.textContent='Reset DB';},3000);return;}
  resetArm=0;b.textContent='Reset DB';newPg();welcome();conLine('sys','-- Database reset: saari tables shuruaati data par wapas. Tumhari banayi cheezein hata di gayi.');ensureSetup(cur);setPrompt('SQL>',false);refreshSchema();edIn.focus();});
$('pSchema').addEventListener('click',()=>{$('pv').classList.toggle('schema-on');});
if($('pSess'))$('pSess').addEventListener('change',e=>{
  if(!pg)newPg();autoSysdba=false;
  const want=e.target.value;
  if(want==='SYSDBA')runText('CONNECT / AS SYSDBA');
  else{if(pg.state().inst!=='OPEN'){runText('CONNECT / AS SYSDBA');runText('STARTUP');}runText('CONNECT ot/oracle');}
  edIn.focus();
});

function insertAtCursor(txt){
  const s=edIn.selectionStart||0,en=edIn.selectionEnd||0,v=edIn.value;
  const needSp=s>0&&/[A-Za-z0-9_]$/.test(v.slice(0,s));
  const ins=(needSp?', ':'')+txt;
  edIn.value=v.slice(0,s)+ins+v.slice(en);
  edIn.selectionStart=edIn.selectionEnd=s+ins.length;
  paintEd();edIn.focus();
}
function refreshSchema(){
  if(mode!=='play')return;
  if(cur&&cur.course==='linux'){
    if(!lpg)lpg=LINUX_SIM.create();
    const st=lpg.state?lpg.state():{};
    $('schemaUser').textContent=(st.user||'oracle')+'@prod-db01';
    $('pWho').className='who';
    $('pWho').innerHTML='<b>'+(st.user||'oracle')+'@prod-db01</b> · '+(st.cwd||'/home/oracle');
    const sect=(title,items,fn)=>items.length?'<h4>'+esc(title)+'</h4>'+items.map(fn).join(''):'';
    const keyDirs=[
      {name:'/home/oracle',cmd:'ls -la /home/oracle'},
      {name:'/var/log',cmd:'ls -la /var/log'},
      {name:'/etc',cmd:'ls -la /etc'},
      {name:'/u01/app/oracle',cmd:'ls -la /u01/app/oracle'},
      {name:'/tmp',cmd:'ls -la /tmp'}
    ];
    const srvs=[
      {name:'nginx.service',cmd:'systemctl status nginx'},
      {name:'payapi.service',cmd:'systemctl status payapi'},
      {name:'sshd.service',cmd:'systemctl status sshd'},
      {name:'oracle-free.service',cmd:'systemctl status oracle-free'},
      {name:'crond.service',cmd:'systemctl status crond'},
      {name:'firewalld.service',cmd:'systemctl status firewalld'}
    ];
    const diags=[
      {name:'Disk Space',cmd:'df -h'},
      {name:'Memory Usage',cmd:'free -h'},
      {name:'Open Ports',cmd:'ss -tulpn'},
      {name:'Running Processes',cmd:'ps aux | head -20'},
      {name:'System Logs',cmd:'tail -20 /var/log/syslog'},
      {name:'Uptime & Load',cmd:'uptime'}
    ];
    $('schemaList').innerHTML=
      sect('Server Directories',keyDirs,d=>'<button type="button" data-q="'+esc(d.cmd)+'"><span>'+esc(d.name)+'</span></button>')+
      sect('Systemd Services',srvs,s=>'<button type="button" data-q="'+esc(s.cmd)+'"><span>'+esc(s.name)+'</span></button>')+
      sect('Quick Diagnostics',diags,q=>'<button type="button" data-q="'+esc(q.cmd)+'"><span>'+esc(q.name)+'</span></button>');
    return;
  }
  if(!pg)return;const st=pg.state();const me=st.schema||st.user||'OT';
  const who=$('pWho');who.className='who'+(st.pendingTx?' tx':'');
  who.innerHTML=st.user?('<b>'+esc(st.user)+'</b>'+(st.inst&&st.inst!=='OPEN'?' · instance '+esc(st.inst):'')+(st.listener===false?' · listener OFF':'')+(st.pendingTx?' · <b>COMMIT baaki</b>':'')):'<b>not connected</b>';
  if($('pSess'))$('pSess').value=st.user==='SYS AS SYSDBA'?'SYSDBA':'OT';
  $('schemaUser').textContent=me;
  let mine=st.tables.filter(t=>t.owner===me).sort((a,b)=>a.name<b.name?-1:1);
  const showOtFallback=!mine.length&&me==='SYS';
  if(showOtFallback)mine=st.tables.filter(t=>t.owner==='OT').sort((a,b)=>a.name<b.name?-1:1);
  const tabOwner=showOtFallback?'OT':me;
  const pref=showOtFallback?'ot.':'';
  const sect=(title,items,fn)=>items.length?'<h4>'+esc(title)+'</h4>'+items.map(fn).join(''):'';
  const renderTable=t=>{
    const key=tabOwner+'.'+t.name,cols=pg.tableInfo(tabOwner,t.name)||[];
    const low=pref+t.name.toLowerCase();
    return '<details class="sch-t" data-tk="'+esc(key)+'"'+(openTables.has(key)?' open':'')+'><summary><span>'+esc(low)+'</span><span class="rc">'+(t.rows==null?'ext':t.rows)+'</span><button type="button" class="sq" data-q="SELECT * FROM '+esc(low)+' FETCH FIRST 10 ROWS ONLY;" title="SELECT query editor mein daalo">SQL</button></summary><div class="sch-cols">'+
      cols.map(c=>'<button type="button" class="sch-col" data-ins="'+esc(c.name.toLowerCase())+'" title="Click = editor mein column insert karo'+(c.fk?' · FK -> '+esc(c.fk):'')+'"><span>'+esc(c.name.toLowerCase())+'</span>'+
        (c.pk?'<i class="cbadge pk">PK</i>':'')+(c.fk?'<i class="cbadge fk">FK</i>':'')+(c.nn&&!c.pk?'<i class="cbadge nn">NN</i>':'')+
        '<span class="ct">'+esc(c.type.toLowerCase())+'</span></button>').join('')+'</div></details>';
  };
  const dbaOpen=cur&&cur.course==='dba'?' open':'';
  const dbaHtml='<details class="sch-dba"'+dbaOpen+'><summary><span>DBA Objects</span><span>'+st.ts.length+' TS · '+st.users.length+' U</span></summary>'+
    sect('Tablespaces',st.ts,t=>'<button type="button" data-q="SELECT tablespace_name, status, contents FROM dba_tablespaces;">'+esc(t.name.toLowerCase())+'<span>'+esc(t.type==='TEMPORARY'?'temp':t.size+'M')+'</span></button>')+
    sect('Users',st.users,u=>'<button type="button" data-q="SELECT username, account_status, profile FROM dba_users WHERE username = \''+esc(u.name)+'\';"'+(u.status!=='OPEN'?' class="bad"':'')+'>'+esc(u.name.toLowerCase())+'<span>'+esc(u.status==='OPEN'?'open':'lock')+'</span></button>')+
    sect('Roles',st.roleNames,r=>'<button type="button" data-q="SELECT role FROM dba_roles;">'+esc(r.toLowerCase())+'</button>')+
    sect('Profiles',st.profiles,p=>'<button type="button" data-q="SELECT resource_name, limit FROM dba_profiles WHERE profile = \''+esc(p)+'\';">'+esc(p.toLowerCase())+'</button>')+
    sect('DB Links',st.links,l=>'<button type="button" data-q="SELECT db_link, username, host FROM user_db_links;">'+esc(l.toLowerCase())+'</button>')+
    sect('Directories',st.dirs,d=>'<button type="button" data-q="SELECT directory_name, directory_path FROM all_directories;">'+esc(d.toLowerCase())+'</button>')+
    '</details>';
  $('schemaList').innerHTML=
    sect(showOtFallback?'OT Tables (via ot.)':'Tables',mine,renderTable)+
    sect('Views',st.views.filter(v=>v.owner===me),v=>'<button type="button" data-q="SELECT * FROM '+esc(v.name.toLowerCase())+';"'+(v.status==='INVALID'?' class="bad"':'')+'>'+esc(v.name.toLowerCase())+'</button>')+
    sect('Sequences',st.seqs.filter(v=>v.owner===me),v=>'<button type="button" data-q="SELECT '+esc(v.name.toLowerCase())+'.NEXTVAL FROM dual;">'+esc(v.name.toLowerCase())+'</button>')+
    sect('Procedures / functions',st.progs.filter(v=>v.owner===me),v=>'<button type="button" data-q="SELECT text FROM user_source WHERE name = \''+esc(v.name)+'\' ORDER BY line;"'+(v.status==='INVALID'?' class="bad"':'')+'>'+esc(v.name.toLowerCase())+'<span>'+esc(v.type.toLowerCase())+'</span></button>')+
    sect('Triggers',st.trigs.filter(v=>v.owner===me),v=>'<button type="button" data-q="SELECT trigger_name, status FROM user_triggers;">'+esc(v.name.toLowerCase())+'<span>'+(v.enabled?'on':'off')+'</span></button>')+
    dbaHtml;
  $('schemaList').querySelectorAll('details.sch-t').forEach(d=>d.addEventListener('toggle',()=>{if(d.open)openTables.add(d.dataset.tk);else openTables.delete(d.dataset.tk);}));
}
$('schemaList').addEventListener('click',e=>{
  const sq=e.target.closest('[data-q]');if(sq){e.preventDefault();e.stopPropagation();edIn.value=sq.dataset.q;paintEd();edIn.focus();$('pv').classList.remove('schema-on');return;}
  const col=e.target.closest('[data-ins]');if(col){e.preventDefault();insertAtCursor(col.dataset.ins);$('pv').classList.remove('schema-on');}
});

/* ---------- OT Schema Interactive ER Map */
const ER_NODES=[
  {n:'REGIONS',x:24,y:24,pk:'region_id',rows:4},
  {n:'COUNTRIES',x:240,y:24,pk:'country_id',fk:'region_id',rows:25},
  {n:'LOCATIONS',x:462,y:24,pk:'location_id',fk:'country_id',rows:23},
  {n:'WAREHOUSES',x:684,y:24,pk:'warehouse_id',fk:'location_id',rows:9},
  {n:'PRODUCT_CATEGORIES',x:24,y:168,pk:'category_id',rows:5},
  {n:'PRODUCTS',x:280,y:168,pk:'product_id',fk:'category_id',rows:42},
  {n:'INVENTORIES',x:640,y:168,pk:'product_id, warehouse_id',fk:'product + warehouse',rows:93},
  {n:'CUSTOMERS',x:24,y:314,pk:'customer_id',rows:63},
  {n:'CONTACTS',x:24,y:384,pk:'contact_id',fk:'customer_id',rows:63,h:46},
  {n:'ORDERS',x:260,y:314,pk:'order_id',fk:'customer_id, salesman_id',rows:105},
  {n:'ORDER_ITEMS',x:500,y:314,pk:'order_id, item_id',fk:'order_id, product_id',rows:312},
  {n:'EMPLOYEES',x:712,y:314,pk:'employee_id',fk:'manager_id (self)',rows:35}
];
const ER_LINKS=[
  ['COUNTRIES','REGIONS','c.region_id = r.region_id'],
  ['LOCATIONS','COUNTRIES','l.country_id = c.country_id'],
  ['WAREHOUSES','LOCATIONS','w.location_id = l.location_id'],
  ['PRODUCTS','PRODUCT_CATEGORIES','p.category_id = pc.category_id'],
  ['INVENTORIES','PRODUCTS','i.product_id = p.product_id'],
  ['INVENTORIES','WAREHOUSES','i.warehouse_id = w.warehouse_id'],
  ['CONTACTS','CUSTOMERS','ct.customer_id = c.customer_id'],
  ['ORDERS','CUSTOMERS','o.customer_id = c.customer_id'],
  ['ORDERS','EMPLOYEES','o.salesman_id = e.employee_id'],
  ['ORDER_ITEMS','ORDERS','oi.order_id = o.order_id'],
  ['ORDER_ITEMS','PRODUCTS','oi.product_id = p.product_id']
];
function buildErMap(){
  const svgEl=$('erSvg');if(!svgEl||svgEl.dataset.built)return;svgEl.dataset.built='1';
  const byN={};ER_NODES.forEach(d=>{d.w=190;d.h=d.h||58;d.cx=d.x+d.w/2;d.cy=d.y+d.h/2;byN[d.n]=d;});
  let linesHtml=ER_LINKS.map((lk,i)=>{const a=byN[lk[0]],b=byN[lk[1]];
    const mx=(a.cx+b.cx)/2;const d='M'+a.cx+','+a.cy+' C'+mx+','+a.cy+' '+mx+','+b.cy+' '+b.cx+','+b.cy;
    return '<path class="er-line" data-a="'+lk[0]+'" data-b="'+lk[1]+'" d="'+d+'"/>';}).join('');
  let nodesHtml=ER_NODES.map(d=>'<g class="er-node" data-en="'+d.n+'" transform="translate('+d.x+','+d.y+')">'+
    '<rect class="cardbg" width="'+d.w+'" height="'+d.h+'" rx="8"/>'+
    '<text x="10" y="19" style="font:700 12px var(--f-mono);fill:var(--ink)">'+d.n.toLowerCase()+'</text>'+
    '<text x="'+(d.w-8)+'" y="19" text-anchor="end" style="font:500 10.5px var(--f-mono);fill:var(--muted)">'+d.rows+'r</text>'+
    '<text x="10" y="36" style="font:500 10.5px var(--f-mono);fill:var(--accent)">PK: '+d.pk+'</text>'+
    (d.fk&&d.h>50?'<text x="10" y="50" style="font:400 10px var(--f-mono);fill:var(--mem)">FK: '+d.fk+'</text>':'')+
    '</g>').join('');
  svgEl.innerHTML=linesHtml+nodesHtml;
  const pick=name=>{
    const rel=new Set();const joins=[];
    svgEl.querySelectorAll('.er-line').forEach((ln,idx)=>{
      const hit=ln.dataset.a===name||ln.dataset.b===name;
      ln.classList.toggle('hi',hit);ln.classList.toggle('dim',!hit);
      if(hit){const other=ln.dataset.a===name?ln.dataset.b:ln.dataset.a;rel.add(other);joins.push({other,cond:ER_LINKS[idx][2]});}
    });
    svgEl.querySelectorAll('.er-node').forEach(nd=>{nd.classList.toggle('sel',nd.dataset.en===name);nd.classList.toggle('rel',rel.has(nd.dataset.en));});
    const tLow=name.toLowerCase();
    const alias=s=>s.split('_').map(w=>w[0]).join('').toLowerCase();
    let btns='<button type="button" class="btn" data-erq="SELECT * FROM '+tLow+' FETCH FIRST 10 ROWS ONLY;">SELECT * FROM '+tLow+'</button>';
    joins.forEach(j=>{const oLow=j.other.toLowerCase();btns+='<button type="button" class="btn ghost" data-erq="SELECT *\nFROM '+tLow+' '+alias(name)+'\nJOIN '+oLow+' '+alias(j.other)+' ON '+j.cond+'\nFETCH FIRST 10 ROWS ONLY;">JOIN '+oLow+'</button>';});
    if(name==='EMPLOYEES')btns+='<button type="button" class="btn ghost" data-erq="SELECT e.first_name emp, m.first_name manager\nFROM employees e\nLEFT JOIN employees m ON e.manager_id = m.employee_id;">Self JOIN manager</button>';
    $('erPick').innerHTML='<b>'+tLow+'</b>'+btns;
    $('erPick').querySelectorAll('[data-erq]').forEach(b=>b.addEventListener('click',()=>{edIn.value=b.dataset.erq;paintEd();$('erModal').hidden=true;if(mode!=='play')setMode('play');edIn.focus();}));
  };
  svgEl.querySelectorAll('.er-node').forEach(nd=>nd.addEventListener('click',()=>pick(nd.dataset.en)));
  pick('ORDERS');
}
if($('pEr'))$('pEr').addEventListener('click',()=>{buildErMap();$('erModal').hidden=false;});
if($('erClose'))$('erClose').addEventListener('click',()=>{$('erModal').hidden=true;});
if($('erModal'))$('erModal').addEventListener('click',e=>{if(e.target===$('erModal'))$('erModal').hidden=true;});

/* ---------- progressive 2-step hints & task grading */
function taskHints(t){
  if(t.hints&&t.hints.length)return t.hints;
  const sql=String(t.sql||'').trim();if(!sql)return[];
  if(cur&&cur.course==='linux'){
    const lxKw=['ls','cd','pwd','cat','head','tail','grep','awk','sed','cut','tr','sort','uniq','wc','find','which','chmod','chown','umask','useradd','usermod','id','whoami','sudo','su','ps','pgrep','kill','pkill','top','free','vmstat','uptime','systemctl','journalctl','dmesg','df','du','mount','umount','lsblk','tar','gzip','rsync','ip','ping','ss','lsof','curl','dig','ssh','ssh-keygen','crontab','ulimit','sysctl','export','env','date','uname','hostname','apt','dpkg','ufw'];
    const found=[];
    lxKw.forEach(k=>{const re=new RegExp('\\b'+k+'\\b','i');if(re.test(sql))found.push(k);});
    const h1='Is task mein yeh main Linux commands lagenge: <code>'+esc(found.slice(0,7).join(', ')||'bash command')+'</code>. Dubara dabao toh dhancha (skeleton) dikhega.';
    let idx=0;
    const masked=sql.replace(/'(?:[^']|'')*'/g,"'___'").replace(/"(?:[^"\\]|\\.)*"/g,'"___"').replace(/\b([A-Za-z_0-9\.\/-]+)\b/g,(m)=>{
      if(lxKw.includes(m.toLowerCase())||/^(\||>|>>|2>&1|<)$/.test(m))return m;
      idx++;return idx%2===0?'___':m;
    });
    return[h1,'Dhancha (<code>___</code> ki jagah sahi path ya flag bharo):<pre>'+esc(masked)+'</pre>'];
  }
  const kws=[];
  const checkKw=['SELECT','DISTINCT','FROM','JOIN','LEFT JOIN','RIGHT JOIN','FULL OUTER JOIN','CROSS JOIN','WHERE','GROUP BY','HAVING','ORDER BY','FETCH FIRST','UNION','INTERSECT','MINUS','PIVOT','UNPIVOT','INSERT INTO','UPDATE','DELETE FROM','MERGE INTO','CREATE TABLE','ALTER TABLE','DROP TABLE','TRUNCATE TABLE','CREATE VIEW','CREATE OR REPLACE VIEW','CREATE INDEX','CREATE SEQUENCE','CREATE SYNONYM','DECLARE','BEGIN','EXCEPTION','CURSOR','CREATE OR REPLACE PROCEDURE','CREATE OR REPLACE FUNCTION','CREATE OR REPLACE TRIGGER','CREATE TABLESPACE','ALTER TABLESPACE','DROP TABLESPACE','CREATE USER','ALTER USER','DROP USER','GRANT','REVOKE','CREATE ROLE','SET ROLE','CREATE PROFILE','ALTER PROFILE','DROP PROFILE','CREATE DATABASE LINK','lsnrctl','expdp','impdp','sqlldr'];
  checkKw.forEach(k=>{const re=new RegExp('\\b'+k.replace(/\s+/g,'\\s+')+'\\b','i');if(re.test(sql))kws.push(k);});
  const fnMatch=sql.match(/\b(NVL2?|COALESCE|DECODE|NULLIF|UPPER|LOWER|INITCAP|SUBSTR|INSTR|LENGTH|LPAD|RPAD|TRIM|REPLACE|TRANSLATE|ROUND|TRUNC|MOD|ADD_MONTHS|LAST_DAY|NEXT_DAY|EXTRACT|TO_CHAR|TO_DATE|COUNT|SUM|AVG|MIN|MAX|LISTAGG|ROW_NUMBER|RANK|DENSE_RANK|LAG|LEAD|NTILE|DBMS_OUTPUT\.PUT_LINE)\s*\(/gi);
  if(fnMatch)fnMatch.forEach(f=>{const nm=f.replace(/\s*\($/,'').toUpperCase();if(!kws.includes(nm))kws.push(nm+'()');});
  const h1='Is task mein yeh main hisse lagenge: <code>'+esc(kws.slice(0,7).join(', ')||'SQL command')+'</code>. Dubara dabao toh dhancha (skeleton) dikhega.';
  let idx=0;
  const masked=sql.replace(/'(?:[^']|'')*'/g,"'___'").replace(/\b\d+(?:\.\d+)?[KMGkmg]?\b/g,'___').replace(/\b([A-Za-z_][\w$#]*)\b/g,(m)=>{
    if(SQLKW.has(m.toUpperCase())||/^(lsnrctl|expdp|impdp|sqlldr|cat|ot|dual)$/i.test(m))return m;
    idx++;return idx%2===0?'___':m;
  });
  return[h1,'Dhancha (<code>___</code> ki jagah sahi naam/value bharo):<pre>'+esc(masked)+'</pre>'];
}
function cycleHint(btn,box,t){
  if(!box)return;const hs=taskHints(t);if(!hs.length)return;
  const st=+(box.dataset.hst||0);
  if(st===0){box.dataset.hst='1';box.innerHTML='<b>Hint 1 / '+hs.length+'</b>'+hs[0];box.hidden=false;btn.textContent=hs.length>1?'Hint 2/'+hs.length:'Hint chhupao';}
  else if(st===1&&hs.length>1){box.dataset.hst='2';box.innerHTML='<b>Hint 2 / '+hs.length+'</b>'+hs[1];box.hidden=false;btn.textContent='Hint chhupao';}
  else{box.dataset.hst='0';box.hidden=true;btn.textContent='Hint lo';}
}

let base={id:null,s:null};
function baseFor(l){
  if(base.id!==l.id){
    if(l.course==='linux'){
      const s=LINUX_SIM.create();
      if(l.setup){try{s.run(l.setup);}catch(e){}}
      base={id:l.id,s};
      return base.s;
    }
    const s=SIM.create({});s.run('SET SERVEROUTPUT ON');if(needSysdba(l))s.run('CONNECT / AS SYSDBA');if(l.setup){try{s.run(terminate(l.setup,s));}catch(e){}}base={id:l.id,s};
  }
  return base.s;
}
function collect(s,text){let r;try{r=s.run(terminate(text,s));}catch(e){return{err:'ORA-00600 '+(e&&e.message),out:[]};}
  const lines=r.lines||[];const e=lines.find(x=>x.k==='err'&&/^(ORA-|PLS-|SP2-|TNS-|NL-|LRM-|SQL\*Loader-)/.test(x.t))||lines.find(x=>x.k==='err'&&!/^ERROR at line/.test(x.t));
  return{err:e?e.t:null,errAll:lines.filter(x=>x.k==='err').map(x=>x.t),out:lines.filter(x=>x.k==='out'&&x.t.trim()).map(x=>x.t.trim().replace(/\s+/g,' '))};}
const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const nums=a=>a.join(' ').match(/-?\d+(?:\.\d+)?/g)||[];
function judge(l,t,text){
  if(l.course==='linux'){
    const b=baseFor(l);const cu=b.clone(),ck=b.clone();
    let rU,rK;
    try{rU=cu.run(text);}catch(e){return{ok:false,msg:'Bash error: '+(e&&e.message||e)};}
    try{rK=ck.run(t.sql);}catch(e){return{ok:false,msg:'Expected error: '+(e&&e.message||e)};}
    const uLines=(rU.lines||[]).map(x=>x.t.trim()).filter(Boolean);
    const kLines=(rK.lines||[]).map(x=>x.t.trim()).filter(Boolean);
    const errLine=(rU.lines||[]).find(x=>x.k==='err'&&!t.sql.includes('nonexistent')&&!t.sql.includes('missing')&&!t.sql.includes('fail'));
    if(errLine){return{ok:false,msg:'Error aaya: <code>'+esc(errLine.t)+'</code>. Command check karo aur dubara try karo.'};}
    const outOk=same(uLines,kLines)||same(uLines.slice().sort(),kLines.slice().sort());
    const fpOk=cu.fingerprint()===ck.fingerprint();
    if(outOk||fpOk)return{ok:true,msg:'Sahi! Linux task successfully pass ho gaya.'};
    return{ok:false,msg:'Result match nahi hua. Output sahi command jaisa aana chahiye.',detail:kLines.slice(0,5).join('\n')};
  }
  const b=baseFor(l);const cu=b.clone(),ck=b.clone();
  const U=collect(cu,text),K=collect(ck,t.sql);
  if(U.err)return{ok:false,msg:'Error aaya: <code>'+esc(U.err)+'</code>. Error padho, theek karo aur dobara try karo.',detail:U.errAll.join('\n')};
  const ordered=/\bORDER\s+BY\b/i.test(t.sql);let outOk=true,soft=false;
  if(K.out.length||U.out.length){
    outOk=ordered?same(U.out,K.out):same(U.out.slice().sort(),K.out.slice().sort());
    if(!outOk){const nu=nums(U.out),nk=nums(K.out);if(nk.length&&same(ordered?nu:nu.slice().sort(),ordered?nk:nk.slice().sort())){outOk=true;soft=true;}
      else{const lo=a=>a.map(x=>x.toLowerCase().replace(/[^a-z0-9]+/g,''));if(same(lo(U.out).sort(),lo(K.out).sort())){outOk=true;soft=true;}}}}
  const fpOk=cu.fingerprint()===ck.fingerprint();
  if(outOk&&fpOk)return{ok:true,msg:soft?'Sahi! Values match ho gayi (format thoda alag hai, chalega).':'Sahi! Tumhara result bilkul sahi jawab jaisa hai.'};
  if(!outOk){const ex=K.out.slice(0,6).join('\n')+(K.out.length>6?'\n...':'');
    return{ok:false,msg:'Result match nahi hua. Tumhare output mein '+U.out.length+' line(s) hain, sahi jawab mein '+K.out.length+'.'+(ordered?' Order bhi matter karta hai.':''),detail:ex?'Sahi jawab ka output (shuru ka hissa):\n'+ex:''};}
  return{ok:false,msg:'Database ki haalat sahi jawab jaisi nahi hui (table, data, constraint ya permission alag hai). Task dobara padho.'};
}
function renderTasks(){
  if(!cur)return;const l=cur;const ts=l.tasks||[];const py=l.course==='py',nx=NXC(l.course);
  $('ptLesson').textContent=pad2(l.n)+' · '+l.title;
  let h='';
  if(!ts.length)h+='<p class="note">Is lesson mein practice task nahi hai. Lesson ka code chala ke dekho, ya khud se queries likho.</p>';
  else h+='<p class="note">Task chuno, editor mein jawab likho, phir <b>Check karo</b>. Multi-step tasks ek-ek karke bhi chala sakte ho!</p>';
  ts.forEach((t,i)=>{const pas=passed.has(l.id+'#'+i);
    h+='<div class="task'+(pas?' passed':'')+(i===activeTask?' active':'')+'" data-t="'+i+'"><div class="th"><span class="num">'+(pas?'✓':(i+1))+'</span><span class="tt">'+md(t.t)+'</span></div>'+
      (t.ans?'<div class="pyonly">Yeh kaam Forms/Reports Builder ya server par hota hai, browser mein nahi chalta. Socho, phir jawab dekho.<div><button class="btn ghost" type="button" data-show="'+i+'">Jawab dekho</button></div></div><pre class="cb" data-solp="'+i+'" hidden>'+hlBlock(t.ans,false)+'</pre>':t.py?'<pre class="cb">'+hlBlock(t.py,true)+'</pre><div class="pyonly">Yeh Python code hai. Yeh browser mein nahi chalta: apne computer par <code>pip install oracledb</code> karke chalao.<div><button class="btn ghost" type="button" data-copy="'+i+'">Code copy karo</button></div></div>':
      '<div class="acts"><button class="btn" type="button" data-check="'+i+'">Check karo</button><button class="btn ghost" type="button" data-hint="'+i+'">Hint lo</button><button class="btn ghost" type="button" data-show="'+i+'">Jawab dekho</button></div><div class="hintbox" data-hbox="'+i+'" hidden></div><div data-v="'+i+'"></div><pre class="cb" data-solp="'+i+'" hidden>'+hlBlock(t.sql||'',false)+'</pre><div data-solb="'+i+'" hidden><button class="lk" type="button" data-use="'+i+'">Jawab editor mein daalo</button></div>')+'</div>';});
  if(l.code&&l.code.length&&!py&&!nx)h+='<div class="acts"><button class="btn ghost" type="button" id="ptCode">Lesson ka code editor mein daalo</button></div>';
  const freeMsg=l.course==='linux'?'<div class="freesql"><b>Asli Linux terminal par chalana hai?</b><span>Apne computer par Terminal (Linux / macOS) ya WSL2 (Windows) khol ke <code>ssh oracle@your-server</code> ya local bash par chalao. Virtual production host <code>prod-db01</code> ki tarah practice karo.</span></div>':'<div class="freesql"><b>Asli Oracle par chalana hai?</b><span><a href="https://freesql.com/" target="_blank" rel="noopener">freesql.com</a> par free account bana ke Oracle Database 23ai browser mein chalao. Wahan yeh OT tables nahi hongi'+(l.setup?', isliye pehle lesson ka setup SQL chalao.':'.')+'</span>'+(l.setup?'<div><button class="btn ghost" type="button" id="ptSetup">Setup SQL copy karo</button></div>':'')+'</div>';
  h+=freeMsg;
  const pb=$('ptBody');pb.innerHTML=h;
  pb.querySelectorAll('.task[data-t]').forEach(c=>c.addEventListener('click',e=>{if(e.target.closest('button,a,pre'))return;activeTask=+c.dataset.t;pb.querySelectorAll('.task').forEach(x=>x.classList.toggle('active',x===c));edIn.focus();}));
  pb.querySelectorAll('[data-check]').forEach(b=>b.addEventListener('click',()=>checkTask(+b.dataset.check)));
  pb.querySelectorAll('[data-hint]').forEach(b=>b.addEventListener('click',()=>cycleHint(b,pb.querySelector('[data-hbox="'+b.dataset.hint+'"]'),ts[+b.dataset.hint])));
  pb.querySelectorAll('[data-show]').forEach(b=>b.addEventListener('click',()=>{const i=b.dataset.show;const p=pb.querySelector('[data-solp="'+i+'"]');p.hidden=!p.hidden;const sb=pb.querySelector('[data-solb="'+i+'"]');if(sb)sb.hidden=p.hidden;b.textContent=p.hidden?'Jawab dekho':'Jawab chhupao';}));
  pb.querySelectorAll('[data-use]').forEach(b=>b.addEventListener('click',()=>{edIn.value=ts[+b.dataset.use].sql;paintEd();edIn.focus();}));
  pb.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',()=>copyText(ts[+b.dataset.copy].py,b)));
  const pc=$('ptCode');if(pc)pc.addEventListener('click',()=>{edIn.value=runnable(l);paintEd();edIn.focus();});
  const ps=$('ptSetup');if(ps)ps.addEventListener('click',()=>copyText(l.setup,ps));
}
function checkTask(i){
  const l=cur,t=l.tasks[i];activeTask=i;const v=$('ptBody').querySelector('[data-v="'+i+'"]');
  $('ptBody').querySelectorAll('.task').forEach(x=>x.classList.toggle('active',+x.dataset.t===i));
  let text=edIn.value;
  if(text.trim()){if(l.course!=='linux')text=terminate(text);edIn.value='';paintEd();runText(text);}else text=lastRun;
  if(!text||!text.trim()){v.innerHTML='<div class="verdict bad">Pehle editor mein apna jawab likho, phir Check karo.</div>';return;}
  let res;try{
    res=judge(l,t,text);
    if(!res.ok&&pgLog.length>1){const combined=l.course==='linux'?pgLog.join('\n'):pgLog.map(x=>terminate(x)).join('\n');const r2=judge(l,t,combined);if(r2.ok)res=r2;}
  }catch(e){res={ok:false,msg:'Check nahi ho paya: '+esc(e&&e.message)};}
  v.innerHTML='<div class="verdict '+(res.ok?'ok':'bad')+'">'+res.msg+(res.detail?'<pre>'+esc(res.detail)+'</pre>':'')+'</div>';
  if(res.ok){passed.add(l.id+'#'+i);store.set('tasks',[...passed]);const c=v.closest('.task');c.classList.add('passed');c.querySelector('.num').textContent='✓';
    const pt=$('p-practice').querySelectorAll('.task')[i];if(pt)pt.classList.add('passed');}
}
function setMode(m){
  mode=m;$('lv').hidden=m!=='lesson';$('pv').hidden=m!=='play';
  $('mLesson').setAttribute('aria-selected',m==='lesson'?'true':'false');$('mPlay').setAttribute('aria-selected',m==='play'?'true':'false');
  if(m==='play'){if(playing){setPlaying(false);pauseVoice();}stopVoice();if(cur&&cur.course==='linux'){if(!lpg)lpg=LINUX_SIM.create();}else{if(!pg)newPg();}welcome();ensureSetup(cur);renderTasks();refreshSchema();setTimeout(()=>edIn.focus(),30);}
  else{sizeCaption();}
}
function openPlay(text,taskIdx){setMode('play');if(taskIdx!=null){activeTask=taskIdx;renderTasks();const c=$('ptBody').querySelector('[data-t="'+taskIdx+'"]');if(c)c.scrollIntoView({block:'nearest'});}
  if(text){edIn.value=text;paintEd();}edIn.focus();}
$('mLesson').addEventListener('click',()=>setMode('lesson'));
$('mPlay').addEventListener('click',()=>setMode('play'));

/* ---------- routing and boot */
window.addEventListener('hashchange',()=>{const id=location.hash.slice(1);
  if(id==='playground'){setMode('play');return;}
  if(byId[id]&&(!cur||cur.id!==id)){if(mode!=='lesson')setMode('lesson');loadLesson(id);}});
courseRows();
const h0=location.hash.slice(1);const last=store.get('last',null);
const startId=byId[h0]?h0:(last&&byId[last]?last:(ALL[0]&&ALL[0].id));
if(startId){loadLesson(startId,{rest:true});if(h0==='playground')setMode('play');}
requestAnimationFrame(loop);
window.__oim={ALL,byId,goStep:(k,a)=>goStep(k,!!a),load:id=>loadLesson(id,{rest:true}),
  reloadProgress:()=>{done=new Set(store.get('done',[]));passed=new Set(store.get('tasks',[]));courseRows();buildNav();if(mode==='play')renderTasks();},play:id=>loadLesson(id),state:()=>({id:cur&&cur.id,step,playing,voiceWait,mode,tab}),
  setMode,run:t=>runText(t),judge:(id,i,text)=>judge(byId[id],byId[id].tasks[i],text),audio:()=>({src:player.currentSrc,t:player.currentTime,paused:player.paused,clip}),voice:on=>setVoice(!!on),begin,stage};
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'))window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
})();

