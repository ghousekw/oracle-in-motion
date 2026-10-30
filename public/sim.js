const SIM=(function(){
"use strict";
/* ===== core: errors, lexer, data types, date/number conversion ===== */
class OraErr extends Error{
  constructor(code,msg,extra){super(code+(msg?': '+msg:''));this.code=code;this.ora=msg;this.extra=extra||[];
    const m=/^ORA-(\d+)/.exec(code);this.num=m?-parseInt(m[1],10):0;if(this.num===-1403)this.num=100;}
}
const E=(code,msg,extra)=>new OraErr(code,msg,extra);
const hint=t=>'('+t+')';

/* ---------- lexer ---------- */
const OPS2=['<>','!=','^=','<=','>=','||',':=','=>','..','**'];
function lex(src){
  const t=[];let i=0,line=1,col=1;const n=src.length;
  const adv=k=>{for(let j=0;j<k;j++){if(src[i]==='\n'){line++;col=1;}else col++;i++;}};
  while(i<n){
    const c=src[i];
    if(c===' '||c==='\t'||c==='\r'||c==='\n'){adv(1);continue;}
    if(c==='-'&&src[i+1]==='-'){while(i<n&&src[i]!=='\n')adv(1);continue;}
    if(c==='/'&&src[i+1]==='*'){const j=src.indexOf('*/',i+2);adv((j<0?n:j+2)-i);continue;}
    const L=line,C=col,P=i;
    /* q'[...]' and N'...' */
    if((c==='q'||c==='Q')&&src[i+1]==="'"&&i+2<n){const open=src[i+2];const close={'[':']','{':'}','(':')','<':'>'}[open]||open;
      const j=src.indexOf(close+"'",i+3);if(j<0)throw E('ORA-01756','quoted string not properly terminated');
      const v=src.slice(i+3,j);adv(j+2-i);t.push({k:'str',v,raw:src.slice(P,i),line:L,col:C,pos:P,end:i});continue;}
    if((c==='n'||c==='N')&&src[i+1]==="'"){adv(1);}
    if(src[i]==="'"){let j=i+1,v='';
      while(true){if(j>=n)throw E('ORA-01756','quoted string not properly terminated');if(src[j]==="'"){if(src[j+1]==="'"){v+="'";j+=2;continue;}break;}v+=src[j++];}
      adv(j+1-i);t.push({k:'str',v,raw:src.slice(P,i),line:L,col:C,pos:P,end:i});continue;}
    if(c==='"'){const j=src.indexOf('"',i+1);if(j<0)throw E('ORA-01740','missing double quote in identifier');const v=src.slice(i+1,j);
      if(!v)throw E('ORA-01741','illegal zero-length identifier');adv(j+1-i);t.push({k:'id',v,q:1,raw:src.slice(P,i),line:L,col:C,pos:P,end:i});continue;}
    let m;
    if(/[0-9]/.test(c)||(c==='.'&&/[0-9]/.test(src[i+1]||''))){
      m=/^(\d*\.?\d+(?:[eE][+-]?\d+)?|\d+\.(?!\.))([fFdD](?![A-Za-z0-9_]))?([kKmMgGtT](?![A-Za-z0-9_$#]))?/.exec(src.slice(i,i+60));
      if(m&&!(src[i+m[0].length]==='.'&&src[i+m[0].length+1]==='.'&&m[1].endsWith('.'))){
        let raw=m[1];if(raw.endsWith('.')&&src[i+raw.length]==='.'){raw=raw.slice(0,-1);}
        const len=m[3]?raw.length+(m[2]?1:0)+1:raw.length+(m[2]?1:0);
        adv(len);t.push({k:'num',v:parseFloat(raw),raw:src.slice(P,i),unit:m[3]?m[3].toUpperCase():null,bin:m[2]?m[2].toUpperCase():null,line:L,col:C,pos:P,end:i});continue;}
    }
    if(/[A-Za-z_]/.test(c)||c.charCodeAt(0)>127){m=/^[A-Za-z_\u0080-￿][A-Za-z0-9_$#\u0080-￿]*/.exec(src.slice(i,i+200));
      adv(m[0].length);t.push({k:'id',v:m[0].toUpperCase(),raw:m[0],line:L,col:C,pos:P,end:i});continue;}
    if(c===':'&&/[A-Za-z0-9_"]/.test(src[i+1]||'')){m=/^:("?)([A-Za-z0-9_$#]+)\1/.exec(src.slice(i,i+100));
      adv(m[0].length);t.push({k:'bind',v:m[1]?m[2]:m[2].toUpperCase(),raw:m[0],line:L,col:C,pos:P,end:i});continue;}
    const two=src.slice(i,i+2);
    if(OPS2.includes(two)){adv(2);t.push({k:'op',v:two==='^='||two==='!='?'<>':two,raw:two,line:L,col:C,pos:P,end:i});continue;}
    if(c==='('&&src[i+1]==='+'&&src[i+2]===')'){adv(3);t.push({k:'op',v:'(+)',raw:'(+)',line:L,col:C,pos:P,end:i});continue;}
    adv(1);t.push({k:'op',v:c,raw:c,line:L,col:C,pos:P,end:i});
  }
  return t;
}
const RESERVED=new Set(('ACCESS ADD ALL ALTER AND ANY AS ASC AUDIT BETWEEN BY CHAR CHECK CLUSTER COLUMN COMMENT COMPRESS CONNECT CREATE CURRENT DATE DECIMAL DEFAULT DELETE DESC DISTINCT DROP ELSE EXCLUSIVE EXISTS FILE FLOAT FOR FROM GRANT GROUP HAVING IDENTIFIED IMMEDIATE IN INCREMENT INDEX INITIAL INSERT INTEGER INTERSECT INTO IS LEVEL LIKE LOCK LONG MAXEXTENTS MINUS MLSLABEL MODE MODIFY NOAUDIT NOCOMPRESS NOT NOWAIT NULL NUMBER OF OFFLINE ON ONLINE OPTION OR ORDER PCTFREE PRIOR PUBLIC RAW RENAME RESOURCE REVOKE ROW ROWID ROWNUM ROWS SELECT SESSION SET SHARE SIZE SMALLINT START SUCCESSFUL SYNONYM SYSDATE TABLE THEN TO TRIGGER UID UNION UNIQUE UPDATE USER VALIDATE VALUES VARCHAR VARCHAR2 VIEW WHENEVER WHERE WITH').split(' '));

/* ---------- token stream ---------- */
class P{
  constructor(toks,src){this.t=toks;this.i=0;this.src=src||'';}
  peek(n){return this.t[this.i+(n||0)];}
  eof(){return this.i>=this.t.length;}
  next(){const x=this.t[this.i++];if(!x)throw this.errEnd();return x;}
  last(){return this.t[this.i-1];}
  isW(w,n){const x=this.t[this.i+(n||0)];return !!x&&x.k==='id'&&!x.q&&x.v===w;}
  isAnyW(ws,n){const x=this.t[this.i+(n||0)];return !!x&&x.k==='id'&&!x.q&&ws.includes(x.v);}
  isOp(o,n){const x=this.t[this.i+(n||0)];return !!x&&x.k==='op'&&x.v===o;}
  acceptW(...ws){for(let k=0;k<ws.length;k++)if(!this.isW(ws[k],k))return false;this.i+=ws.length;return true;}
  acceptOp(o){if(this.isOp(o)){this.i++;return true;}return false;}
  errAt(code,msg,extra){const x=this.peek()||this.last();const e=E(code,msg,extra);if(x){e.line=x.line;e.col=x.col;}return e;}
  errEnd(){return this.errAt('ORA-00933','SQL command not properly ended');}
  expectW(...ws){if(!this.acceptW(...ws)){const x=this.peek();
      if(ws[0]==='FROM')throw this.errAt('ORA-00923','FROM keyword not found where expected');
      if(ws[0]==='INTO')throw this.errAt('ORA-00925','missing INTO keyword');
      if(ws[0]==='SET')throw this.errAt('ORA-00971','missing SET keyword');
      if(ws[0]==='VALUES')throw this.errAt('ORA-00926','missing VALUES keyword');
      if(ws[0]==='BY')throw this.errAt('ORA-00924','missing BY keyword');
      if(ws[0]==='THEN')throw this.errAt('ORA-00905','missing keyword');
      if(ws[0]==='TABLE'||ws[0]==='ON'||ws[0]==='TO'||ws[0]==='AS')throw this.errAt('ORA-00905','missing keyword');
      throw this.errAt('ORA-00922','missing or invalid option',x?[hint('"'+ws.join(' ')+'" expected tha, mila "'+(x.raw||x.v)+'"')]:[]);}}
  expectOp(o){if(!this.acceptOp(o)){
      if(o===')')throw this.errAt('ORA-00907','missing right parenthesis');
      if(o==='(')throw this.errAt('ORA-00906','missing left parenthesis');
      if(o==='=')throw this.errAt('ORA-00927','missing equal sign');
      if(o===',')throw this.errAt('ORA-00917','missing comma');
      throw this.errAt('ORA-00922','missing or invalid option');}}
  ident(what){const x=this.peek();if(!x||x.k!=='id'){
      if(what==='table')throw this.errAt('ORA-00903','invalid table name');
      if(what==='column')throw this.errAt('ORA-00904',(x?'"'+(x.raw||x.v)+'"':'')+': invalid identifier');
      throw this.errAt('ORA-00903','invalid name');}
    this.i++;return x.v;}
  str(){const x=this.next();if(x.k!=='str')throw this.errAt('ORA-00922','missing or invalid option',[hint('Yahan quotes mein value chahiye, jaise \'abc\'.')]);return x.v;}
  num(){let neg=false;if(this.acceptOp('-'))neg=true;const x=this.next();if(x.k!=='num')throw this.errAt('ORA-01722','invalid number');return neg?-x.v:x.v;}
  sizeMB(){const x=this.next();if(x.k!=='num')throw this.errAt('ORA-02180','invalid option for CREATE TABLESPACE');return toMB(x.v,x.unit);}
  qname(){const a=this.ident('table');let owner=null,name=a,link=null;
    if(this.isOp('.')&&this.peek(1)&&this.peek(1).k==='id'){this.i++;owner=a;name=this.ident('table');}
    if(this.acceptOp('@')){link=this.ident();while(this.isOp('.')&&this.peek(1)&&this.peek(1).k==='id'){this.i++;link+='.'+this.ident();}}
    return{owner,name,link};}
  textFrom(a,b){const s=this.t[a],e=this.t[(b==null?this.i:b)-1];if(!s||!e)return'';return this.src.slice(s.pos,e.end);}
}
function toMB(v,u){u=u||'';return u==='K'?v/1024:u==='M'?v:u==='G'?v*1024:u==='T'?v*1048576:v/1048576;}

/* ---------- data types ---------- */
const INT_TYPES={INTEGER:1,INT:1,SMALLINT:1,PLS_INTEGER:1,BINARY_INTEGER:1,NATURAL:1,NATURALN:1,POSITIVE:1,POSITIVEN:1,SIMPLE_INTEGER:1,SIGNTYPE:1};
function parseType(p){
  const w=p.ident('type');let t;
  const optLen=()=>{if(p.acceptOp('(')){const a=p.num();let b=null;let unit=null;if(p.acceptOp(','))b=p.num();if((w==='NCHAR'||w==='NVARCHAR2')&&(p.isW('BYTE')||p.isW('CHAR')))throw p.errAt('ORA-00907','missing right parenthesis');if(p.acceptW('BYTE'))unit='BYTE';else if(p.acceptW('CHAR'))unit='CHAR';p.expectOp(')');return[a,b,unit];}return[null,null,null];};
  switch(w){
    case'NUMBER':case'NUMERIC':case'DECIMAL':case'DEC':{if(p.isOp('(')&&p.isOp('*',1)){p.i+=2;let s=null;if(p.acceptOp(','))s=p.num();p.expectOp(')');t={base:'NUMBER',p:null,s};break;}
      const[a,b]=optLen();t={base:'NUMBER',p:a,s:b==null&&a!=null?0:b};if(w!=='NUMBER'&&a==null)t={base:'NUMBER',p:38,s:0};break;}
    case'FLOAT':{const[a]=optLen();t={base:'FLOAT',p:a==null?126:a};break;}
    case'REAL':t={base:'FLOAT',p:63};break;
    case'DOUBLE':p.acceptW('PRECISION');t={base:'FLOAT',p:126};break;
    case'BINARY_FLOAT':t={base:'BINARY_FLOAT'};break;
    case'BINARY_DOUBLE':t={base:'BINARY_DOUBLE'};break;
    case'VARCHAR2':case'VARCHAR':case'NVARCHAR2':case'STRING':{const[a,,u]=optLen();t={base:w==='NVARCHAR2'?'NVARCHAR2':'VARCHAR2',len:a,unit:u};break;}
    case'CHAR':case'NCHAR':case'CHARACTER':{if(p.acceptW('VARYING')){const[a]=optLen();t={base:'VARCHAR2',len:a};break;}const[a,,u]=optLen();t={base:w==='NCHAR'?'NCHAR':'CHAR',len:a==null?1:a,unit:u};break;}
    case'LONG':if(p.acceptW('RAW')){t={base:'LONG RAW'};break;}t={base:'LONG'};break;
    case'RAW':{const[a]=optLen();t={base:'RAW',len:a};break;}
    case'CLOB':case'NCLOB':case'BLOB':case'BFILE':case'ROWID':case'UROWID':case'BOOLEAN':case'SYS_REFCURSOR':case'XMLTYPE':case'JSON':t={base:w};break;
    case'DATE':t={base:'DATE'};break;
    case'TIMESTAMP':{const[a]=optLen();if(a!=null&&(a<0||a>9))throw E('ORA-30088','datetime/interval precision is out of range');const fp=a==null?6:a;
      if(p.acceptW('WITH','LOCAL','TIME','ZONE'))t={base:'TIMESTAMP WITH LOCAL TIME ZONE',fp};
      else if(p.acceptW('WITH','TIME','ZONE'))t={base:'TIMESTAMP WITH TIME ZONE',fp};
      else t={base:'TIMESTAMP',fp};break;}
    case'INTERVAL':{if(p.acceptW('YEAR')){const[a]=optLen();p.expectW('TO');p.expectW('MONTH');t={base:'INTERVAL YEAR TO MONTH',lp:a==null?2:a};}
      else{p.expectW('DAY');const[a]=optLen();p.expectW('TO');p.expectW('SECOND');const[b]=optLen();t={base:'INTERVAL DAY TO SECOND',lp:a==null?2:a,fp:b==null?6:b};}break;}
    default:
      if(INT_TYPES[w]){t={base:w==='INTEGER'||w==='INT'||w==='SMALLINT'?'NUMBER':w,p:38,s:0,int:1};break;}
      t={base:'USER',name:w};if(p.isOp('.')&&p.peek(1)&&p.peek(1).k==='id'){p.i++;t.name=w+'.'+p.ident();}
      if(p.isOp('%')&&p.peek(1)&&p.peek(1).k==='id'&&(p.peek(1).v==='TYPE'||p.peek(1).v==='ROWTYPE')){p.i++;t={base:p.next().v==='TYPE'?'%TYPE':'%ROWTYPE',ref:t.name};}
  }
  return t;
}
function typeStr(t){
  if(!t)return'';
  switch(t.base){
    case'NUMBER':if(t.int&&t.p===38&&t.s===0)return'NUMBER(38)';return t.p==null?(t.s!=null?'NUMBER(*,'+t.s+')':'NUMBER'):'NUMBER('+t.p+(t.s?','+t.s:'')+')';
    case'FLOAT':return'FLOAT('+t.p+')';
    case'VARCHAR2':case'NVARCHAR2':case'RAW':return t.base+'('+(t.len==null?'':t.len)+(t.unit==='CHAR'?' CHAR':'')+')';
    case'CHAR':case'NCHAR':return t.base+'('+t.len+(t.unit==='CHAR'?' CHAR':'')+')';
    case'TIMESTAMP':return'TIMESTAMP('+t.fp+')';
    case'TIMESTAMP WITH TIME ZONE':return'TIMESTAMP('+t.fp+') WITH TIME ZONE';
    case'TIMESTAMP WITH LOCAL TIME ZONE':return'TIMESTAMP('+t.fp+') WITH LOCAL TIME ZONE';
    case'INTERVAL YEAR TO MONTH':return'INTERVAL YEAR('+t.lp+') TO MONTH';
    case'INTERVAL DAY TO SECOND':return'INTERVAL DAY('+t.lp+') TO SECOND('+t.fp+')';
    case'USER':return t.name;
    default:return t.base;
  }
}
const isCharT=t=>t&&/^(VARCHAR2|NVARCHAR2|CHAR|NCHAR|CLOB|NCLOB|LONG)$/.test(t.base);
const isNumT=t=>t&&/^(NUMBER|FLOAT|BINARY_FLOAT|BINARY_DOUBLE|PLS_INTEGER|BINARY_INTEGER|NATURAL|NATURALN|POSITIVE|POSITIVEN|SIMPLE_INTEGER|SIGNTYPE)$/.test(t.base);
const isDateT=t=>t&&/^(DATE|TIMESTAMP)/.test(t.base);

/* ---------- datetime values ---------- */
/* s = seconds since epoch of the wall-clock time (as if UTC), ns = fractional nanoseconds, tz = {off:minutes,name} for TSTZ */
class DT{constructor(kind,s,ns,tz){this.kind=kind;this.s=s;this.ns=ns||0;this.tz=tz||null;}
  utc(){return this.tz?this.s-this.tz.off*60:this.s;}}
class IV{constructor(kind,a,ns){this.kind=kind;if(kind==='YM')this.m=a;else{this.s=a;this.ns=ns||0;}}}
const MON=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const DAYN=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const ROMAN=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
function fields(s){const d=new Date(s*1000);return{Y:d.getUTCFullYear(),M:d.getUTCMonth()+1,D:d.getUTCDate(),h:d.getUTCHours(),mi:d.getUTCMinutes(),sec:d.getUTCSeconds(),dow:d.getUTCDay()};}
function mkS(Y,M,D,h,mi,sec){return Math.floor(Date.UTC(Y,M-1,D,h||0,mi||0,sec||0)/1000)-(Y<100&&Y>=0?0:0);}
function mkSY(Y,M,D,h,mi,sec){const d=new Date(0);d.setUTCFullYear(Y,M-1,D);d.setUTCHours(h||0,mi||0,sec||0,0);return Math.floor(d.getTime()/1000);}
const dim=(Y,M)=>new Date(Date.UTC(Y,M,0)).getUTCDate();
function dayOfYear(f){return Math.round((Date.UTC(f.Y,f.M-1,f.D)-Date.UTC(f.Y,0,1))/864e5)+1;}
function isoWeek(f){const d=new Date(Date.UTC(f.Y,f.M-1,f.D));const day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day+3);const fy=d.getUTCFullYear();const jan4=new Date(Date.UTC(fy,0,4));return{w:1+Math.round(((d-jan4)/864e5-3+((jan4.getUTCDay()+6)%7))/7),y:fy};}
function julian(f){return Math.floor(Date.UTC(f.Y,f.M-1,f.D)/864e5)+2440588;}

/* ---------- time zones ---------- */
const TZ_ABBR={GMT:0,UTC:0,EST:-300,EDT:-240,CST:-360,CDT:-300,MST:-420,MDT:-360,PST:-480,PDT:-420,AST:-240,ADT:-180,HST:-600,HDT:-540,YST:-540,YDT:-480,AKST:-540,AKDT:-480,NST:-210,BST:-660,BDT:-600,IST:330,CET:60,CEST:120,EET:120,EEST:180,WET:0,JST:540,KST:540,AEST:600,AEDT:660,SGT:480,GST:240};
const NEWTIME_ABBR={AST:-240,ADT:-180,BST:-660,BDT:-600,CST:-360,CDT:-300,EST:-300,EDT:-240,GMT:0,HST:-600,HDT:-540,MST:-420,MDT:-360,NST:-210,PST:-480,PDT:-420,YST:-540,YDT:-480};
const TZ_ALIAS={'US/EASTERN':'America/New_York','US/CENTRAL':'America/Chicago','US/MOUNTAIN':'America/Denver','US/PACIFIC':'America/Los_Angeles','US/ALASKA':'America/Anchorage','US/HAWAII':'Pacific/Honolulu','EST5EDT':'America/New_York','PST8PDT':'America/Los_Angeles','CST6CDT':'America/Chicago','MST7MDT':'America/Denver'};
function regionName(n){const u=String(n).toUpperCase();if(TZ_ALIAS[u])return TZ_ALIAS[u];
  try{const z=Intl.DateTimeFormat('en-US',{timeZone:n}).resolvedOptions().timeZone;return z;}catch(e){}
  try{const parts=String(n).split('/').map(x=>x.split('_').map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join('_')).join('/');Intl.DateTimeFormat('en-US',{timeZone:parts});return parts;}catch(e){}
  return null;}
function regionOffset(region,utcSec){/* minutes east of UTC for the region at that instant */
  try{const d=new Date(utcSec*1000);const f=new Intl.DateTimeFormat('en-US',{timeZone:region,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const o={};f.formatToParts(d).forEach(x=>{o[x.type]=x.value;});const asUTC=Date.UTC(+o.year,+o.month-1,+o.day,+o.hour%24,+o.minute,+o.second);return Math.round((asUTC-d.getTime())/60000);}catch(e){return 0;}}
function regionAbbr(region,utcSec){try{const f=new Intl.DateTimeFormat('en-US',{timeZone:region,timeZoneName:'short'});const p=f.formatToParts(new Date(utcSec*1000)).find(x=>x.type==='timeZoneName');return p?p.value.replace(/^GMT([+-]\d+)?$/,(m,a)=>a?'':'GMT'):'';}catch(e){return'';}}
const offStr=m=>(m<0?'-':'+')+String(Math.floor(Math.abs(m)/60)).padStart(2,'0')+':'+String(Math.abs(m)%60).padStart(2,'0');
/* parse a time zone spec ('+05:30', '-07:00', 'Asia/Kolkata', 'EST') into {off,name} for a wall-clock second */
function parseTZ(spec,wallSec){
  const s=String(spec).trim();let m=/^([+-])(\d{1,2}):?(\d{2})?$/.exec(s);
  if(m){const off=(m[1]==='-'?-1:1)*(parseInt(m[2],10)*60+parseInt(m[3]||'0',10));if(Math.abs(off)>14*60)throw E('ORA-01874','time zone hour must be between -15 and 15');return{off,name:null};}
  const u=s.toUpperCase();
  if(TZ_ABBR[u]!=null&&!/\//.test(s))return{off:TZ_ABBR[u],name:u};
  const r=regionName(s);if(!r)throw E('ORA-01882','timezone region not found');
  let off=regionOffset(r,wallSec);off=regionOffset(r,wallSec-off*60);return{off,name:r.replace(/^(.)/,c=>c)};
}

/* ---------- numbers ---------- */
function numToStr(n){
  if(n==null)return null;if(typeof n!=='number')return String(n);
  if(!isFinite(n))return n>0?'~':'-~';if(Object.is(n,-0))n=0;
  if(Number.isInteger(n)&&Math.abs(n)<1e21)return String(n);
  let s=String(Number(n.toPrecision(15)));
  if(/e/.test(s)){const[mant,ex]=s.split('e');const e=parseInt(ex,10);
    if(e<0&&e>-40){const neg=mant[0]==='-';const dig=mant.replace(/[-.]/g,'');s=(neg?'-':'')+'.'+'0'.repeat(-e-1)+dig.replace(/0+$/,'');}
    else if(e>=21&&e<40){const neg=mant[0]==='-';const dig=mant.replace(/[-.]/g,'');s=(neg?'-':'')+dig+'0'.repeat(e-(dig.length-1));}
    else{const sig=Number(mant).toFixed(4).replace(/\.?0+$/,'');s=(sig.includes('.')?sig:sig+'.0000').replace(/(\.\d*?)0*$/,'$1')+'E'+(e<0?'-':'+')+String(Math.abs(e)).padStart(2,'0');}}
  return s.replace(/^(-?)0\./,'$1.');
}
const NUM_RE=/^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/;
function strToNum(s){if(s==null)return null;if(typeof s==='number')return s;if(typeof s==='boolean')throw E('ORA-01722','invalid number');
  if(s instanceof DT||s instanceof IV)throw E('ORA-00932','inconsistent datatypes: expected NUMBER got '+(s instanceof DT?'DATE':'INTERVAL'));
  const t=String(s);if(!NUM_RE.test(t))throw E('ORA-01722','invalid number');return parseFloat(t);}
function roundHalfUp(x,d){const f=Math.pow(10,d);const v=Math.abs(x)*f;let r=Math.round(v+1e-9*Math.max(1,v));if(Math.abs(v-Math.round(v))<1e-9)r=Math.round(v);return Math.sign(x)*r/f;}
function oraRound(x,d){d=d||0;if(d>=0){const r=roundHalfUp(x,d);return Object.is(r,-0)?0:r;}const f=Math.pow(10,-d);const r=Math.sign(x)*Math.floor(Math.abs(x)/f+0.5+1e-12)*f;return Object.is(r,-0)?0:r;}
function oraTrunc(x,d){d=d||0;const f=Math.pow(10,d);const r=Math.trunc(x*f+(x>=0?1e-9:-1e-9))/f;return Object.is(r,-0)?0:r;}
/* number format models: 9 0 , . G D $ L MI S PR FM EEEE X V B */
function fmtNumber(n,fmt,nls){
  if(n==null)return null;let f=String(fmt);const U=f.toUpperCase();
  let fm=false;let s=U;if(s.startsWith('FM')){fm=true;s=s.slice(2);}
  if(/^X+$/.test(s.replace(/^0+/,'')||'X')&&/X/.test(s)){const h=Math.round(n).toString(16);const w=s.length;if(h.length>w)return'#'.repeat(w+1);const out=(s[0]==='0'?h.padStart(w,'0'):h.padStart(w,' '));return(f.includes('x')?out:out.toUpperCase());}
  const cur=nls&&nls.currency||'$';
  let mi=false,sg=null,pr=false,ee=false,dollar=false,lcur=false;
  if(s.endsWith('MI')){mi=true;s=s.slice(0,-2);}if(s.endsWith('PR')){pr=true;s=s.slice(0,-2);}
  if(s.startsWith('S')){sg='lead';s=s.slice(1);}else if(s.endsWith('S')){sg='trail';s=s.slice(0,-1);}
  if(s.includes('EEEE')){ee=true;s=s.replace('EEEE','');}
  if(s.includes('$')){dollar=true;s=s.replace('$','');}
  if(s.startsWith('L')){lcur=true;s=s.slice(1);}else if(s.includes('L')){lcur=true;s=s.replace('L','');}
  s=s.replace(/G/g,',').replace(/D/g,'.');
  const dot=s.indexOf('.');const intP=dot<0?s:s.slice(0,dot);const decP=dot<0?'':s.slice(dot+1);
  const dec=decP.replace(/[^90]/g,'').length;
  const neg=n<0;let a=Math.abs(n);
  if(ee){let e=a===0?0:Math.floor(Math.log10(a));let m=a/Math.pow(10,e);m=roundHalfUp(m,dec);if(m>=10){m/=10;e++;}
    const body=m.toFixed(dec)+'E'+(e<0?'-':'+')+String(Math.abs(e)).padStart(2,'0');return(neg?'-':fm?'':' ')+body;}
  a=roundHalfUp(a,dec);
  let [ip,dp]=a.toFixed(dec).split('.');dp=dp||'';
  const digitSlots=intP.replace(/[^90]/g,'').length;
  if(ip==='0'&&!/0/.test(intP))ip='';
  if(ip.length>digitSlots){return'#'.repeat(s.length+1+(dollar?1:0));}
  /* fill integer part right-to-left */
  let out='';let k=ip.length-1;const firstZero=intP.indexOf('0');
  for(let j=intP.length-1;j>=0;j--){const c=intP[j];
    if(c==='9'||c==='0'){if(k>=0){out=ip[k--]+out;}else if(c==='0'||(firstZero>=0&&j>=firstZero)){out='0'+out;}else out=' '+out;}
    else if(c===','){out=(k>=0||(firstZero>=0&&j>firstZero)?',':' ')+out;}
    else out=c+out;}
  let r=out+(dot>=0?'.'+dp:'');
  if(dollar)r=r.replace(/^(\s*)/,'$1$');if(lcur)r=r.replace(/^(\s*)/,'$1'+cur);
  if(sg==='lead')r=r.replace(/^(\s*)/,'$1'+(neg?'-':'+'));else if(sg==='trail')r=r+(neg?'-':'+');
  else if(mi)r=r+(neg?'-':(fm?'':' '));else if(pr)r=neg?'<'+r.trim()+'>':r+(fm?'':' ');
  else r=r.replace(/^(\s*)/,(m0,sp)=>neg?(sp.length?sp.slice(1)+'-':'-'):(fm?sp:sp+' '));
  if(fm)r=r.replace(/^\s+/,'').replace(/\s+$/,'');
  if(!fm&&!neg&&!sg&&!mi&&!pr&&r[0]!==' ')r=' '+r.slice(r[0]===' '?1:0);
  return r;
}
function parseNumberFmt(str,fmt){const s=String(str).trim().replace(/[$,\s]/g,'').replace(/^<(.*)>$/,'-$1').replace(/^(.*)-$/,'-$1');if(!NUM_RE.test(s))throw E('ORA-01722','invalid number');return parseFloat(s);}

/* ---------- number to words (for SP / YEAR formats) ---------- */
const ONES=['ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
const TENS=['','','TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'];
function words(n){if(n<20)return ONES[n];if(n<100)return TENS[Math.floor(n/10)]+(n%10?'-'+ONES[n%10]:'');if(n<1000)return ONES[Math.floor(n/100)]+' HUNDRED'+(n%100?' '+words(n%100):'');
  if(n<1e6)return words(Math.floor(n/1000))+' THOUSAND'+(n%1000?' '+words(n%1000):'');return words(Math.floor(n/1e6))+' MILLION'+(n%1e6?' '+words(n%1e6):'');}
function ordWords(n){const w=words(n);const map={ONE:'FIRST',TWO:'SECOND',THREE:'THIRD',FIVE:'FIFTH',EIGHT:'EIGHTH',NINE:'NINTH',TWELVE:'TWELFTH'};
  const m=/(.*?)([A-Z]+)$/.exec(w);const last=m[2];const ord=map[last]||(last.endsWith('Y')?last.slice(0,-1)+'IETH':last+'TH');return m[1]+ord;}
function yearWords(y){const a=Math.floor(y/100),b=y%100;if(b<10&&a%10===0)return words(y);return words(a)+(b?' '+words(b):' HUNDRED');}
const ordSuffix=n=>{const t=n%100;if(t>=11&&t<=13)return'TH';return['TH','ST','ND','RD','TH','TH','TH','TH','TH','TH'][n%10];};

/* ---------- date format models ---------- */
const DFMT_TOKENS=['SYYYY','YYYY','IYYY','YEAR','SYEAR','RRRR','YYY','IYY','YY','IY','RR','Y','I','MONTH','MON','MM','RM','Q','WW','IW','W','DDD','DD','DAY','DY','D','J','HH24','HH12','HH','MI','SSSSS','SS','FF9','FF8','FF7','FF6','FF5','FF4','FF3','FF2','FF1','FF','AM','PM','A.M.','P.M.','AD','BC','A.D.','B.C.','TZH','TZM','TZR','TZD','CC','SCC','FM','FX','X','DL','DS','TS','E','EE'];
const DFMT_SORTED=DFMT_TOKENS.slice().sort((a,b)=>b.length-a.length);
function tokFmt(fmt){
  const out=[];let i=0;const s=String(fmt);
  while(i<s.length){
    if(s[i]==='"'){const j=s.indexOf('"',i+1);out.push({lit:s.slice(i+1,j<0?s.length:j)});i=j<0?s.length:j+1;continue;}
    let hit=null;const up=s.slice(i).toUpperCase();
    for(const tk of DFMT_SORTED){if(up.startsWith(tk)){hit=tk;break;}}
    if(hit){const raw=s.slice(i,i+hit.length);i+=hit.length;let suf='';
      const rest=s.slice(i).toUpperCase();let sufRaw='';if(rest.startsWith('SPTH')||rest.startsWith('THSP')){suf='SPTH';sufRaw=s.slice(i,i+4);i+=4;}else if(rest.startsWith('SP')){suf='SP';sufRaw=s.slice(i,i+2);i+=2;}else if(rest.startsWith('TH')&&hit!=='MONTH'){suf='TH';sufRaw=s.slice(i,i+2);i+=2;}
      out.push({tk:hit,raw,suf,sufRaw});continue;}
    if(/[-\/,.;:\s]/.test(s[i])){out.push({lit:s[i]});i++;continue;}
    throw E('ORA-01821','date format not recognized');
  }
  return out;
}
function caseLike(raw,word){if(raw===raw.toUpperCase()&&raw.length>1&&raw[1]===raw[1].toUpperCase())return word.toUpperCase();if(raw[0]===raw[0].toUpperCase())return word.charAt(0).toUpperCase()+word.slice(1).toLowerCase();return word.toLowerCase();}
function fmtDate(v,fmt,nls){
  if(v==null)return null;
  const f=fields(v.s);const toks=tokFmt(fmt);let fm=false;let out='';
  const pad=(n,w)=>fm?String(n):String(n).padStart(w,'0');
  for(const t of toks){
    if(t.lit!=null){out+=t.lit;continue;}
    const tk=t.tk,raw=t.raw;let s;let num=null;
    switch(tk){
      case'FM':fm=!fm;continue;case'FX':continue;
      case'SYYYY':case'YYYY':case'RRRR':num=f.Y;s=pad(f.Y,4);break;
      case'IYYY':num=isoWeek(f).y;s=pad(num,4);break;
      case'YYY':case'IYY':s=pad(f.Y%1000,3);break;case'YY':case'RR':case'IY':s=pad(f.Y%100,2);break;case'Y':case'I':s=String(f.Y%10);break;
      case'YEAR':case'SYEAR':s=caseLike(raw,yearWords(f.Y));break;
      case'MONTH':{const w=caseLike(raw,MON[f.M-1]);s=fm?w:w.padEnd(9,' ');break;}
      case'MON':s=caseLike(raw,MON[f.M-1].slice(0,3));break;
      case'MM':num=f.M;s=pad(f.M,2);break;case'RM':s=caseLike(raw,ROMAN[f.M-1]);if(!fm)s=s.padEnd(4,' ');break;
      case'Q':num=Math.ceil(f.M/3);s=String(num);break;
      case'WW':num=Math.floor((dayOfYear(f)-1)/7)+1;s=pad(num,2);break;case'IW':num=isoWeek(f).w;s=pad(num,2);break;case'W':num=Math.floor((f.D-1)/7)+1;s=String(num);break;
      case'DDD':num=dayOfYear(f);s=pad(num,3);break;case'DD':num=f.D;s=pad(f.D,2);break;case'D':num=f.dow+1;s=String(num);break;
      case'DAY':{const w=caseLike(raw,DAYN[f.dow]);s=fm?w:w.padEnd(9,' ');break;}
      case'DY':s=caseLike(raw,DAYN[f.dow].slice(0,3));break;
      case'J':num=julian(f);s=String(num);break;
      case'HH24':num=f.h;s=pad(f.h,2);break;case'HH12':case'HH':{const h=f.h%12||12;num=h;s=pad(h,2);break;}
      case'MI':num=f.mi;s=pad(f.mi,2);break;case'SS':num=f.sec;s=pad(f.sec,2);break;case'SSSSS':s=pad(f.h*3600+f.mi*60+f.sec,5);break;
      case'FF':case'FF1':case'FF2':case'FF3':case'FF4':case'FF5':case'FF6':case'FF7':case'FF8':case'FF9':{
        if(v.kind==='DATE')throw E('ORA-01821','date format not recognized');const d=tk==='FF'?(v.fp||6):+tk[2];s=String(v.ns||0).padStart(9,'0').slice(0,d);break;}
      case'AM':case'PM':s=caseLike(raw,f.h<12?'AM':'PM');break;case'A.M.':case'P.M.':s=caseLike(raw,f.h<12?'A.M.':'P.M.');break;
      case'AD':case'BC':s=caseLike(raw,'AD');break;case'A.D.':case'B.C.':s=caseLike(raw,'A.D.');break;
      case'CC':case'SCC':s=pad(Math.floor((f.Y-1)/100)+1,2);break;
      case'X':s='.';break;
      case'TZH':case'TZM':case'TZR':case'TZD':{if(!v.tz)throw E('ORA-01821','date format not recognized');
        const o=v.tz.off;if(tk==='TZH')s=(o<0?'-':'+')+String(Math.floor(Math.abs(o)/60)).padStart(2,'0');else if(tk==='TZM')s=String(Math.abs(o)%60).padStart(2,'0');
        else if(tk==='TZR')s=v.tz.name||offStr(o);else s=v.tz.name?regionAbbr(v.tz.name,v.utc()):'';break;}
      case'DL':s=caseLike('Day',DAYN[f.dow])+', '+caseLike('Month',MON[f.M-1])+' '+String(f.D).padStart(2,'0')+', '+f.Y;break;
      case'DS':s=String(f.M).padStart(2,'0')+'/'+String(f.D).padStart(2,'0')+'/'+f.Y;break;
      case'TS':s=(f.h%12||12)+':'+String(f.mi).padStart(2,'0')+':'+String(f.sec).padStart(2,'0')+' '+(f.h<12?'AM':'PM');break;
      default:s='';
    }
    if(t.suf&&num==null)num=parseInt(s,10);
    if(t.suf==='TH'){s=String(fm?num:s)+(t.sufRaw===t.sufRaw.toLowerCase()?ordSuffix(num).toLowerCase():ordSuffix(num));}
    else if(t.suf==='SP'){s=caseLike(raw,words(num));}
    else if(t.suf==='SPTH'){s=caseLike(raw,ordWords(num));}
    out+=s;
  }
  return out;
}
function parseDate(str,fmt,kind,nls,fp){
  str=String(str);const toks=tokFmt(fmt);let i=0;
  const now=fields(nowWall(nls));let Y=now.Y,M=now.M,D=1,h=0,mi=0,sec=0,ns=0,pm=null,tz=null,J=null,ddd=null,ssss=null;let fx=false;
  const skipSep=()=>{while(i<str.length&&/[-\/,.;:\s]/.test(str[i]))i++;};
  const readNum=(maxw)=>{if(!fx)while(i<str.length&&str[i]===' ')i++;let j=i;if(str[j]==='-'||str[j]==='+')j++;while(j<str.length&&j-i<maxw&&/[0-9]/.test(str[j]))j++;
    if(j===i)throw E('ORA-01858','a non-numeric character was found where a numeric was expected');const v=parseInt(str.slice(i,j),10);i=j;return v;};
  const readWord=list=>{const up=str.slice(i).toUpperCase();for(let k=0;k<list.length;k++){if(up.startsWith(list[k])){i+=list[k].length;return k;}}return -1;};
  for(let ti=0;ti<toks.length;ti++){const t=toks[ti];
    if(t.lit!=null){if(/^[-\/,.;:\s]$/.test(t.lit)){skipSep();continue;}
      const up=str.slice(i,i+t.lit.length).toUpperCase();if(up!==t.lit.toUpperCase())throw E('ORA-01861','literal does not match format string');i+=t.lit.length;continue;}
    if(t.tk==='FM'){continue;}if(t.tk==='FX'){fx=true;continue;}
    if(!fx)skipSep();
    switch(t.tk){
      case'YYYY':case'SYYYY':case'IYYY':{const st=i;Y=readNum(4);if(i-st<=2&&!fx){/* Oracle accepts 2-digit year in YYYY as-is */}break;}
      case'RRRR':{const st=i;const y=readNum(4);Y=(i-st<=2)?rrYear(y,now.Y):y;break;}
      case'YYY':case'IYY':Y=Math.floor(now.Y/1000)*1000+readNum(3);break;
      case'YY':case'IY':Y=Math.floor(now.Y/100)*100+readNum(2);break;
      case'Y':case'I':Y=Math.floor(now.Y/10)*10+readNum(1);break;
      case'RR':{const st=i;const y=readNum(4);Y=(i-st<=2)?rrYear(y,now.Y):y;break;}
      case'MM':{M=readNum(2);if(M<1||M>12)throw E('ORA-01843','not a valid month');break;}
      case'MON':case'MONTH':{let k=readWord(MON);if(k<0)k=readWord(MON.map(x=>x.slice(0,3)));if(k<0){if(/[0-9]/.test(str[i]||'')&&!/[-\/,.;:\s]/.test(str[i-1]||''))throw E('ORA-01861','literal does not match format string');if(false){M=readNum(2);if(M<1||M>12)throw E('ORA-01843','not a valid month');break;}throw E('ORA-01843','not a valid month');}M=k+1;break;}
      case'RM':{const k=readWord(['VIII','VII','III','XII','XI','IX','IV','VI','II','X','V','I']);const map=[8,7,3,12,11,9,4,6,2,10,5,1];if(k<0)throw E('ORA-01843','not a valid month');M=map[k];break;}
      case'DD':D=readNum(2);break;case'DDD':ddd=readNum(3);break;case'J':J=readNum(7);break;
      case'DY':case'DAY':{let k=readWord(DAYN);if(k<0)k=readWord(DAYN.map(x=>x.slice(0,3)));if(k<0)throw E('ORA-01846','not a valid day of the week');break;}
      case'D':readNum(1);break;
      case'HH24':h=readNum(2);if(h>23)throw E('ORA-01850','hour must be between 0 and 23');break;
      case'HH':case'HH12':h=readNum(2);if(h<1||h>12)throw E('ORA-01849','hour must be between 1 and 12');break;
      case'MI':mi=readNum(2);if(mi>59)throw E('ORA-01851','minutes must be between 0 and 59');break;
      case'SS':sec=readNum(2);if(sec>59)throw E('ORA-01852','seconds must be between 0 and 59');break;
      case'SSSSS':ssss=readNum(5);break;
      case'FF':case'FF1':case'FF2':case'FF3':case'FF4':case'FF5':case'FF6':case'FF7':case'FF8':case'FF9':{if(kind==='DATE')throw E('ORA-01821','date format not recognized');let j=i;while(j<str.length&&/[0-9]/.test(str[j])&&j-i<9)j++;const d=str.slice(i,j);i=j;ns=parseInt((d+'000000000').slice(0,9),10)||0;break;}
      case'AM':case'PM':case'A.M.':case'P.M.':{const up=str.slice(i).toUpperCase();if(up.startsWith('AM')||up.startsWith('A.M.')){pm=false;i+=up.startsWith('A.M.')?4:2;}else if(up.startsWith('PM')||up.startsWith('P.M.')){pm=true;i+=up.startsWith('P.M.')?4:2;}else throw E('ORA-01855','AM/A.M. or PM/P.M. required');break;}
      case'X':if(str[i]==='.')i++;break;
      case'TZH':{const m=/^\s*([+-]?\d{1,2})/.exec(str.slice(i));if(!m)throw E('ORA-01874','time zone hour must be between -15 and 15');i+=m[0].length;tz=(tz||0)+parseInt(m[1],10)*60;break;}
      case'TZM':{const m=/^\s*(\d{1,2})/.exec(str.slice(i));if(m){i+=m[0].length;tz=(tz||0)+(tz<0?-1:1)*parseInt(m[1],10);}break;}
      case'TZR':{const m=/^\s*([+-]\d{1,2}:\d{2}|[A-Za-z_\/]+)/.exec(str.slice(i));if(!m)throw E('ORA-01882','timezone region not found');i+=m[0].length;tz={spec:m[1]};break;}
      case'AD':case'BC':case'A.D.':case'B.C.':{const up=str.slice(i).toUpperCase();const mm=/^(A\.?D\.?|B\.?C\.?)/.exec(up);if(mm)i+=mm[0].length;break;}
      default:break;
    }
  }
  skipSep();
  if(i<str.length){if(!/^\s*$/.test(str.slice(i)))throw E('ORA-01830','date format picture ends before converting entire input string');}
  if(pm!=null){if(h===12)h=pm?12:0;else if(pm)h+=12;}
  if(J!=null){const s=(J-2440588)*86400;const ff=fields(s);Y=ff.Y;M=ff.M;D=ff.D;}
  if(ddd!=null){const s=mkSY(Y,1,1)+(ddd-1)*86400;const ff=fields(s);M=ff.M;D=ff.D;}
  if(ssss!=null){h=Math.floor(ssss/3600);mi=Math.floor(ssss%3600/60);sec=ssss%60;}
  if(D>=1&&D<=31&&D>dim(Y,M))throw E('ORA-01839','date not valid for month specified');if(D<1||D>dim(Y,M))throw E('ORA-01847','day of month must be between 1 and last day of month');
  if(Y<-4712||Y>9999||Y===0)throw E('ORA-01841','(full) year must be between -4713 and +9999, and not be 0');
  const s=mkSY(Y,M,D,h,mi,sec);
  if(kind==='DATE')return new DT('DATE',s,0);
  const d=new DT(kind==='TSTZ'?'TSTZ':'TS',s,ns);d.fp=fp||6;
  if(kind==='TSTZ'){if(tz==null)d.tz=sessTZ(nls,s);else if(typeof tz==='number')d.tz={off:tz,name:null};else d.tz=parseTZ(tz.spec,s);}
  return d;
}
function rrYear(y,cur){if(y>=100)return y;const c=Math.floor(cur/100)*100;const cy=cur%100;if(y<50)return cy<50?c+y:c+100+y;return cy<50?c-100+y:c+y;}
function sessTZ(nls,wall){const z=nls&&nls.tz||'+00:00';return parseTZ(z,wall||Math.floor(Date.now()/1000));}
function nowWall(nls){const u=Math.floor(Date.now()/1000);const tz=sessTZ(nls,u);return u+tz.off*60;}
function fmtInterval(v){
  if(v.kind==='YM'){const neg=v.m<0;const a=Math.abs(v.m);return(neg?'-':'+')+String(Math.floor(a/12)).padStart(2,'0')+'-'+String(a%12).padStart(2,'0');}
  const neg=v.s<0||(v.s===0&&v.ns<0);let tot=Math.abs(v.s);const d=Math.floor(tot/86400);tot-=d*86400;const h=Math.floor(tot/3600),mi=Math.floor(tot%3600/60),s=tot%60;
  return(neg?'-':'+')+String(d).padStart(2,'0')+' '+String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0')+':'+String(Math.floor(s)).padStart(2,'0')+'.'+String(Math.abs(v.ns)).padStart(9,'0').slice(0,v.fp==null?6:v.fp);
}
function parseIntervalLit(str,from,to){
  const s=String(str).trim();const neg=s.startsWith('-');const b=s.replace(/^[+-]/,'');
  if(from==='YEAR'||from==='MONTH'){
    if(from==='YEAR'&&to==='MONTH'){const m=/^(\d+)-(\d+)$/.exec(b);if(!m)throw E('ORA-01867','the interval is invalid');if(+m[2]>11)throw E('ORA-01843','not a valid month');return new IV('YM',(neg?-1:1)*(+m[1]*12+ +m[2]));}
    const n=parseInt(b,10);if(isNaN(n))throw E('ORA-01867','the interval is invalid');return new IV('YM',(neg?-1:1)*(from==='YEAR'?n*12:n));}
  /* day to second family */
  let d=0,h=0,mi=0,sc=0,ns=0;const m=/^(?:(\d+)\s+)?(?:(\d+)(?::(\d+))?(?::(\d+)(?:\.(\d+))?)?)?$/.exec(b);
  if(from==='DAY'){if(to==null||to==='DAY'){d=parseInt(b,10);}else{const mm=/^(\d+)\s+(\d+)(?::(\d+))?(?::(\d+)(?:\.(\d+))?)?$/.exec(b);if(!mm)throw E('ORA-01867','the interval is invalid');d=+mm[1];h=+mm[2];mi=+(mm[3]||0);sc=+(mm[4]||0);ns=parseInt(((mm[5]||'')+'000000000').slice(0,9),10);}}
  else if(from==='HOUR'){const mm=/^(\d+)(?::(\d+))?(?::(\d+)(?:\.(\d+))?)?$/.exec(b);if(!mm)throw E('ORA-01867','the interval is invalid');h=+mm[1];mi=+(mm[2]||0);sc=+(mm[3]||0);ns=parseInt(((mm[4]||'')+'000000000').slice(0,9),10);}
  else if(from==='MINUTE'){const mm=/^(\d+)(?::(\d+)(?:\.(\d+))?)?$/.exec(b);if(!mm)throw E('ORA-01867','the interval is invalid');mi=+mm[1];sc=+(mm[2]||0);ns=parseInt(((mm[3]||'')+'000000000').slice(0,9),10);}
  else if(from==='SECOND'){const mm=/^(\d+)(?:\.(\d+))?$/.exec(b);if(!mm)throw E('ORA-01867','the interval is invalid');sc=+mm[1];ns=parseInt(((mm[2]||'')+'000000000').slice(0,9),10);}
  if(isNaN(d+h+mi+sc))throw E('ORA-01867','the interval is invalid');
  const tot=d*86400+h*3600+mi*60+sc;return new IV('DS',(neg?-1:1)*tot,(neg?-1:1)*ns);
}

/* ===== parser: expressions and queries ===== */
const CMP_OPS=['=','<>','<','>','<=','>='];
const ALIAS_STOP=new Set(['FROM','WHERE','GROUP','ORDER','HAVING','JOIN','INNER','LEFT','RIGHT','FULL','CROSS','NATURAL','ON','USING','UNION','MINUS','INTERSECT','EXCEPT','CONNECT','START','PIVOT','UNPIVOT','FETCH','OFFSET','FOR','INTO','BULK','SET','VALUES','RETURNING','RETURN','WHEN','THEN','ELSE','END','AND','OR','NOT','IS','IN','LIKE','BETWEEN','AS','WITH','LOG','MODEL','PARTITION','SAMPLE','WINDOW','LIMIT','OUTER','APPLY','CASE','NULLS','ASC','DESC','BY','EXCEPTION','LOOP','IF','ELSIF','MERGE','DELETE','UPDATE','INSERT','SELECT','QUALIFY']);
function parseExpr(p){return parseOr(p);}
function parseOr(p){let a=parseAnd(p);while(p.acceptW('OR'))a={t:'bin',op:'OR',a,b:parseAnd(p)};return a;}
function parseAnd(p){let a=parseNot(p);while(p.acceptW('AND'))a={t:'bin',op:'AND',a,b:parseNot(p)};return a;}
function parseNot(p){if(p.acceptW('NOT'))return{t:'not',a:parseNot(p)};return parsePred(p);}
function parsePred(p){
  if(p.isW('EXISTS')&&p.isOp('(',1)){p.next();p.expectOp('(');const q=subNoOrder(p,parseQuery(p));p.expectOp(')');return{t:'exists',q};}
  let a=parseAdd(p);
  for(;;){
    const x=p.peek();if(!x)break;
    if(x.k==='id'&&!x.q&&['EXISTS','ANY','SOME','ALL'].includes(x.v)&&p.isOp('(',1))throw p.errAt('ORA-00920','invalid relational operator');
    if(x.k==='op'&&CMP_OPS.includes(x.v)){p.next();
      if(p.isAnyW(['ANY','SOME','ALL'])){const q=p.next().v==='ALL'?'ALL':'ANY';p.expectOp('(');let r;
        if(p.isW('SELECT')||p.isW('WITH')){r={sub:subNoOrder(p,parseQuery(p))};}else{const l=[];do{l.push(parseExpr(p));}while(p.acceptOp(','));r={list:l};}
        p.expectOp(')');a=Object.assign({t:'quant',op:x.v,q,a},r);continue;}
      a={t:'cmp',op:x.v,a,b:parseAdd(p)};if(a.a&&a.a.outer&&a.b&&a.b.outer)throw p.errAt('ORA-01468','a predicate may reference only one outer-joined table');continue;}
    if(p.isW('IS')){p.next();const neg=p.acceptW('NOT');
      if(p.acceptW('NULL')){a={t:'isnull',a,neg};continue;}
      if(p.acceptW('EMPTY')){a={t:'isempty',a,neg};continue;}
      if(p.acceptW('A','SET')){a={t:'isaset',a,neg};continue;}
      if(p.acceptW('TRUE')){a={t:'istf',a,v:true,neg};continue;}if(p.acceptW('FALSE')){a={t:'istf',a,v:false,neg};continue;}
      if(p.acceptW('JSON')){a={t:'isjson',a,neg};continue;}
      throw p.errAt('ORA-00908','missing NULL keyword');}
    let neg=false;
    if(p.isW('NOT')&&(p.isW('BETWEEN',1)||p.isW('IN',1)||p.isW('LIKE',1)||p.isW('MEMBER',1)||p.isAnyW(['LIKEC','LIKE2','LIKE4'],1))){p.next();neg=true;}
    if(p.acceptW('BETWEEN')){const lo=parseAdd(p);if(!p.acceptW('AND'))throw p.errAt('ORA-00905','missing keyword');const hi=parseAdd(p);a={t:'between',a,lo,hi,neg};continue;}
    if(p.acceptW('IN')){p.expectOp('(');let r;
      if(p.isW('SELECT')||p.isW('WITH'))r={sub:subNoOrder(p,parseQuery(p))};else{const l=[];do{l.push(parseExpr(p));}while(p.acceptOp(','));r={list:l};}
      p.expectOp(')');a=Object.assign({t:'in',a,neg},r);continue;}
    if(p.isAnyW(['LIKE','LIKEC','LIKE2','LIKE4'])){p.next();const b=parseAdd(p);let esc=null;if(p.acceptW('ESCAPE'))esc=parseAdd(p);a={t:'like',a,b,esc,neg};continue;}
    if(p.acceptW('MEMBER')){p.acceptW('OF');a={t:'member',a,b:parseAdd(p),neg};continue;}
    if(p.acceptW('SUBMULTISET')){p.acceptW('OF');a={t:'submultiset',a,b:parseAdd(p),neg};continue;}
    if(neg)throw p.errAt('ORA-00920','invalid relational operator');
    break;
  }
  return a;
}
function parseAdd(p){let a=parseMul(p);for(;;){const x=p.peek();if(x&&x.k==='op'&&(x.v==='+'||x.v==='-'||x.v==='||')){p.next();a={t:'bin',op:x.v,a,b:parseMul(p)};}
    else if(p.isW('MULTISET')&&p.isAnyW(['UNION','INTERSECT','EXCEPT'],1)){p.next();const op=p.next().v;p.acceptW('ALL');const d=p.acceptW('DISTINCT');a={t:'multiset',op,d,a,b:parseMul(p)};}else break;}return a;}
function parseMul(p){let a=parseUnary(p);for(;;){const x=p.peek();if(x&&x.k==='op'&&(x.v==='*'||x.v==='/')){p.next();a={t:'bin',op:x.v,a,b:parseUnary(p)};}
    else if(p.isW('MOD')&&!p.isOp('(',1)){p.next();a={t:'bin',op:'MOD',a,b:parseUnary(p)};}else break;}return a;}
function parseUnary(p){if(p.acceptOp('-'))return{t:'neg',a:parseUnary(p)};if(p.acceptOp('+'))return parseUnary(p);if(p.acceptW('PRIOR'))return{t:'prior',a:parseUnary(p)};
  let a=parsePow(p);return a;}
function parsePow(p){let a=parsePostfix(p);if(p.acceptOp('**'))a={t:'bin',op:'**',a,b:parseUnary(p)};return a;}
function parsePostfix(p){
  let a=parsePrimary(p);
  for(;;){
    if(p.isW('AT')&&(p.isW('TIME',1)||p.isW('LOCAL',1))){p.next();if(p.acceptW('LOCAL')){a={t:'atz',a,local:true};continue;}p.expectW('TIME');p.expectW('ZONE');
      if(p.acceptW('DBTIMEZONE')){a={t:'atz',a,tz:{t:'call',parts:['DBTIMEZONE'],args:[]}};continue;}if(p.acceptW('SESSIONTIMEZONE')){a={t:'atz',a,tz:{t:'call',parts:['SESSIONTIMEZONE'],args:[]}};continue;}
      a={t:'atz',a,tz:parsePrimary(p)};continue;}
    if(p.isOp('(+)')){p.next();a.outer=true;continue;}
    if(p.isW('COLLATE')){p.next();p.ident();continue;}
    break;
  }
  return a;
}
function litNode(v){return{t:'lit',v};}
function parsePrimary(p){
  const x=p.next();
  if(x.k==='num'){let v=x.v;if(x.unit)v=v*({K:1024,M:1048576,G:1073741824,T:1099511627776}[x.unit]);return{t:'lit',v,bin:x.bin};}
  if(x.k==='str')return{t:'lit',v:x.v===''?null:x.v,str:1};
  if(x.k==='bind'){let parts=[x.v];while(p.isOp('.')&&p.peek(1)&&p.peek(1).k==='id'){p.next();parts.push(p.next().v);}return{t:'bind',name:x.v,parts,line:x.line,col:x.col};}
  if(x.k==='op'&&x.v==='('){
    if(p.isW('SELECT')||p.isW('WITH')){const q=subNoOrder(p,parseQuery(p));p.expectOp(')');return{t:'sub',q};}
    const items=[];do{items.push(parseExpr(p));}while(p.acceptOp(','));p.expectOp(')');
    return items.length===1?Object.assign({},items[0],{paren:true}):{t:'tuple',items};
  }
  if(x.k==='op'&&x.v==='*')return{t:'star'};
  if(x.k==='id'&&!x.q&&(x.v==='SELECT'||x.v==='DISTINCT'||x.v==='FROM')){p.i--;throw p.errAt('ORA-00936','missing expression');}
  if(x.k!=='id'){p.i--;if(x.k==='op'&&x.v===')')throw p.errAt('ORA-00936','missing expression');throw p.errAt('ORA-00936','missing expression');}
  const w=x.q?null:x.v;
  if(w==='NULL')return{t:'lit',v:null};
  if(w==='TRUE'&&!p.isOp('.'))return{t:'lit',v:true};if(w==='FALSE'&&!p.isOp('.'))return{t:'lit',v:false};
  if(w==='CASE')return parseCase(p);
  if(w==='DATE'&&p.peek()&&p.peek().k==='str'){return{t:'dlit',kind:'DATE',s:p.next().v};}
  if(w==='TIMESTAMP'&&p.peek()&&p.peek().k==='str'){return{t:'dlit',kind:'TS',s:p.next().v};}
  if(w==='INTERVAL'&&p.peek()&&p.peek().k==='str'){const s=p.next().v;const from=p.next().v;let lp=null,fp=null;if(p.acceptOp('(')){lp=p.num();if(p.acceptOp(','))fp=p.num();p.expectOp(')');}
    let to=null;if(p.acceptW('TO')){to=p.next().v;if(p.acceptOp('(')){fp=p.num();p.expectOp(')');}}
    return{t:'ilit',s,from,to,lp,fp};}
  if(w==='CAST'&&p.isOp('(')){p.next();
    if(p.isW('MULTISET')){p.next();p.expectOp('(');const q=parseQuery(p);p.expectOp(')');p.expectW('AS');const ty=parseType(p);p.expectOp(')');return{t:'castms',q,type:ty};}
    const a=parseExpr(p);p.expectW('AS');const ty=parseType(p);let def=null;
    if(p.acceptW('DEFAULT')){def=parseExpr(p);p.expectW('ON');p.expectW('CONVERSION');p.expectW('ERROR');}
    p.expectOp(')');return{t:'cast',a,type:ty,def};}
  if(w==='EXTRACT'&&p.isOp('(')){p.next();const field=p.next().v;p.expectW('FROM');const a=parseExpr(p);p.expectOp(')');return{t:'extract',field,a};}
  if(w==='TRIM'&&p.isOp('(')){p.next();let mode='BOTH',ch=null;
    if(p.isAnyW(['LEADING','TRAILING','BOTH'])){mode=p.next().v;if(!p.isW('FROM'))ch=parseExpr(p);p.expectW('FROM');}
    else{const first=parseExpr(p);if(p.acceptW('FROM')){ch=first;const a=parseExpr(p);p.expectOp(')');return{t:'trim',mode,ch,a};}p.expectOp(')');return{t:'trim',mode,ch:null,a:first};}
    const a=parseExpr(p);p.expectOp(')');return{t:'trim',mode,ch,a};}
  if((w==='SQL'||!w)&&false){}
  /* identifier chain */
  const parts=[x.v];const raw=[x.raw];
  while(p.isOp('.')){const y=p.peek(1);if(y&&y.k==='id'){p.i++;parts.push(p.next().v);raw.push(y.raw);continue;}
    if(y&&y.k==='op'&&y.v==='*'){p.i+=2;return{t:'star',qual:parts};}break;}
  if(p.isOp('%')&&p.peek(1)&&p.peek(1).k==='id'){p.next();const attr=p.next().v;return{t:'attr',parts,attr,line:x.line,col:x.col};}
  let node;
  if(p.isOp('(')){p.next();node={t:'call',parts,args:[],line:x.line,col:x.col};
    if(p.acceptOp('*')){node.star=true;}
    else if(!p.isOp(')')){
      if(p.acceptW('DISTINCT')||p.acceptW('UNIQUE'))node.distinct=true;else p.acceptW('ALL');
      do{
        if(p.peek()&&p.peek().k==='id'&&p.isOp('=>',1)){const nm=p.next().v;p.next();(node.named||(node.named={}))[nm]=parseExpr(p);continue;}
        node.args.push(parseExpr(p));
        if(p.isAnyW(['IGNORE','RESPECT'])&&p.isW('NULLS',1)){node.ignoreNulls=p.next().v==='IGNORE';p.next();}
        if(parts[0]==='LISTAGG'&&p.acceptW('ON','OVERFLOW')){if(p.acceptW('ERROR')){}else{p.expectW('TRUNCATE');node.ovTrunc={ind:'...',cnt:true};if(p.peek()&&p.peek().k==='str')node.ovTrunc.ind=p.next().v;if(p.acceptW('WITHOUT','COUNT'))node.ovTrunc.cnt=false;else p.acceptW('WITH','COUNT');}}
        if(p.acceptW('USING')){p.ident();}
      }while(p.acceptOp(','));
    }
    p.expectOp(')');
    if(p.isW('FROM')&&p.isAnyW(['FIRST','LAST'],1)&&parts[0]==='NTH_VALUE'){p.next();node.fromLast=p.next().v==='LAST';}
    if(p.isAnyW(['IGNORE','RESPECT'])&&p.isW('NULLS',1)){node.ignoreNulls=p.next().v==='IGNORE';p.next();}
    if(p.acceptW('WITHIN','GROUP')){p.expectOp('(');p.expectW('ORDER');p.expectW('BY');node.within=parseOrderList(p);p.expectOp(')');}
    if(p.acceptW('KEEP')){p.expectOp('(');p.expectW('DENSE_RANK');const fl=p.next().v;p.expectW('ORDER');p.expectW('BY');node.keep={last:fl==='LAST',order:parseOrderList(p)};p.expectOp(')');}
    if(p.acceptW('OVER')){node.over=parseOver(p);}
    /* chained access: coll(i).field or f(x).y */
    while(p.isOp('.')&&p.peek(1)&&p.peek(1).k==='id'){p.next();node={t:'field',base:node,name:p.next().v};
      if(p.isOp('(')){p.next();const args=[];if(!p.isOp(')'))do{args.push(parseExpr(p));}while(p.acceptOp(','));p.expectOp(')');node={t:'callon',base:node,args};}}
    if(p.isOp('(')&&node.t==='call'){p.next();const args=[];if(!p.isOp(')'))do{args.push(parseExpr(p));}while(p.acceptOp(','));p.expectOp(')');node={t:'callon',base:node,args};
      while(p.isOp('.')&&p.peek(1)&&p.peek(1).k==='id'){p.next();node={t:'field',base:node,name:p.next().v};}}
    return node;
  }
  return{t:'id',parts,raw,q:!!x.q,line:x.line,col:x.col};
}
function parseOver(p){
  p.expectOp('(');const o={part:[],order:null,frame:null};
  if(p.acceptW('PARTITION')){p.expectW('BY');do{o.part.push(parseExpr(p));}while(p.acceptOp(','));}
  if(p.acceptW('ORDER')){p.expectW('BY');o.order=parseOrderList(p);}
  if(p.isAnyW(['ROWS','RANGE','GROUPS'])){const unit=p.next().v;const bound=()=>{
      if(p.acceptW('UNBOUNDED')){const d=p.next().v;return{k:d==='PRECEDING'?'UP':'UF'};}
      if(p.acceptW('CURRENT','ROW'))return{k:'CR'};
      const n=parseAdd(p);const d=p.next().v;return{k:d==='PRECEDING'?'P':'F',n};};
    if(p.acceptW('BETWEEN')){const a=bound();p.expectW('AND');const b=bound();o.frame={unit,a,b};}
    else{const a=bound();o.frame={unit,a,b:{k:'CR'}};}
    if(p.acceptW('EXCLUDE')){p.next();if(p.isW('ROW')||p.isW('OTHERS'))p.next();}}
  p.expectOp(')');return o;
}
function parseOrderList(p){const l=[];do{const e=parseExpr(p);let desc=false;if(p.acceptW('DESC'))desc=true;else p.acceptW('ASC');let nulls=null;
    if(p.acceptW('NULLS')){nulls=p.next().v;}l.push({e,desc,nulls});}while(p.acceptOp(','));return l;}
function parseCase(p){
  let base=null;if(!p.isW('WHEN'))base=parseExpr(p);const whens=[];
  while(p.acceptW('WHEN')){const w=parseExpr(p);p.expectW('THEN');whens.push([w,parseExpr(p)]);}
  if(!whens.length)throw p.errAt('ORA-00905','missing keyword');
  let els=undefined;if(p.acceptW('ELSE'))els=parseExpr(p);
  if(!p.acceptW('END'))throw p.errAt('ORA-00905','missing keyword');
  return{t:'case',base,whens,els};
}

/* ---------- queries ---------- */
function subNoOrder(p,q){if(q&&q.order&&!q.fetch&&!q.offset)throw p.errAt('ORA-00907','missing right parenthesis');return q;}
function parseQuery(p){
  const st=p.i;let wth=null;
  if(p.acceptW('WITH')){wth=[];do{
      if(p.isW('FUNCTION'))throw NOT_SUP('WITH FUNCTION');
      const name=p.ident();let cols=null;if(p.acceptOp('(')){cols=[];do{cols.push(p.ident());}while(p.acceptOp(','));p.expectOp(')');}
      p.expectW('AS');p.expectOp('(');const q=parseQuery(p);p.expectOp(')');wth.push({name,cols,q});}while(p.acceptOp(','));}
  let body=parseSetExpr(p);
  const q={t:'query',with:wth,body,order:null,offset:null,fetch:null};
  if(p.acceptW('ORDER')){if(p.acceptW('SIBLINGS'));p.expectW('BY');q.order=parseOrderList(p);}
  if(p.acceptW('OFFSET')){q.offset=parseAdd(p);if(!p.acceptW('ROWS'))p.expectW('ROW');}
  if(p.acceptW('FETCH')){if(!p.acceptW('FIRST'))p.expectW('NEXT');let n=null,pct=false;if(!p.isW('ROW')&&!p.isW('ROWS')){n=parseAdd(p);if(p.acceptW('PERCENT'))pct=true;}
    if(!p.acceptW('ROWS'))p.expectW('ROW');let ties=false;if(p.acceptW('WITH','TIES'))ties=true;else p.expectW('ONLY');q.fetch={n:n||litNode(1),pct,ties};}
  if(p.acceptW('FOR','UPDATE')){q.forUpdate={cols:[]};if(p.acceptW('OF')){do{q.forUpdate.cols.push(parseExpr(p));}while(p.acceptOp(','));}
    if(p.acceptW('NOWAIT'));else if(p.acceptW('WAIT'))p.num();else if(p.acceptW('SKIP','LOCKED'));}
  q.text=p.textFrom(st);
  return q;
}
function parseSetExpr(p){
  let l=parseQueryTerm(p);
  for(;;){let op=null,all=false;
    if(p.acceptW('UNION')){op='UNION';if(p.acceptW('ALL'))all=true;else p.acceptW('DISTINCT');}
    else if(p.acceptW('INTERSECT')){op='INTERSECT';if(p.acceptW('ALL'))all=true;}
    else if(p.acceptW('MINUS')||p.acceptW('EXCEPT')){op='MINUS';if(p.acceptW('ALL'))all=true;}
    else break;
    const r=parseQueryTerm(p);l={t:'set',op,all,l,r};}
  return l;
}
function parseQueryTerm(p){
  if(p.isOp('(')){p.next();const q=parseQuery(p);p.expectOp(')');return{t:'qblock',q};}
  if(!p.isW('SELECT')){const x=p.peek();throw p.errAt('ORA-00928','missing SELECT keyword');}
  return parseSelectCore(p);
}
function parseSelectCore(p){
  p.expectW('SELECT');const core={t:'select',distinct:false,items:[],from:[],where:null,group:null,having:null,into:null};
  if(p.acceptW('DISTINCT')||p.acceptW('UNIQUE'))core.distinct=true;else p.acceptW('ALL');
  if(p.isW('FROM'))throw p.errAt('ORA-00936','missing expression');
  do{const st=p.i;
    if(p.isOp('*')){p.next();core.items.push({star:true});continue;}
    const e=parseExpr(p);if(e.t==='star'){core.items.push({star:true,qual:e.qual});continue;}
    const textEnd=p.i;let alias=null,aliasQ=false;
    if(p.acceptW('AS')){const a=p.next();if(a.k!=='id')throw p.errAt('ORA-00923','FROM keyword not found where expected');alias=a.v;aliasQ=!!a.q;}
    else{const a=p.peek();if(a&&a.k==='id'&&(a.q||!ALIAS_STOP.has(a.v))){p.next();alias=a.v;aliasQ=!!a.q;}}
    core.items.push({e,alias,text:headerText(p,st,textEnd)});
  }while(p.acceptOp(','));
  if(p.acceptW('BULK','COLLECT')){p.expectW('INTO');core.bulk=true;core.into=parseIntoList(p);}
  else if(p.acceptW('INTO')){core.into=parseIntoList(p);}
  if(!p.acceptW('FROM')){const x=p.peek();
    if(x&&x.k==='id'&&!ALIAS_STOP.has(x.v))throw p.errAt('ORA-00923','FROM keyword not found where expected');
    throw p.errAt('ORA-00923','FROM keyword not found where expected');}
  core.from=parseFromList(p);
  for(let guard=0;guard<4;guard++){
    if(!core.where&&p.acceptW('WHERE')){core.where=parseExpr(p);continue;}
    if(!core.connect&&(p.isW('START')||p.isW('CONNECT'))){core.connect=parseConnect(p);continue;}
    if(!core.group&&p.acceptW('GROUP')){p.expectW('BY');core.group=parseGroupList(p);continue;}
    if(!core.having&&p.acceptW('HAVING')){core.having=parseExpr(p);continue;}
    break;
  }
  return core;
}
function parseConnect(p){const c={start:null,by:null,nocycle:false};for(let k=0;k<2;k++){if(p.acceptW('START','WITH'))c.start=parseExpr(p);else if(p.acceptW('CONNECT','BY')){if(p.acceptW('NOCYCLE'))c.nocycle=true;c.by=parseExpr(p);}}return c;}
function parseIntoList(p){const l=[];do{l.push(parsePostfix(p));}while(p.acceptOp(','));return l;}
function headerText(p,a,b){
  let s='';for(let i=a;i<b;i++){const x=p.t[i];s+=x.k==='str'?x.raw.toUpperCase():x.k==='id'?x.v:x.k==='num'?x.raw.toUpperCase():x.raw.toUpperCase();}
  return s;
}
function parseFromList(p){const l=[];do{l.push(parseTableRef(p));}while(p.acceptOp(','));return l;}
function parseTableRef(p){
  let left=parseTablePrimary(p);
  for(;;){
    let kind=null,natural=false;
    if(p.acceptW('NATURAL'))natural=true;
    if(p.acceptW('CROSS','JOIN'))kind='CROSS';
    else if(p.acceptW('INNER','JOIN')||p.acceptW('JOIN'))kind='INNER';
    else if(p.acceptW('LEFT')){p.acceptW('OUTER');p.expectW('JOIN');kind='LEFT';}
    else if(p.acceptW('RIGHT')){p.acceptW('OUTER');p.expectW('JOIN');kind='RIGHT';}
    else if(p.acceptW('FULL')){p.acceptW('OUTER');p.expectW('JOIN');kind='FULL';}
    else if(p.acceptW('CROSS','APPLY'))kind='CROSSAPPLY';
    else if(p.acceptW('OUTER','APPLY'))kind='OUTERAPPLY';
    else{if(natural)throw p.errAt('ORA-00905','missing keyword');break;}
    const right=parseTablePrimary(p);const j={t:'join',kind,natural,l:left,r:right,on:null,using:null};
    if(kind!=='CROSS'&&kind!=='CROSSAPPLY'&&kind!=='OUTERAPPLY'&&!natural){
      if(p.acceptW('ON'))j.on=parseExpr(p);
      else if(p.acceptW('USING')){p.expectOp('(');j.using=[];do{j.using.push(p.ident('column'));}while(p.acceptOp(','));p.expectOp(')');}
      else throw p.errAt('ORA-00905','missing keyword',[hint('JOIN ke baad ON condition chahiye, jaise ON a.id = b.id')]);
    }
    left=j;
  }
  return left;
}
function parseTablePrimary(p){
  let node;
  if(p.isOp('(')){
    if(p.isW('SELECT',1)||p.isW('WITH',1)){p.next();const q=parseQuery(p);p.expectOp(')');node={t:'subq',q};}
    else{p.next();const inner=parseTableRef(p);p.expectOp(')');node=inner;return tableSuffix(p,node);}
  }
  else if(p.isW('TABLE')&&p.isOp('(',1)){p.next();p.next();const e=parseExpr(p);p.expectOp(')');node={t:'tfunc',e};}
  else if(p.isW('LATERAL')&&p.isOp('(',1)){p.next();p.next();const q=parseQuery(p);p.expectOp(')');node={t:'subq',q,lateral:true};}
  else if(p.isW('JSON_TABLE'))throw NOT_SUP('JSON_TABLE');
  else{const x=p.peek();if(!x||x.k!=='id')throw p.errAt('ORA-00903','invalid table name');const q=p.qname();node={t:'tab',q};
    if(p.isW('AS')&&p.isW('OF',1)){p.next();p.next();p.next();parseExpr(p);}}
  return tableSuffix(p,node);
}
function tableSuffix(p,node){
  if(p.isW('AS')&&!(p.isW('OF',1))){throw p.errAt('ORA-00933','SQL command not properly ended',[hint('Oracle mein table alias ke saath AS nahi likhte: FROM employees e (AS sirf column alias ke liye).')]);}
  const a=p.peek();if(a&&a.k==='id'&&(a.q||!ALIAS_STOP.has(a.v))&&!(p.isW('PIVOT')||p.isW('UNPIVOT'))){p.next();node.alias=a.v;}
  if(p.isW('PIVOT')){p.next();node={t:'pivot',src:node,spec:parsePivot(p)};const b=p.peek();if(b&&b.k==='id'&&(b.q||!ALIAS_STOP.has(b.v))){p.next();node.alias=b.v;}}
  else if(p.isW('UNPIVOT')){p.next();node={t:'unpivot',src:node,spec:parseUnpivot(p)};const b=p.peek();if(b&&b.k==='id'&&(b.q||!ALIAS_STOP.has(b.v))){p.next();node.alias=b.v;}}
  return node;
}
function parsePivot(p){
  const xml=p.acceptW('XML');p.expectOp('(');const aggs=[];
  do{const st=p.i;const e=parseExpr(p);let alias=null;if(p.acceptW('AS'))alias=p.ident();else if(p.peek()&&p.peek().k==='id'&&!p.isW('FOR'))alias=p.ident();aggs.push({e,alias});}while(p.acceptOp(','));
  for(const a of aggs){const e=a.e;if(!(e&&e.t==='call'&&!e.over&&e.parts&&e.parts.length===1&&AGGS.has(e.parts[0])))throw p.errAt('ORA-56902','expect aggregate function inside pivot operation');}
  p.expectW('FOR');let fcols=[];if(p.acceptOp('(')){do{fcols.push(p.ident('column'));}while(p.acceptOp(','));p.expectOp(')');}else fcols.push(p.ident('column'));
  p.expectW('IN');p.expectOp('(');const vals=[];
  if(p.isW('ANY')||p.isW('SELECT'))throw p.errAt('ORA-00936','missing expression');
  do{const st=p.i;const e=parseExpr(p);let alias=null;const txt=headerText(p,st,p.i);if(p.acceptW('AS'))alias=p.ident();else if(p.peek()&&p.peek().k==='id'&&!p.isOp(',')&&!p.isOp(')'))alias=p.ident();vals.push({e,alias,text:txt});}while(p.acceptOp(','));
  p.expectOp(')');p.expectOp(')');return{aggs,fcols,vals,xml};
}
function parseUnpivot(p){
  let nulls=false;if(p.acceptW('INCLUDE','NULLS'))nulls=true;else p.acceptW('EXCLUDE','NULLS');
  p.expectOp('(');let vcols=[];if(p.acceptOp('(')){do{vcols.push(p.ident());}while(p.acceptOp(','));p.expectOp(')');}else vcols.push(p.ident());
  p.expectW('FOR');let ncols=[];if(p.acceptOp('(')){do{ncols.push(p.ident());}while(p.acceptOp(','));p.expectOp(')');}else ncols.push(p.ident());
  p.expectW('IN');p.expectOp('(');const items=[];
  do{let cols=[];if(p.acceptOp('(')){do{cols.push(p.ident('column'));}while(p.acceptOp(','));p.expectOp(')');}else cols.push(p.ident('column'));
    let as=null;if(p.acceptW('AS')){if(p.acceptOp('(')){as=[];do{as.push(parseExpr(p));}while(p.acceptOp(','));p.expectOp(')');}else as=[parseExpr(p)];}
    items.push({cols,as});}while(p.acceptOp(','));
  p.expectOp(')');p.expectOp(')');return{nulls,vcols,ncols,items};
}
function parseGroupElem(p){
  if(p.acceptW('ROLLUP')){p.expectOp('(');const g={k:'rollup',items:parseGroupItems(p)};p.expectOp(')');return g;}
  if(p.acceptW('CUBE')){p.expectOp('(');const g={k:'cube',items:parseGroupItems(p)};p.expectOp(')');return g;}
  if(p.acceptW('GROUPING','SETS')){p.expectOp('(');const sets=[];do{
      if(p.isOp('(')&&!(p.isW('SELECT',1))){p.next();if(p.acceptOp(')')){sets.push({k:'set',items:[]});}else{const it=[];do{it.push(parseExpr(p));}while(p.acceptOp(','));p.expectOp(')');sets.push({k:'set',items:it});}}
      else sets.push(parseGroupElem(p));}while(p.acceptOp(','));
    p.expectOp(')');return{k:'sets',sets};}
  if(p.isOp('(')&&p.isOp(')',1)){p.next();p.next();return{k:'set',items:[]};}
  return{k:'expr',e:parseExpr(p)};
}
function parseGroupList(p){const l=[];do{l.push(parseGroupElem(p));}while(p.acceptOp(','));return l;}
function parseGroupItems(p){const it=[];do{if(p.isOp('(')){p.next();const t=[];do{t.push(parseExpr(p));}while(p.acceptOp(','));p.expectOp(')');it.push(t);}else it.push([parseExpr(p)]);}while(p.acceptOp(','));return it;}
function NOT_SUP(what){return E('ORA-00900','invalid SQL statement',[hint('Simulator abhi "'+what+'" nahi samajhta. Real Oracle (FreeSQL) par try karo.')]);}

/* ===== parser: DML and DDL statements on schema objects ===== */
function parseReturning(p){if(!(p.acceptW('RETURNING')||p.acceptW('RETURN')))return null;const exprs=[];do{exprs.push(parseExpr(p));}while(p.acceptOp(','));
  let bulk=false;if(p.acceptW('BULK','COLLECT'))bulk=true;p.expectW('INTO');return{exprs,into:parseIntoList(p),bulk};}
function parseDmlTarget(p){
  if(p.isOp('(')&&(p.isW('SELECT',1)||p.isW('WITH',1))){p.next();const q=parseQuery(p);p.expectOp(')');const t={sub:q};const a=p.peek();if(a&&a.k==='id'&&!ALIAS_STOP.has(a.v)){p.next();t.alias=a.v;}return t;}
  const q=p.qname();const t={q};const a=p.peek();if(a&&a.k==='id'&&(a.q||!ALIAS_STOP.has(a.v))){p.next();t.alias=a.v;}return t;}
function parseInsert(p){
  p.expectW('INSERT');
  if(p.isW('ALL')||p.isW('FIRST')){const mode=p.next().v;const intos=[],elseIntos=[];let conditional=false;
    const oneInto=()=>{p.expectW('INTO');const tg=parseDmlTarget(p);let cols=null;if(p.isOp('(')&&!p.isW('SELECT',1)){p.next();cols=[];do{cols.push(p.ident('column'));}while(p.acceptOp(','));p.expectOp(')');}
      let values=null;if(p.acceptW('VALUES')){p.expectOp('(');values=[];do{values.push(p.acceptW('DEFAULT')?{t:'default'}:parseExpr(p));}while(p.acceptOp(','));p.expectOp(')');}return{tg,cols,values};};
    while(p.isW('INTO')||p.isW('WHEN')||p.isW('ELSE')){
      if(p.acceptW('WHEN')){conditional=true;const cond=parseExpr(p);p.expectW('THEN');const list=[];do{list.push(oneInto());}while(p.isW('INTO'));intos.push({cond,list});}
      else if(p.acceptW('ELSE')){do{elseIntos.push(oneInto());}while(p.isW('INTO'));}
      else intos.push({cond:null,list:[oneInto()]});}
    if(mode==='FIRST'&&!conditional)throw p.errAt('ORA-00905','missing keyword');
    const q=parseQuery(p);return{t:'insertMulti',mode,intos,elseIntos,q};}
  p.expectW('INTO');const tg=parseDmlTarget(p);let cols=null;
  if(p.isOp('(')&&!(p.isW('SELECT',1)||p.isW('WITH',1))){p.next();cols=[];do{const c=p.ident('column');if(p.isOp('.')){p.next();cols.push(p.ident('column'));}else cols.push(c);}while(p.acceptOp(','));p.expectOp(')');}
  if(p.acceptW('VALUES')){
    if(!p.isOp('(')){const e=parseExpr(p);return{t:'insert',tg,cols,values:null,recVal:e,returning:parseReturning(p)};}
    p.expectOp('(');const values=[];if(p.isOp(')'))throw p.errAt('ORA-00936','missing expression');
    do{values.push(p.acceptW('DEFAULT')?{t:'default'}:parseExpr(p));}while(p.acceptOp(','));p.expectOp(')');
    const rows=[values];while(p.acceptOp(',')){p.expectOp('(');const v=[];do{v.push(p.acceptW('DEFAULT')?{t:'default'}:parseExpr(p));}while(p.acceptOp(','));p.expectOp(')');rows.push(v);}
    return{t:'insert',tg,cols,values:rows[0],rows,returning:parseReturning(p)};}
  if(p.isW('SELECT')||p.isW('WITH')||p.isOp('(')){const q=parseQuery(p);return{t:'insert',tg,cols,q,returning:null};}
  if(p.isW('DEFAULT')&&p.isW('VALUES',1))throw NOT_SUP('INSERT DEFAULT VALUES');
  throw p.errAt('ORA-00926','missing VALUES keyword');
}
function parseSetList(p){
  const sets=[];
  do{
    if(p.isOp('(')){p.next();const cols=[];do{cols.push(p.ident('column'));}while(p.acceptOp(','));p.expectOp(')');p.expectOp('=');p.expectOp('(');const q=parseQuery(p);p.expectOp(')');sets.push({cols,sub:q});}
    else{let c=p.ident('column');if(p.isOp('.')&&p.peek(1)&&p.peek(1).k==='id'){p.next();c=p.ident('column');}
      if(!p.acceptOp('='))throw p.errAt('ORA-00927','missing equal sign');
      if(p.acceptW('DEFAULT'))sets.push({cols:[c],def:true});else sets.push({cols:[c],e:parseAdd(p)});}
  }while(p.acceptOp(','));
  return sets;
}
function parseUpdate(p){p.expectW('UPDATE');const tg=parseDmlTarget(p);p.expectW('SET');
  if(p.isW('ROW')&&p.isOp('=',1)){p.next();p.next();const e=parseExpr(p);let where=null;if(p.acceptW('WHERE'))where=parseWhereCurrent(p);return{t:'update',tg,rowSet:e,sets:[],where,returning:parseReturning(p)};}
  const sets=parseSetList(p);let where=null;if(p.acceptW('WHERE'))where=parseWhereCurrent(p);return{t:'update',tg,sets,where,returning:parseReturning(p)};}
function parseWhereCurrent(p){if(p.acceptW('CURRENT','OF'))return{t:'curof',cur:p.ident()};return parseExpr(p);}
function parseDelete(p){p.expectW('DELETE');p.acceptW('FROM');const tg=parseDmlTarget(p);let where=null;if(p.acceptW('WHERE'))where=parseWhereCurrent(p);return{t:'delete',tg,where,returning:parseReturning(p)};}
function parseMerge(p){
  p.expectW('MERGE');p.expectW('INTO');const tg=parseDmlTarget(p);p.expectW('USING');const src=parseTablePrimary(p);if(!p.acceptW('ON')||!p.isOp('('))throw p.errAt('ORA-00969','missing ON keyword');
  p.expectOp('(');const on=parseExpr(p);p.expectOp(')');const m={t:'merge',tg,src,on,upd:null,ins:null};
  while(p.acceptW('WHEN')){
    if(p.acceptW('MATCHED')){p.expectW('THEN');
      if(p.acceptW('DELETE')){m.del=true;continue;}
      p.expectW('UPDATE');p.expectW('SET');const sets=parseSetList(p);let where=null,delWhere=null;if(p.acceptW('WHERE'))where=parseExpr(p);if(p.acceptW('DELETE')){p.expectW('WHERE');delWhere=parseExpr(p);}m.upd={sets,where,delWhere};
      {const ta=tg.alias||(tg.q&&tg.q.name)||'';const onCols=new Set();const walk=n=>{if(!n||typeof n!=='object')return;if(n.t==='id'){if(n.parts.length===1||n.parts[n.parts.length-2]===ta)onCols.add(n.parts[n.parts.length-1]);return;}for(const k in n){const v=n[k];if(v&&typeof v==='object'){if(Array.isArray(v))v.forEach(walk);else walk(v);}}};walk(on);
       for(const st of sets)for(const c of (st.cols||[]))if(onCols.has(c))throw E('ORA-38104','Columns referenced in the ON Clause cannot be updated: "'+ta+'"."'+c+'"');}}
    else{p.expectW('NOT');p.expectW('MATCHED');p.expectW('THEN');p.expectW('INSERT');let cols=null;if(p.isOp('(')){p.next();cols=[];do{let c=p.ident('column');if(p.isOp('.')){p.next();c=p.ident('column');}cols.push(c);}while(p.acceptOp(','));p.expectOp(')');}
      p.expectW('VALUES');p.expectOp('(');const values=[];do{values.push(p.acceptW('DEFAULT')?{t:'default'}:parseExpr(p));}while(p.acceptOp(','));p.expectOp(')');let where=null;if(p.acceptW('WHERE'))where=parseExpr(p);m.ins={cols,values,where};}
  }
  if(!m.upd&&!m.ins&&!m.del)throw p.errAt('ORA-00905','missing keyword');
  return m;
}
/* ---------- CREATE TABLE ---------- */
function parseConsState(p,c){for(;;){if(p.acceptW('ENABLE')){c.disabled=false;continue;}if(p.acceptW('DISABLE')){c.disabled=true;continue;}
    if(p.acceptW('VALIDATE')||p.acceptW('NOVALIDATE')||p.acceptW('RELY')||p.acceptW('NORELY'))continue;
    if(p.acceptW('DEFERRABLE')){c.deferrable=true;continue;}if(p.acceptW('NOT','DEFERRABLE'))continue;
    if(p.acceptW('INITIALLY')){c.initDeferred=p.next().v==='DEFERRED';continue;}
    if(p.acceptW('USING','INDEX')){if(p.acceptOp('(')){let d=1;while(d>0){const x=p.next();if(x.k==='op'&&x.v==='(')d++;if(x.k==='op'&&x.v===')')d--;}}else{while(p.peek()&&!p.isOp(',')&&!p.isOp(')')&&!p.isW('ENABLE')&&!p.isW('DISABLE'))p.next();}continue;}
    break;}return c;}
function parseRefClause(p,c){p.expectW('REFERENCES');c.ref={q:p.qname(),cols:null};if(p.acceptOp('(')){c.ref.cols=[];do{c.ref.cols.push(p.ident('column'));}while(p.acceptOp(','));p.expectOp(')');}
  if(p.acceptW('ON','DELETE')){if(p.acceptW('CASCADE'))c.onDelete='CASCADE';else{p.expectW('SET');p.expectW('NULL');c.onDelete='SET NULL';}}return c;}
function isConsStart(p){return p.isW('CONSTRAINT')||p.isW('PRIMARY')||p.isW('UNIQUE')||p.isW('FOREIGN')||p.isW('CHECK');}
function parseOutConstraint(p){
  const c={name:null};if(p.acceptW('CONSTRAINT'))c.name=p.ident();
  const cols=()=>{p.expectOp('(');const l=[];do{l.push(p.ident('column'));}while(p.acceptOp(','));p.expectOp(')');return l;};
  if(p.acceptW('PRIMARY')){p.expectW('KEY');c.k='P';c.cols=cols();}
  else if(p.acceptW('UNIQUE')){c.k='U';c.cols=cols();}
  else if(p.acceptW('FOREIGN')){p.expectW('KEY');c.k='R';c.cols=cols();parseRefClause(p,c);}
  else if(p.acceptW('CHECK')){c.k='C';p.expectOp('(');const st=p.i;c.cond=parseExpr(p);c.condText=p.textFrom(st);p.expectOp(')');}
  else if(p.acceptW('NOT','NULL')){c.k='N';c.cols=[];}
  else throw p.errAt('ORA-00904',': invalid identifier');
  return parseConsState(p,c);
}
function parseColDef(p,forModify){
  const x=p.peek();const name=p.ident('column');const col={name,inl:[]};
  if(!forModify&&RESERVED.has(name)&&!x.q)throw E('ORA-00904',': invalid identifier',[hint('"'+name+'" Oracle ka reserved word hai, column ka naam nahi ban sakta. Doosra naam do ya double quotes lagao.')]);
  if(!p.isW('DEFAULT')&&!p.isW('GENERATED')&&!p.isW('AS')&&!p.isW('NOT')&&!p.isW('NULL')&&!p.isW('CONSTRAINT')&&!p.isW('PRIMARY')&&!p.isW('UNIQUE')&&!p.isW('CHECK')&&!p.isW('REFERENCES')&&!p.isW('INVISIBLE')&&!p.isW('VISIBLE')&&!p.isOp(',')&&!p.isOp(')')&&p.peek())col.type=parseType(p);
  for(;;){
    if(p.acceptW('SORT'))continue;
    if(p.acceptW('INVISIBLE')){col.invisible=true;continue;}if(p.acceptW('VISIBLE')){col.invisible=false;continue;}
    if(p.acceptW('DEFAULT')){if(p.acceptW('ON','NULL'))col.defOnNull=true;const st=p.i;col.def=parseExpr(p);col.defText=p.textFrom(st);continue;}
    if(p.acceptW('GENERATED')){
      if(p.acceptW('ALWAYS')){if(p.acceptW('AS','IDENTITY')){col.identity={mode:'ALWAYS'};parseIdentOpts(p,col.identity);continue;}p.expectW('AS');}
      else if(p.acceptW('BY','DEFAULT')){let onNull=false;if(p.acceptW('ON','NULL'))onNull=true;p.expectW('AS');p.expectW('IDENTITY');col.identity={mode:onNull?'BY DEFAULT ON NULL':'BY DEFAULT'};parseIdentOpts(p,col.identity);continue;}
      else p.expectW('AS');
      p.expectOp('(');const st=p.i;col.virt=parseExpr(p);col.virtText=p.textFrom(st);p.expectOp(')');p.acceptW('VIRTUAL');continue;}
    if(p.isW('AS')&&p.isOp('(',1)){p.next();p.expectOp('(');const st=p.i;col.virt=parseExpr(p);col.virtText=p.textFrom(st);p.expectOp(')');p.acceptW('VIRTUAL');continue;}
    let cname=null;if(p.acceptW('CONSTRAINT'))cname=p.ident();
    if(p.acceptW('NOT','NULL')){col.inl.push(parseConsState(p,{name:cname,k:'N',cols:[name]}));continue;}
    if(p.acceptW('NULL')){col.nullable=true;continue;}
    if(p.acceptW('PRIMARY','KEY')){col.inl.push(parseConsState(p,{name:cname,k:'P',cols:[name]}));continue;}
    if(p.acceptW('UNIQUE')){col.inl.push(parseConsState(p,{name:cname,k:'U',cols:[name]}));continue;}
    if(p.acceptW('CHECK')){p.expectOp('(');const st=p.i;const cond=parseExpr(p);const condText=p.textFrom(st);p.expectOp(')');col.inl.push(parseConsState(p,{name:cname,k:'C',cond,condText}));continue;}
    if(p.isW('REFERENCES')){const c={name:cname,k:'R',cols:[name]};parseRefClause(p,c);col.inl.push(parseConsState(p,c));continue;}
    if(cname)throw p.errAt('ORA-00902','invalid datatype');
    break;
  }
  if(!col.type&&!col.virt&&!forModify)throw p.errAt('ORA-00902','invalid datatype');
  return col;
}
function parseIdentOpts(p,id){if(!p.acceptOp('('))return;while(!p.acceptOp(')')){
    if(p.acceptW('START','WITH')){if(p.acceptW('LIMIT','VALUE'))id.start=1;else id.start=p.num();}
    else if(p.acceptW('INCREMENT','BY'))id.inc=p.num();else if(p.acceptW('MAXVALUE'))id.max=p.num();else if(p.acceptW('MINVALUE'))id.min=p.num();
    else if(p.acceptW('CACHE'))id.cache=p.num();else p.next();}}
function parseCreateTable(p,mods){
  const q=p.qname();const ct={t:'createTable',q,cols:[],cons:[],temp:null,ts:null,mods};
  if(mods.ifNotExists){}
  if(mods.gtt)ct.temp={kind:'GTT',onCommit:'DELETE'};if(mods.ptt)ct.temp={kind:'PTT',onCommit:'DROP'};
  if(p.acceptOp('(')){
    do{if(isConsStart(p))ct.cons.push(parseOutConstraint(p));else ct.cols.push(parseColDef(p));}while(p.acceptOp(','));
    p.expectOp(')');}
  for(;;){
    if(p.acceptW('ON','COMMIT')){if(!ct.temp)throw p.errAt('ORA-14451','unsupported feature with temporary table');
      if(p.acceptW('DELETE','ROWS'))ct.temp.onCommit='DELETE';else if(p.acceptW('PRESERVE','ROWS'))ct.temp.onCommit='PRESERVE';
      else if(p.acceptW('DROP','DEFINITION'))ct.temp.onCommit='DROP';else if(p.acceptW('PRESERVE','DEFINITION'))ct.temp.onCommit='PRESERVE DEF';else throw p.errAt('ORA-00905','missing keyword');continue;}
    if(p.acceptW('TABLESPACE')){ct.ts=p.ident();continue;}
    if(p.acceptW('ORGANIZATION')){if(p.acceptW('EXTERNAL')){ct.external=parseExternalClause(p);continue;}p.next();continue;}
    if(p.acceptW('PCTFREE')||p.acceptW('PCTUSED')||p.acceptW('INITRANS')){p.num();continue;}
    if(p.acceptW('STORAGE')){p.expectOp('(');let d=1;while(d>0){const x=p.next();if(x.k==='op'&&x.v==='(')d++;if(x.k==='op'&&x.v===')')d--;}continue;}
    if(p.acceptW('LOGGING')||p.acceptW('NOLOGGING')||p.acceptW('COMPRESS')||p.acceptW('NOCOMPRESS')||p.acceptW('PARALLEL')||p.acceptW('NOPARALLEL')||p.acceptW('CACHE')||p.acceptW('NOCACHE'))continue;
    if(p.acceptW('SEGMENT','CREATION')){p.next();continue;}
    break;}
  if(p.acceptW('AS')){ct.asQuery=parseQuery(p);}
  else if(!ct.cols.length&&!ct.external)throw p.errAt('ORA-00906','missing left parenthesis');
  return ct;
}
function parseExternalClause(p){
  p.expectOp('(');const x={type:'ORACLE_LOADER',dir:null,files:[],delim:',',skip:0};let d=1;
  while(d>0&&!p.eof()){
    if(p.acceptW('TYPE')){x.type=p.next().v;continue;}
    if(p.acceptW('DEFAULT','DIRECTORY')){x.dir=p.ident();continue;}
    if(p.acceptW('LOCATION')){p.expectOp('(');do{const t=p.next();let f=t.k==='str'?t.v:t.v;if(p.acceptOp(':')){const t2=p.next();f=t2.k==='str'?t2.v:t2.v;}x.files.push(f);}while(p.acceptOp(','));p.expectOp(')');continue;}
    if(p.acceptW('TERMINATED','BY')){const t=p.next();if(t.k==='str'&&!x.recDelim&&false){}if(t.k==='str'){if(x._fieldsSeen)x.delim=t.v;else x.recDelim=t.v;}continue;}
    if(p.acceptW('FIELDS')){x._fieldsSeen=true;continue;}
    if(p.acceptW('SKIP')){x.skip=p.num();continue;}
    if(p.acceptW('REJECT','LIMIT')){if(!p.acceptW('UNLIMITED'))p.num();continue;}
    const t=p.next();if(t.k==='op'&&t.v==='(')d++;if(t.k==='op'&&t.v===')')d--;
  }
  if(p.acceptW('REJECT','LIMIT')){if(!p.acceptW('UNLIMITED'))p.num();}
  return x;
}
function parseAlterTable(p){
  const q=p.qname();const at={t:'alterTable',q,acts:[]};
  for(;;){
    if(p.acceptW('ADD')){
      if(p.acceptOp('(')){
        if(isConsStart(p)){do{at.acts.push({k:'addCons',c:parseOutConstraint(p)});}while(p.acceptOp(','));}
        else{const cols=[];do{cols.push(parseColDef(p));}while(p.acceptOp(','));at.acts.push({k:'addCols',cols});}
        p.expectOp(')');}
      else if(isConsStart(p))at.acts.push({k:'addCons',c:parseOutConstraint(p)});
      else{p.acceptW('COLUMN');at.acts.push({k:'addCols',cols:[parseColDef(p)]});}
    }
    else if(p.acceptW('MODIFY')){
      if(p.acceptW('CONSTRAINT')){const n=p.ident();const c=parseConsState(p,{});at.acts.push({k:'consState',name:n,disabled:c.disabled});}
      else if(p.acceptOp('(')){const cols=[];do{cols.push(parseColDef(p,true));}while(p.acceptOp(','));p.expectOp(')');at.acts.push({k:'modCols',cols});}
      else at.acts.push({k:'modCols',cols:[parseColDef(p,true)]});
    }
    else if(p.acceptW('DROP')){
      if(p.acceptW('COLUMN')){const c=p.ident('column');const casc=p.acceptW('CASCADE','CONSTRAINTS');at.acts.push({k:'dropCols',cols:[c],casc});}
      else if(p.acceptW('UNUSED','COLUMNS')){at.acts.push({k:'dropUnused'});}
      else if(p.acceptW('CONSTRAINT')){const n=p.ident();const casc=p.acceptW('CASCADE');p.acceptW('KEEP','INDEX')||p.acceptW('DROP','INDEX');at.acts.push({k:'dropCons',name:n,casc});}
      else if(p.acceptW('PRIMARY','KEY')){const casc=p.acceptW('CASCADE');at.acts.push({k:'dropCons',pk:true,casc});}
      else if(p.acceptW('UNIQUE')){p.expectOp('(');const cols=[];do{cols.push(p.ident());}while(p.acceptOp(','));p.expectOp(')');at.acts.push({k:'dropCons',uq:cols});}
      else if(p.acceptOp('(')){const cols=[];do{cols.push(p.ident('column'));}while(p.acceptOp(','));p.expectOp(')');const casc=p.acceptW('CASCADE','CONSTRAINTS');at.acts.push({k:'dropCols',cols,casc});}
      else throw p.errAt('ORA-00905','missing keyword');
    }
    else if(p.acceptW('SET','UNUSED')){if(p.acceptW('COLUMN')){at.acts.push({k:'setUnused',cols:[p.ident('column')]});}else{p.expectOp('(');const cols=[];do{cols.push(p.ident('column'));}while(p.acceptOp(','));p.expectOp(')');at.acts.push({k:'setUnused',cols});}}
    else if(p.acceptW('RENAME')){
      if(p.acceptW('COLUMN')){const a=p.ident('column');p.expectW('TO');const b=p.ident('column');at.acts.push({k:'renCol',a,b});}
      else if(p.acceptW('CONSTRAINT')){const a=p.ident();p.expectW('TO');const b=p.ident();at.acts.push({k:'renCons',a,b});}
      else{p.expectW('TO');at.acts.push({k:'renTable',to:p.ident('table')});}
    }
    else if(p.isW('ENABLE')||p.isW('DISABLE')){const dis=p.next().v==='DISABLE';p.acceptW('VALIDATE')||p.acceptW('NOVALIDATE');
      if(p.acceptW('ALL','TRIGGERS'))at.acts.push({k:'allTriggers',disabled:dis});
      else if(p.acceptW('CONSTRAINT')){at.acts.push({k:'consState',name:p.ident(),disabled:dis});p.acceptW('CASCADE');}
      else if(p.acceptW('PRIMARY','KEY')){at.acts.push({k:'consState',pk:true,disabled:dis});p.acceptW('CASCADE');}
      else throw p.errAt('ORA-00905','missing keyword');}
    else if(p.acceptW('READ','ONLY'))at.acts.push({k:'readOnly',v:true});
    else if(p.acceptW('READ','WRITE'))at.acts.push({k:'readOnly',v:false});
    else if(p.acceptW('MOVE')){let ts=null;if(p.acceptW('TABLESPACE'))ts=p.ident();at.acts.push({k:'move',ts});}
    else if(p.acceptW('SHRINK','SPACE')){at.acts.push({k:'noop'});}
    else{if(!at.acts.length)throw p.errAt('ORA-01735','invalid ALTER TABLE option');break;}
    if(p.eof())break;
  }
  return at;
}
function parseSeqOpts(p,o){
  for(;;){
    if(p.acceptW('INCREMENT','BY')){o.inc=p.num();continue;}
    if(p.acceptW('START','WITH')){o.start=p.num();continue;}
    if(p.acceptW('RESTART')){o.restart=true;if(p.acceptW('START','WITH'))o.start=p.num();continue;}
    if(p.acceptW('MAXVALUE')){o.max=p.num();continue;}if(p.acceptW('NOMAXVALUE')){o.max=null;o.nomax=true;continue;}
    if(p.acceptW('MINVALUE')){o.min=p.num();continue;}if(p.acceptW('NOMINVALUE')){o.min=null;o.nomin=true;continue;}
    if(p.acceptW('CYCLE')){o.cycle=true;continue;}if(p.acceptW('NOCYCLE')){o.cycle=false;continue;}
    if(p.acceptW('CACHE')){o.cache=p.num();continue;}if(p.acceptW('NOCACHE')){o.cache=0;continue;}
    if(p.acceptW('ORDER')){o.order=true;continue;}if(p.acceptW('NOORDER')){o.order=false;continue;}
    if(p.acceptW('KEEP')||p.acceptW('NOKEEP')||p.acceptW('SCALE')||p.acceptW('NOSCALE')||p.acceptW('SESSION')||p.acceptW('GLOBAL'))continue;
    break;}
  return o;
}
/* the main entry: parses one SQL statement on schema objects; returns null when it is not one of these */
function parseSqlStatement(p){
  if(p.isW('SELECT')||p.isW('WITH')||(p.isOp('(')&&(p.isW('SELECT',1)||p.isW('WITH',1)))){const q=parseQuery(p);return q;}
  if(p.isW('INSERT'))return parseInsert(p);
  if(p.isW('UPDATE'))return parseUpdate(p);
  if(p.isW('DELETE'))return parseDelete(p);
  if(p.isW('MERGE'))return parseMerge(p);
  if(p.acceptW('COMMIT')){p.acceptW('WORK');return{t:'commit'};}
  if(p.acceptW('ROLLBACK')){p.acceptW('WORK');let to=null;if(p.acceptW('TO')){p.acceptW('SAVEPOINT');to=p.ident();}return{t:'rollback',to};}
  if(p.acceptW('SAVEPOINT'))return{t:'savepoint',name:p.ident()};
  if(p.acceptW('TRUNCATE')){p.expectW('TABLE');const q=p.qname();const casc=p.acceptW('CASCADE');p.acceptW('DROP','STORAGE')||p.acceptW('REUSE','STORAGE');if(p.isW('WHERE'))throw p.errAt('ORA-03291','Invalid truncate option - missing STORAGE keyword');return{t:'truncate',q,casc};}
  if(p.isW('RENAME')&&p.peek(1)&&p.peek(1).k==='id'&&p.isW('TO',2)){p.next();const a=p.ident('table');p.expectW('TO');return{t:'rename',a,b:p.ident('table')};}
  if(p.acceptW('EXPLAIN','PLAN')){if(p.acceptW('SET')){p.ident();p.expectOp('=');p.next();}if(p.acceptW('INTO'))p.qname();p.expectW('FOR');const st=p.i;const s=parseSqlStatement(p);return{t:'explain',s,text:p.textFrom(st)};}
  if(p.acceptW('FLASHBACK','TABLE')){const q=p.qname();p.expectW('TO');p.expectW('BEFORE');p.expectW('DROP');let rn=null;if(p.acceptW('RENAME','TO'))rn=p.ident();return{t:'flashback',q,rename:rn};}
  if(p.acceptW('PURGE')){if(p.acceptW('RECYCLEBIN')||p.acceptW('DBA_RECYCLEBIN'))return{t:'purge',all:true};p.expectW('TABLE');return{t:'purge',q:p.qname()};}
  if(p.acceptW('LOCK','TABLE')){p.qname();p.expectW('IN');while(!p.eof()&&!p.isW('MODE'))p.next();p.acceptW('MODE');p.acceptW('NOWAIT');return{t:'lock'};}
  if(p.acceptW('COMMENT','ON')){const kind=p.next().v;const q=p.qname();p.expectW('IS');const txt=p.str();return{t:'comment',kind,q,txt};}
  if(p.isW('ALTER')&&p.isW('SESSION',1)&&p.isW('SET',2)){p.i+=3;const list=[];do{const k=p.ident();p.expectOp('=');const x=p.next();list.push([k,x.v]);}while(!p.eof()&&p.peek().k==='id');return{t:'alterSession',list};}
  if(p.isW('ALTER')&&p.isW('TABLE',1)){p.i+=2;return parseAlterTable(p);}
  if(p.isW('ALTER')&&p.isW('SEQUENCE',1)){p.i+=2;const q=p.qname();const o=parseSeqOpts(p,{});if(o.start!=null&&!o.restart)throw E('ORA-02283','cannot alter starting sequence number',[hint('START WITH badalna ho toh: ALTER SEQUENCE '+q.name.toLowerCase()+' RESTART START WITH n; (ya drop karke dobara banao)')]);return{t:'alterSeq',q,o};}
  if(p.isW('ALTER')&&p.isW('INDEX',1)){p.i+=2;const q=p.qname();if(p.acceptW('RENAME','TO'))return{t:'alterIndex',q,rename:p.ident()};while(!p.eof())p.next();return{t:'alterIndex',q};}
  if(p.isW('ALTER')&&p.isW('VIEW',1)){p.i+=2;const q=p.qname();while(!p.eof())p.next();return{t:'noopMsg',msg:'View altered.'};}
  if(p.isW('DROP')){
    const save=p.i;p.next();
    if(p.acceptW('TABLE')){let ifx=false;if(p.acceptW('IF','EXISTS'))ifx=true;const q=p.qname();const casc=p.acceptW('CASCADE','CONSTRAINTS');const purge=p.acceptW('PURGE');return{t:'dropTable',q,casc,purge,ifx};}
    if(p.acceptW('VIEW')){let ifx=p.acceptW('IF','EXISTS');const q=p.qname();p.acceptW('CASCADE','CONSTRAINTS');return{t:'dropView',q,ifx};}
    if(p.acceptW('INDEX')){let ifx=p.acceptW('IF','EXISTS');const q=p.qname();p.acceptW('ONLINE');p.acceptW('FORCE');return{t:'dropIndex',q,ifx};}
    if(p.acceptW('SEQUENCE')){let ifx=p.acceptW('IF','EXISTS');return{t:'dropSeq',q:p.qname(),ifx};}
    let pub=p.acceptW('PUBLIC');
    if(p.acceptW('SYNONYM')){let ifx=p.acceptW('IF','EXISTS');const q=p.qname();const force=p.acceptW('FORCE');return{t:'dropSyn',pub,q,force,ifx};}
    p.i=save;return null;
  }
  if(p.isW('CREATE')){
    const save=p.i;p.next();const mods={};
    if(p.acceptW('OR','REPLACE'))mods.orReplace=true;
    for(;;){if(p.acceptW('FORCE')){mods.force=true;continue;}if(p.acceptW('NOFORCE'))continue;if(p.acceptW('EDITIONABLE')||p.acceptW('NONEDITIONABLE')||p.acceptW('EDITIONING'))continue;break;}
    if(p.acceptW('GLOBAL','TEMPORARY'))mods.gtt=true;
    else if(p.acceptW('PRIVATE','TEMPORARY'))mods.ptt=true;
    else if(p.isW('SHARDED')||p.isW('DUPLICATED')||p.isW('IMMUTABLE')||p.isW('BLOCKCHAIN'))p.next();
    if(p.acceptW('TABLE')){if(p.acceptW('IF','NOT','EXISTS'))mods.ifNotExists=true;return parseCreateTable(p,mods);}
    if(mods.gtt||mods.ptt)throw p.errAt('ORA-00901','invalid CREATE command');
    if(p.acceptW('VIEW')){if(p.acceptW('IF','NOT','EXISTS'))mods.ifNotExists=true;const q=p.qname();let cols=null;if(p.acceptOp('(')){cols=[];do{cols.push(p.ident('column'));}while(p.acceptOp(','));p.expectOp(')');}
      p.expectW('AS');const st=p.i;const query=parseQuery(p);const text=p.textFrom(st);const v={t:'createView',q,cols,query,text,mods};
      if(p.acceptW('WITH')){if(p.acceptW('CHECK','OPTION')){v.check=true;if(p.acceptW('CONSTRAINT'))v.checkName=p.ident();}else if(p.acceptW('READ','ONLY')){v.readOnly=true;if(p.acceptW('CONSTRAINT'))p.ident();}else throw p.errAt('ORA-00905','missing keyword');}
      return v;}
    let unique=false,bitmap=false;if(p.acceptW('UNIQUE'))unique=true;else if(p.acceptW('BITMAP'))bitmap=true;
    if(p.acceptW('INDEX')){let ifx=p.acceptW('IF','NOT','EXISTS');const name=p.qname();p.expectW('ON');const q=p.qname();p.expectOp('(');const cols=[];
      do{const st=p.i;const e=parseExpr(p);const text=p.textFrom(st);let desc=false;if(p.acceptW('DESC'))desc=true;else p.acceptW('ASC');cols.push({e,desc,text});}while(p.acceptOp(','));p.expectOp(')');
      let ts=null;for(;;){if(p.acceptW('TABLESPACE')){ts=p.ident();continue;}if(p.acceptW('ONLINE')||p.acceptW('LOGGING')||p.acceptW('NOLOGGING')||p.acceptW('COMPUTE','STATISTICS')||p.acceptW('REVERSE')||p.acceptW('INVISIBLE')||p.acceptW('VISIBLE'))continue;break;}
      return{t:'createIndex',name,q,cols,unique,bitmap,ts,ifx};}
    if(unique||bitmap)throw p.errAt('ORA-00968','missing INDEX keyword');
    if(p.acceptW('SEQUENCE')){let ifx=p.acceptW('IF','NOT','EXISTS');const q=p.qname();return{t:'createSeq',q,o:parseSeqOpts(p,{}),ifx};}
    let pub=p.acceptW('PUBLIC');
    if(p.acceptW('SYNONYM')){if(p.acceptW('IF','NOT','EXISTS'))mods.ifNotExists=true;const q=p.qname();p.expectW('FOR');const target=p.qname();return{t:'createSyn',pub,q,target,mods};}
    p.i=save;return null;
  }
  return null;
}

/* ===== evaluation: values, conversion, operators, functions ===== */
const isStr=v=>typeof v==='string';
function nlsOf(cx){return cx&&cx.sess?cx.sess.nls:DEFAULT_NLS;}
const DEFAULT_NLS={dateFmt:'DD-MON-RR',tsFmt:'DD-MON-RR HH.MI.SSXFF AM',tstzFmt:'DD-MON-RR HH.MI.SSXFF AM TZR',tz:'+00:00',dbtz:'+00:00',currency:'$',lang:'AMERICAN'};
function valToStr(v,cx){
  if(v==null)return null;if(isStr(v))return v;if(typeof v==='number')return numToStr(v);if(typeof v==='boolean')return v?'TRUE':'FALSE';
  if(v instanceof DT){const n=nlsOf(cx);if(v.kind==='DATE')return fmtDate(v,n.dateFmt,n);if(v.kind==='TSTZ')return fmtDate(v,n.tstzFmt,n);if(v.kind==='TSLTZ')return fmtDate(ltzToSession(v,cx),n.tsFmt,n);return fmtDate(v,n.tsFmt,n);}
  if(v instanceof IV)return fmtInterval(v);
  if(v&&v.coll)throw E('ORA-00932','inconsistent datatypes: expected CHAR got COLLECTION');
  if(v&&v.cursor)throw E('ORA-00932','inconsistent datatypes: expected CHAR got CURSOR');
  if(v&&v.rec)throw E('ORA-00932','inconsistent datatypes');
  return String(v);
}
function ltzToSession(v,cx){const u=v.s;const tz=sessTZ(nlsOf(cx),u);return new DT('TS',u+tz.off*60,v.ns);}
function toNum(v,cx){if(v==null)return null;if(typeof v==='number')return v;if(isStr(v))return strToNum(v);if(typeof v==='boolean')throw E('ORA-06502','PL/SQL: numeric or value error');
  if(v instanceof DT)throw E('ORA-00932','inconsistent datatypes: expected NUMBER got DATE');if(v instanceof IV)throw E('ORA-00932','inconsistent datatypes: expected NUMBER got INTERVAL');throw E('ORA-00932','inconsistent datatypes: expected NUMBER');}
function toDate(v,cx,kind){
  if(v==null)return null;if(v instanceof DT)return v;
  if(isStr(v)){const n=nlsOf(cx);if(kind==='TS')return parseDate(v,n.tsFmt,'TS',n);if(kind==='TSTZ')return parseDate(v,n.tstzFmt,'TSTZ',n);return parseDate(v,n.dateFmt,'DATE',n);}
  if(typeof v==='number')throw E('ORA-00932','inconsistent datatypes: expected DATE got NUMBER');
  throw E('ORA-00932','inconsistent datatypes: expected DATE');}
function dtToDate(d){if(d==null)return null;if(d.kind==='DATE')return d;return new DT('DATE',d.s,0);}
function dtUTC(d,cx){if(d.kind==='TSTZ'||d.kind==='TSLTZ')return d.kind==='TSLTZ'?d.s:d.utc();return d.s;}
function cmpDT(a,b,cx){const x=(a.kind==='TSTZ'||b.kind==='TSTZ'||a.kind==='TSLTZ'||b.kind==='TSLTZ')?[cmpUTC(a,cx),cmpUTC(b,cx)]:[a.s,b.s];if(x[0]!==x[1])return x[0]<x[1]?-1:1;const na=a.ns||0,nb=b.ns||0;return na<nb?-1:na>nb?1:0;}
function cmpUTC(d,cx){if(d.kind==='TSTZ')return d.utc();if(d.kind==='TSLTZ')return d.s;const tz=sessTZ(nlsOf(cx),d.s);return d.s-tz.off*60;}
function ivVal(v){return v.kind==='YM'?v.m:v.s*1e9+v.ns;}
/* compare two non-null values with Oracle's implicit conversions; pad=true uses blank-padded semantics */
function cmpVals(a,b,cx,pad){
  if(typeof a==='number'&&typeof b==='number')return a<b?-1:a>b?1:0;
  if(isStr(a)&&isStr(b)){if(pad){a=a.replace(/ +$/,'');b=b.replace(/ +$/,'');}return a<b?-1:a>b?1:0;}
  if(typeof a==='number'||typeof b==='number'){const x=toNum(a,cx),y=toNum(b,cx);return x<y?-1:x>y?1:0;}
  if(a instanceof DT||b instanceof DT){const x=a instanceof DT?a:toDate(a,cx,b.kind==='DATE'?'DATE':b.kind),y=b instanceof DT?b:toDate(b,cx,a.kind==='DATE'?'DATE':a.kind);return cmpDT(x,y,cx);}
  if(a instanceof IV&&b instanceof IV){if(a.kind!==b.kind)throw E('ORA-00932','inconsistent datatypes: expected INTERVAL got INTERVAL');const x=ivVal(a),y=ivVal(b);return x<y?-1:x>y?1:0;}
  if(typeof a==='boolean'&&typeof b==='boolean')return a===b?0:a?1:-1;
  if(a&&a.coll&&b&&b.coll){return JSON.stringify(collVals(a).map(valKey))===JSON.stringify(collVals(b).map(valKey))?0:1;}
  throw E('ORA-00932','inconsistent datatypes');
}
function valKey(v){if(v==null)return'\u0000';if(typeof v==='number')return'n'+(Object.is(v,-0)?0:v);if(isStr(v))return's'+v;if(v instanceof DT)return'd'+(v.kind==='TSTZ'?v.utc():v.s)+'.'+(v.ns||0);if(v instanceof IV)return'i'+v.kind+ivVal(v);if(typeof v==='boolean')return'b'+v;if(v&&v.rec)return'r'+JSON.stringify(Object.keys(v.f).map(k=>valKey(v.f[k])));return'o'+String(v);}
/* ---------- arithmetic ---------- */
function addSecs(d,secs,ns){let s=d.s+Math.floor(secs);let n=(d.ns||0)+(ns||0);while(n>=1e9){n-=1e9;s++;}while(n<0){n+=1e9;s--;}const r=new DT(d.kind,s,d.kind==='DATE'?0:n,d.tz);r.fp=d.fp;return r;}
function addMonthsDT(d,n){const f=fields(d.s);let m=f.M-1+n;let Y=f.Y+Math.floor(m/12);m=((m%12)+12)%12;const last=f.D===dim(f.Y,f.M);const dmax=dim(Y,m+1);const D=last||f.D>dmax?dmax:f.D;
  const r=new DT(d.kind,mkSY(Y,m+1,D,f.h,f.mi,f.sec),d.ns,d.tz);r.fp=d.fp;return r;}
function addIV(d,iv,sign){if(iv.kind==='YM'){const f=fields(d.s);const nm=addMonthsNoClip(d,sign*iv.m);return nm;}return addSecs(d,sign*iv.s,sign*iv.ns);}
function addMonthsNoClip(d,n){const f=fields(d.s);let m=f.M-1+n;let Y=f.Y+Math.floor(m/12);m=((m%12)+12)%12;if(f.D>dim(Y,m+1))throw E('ORA-01839','date not valid for month specified');const r=new DT(d.kind,mkSY(Y,m+1,f.D,f.h,f.mi,f.sec),d.ns,d.tz);r.fp=d.fp;return r;}
function arith(op,a,b,cx){
  if(a==null||b==null)return null;
  if(op==='+'||op==='-'){
    if(a instanceof DT){
      if(b instanceof IV)return addIV(a,b,op==='+'?1:-1);
      if(b instanceof DT){if(op==='+')throw E('ORA-00975','date + date not allowed');
        if(a.kind==='DATE'&&b.kind==='DATE')return(a.s-b.s)/86400;
        const sa=a.kind==='TSTZ'?a.utc():a.s,sb=b.kind==='TSTZ'?b.utc():b.s;const diff=sa-sb;let ns=(a.ns||0)-(b.ns||0);let s=diff;if(ns<0&&s>0){ns+=1e9;s--;}else if(ns>0&&s<0){ns-=1e9;s++;}const r=new IV('DS',s,ns);r.fp=9;return r;}
      const n=toNum(b,cx);const secs=Math.round(n*86400*1000)/1000;const base=a.kind==='DATE'?a:new DT('DATE',a.kind==='TSTZ'?a.s:a.s,0);return addSecs(base,(op==='+'?1:-1)*Math.round(secs),0);}
    if(b instanceof DT){if(op==='-')throw E('ORA-00932','inconsistent datatypes: expected NUMBER got DATE');if(a instanceof IV)return addIV(b,a,1);return arith('+',b,a,cx);}
    if(a instanceof IV&&b instanceof IV){if(a.kind!==b.kind)throw E('ORA-00932','inconsistent datatypes: expected INTERVAL YEAR TO MONTH got INTERVAL DAY TO SECOND');const s=op==='+'?1:-1;return a.kind==='YM'?new IV('YM',a.m+s*b.m):new IV('DS',a.s+s*b.s,a.ns+s*b.ns);}
    const x=toNum(a,cx),y=toNum(b,cx);return fixFloat(op==='+'?x+y:x-y);}
  if(op==='*'){if(a instanceof IV){const n=toNum(b,cx);return a.kind==='YM'?new IV('YM',Math.trunc(a.m*n)):new IV('DS',Math.trunc(a.s*n),Math.round(a.ns*n));}if(b instanceof IV)return arith('*',b,a,cx);return fixFloat(toNum(a,cx)*toNum(b,cx));}
  if(op==='/'){const y=toNum(b,cx);if(a instanceof IV){if(y===0)throw E('ORA-01476','divisor is equal to zero');return a.kind==='YM'?new IV('YM',Math.trunc(a.m/y)):new IV('DS',Math.trunc(a.s/y),0);}const x=toNum(a,cx);if(y===0)throw E('ORA-01476','divisor is equal to zero');return fixFloat(x/y);}
  if(op==='MOD'){return FN.MOD.f([a,b],cx);}
  if(op==='**'){return Math.pow(toNum(a,cx),toNum(b,cx));}
  throw E('ORA-00936','missing expression');
}
function fixFloat(x){if(!isFinite(x))throw E('ORA-01426','numeric overflow');const r=Number(x.toPrecision(15));return Object.is(r,-0)?0:r;}
function concat(a,b,cx){const x=a==null?'':valToStr(a,cx),y=b==null?'':valToStr(b,cx);const r=x+y;return r===''?null:r;}

/* ---------- regex translation ---------- */
const POSIX={alpha:'A-Za-z',digit:'0-9',alnum:'A-Za-z0-9',upper:'A-Z',lower:'a-z',space:'\\s',punct:'!-\\/:-@\\[-`{-~',xdigit:'0-9A-Fa-f',blank:' \\t',cntrl:'\\x00-\\x1f',print:'\\x20-\\x7e',graph:'\\x21-\\x7e',word:'\\w'};
function oraRegex(pat,mp,global){
  if(pat==null)return null;let s=String(pat);let flags=global?'g':'';const m=String(mp||'');
  let ci=false,nl=false,ml=false,xx=false;for(const c of m){if(c==='i')ci=true;else if(c==='c')ci=false;else if(c==='n')nl=true;else if(c==='m')ml=true;else if(c==='x')xx=true;else throw E('ORA-01760','illegal argument for function');}
  if(xx)s=s.replace(/\s+/g,'');
  s=s.replace(/\[\[:(\w+):\]\]/g,(m0,k)=>POSIX[k]?'['+POSIX[k]+']':m0).replace(/\[:(\w+):\]/g,(m0,k)=>POSIX[k]||m0);
  s=s.replace(/\[=(.)=\]/g,'$1').replace(/\[\.(.)\.\]/g,'$1');
  if(ci)flags+='i';if(nl)flags+='s';if(ml)flags+='m';
  try{return new RegExp(s,flags);}catch(e){let d=0,inb=false;for(let i=0;i<s.length;i++){const c=s[i];if(c==='\\'){i++;continue;}if(inb){if(c===']')inb=false;continue;}if(c==='[')inb=true;else if(c==='(')d++;else if(c===')')d--;}
    if(!inb&&d!==0)throw E('ORA-12725','unmatched parentheses in regular expression');throw E('ORA-12726','unmatched bracket in regular expression');}
}
function rxArg(v,name,min){if(v!=null&&v<min)throw E('ORA-01428',"argument '"+v+"' is out of range");return v;}
function rxGroups(re){return new RegExp(re.source+'|').exec('').length-1;}
function soundex(s){
  if(s==null)return null;const u=String(s).toUpperCase().replace(/[^A-Z]/g,'');if(!u)return null;
  const code=c=>'BFPV'.includes(c)?'1':'CGJKQSXZ'.includes(c)?'2':'DT'.includes(c)?'3':c==='L'?'4':'MN'.includes(c)?'5':c==='R'?'6':'';
  let out=u[0];let prev=code(u[0]);
  for(let i=1;i<u.length&&out.length<4;i++){const c=u[i];const cd=code(c);if('HW'.includes(c))continue;if(!cd){prev='';continue;}if(cd!==prev)out+=cd;prev=cd;}
  return(out+'000').slice(0,4);
}
function utf8(s){return Array.from(new TextEncoder().encode(String(s)));}
function byteLen(s){return utf8(s).length;}
function oraNumBytes(n){
  if(n===0)return[128];const neg=n<0;let a=Math.abs(n);
  let e=Math.floor(Math.log(a)/Math.log(100));while(Math.pow(100,e)>a)e--;while(Math.pow(100,e+1)<=a)e++;
  const digits=[];let r=a/Math.pow(100,e);for(let i=0;i<20&&r>1e-12;i++){let d=Math.floor(r+1e-9);if(d>99)d=99;digits.push(d);r=(r-d)*100;if(Math.abs(r-Math.round(r))<1e-7)r=Math.round(r);}
  while(digits.length&&digits[digits.length-1]===0)digits.pop();
  if(!neg)return[193+e,...digits.map(d=>d+1)];
  const out=[62-e,...digits.map(d=>101-d)];if(digits.length<20)out.push(102);return out;
}
function dumpVal(v,fmt,start,len,typ,cx){
  if(v==null)return'NULL';
  let bytes,t=typ;
  if(typeof v==='number'){bytes=oraNumBytes(v);t=t||2;}
  else if(v instanceof DT){const f=fields(v.s);if(t===13){bytes=[f.Y&255,f.Y>>8,f.M,f.D,f.h,f.mi,f.sec,0];}else{bytes=[Math.floor(f.Y/100)+100,f.Y%100+100,f.M,f.D,f.h+1,f.mi+1,f.sec+1];t=t||12;if(v.kind!=='DATE'){t=typ||180;const ns=v.ns||0;if(ns)bytes.push((ns>>>24)&255,(ns>>>16)&255,(ns>>>8)&255,ns&255);}}}
  else{bytes=utf8(valToStr(v,cx));t=t||1;}
  const base=fmt%1000||10;const cs=fmt>=1000;
  let b=bytes;if(start){const st=start<0?b.length+start:start-1;b=b.slice(st,len?st+len:undefined);}
  const enc=x=>base===8?x.toString(8):base===16?x.toString(16):base===17?(x>=32&&x<127?String.fromCharCode(x):'^'+String.fromCharCode(x+64)):String(x);
  return'Typ='+t+' Len='+bytes.length+(cs&&t!==2&&t!==12&&t!==13?' CharacterSet=AL32UTF8':'')+': '+b.map(enc).join(',');
}
function initcap(s){return String(s).toLowerCase().replace(/(^|[^A-Za-z0-9\u00C0-\u024F])([a-z\u00E0-\u024F])/g,(m,a,b)=>a+b.toUpperCase());}
function instrImpl(s,sub,pos,occ){
  if(s==null||sub==null)return null;pos=pos==null?1:Math.trunc(pos);occ=occ==null?1:Math.trunc(occ);
  if(occ<=0)throw E('ORA-01428',"argument '"+occ+"' is out of range");if(pos===0)return 0;
  if(pos>0){let i=pos-1;for(let k=0;k<occ;k++){const j=s.indexOf(sub,i);if(j<0)return 0;if(k===occ-1)return j+1;i=j+1;}}
  else{let i=s.length+pos;for(let k=0;k<occ;k++){const j=s.lastIndexOf(sub,i);if(j<0)return 0;if(k===occ-1)return j+1;i=j-1;if(i<0)return 0;}}
  return 0;
}
function substrImpl(s,pos,len){
  if(s==null||pos==null)return null;s=String(s);pos=Math.trunc(pos);if(len!=null){len=Math.trunc(len);if(len<1)return null;}
  let st=pos>0?pos-1:pos===0?0:s.length+pos;if(st<0){if(pos<0)return null;st=0;}if(st>=s.length)return null;
  const r=len==null?s.slice(st):s.slice(st,st+len);return r===''?null:r;
}
function padImpl(s,n,p,left){if(s==null||n==null)return null;n=Math.trunc(n);if(n<=0)return null;s=String(s);p=p==null?' ':String(p);if(p==='')return null;
  if(s.length>=n)return s.slice(0,n);let fill='';while(fill.length<n-s.length)fill+=p;fill=fill.slice(0,n-s.length);return left?fill+s:s+fill;}
function trimSet(s,set,left,right){if(s==null)return null;s=String(s);set=set==null?' ':String(set);let a=0,b=s.length;if(left)while(a<b&&set.includes(s[a]))a++;if(right)while(b>a&&set.includes(s[b-1]))b--;const r=s.slice(a,b);return r===''?null:r;}
function translateImpl(s,from,to){if(s==null||from==null||to==null)return null;let out='';for(const c of String(s)){const i=from.indexOf(c);if(i<0)out+=c;else if(i<to.length)out+=to[i];}return out===''?null:out;}
/* ---------- date helpers ---------- */
function truncDate(d,fmt,round){
  const f=fields(d.s);const F=String(fmt==null?'DD':fmt).toUpperCase();let r;
  const day=(Y,M,D)=>new DT('DATE',mkSY(Y,M,D),0);
  const secsOfDay=f.h*3600+f.mi*60+f.sec+(d.ns||0)/1e9;
  switch(F){
    case'SYYYY':case'YYYY':case'YEAR':case'SYEAR':case'YYY':case'YY':case'Y':r=round&&f.M>=7?day(f.Y+1,1,1):day(f.Y,1,1);break;
    case'IYYY':case'IYY':case'IY':case'I':{const iso=y=>{const j4=new Date(Date.UTC(y,0,4));const dw=(j4.getUTCDay()+6)%7;return day(y,1,4-dw);};let st=iso(f.Y+1);if(d.s>=st.s)r=st;else{st=iso(f.Y);r=d.s>=st.s?st:iso(f.Y-1);}break;}
    case'Q':{const qm=Math.floor((f.M-1)/3)*3+1;if(round&&(f.M>qm+1||(f.M===qm+1&&f.D>=16)))r=addMonthsDT(day(f.Y,qm,1),3);else r=day(f.Y,qm,1);break;}
    case'MONTH':case'MON':case'MM':case'RM':r=round&&f.D>=16?addMonthsDT(day(f.Y,f.M,1),1):day(f.Y,f.M,1);break;
    case'WW':{const j1=new Date(Date.UTC(f.Y,0,1)).getUTCDay();const cur=f.dow;let back=(cur-j1+7)%7;r=new DT('DATE',mkSY(f.Y,f.M,f.D)-back*86400,0);if(round&&(back+secsOfDay/86400)>=3.5)r=new DT('DATE',r.s+7*86400,0);break;}
    case'IW':{const back=(f.dow+6)%7;r=new DT('DATE',mkSY(f.Y,f.M,f.D)-back*86400,0);if(round&&(back+secsOfDay/86400)>=3.5)r=new DT('DATE',r.s+7*86400,0);break;}
    case'W':{const m1=new Date(Date.UTC(f.Y,f.M-1,1)).getUTCDay();const back=(f.dow-m1+7)%7;r=new DT('DATE',mkSY(f.Y,f.M,f.D)-back*86400,0);if(round&&(back+secsOfDay/86400)>=3.5)r=new DT('DATE',r.s+7*86400,0);break;}
    case'DDD':case'DD':case'J':r=day(f.Y,f.M,f.D);if(round&&secsOfDay>=43200)r=new DT('DATE',r.s+86400,0);break;
    case'DAY':case'DY':case'D':{const back=f.dow;r=new DT('DATE',mkSY(f.Y,f.M,f.D)-back*86400,0);if(round&&(back+secsOfDay/86400)>=3.5)r=new DT('DATE',r.s+7*86400,0);break;}
    case'HH':case'HH12':case'HH24':r=new DT('DATE',mkSY(f.Y,f.M,f.D,f.h),0);if(round&&f.mi>=30)r=new DT('DATE',r.s+3600,0);break;
    case'MI':r=new DT('DATE',mkSY(f.Y,f.M,f.D,f.h,f.mi),0);if(round&&f.sec>=30)r=new DT('DATE',r.s+60,0);break;
    case'CC':case'SCC':{const c=Math.floor((f.Y-1)/100);r=day(c*100+1,1,1);if(round&&f.Y-c*100>50)r=day(c*100+101,1,1);break;}
    default:throw E('ORA-01821','date format not recognized');
  }
  return r;
}
function monthsBetween(a,b){const fa=fields(a.s),fb=fields(b.s);const la=fa.D===dim(fa.Y,fa.M),lb=fb.D===dim(fb.Y,fb.M);
  const m=(fa.Y-fb.Y)*12+(fa.M-fb.M);if(fa.D===fb.D||(la&&lb))return m;
  const sa=fa.D*86400+fa.h*3600+fa.mi*60+fa.sec,sb=fb.D*86400+fb.h*3600+fb.mi*60+fb.sec;return fixFloat(m+(sa-sb)/(31*86400));}
function nextDay(d,name){const u=String(name).trim().toUpperCase();let k=DAYN.findIndex(x=>x===u||x.slice(0,3)===u);if(k<0)throw E('ORA-01846','not a valid day of the week');
  const f=fields(d.s);let add=(k-f.dow+7)%7;if(add===0)add=7;return addSecs(dtToDate(d),add*86400,0);}
function nowParts(cx){const u=Math.floor(Date.now()/1000);const ms=Date.now()%1000;return{u,ns:ms*1e6+Math.floor(Math.random()*1000)*1000};}
function sysTZ(cx){return cx&&cx.db&&cx.db.osTZ||'+00:00';}
function sysdate(cx){const{u}=nowParts(cx);const tz=parseTZ(sysTZ(cx),u);return new DT('DATE',u+tz.off*60,0);}
function systimestamp(cx){const{u,ns}=nowParts(cx);const tz=parseTZ(sysTZ(cx),u);const d=new DT('TSTZ',u+tz.off*60,ns,{off:tz.off,name:null});d.fp=6;return d;}
function currentTS(cx,fp){const{u,ns}=nowParts(cx);const n=nlsOf(cx);const tz=sessTZ(n,u);const isRegion=/[A-Za-z]/.test(n.tz);const d=new DT('TSTZ',u+tz.off*60,roundNs(ns,fp==null?6:fp),{off:tz.off,name:isRegion?n.tz:null});d.fp=fp==null?6:fp;return d;}
function roundNs(ns,fp){const f=Math.pow(10,9-fp);return Math.floor(ns/f)*f;}
function tzOffsetOf(spec,cx){const s=String(spec).trim();if(/^[+-]\d{1,2}:\d{2}$/.test(s))return offStr(parseTZ(s).off);
  const u=s.toUpperCase();if(u==='SESSIONTIMEZONE')return offStr(sessTZ(nlsOf(cx)).off);if(u==='DBTIMEZONE')return offStr(parseTZ(nlsOf(cx).dbtz).off);
  if(TZ_ABBR[u]!=null)return offStr(TZ_ABBR[u]);const r=regionName(s);if(!r)throw E('ORA-01882','timezone region not found');return offStr(regionOffset(r,Math.floor(Date.now()/1000)));}
function atTimeZone(d,tzSpec,cx){if(d==null)return null;let utc;if(d.kind==='TSTZ')utc=d.utc();else if(d.kind==='TSLTZ')utc=d.s;else{const tz=sessTZ(nlsOf(cx),d.s);utc=d.s-tz.off*60;}
  const spec=String(tzSpec);let off,name=null;if(/^[+-]\d/.test(spec))off=parseTZ(spec).off;else{const u=spec.toUpperCase();if(TZ_ABBR[u]!=null&&!spec.includes('/')){off=TZ_ABBR[u];name=u;}else{const r=regionName(spec);if(!r)throw E('ORA-01882','timezone region not found');off=regionOffset(r,utc);name=spec;}}
  const r=new DT('TSTZ',utc+off*60,d.ns,{off,name});r.fp=d.fp||6;return r;}

/* ---------- coercion into declared types ---------- */
function coerce(v,t,cx,ctx){
  if(v==null||!t)return v===''?null:v;
  if(v===''){return null;}
  const where=ctx&&ctx.col?'"'+ctx.owner+'"."'+ctx.table+'"."'+ctx.col+'"':null;const pl=ctx&&ctx.pl;
  switch(t.base){
    case'NUMBER':case'PLS_INTEGER':case'BINARY_INTEGER':case'NATURAL':case'NATURALN':case'POSITIVE':case'POSITIVEN':case'SIMPLE_INTEGER':case'SIGNTYPE':{
      let n=toNumC(v,cx,pl);
      if(t.base!=='NUMBER'){n=Math.round(n);if(t.base==='PLS_INTEGER'||t.base==='BINARY_INTEGER'||t.base==='SIMPLE_INTEGER'){if(Math.abs(n)>2147483647)throw E('ORA-01426','numeric overflow');}
        if((t.base==='NATURAL'||t.base==='NATURALN')&&n<0)throw E('ORA-06502','PL/SQL: numeric or value error');if((t.base==='POSITIVE'||t.base==='POSITIVEN')&&n<1)throw E('ORA-06502','PL/SQL: numeric or value error');return n;}
      if(t.s!=null&&t.p!=null){n=oraRound(n,t.s);if(Math.abs(n)>=Math.pow(10,t.p-t.s)){if(pl)throw E('ORA-06502','PL/SQL: numeric or value error: number precision too large');throw E('ORA-01438','value larger than specified precision allowed for this column');}}
      else if(t.s!=null&&t.p==null){n=oraRound(n,t.s);}
      else if(t.p!=null){n=oraRound(n,0);if(Math.abs(n)>=Math.pow(10,t.p)){if(pl)throw E('ORA-06502','PL/SQL: numeric or value error: number precision too large');throw E('ORA-01438','value larger than specified precision allowed for this column');}}
      return n;}
    case'FLOAT':{const n=toNumC(v,cx,pl);const dig=Math.max(1,Math.ceil(t.p*0.30103));return Number(n.toPrecision(Math.min(dig,15)));}
    case'BINARY_FLOAT':{const n=toNumC(v,cx,pl);return Math.fround(n);}
    case'BINARY_DOUBLE':return toNumC(v,cx,pl);
    case'VARCHAR2':case'NVARCHAR2':case'CHAR':case'NCHAR':{
      let s=v instanceof DT||v instanceof IV||typeof v!=='string'?valToStr(v,cx):v;
      const isChar=t.base==='CHAR'||t.base==='NCHAR';const len=t.len==null?(pl?32767:4000):t.len;
      if(len==null&&!pl)throw E('ORA-00906','missing left parenthesis');
      const charSem=t.base[0]==='N'||t.unit==='CHAR';const L=charSem?[...s].length:byteLen(s);
      if(isChar&&!pl)s=s.replace(/ +$/,m=>m.length>Math.max(0,len-([...s].length-m.length))?m.slice(0,Math.max(0,len-([...s].length-m.length))):m);
      const L2=charSem?[...s].length:byteLen(s);
      if(L2>len){if(pl)throw E('ORA-06502','PL/SQL: numeric or value error: character string buffer too small');throw E('ORA-12899','value too large for column '+(where||'')+' (actual: '+L2+', maximum: '+len+')');}
      if(isChar){const pad=len-(charSem?[...s].length:byteLen(s));if(pad>0)s=s+' '.repeat(pad);}
      return s;}
    case'CLOB':case'NCLOB':case'LONG':return valToStr(v,cx);
    case'RAW':case'BLOB':case'LONG RAW':return valToStr(v,cx);
    case'DATE':{if(v instanceof DT)return dtToDate(v.kind==='TSLTZ'?ltzToSession(v,cx):v);if(typeof v==='number')throw E('ORA-00932','inconsistent datatypes: expected DATE got NUMBER');return toDate(v,cx,'DATE');}
    case'TIMESTAMP':{let d=v instanceof DT?v:toDate(v,cx,'TS');if(d.kind==='TSLTZ')d=ltzToSession(d,cx);const r=new DT('TS',d.s,roundNs(d.ns||0,t.fp==null?6:t.fp));r.fp=t.fp==null?6:t.fp;return r;}
    case'TIMESTAMP WITH TIME ZONE':{let d=v instanceof DT?v:toDate(v,cx,'TSTZ');let r;if(d.kind==='TSTZ')r=new DT('TSTZ',d.s,roundNs(d.ns||0,t.fp),d.tz);else{const tz=sessTZ(nlsOf(cx),d.s);r=new DT('TSTZ',d.s,roundNs(d.ns||0,t.fp),{off:tz.off,name:/[A-Za-z]/.test(nlsOf(cx).tz)?nlsOf(cx).tz:null});}r.fp=t.fp;return r;}
    case'TIMESTAMP WITH LOCAL TIME ZONE':{let d=v instanceof DT?v:toDate(v,cx,'TS');const utc=d.kind==='TSTZ'?d.utc():d.kind==='TSLTZ'?d.s:d.s-sessTZ(nlsOf(cx),d.s).off*60;const r=new DT('TSLTZ',utc,roundNs(d.ns||0,t.fp));r.fp=t.fp;return r;}
    case'INTERVAL YEAR TO MONTH':{if(v instanceof IV){if(v.kind!=='YM')throw E('ORA-00932','inconsistent datatypes: expected INTERVAL YEAR TO MONTH got INTERVAL DAY TO SECOND');if(Math.abs(Math.trunc(v.m/12))>=Math.pow(10,t.lp))throw E('ORA-01873','the leading precision of the interval is too small');return v;}
      return parseIntervalLit(valToStr(v,cx),'YEAR','MONTH');}
    case'INTERVAL DAY TO SECOND':{if(v instanceof IV){if(v.kind!=='DS')throw E('ORA-00932','inconsistent datatypes: expected INTERVAL DAY TO SECOND got INTERVAL YEAR TO MONTH');if(Math.abs(Math.trunc(v.s/86400))>=Math.pow(10,t.lp))throw E('ORA-01873','the leading precision of the interval is too small');const r=new IV('DS',v.s,roundNs(v.ns,t.fp));r.fp=t.fp;return r;}
      const r=parseIntervalLit(valToStr(v,cx),'DAY','SECOND');r.fp=t.fp;return r;}
    case'BOOLEAN':if(typeof v==='boolean')return v;if(typeof v==='number')return v!==0;{const s=String(v).toUpperCase();if(['TRUE','YES','ON','1','T','Y'].includes(s))return true;if(['FALSE','NO','OFF','0','F','N'].includes(s))return false;}throw E('ORA-06502','PL/SQL: numeric or value error');
    default:return v;
  }
}
function toNumC(v,cx,pl){try{return toNum(v,cx);}catch(e){if(pl&&e.code==='ORA-01722')throw E('ORA-06502','PL/SQL: numeric or value error: character to number conversion error');throw e;}}

/* ---------- function library ---------- */
const AGGS=new Set(['COUNT','SUM','AVG','MIN','MAX','LISTAGG','STDDEV','STDDEV_POP','STDDEV_SAMP','VARIANCE','VAR_POP','VAR_SAMP','MEDIAN','GROUPING','GROUPING_ID','COLLECT','APPROX_COUNT_DISTINCT','ANY_VALUE','CORR','COVAR_POP','COVAR_SAMP','BIT_AND_AGG','BIT_OR_AGG']);
const ANALYTIC_ONLY=new Set(['ROW_NUMBER','RANK','DENSE_RANK','PERCENT_RANK','CUME_DIST','NTILE','LAG','LEAD','FIRST_VALUE','LAST_VALUE','NTH_VALUE','RATIO_TO_REPORT']);
const FN={};
const def=(names,min,max,f,o)=>names.split(' ').forEach(n=>{FN[n]=Object.assign({min,max,f},o||{});});
const N1=f=>(a,cx)=>a[0]==null?null:f(toNum(a[0],cx),a,cx);
const S1=f=>(a,cx)=>a[0]==null?null:f(valToStr(a[0],cx),a,cx);
/* null handling / comparison */
def('NVL',2,2,a=>a[0]==null?a[1]:a[0],{lazy:true});
def('NVL2',3,3,a=>a[0]!=null?a[1]:a[2]);
def('NULLIF',2,2,(a,cx)=>{if(a[0]==null)return null;return a[1]!=null&&cmpVals(a[0],a[1],cx)===0?null:a[0];});
def('COALESCE',2,999,a=>{for(const v of a)if(v!=null)return v;return null;},{minErr:'ORA-00938'});
def('LNNVL',1,1,a=>!(a[0]===true));
def('NANVL',2,2,a=>a[0]!=null&&isNaN(a[0])?a[1]:a[0]);
def('GREATEST LEAST',1,999,(a,cx,node)=>{if(a.some(v=>v==null))return null;const big=node.parts[0]==='GREATEST';let r=a[0];
  const conv=v=>typeof a[0]==='number'?toNum(v,cx):a[0] instanceof DT?toDate(v,cx):valToStr(v,cx);
  for(let i=1;i<a.length;i++){const v=conv(a[i]);const c=cmpVals(v,r,cx);if(big?c>0:c<0)r=v;}return r;});
def('DECODE',3,255,(a,cx)=>{const x=a[0];let i=1;for(;i+1<a.length;i+=2){const s=a[i];if((x==null&&s==null)||(x!=null&&s!=null&&cmpVals(x,s,cx)===0))return a[i+1];}return i<a.length?a[i]:null;},{minErr:'ORA-00938'});
/* numeric */
def('ABS',1,1,N1(x=>Math.abs(x)));def('CEIL',1,1,N1(x=>Math.ceil(x-1e-12)===Math.ceil(x)?Math.ceil(x):Math.ceil(x)));def('FLOOR',1,1,N1(x=>Math.floor(x+1e-12)));
def('SIGN',1,1,N1(x=>Math.sign(x)));def('SQRT',1,1,N1(x=>{if(x<0)throw E('ORA-01428',"argument '"+numToStr(x)+"' is out of range");return fixFloat(Math.sqrt(x));}));
def('EXP',1,1,N1(x=>fixFloat(Math.exp(x))));def('LN',1,1,N1(x=>{if(x<=0)throw E('ORA-01428',"argument '"+numToStr(x)+"' is out of range");return fixFloat(Math.log(x));}));
def('LOG',2,2,(a,cx)=>a[0]==null||a[1]==null?null:fixFloat(Math.log(toNum(a[1],cx))/Math.log(toNum(a[0],cx))));
def('POWER',2,2,(a,cx)=>a[0]==null||a[1]==null?null:fixFloat(Math.pow(toNum(a[0],cx),toNum(a[1],cx))));
def('MOD',2,2,(a,cx)=>{if(a[0]==null||a[1]==null)return null;const x=toNum(a[0],cx),y=toNum(a[1],cx);if(y===0)return x;return fixFloat(x-y*Math.trunc(x/y));});
def('REMAINDER',2,2,(a,cx)=>{if(a[0]==null||a[1]==null)return null;const x=toNum(a[0],cx),y=toNum(a[1],cx);if(y===0)throw E('ORA-01476','divisor is equal to zero');let q=x/y;let n=Math.round(q);if(Math.abs(q-Math.trunc(q))===0.5)n=2*Math.round(q/2);return fixFloat(x-y*n);});
def('SIN COS TAN ASIN ACOS ATAN SINH COSH TANH',1,1,(a,cx,node)=>a[0]==null?null:fixFloat(Math[node.parts[0].toLowerCase()](toNum(a[0],cx))));
def('ATAN2',2,2,(a,cx)=>a[0]==null||a[1]==null?null:fixFloat(Math.atan2(toNum(a[0],cx),toNum(a[1],cx))));
def('BITAND',2,2,(a,cx)=>a[0]==null||a[1]==null?null:Number(BigInt(Math.trunc(toNum(a[0],cx)))&BigInt(Math.trunc(toNum(a[1],cx)))));
def('WIDTH_BUCKET',4,4,(a,cx)=>{if(a.some(v=>v==null))return null;const[x,lo,hi,n]=a.map(v=>toNum(v,cx));if(x<lo)return 0;if(x>=hi)return n+1;return Math.floor((x-lo)/(hi-lo)*n)+1;});
def('ROUND',1,2,(a,cx)=>{if(a[0]==null)return null;if(a[0] instanceof DT)return truncDate(a[0],a[1]==null?'DD':valToStr(a[1],cx),true);if(a.length>1&&a[1]==null)return null;return oraRound(toNum(a[0],cx),a[1]==null?0:Math.trunc(toNum(a[1],cx)));});
def('TRUNC',1,2,(a,cx)=>{if(a[0]==null)return null;if(a[0] instanceof DT)return truncDate(a[0],a[1]==null?'DD':valToStr(a[1],cx),false);if(a.length>1&&a[1]==null)return null;return oraTrunc(toNum(a[0],cx),a[1]==null?0:Math.trunc(toNum(a[1],cx)));});
/* strings */
def('ASCII',1,1,S1(s=>{const b=utf8([...s][0]);return b.reduce((x,y)=>x*256+y,0);}));
def('CHR',1,1,N1(n=>{n=Math.trunc(n);if(n<256)return String.fromCharCode(n%256);const b=[];while(n>0){b.unshift(n&255);n=Math.floor(n/256);}try{return new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(b));}catch(e){return String.fromCodePoint(Math.min(0x10ffff,n));}}));
def('NCHR',1,1,N1(n=>String.fromCodePoint(n)));
def('CONCAT',2,2,(a,cx)=>concat(a[0],a[1],cx));
def('UPPER',1,1,S1(s=>s.toUpperCase()));def('LOWER',1,1,S1(s=>s.toLowerCase()));def('INITCAP',1,1,S1(s=>initcap(s)));def('NLS_UPPER',1,2,S1(s=>s.toUpperCase()));def('NLS_LOWER',1,2,S1(s=>s.toLowerCase()));def('NLS_INITCAP',1,2,S1(s=>initcap(s)));
def('LENGTH LENGTHC LENGTH2 LENGTH4',1,1,S1(s=>[...s].length));def('LENGTHB',1,1,S1(s=>byteLen(s)));
def('LPAD',2,3,(a,cx)=>padImpl(a[0]==null?null:valToStr(a[0],cx),a[1]==null?null:toNum(a[1],cx),a.length>2?(a[2]==null?'':valToStr(a[2],cx)):' ',true));
def('RPAD',2,3,(a,cx)=>padImpl(a[0]==null?null:valToStr(a[0],cx),a[1]==null?null:toNum(a[1],cx),a.length>2?(a[2]==null?'':valToStr(a[2],cx)):' ',false));
def('LTRIM',1,2,(a,cx)=>a.length>1&&a[1]==null?null:trimSet(a[0]==null?null:valToStr(a[0],cx),a[1]==null?' ':valToStr(a[1],cx),true,false));
def('RTRIM',1,2,(a,cx)=>a.length>1&&a[1]==null?null:trimSet(a[0]==null?null:valToStr(a[0],cx),a[1]==null?' ':valToStr(a[1],cx),false,true));
def('REPLACE',2,3,(a,cx)=>{if(a[0]==null)return null;const s=valToStr(a[0],cx);if(a[1]==null)return s;const r=s.split(valToStr(a[1],cx)).join(a[2]==null?'':valToStr(a[2],cx));return r===''?null:r;});
def('SUBSTR SUBSTRC SUBSTR2 SUBSTR4',2,3,(a,cx)=>{if(a.length>2&&a[2]==null)return null;return substrImpl(a[0]==null?null:valToStr(a[0],cx),a[1]==null?null:toNum(a[1],cx),a.length>2?toNum(a[2],cx):null);});
def('SUBSTRB',2,3,(a,cx)=>{if(a[0]==null)return null;const b=utf8(valToStr(a[0],cx));const pos=toNum(a[1],cx);let st=pos>0?pos-1:pos===0?0:b.length+pos;const len=a.length>2?toNum(a[2],cx):b.length;const r=new TextDecoder().decode(new Uint8Array(b.slice(st,st+len)));return r===''?null:r;});
def('INSTR INSTRC INSTR2 INSTR4 INSTRB',2,4,(a,cx)=>instrImpl(a[0]==null?null:valToStr(a[0],cx),a[1]==null?null:valToStr(a[1],cx),a[2]==null?(a.length>2?null:1):toNum(a[2],cx),a[3]==null?(a.length>3?null:1):toNum(a[3],cx)));
['SUBSTR','SUBSTRC','SUBSTR2','SUBSTR4','SUBSTRB','INSTR','INSTRC','INSTR2','INSTR4','INSTRB'].forEach(n=>{if(FN[n])FN[n].minErr='ORA-00938';});
def('TRANSLATE',3,3,(a,cx)=>translateImpl(a[0]==null?null:valToStr(a[0],cx),a[1]==null?null:valToStr(a[1],cx),a[2]==null?null:valToStr(a[2],cx)));
def('SOUNDEX',1,1,S1(s=>soundex(s)));
def('REVERSE',1,1,S1(s=>[...s].reverse().join('')));
def('ASCIISTR',1,1,S1(s=>[...s].map(c=>{const k=c.codePointAt(0);if(k<128)return c==='\\'?'\\005C':c;return'\\'+k.toString(16).toUpperCase().padStart(4,'0');}).join('')));
def('UNISTR',1,1,S1(s=>s.replace(/\\([0-9A-Fa-f]{4})/g,(m,h)=>String.fromCharCode(parseInt(h,16)))));
const CHARSETS=new Set(['US7ASCII','WE8ISO8859P1','WE8ISO8859P15','WE8MSWIN1252','WE8DEC','WE8PC850','AL32UTF8','UTF8','AL16UTF16','UTF16','EE8ISO8859P2','EE8MSWIN1250','CL8MSWIN1251','ZHS16GBK','JA16SJIS','KO16MSWIN949','AR8MSWIN1256','IN8ISCII','AL24UTFFSS']);
def('CONVERT',2,3,(a,cx)=>{if(a[0]==null)return null;const s=valToStr(a[0],cx);const dst=String(a[1]||'').toUpperCase();for(const c of [a[1],a[2]])if(c!=null&&!CHARSETS.has(String(c).toUpperCase()))throw E('ORA-01482','unsupported character set');if(/ASCII/.test(dst))return s.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\x00-\x7f]/g,'?');return s;});
def('DUMP',1,4,(a,cx,node)=>{let typ=null;const ar=node.args[0];const st=staticType(ar,cx);
  if(st)typ={VARCHAR2:1,NVARCHAR2:1,NUMBER:2,FLOAT:2,DATE:12,CHAR:96,NCHAR:96,RAW:23,TIMESTAMP:180,'TIMESTAMP WITH TIME ZONE':181,BINARY_FLOAT:100,BINARY_DOUBLE:101}[st.base]||null;
  if(ar.t==='lit'&&ar.str)typ=96;if(ar.t==='id'&&ar.parts[0]==='SYSDATE')typ=13;
  return dumpVal(a[0],a[1]==null?10:toNum(a[1],cx),a[2]==null?null:toNum(a[2],cx),a[3]==null?null:toNum(a[3],cx),typ,cx);});
def('RAWTOHEX',1,1,S1(s=>utf8(s).map(b=>b.toString(16).toUpperCase().padStart(2,'0')).join('')));
def('HEXTORAW',1,1,S1(s=>s.toUpperCase()));
def('UTL_RAW.CAST_TO_RAW',1,1,S1(s=>utf8(s).map(b=>b.toString(16).toUpperCase().padStart(2,'0')).join('')));
def('REGEXP_LIKE',2,3,(a,cx)=>{if(a[0]==null||a[1]==null)return null;return oraRegex(valToStr(a[1],cx),a[2]).test(valToStr(a[0],cx));});
def('REGEXP_COUNT',2,4,(a,cx)=>{if(a[0]==null||a[1]==null)return null;const s=valToStr(a[0],cx);const pos=rxArg(a[2]==null?1:toNum(a[2],cx),'pos',1);const re=oraRegex(valToStr(a[1],cx),a[3],true);const m=s.slice(pos-1).match(re);return m?m.length:0;});
def('REGEXP_INSTR',2,7,(a,cx)=>{if(a[0]==null||a[1]==null)return null;const s=valToStr(a[0],cx);const pos=rxArg(a[2]==null?1:toNum(a[2],cx),'pos',1);const occ=rxArg(a[3]==null?1:toNum(a[3],cx),'occ',1);const ret=a[4]==null?0:toNum(a[4],cx);const grp=a[6]==null?0:toNum(a[6],cx);
  const re=oraRegex(valToStr(a[1],cx),a[5],true);re.lastIndex=pos-1;let m,k=0;while((m=re.exec(s))){if(m[0]==='')re.lastIndex++;k++;if(k===occ){let st=m.index,len=m[0].length;if(grp>0&&m[grp]!=null){st=m.index+m[0].indexOf(m[grp]);len=m[grp].length;}return ret?st+len+1:st+1;}}return 0;});
def('REGEXP_SUBSTR',2,6,(a,cx)=>{if(a[0]==null||a[1]==null)return null;const s=valToStr(a[0],cx);const pos=rxArg(a[2]==null?1:toNum(a[2],cx),'pos',1);const occ=rxArg(a[3]==null?1:toNum(a[3],cx),'occ',1);const grp=a[5]==null?0:toNum(a[5],cx);
  const re=oraRegex(valToStr(a[1],cx),a[4],true);re.lastIndex=pos-1;let m,k=0;while((m=re.exec(s))){if(m[0]===''){re.lastIndex++;}k++;if(k===occ){const r=grp?m[grp]:m[0];return r===''||r==null?null:r;}}return null;});
def('REGEXP_REPLACE',2,6,(a,cx)=>{if(a[0]==null)return null;const s=valToStr(a[0],cx);if(a[1]==null)return s;const rep=a[2]==null?'':valToStr(a[2],cx);const pos=rxArg(a[3]==null?1:toNum(a[3],cx),'pos',1);const occ=rxArg(a[4]==null?0:toNum(a[4],cx),'occ',0);
  const re=oraRegex(valToStr(a[1],cx),a[5],true);{const ng=rxGroups(re);const refs=[...rep.matchAll(/\\(\d)/g)].map(x=>+x[1]);if(refs.some(n=>n>ng))throw E('ORA-12727','invalid back reference in regular expression');}const head=s.slice(0,pos-1);let k=0;const jsRep=rep.replace(/\$/g,'$$$$').replace(/\\(\d)/g,'$$$1');
  const body=s.slice(pos-1).replace(re,(...m)=>{k++;if(occ===0||k===occ){return m[0].replace(new RegExp(re.source,re.flags.replace('g','')),jsRep);}return m[0];});const r=head+body;return r===''?null:r;});
/* conversion */
def('TO_CHAR',1,3,(a,cx)=>{const v=a[0];if(v==null)return null;const n=nlsOf(cx);
  if(a.length<2||a[1]==null){if(a.length>=2&&a[1]==null)return null;if(v instanceof DT)return valToStr(v,cx);if(typeof v==='number')return numToStr(v);return valToStr(v,cx);}
  const f=valToStr(a[1],cx);if(v instanceof DT){const d=v.kind==='TSLTZ'?ltzToSession(v,cx):v;return fmtDate(d,f,n);}
  if(v instanceof IV)return fmtInterval(v);
  if(isStr(v)){const x=strToNum(v);return fmtNumber(x,f,n);}return fmtNumber(toNum(v,cx),f,n);});
def('TO_NCHAR TO_CLOB TO_NCLOB',1,3,(a,cx)=>a[0]==null?null:FN.TO_CHAR.f(a,cx));
def('TO_NUMBER',1,3,(a,cx)=>{if(a[0]==null)return null;if(typeof a[0]==='number')return a[0];return a.length>1&&a[1]!=null?parseNumberFmt(valToStr(a[0],cx),a[1]):strToNum(valToStr(a[0],cx));});
def('TO_BINARY_FLOAT TO_BINARY_DOUBLE',1,3,(a,cx)=>a[0]==null?null:toNum(a[0],cx));
def('TO_DATE',1,3,(a,cx)=>{if(a[0]==null)return null;if(a[0] instanceof DT)return dtToDate(a[0]);const n=nlsOf(cx);return parseDate(valToStr(a[0],cx),a[1]==null?n.dateFmt:valToStr(a[1],cx),'DATE',n);});
def('TO_TIMESTAMP',1,3,(a,cx)=>{if(a[0]==null)return null;if(a[0] instanceof DT){const r=new DT('TS',a[0].s,a[0].ns);r.fp=9;return r;}const n=nlsOf(cx);const f=a[1]==null?n.tsFmt:valToStr(a[1],cx);const d=parseDate(valToStr(a[0],cx),f,'TS',n,9);d.fp=9;return d;});
def('TO_TIMESTAMP_TZ',1,3,(a,cx)=>{if(a[0]==null)return null;const n=nlsOf(cx);const f=a[1]==null?n.tstzFmt:valToStr(a[1],cx);const d=parseDate(valToStr(a[0],cx),f,'TSTZ',n,9);d.fp=9;return d;});
def('TO_YMINTERVAL',1,1,S1(s=>{const m=/^\s*([+-]?)(\d+)-(\d+)\s*$/.exec(s);if(m)return new IV('YM',(m[1]==='-'?-1:1)*(+m[2]*12+ +m[3]));const iso=/^P(?:(\d+)Y)?(?:(\d+)M)?/.exec(s);if(iso)return new IV('YM',(+(iso[1]||0))*12+ +(iso[2]||0));throw E('ORA-01867','the interval is invalid');}));
def('TO_DSINTERVAL',1,1,S1(s=>{const iso=/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s.trim());if(iso&&s.trim()!=='P'){const sec=parseFloat(iso[4]||0);return new IV('DS',(+(iso[1]||0))*86400+(+(iso[2]||0))*3600+(+(iso[3]||0))*60+Math.floor(sec),Math.round((sec%1)*1e9));}return parseIntervalLit(s,'DAY','SECOND');}));
def('NUMTODSINTERVAL',2,2,(a,cx)=>{if(a[0]==null)return null;const n=toNum(a[0],cx);const u=String(a[1]).toUpperCase();const mul={DAY:86400,HOUR:3600,MINUTE:60,SECOND:1}[u];if(!mul)throw E('ORA-01760','illegal argument for function');const tot=n*mul;return new IV('DS',Math.trunc(tot),Math.round((tot-Math.trunc(tot))*1e9));});
def('NUMTOYMINTERVAL',2,2,(a,cx)=>{if(a[0]==null)return null;const n=toNum(a[0],cx);const u=String(a[1]).toUpperCase();if(u==='YEAR')return new IV('YM',Math.round(n*12));if(u==='MONTH')return new IV('YM',Math.round(n));throw E('ORA-01760','illegal argument for function');});
def('VALIDATE_CONVERSION',1,3,(a,cx)=>1);
/* dates */
def('ADD_MONTHS',2,2,(a,cx)=>{if(a[0]==null||a[1]==null)return null;return addMonthsDT(dtToDate(toDate(a[0],cx)),Math.trunc(toNum(a[1],cx)));});
def('LAST_DAY',1,1,(a,cx)=>{if(a[0]==null)return null;const d=toDate(a[0],cx);const f=fields(d.s);return new DT('DATE',mkSY(f.Y,f.M,dim(f.Y,f.M),f.h,f.mi,f.sec),0);});
def('MONTHS_BETWEEN',2,2,(a,cx)=>a[0]==null||a[1]==null?null:monthsBetween(toDate(a[0],cx),toDate(a[1],cx)));
def('NEXT_DAY',2,2,(a,cx)=>a[0]==null||a[1]==null?null:nextDay(toDate(a[0],cx),valToStr(a[1],cx)));
def('NEW_TIME',3,3,(a,cx)=>{if(a.some(v=>v==null))return null;const d=dtToDate(toDate(a[0],cx));const z1=String(a[1]).toUpperCase(),z2=String(a[2]).toUpperCase();if(NEWTIME_ABBR[z1]==null||NEWTIME_ABBR[z2]==null)throw E('ORA-01857','not a valid time zone');return addSecs(d,(NEWTIME_ABBR[z2]-NEWTIME_ABBR[z1])*60,0);});
def('FROM_TZ',2,2,(a,cx)=>{if(a[0]==null||a[1]==null)return null;const d=a[0];if(!(d instanceof DT)||d.kind!=='TS')throw E('ORA-00932','inconsistent datatypes: expected TIMESTAMP got '+(d instanceof DT?d.kind==='DATE'?'DATE':'TIMESTAMP WITH TIME ZONE':'CHAR'));
  const tz=parseTZ(valToStr(a[1],cx),d.s);const r=new DT('TSTZ',d.s,d.ns,tz);r.fp=d.fp||6;return r;});
def('TZ_OFFSET',1,1,(a,cx)=>a[0]==null?null:tzOffsetOf(valToStr(a[0],cx),cx));
def('SYS_EXTRACT_UTC',1,1,(a,cx)=>{if(a[0]==null)return null;const d=a[0];const u=d.kind==='TSTZ'?d.utc():d.kind==='TSLTZ'?d.s:d.s-sessTZ(nlsOf(cx),d.s).off*60;const r=new DT('TS',u,d.ns);r.fp=d.fp||6;return r;});
def('SYSDATE',0,0,(a,cx)=>sysdate(cx),{niladic:1});def('SYSTIMESTAMP',0,1,(a,cx)=>systimestamp(cx),{niladic:1});
def('CURRENT_DATE',0,0,(a,cx)=>{const t=currentTS(cx,0);return new DT('DATE',t.s,0);},{niladic:1});
def('CURRENT_TIMESTAMP',0,1,(a,cx)=>currentTS(cx,a[0]==null?6:toNum(a[0],cx)),{niladic:1});
def('LOCALTIMESTAMP',0,1,(a,cx)=>{const t=currentTS(cx,a[0]==null?6:toNum(a[0],cx));const r=new DT('TS',t.s,t.ns);r.fp=t.fp;return r;},{niladic:1});
def('DBTIMEZONE',0,0,(a,cx)=>nlsOf(cx).dbtz,{niladic:1});
def('SESSIONTIMEZONE',0,0,(a,cx)=>nlsOf(cx).tz,{niladic:1});
/* misc */
def('USER',0,0,(a,cx)=>cx.sess?cx.sess.user:null,{niladic:1});
def('UID',0,0,(a,cx)=>{const u=cx.db&&cx.db.users[cx.sess.user];return u?u.id:0;},{niladic:1});
def('SYS_GUID',0,0,()=>Array.from({length:32},()=>'0123456789ABCDEF'[Math.floor(Math.random()*16)]).join(''));
def('SYS_CONTEXT',2,3,(a,cx)=>{const ns=String(a[0]).toUpperCase(),k=String(a[1]).toUpperCase();if(ns!=='USERENV')return null;
  const m={SESSION_USER:cx.sess.user,CURRENT_USER:cx.sess.user,CURRENT_SCHEMA:cx.sess.user,DB_NAME:'FREE',CON_NAME:'FREEPDB1',INSTANCE_NAME:'FREE',HOST:'localhost',OS_USER:'learner',TERMINAL:'browser',LANGUAGE:'AMERICAN_AMERICA.AL32UTF8',NLS_DATE_FORMAT:nlsOf(cx).dateFmt,SESSIONID:'1',SERVER_HOST:'oracle-sim',IP_ADDRESS:'127.0.0.1',MODULE:'SQL*Plus',SID:'42'};
  if(!(k in m))throw E('ORA-02003','invalid USERENV parameter');return m[k];});
def('USERENV',1,1,(a,cx)=>FN.SYS_CONTEXT.f(['USERENV',a[0]],cx));
def('ORA_HASH',1,3,(a,cx)=>{if(a[0]==null)return null;const s=valToStr(a[0],cx);let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}const max=a[1]==null?4294967295:toNum(a[1],cx);return h%(max+1);});
def('STANDARD_HASH',1,2,(a,cx)=>{const s=valToStr(a[0],cx)||'';let h=0n;for(const c of s)h=(h*131n+BigInt(c.charCodeAt(0)))%(2n**160n);return h.toString(16).toUpperCase().padStart(40,'0');});
def('EMPTY_CLOB EMPTY_BLOB',0,0,()=>null);
def('DBMS_RANDOM.VALUE',0,2,(a,cx)=>{if(a.length===2){const lo=toNum(a[0],cx),hi=toNum(a[1],cx);return lo+Math.random()*(hi-lo);}return Math.random();});
def('DBMS_RANDOM.RANDOM',0,0,()=>Math.floor(Math.random()*4294967296)-2147483648);
def('DBMS_RANDOM.STRING',2,2,(a,cx)=>{const opt=String(a[0]).toUpperCase();const n=toNum(a[1],cx);const set=opt==='U'?'ABCDEFGHIJKLMNOPQRSTUVWXYZ':opt==='L'?'abcdefghijklmnopqrstuvwxyz':opt==='A'?'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz':opt==='X'?'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789':' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';let s='';for(let i=0;i<n;i++)s+=set[Math.floor(Math.random()*set.length)];return s;});
def('DBMS_LOB.GETLENGTH',1,1,S1(s=>s.length));def('DBMS_LOB.SUBSTR',1,3,(a,cx)=>substrImpl(a[0]==null?null:valToStr(a[0],cx),a[2]==null?1:toNum(a[2],cx),a[1]==null?32767:toNum(a[1],cx)));
def('DBMS_LOB.INSTR',2,4,(a,cx)=>instrImpl(valToStr(a[0],cx),valToStr(a[1],cx),a[2]==null?1:toNum(a[2],cx),a[3]==null?1:toNum(a[3],cx)));
def('DBMS_UTILITY.GET_TIME',0,0,()=>Math.floor(performance.now()/10));
def('JSON_VALUE',2,2,(a,cx)=>{try{const o=JSON.parse(a[0]);const path=String(a[1]).replace(/^\$\.?/,'').split('.').filter(Boolean);let v=o;for(const k of path)v=v==null?null:v[k];return v==null?null:typeof v==='object'?null:v;}catch(e){return null;}});
/* aggregates and analytics are evaluated elsewhere; register for arity checks */
def('COUNT',0,1,null);def('SUM AVG MIN MAX STDDEV STDDEV_POP STDDEV_SAMP VARIANCE VAR_POP VAR_SAMP MEDIAN COLLECT APPROX_COUNT_DISTINCT ANY_VALUE',1,1,null);
def('LISTAGG',1,2,null);def('GROUPING',1,1,null);def('GROUPING_ID',1,99,null);def('CORR COVAR_POP COVAR_SAMP',2,2,null);
def('ROW_NUMBER',0,0,null);def('RANK DENSE_RANK PERCENT_RANK CUME_DIST',0,99,null);def('NTILE',1,1,null);def('LAG LEAD',1,3,null);def('FIRST_VALUE LAST_VALUE',1,2,null);def('NTH_VALUE',2,2,null);def('RATIO_TO_REPORT',1,1,null);

/* static type inference (used for CHAR comparison semantics, DUMP, column types of derived tables) */
function staticType(e,cx){
  if(!e)return null;
  switch(e.t){
    case'lit':if(e.v==null)return null;if(typeof e.v==='number')return{base:e.bin==='F'?'BINARY_FLOAT':e.bin==='D'?'BINARY_DOUBLE':'NUMBER'};if(typeof e.v==='boolean')return{base:'BOOLEAN'};return{base:'CHAR',len:String(e.v).length,lit:true};
    case'id':{const r=cx&&cx.f?lookupColType(e.parts,cx):null;if(r)return r;if(cx&&cx.plType){const t=cx.plType(e.parts);if(t)return t;}
      const n=e.parts.length===1?e.parts[0]:null;if(n==='SYSDATE'||n==='CURRENT_DATE')return{base:'DATE'};if(n==='SYSTIMESTAMP'||n==='CURRENT_TIMESTAMP')return{base:'TIMESTAMP WITH TIME ZONE',fp:6};if(n==='LOCALTIMESTAMP')return{base:'TIMESTAMP',fp:6};if(n==='ROWNUM'||n==='LEVEL')return{base:'NUMBER'};if(n==='USER')return{base:'VARCHAR2',len:128};
      if(e.parts.length===2&&(e.parts[1]==='NEXTVAL'||e.parts[1]==='CURRVAL'))return{base:'NUMBER'};return null;}
    case'bind':return null;
    case'dlit':return e.kind==='DATE'?{base:'DATE'}:{base:'TIMESTAMP',fp:9};
    case'ilit':return{base:e.from==='YEAR'||e.from==='MONTH'?'INTERVAL YEAR TO MONTH':'INTERVAL DAY TO SECOND',lp:2,fp:6};
    case'cast':return e.type;
    case'neg':return staticType(e.a,cx)||{base:'NUMBER'};
    case'bin':{if(e.op==='||')return{base:'VARCHAR2',len:4000};if(['AND','OR'].includes(e.op))return{base:'BOOLEAN'};
      const a=staticType(e.a,cx),b=staticType(e.b,cx);if(a&&isDateT(a)&&b&&isDateT(b)&&e.op==='-')return a.base==='DATE'&&b.base==='DATE'?{base:'NUMBER'}:{base:'INTERVAL DAY TO SECOND',lp:9,fp:9};
      if(a&&isDateT(a))return a.base==='DATE'||(b&&/INTERVAL/.test(b.base))?a:{base:'DATE'};if(b&&isDateT(b))return b;if(a&&/INTERVAL/.test(a.base))return a;return{base:'NUMBER'};}
    case'case':{const ts=e.whens.map(w=>staticType(w[1],cx)).concat(e.els?[staticType(e.els,cx)]:[]).filter(Boolean);if(!ts.length)return null;const t0=ts[0];if(isCharT(t0)||t0.lit){let L=0;for(const t of ts)if((isCharT(t)||t.lit)&&t.len!=null)L=Math.max(L,t.len);return{base:'VARCHAR2',len:L||t0.len};}return t0;}
    case'extract':return/TIMEZONE_(REGION|ABBR)/.test(e.field)?{base:'VARCHAR2',len:64}:{base:'NUMBER'};
    case'trim':return{base:'VARCHAR2',len:4000};
    case'call':{const n=e.parts.join('.');
      if(['COUNT','SUM','AVG','ROW_NUMBER','RANK','DENSE_RANK','NTILE','PERCENT_RANK','CUME_DIST','LENGTH','INSTR','ASCII','ABS','CEIL','FLOOR','MOD','POWER','SQRT','SIGN','TO_NUMBER','MONTHS_BETWEEN','REGEXP_COUNT','REGEXP_INSTR','STDDEV','VARIANCE','MEDIAN','GROUPING','GROUPING_ID','ORA_HASH','BITAND','EXP','LN','LOG','REMAINDER'].includes(n))return{base:'NUMBER'};
      if(['ROUND','TRUNC'].includes(n)){const t=staticType(e.args[0],cx);return t&&isDateT(t)?{base:'DATE'}:{base:'NUMBER'};}
      if(['MIN','MAX','NVL','COALESCE','NULLIF','FIRST_VALUE','LAST_VALUE','NTH_VALUE','LAG','LEAD','GREATEST','LEAST','ANY_VALUE'].includes(n)){const t=staticType(e.args[0],cx);return t&&t.lit?{base:'VARCHAR2',len:t.len}:t;}
      if(n==='NVL2')return staticType(e.args[1],cx);if(n==='DECODE')return staticType(e.args[2],cx);
      if(['TO_DATE','ADD_MONTHS','LAST_DAY','NEXT_DAY','NEW_TIME','SYSDATE','CURRENT_DATE'].includes(n))return{base:'DATE'};
      if(['TO_TIMESTAMP','LOCALTIMESTAMP','SYS_EXTRACT_UTC'].includes(n))return{base:'TIMESTAMP',fp:9};
      if(['TO_TIMESTAMP_TZ','FROM_TZ','SYSTIMESTAMP','CURRENT_TIMESTAMP'].includes(n))return{base:'TIMESTAMP WITH TIME ZONE',fp:9};
      if(['TO_YMINTERVAL','NUMTOYMINTERVAL'].includes(n))return{base:'INTERVAL YEAR TO MONTH',lp:9};if(['TO_DSINTERVAL','NUMTODSINTERVAL'].includes(n))return{base:'INTERVAL DAY TO SECOND',lp:9,fp:9};
      if(n==='CHR'||n==='SOUNDEX'||n==='DUMP'||n==='TO_CHAR'||n==='LISTAGG'||n==='RPAD'||n==='LPAD'||/^REGEXP_(SUBSTR|REPLACE)$/.test(n)||['UPPER','LOWER','INITCAP','SUBSTR','REPLACE','TRANSLATE','LTRIM','RTRIM','CONCAT','CONVERT','ASCIISTR','REVERSE','SYS_GUID','TZ_OFFSET','DBTIMEZONE','SESSIONTIMEZONE','SYS_CONTEXT'].includes(n)){
        if(['UPPER','LOWER','INITCAP','SUBSTR','RPAD','LPAD','LTRIM','RTRIM','REPLACE','TRANSLATE'].includes(n)){const t=staticType(e.args[0],cx);if(t&&(t.base==='CHAR'||t.base==='NCHAR')&&!t.lit)return{base:t.base==='NCHAR'?'NVARCHAR2':'VARCHAR2',len:t.len};if(t&&t.base==='NVARCHAR2')return t;}
        return{base:'VARCHAR2',len:4000};}
      if(cx&&cx.fnType){const t=cx.fnType(e);if(t)return t;}
      return null;}
    case'sub':return null;
    case'atz':return{base:'TIMESTAMP WITH TIME ZONE',fp:6};
    default:return null;
  }
}
function lookupColType(parts,cx){
  for(let f=cx.f;f;f=f.up){
    if(parts.length===1){for(const d of f.d){const i=d.idx[parts[0]];if(i!==undefined)return d.types?d.types[i]:null;}}
    else if(parts.length===2){for(const d of f.d){if(d.alias===parts[0]){const i=d.idx[parts[1]];if(i!==undefined)return d.types?d.types[i]:null;}}}
  }
  return null;
}

/* ===== expression evaluator ===== */
function sub(cx,o){const c=Object.create(cx);if(o)Object.assign(c,o);return c;}
function exprKey(e){if(e._k)return e._k;const k=JSON.stringify(e,(key,v)=>key==='line'||key==='col'||key==='raw'||key==='paren'||key==='_k'||key==='text'||key==='q'&&typeof v==='boolean'?undefined:v);try{Object.defineProperty(e,'_k',{value:k,enumerable:false,writable:true});}catch(x){}return k;}
function truthy3(v){return v===true;}
function evalB(e,cx){const v=evalE(e,cx);if(v==null)return null;if(typeof v==='boolean')return v;if(typeof v==='number')return v!==0;throw E('ORA-00920','invalid relational operator');}
function likeToRe(pat,esc){let s='^';const p=String(pat);for(let i=0;i<p.length;i++){const c=p[i];
    if(esc!=null&&c===esc){const n=p[i+1];if(n==null||!(n==='%'||n==='_'||n===esc))throw E('ORA-01424','missing or illegal character following the escape character');s+=n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');i++;continue;}
    if(c==='%')s+='[\\s\\S]*';else if(c==='_')s+='[\\s\\S]';else s+=c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
  return new RegExp(s+'$');}
const likeCache=new Map();
function isPadT(t){return !t||t.base==='CHAR'||t.base==='NCHAR'||t.lit;}
function padSem(e1,e2,cx){const a=staticType(e1,cx),b=staticType(e2,cx);if(!a||!b)return false;return(a.base==='CHAR'||a.base==='NCHAR'||a.lit)&&(b.base==='CHAR'||b.base==='NCHAR'||b.lit);}
function cmpOp(op,c){return op==='='?c===0:op==='<>'?c!==0:op==='<'?c<0:op==='>'?c>0:op==='<='?c<=0:c>=0;}
function cmp3(op,a,b,cx,pad){
  if(Array.isArray(a)||Array.isArray(b)){const A=Array.isArray(a)?a:[a],B=Array.isArray(b)?b:[b];if(A.length!==B.length)throw E('ORA-00920','invalid relational operator');
    if(op==='='||op==='<>'){let anyNull=false;for(let i=0;i<A.length;i++){if(A[i]==null||B[i]==null){anyNull=true;continue;}if(cmpVals(A[i],B[i],cx,pad)!==0)return op!=='=';}return anyNull?null:op==='=';}
    throw E('ORA-00920','invalid relational operator');}
  if(a==null||b==null)return null;
  if(typeof a==='boolean'||typeof b==='boolean'){if(op!=='='&&op!=='<>')throw E('ORA-00932','inconsistent datatypes');return cmpOp(op,a===b?0:1);}
  return cmpOp(op,cmpVals(a,b,cx,pad));
}
function listVals(e,cx){/* values of an IN/ANY list or subquery; returns arrays for tuples */
  if(e.sub){const r=runSubquery(e,e.sub,cx,true);if(r.cols.length>1)return r.rows;return r.rows.map(x=>x[0]);}
  return e.list.map(x=>evalE(x,cx));}
function evalE(e,cx){
  if(cx.gnull&&e.t!=='lit'&&cx.gnull.has(exprKey(e)))return null;
  switch(e.t){
    case'lit':return e.v;
    case'dlit':{if(e.kind==='DATE'){const m=/^\s*(-?\d{1,4})-(\d{1,2})-(\d{1,2})\s*$/.exec(e.s);if(!m)throw E('ORA-01861','literal does not match format string');try{return parseDate(e.s.trim(),'YYYY-MM-DD','DATE',nlsOf(cx));}catch(er){if(er&&er.code==='ORA-01839')throw E('ORA-01847','day of month must be between 1 and last day of month');throw er;}}
      const m=/^\s*(\d{1,4}-\d{1,2}-\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,9}))?)?)?\s*(.*)$/.exec(e.s);if(!m)throw E('ORA-01861','literal does not match format string');
      if(+(m[2]||0)>23)throw E('ORA-01850','hour must be between 0 and 23');if(+(m[3]||0)>59)throw E('ORA-01851','minutes must be between 0 and 59');if(+(m[4]||0)>59)throw E('ORA-01852','seconds must be between 0 and 59');let d;try{d=parseDate(m[1],'YYYY-MM-DD','TS',nlsOf(cx));}catch(er){if(er&&er.code==='ORA-01839')throw E('ORA-01847','day of month must be between 1 and last day of month');throw er;}d.s+=(+(m[2]||0))*3600+(+(m[3]||0))*60+(+(m[4]||0));d.ns=parseInt(((m[5]||'')+'000000000').slice(0,9),10);d.fp=m[5]?Math.max(m[5].length,1):0;
      if(m[6]){d.kind='TSTZ';d.tz=parseTZ(m[6],d.s);}return d;}
    case'ilit':{const v=parseIntervalLit(e.s,e.from,e.to);const lp=e.lp==null?2:e.lp;
      if(v.kind==='YM'){const lead=e.from==='YEAR'?Math.abs(Math.trunc(v.m/12)):Math.abs(v.m);if(String(lead).length>lp)throw E('ORA-01873','the leading precision of the interval is too small');}
      else{const lead=e.from==='DAY'?Math.trunc(Math.abs(v.s)/86400):e.from==='HOUR'?Math.trunc(Math.abs(v.s)/3600):e.from==='MINUTE'?Math.trunc(Math.abs(v.s)/60):Math.trunc(Math.abs(v.s));if(String(lead).length>lp)throw E('ORA-01873','the leading precision of the interval is too small');v.fp=e.fp==null?6:e.fp;}
      v.iv={from:e.from,to:e.to};return v;}
    case'id':return resolveId(e,cx);
    case'bind':return resolveBind(e,cx);
    case'neg':{const v=evalE(e.a,cx);if(v==null)return null;if(v instanceof IV)return v.kind==='YM'?new IV('YM',-v.m):new IV('DS',-v.s,-v.ns);return fixFloat(-toNum(v,cx));}
    case'prior':{if(!cx.priorF)throw E('ORA-00976','Specified pseudocolumn or operator not allowed here.');return evalE(e.a,sub(cx,{f:cx.priorF,priorF:null}));}
    case'bin':{
      if(e.op==='AND'){const a=evalB(e.a,cx);if(a===false)return false;const b=evalB(e.b,cx);if(b===false)return false;if(a===null||b===null)return null;return true;}
      if(e.op==='OR'){const a=evalB(e.a,cx);if(a===true)return true;const b=evalB(e.b,cx);if(b===true)return true;if(a===null||b===null)return null;return false;}
      const a=evalE(e.a,cx),b=evalE(e.b,cx);
      if(e.op==='||')return concat(a,b,cx);
      return arith(e.op,a,b,cx);}
    case'not':{const v=evalB(e.a,cx);return v===null?null:!v;}
    case'cmp':{const a=e.a.t==='tuple'?e.a.items.map(x=>evalE(x,cx)):evalE(e.a,cx);let b;
      if(e.b.t==='tuple')b=e.b.items.map(x=>evalE(x,cx));else if(e.b.t==='sub'&&e.a.t==='tuple'){const r=runSubquery(e.b,e.b.q,cx,true);if(r.rows.length>1)throw E('ORA-01427','single-row subquery returns more than one row');b=r.rows[0]||e.a.items.map(()=>null);}
      else b=evalE(e.b,cx);
      return cmp3(e.op,a,b,cx,!Array.isArray(a)&&padSem(e.a,e.b,cx));}
    case'quant':{const a=e.a.t==='tuple'?e.a.items.map(x=>evalE(x,cx)):evalE(e.a,cx);const vals=listVals(e,cx);
      if(e.q==='ANY'){let sawNull=false;for(const v of vals){const r=cmp3(e.op,a,v,cx);if(r===true)return true;if(r===null)sawNull=true;}return sawNull?null:false;}
      let sawNull=false;for(const v of vals){const r=cmp3(e.op,a,v,cx);if(r===false)return false;if(r===null)sawNull=true;}return sawNull?null:true;}
    case'between':{const a=evalE(e.a,cx),lo=evalE(e.lo,cx),hi=evalE(e.hi,cx);const x=cmp3('>=',a,lo,cx),y=cmp3('<=',a,hi,cx);let r;if(x===false||y===false)r=false;else if(x===null||y===null)r=null;else r=true;return e.neg?(r===null?null:!r):r;}
    case'in':{const a=e.a.t==='tuple'?e.a.items.map(x=>evalE(x,cx)):evalE(e.a,cx);const vals=listVals(e,cx);
      let r=false,sawNull=false;if(a==null&&!Array.isArray(a))r=null;else{for(const v of vals){const c=cmp3('=',a,Array.isArray(a)&&!Array.isArray(v)&&v&&v.tuple?v.tuple:v,cx,!Array.isArray(a)&&e.list?padSem(e.a,e.list[0],cx):false);if(c===true){r=true;break;}if(c===null)sawNull=true;}if(r!==true&&sawNull)r=null;}
      return e.neg?(r===null?null:!r):r;}
    case'like':{const a=evalE(e.a,cx),b=evalE(e.b,cx);if(a==null||b==null)return null;let esc=null;if(e.esc){esc=evalE(e.esc,cx);if(esc!=null&&String(esc).length!==1)throw E('ORA-01425','escape character must be character string of length 1');}
      const key=b+'\u0001'+(esc||'');let re=likeCache.get(key);if(!re){re=likeToRe(valToStr(b,cx),esc);likeCache.set(key,re);}const r=re.test(valToStr(a,cx));return e.neg?!r:r;}
    case'isnull':{const v=evalE(e.a,cx);const r=v==null||v==='';return e.neg?!r:r;}
    case'istf':{const v=evalE(e.a,cx);const r=v===e.v;return e.neg?!r:r;}
    case'exists':{const r=runSubquery(e,e.q,cx,false,1);return r.rows.length>0;}
    case'case':{
      if(e.base){const b=evalE(e.base,cx);for(const[w,t]of e.whens){const v=evalE(w,cx);if(b!=null&&v!=null&&cmpVals(b,v,cx,padSem(e.base,w,cx))===0)return evalE(t,cx);}}
      else for(const[w,t]of e.whens){if(evalB(w,cx)===true)return evalE(t,cx);}
      if(e.els!==undefined)return evalE(e.els,cx);if(cx.caseStmt)throw E('ORA-06592','CASE not found while executing CASE statement');return null;}
    case'cast':{const v=evalE(e.a,cx);if(v==null)return null;try{if(e.type.base==='VARCHAR2'||e.type.base==='CHAR'||e.type.base==='NVARCHAR2'){const s=valToStr(v,cx);const L=e.type.base==='CHAR'?s.length:s.length;if(e.type.len!=null&&L>e.type.len)throw E('ORA-25137','Data value out of range');return e.type.base==='CHAR'?s.padEnd(e.type.len,' '):s;}
        if(e.type.base==='NUMBER'&&e.type.p!=null){const n=toNum(v,cx);return coerce(n,e.type,cx,{});}
        if(e.type.base==='USER'&&cx.castColl)return cx.castColl(v,e.type,cx);return coerce(v,e.type,cx,{});}catch(err){if(e.def){return evalE(e.def,cx);}throw err;}}
    case'castms':{if(!cx.castMultiset)throw NOT_SUP('CAST(MULTISET)');return cx.castMultiset(e,cx);}
    case'extract':return extractField(e.field,evalE(e.a,cx),cx);
    case'trim':{const v=evalE(e.a,cx);if(v==null)return null;let ch=' ';if(e.ch){ch=evalE(e.ch,cx);if(ch==null)return null;ch=valToStr(ch,cx);if(ch.length!==1)throw E('ORA-30001','trim set should have only one character');}
      return trimSet(valToStr(v,cx),ch,e.mode!=='TRAILING',e.mode!=='LEADING');}
    case'sub':{const r=runSubquery(e,e.q,cx,true);if(r.cols.length>1)throw E('ORA-00913','too many values');if(r.rows.length>1)throw E('ORA-01427','single-row subquery returns more than one row');return r.rows.length?r.rows[0][0]:null;}
    case'tuple':return e.items.map(x=>evalE(x,cx));
    case'atz':{const v=evalE(e.a,cx);if(v==null)return null;if(!(v instanceof DT))throw E('ORA-00932','inconsistent datatypes: expected TIMESTAMP got '+(typeof v==='number'?'NUMBER':'CHAR'));
      if(e.local){return atTimeZone(v,nlsOf(cx).tz,cx);}const tz=evalE(e.tz,cx);return atTimeZone(v,tz,cx);}
    case'attr':if(cx.pl)return cx.pl.attr(e,cx);throw E('ORA-00911','invalid character');
    case'call':return evalCall(e,cx);
    case'field':{if(cx.pl&&cx.pl.field)return cx.pl.field(e,cx);const b=evalE(e.base,cx);if(b&&b.rec){if(!(e.name in b.f))throw E('PLS-00302',"component '"+e.name+"' must be declared");return b.f[e.name];}throw E('ORA-00904','"'+e.name+'": invalid identifier');}
    case'callon':{if(cx.pl&&cx.pl.callon)return cx.pl.callon(e,cx);throw E('ORA-00904',': invalid identifier');}
    case'default':throw E('ORA-00936','missing expression');
    case'star':throw E('ORA-00936','missing expression');
    case'isempty':case'member':case'submultiset':case'multiset':case'isaset':if(cx.pl&&cx.pl.collOp)return cx.pl.collOp(e,cx);throw NOT_SUP('collection operators');
    case'isjson':{const v=evalE(e.a,cx);if(v==null)return null;let ok=true;try{JSON.parse(v);}catch(x){ok=false;}return e.neg?!ok:ok;}
    default:throw E('ORA-00936','missing expression');
  }
}
function extractField(field,v,cx){
  if(v==null)return null;
  if(v instanceof IV){if(v.kind==='YM'){if(field==='YEAR')return Math.trunc(v.m/12);if(field==='MONTH')return v.m%12;throw E('ORA-30076','invalid extract field for extract source');}
    const s=v.s;const sg=s<0||v.ns<0?-1:1;const a=Math.abs(s);if(field==='DAY')return sg*Math.floor(a/86400);if(field==='HOUR')return sg*Math.floor(a%86400/3600);if(field==='MINUTE')return sg*Math.floor(a%3600/60);if(field==='SECOND')return sg*(a%60+Math.abs(v.ns)/1e9);throw E('ORA-30076','invalid extract field for extract source');}
  if(isStr(v)){v=toDate(v,cx);}
  if(!(v instanceof DT))throw E('ORA-30076','invalid extract field for extract source');
  if(v.kind==='DATE'&&/^(HOUR|MINUTE|SECOND|TIMEZONE_HOUR|TIMEZONE_MINUTE|TIMEZONE_REGION|TIMEZONE_ABBR)$/.test(field))throw E('ORA-30076','invalid extract field for extract source',[hint('DATE se sirf YEAR, MONTH, DAY nikalte hain. Time ke liye CAST(d AS TIMESTAMP) ya TO_CHAR(d,\'HH24\') use karo.')]);
  let s=v.s;if(v.kind==='TSTZ'&&/^(YEAR|MONTH|DAY|HOUR|MINUTE|SECOND)$/.test(field))s=v.utc();if(v.kind==='TSLTZ')s=v.s;
  const f=fields(s);
  switch(field){case'YEAR':return f.Y;case'MONTH':return f.M;case'DAY':return f.D;case'HOUR':return f.h;case'MINUTE':return f.mi;case'SECOND':return f.sec+(v.ns||0)/1e9;
    case'TIMEZONE_HOUR':if(!v.tz)throw E('ORA-30076','invalid extract field for extract source');return Math.trunc(v.tz.off/60);
    case'TIMEZONE_MINUTE':if(!v.tz)throw E('ORA-30076','invalid extract field for extract source');return v.tz.off%60;
    case'TIMEZONE_REGION':if(!v.tz)throw E('ORA-30076','invalid extract field for extract source');return v.tz.name||'UNKNOWN';
    case'TIMEZONE_ABBR':if(!v.tz)throw E('ORA-30076','invalid extract field for extract source');return v.tz.name?regionAbbr(v.tz.name,v.utc())||'UNK':'UNK';}
  throw E('ORA-00907','missing right parenthesis');
}
/* ---------- names ---------- */
function findCol(parts,cx){
  const n=parts.length;
  for(let f=cx.f;f;f=f.up){
    let hit=null,count=0;
    if(n===1){for(let i=0;i<f.d.length;i++){const d=f.d[i];const k=d.idx[parts[0]];if(k!==undefined&&!(d.hide&&d.hide[k])){count++;hit=[i,k];}}
      if(count>1)throw E('ORA-00918','column ambiguously defined',[hint('Column "'+parts[0]+'" do tables mein hai. Table ka naam/alias lagao, jaise e.'+parts[0].toLowerCase())]);}
    else if(n===2||n===3){const al=n===2?parts[0]:parts[1],cn=parts[n-1];
      for(let i=0;i<f.d.length;i++){const d=f.d[i];if(d.alias===al&&(n===2||!d.owner||d.owner===parts[0])){const k=d.idx[cn];if(k===undefined){if(cx.pl&&cx.pl.has&&cx.pl.has(parts))return null;throw E('ORA-00904','"'+al+'"."'+cn+'": invalid identifier');}if(d.usingHidden&&d.hide&&d.hide[k])throw E('ORA-25154','column part of USING clause cannot have qualifier',[hint('USING wale column ke aage table ka naam/alias mat lagao: sirf '+cn.toLowerCase()+' likho.')]);hit=[i,k];break;}}}
    if(hit){markCorr(f,cx);if(f.ri!=null&&f.rows){return{v:f.rows[f.ri].v[hit[0]][hit[1]]};}return{v:f.v[hit[0]]?f.v[hit[0]][hit[1]]:null,f,src:hit[0]};}
  }
  return null;
}
function markCorr(f,cx){const st=cx.corrStack;if(!st||!st.length)return;for(let i=st.length-1;i>=0;i--){if(f.depth<=st[i].depth)st[i].corr=true;else break;}}
function resolveId(e,cx){
  const parts=e.parts;
  if(cx.f){const r=findCol(parts,cx);if(r)return r.v;}
  if(parts.length===1){const w=parts[0];
    if(!e.q){
      if(w==='ROWNUM'){if(cx.rownum!=null)return cx.rownum;if(cx.f&&cx.f.rownum!=null)return cx.f.rownum;return 1;}
      if(w==='ROWID'){const f=cx.f;if(f&&f.rid&&f.d.length>=1){for(let i=0;i<f.d.length;i++)if(f.rid[i]!=null)return rowidStr(f.d[i].oid,f.rid[i]);}throw E('ORA-01446','cannot select ROWID from, or sample, a view with DISTINCT, GROUP BY, etc.');}
      if(w==='LEVEL'){if(cx.level!=null)return cx.level;if(cx.f&&cx.f.level!=null)return cx.f.level;throw E('ORA-01788','CONNECT BY clause required in this query block');}
      if(w==='CONNECT_BY_ISLEAF'&&cx.f&&cx.f.isleaf!=null)return cx.f.isleaf;
      if(w==='COLUMN_VALUE'&&cx.f){const r=findCol(['COLUMN_VALUE'],cx);if(r)return r.v;}
    }
    if(cx.pl){const r=cx.pl.get(parts,cx,e);if(r!==undefined)return r;}
    if(!e.q&&FN[w]&&FN[w].niladic)return FN[w].f([],cx,{parts:[w],args:[]});
  }else{
    const last=parts[parts.length-1];
    if((last==='NEXTVAL'||last==='CURRVAL')&&cx.db){const r=seqValue(parts,cx);if(r!==undefined)return r;}
    if(cx.pl){const r=cx.pl.get(parts,cx,e);if(r!==undefined)return r;}
  }
  if(cx.callFn){const r=cx.callFn({t:'call',parts,args:[],noParens:true},cx);if(r!==undefined)return r;}
  if(cx.trigNew&&parts.length===2&&(parts[0]==='NEW'||parts[0]==='OLD')){const rec=parts[0]==='NEW'?cx.trigNew:cx.trigOld;if(rec&&parts[1] in rec.f)return rec.f[parts[1]];}
  {const lst=parts[parts.length-1];if(parts.length>=2&&(lst==='NEXTVAL'||lst==='CURRVAL'))throw E('ORA-02289','sequence does not exist');}
  const nm=parts.map(p=>'"'+p+'"').join('.');
  if(cx.plCompile)throw E('PLS-00201',"identifier '"+parts.join('.')+"' must be declared");
  throw E('ORA-00904',nm+': invalid identifier');
}
function rowidStr(oid,rid){const A='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';const b64=(n,w)=>{let s='';for(let i=0;i<w;i++){s=A[n%64]+s;n=Math.floor(n/64);}return s;};
  return b64(73000+(oid||0),6)+'AAM'+b64(150+Math.floor(rid/50),6)+b64(rid%50,3);}
function resolveBind(e,cx){
  if(e.name==='NEW'||e.name==='OLD'){const rec=e.name==='NEW'?cx.trigNew:cx.trigOld;if(!rec)throw E('ORA-04082','NEW or OLD references not allowed in table level triggers');
    if(e.parts.length<2)return rec;const c=e.parts[1];if(!(c in rec.f))throw E('PLS-00049','bad bind variable \''+e.name+'.'+c+'\'');return rec.f[c];}
  const b=cx.binds;if(b&&Object.prototype.hasOwnProperty.call(b,e.name)){const x=b[e.name];return x&&x.hostVar?x.v:x;}
  if(b&&b.__byPos){const k=e.line+':'+e.col;if(b.__byPos.has(k))return b.__byPos.get(k);throw E('ORA-01008','not all variables bound');}
  throw E('SP2-0552','Bind variable "'+e.name+'" not declared.');
}
function seqValue(parts,cx){
  const last=parts[parts.length-1];const q=parts.length===3?{owner:parts[0],name:parts[1]}:{owner:null,name:parts[0]};
  const o=resolveObj(q,cx,true);if(!o||o.type!=='SEQUENCE')return undefined;
  if(cx.noSeq)throw E('ORA-02287','sequence number not allowed here');
  const sess=cx.sess;sess.seqCur=sess.seqCur||{};
  if(last==='CURRVAL'){if(!(o.key in sess.seqCur))throw E('ORA-08002','sequence '+o.name+'.CURRVAL is not yet defined in this session',[hint('Pehle '+o.name.toLowerCase()+'.NEXTVAL chalao, phir CURRVAL milta hai.')]);return sess.seqCur[o.key];}
  /* one NEXTVAL per row: cache on the row context */
  if(cx.rowSeq&&cx.rowSeq.has(o.key))return cx.rowSeq.get(o.key);
  const v=seqNext(o);sess.seqCur[o.key]=v;if(cx.rowSeq)cx.rowSeq.set(o.key,v);return v;
}
function seqNext(o){
  let v;if(o.next==null){v=o.start;}else v=o.next;
  if(o.inc>0&&o.max!=null&&v>o.max){if(!o.cycle)throw E('ORA-08004','sequence '+o.name+'.NEXTVAL exceeds MAXVALUE and cannot be instantiated');v=o.min;}
  if(o.inc<0&&o.min!=null&&v<o.min){if(!o.cycle)throw E('ORA-08004','sequence '+o.name+'.NEXTVAL goes below MINVALUE and cannot be instantiated');v=o.max;}
  o.next=v+o.inc;o.last=v;return v;
}
/* ---------- function calls ---------- */
function evalCall(e,cx){
  const name=e.parts.join('.');const nm1=e.parts.length===1?e.parts[0]:null;
  if(e.over){if(!cx.an||!cx.an.has(e))throw E('ORA-30483','window  functions are not allowed here');return cx.an.get(e)[cx.ri];}
  if(nm1&&ANALYTIC_ONLY.has(nm1)){if(nm1==='RANK'||nm1==='DENSE_RANK'||nm1==='PERCENT_RANK'||nm1==='CUME_DIST'){if(e.within)return hypothetical(e,cx);}throw E('ORA-30484','missing window specification for this function');}
  if(nm1&&AGGS.has(nm1)&&!(cx.pl&&cx.pl.isFn&&cx.pl.isFn(e.parts))){
    if(!cx.g){if(cx.inAggArg)throw E('ORA-00935','group function is nested too deeply');throw E('ORA-00934','group function is not allowed here');}
    return evalAgg(e,cx);}
  /* PL/SQL scope first (collection element, local function), then builtins, then stored functions */
  if(cx.pl){const r=cx.pl.call(e,cx);if(r!==undefined)return r;}
  const f=FN[name];
  if(f&&f.f){const n=e.args.length;
    if(n<f.min){throw E(f.minErr||'ORA-00909',f.minErr?'not enough arguments for function':'invalid number of arguments');}
    if(n>f.max)throw E('ORA-00909','invalid number of arguments');
    if(e.star)throw E('ORA-00936','missing expression');
    if(f.niladic&&f.max===0)throw E('ORA-00923','FROM keyword not found where expected',[hint(name+' ke saath () nahi lagta. Sirf '+name+' likho.')]);
    if((name==='CURRENT_TIMESTAMP'||name==='LOCALTIMESTAMP')&&n===1){const pv=evalE(e.args[0],cx);if(pv!=null&&(+pv<0||+pv>9))throw E('ORA-30088','datetime/interval precision is out of range',[hint('Precision 0 se 9 ke beech hi ho sakti hai.')]);}
    if(CMPFN.has(name))return cmpFnEval(name,e,cx,f);
    const args=e.args.map(a=>evalE(a,cx));return f.f(args,cx,e);}
  if(cx.callFn){const r=cx.callFn(e,cx);if(r!==undefined)return r;}
  if(f&&!f.f)throw E('ORA-00934','group function is not allowed here');
  if(cx.plCompile)throw E('PLS-00201',"identifier '"+name+"' must be declared");
  throw E('ORA-00904','"'+e.parts.join('"."')+'": invalid identifier');
}
function aggRows(e,cx){/* rows of the group, optionally narrowed by KEEP (DENSE_RANK FIRST/LAST) */
  let rows=cx.g;if(e.keep){const keyed=rows.map(f=>({f,k:e.keep.order.map(o=>evalE(o.e,sub(cx,{f,g:null,gnull:null})))}));
    keyed.sort((a,b)=>cmpKeys(a.k,b.k,e.keep.order,cx));if(keyed.length){const tgt=e.keep.last?keyed[keyed.length-1].k:keyed[0].k;rows=keyed.filter(x=>cmpKeys(x.k,tgt,e.keep.order,cx)===0).map(x=>x.f);}}
  return rows;}
function evalAgg(e,cx){
  const nm=e.parts[0];
  if(nm==='GROUPING'||nm==='GROUPING_ID'){const keys=cx.gall||new Set();const bit=a=>{const k=exprKey(a);if(!keys.has(k))throw E('ORA-30481','GROUPING function only supported with GROUP BY CUBE or ROLLUP');return cx.gnull&&cx.gnull.has(k)?1:0;};
    if(nm==='GROUPING')return bit(e.args[0]);let v=0;for(const a of e.args)v=v*2+bit(a);return v;}
  const rows=aggRows(e,cx);
  if(nm==='COUNT'&&e.star)return rows.length;
  if(!e.args.length)throw E('ORA-00909','invalid number of arguments');
  const rc=f=>sub(cx,{f,g:null,gnull:null,inAggArg:true});
  let vals=[];
  if(nm==='LISTAGG'){let items=rows.map(f=>({f,v:evalE(e.args[0],rc(f))})).filter(x=>x.v!=null);
    if(e.within)items=items.map(x=>({v:x.v,k:e.within.map(o=>evalE(o.e,rc(x.f)))})).sort((a,b)=>cmpKeys(a.k,b.k,e.within,cx));
    let list=items.map(x=>valToStr(x.v,cx));if(e.distinct){const s=new Set();list=list.filter(x=>s.has(x)?false:(s.add(x),true));}
    const sep=e.args[1]?valToStr(evalE(e.args[1],rc(rows[0]||cx.f)),cx)||'':'';const r=list.join(sep);
    if(r.length>4000){if(!e.ovTrunc)throw E('ORA-01489','result of string concatenation is too long');}
    return r===''?null:r;}
  for(const f of rows){const v=evalE(e.args[0],rc(f));if(v!=null)vals.push(v);}
  if(e.distinct){const seen=new Set();vals=vals.filter(v=>{const k=valKey(v);if(seen.has(k))return false;seen.add(k);return true;});}
  switch(nm){
    case'COUNT':case'APPROX_COUNT_DISTINCT':return nm==='APPROX_COUNT_DISTINCT'?new Set(vals.map(valKey)).size:vals.length;
    case'SUM':{if(!vals.length)return null;if(vals[0] instanceof IV){return vals.reduce((a,b)=>arith('+',a,b,cx));}let s=0;for(const v of vals)s+=toNum(v,cx);return fixFloat(s);}
    case'AVG':{if(!vals.length)return null;let s=0;for(const v of vals)s+=toNum(v,cx);return fixFloat(s/vals.length);}
    case'MIN':case'MAX':{if(!vals.length)return null;let r=vals[0];for(const v of vals){const c=cmpVals(v,r,cx);if(nm==='MIN'?c<0:c>0)r=v;}return r;}
    case'ANY_VALUE':return vals.length?vals[0]:null;
    case'MEDIAN':{if(!vals.length)return null;if(vals[0] instanceof DT){const s=vals.slice().sort((a,b)=>cmpVals(a,b,cx));const m=(s.length-1)/2;const lo=s[Math.floor(m)],hi=s[Math.ceil(m)];return lo===hi?lo:addSecs(lo,Math.round((hi.s-lo.s)/2),0);}
      const s=vals.map(v=>toNum(v,cx)).sort((a,b)=>a-b);const m=(s.length-1)/2;return fixFloat((s[Math.floor(m)]+s[Math.ceil(m)])/2);}
    case'STDDEV':case'STDDEV_SAMP':case'VARIANCE':case'VAR_SAMP':case'STDDEV_POP':case'VAR_POP':{
      const x=vals.map(v=>toNum(v,cx));const n=x.length;if(!n)return null;const mean=x.reduce((a,b)=>a+b,0)/n;const ss=x.reduce((a,b)=>a+(b-mean)*(b-mean),0);
      const pop=nm.endsWith('_POP');if(!pop&&n===1)return nm==='STDDEV_SAMP'||nm==='VAR_SAMP'?null:0;const v=ss/(pop?n:n-1);return fixFloat(nm.startsWith('STDDEV')?Math.sqrt(v):v);}
    case'COLLECT':return{coll:'NT',items:vals.slice(),type:null};
  }
  throw E('ORA-00904','"'+nm+'": invalid identifier');
}
function hypothetical(e,cx){/* RANK(x) WITHIN GROUP (ORDER BY col) as an aggregate */
  if(!cx.g)throw E('ORA-00934','group function is not allowed here');const nm=e.parts[0];const hv=e.args.map(a=>evalE(a,cx));
  const keys=cx.g.map(f=>e.within.map(o=>evalE(o.e,sub(cx,{f,g:null}))));let less=0,leq=0,dense=new Set();
  for(const k of keys){const c=cmpKeys(k,hv,e.within,cx);if(c<0){less++;dense.add(JSON.stringify(k.map(valKey)));}if(c<=0)leq++;}
  const n=keys.length;if(nm==='RANK')return less+1;if(nm==='DENSE_RANK')return dense.size+1;if(nm==='PERCENT_RANK')return n?less/n:0;return(leq+1)/(n+1);}
function cmpKeys(a,b,order,cx){
  for(let i=0;i<order.length;i++){const o=order[i];const x=a[i],y=b[i];const desc=o.desc;const nullsFirst=o.nulls?o.nulls==='FIRST':desc;
    if(x==null&&y==null)continue;if(x==null)return nullsFirst?-1:1;if(y==null)return nullsFirst?1:-1;
    let c=cmpVals(x,y,cx);if(c){return desc?-c:c;}}
  return 0;
}

/* NVL / NVL2 / COALESCE / NULLIF / DECODE: Oracle's datatype rules (ORA-00932 / ORA-01722), lazy COALESCE */
const CMPFN=new Set(['NVL','NVL2','COALESCE','NULLIF','DECODE']);
const FAMNAME={N:'NUMBER',S:'CHAR',D:'DATE'};
const BOOL_NODES=new Set(['cmp','between','in','like','isnull','exists','quant','not']);
function famOf(a,cx){if(a&&a.t==='lit'&&a.v==null)return'NULL';let t=null;try{t=staticType(a,cx);}catch(_){t=null;}if(!t)return null;if(t.lit)return'S';if(isNumT(t))return'N';if(isCharT(t))return'S';if(isDateT(t))return'D';return null;}
function cmpFnEval(name,e,cx,f){
  const A=e.args;
  for(const a of A){if(a&&(BOOL_NODES.has(a.t)||(a.t==='bin'&&(a.op==='AND'||a.op==='OR'))))throw E('ORA-00907','missing right parenthesis');}
  const fam=A.map(a=>famOf(a,cx));
  const incons=(x,y)=>E('ORA-00932','inconsistent datatypes: expected '+(FAMNAME[x]||'-')+' got '+(FAMNAME[y]||'CHAR'));
  const known=x=>x&&x!=='NULL';
  if(name==='NVL'){const[a,b]=fam;if(known(a)&&known(b)&&((a==='D'&&b==='N')||(a==='N'&&b==='D')))throw incons(a,b);
    const v=evalE(A[0],cx),w=evalE(A[1],cx);if(v!=null)return v;if(w!=null&&a==='N'&&typeof w==='string')return toNum(w,cx);return w;}
  if(name==='COALESCE'){const k0=fam.find(known);for(const x of fam)if(known(x)&&x!==k0)throw incons(k0,x);
    for(const a of A){const v=evalE(a,cx);if(v!=null)return v;}return null;}
  if(name==='NULLIF'){if(fam[0]==='NULL')throw E('ORA-00932','inconsistent datatypes: expected - got CHAR');if(known(fam[0])&&known(fam[1])&&fam[0]!==fam[1])throw incons(fam[0],fam[1]);}
  const args=A.map(x=>evalE(x,cx));let v=f.f(args,cx,e);
  if(name==='DECODE'&&v!=null&&fam[2]==='N'&&typeof v==='string')v=toNum(v,cx);
  if(name==='NVL2'&&v!=null&&fam[1]==='N'&&typeof v==='string')v=toNum(v,cx);
  return v;
}

/* ===== query execution ===== */
function splitAnd(e){if(!e)return[];if(e.t==='bin'&&e.op==='AND'&&!e.paren)return splitAnd(e.a).concat(splitAnd(e.b));if(e.t==='bin'&&e.op==='AND')return splitAnd(e.a).concat(splitAnd(e.b));return[e];}
function mkDesc(alias,cols,types,extra){const idx={};cols.forEach((c,i)=>{if(idx[c]===undefined)idx[c]=i;});return Object.assign({alias,cols,idx,types:types||cols.map(()=>null)},extra||{});}
function frameOf(descs,r,cx){return{d:descs,v:r.v,rid:r.rid,up:cx.f||null,depth:cx.f?cx.f.depth+1:0};}
/* run a subquery with correlation tracking and caching of uncorrelated results */
function runSubquery(node,q,cx,full,limit){
  const cache=cx.stmtCache;if(cache&&cache.has(node))return cache.get(node);
  const depth=cx.f?cx.f.depth:-1;const entry={depth,corr:false};
  const st=(cx.corrStack||[]).concat([entry]);
  const r=runQuery(q,sub(cx,{corrStack:st,g:null,gnull:null,an:null,ri:null,rownum:null,inAggArg:false}),{limit});
  if(!entry.corr&&cache&&!cx.noCache)cache.set(node,r);
  if(entry.corr&&cx.corrStack){for(const p of cx.corrStack)if(entry.depth<=p.depth){}/* correlation already marked by markCorr */}
  return r;
}
function forUpdateBad(q){if(!q||!q.forUpdate)return false;const b=q.body;return b.t!=='select'||!!b.distinct||!!(b.group&&b.group.length)||!!b.having||b.items.some(it=>it.e&&hasAggIn(it.e));}
function runQuery(q,cx,opts){
  opts=opts||{};let c=cx;
  if(forUpdateBad(q))throw E('ORA-01786','FOR UPDATE of this query expression is not allowed',[hint('GROUP BY, DISTINCT, aggregate ya UNION wali query par FOR UPDATE nahi lagta; lock asli rows par lagta hai.')]);
  if(!c.stmtCache)c=sub(c,{stmtCache:new Map()});
  if(q.with){const ctes=Object.create(c.ctes||null);for(const w of q.with)ctes[w.name]={w,res:null};c=sub(c,{ctes});}
  let r;
  if(q.body.t==='select')r=runSelectCore(q.body,c,q.order,q);
  else{r=runSetBody(q.body,c);if(q.order)sortOutput(r,q.order,c);}
  if(q.offset||q.fetch)applyFetch(r,q,c);
  if(opts.limit&&r.rows.length>opts.limit)r.rows.length=opts.limit;
  return r;
}
function applyFetch(r,q,cx){
  let off=0;if(q.offset){off=Math.max(0,Math.floor(toNum(evalE(q.offset,cx),cx)||0));}
  let rows=r.rows.slice(off);let rids=r.rids?r.rids.slice(off):null;
  if(q.fetch){let n=toNum(evalE(q.fetch.n,cx),cx);if(n==null)n=0;if(q.fetch.pct)n=Math.ceil(r.rows.length*n/100);n=Math.max(0,Math.floor(n));
    let end=n;if(q.fetch.ties&&q.order&&n>0&&n<rows.length){const keyAt=i=>r.sortKeys?r.sortKeys[off+i]:null;if(r.sortKeys){while(end<rows.length&&cmpKeys(keyAt(end),keyAt(n-1),q.order,cx)===0)end++;}}
    rows=rows.slice(0,end);if(rids)rids=rids.slice(0,end);}
  r.rows=rows;if(rids)r.rids=rids;
}
function runSetBody(b,cx){
  if(b.t==='select')return runSelectCore(b,cx,null,null);
  if(b.t==='qblock')return runQuery(b.q,cx);
  const L=runSetBody(b.l,cx),R=runSetBody(b.r,cx);
  if(L.cols.length!==R.cols.length)throw E('ORA-01789','query block has incorrect number of result columns');
  for(let i=0;i<L.cols.length;i++){const a=kindOfCol(L,i),c=kindOfCol(R,i);if(a&&c&&a!==c)throw E('ORA-01790','expression must have same datatype as corresponding expression');}
  const key=row=>row.map(valKey).join('\u0001');let rows;
  if(b.op==='UNION'){rows=L.rows.concat(R.rows);if(!b.all)rows=sortDistinct(rows,cx);}
  else if(b.op==='INTERSECT'){if(b.all){const cnt=new Map();R.rows.forEach(r=>cnt.set(key(r),(cnt.get(key(r))||0)+1));rows=L.rows.filter(r=>{const k=key(r);const n=cnt.get(k)||0;if(n>0){cnt.set(k,n-1);return true;}return false;});}
    else{const s=new Set(R.rows.map(key));rows=sortDistinct(L.rows.filter(r=>s.has(key(r))),cx);}}
  else{if(b.all){const cnt=new Map();R.rows.forEach(r=>cnt.set(key(r),(cnt.get(key(r))||0)+1));rows=L.rows.filter(r=>{const k=key(r);const n=cnt.get(k)||0;if(n>0){cnt.set(k,n-1);return false;}return true;});}
    else{const s=new Set(R.rows.map(key));rows=sortDistinct(L.rows.filter(r=>!s.has(key(r))),cx);}}
  const types=L.types.map((t,i)=>t||R.types[i]);
  return{cols:L.cols,types,rows,setop:true};
}
function kindOfCol(r,i){const t=r.types&&r.types[i];if(t){if(isNumT(t))return'N';if(isCharT(t)||t.lit)return'S';if(isDateT(t))return'D';}
  for(const row of r.rows){const v=row[i];if(v==null)continue;if(typeof v==='number')return'N';if(isStr(v))return'S';if(v instanceof DT)return'D';return null;}return null;}
function sortDistinct(rows,cx){const seen=new Set();const out=[];for(const r of rows){const k=r.map(valKey).join('\u0001');if(!seen.has(k)){seen.add(k);out.push(r);}}
  out.sort((a,b)=>{for(let i=0;i<a.length;i++){const x=a[i],y=b[i];if(x==null&&y==null)continue;if(x==null)return 1;if(y==null)return -1;let c;try{c=cmpVals(x,y,cx);}catch(e){c=0;}if(c)return c;}return 0;});return out;}
function sortOutput(r,order,cx){
  const idxOf=o=>{const e=o.e;if(e.t==='lit'&&typeof e.v==='number'){const k=e.v-1;if(k<0||k>=r.cols.length||!Number.isInteger(e.v))throw E('ORA-01785','ORDER BY item must be the number of a SELECT-list expression');return k;}
    if(e.t==='id'&&e.parts.length===1){const k=r.cols.indexOf(e.parts[0]);if(k>=0)return k;}
    if(e.t==='id'&&e.parts.length===2){const k=r.cols.indexOf(e.parts[1]);if(k>=0)return k;}
    throw E('ORA-01785','ORDER BY item must be the number of a SELECT-list expression');};
  const ks=order.map(idxOf);const keyed=r.rows.map((row,i)=>({row,k:ks.map(k=>row[k]),i}));
  keyed.sort((a,b)=>cmpKeys(a.k,b.k,order,cx)||a.i-b.i);r.rows=keyed.map(x=>x.row);r.sortKeys=keyed.map(x=>x.k);
}
/* ---------- FROM ---------- */
function curSchema(cx){return cx.schema||(cx.sess?cx.sess.schema||cx.sess.user:'OT');}
function resolveObj(q,cx,quiet,depth){
  const db=q.link?null:cx.db;if(!db)return null;depth=depth||0;if(depth>10)throw E('ORA-01775','looping chain of synonyms');
  const owner=q.owner||curSchema(cx);let o=db.objs[owner+'.'+q.name];
  if(o&&o.type==='SYNONYM'){const t=o.target;if(t.link)return{type:'REMOTE',q:t};const r=resolveObj({owner:t.owner,name:t.name},cx,true,depth+1);if(!r){if(quiet)return null;throw E('ORA-00980','synonym translation is no longer valid');}return r;}
  if(o)return o;
  if(!q.owner&&db.pubSyn[q.name]){const t=db.pubSyn[q.name];if(t.link)return{type:'REMOTE',q:t};const r=resolveObj({owner:t.owner,name:t.name},cx,true,depth+1);if(!r){if(quiet)return null;throw E('ORA-00980','synonym translation is no longer valid');}return r;}
  return null;
}
function tabNotFound(q,cx){const nm=(q.owner?q.owner+'.':'')+q.name;return E('ORA-00942','table or view does not exist',[hint('"'+nm.toLowerCase()+'" naam ki table/view nahi mili (ya permission nahi hai). Spelling check karo, ya: SELECT table_name FROM user_tables;')]);}
function sourceRel(node,cx){
  const q=node.q;const alias=node.alias||q.name;
  if(!q.owner&&!q.link&&cx.ctes&&cx.ctes[q.name]){const ent=cx.ctes[q.name];if(!ent.res)ent.res=runCTE(ent,cx);const r=ent.res;
    const desc=mkDesc(alias,r.cols,r.types);return{descs:[desc],rows:r.rows.map(v=>({v:[v],rid:[null]}))};}
  if(q.link)return remoteRel(q,alias,cx);
  const o=resolveObj(q,cx);
  if(o&&o.type==='REMOTE')return remoteRel(o.q,alias,cx);
  if(o&&(o.type==='TABLE')){needOpen(cx);
    if(cx.inTrig&&cx.mutating&&cx.mutating.has(o.key))throw E('ORA-04091','table '+o.owner+'.'+o.name+' is mutating, trigger/function may not see it');
    checkObjPriv(o,'SELECT',cx);
    if(o.external)return externalRel(o,alias,cx);
    const ts=o.ts&&cx.db.ts[o.ts];if(ts&&ts.status==='OFFLINE')throw E('ORA-00376','file '+(ts.files[0]?ts.files[0].id||7:7)+' cannot be read at this time',['ORA-01110: data file 7: \''+(ts.files[0]?ts.files[0].name:'')+'\'']);
    const vis=[];const types=[];const hide={};o.cols.forEach((c,i)=>{vis.push(c.name);types.push(c.type);if(c.unused)hide[i]=true;});
    const desc=mkDesc(alias,vis,types,{owner:o.owner,tname:o.name,tkey:o.key,oid:o.oid,hide,invis:o.cols.map(c=>!!c.invisible||!!c.unused),tbl:o});
    const rows=tableRows(o,cx).map(r=>({v:[r.v],rid:[r.rid]}));
    return{descs:[desc],rows};}
  if(o&&o.type==='VIEW'){needOpen(cx);checkObjPriv(o,'SELECT',cx);
    if(o.status==='INVALID'){try{compileView(o,cx);}catch(e){throw E('ORA-04063','view "'+o.owner+'.'+o.name+'" has errors');}}
    if(cx.viewDepth>20)throw E('ORA-01731','circular view definition encountered');
    const r=runQuery(o.query,sub(cx,{schema:o.owner,f:null,corrStack:null,ctes:null,viewDepth:(cx.viewDepth||0)+1,stmtCache:new Map()}));
    const cols=o.cols||r.cols;const desc=mkDesc(alias,cols,r.types,{view:o,owner:o.owner,tname:o.name});
    return{descs:[desc],rows:r.rows.map((v,i)=>({v:[v],rid:[r.rids?r.rids[i]:null],baseRid:r.rids?r.rids[i]:null}))};}
  if(o&&o.type==='SEQUENCE')throw E('ORA-02201','sequence not allowed here');
  if(o)throw tabNotFound(q,cx);
  if(!q.owner||q.owner==='SYS'||q.owner==='PUBLIC'){if(cx.db.inst!=='OPEN'&&!/^(V\$|DUAL$)/.test(q.name))needOpen(cx);const dv=dictView(q.name,cx);if(dv){const desc=mkDesc(alias,dv.cols,dv.types);return{descs:[desc],rows:dv.rows.map(v=>({v:[v],rid:[null]}))};}}
  throw tabNotFound(q,cx);
}
function tableRows(o,cx){if(o.temp&&o.temp.kind==='GTT'){const s=cx.sess;s.gtt=s.gtt||{};return s.gtt[o.key]||(s.gtt[o.key]=[]);}return o.rows;}
function runCTE(ent,cx){
  const w=ent.w;const q=w.q;
  const refs=JSON.stringify(q).includes('"name":"'+w.name+'"');
  if(refs&&q.body.t==='set'&&q.body.op==='UNION'&&q.body.all){
    const anchor=runSetBody(q.body.l,cx);const cols=w.cols||anchor.cols;if(!w.cols)throw E('ORA-32039','recursive WITH clause must have column alias list');
    let all=anchor.rows.slice();let last=anchor.rows;let guard=0;
    while(last.length&&guard++<1000){ent.res={cols,types:anchor.types,rows:last};const step=runSetBody(q.body.r,sub(cx,{stmtCache:new Map()}));last=step.rows;all=all.concat(last);if(all.length>100000)break;}
    if(guard>=1000)throw E('ORA-32044','cycle detected while executing recursive WITH query');
    ent.res=null;const r={cols,types:anchor.types,rows:all};return r;}
  const r=runQuery(q,cx);if(w.cols){if(w.cols.length!==r.cols.length)throw E('ORA-32038','number of WITH clause column names does not match number of elements in select list');r.cols=w.cols;}return r;
}
function buildFrom(list,cx,where){
  const conj=splitAnd(where);let rel=null;
  for(const item of list){const r=buildRef(item,cx);rel=rel?joinRel(rel,r,{kind:'INNER'},cx,conj):r;}
  return rel;
}
function buildRef(node,cx){
  switch(node.t){
    case'tab':return sourceRel(node,cx);
    case'subq':{const r=runQuery(node.q,sub(cx,{stmtCache:new Map()}));const desc=mkDesc(node.alias||null,r.cols,r.types);return{descs:[desc],rows:r.rows.map(v=>({v:[v],rid:[null]}))};}
    case'join':{const L=buildRef(node.l,cx),R=buildRef(node.r,cx);return joinRel(L,R,node,cx,null);}
    case'pivot':return pivotRel(buildRef(node.src,cx),node.spec,node.alias,cx);
    case'unpivot':return unpivotRel(buildRef(node.src,cx),node.spec,node.alias,cx);
    case'tfunc':return tableFuncRel(node,cx);
  }
  throw E('ORA-00903','invalid table name');
}
function sideOf(e,L,R){
  if(e.t!=='id')return null;const p=e.parts;
  const has=(ds)=>{let n=0;for(const d of ds){if(p.length===1){if(d.idx[p[0]]!==undefined&&!(d.hide&&d.hide[d.idx[p[0]]]))n++;}else if(p.length===2){if(d.alias===p[0]&&d.idx[p[1]]!==undefined)n++;}}return n;};
  const l=has(L),r=has(R);if(l===1&&r===0)return'L';if(r===1&&l===0)return'R';return null;}
function typeCat(e,ds){const p=e.parts;for(const d of ds){let k;if(p.length===1)k=d.idx[p[0]];else if(d.alias===p[0])k=d.idx[p[1]];if(k!==undefined){const t=d.types[k];if(!t)return null;return isNumT(t)?'N':isCharT(t)?'S':isDateT(t)?'D':null;}}return null;}
function joinRel(L,R,j,cx,conj){
  const kind=j.kind;let descs=L.descs.concat(R.descs);let cond=j.on||null;let usingCols=null;
  if(j.natural||j.using){
    let common=j.using;if(j.natural){const lc=new Set();L.descs.forEach(d=>d.cols.forEach((c,i)=>{if(!(d.hide&&d.hide[i]))lc.add(c);}));common=[];R.descs.forEach(d=>d.cols.forEach((c,i)=>{if(lc.has(c)&&!(d.hide&&d.hide[i])&&!common.includes(c))common.push(c);}));}
    usingCols=common;
    const eqs=common.map(c=>{const li=L.descs.findIndex(d=>d.idx[c]!==undefined),ri=R.descs.findIndex(d=>d.idx[c]!==undefined);if(li<0||ri<0)throw E('ORA-00904','"'+c+'": invalid identifier');
      return{li,lk:L.descs[li].idx[c],ri,rk:R.descs[ri].idx[c]};});
    cond={t:'__using',eqs};
  }
  const nl=L.descs.length;const out=[];
  const nullsL=L.descs.map(d=>d.cols.map(()=>null)),nullsR=R.descs.map(d=>d.cols.map(()=>null));
  const ridNullL=L.descs.map(()=>null),ridNullR=R.descs.map(()=>null);
  /* equi-join keys for a hash join */
  let keyPairs=[];
  const cands=cond&&cond.t!=='__using'?splitAnd(cond):(kind==='INNER'&&conj?conj:[]);
  if(cond&&cond.t==='__using')keyPairs=cond.eqs.map(q=>({lf:r=>r.v[q.li][q.lk],rf:r=>r.v[q.ri][q.rk]}));
  else for(const c of cands){if(c.t==='cmp'&&c.op==='='&&!c.a.outer&&!c.b.outer){const a=sideOf(c.a,L.descs,R.descs),b=sideOf(c.b,L.descs,R.descs);
      if(a&&b&&a!==b){const le=a==='L'?c.a:c.b,re=a==='L'?c.b:c.a;const tl=typeCat(le,L.descs),tr2=typeCat(re,R.descs);if(tl&&tl===tr2){
        keyPairs.push({lf:r=>evalE(le,sub(cx,{f:{d:L.descs,v:r.v,rid:r.rid,up:cx.f,depth:cx.f?cx.f.depth+1:0}})),rf:r=>evalE(re,sub(cx,{f:{d:R.descs,v:r.v,rid:r.rid,up:cx.f,depth:cx.f?cx.f.depth+1:0}}))});}}}}
  let index=null;
  if(keyPairs.length&&kind!=='CROSS'){index=new Map();R.rows.forEach((r,i)=>{const ks=keyPairs.map(k=>k.rf(r));if(ks.some(v=>v==null))return;const key=ks.map(valKey).join('\u0001');if(!index.has(key))index.set(key,[]);index.get(key).push(i);});}
  const matchedR=new Uint8Array(R.rows.length);
  const test=(v,rid)=>{if(!cond)return true;if(cond.t==='__using'){for(const q of cond.eqs){const a=v[q.li][q.lk],b=v[nl+q.ri][q.rk];if(a==null||b==null||cmpVals(a,b,cx)!==0)return false;}return true;}
    return evalB(cond,sub(cx,{f:{d:descs,v,rid,up:cx.f,depth:cx.f?cx.f.depth+1:0}}))===true;};
  for(const lr of L.rows){
    let list;if(index){const ks=keyPairs.map(k=>k.lf(lr));list=ks.some(v=>v==null)?[]:(index.get(ks.map(valKey).join('\u0001'))||[]);}else list=null;
    let matched=false;const n=list?list.length:R.rows.length;
    for(let t=0;t<n;t++){const ri=list?list[t]:t;const rr=R.rows[ri];const v=lr.v.concat(rr.v);const rid=lr.rid.concat(rr.rid);
      if(test(v,rid)){out.push({v,rid});matched=true;matchedR[ri]=1;}}
    if(!matched&&(kind==='LEFT'||kind==='FULL'))out.push({v:lr.v.concat(nullsR),rid:lr.rid.concat(ridNullR)});
  }
  if(kind==='RIGHT'||kind==='FULL'){R.rows.forEach((rr,i)=>{if(!matchedR[i])out.push({v:nullsL.concat(rr.v),rid:ridNullL.concat(rr.rid)});});}
  if(kind==='RIGHT'){/* present right-join rows in the right table's order */
    const pos=new Map();R.rows.forEach((r,i)=>pos.set(r,i));}
  if(usingCols){/* coalesced USING columns appear first and hide the originals */
    const ud=mkDesc(null,usingCols,usingCols.map(c=>{for(const d of descs){const k=d.idx[c];if(k!==undefined)return d.types[k];}return null;}),{using:true});
    const pairs=usingCols.map(c=>{const li=L.descs.findIndex(d=>d.idx[c]!==undefined),ri=R.descs.findIndex(d=>d.idx[c]!==undefined);return[li,L.descs[li].idx[c],nl+ri,R.descs[ri].idx[c]];});
    const nd=descs.map((d,i)=>{const hide=Object.assign({},d.hide||{});usingCols.forEach(c=>{const k=d.idx[c];if(k!==undefined)hide[k]=true;});return Object.assign({},d,{hide,usingHidden:true});});
    descs=[ud].concat(nd);
    for(const r of out){const uv=pairs.map(([a,b,c,d])=>r.v[a][b]!=null?r.v[a][b]:r.v[c][d]);r.v=[uv].concat(r.v);r.rid=[null].concat(r.rid);}
  }
  return{descs,rows:out};
}
/* ---------- PIVOT / UNPIVOT ---------- */
function colsUsed(e,set){if(!e||typeof e!=='object')return set;if(e.t==='id')set.add(e.parts[e.parts.length-1]);for(const k in e){const v=e[k];if(v&&typeof v==='object'){if(Array.isArray(v))v.forEach(x=>colsUsed(x,set));else colsUsed(v,set);}}return set;}
function pivotRel(base,spec,alias,cx){
  const used=new Set(spec.fcols);spec.aggs.forEach(a=>colsUsed(a.e,used));
  const gcols=[];base.descs.forEach((d,di)=>d.cols.forEach((c,ci)=>{if(!(d.hide&&d.hide[ci])&&!used.has(c))gcols.push({c,di,ci,t:d.types[ci]});}));
  const groups=new Map();const order=[];
  for(const r of base.rows){const key=gcols.map(g=>valKey(r.v[g.di][g.ci])).join('\u0001');if(!groups.has(key)){groups.set(key,[]);order.push(key);}groups.get(key).push(r);}
  const vals=spec.vals.map(v=>({v:v.e.t==='tuple'?v.e.items.map(x=>evalE(x,cx)):[evalE(v.e,cx)],name:v.alias||v.text.toUpperCase()}));
  if(spec.aggs.length>1&&spec.aggs.some(a=>!a.alias))throw E('ORA-00918','column ambiguously defined');
  const cols=gcols.map(g=>g.c),types=gcols.map(g=>g.t);
  for(const v of vals)for(const a of spec.aggs){cols.push(a.alias?(v.name+'_'+a.alias):v.name);types.push(null);}
  const fidx=spec.fcols.map(c=>{for(let di=0;di<base.descs.length;di++){const k=base.descs[di].idx[c];if(k!==undefined)return[di,k];}throw E('ORA-00904','"'+c+'": invalid identifier');});
  const rows=[];
  for(const key of order){const g=groups.get(key);const first=g[0];const row=gcols.map(gc=>first.v[gc.di][gc.ci]);
    for(const v of vals){const sel=g.filter(r=>fidx.every(([di,k],i)=>{const x=r.v[di][k];return x!=null&&v.v[i]!=null&&cmpVals(x,v.v[i],cx)===0;}));
      const frames=sel.map(r=>frameOf(base.descs,r,cx));
      for(const a of spec.aggs){row.push(evalE(a.e,sub(cx,{f:frames[0]||frameOf(base.descs,{v:base.descs.map(d=>d.cols.map(()=>null)),rid:[]},cx),g:frames})));}}
    rows.push({v:[row],rid:[null]});}
  return{descs:[mkDesc(alias||null,cols,types)],rows};
}
function unpivotRel(base,spec,alias,cx){
  const used=new Set();spec.items.forEach(it=>it.cols.forEach(c=>used.add(c)));
  const keep=[];base.descs.forEach((d,di)=>d.cols.forEach((c,ci)=>{if(!(d.hide&&d.hide[ci])&&!used.has(c))keep.push({c,di,ci,t:d.types[ci]});}));
  const find=c=>{for(let di=0;di<base.descs.length;di++){const k=base.descs[di].idx[c];if(k!==undefined)return[di,k];}throw E('ORA-00904','"'+c+'": invalid identifier');};
  const items=spec.items.map(it=>({src:it.cols.map(find),names:it.as?it.as.map(x=>evalE(x,cx)):it.cols.map(c=>c)}));
  for(const it of items)if(it.src.length!==spec.vcols.length)throw E('ORA-01489','invalid number of columns in UNPIVOT');
  const kindAt=([di,k])=>{const t=base.descs[di].types[k];if(!t)return null;if(isNumT(t))return'N';if(isCharT(t))return'S';if(isDateT(t))return'D';return null;};
  for(let j=0;j<spec.vcols.length;j++){let k0=null;for(const it of items){const k=kindAt(it.src[j]);if(!k)continue;if(k0&&k!==k0)throw E('ORA-01790','expression must have same datatype as corresponding expression');k0=k;}}
  const cols=keep.map(k=>k.c).concat(spec.ncols,spec.vcols);const rows=[];
  for(const r of base.rows){for(const it of items){const vals=it.src.map(([di,k])=>r.v[di][k]);if(!spec.nulls&&vals.every(v=>v==null))continue;
      rows.push({v:[keep.map(k=>r.v[k.di][k.ci]).concat(it.names.length===spec.ncols.length?it.names:[it.names.join('_')],vals)],rid:[null]});}}
  return{descs:[mkDesc(alias||null,cols,keep.map(k=>k.t).concat(spec.ncols.map(()=>null),spec.vcols.map(()=>null)))],rows};
}
function tableFuncRel(node,cx){
  const e=node.e;
  if((e.t==='call'||e.t==='id')&&e.parts.join('.')==='DBMS_XPLAN.DISPLAY'){const lines=(cx.sess.plan||['Error: cannot fetch last explain plan from PLAN_TABLE']);return{descs:[mkDesc(node.alias||null,['PLAN_TABLE_OUTPUT'],[{base:'VARCHAR2',len:300}])],rows:lines.map(l=>({v:[[l]],rid:[null]}))};}
  const v=evalE(e,cx);if(v==null)return{descs:[mkDesc(node.alias||null,['COLUMN_VALUE'])],rows:[]};
  if(!v.coll)throw E('ORA-22905','cannot access rows from a non-nested table item');
  const items=collVals(v);
  if(items.length&&items[0]&&items[0].rec){const cols=Object.keys(items[0].f);return{descs:[mkDesc(node.alias||null,cols)],rows:items.map(it=>({v:[cols.map(c=>it.f[c])],rid:[null]}))};}
  return{descs:[mkDesc(node.alias||null,['COLUMN_VALUE'])],rows:items.map(x=>({v:[[x]],rid:[null]}))};
}
function collVals(c){if(!c)return[];if(c.coll==='AA'){return[...c.map.keys()].sort((a,b)=>a<b?-1:a>b?1:0).map(k=>c.map.get(k));}return c.items.filter(x=>x!==DELETED);}
const DELETED={deleted:true};
/* ---------- grouping ---------- */
function expandGroup(list){
  let sets=[[]];
  const cross=(A,B)=>{const out=[];for(const a of A)for(const b of B)out.push(a.concat(b));return out;};
  for(const el of list){let s;
    if(el.k==='expr')s=[[el.e]];
    else if(el.k==='set')s=[el.items];
    else if(el.k==='rollup'){s=[];for(let i=el.items.length;i>=0;i--)s.push([].concat(...el.items.slice(0,i)));}
    else if(el.k==='cube'){const n=el.items.length;s=[];for(let m=(1<<n)-1;m>=0;m--){const pick=[];for(let i=0;i<n;i++)if(m&(1<<(n-1-i)))pick.push(...el.items[i]);s.push(pick);}}
    else if(el.k==='sets'){s=[];for(const x of el.sets)s.push(...expandGroup([x]));}
    sets=cross(sets,s);}
  return sets;
}
function hasAggIn(e,deep){
  if(!e||typeof e!=='object')return false;
  if(e.t==='call'&&!e.over&&e.parts.length===1&&(AGGS.has(e.parts[0])||(e.within&&['RANK','DENSE_RANK','PERCENT_RANK','CUME_DIST'].includes(e.parts[0]))))return true;
  if(e.t==='sub'||e.t==='exists'||e.q&&e.q.t==='query')return false;
  for(const k in e){if(k==='over')continue;const v=e[k];if(v&&typeof v==='object'){if(Array.isArray(v)){for(const x of v)if(x&&typeof x==='object'&&hasAggIn(x.e&&x.e.t?x.e:x))return true;}else if(hasAggIn(v))return true;}}
  return false;
}
function collectOver(e,out){if(!e||typeof e!=='object')return out;if(e.t==='call'&&e.over)out.push(e);if(e.t==='sub'||e.t==='exists')return out;
  for(const k in e){const v=e[k];if(v&&typeof v==='object'){if(Array.isArray(v))v.forEach(x=>collectOver(x,out));else if(k!=='q')collectOver(v,out);}}return out;}
function checkGroupExpr(e,keys,descs,cx){
  if(!e||typeof e!=='object')return;
  if(e.t&&keys.has(exprKey(e)))return;
  if(e.t==='call'&&!e.over&&e.parts.length===1&&AGGS.has(e.parts[0]))return;
  if(e.t==='call'&&e.within)return;
  if(e.t==='sub'||e.t==='exists')return;
  if(e.t==='call'&&e.over){(e.args||[]).forEach(a=>checkGroupExpr(a,keys,descs,cx));(e.over.part||[]).forEach(a=>checkGroupExpr(a,keys,descs,cx));(e.over.order||[]).forEach(o=>checkGroupExpr(o.e,keys,descs,cx));return;}
  if(e.t==='id'){const p=e.parts;let local=false;
    for(const d of descs){if(p.length===1&&d.idx[p[0]]!==undefined&&!(d.hide&&d.hide[d.idx[p[0]]]))local=true;if(p.length===2&&d.alias===p[0]&&d.idx[p[1]]!==undefined)local=true;}
    if(local){throw E('ORA-00979','not a GROUP BY expression',[hint('"'+p.join('.').toLowerCase()+'" ko GROUP BY mein daalo, ya ise kisi aggregate (SUM, COUNT, MAX...) ke andar rakho.')]);}
    return;}
  for(const k in e){if(k==='_k')continue;const v=e[k];if(v&&typeof v==='object'){if(Array.isArray(v))v.forEach(x=>{if(x&&typeof x==='object'){if(x.t)checkGroupExpr(x,keys,descs,cx);else if(x.e)checkGroupExpr(x.e,keys,descs,cx);else if(Array.isArray(x))x.forEach(y=>checkGroupExpr(y,keys,descs,cx));}});else if(v.t)checkGroupExpr(v,keys,descs,cx);}}
}
function doGroup(core,frames,descs,cx,order){
  const sets=core.group?expandGroup(core.group):[[]];
  const all=[];const seen=new Set();for(const s of sets)for(const e of s){const k=exprKey(e);if(!seen.has(k)){seen.add(k);all.push(e);}}
  const keys=new Set(all.map(exprKey));
  try{
  for(const it of core.items){if(it.star){if(core.group||true)throw E('ORA-00979','not a GROUP BY expression');}checkGroupExpr(it.e,keys,descs,cx);}
  if(core.having)checkGroupExpr(core.having,keys,descs,cx);
  if(order)for(const o of order){const e=o.e;if(e.t==='lit'&&typeof e.v==='number')continue;if(e.t==='id'&&e.parts.length===1&&core.items.some(it=>it.alias===e.parts[0]))continue;checkGroupExpr(e,keys,descs,cx);}
  }catch(er){if(!core.group&&er&&er.code==='ORA-00979')throw E('ORA-00937','not a single-group group function',[hint('GROUP BY nahi hai, isliye SELECT mein ya toh sirf aggregate rakho (COUNT, SUM...), ya baaki columns ko GROUP BY mein daalo.')]);throw er;}
  const out=[];const multi=sets.length>1||(core.group&&core.group.some(g=>g.k!=='expr'));
  const emptyF={d:descs,v:descs.map(d=>d.cols.map(()=>null)),rid:[],up:cx.f||null,depth:cx.f?cx.f.depth+1:0};
  for(const s of sets){
    const sk=new Set(s.map(exprKey));const gnull=new Set([...keys].filter(k=>!sk.has(k)));
    const groups=new Map();const ord=[];
    for(const f of frames){const fc=sub(cx,{f});const key=s.map(e=>valKey(evalE(e,fc))).join('\u0001');let g=groups.get(key);if(!g){g=[];groups.set(key,g);ord.push(key);}g.push(f);}
    if(!s.length&&!groups.size&&(!core.group||sets.length===1&&!core.group.length||(core.group&&s.length===0)))groups.set('',[]),ord.push('');
    for(const k of ord){const g=groups.get(k);out.push({f:g[0]||emptyF,g,gnull:gnull.size?gnull:null,gall:keys,gset:s});}
  }
  if(!core.group&&!out.length)out.push({f:emptyF,g:[],gnull:null,gall:keys});
  if(multi){/* ROLLUP/CUBE output: sorted by grouping columns, rolled-up values last */
    const ex=all;out.sort((a,b)=>{for(const e of ex){const k=exprKey(e);const an=a.gnull&&a.gnull.has(k),bn=b.gnull&&b.gnull.has(k);if(an&&bn)continue;if(an)return 1;if(bn)return -1;
      const x=evalE(e,sub(cx,{f:a.f})),y=evalE(e,sub(cx,{f:b.f}));if(x==null&&y==null)continue;if(x==null)return 1;if(y==null)return -1;const c=cmpVals(x,y,cx);if(c)return c;}return 0;});}
  return out;
}
/* ---------- analytic functions ---------- */
function computeAnalytics(nodes,ctxs,cx){
  const an=new Map();
  const rcx=i=>sub(cx,{f:ctxs[i].f,g:ctxs[i].g||null,gnull:ctxs[i].gnull||null,gall:ctxs[i].gall||null,an:null,ri:null});
  for(const node of nodes){
    const nm=node.parts.join('.');const o=node.over;const n=ctxs.length;const vals=new Array(n).fill(null);
    if(['ROW_NUMBER','RANK','DENSE_RANK','PERCENT_RANK','CUME_DIST','NTILE','LAG','LEAD'].includes(nm)&&!o.order)throw E('ORA-30485','missing ORDER BY expression in the window specification');
    const parts=new Map();const pord=[];
    for(let i=0;i<n;i++){const c=rcx(i);const k=o.part.map(e=>valKey(evalE(e,c))).join('\u0001');if(!parts.has(k)){parts.set(k,[]);pord.push(k);}parts.get(k).push(i);}
    for(const pk of pord){let idx=parts.get(pk);
      let keys=null;if(o.order){const ks=new Map();idx.forEach(i=>ks.set(i,o.order.map(x=>evalE(x.e,rcx(i)))));idx=idx.slice().sort((a,b)=>cmpKeys(ks.get(a),ks.get(b),o.order,cx)||a-b);keys=idx.map(i=>ks.get(i));}
      const m=idx.length;const peerEnd=new Array(m),peerStart=new Array(m);
      if(keys){for(let j=0;j<m;j++){peerStart[j]=j>0&&cmpKeys(keys[j],keys[j-1],o.order,cx)===0?peerStart[j-1]:j;}for(let j=m-1;j>=0;j--){peerEnd[j]=j<m-1&&cmpKeys(keys[j],keys[j+1],o.order,cx)===0?peerEnd[j+1]:j;}}
      else{for(let j=0;j<m;j++){peerStart[j]=0;peerEnd[j]=m-1;}}
      const argv=(k,j)=>evalE(node.args[k],rcx(idx[j]));
      const frameOfJ=j=>{
        if(!o.frame){if(!o.order)return[0,m-1];return[0,peerEnd[j]];}
        const F=o.frame;const bound=(b,isStart)=>{
          if(b.k==='UP')return 0;if(b.k==='UF')return m-1;
          if(b.k==='CR')return F.unit==='ROWS'?j:(isStart?peerStart[j]:peerEnd[j]);
          const off=toNum(evalE(b.n,rcx(idx[j])),cx);
          if(F.unit==='ROWS')return b.k==='P'?j-off:j+off;
          /* RANGE with a numeric/date offset on the single ORDER BY key */
          const cur=keys[j][0];const desc=o.order[0].desc;const dir=(b.k==='P')!==desc?-1:1;const target=cur==null?null:arith('+',cur,dir*off,cx);
          if(isStart){let s=0;while(s<m&&keys[s][0]!=null&&(desc?cmpVals(keys[s][0],target,cx)>0:cmpVals(keys[s][0],target,cx)<0))s++;return s;}
          let e2=m-1;while(e2>=0&&keys[e2][0]!=null&&(desc?cmpVals(keys[e2][0],target,cx)<0:cmpVals(keys[e2][0],target,cx)>0))e2--;return e2;};
        return[Math.max(0,bound(F.a,true)),Math.min(m-1,bound(F.b,false))];};
      for(let j=0;j<m;j++){let v=null;const i=idx[j];
        switch(nm){
          case'ROW_NUMBER':v=j+1;break;
          case'RANK':v=peerStart[j]+1;break;
          case'DENSE_RANK':{let d=1;for(let t=1;t<=j;t++)if(peerStart[t]===t)d++;v=d;break;}
          case'PERCENT_RANK':v=m===1?0:fixFloat(peerStart[j]/(m-1));break;
          case'CUME_DIST':v=fixFloat((peerEnd[j]+1)/m);break;
          case'NTILE':{const b=Math.trunc(toNum(argv(0,j),cx));if(!(b>0))throw E('ORA-01428',"argument '"+b+"' is out of range");const size=Math.floor(m/b),extra=m%b;let acc=0,bk=0;for(let t=0;t<b;t++){const sz=size+(t<extra?1:0);if(j<acc+sz){bk=t+1;break;}acc+=sz;}v=bk;break;}
          case'LAG':case'LEAD':{const off=node.args[1]?Math.trunc(toNum(argv(1,j),cx)):1;const dir=nm==='LAG'?-1:1;
            if(node.ignoreNulls){let t=j,cnt=0;while(true){t+=dir;if(t<0||t>=m){v=node.args[2]?argv(2,j):null;break;}const x=argv(0,t);if(x!=null){cnt++;if(cnt===off){v=x;break;}}}}
            else{const t=j+dir*off;v=t>=0&&t<m?argv(0,t):(node.args[2]?argv(2,j):null);}break;}
          case'FIRST_VALUE':case'LAST_VALUE':case'NTH_VALUE':{const[lo,hi]=frameOfJ(j);if(lo>hi){v=null;break;}
            if(nm==='NTH_VALUE'){const k=Math.trunc(toNum(argv(1,j),cx));if(!(k>0))throw E('ORA-01428',"argument '"+k+"' is out of range");let seq=[];for(let t=lo;t<=hi;t++)seq.push(t);if(node.fromLast)seq.reverse();
              if(node.ignoreNulls)seq=seq.filter(t=>argv(0,t)!=null);v=seq.length>=k?argv(0,seq[k-1]):null;break;}
            const range=[];for(let t=lo;t<=hi;t++)range.push(t);if(nm==='LAST_VALUE')range.reverse();
            if(node.ignoreNulls){v=null;for(const t of range){const x=argv(0,t);if(x!=null){v=x;break;}}}else v=argv(0,range[0]);break;}
          case'RATIO_TO_REPORT':{let s=0;for(let t=0;t<m;t++){const x=argv(0,t);if(x!=null)s+=toNum(x,cx);}const x=argv(0,j);v=x==null||s===0?null:fixFloat(toNum(x,cx)/s);break;}
          default:{if(!AGGS.has(nm))throw E('ORA-30484','missing window specification for this function');
            const[lo,hi]=frameOfJ(j);const frames=[];for(let t=lo;t<=hi;t++)frames.push(t);
            if(nm==='COUNT'&&node.star){v=frames.length;break;}
            let list=frames.map(t=>({x:argv(0,t),t})).filter(z=>z.x!=null);
            if(node.distinct){const s=new Set();list=list.filter(z=>{const k=valKey(z.x);if(s.has(k))return false;s.add(k);return true;});}
            v=aggregateValues(nm,list.map(z=>z.x),node,cx,list.map(z=>z.t),argv);}
        }
        vals[i]=v;}
    }
    an.set(node,vals);
    if(!an.__order){const ord=[];for(const pk of pord){let idx=parts.get(pk);if(o.order){const ks=new Map();idx.forEach(i=>ks.set(i,o.order.map(x=>evalE(x.e,rcx(i)))));idx=idx.slice().sort((a,b)=>cmpKeys(ks.get(a),ks.get(b),o.order,cx)||a-b);}ord.push(...idx);}an.__order=ord;}
  }
  return an;
}
function aggregateValues(nm,vals,node,cx,pos,argv){
  switch(nm){
    case'COUNT':return vals.length;
    case'SUM':{if(!vals.length)return null;let s=0;for(const v of vals)s+=toNum(v,cx);return fixFloat(s);}
    case'AVG':{if(!vals.length)return null;let s=0;for(const v of vals)s+=toNum(v,cx);return fixFloat(s/vals.length);}
    case'MIN':case'MAX':{if(!vals.length)return null;let r=vals[0];for(const v of vals){const c=cmpVals(v,r,cx);if(nm==='MIN'?c<0:c>0)r=v;}return r;}
    case'LISTAGG':{let items=vals.map((v,i)=>({v,p:pos[i]}));const sep=node.args[1]?valToStr(argv(1,pos[0]||0),cx)||'':'';const r=items.map(x=>valToStr(x.v,cx)).join(sep);return r===''?null:r;}
    case'STDDEV':case'VARIANCE':case'STDDEV_SAMP':case'VAR_SAMP':case'STDDEV_POP':case'VAR_POP':{const x=vals.map(v=>toNum(v,cx));const n=x.length;if(!n)return null;const mean=x.reduce((a,b)=>a+b,0)/n;const ss=x.reduce((a,b)=>a+(b-mean)*(b-mean),0);const pop=nm.endsWith('_POP');if(!pop&&n===1)return 0;const v=ss/(pop?n:n-1);return fixFloat(nm.startsWith('STDDEV')?Math.sqrt(v):v);}
    case'MEDIAN':{if(!vals.length)return null;const s=vals.map(v=>toNum(v,cx)).sort((a,b)=>a-b);const m=(s.length-1)/2;return fixFloat((s[Math.floor(m)]+s[Math.ceil(m)])/2);}
  }
  throw E('ORA-30484','missing window specification for this function');
}
/* ---------- CONNECT BY ---------- */
function connectBy(core,rel,cx){
  const frames=rel.rows.map(r=>frameOf(rel.descs,r,cx));const out=[];const cb=core.connect;
  const roots=cb.start?frames.filter(f=>evalB(cb.start,sub(cx,{f}))===true):frames;
  const visit=(f,level,path)=>{const nf=Object.assign({},f,{level,path:path.concat([f])});out.push(nf);
    const kids=frames.filter(c=>evalB(cb.by,sub(cx,{f:c,priorF:f}))===true);
    nf.isleaf=kids.length?0:1;
    for(const k of kids){if(path.includes(k)||k===f){if(cb.nocycle)continue;throw E('ORA-01436','CONNECT BY loop in user data');}visit(k,level+1,path.concat([f]));}};
  for(const r of roots)visit(r,1,[]);
  return out;
}
/* ---------- SELECT ---------- */
function runSelectCore(core,cx,order,q){
  const rel=core.from.length?buildFrom(core.from,cx,core.where):null;
  const descs=rel.descs;
  let frames=[];
  if(core.connect){const fs=connectBy(core,rel,cx);let rn=0;for(const f of fs){if(core.where&&evalB(core.where,sub(cx,{f,rownum:rn+1,level:f.level}))!==true)continue;rn++;f.rownum=rn;frames.push(f);}}
  else{let rn=0;for(const r of rel.rows){const f=frameOf(descs,r,cx);if(core.where){if(evalB(core.where,sub(cx,{f,rownum:rn+1}))!==true)continue;}rn++;f.rownum=rn;frames.push(f);}}
  const agg=!!core.group||core.items.some(it=>!it.star&&hasAggIn(it.e))||(core.having&&true)||(order&&order.some(o=>hasAggIn(o.e)));
  let ctxs;
  if(agg){ctxs=doGroup(core,frames,descs,cx,order);if(core.having)ctxs=ctxs.filter(c=>evalB(core.having,sub(cx,c))===true);}
  else ctxs=frames.map(f=>({f}));
  const overNodes=[];core.items.forEach(it=>{if(!it.star)collectOver(it.e,overNodes);});if(order)order.forEach(o=>collectOver(o.e,overNodes));
  if(core.where&&collectOver(core.where,[]).length)throw E('ORA-30483','window  functions are not allowed here');
  const an=overNodes.length?computeAnalytics(overNodes,ctxs,cx):null;
  if(an&&!order&&!core.distinct&&an.__order){const ord=an.__order;ctxs=ord.map(i=>ctxs[i]);for(const [k,v] of an){if(k==='__order')continue;an.set(k,ord.map(i=>v[i]));}}
  /* projection list */
  const proj=[];
  for(const it of core.items){
    if(it.star){const q2=it.qual;let any=false;
      descs.forEach((d,di)=>{if(q2){const al=q2[q2.length-1];if(d.alias!==al)return;}if(d.usingHidden&&!q2){}
        d.cols.forEach((c,ci)=>{if(d.hide&&d.hide[ci])return;if(d.invis&&d.invis[ci])return;any=true;proj.push({name:c,type:d.types[ci],get:(c2)=>c2.f.v[di][ci],di,ci});});});
      if(q2&&!any)throw E('ORA-00904','"'+q2.join('.')+'": invalid identifier');
      continue;}
    const name=it.alias||(it.e.t==='id'&&!it.e.paren?it.e.parts[it.e.parts.length-1]:it.text);
    let type=null;if(it.e.t==='id'){const t=lookupColType(it.e.parts,{f:{d:descs,v:[],up:null}});type=t;}
    if(!type)type=staticType(it.e,sub(cx,{f:frames[0]||{d:descs,v:descs.map(d=>d.cols.map(()=>null)),up:null}}));
    proj.push({name,type,e:it.e});
  }
  const cols=proj.map(p=>p.name),types=proj.map(p=>p.type);
  const rows=[];const rcs=[];
  for(let i=0;i<ctxs.length;i++){const c=ctxs[i];const rc=sub(cx,{f:c.f,g:c.g||null,gnull:c.gnull||null,gall:c.gall||null,an,ri:i,rowSeq:new Map(),level:c.f&&c.f.level});
    rows.push(proj.map(p=>p.get?p.get(rc):evalE(p.e,rc)));rcs.push(rc);}
  for(let k=0;k<types.length;k++)if(!types[k]){for(const r of rows){const v=r[k];if(v==null)continue;types[k]=typeof v==='number'?{base:'NUMBER'}:isStr(v)?{base:'VARCHAR2',len:4000}:v instanceof DT?{base:v.kind==='DATE'?'DATE':v.kind==='TSTZ'?'TIMESTAMP WITH TIME ZONE':'TIMESTAMP',fp:v.fp||6}:v instanceof IV?{base:v.kind==='YM'?'INTERVAL YEAR TO MONTH':'INTERVAL DAY TO SECOND',lp:2,fp:6}:typeof v==='boolean'?{base:'BOOLEAN'}:null;break;}}
  let rids=(!agg&&!core.distinct&&descs.length===1&&descs[0].tkey)?ctxs.map(c=>c.f.rid[0]):null;
  let res={cols,types,rows,rids,src:descs.length===1?descs[0]:null};
  /* DISTINCT, then ORDER BY */
  let keep=rows.map((r,i)=>i);
  if(core.distinct){const seen=new Set();keep=keep.filter(i=>{const k=rows[i].map(valKey).join('\u0001');if(seen.has(k))return false;seen.add(k);return true;});res.rids=null;}
  if(order){
    const keyFor=(i,o)=>{const e=o.e;
      if(e.t==='lit'&&typeof e.v==='number'){const k=e.v-1;if(!Number.isInteger(e.v)||k<0||k>=cols.length)throw E('ORA-01785','ORDER BY item must be the number of a SELECT-list expression');return rows[i][k];}
      if(e.t==='id'&&e.parts.length===1){const k=core.items.findIndex(it=>!it.star&&it.alias===e.parts[0]);if(k>=0){const pk=proj.findIndex(p=>p.e===core.items[k].e);return rows[i][pk];}}
      if(core.distinct){const k=proj.findIndex(p=>p.e&&exprKey(p.e)===exprKey(e));if(k>=0)return rows[i][k];
        if(e.t==='id'){const k2=proj.findIndex(p=>p.name===e.parts[e.parts.length-1]);if(k2>=0)return rows[i][k2];}throw E('ORA-01791','not a SELECTed expression');}
      return evalE(e,rcs[i]);};
    const keyed=keep.map(i=>({i,k:order.map(o=>keyFor(i,o))}));
    keyed.sort((a,b)=>cmpKeys(a.k,b.k,order,cx)||a.i-b.i);keep=keyed.map(x=>x.i);res.sortKeys=keyed.map(x=>x.k);
  }
  if(core.distinct||order){res.rows=keep.map(i=>rows[i]);if(res.rids)res.rids=keep.map(i=>res.rids[i]);}
  return res;
}

/* ===== DML: INSERT / UPDATE / DELETE / MERGE, constraints, triggers, transactions ===== */
function tx(cx){const s=cx.sess;if(!s.tx)s.tx={undo:[],sp:{}};return s.tx;}
function undoPush(cx,rec){tx(cx).undo.push(rec);}
function rollbackTo(cx,mark){const t=tx(cx);while(t.undo.length>mark){const u=t.undo.pop();
    if(u.op==='ins'){const i=u.arr.indexOf(u.row);if(i>=0)u.arr.splice(i,1);}
    else if(u.op==='del'){u.arr.splice(Math.min(u.idx,u.arr.length),0,u.row);}
    else if(u.op==='upd'){u.row.v=u.old;}}
  for(const k in t.sp)if(t.sp[k]>mark)delete t.sp[k];}
function commitTx(cx){const s=cx.sess;s.tx={undo:[],sp:{}};
  for(const k in cx.db.objs){const o=cx.db.objs[k];if(o.type!=='TABLE'||!o.temp)continue;
    if(o.temp.kind==='GTT'&&o.temp.onCommit==='DELETE'&&s.gtt&&s.gtt[k])s.gtt[k].length=0;
    if(o.temp.kind==='PTT'&&o.temp.onCommit==='DROP')delete cx.db.objs[k];}}
function hasPending(cx){const t=cx.sess.tx;return!!(t&&t.undo.length);}
function tableDesc(o,alias){return mkDesc(alias||o.name,o.cols.map(c=>c.name),o.cols.map(c=>c.type),{owner:o.owner,tname:o.name,tkey:o.key,oid:o.oid,tbl:o,hide:Object.fromEntries(o.cols.map((c,i)=>[i,!!c.unused]).filter(x=>x[1]))});}
function colIndex(o,name,forWhat){const i=o.cols.findIndex(c=>c.name===name&&!c.unused);if(i<0)throw E('ORA-00904','"'+name+'": invalid identifier');return i;}
function rowFrame(o,v,cx,rid){return{d:[tableDesc(o)],v:[v],rid:[rid],up:cx.f||null,depth:cx.f?cx.f.depth+1:0};}
function newRid(o){o.ridSeq=(o.ridSeq||0)+1;return o.ridSeq;}
function errCtx(o,c){return{owner:o.owner,table:o.name,col:c.name};}
function computeVirtual(o,v,cx){o.cols.forEach((c,i)=>{if(c.virt){v[i]=coerce(evalE(c.virt,sub(cx,{f:rowFrame(o,v,cx)})),c.type,cx,errCtx(o,c));}});}
function defaultVal(o,c,cx){if(c.identity){return identNext(c);}if(c.def){return evalE(c.def,sub(cx,{f:null,rowSeq:cx.rowSeq}));}return null;}
function identNext(c){const id=c.identity;if(id.next==null)id.next=id.start==null?1:id.start;const v=id.next;id.next+=(id.inc||1);return v;}
function nnCons(o,i){const nm=o.cols[i].name;return o.cons.find(k=>k.k==='N'&&!k.disabled&&k.cols&&k.cols[0]===nm)||o.cons.find(k=>k.k==='P'&&!k.disabled&&k.cols&&k.cols.includes(nm));}
function checkRow(o,v,cx,isUpd,changed){
  o.cols.forEach((c,i)=>{if(c.unused)return;if(v[i]==null&&nnCons(o,i)){if(isUpd&&changed&&!changed[i])return;
    if(isUpd)throw E('ORA-01407','cannot update ("'+o.owner+'"."'+o.name+'"."'+c.name+'") to NULL');throw E('ORA-01400','cannot insert NULL into ("'+o.owner+'"."'+o.name+'"."'+c.name+'")');}});
  for(const k of o.cons){if(k.k!=='C'||k.disabled)continue;const r=evalB(k.cond,sub(cx,{f:rowFrame(o,v,cx),pl:null}));if(r===false)throw E('ORA-02290','check constraint ('+o.owner+'.'+k.name+') violated');}
}
function keyOf(o,v,cols){const ks=cols.map(c=>v[o.cols.findIndex(x=>x.name===c)]);return ks;}
function checkKeys(o,cx){
  const rows=tableRows(o,cx);
  const uq=o.cons.filter(k=>(k.k==='P'||k.k==='U')&&!k.disabled).map(k=>({name:k.name,cols:k.cols}));
  for(const ix of Object.values(cx.db.idx))if(ix.tkey===o.key&&ix.unique&&!ix.forCons)uq.push({name:ix.name,cols:null,ix});
  for(const u of uq){const seen=new Set();for(const r of rows){let ks;if(u.ix)ks=u.ix.cols.map(c=>evalE(c.e,sub(cx,{f:rowFrame(o,r.v,cx)})));else ks=keyOf(o,r.v,u.cols);
      if(ks.every(x=>x==null))continue;const k=ks.map(valKey).join('\u0001');if(seen.has(k))throw E('ORA-00001','unique constraint ('+o.owner+'.'+u.name+') violated',[hint('Yeh value pehle se maujood hai. Primary key / unique column mein duplicate allowed nahi.')]);seen.add(k);}}
  for(const k of o.cons){if(k.k!=='R'||k.disabled)continue;const par=cx.db.objs[k.ref.key];if(!par)continue;const pk=k.ref.cols;
    const set=new Set(tableRows(par,cx).map(r=>keyOf(par,r.v,pk).map(valKey).join('\u0001')));
    for(const r of rows){const ks=keyOf(o,r.v,k.cols);if(ks.some(x=>x==null))continue;const key=ks.map((x,i)=>valKey(coerceKey(x,par,pk[i]))).join('\u0001');
      if(!set.has(key))throw E('ORA-02291','integrity constraint ('+o.owner+'.'+k.name+') violated - parent key not found',[hint('Parent table '+par.name.toLowerCase()+' mein yeh value nahi hai. Pehle parent row daalo.')]);}}
}
function coerceKey(x,par,col){const c=par.cols.find(z=>z.name===col);if(c&&isNumT(c.type)&&isStr(x)){try{return strToNum(x);}catch(e){return x;}}return x;}
function childRefs(o,cx){const out=[];for(const k in cx.db.objs){const t=cx.db.objs[k];if(t.type!=='TABLE')continue;for(const c of t.cons)if(c.k==='R'&&!c.disabled&&c.ref.key===o.key)out.push({t,c});}return out;}
function onParentDelete(o,row,cx,depth){
  for(const{t,c}of childRefs(o,cx)){const pk=keyOf(o,row.v,c.ref.cols).map(valKey).join('\u0001');const rows=tableRows(t,cx);
    const kids=rows.filter(r=>{const ks=keyOf(t,r.v,c.cols);return!ks.some(x=>x==null)&&ks.map(valKey).join('\u0001')===pk;});
    if(!kids.length)continue;
    if(c.onDelete==='CASCADE'){for(const kr of kids){if(kr===row)continue;onParentDelete(t,kr,cx,(depth||0)+1);const i=rows.indexOf(kr);if(i>=0){rows.splice(i,1);undoPush(cx,{op:'del',arr:rows,row:kr,idx:i});}}}
    else if(c.onDelete==='SET NULL'){for(const kr of kids){const old=kr.v.slice();c.cols.forEach(cn=>{kr.v[t.cols.findIndex(x=>x.name===cn)]=null;});undoPush(cx,{op:'upd',row:kr,old});}}
    else if(!(t===o&&kids.every(k=>k===row)))throw E('ORA-02292','integrity constraint ('+t.owner+'.'+c.name+') violated - child record found',[hint('Is row ko '+t.name.toLowerCase()+' table ki rows use kar rahi hain. Pehle child rows hatao, ya FK ON DELETE CASCADE ke saath banao.')]);}
}
function onParentKeyUpdate(o,row,oldV,cx){
  for(const{t,c}of childRefs(o,cx)){const before=keyOf(o,oldV,c.ref.cols).map(valKey).join('\u0001');const after=keyOf(o,row.v,c.ref.cols).map(valKey).join('\u0001');if(before===after)continue;
    const kids=tableRows(t,cx).filter(r=>{const ks=keyOf(t,r.v,c.cols);return!ks.some(x=>x==null)&&ks.map(valKey).join('\u0001')===before;});
    if(kids.length)throw E('ORA-02292','integrity constraint ('+t.owner+'.'+c.name+') violated - child record found');}
}
/* ---------- triggers ---------- */
function trigsFor(o,timing,event,level,cx,cols){
  const out=[];for(const k in cx.db.trigs){const t=cx.db.trigs[k];if(t.tkey!==o.key||!t.enabled||t.status==='INVALID'&&false)continue;
    if(t.compound){if(t.events.includes(event))out.push(t);continue;}
    if(t.timing!==timing||t.level!==level||!t.events.includes(event))continue;
    if(event==='UPDATE'&&t.ofCols&&t.ofCols.length&&cols&&!t.ofCols.some(c=>cols.includes(c)))continue;out.push(t);}
  return out;}
function fireStmt(o,timing,event,cx,cols){if(!cx.runTrigger)return;for(const t of [...new Set(trigsFor(o,timing,event,'STATEMENT',cx,cols))]){if(t.compound){cx.runTrigger(t,{section:timing+' STATEMENT',event},cx);}else cx.runTrigger(t,{event},cx);}}
function fireRow(o,timing,event,cx,nw,old,cols){if(!cx.runTrigger)return nw;const ts=[...new Set(trigsFor(o,timing,event,'ROW',cx,cols))];
  for(const t of ts){if(t.compound){cx.runTrigger(t,{section:timing+' EACH ROW',event,nw,old},cx);continue;}cx.runTrigger(t,{event,nw,old},cx);}return nw;}
function recFromRow(o,v){const f={};o.cols.forEach((c,i)=>{f[c.name]=v?v[i]:null;});return{rec:1,f,types:Object.fromEntries(o.cols.map(c=>[c.name,c.type]))};}
function rowFromRec(o,rec,cx){return o.cols.map((c,i)=>coerce(rec.f[c.name],c.type,cx,errCtx(o,c)));}
function withMutating(cx,o,fn){const m=new Set(cx.mutating||[]);m.add(o.key);return fn(sub(cx,{mutating:m}));}
/* ---------- DML target resolution ---------- */
function dmlTarget(tg,cx,op){
  if(tg.sub){return{kind:'view',view:{type:'VIEW',owner:curSchema(cx),name:'INLINE VIEW',query:tg.sub,inline:true},alias:tg.alias};}
  const q=tg.q;
  if(q.link)return{kind:'remote',q,alias:tg.alias};
  let o=resolveObj(q,cx);
  if(o&&o.type==='REMOTE')return{kind:'remote',q:o.q,alias:tg.alias};
  if(!o){if(!q.owner||q.owner==='SYS'){if(dictView(q.name,cx))throw E('ORA-01031','insufficient privileges');}throw tabNotFound(q,cx);}
  if(o.type==='SEQUENCE')throw E('ORA-02201','sequence not allowed here');
  if(o.type==='TABLE'){if(cx.inTrig&&cx.mutating&&cx.mutating.has(o.key))throw E('ORA-04091','table '+o.owner+'.'+o.name+' is mutating, trigger/function may not see it');
    checkObjPriv(o,op,cx);if(o.readOnly)throw E('ORA-12081','update operation not allowed on table "'+o.owner+'"."'+o.name+'"');if(o.external)throw E('ORA-30657','operation not supported on external organized table');
    return{kind:'table',o,alias:tg.alias||o.name};}
  if(o.type==='VIEW'){checkObjPriv(o,op,cx);return{kind:'view',view:o,alias:tg.alias||o.name};}
  throw tabNotFound(q,cx);
}
/* updatable view analysis: which base table each view column maps to */
function viewMapping(view,cx){
  const q=view.query;if(view.readOnly)throw E('ORA-42399','cannot perform a DML operation on a read-only view');
  if(q.body.t!=='select'||q.with)throw E('ORA-01732','data manipulation operation not legal on this view');
  const core=q.body;if(core.distinct||core.group||core.having||core.connect||core.items.some(it=>!it.star&&(hasAggIn(it.e)||collectOver(it.e,[]).length)))throw E('ORA-01732','data manipulation operation not legal on this view');
  const vcx=sub(cx,{schema:view.owner||curSchema(cx),f:null});
  const rel=buildFrom(core.from,vcx,core.where);
  const map=[];const names=[];
  core.items.forEach((it,k)=>{
    if(it.star){rel.descs.forEach((d,di)=>d.cols.forEach((c,ci)=>{if(d.hide&&d.hide[ci])return;if(d.invis&&d.invis[ci])return;map.push({di,ci});names.push(c);}));return;}
    const nm=it.alias||(it.e.t==='id'?it.e.parts[it.e.parts.length-1]:it.text);names.push(nm);
    if(it.e.t==='id'){const p=it.e.parts;let hit=null;rel.descs.forEach((d,di)=>{if(p.length===1&&d.idx[p[0]]!==undefined)hit={di,ci:d.idx[p[0]]};if(p.length===2&&d.alias===p[0]&&d.idx[p[1]]!==undefined)hit={di,ci:d.idx[p[1]]};});map.push(hit?Object.assign(hit,{e:it.e}):{e:it.e});}
    else map.push({e:it.e,expr:true});});
  const cols=view.cols||names;
  /* key-preserved tables */
  const kp=rel.descs.map((d,di)=>{if(!d.tbl)return false;if(rel.descs.length===1)return true;
    const conj=[];const walk=n=>{if(!n)return;if(n.t==='join'){walk(n.l);walk(n.r);if(n.on)conj.push(...splitAnd(n.on));}};core.from.forEach(walk);if(core.where)conj.push(...splitAnd(core.where));
    for(let oj=0;oj<rel.descs.length;oj++){if(oj===di)continue;const od=rel.descs[oj];if(!od.tbl)return false;
      const pk=(od.tbl.cons.find(c=>c.k==='P'&&!c.disabled)||{}).cols||[];if(!pk.length)return false;
      const joined=new Set();for(const c of conj){if(c.t==='cmp'&&c.op==='='&&c.a.t==='id'&&c.b.t==='id'){for(const s of[c.a,c.b]){const p=s.parts;const al=p.length===2?p[0]:null;const cn=p[p.length-1];if((al?od.alias===al:true)&&od.idx[cn]!==undefined&&(al||!d.idx.hasOwnProperty(cn)))joined.add(cn);}}}
      if(!pk.every(c=>joined.has(c)))return false;}
    return true;});
  return{rel,core,map,cols,kp,vcx};
}
function viewRows(vm,cx){
  const out=[];for(const r of vm.rel.rows){const f=frameOf(vm.rel.descs,r,vm.vcx);if(vm.core.where&&evalB(vm.core.where,sub(vm.vcx,{f}))!==true)continue;
    const vals=vm.map.map(m=>m.e&&m.expr?evalE(m.e,sub(vm.vcx,{f})):r.v[m.di][m.ci]);out.push({r,f,vals});}
  return out;}
function viewFrame(vm,alias,vals,cx){return{d:[mkDesc(alias,vm.cols)],v:[vals],rid:[null],up:cx.f||null,depth:cx.f?cx.f.depth+1:0};}
function insteadOf(view,event,cx){if(!view.key)return null;for(const k in cx.db.trigs){const t=cx.db.trigs[k];if(t.tkey===view.key&&t.timing==='INSTEAD OF'&&t.enabled&&t.events.includes(event))return t;}return null;}
function viewCheck(view,vm,base,di,rowV,cx){/* WITH CHECK OPTION: the changed row must still be visible through the view */
  if(!view.check)return;const descs=vm.rel.descs;const v=descs.map((d,i)=>i===di?rowV:d.cols.map(()=>null));
  const f={d:descs,v,rid:[],up:null,depth:0};if(vm.core.where&&evalB(vm.core.where,sub(vm.vcx,{f}))!==true)throw E('ORA-01402','view WITH CHECK OPTION where-clause violation');}
/* ---------- INSERT ---------- */
function prepInsertRow(o,cols,vals,cx,defaults){
  const v=o.cols.map(()=>undefined);
  cols.forEach((ci,k)=>{const c=o.cols[ci];let x=vals[k];
    if(c.virt)throw E('ORA-54013','INSERT operation disallowed on virtual columns');
    if(x===DEFAULT_MARK){v[ci]=defaultVal(o,c,cx);return;}
    if(c.identity){if(c.identity.mode==='ALWAYS')throw E('ORA-32795','cannot insert into a generated always identity column',[hint('GENERATED ALWAYS identity column mein value khud mat do; Oracle apne aap number deta hai.')]);if(x==null&&c.identity.mode==='BY DEFAULT ON NULL'){v[ci]=identNext(c);return;}}
    if(x==null&&c.defOnNull){v[ci]=defaultVal(o,c,cx);return;}
    v[ci]=x;});
  o.cols.forEach((c,i)=>{if(v[i]===undefined)v[i]=c.virt||c.unused?null:defaultVal(o,c,cx);});
  o.cols.forEach((c,i)=>{if(!c.virt)v[i]=coerce(v[i],c.type,cx,errCtx(o,c));});
  computeVirtual(o,v,cx);
  return v;
}
const DEFAULT_MARK={defaultMark:true};
function insertRows(o,cols,rowsVals,cx,opts){
  opts=opts||{};let n=0;const event='INSERT';const single=rowsVals.length===1&&opts.values;
  fireStmt(o,'BEFORE',event,cx);
  const run=c2=>{for(const vals of rowsVals){
    const rc=sub(c2,{rowSeq:new Map()});
    let v=prepInsertRow(o,cols,vals,rc);
    if(c2.runTrigger){const nw=recFromRow(o,v);fireRow(o,'BEFORE',event,c2,nw,recFromRow(o,null));v=rowFromRec(o,nw,c2);computeVirtual(o,v,c2);}
    checkRow(o,v,c2,false);
    ensureSpace(o,1,c2);
    const row={rid:newRid(o),v};const arr=tableRows(o,c2);arr.push(row);undoPush(c2,{op:'ins',arr,row});n++;
    if(opts.returning)opts.returning(o,row,c2);
    if(c2.runTrigger)fireRow(o,'AFTER',event,c2,recFromRow(o,v),recFromRow(o,null));
  }};
  if(single)run(cx);else withMutating(cx,o,run);
  checkKeys(o,cx);
  fireStmt(o,'AFTER',event,cx);
  return n;
}
function execInsert(s,cx){
  const tg=dmlTarget(s.tg,cx,'INSERT');
  let rowsVals;
  const evalRow=(exprs)=>exprs.map(x=>x.t==='default'?DEFAULT_MARK:evalE(x,sub(cx,{rowSeq:cx.rowSeq||new Map()})));
  if(tg.kind==='remote')return remoteInsert(tg,s,cx);
  if(tg.kind==='view'){return viewInsert(tg,s,cx);}
  const o=tg.o;
  const cols=s.cols?s.cols.map(c=>{const i=o.cols.findIndex(x=>x.name===c&&!x.unused);if(i<0)throw E('ORA-00904','"'+c+'": invalid identifier');return i;}):o.cols.map((c,i)=>i).filter(i=>!o.cols[i].unused&&!o.cols[i].invisible);
  if(s.cols){const seen=new Set();for(const c of s.cols){if(seen.has(c))throw E('ORA-00957','duplicate column name');seen.add(c);}}
  if(s.recVal){const rec=evalE(s.recVal,cx);if(!rec||!rec.rec)throw E('ORA-00947','not enough values');rowsVals=[o.cols.filter(c=>!c.virt&&!c.unused).map(c=>rec.f[c.name])];}
  else if(s.rows){rowsVals=s.rows.map(r=>{if(r.length<cols.length)throw E('ORA-00947','not enough values');if(r.length>cols.length)throw E('ORA-00913','too many values');return r.map(x=>x.t==='default'?DEFAULT_MARK:evalE(x,sub(cx,{rowSeq:new Map()})));});}
  else{const r=runQuery(s.q,sub(cx,{stmtCache:new Map()}));if(r.cols.length<cols.length)throw E('ORA-00947','not enough values');if(r.cols.length>cols.length)throw E('ORA-00913','too many values');rowsVals=r.rows;}
  let ret=null;if(s.returning&&cx.returning){ret=cx.returning(s.returning,o);}
  const n=insertRows(o,cols,rowsVals,cx,{values:!!s.rows,returning:ret});
  return{n,msg:n===1?'1 row created.':n+' rows created.'};
}
function viewInsert(tg,s,cx){
  const view=tg.view;const trg=insteadOf(view,'INSERT',cx);
  if(trg){const vcols=view.cols||viewColNames(view,cx);const cols=s.cols||vcols;let rowsVals;
    if(s.rows)rowsVals=s.rows.map(r=>r.map(x=>evalE(x,cx)));else rowsVals=runQuery(s.q,cx).rows;
    for(const vals of rowsVals){const nw={rec:1,f:{}};vcols.forEach(c=>{nw.f[c]=null;});cols.forEach((c,i)=>{nw.f[c]=vals[i];});cx.runTrigger(trg,{event:'INSERT',nw,old:{rec:1,f:{}}},cx);}
    const n=rowsVals.length;return{n,msg:n===1?'1 row created.':n+' rows created.'};}
  const vm=viewMapping(view,cx);const vcols=vm.cols;
  const cols=s.cols||vcols;const targets=cols.map(c=>{const k=vcols.indexOf(c);if(k<0)throw E('ORA-00904','"'+c+'": invalid identifier');const m=vm.map[k];if(!m||m.expr||m.di==null)throw E('ORA-01733','virtual column not allowed here');return m;});
  const dis=[...new Set(targets.map(t=>t.di))];if(dis.some(d=>!vm.kp[d]))throw E('ORA-01779','cannot modify a column which maps to a non key-preserved table');
  if(dis.length>1)throw E('ORA-01776','cannot modify more than one base table through a join view');
  const di=dis[0];
  const base=vm.rel.descs[di].tbl;checkObjPriv(base,'INSERT',cx);
  let rowsVals;if(s.rows)rowsVals=s.rows.map(r=>r.map(x=>x.t==='default'?DEFAULT_MARK:evalE(x,cx)));else rowsVals=runQuery(s.q,cx).rows;
  const bcols=targets.map(t=>t.ci);let n=0;
  for(const vals of rowsVals){const before=tableRows(base,cx).length;insertRows(base,bcols,[vals],cx,{values:true});const row=tableRows(base,cx)[before];viewCheck(view,vm,base,di,row.v,cx);n++;}
  return{n,msg:n===1?'1 row created.':n+' rows created.'};
}
function viewColNames(view,cx){if(view.cols)return view.cols;const r=runQuery(view.query,sub(cx,{schema:view.owner}),{limit:0});return r.cols;}
function execInsertMulti(s,cx){
  const src=runQuery(s.q,sub(cx,{stmtCache:new Map()}));const desc=mkDesc(null,src.cols,src.types);let n=0;
  const plan=[];const touched=new Set();
  for(const r of src.rows){const f={d:[desc],v:[r],rid:[null],up:cx.f||null,depth:cx.f?cx.f.depth+1:0};const rc=sub(cx,{f,rowSeq:new Map()});let any=false;
    const doInto=it=>{const tg=dmlTarget(it.tg,cx,'INSERT');if(tg.kind!=='table')throw E('ORA-01702','a view is not appropriate here');const o=tg.o;
      const cols=it.cols?it.cols.map(c=>colIndex(o,c)):o.cols.map((c,i)=>i).filter(i=>!o.cols[i].virt&&!o.cols[i].unused&&!o.cols[i].invisible);
      const vals=it.values?it.values.map(x=>x.t==='default'?DEFAULT_MARK:evalE(x,rc)):cols.map(ci=>{const nm=o.cols[ci].name;const k=src.cols.indexOf(nm);return k>=0?r[k]:null;});
      if(vals.length<cols.length)throw E('ORA-00947','not enough values');if(vals.length>cols.length)throw E('ORA-00913','too many values');
      const v=prepInsertRow(o,cols,vals,rc);checkRow(o,v,rc,false);ensureSpace(o,1,cx);const row={rid:newRid(o),v};const arr=tableRows(o,cx);arr.push(row);undoPush(cx,{op:'ins',arr,row});touched.add(o);n++;};
    for(const grp of s.intos){if(grp.cond&&evalB(grp.cond,rc)!==true)continue;any=true;grp.list.forEach(doInto);if(s.mode==='FIRST')break;}
    if(!any&&s.elseIntos.length)s.elseIntos.forEach(doInto);}
  for(const o of touched)checkKeys(o,cx);
  return{n,msg:n===1?'1 row created.':n+' rows created.'};
}
/* ---------- UPDATE ---------- */
function currentOfRid(where,cx){if(!where||where.t!=='curof')return null;if(!cx.pl||!cx.pl.cursorRid)throw E('ORA-00904','invalid identifier');return cx.pl.cursorRid(where.cur,cx);}
function execUpdate(s,cx){
  const tg=dmlTarget(s.tg,cx,'UPDATE');
  if(tg.kind==='remote')return remoteUpdate(tg,s,cx);
  if(tg.kind==='view')return viewUpdate(tg,s,cx);
  const o=tg.o;const desc=tableDesc(o,tg.alias);
  const setCols=[];for(const st of s.sets)for(const c of st.cols){const i=o.cols.findIndex(x=>x.name===c&&!x.unused);if(i<0)throw E('ORA-00904','"'+(tg.alias?tg.alias+'"."':'')+c+'": invalid identifier');
    if(o.cols[i].virt)throw E('ORA-54017','UPDATE operation disallowed on virtual columns');if(o.cols[i].identity&&o.cols[i].identity.mode==='ALWAYS')throw E('ORA-32796','cannot update a generated always identity column');setCols.push(i);}
  const arr=tableRows(o,cx);const curRid=currentOfRid(s.where,cx);
  const targets=arr.filter(r=>{if(curRid!=null)return r.rid===curRid;if(!s.where)return true;return evalB(s.where,sub(cx,{f:{d:[desc],v:[r.v],rid:[r.rid],up:cx.f||null,depth:cx.f?cx.f.depth+1:0}}))===true;});
  const colNames=setCols.map(i=>o.cols[i].name);
  fireStmt(o,'BEFORE','UPDATE',cx,colNames);
  let ret=null;if(s.returning&&cx.returning)ret=cx.returning(s.returning,o);
  withMutating(cx,o,c2=>{
  /* compute all new values first (statement-level snapshot), then apply */
  const plans=targets.map(r=>{const f={d:[desc],v:[r.v],rid:[r.rid],up:cx.f||null,depth:cx.f?cx.f.depth+1:0};const rc=sub(cx,{f,rowSeq:new Map(),stmtCache:new Map()});const nv=r.v.slice();
    if(s.rowSet){const rec=evalE(s.rowSet,rc);o.cols.forEach((c,i)=>{if(!c.virt&&!c.unused&&rec.f[c.name]!==undefined)nv[i]=rec.f[c.name];});}
    for(const st of s.sets){if(st.sub){const q=runQuery(st.sub,rc);if(q.rows.length>1)throw E('ORA-01427','single-row subquery returns more than one row');if(q.cols.length!==st.cols.length)throw E(q.cols.length>st.cols.length?'ORA-00913':'ORA-00947',q.cols.length>st.cols.length?'too many values':'not enough values');
        st.cols.forEach((c,k)=>{nv[o.cols.findIndex(x=>x.name===c)]=q.rows.length?q.rows[0][k]:null;});}
      else{const i=o.cols.findIndex(x=>x.name===st.cols[0]);nv[i]=st.def?defaultVal(o,o.cols[i],rc):evalE(st.e,rc);}}
    return{r,nv};});
  for(const{r,nv}of plans){
    const changed=o.cols.map((c,i)=>setCols.includes(i));
    let v=nv.map((x,i)=>changed[i]?coerce(x,o.cols[i].type,c2,errCtx(o,o.cols[i])):x);computeVirtual(o,v,c2);
    if(c2.runTrigger){const nw=recFromRow(o,v);fireRow(o,'BEFORE','UPDATE',c2,nw,recFromRow(o,r.v),colNames);v=rowFromRec(o,nw,c2);computeVirtual(o,v,c2);}
    checkRow(o,v,c2,true,changed);
    const old=r.v;r.v=v;undoPush(c2,{op:'upd',row:r,old});
    onParentKeyUpdate(o,r,old,c2);
    if(ret)ret(o,r,c2);
    if(c2.runTrigger)fireRow(o,'AFTER','UPDATE',c2,recFromRow(o,v),recFromRow(o,old),colNames);
  }});
  checkKeys(o,cx);
  fireStmt(o,'AFTER','UPDATE',cx,colNames);
  const n=targets.length;return{n,msg:n===1?'1 row updated.':n+' rows updated.'};
}
function viewUpdate(tg,s,cx){
  const view=tg.view;const trg=insteadOf(view,'UPDATE',cx);
  const vm=viewMapping(view,cx);const alias=tg.alias;
  const rows=viewRows(vm,cx).filter(x=>!s.where||evalB(s.where,sub(cx,{f:viewFrame(vm,alias,x.vals,cx)}))===true);
  if(trg){for(const x of rows){const old={rec:1,f:Object.fromEntries(vm.cols.map((c,i)=>[c,x.vals[i]]))};const nw={rec:1,f:Object.assign({},old.f)};const rc=sub(cx,{f:viewFrame(vm,alias,x.vals,cx)});
      for(const st of s.sets){if(st.e)nw.f[st.cols[0]]=evalE(st.e,rc);}cx.runTrigger(trg,{event:'UPDATE',nw,old},cx);}return{n:rows.length,msg:rows.length===1?'1 row updated.':rows.length+' rows updated.'};}
  const tgts=[];for(const st of s.sets)for(const c of st.cols){const k=vm.cols.indexOf(c);if(k<0)throw E('ORA-00904','"'+c+'": invalid identifier');const m=vm.map[k];if(!m||m.expr||m.di==null)throw E('ORA-01733','virtual column not allowed here');tgts.push({c,m,st});}
  const dis=[...new Set(tgts.map(t=>t.m.di))];if(dis.some(d=>!vm.kp[d]))throw E('ORA-01779','cannot modify a column which maps to a non key-preserved table');
  if(dis.length>1)throw E('ORA-01776','cannot modify more than one base table through a join view');
  const di=dis[0];
  const base=vm.rel.descs[di].tbl;checkObjPriv(base,'UPDATE',cx);const arr=tableRows(base,cx);let n=0;
  for(const x of rows){const rid=x.r.rid[di];const br=arr.find(r=>r.rid===rid);if(!br)continue;const rc=sub(cx,{f:viewFrame(vm,alias,x.vals,cx)});const old=br.v;const v=old.slice();
    for(const t of tgts){v[t.m.ci]=coerce(evalE(t.st.e,rc),base.cols[t.m.ci].type,cx,errCtx(base,base.cols[t.m.ci]));}
    computeVirtual(base,v,cx);checkRow(base,v,cx,true);viewCheck(view,vm,base,di,v,cx);br.v=v;undoPush(cx,{op:'upd',row:br,old});n++;}
  checkKeys(base,cx);return{n,msg:n===1?'1 row updated.':n+' rows updated.'};
}
/* ---------- DELETE ---------- */
function execDelete(s,cx){
  const tg=dmlTarget(s.tg,cx,'DELETE');
  if(tg.kind==='remote')return remoteDelete(tg,s,cx);
  if(tg.kind==='view')return viewDelete(tg,s,cx);
  const o=tg.o;const desc=tableDesc(o,tg.alias);const arr=tableRows(o,cx);const curRid=currentOfRid(s.where,cx);
  const targets=arr.filter(r=>{if(curRid!=null)return r.rid===curRid;if(!s.where)return true;return evalB(s.where,sub(cx,{f:{d:[desc],v:[r.v],rid:[r.rid],up:cx.f||null,depth:cx.f?cx.f.depth+1:0}}))===true;});
  fireStmt(o,'BEFORE','DELETE',cx);let ret=null;if(s.returning&&cx.returning)ret=cx.returning(s.returning,o);
  withMutating(cx,o,c2=>{for(const r of targets){
    if(c2.runTrigger)fireRow(o,'BEFORE','DELETE',c2,recFromRow(o,null),recFromRow(o,r.v));
    onParentDelete(o,r,c2);if(ret)ret(o,r,c2);
    const i=arr.indexOf(r);if(i>=0){arr.splice(i,1);undoPush(c2,{op:'del',arr,row:r,idx:i});}
    if(c2.runTrigger)fireRow(o,'AFTER','DELETE',c2,recFromRow(o,null),recFromRow(o,r.v));}});
  let extra=0;if(!s.where&&o.virtual){extra=o.virtual;o.virtual=0;}
  fireStmt(o,'AFTER','DELETE',cx);
  const n=targets.length+extra;return{n,msg:n===1?'1 row deleted.':n+' rows deleted.'};
}
function viewDelete(tg,s,cx){
  const view=tg.view;const trg=insteadOf(view,'DELETE',cx);const vm=viewMapping(view,cx);const alias=tg.alias;
  const rows=viewRows(vm,cx).filter(x=>!s.where||evalB(s.where,sub(cx,{f:viewFrame(vm,alias,x.vals,cx)}))===true);
  if(trg){for(const x of rows){const old={rec:1,f:Object.fromEntries(vm.cols.map((c,i)=>[c,x.vals[i]]))};cx.runTrigger(trg,{event:'DELETE',nw:{rec:1,f:{}},old},cx);}return{n:rows.length,msg:rows.length===1?'1 row deleted.':rows.length+' rows deleted.'};}
  const kps=vm.kp.map((k,i)=>k?i:-1).filter(i=>i>=0);if(kps.length!==1)throw E('ORA-01752','cannot delete from view without exactly one key-preserved table');
  const di=kps[0];const base=vm.rel.descs[di].tbl;checkObjPriv(base,'DELETE',cx);const arr=tableRows(base,cx);let n=0;
  for(const x of rows){const rid=x.r.rid[di];const i=arr.findIndex(r=>r.rid===rid);if(i<0)continue;const r=arr[i];onParentDelete(base,r,cx);arr.splice(i,1);undoPush(cx,{op:'del',arr,row:r,idx:i});n++;}
  return{n,msg:n===1?'1 row deleted.':n+' rows deleted.'};
}
/* ---------- MERGE ---------- */
function execMerge(s,cx){
  const tg=dmlTarget(s.tg,cx,'UPDATE');if(tg.kind!=='table')throw E('ORA-38106','MERGE not supported on join view or view with INSTEAD OF trigger');
  const o=tg.o;const tdesc=tableDesc(o,tg.alias);const src=buildRef(s.src,cx);const arr=tableRows(o,cx);let n=0;
  const matchedTarget=new Set();const toInsert=[];
  const snapshot=arr.slice();
  for(const sr of src.rows){
    let hit=null;
    for(const tr of snapshot){const f={d:[tdesc].concat(src.descs),v:[tr.v].concat(sr.v),rid:[tr.rid].concat(sr.rid),up:cx.f||null,depth:cx.f?cx.f.depth+1:0};
      if(evalB(s.on,sub(cx,{f}))===true){if(hit)throw E('ORA-30926','unable to get a stable set of rows in the source tables');hit={tr,f};}}
    if(hit){if(matchedTarget.has(hit.tr))throw E('ORA-30926','unable to get a stable set of rows in the source tables');matchedTarget.add(hit.tr);
      if(s.del&&!s.upd){const i=arr.indexOf(hit.tr);if(i>=0){onParentDelete(o,hit.tr,cx);arr.splice(i,1);undoPush(cx,{op:'del',arr,row:hit.tr,idx:i});n++;}continue;}
      if(!s.upd)continue;const rc=sub(cx,{f:hit.f,rowSeq:new Map()});if(s.upd.where&&evalB(s.upd.where,rc)!==true)continue;
      const nv=hit.tr.v.slice();for(const st of s.upd.sets){const c=st.cols[0];const i=colIndex(o,c);
        if(s.on&&colsUsed(s.on,new Set()).has(c))throw E('ORA-38104','Columns referenced in the ON Clause cannot be updated: "'+o.name+'"."'+c+'"');
        nv[i]=coerce(st.def?defaultVal(o,o.cols[i],rc):evalE(st.e,rc),o.cols[i].type,cx,errCtx(o,o.cols[i]));}
      computeVirtual(o,nv,cx);checkRow(o,nv,cx,true);const old=hit.tr.v;hit.tr.v=nv;undoPush(cx,{op:'upd',row:hit.tr,old});n++;
      if(s.upd.delWhere){const f2=Object.assign({},hit.f,{v:[nv].concat(hit.f.v.slice(1))});if(evalB(s.upd.delWhere,sub(cx,{f:f2}))===true){const i=arr.indexOf(hit.tr);if(i>=0){arr.splice(i,1);undoPush(cx,{op:'del',arr,row:hit.tr,idx:i});}}}}
    else if(s.ins){const f={d:src.descs,v:sr.v,rid:sr.rid,up:cx.f||null,depth:cx.f?cx.f.depth+1:0};const rc=sub(cx,{f,rowSeq:new Map()});if(s.ins.where&&evalB(s.ins.where,rc)!==true)continue;
      const cols=s.ins.cols?s.ins.cols.map(c=>colIndex(o,c)):o.cols.map((c,i)=>i).filter(i=>!o.cols[i].virt&&!o.cols[i].unused&&!o.cols[i].invisible);
      if(s.ins.values.length<cols.length)throw E('ORA-00947','not enough values');if(s.ins.values.length>cols.length)throw E('ORA-00913','too many values');
      const vals=s.ins.values.map(x=>x.t==='default'?DEFAULT_MARK:evalE(x,rc));const v=prepInsertRow(o,cols,vals,rc);checkRow(o,v,rc,false);toInsert.push(v);n++;}
  }
  for(const v of toInsert){const row={rid:newRid(o),v};arr.push(row);undoPush(cx,{op:'ins',arr,row});}
  checkKeys(o,cx);
  return{n,msg:n===1?'1 row merged.':n+' rows merged.'};
}

/* ===== DDL on schema objects ===== */
function sysName(cx){cx.db.sysc=(cx.db.sysc||8400)+1;return'SYS_C00'+cx.db.sysc;}
function objExists(key,cx){return!!cx.db.objs[key];}
function newObj(cx,o){o.oid=(cx.db.nextOid=(cx.db.nextOid||74000)+1);o.created=today(cx);o.ddl=o.created;o.status=o.status||'VALID';cx.db.objs[o.key]=o;return o;}
function today(cx){return new DT('DATE',sysdate(cx).s,0);}
function scanAst(e,fn){if(!e||typeof e!=='object')return;fn(e);for(const k in e){const v=e[k];if(v&&typeof v==='object'){if(Array.isArray(v))v.forEach(x=>scanAst(x,fn));else scanAst(v,fn);}}}
function validateType(t,colName){
  if(!t)return;
  if((t.base==='VARCHAR2'||t.base==='NVARCHAR2')&&t.len==null)throw E('ORA-00906','missing left parenthesis',[hint('VARCHAR2 ke saath length deni padti hai, jaise VARCHAR2(50).')]);
  if((t.base==='VARCHAR2'||t.base==='NVARCHAR2')&&t.len>32767)throw E('ORA-00910','specified length too long for its datatype');
  if((t.base==='VARCHAR2')&&t.len>4000)throw E('ORA-00910','specified length too long for its datatype',[hint('Normal VARCHAR2 ki limit 4000 bytes hai (MAX_STRING_SIZE=STANDARD). Lamba text ho toh CLOB use karo.')]);
  if((t.base==='CHAR'||t.base==='NCHAR')&&t.len>2000)throw E('ORA-00910','specified length too long for its datatype');
  if((t.base==='VARCHAR2'||t.base==='CHAR')&&t.len<1)throw E('ORA-01723','zero-length columns are not allowed');
  if(t.base==='NUMBER'&&t.p!=null&&(t.p<1||t.p>38))throw E('ORA-01727','numeric precision specifier is out of range (1 to 38)');
  if(t.base==='NUMBER'&&t.s!=null&&(t.s<-84||t.s>127))throw E('ORA-01728','numeric scale specifier is out of range (-84 to 127)');
  if(t.base==='FLOAT'&&(t.p<1||t.p>126))throw E('ORA-01724','floating point precision is out of range (1 to 126)');
  if(t.base==='USER')throw E('ORA-00902','invalid datatype');
  if(['PLS_INTEGER','BINARY_INTEGER','NATURAL','POSITIVE','SIMPLE_INTEGER','SIGNTYPE','NATURALN','POSITIVEN','SYS_REFCURSOR'].includes(t.base))throw E('ORA-00902','invalid datatype',[hint(t.base+' sirf PL/SQL mein chalta hai, table column mein NUMBER use karo.')]);
}
function normCons(c,o,cx){
  const k={name:c.name||sysName(cx),k:c.k,cols:c.cols?c.cols.slice():null,disabled:!!c.disabled,gen:!c.name,cond:c.cond||null,condText:c.condText||null,onDelete:c.onDelete||null,ref:null};
  if(c.name){const clash=allCons(cx).find(x=>x.o.owner===o.owner&&x.c.name===c.name);if(clash)throw E('ORA-02264','name already used by an existing constraint');}
  if(k.cols)for(const cn of k.cols)if(!o.cols.find(x=>x.name===cn&&!x.unused))throw E('ORA-00904','"'+cn+'": invalid identifier');
  if(k.k==='C'){let bad=null;scanAst(k.cond,n=>{if(n.t==='sub'||n.t==='exists'||n.t==='in'&&n.sub)bad='ORA-02251';if(n.t==='id'&&n.parts.length===1&&['SYSDATE','USER','UID','SYSTIMESTAMP','CURRENT_DATE','ROWNUM','LEVEL'].includes(n.parts[0]))bad='ORA-02436';if(n.t==='call'&&['SYSDATE','SYSTIMESTAMP','CURRENT_DATE','CURRENT_TIMESTAMP','USER','UID'].includes(n.parts[0]))bad='ORA-02436';});
    if(bad==='ORA-02251')throw E('ORA-02251','subquery not allowed here');if(bad)throw E('ORA-02436','date or system variable wrongly specified in CHECK constraint',[hint('CHECK constraint mein SYSDATE jaisi badalti values allowed nahi. Iske liye trigger use karo.')]);
    scanAst(k.cond,n=>{if(n.t==='id'&&n.parts.length===1&&!o.cols.find(x=>x.name===n.parts[0]))throw E('ORA-00904','"'+n.parts[0]+'": invalid identifier');});
    if(!k.cols){const used=colsUsed(k.cond,new Set());k.cols=o.cols.map(c=>c.name).filter(n2=>used.has(n2));}}
  if(k.k==='R'){const pq=c.ref.q;const par=pq.owner||pq.name!==o.name||true?resolveObj(pq,cx,true):null;const parent=(!pq.owner&&pq.name===o.name)?o:par;
    if(!parent||parent.type!=='TABLE')throw tabNotFound(pq,cx);
    let rc=c.ref.cols;if(!rc){const pk=parent.cons.find(x=>x.k==='P');if(!pk)throw E('ORA-02268','referenced table does not have a primary key');rc=pk.cols;}
    if(rc.length!==k.cols.length)throw E('ORA-02256','number of referencing columns must match referenced columns');
    const match=parent.cons.find(x=>(x.k==='P'||x.k==='U')&&x.cols.length===rc.length&&x.cols.every(z=>rc.includes(z)));
    if(!match)throw E('ORA-02270','no matching unique or primary key for this column-list',[hint('Foreign key sirf parent ke PRIMARY KEY ya UNIQUE column ko point kar sakti hai.')]);
    k.cols.forEach((cn,i)=>{const a=o.cols.find(x=>x.name===cn),b=parent.cols.find(x=>x.name===rc[i]);if(a&&b&&a.type&&b.type&&(isNumT(a.type)!==isNumT(b.type)||isCharT(a.type)!==isCharT(b.type)))throw E('ORA-02267','column type incompatible with referenced column type');});
    if(parent!==o)checkObjPriv(parent,'REFERENCES',cx);
    k.ref={key:parent.key,cols:rc,cname:match.name};}
  return k;
}
function allCons(cx){const out=[];for(const key in cx.db.objs){const o=cx.db.objs[key];if(o.type==='TABLE')for(const c of o.cons)out.push({o,c});}return out;}
function addConsTo(o,k,cx,validate){
  if(k.k==='P'&&o.cons.find(x=>x.k==='P'))throw E('ORA-02260','table can have only one primary key');
  if((k.k==='P'||k.k==='U')&&o.cons.find(x=>(x.k==='P'||x.k==='U')&&x.cols.join()===k.cols.join()))throw E('ORA-02261','such unique or primary key already exists in the table');
  if(validate&&!k.disabled){const rows=tableRows(o,cx);
    if(k.k==='P'||k.k==='U'){const seen=new Set();for(const r of rows){const ks=keyOf(o,r.v,k.cols);if(k.k==='P'&&ks.some(x=>x==null))throw E('ORA-01449','column contains NULL values; cannot alter to NOT NULL');if(ks.every(x=>x==null))continue;const s=ks.map(valKey).join('\u0001');if(seen.has(s)){if(k.k==='U')throw E('ORA-02299','cannot validate ('+o.owner+'.'+k.name+') - duplicate keys found');throw E('ORA-02437','cannot validate ('+o.owner+'.'+k.name+') - primary key violated');}seen.add(s);}}
    if(k.k==='N'){const i=o.cols.findIndex(c=>c.name===k.cols[0]);if(rows.some(r=>r.v[i]==null))throw E('ORA-02296','cannot enable ('+o.owner+'.'+k.name+') - null values found');}
    if(k.k==='C'){for(const r of rows)if(evalB(k.cond,sub(cx,{f:rowFrame(o,r.v,cx)}))===false)throw E('ORA-02293','cannot validate ('+o.owner+'.'+k.name+') - check constraint violated');}
    if(k.k==='R'){const par=cx.db.objs[k.ref.key];const set=new Set(tableRows(par,cx).map(r=>keyOf(par,r.v,k.ref.cols).map(valKey).join('\u0001')));
      for(const r of rows){const ks=keyOf(o,r.v,k.cols);if(ks.some(x=>x==null))continue;if(!set.has(ks.map(valKey).join('\u0001')))throw E('ORA-02298','cannot validate ('+o.owner+'.'+k.name+') - parent keys not found');}}}
  o.cons.push(k);
  if(k.k==='P'||k.k==='U'){const ixKey=o.owner+'.'+k.name;if(!cx.db.idx[ixKey])cx.db.idx[ixKey]={name:k.name,owner:o.owner,key:ixKey,tkey:o.key,cols:k.cols.map(c=>({e:{t:'id',parts:[c]},text:c})),unique:true,forCons:k.name,type:'NORMAL'};}
}
function execCreateTable(s,cx){
  const owner=s.q.owner||curSchema(cx);const key=owner+'.'+s.q.name;
  if(owner===curSchema(cx))needPriv(cx,'CREATE TABLE');else needPriv(cx,'CREATE ANY TABLE');
  if(cx.db.objs[key]){if(s.mods.ifNotExists)return{msg:'Table created.'};throw E('ORA-00955','name is already used by an existing object',[hint('Is naam ki table/view pehle se hai. Naya naam do, ya pehle DROP TABLE '+s.q.name.toLowerCase()+';')]);}
  const isPtt=/^ORA\$PTT_/.test(s.q.name);
  if(s.temp&&s.temp.kind==='PTT'&&!isPtt)throw E('ORA-00903','invalid table name',[hint('Private temporary table ka naam ORA$PTT_ se shuru hona chahiye.')]);
  if(isPtt&&!(s.temp&&s.temp.kind==='PTT'))throw E('ORA-32463','cannot create non private temporary table with private temporary table prefix');
  const user=cx.db.users[owner];let tsName=s.ts||(user?user.dts:'USERS');if(s.temp)tsName=user?user.tts:'TEMP';
  if(s.ts&&!cx.db.ts[s.ts])throw E('ORA-00959','tablespace \''+s.ts+'\' does not exist');
  if(s.ts&&cx.db.ts[s.ts].type==='TEMPORARY')throw E('ORA-02195','Attempt to create PERMANENT object in a TEMPORARY tablespace');
  if(s.ts&&cx.db.ts[s.ts].status==='READ ONLY')throw E('ORA-01647','tablespace \''+s.ts+'\' is read-only, cannot allocate space in it');
  const o={type:'TABLE',owner,name:s.q.name,key,cols:[],rows:[],cons:[],ts:tsName,temp:s.temp||null,virtual:0,ridSeq:0};
  let asRes=null;
  if(s.asQuery){asRes=runQuery(s.asQuery,sub(cx,{stmtCache:new Map()}));
    const names=s.cols.length?s.cols.map(c=>c.name):asRes.cols;if(names.length!==asRes.cols.length)throw E('ORA-01730','invalid number of column names specified');
    asRes.cols.forEach((c,i)=>{if(!s.cols.length&&!/^[A-Z_][A-Z0-9_$#]*$/.test(c)&&!(s.asQuery.body.items&&s.asQuery.body.items[i]&&s.asQuery.body.items[i].alias))throw E('ORA-00998','must name this expression with a column alias');});
    names.forEach((n,i)=>{let t=asRes.types[i]||{base:'VARCHAR2',len:4000};if(t.lit)t={base:'CHAR',len:t.len};if(t.base==='VARCHAR2'&&t.len===4000){const mx=Math.max(1,...asRes.rows.map(r=>r[i]==null?0:valToStr(r[i],cx).length));t={base:'VARCHAR2',len:mx};}
      o.cols.push({name:n,type:t});});}
  else{const seen=new Set();for(const c of s.cols){if(seen.has(c.name))throw E('ORA-00957','duplicate column name');seen.add(c.name);
      validateType(c.type,c.name);
      const col={name:c.name,type:c.type,def:c.def||null,defText:c.defText||null,defOnNull:!!c.defOnNull,invisible:!!c.invisible};
      if(c.identity){if(c.type&&!isNumT(c.type))throw E('ORA-30675','identity column must be a numeric type');if(o.cols.some(x=>x.identity))throw E('ORA-30669','table can have only one identity column');
        col.identity=Object.assign({start:1,inc:1},c.identity);col.identity.next=null;}
      if(c.virt){col.virt=c.virt;col.virtText=c.virtText;if(!col.type){const st=staticType(c.virt,{f:{d:[tableDesc(o)],v:[[]],up:null}});col.type=st&&!st.lit?st:{base:st&&st.lit?'VARCHAR2':'NUMBER',len:st&&st.lit?4000:undefined};}}
      if(!col.type)throw E('ORA-00902','invalid datatype');
      o.cols.push(col);}}
  if(s.external){o.external=s.external;o.ts=null;}
  /* constraints */
  for(const c of s.cols){if(c.identity){o.cons.push({name:sysName(cx),k:'N',cols:[c.name],gen:true});}
    for(const ic of c.inl||[]){const k=normCons(ic,o,cx);addConsTo(o,k,cx,false);}}
  for(const c of s.cons){const k=normCons(c,o,cx);addConsTo(o,k,cx,false);}
  if(s.asQuery){const cols=o.cols.map((c,i)=>i);newObj(cx,o);
    try{insertRows(o,cols,asRes.rows,sub(cx,{runTrigger:null}),{});}catch(e){delete cx.db.objs[key];throw e;}
    commitTx(cx);return{msg:'Table created.'};}
  newObj(cx,o);
  return{msg:'Table created.'};
}
function invalidateDependents(name,cx){for(const k in cx.db.objs){const v=cx.db.objs[k];if(v.type==='VIEW'&&JSON.stringify(v.query).includes('"name":"'+name+'"'))v.status='INVALID';}}
function compileView(o,cx){runQuery(o.query,sub(cx,{schema:o.owner,f:null,stmtCache:new Map()}),{limit:0});o.status='VALID';}
function execAlterTable(s,cx){
  const o=resolveObj(s.q,cx);if(!o||o.type!=='TABLE'){if(o&&o.type==='VIEW')throw E('ORA-00942','table or view does not exist');throw tabNotFound(s.q,cx);}
  if(o.owner!==curSchema(cx))needPriv(cx,'ALTER ANY TABLE');
  const rows=tableRows(o,cx);let msg='Table altered.';
  for(const a of s.acts){
    switch(a.k){
      case'addCols':for(const c of a.cols){if(o.cols.find(x=>x.name===c.name&&!x.unused))throw E('ORA-01430','column being added already exists in table');validateType(c.type,c.name);
        const col={name:c.name,type:c.type,def:c.def||null,defText:c.defText||null,defOnNull:!!c.defOnNull,invisible:!!c.invisible};
        if(c.identity){col.identity=Object.assign({start:1,inc:1},c.identity);col.identity.next=null;}
        if(c.virt){col.virt=c.virt;col.virtText=c.virtText;if(!col.type){const st=staticType(c.virt,{f:{d:[tableDesc(o)],v:[[]],up:null}});col.type=st&&!st.lit?st:{base:'NUMBER'};}}
        if(!col.type)throw E('ORA-00902','invalid datatype');
        const nn=(c.inl||[]).some(k=>k.k==='N'||k.k==='P');
        if(nn&&rows.length&&!c.def&&!c.identity&&!c.virt)throw E('ORA-01758','table must be empty to add mandatory (NOT NULL) column',[hint('Table mein rows hain; NOT NULL column ke saath DEFAULT value do, jaise ... NOT NULL DEFAULT 0')]);
        o.cols.push(col);const i=o.cols.length-1;
        for(const r of rows){r.v.push(c.virt?null:c.identity?identNext(col):(c.def?coerce(evalE(c.def,cx),col.type,cx,errCtx(o,col)):null));if(c.virt)computeVirtual(o,r.v,cx);}
        if(c.identity)o.cons.push({name:sysName(cx),k:'N',cols:[c.name],gen:true});
        for(const ic of c.inl||[]){const k=normCons(ic,o,cx);addConsTo(o,k,cx,true);}}
        break;
      case'modCols':for(const c of a.cols){const i=o.cols.findIndex(x=>x.name===c.name&&!x.unused);if(i<0)throw E('ORA-00904','"'+c.name+'": invalid identifier');const col=o.cols[i];
        if(c.type){validateType(c.type,c.name);const nonNull=rows.filter(r=>r.v[i]!=null);
          if(nonNull.length){const ot=col.type,nt=c.type;const cat=t=>isNumT(t)?'N':isCharT(t)?'S':isDateT(t)?'D':t.base;
            if(cat(ot)!==cat(nt))throw E('ORA-01439','column to be modified must be empty to change datatype');
            if(cat(nt)==='S'){const mx=Math.max(...nonNull.map(r=>byteLen(String(r.v[i]).replace(/ +$/,''))));if(nt.len!=null&&mx>nt.len)throw E('ORA-01441','cannot decrease column length because some value is too big');}
            if(cat(nt)==='N'&&nt.p!=null&&ot.base==='NUMBER'&&(ot.p==null||nt.p<ot.p||(nt.s||0)<(ot.s||0))){const ok=nonNull.every(r=>{try{coerce(r.v[i],nt,cx,{});return oraRound(r.v[i],nt.s||0)===r.v[i];}catch(e){return false;}});if(!ok)throw E('ORA-01440','column to be modified must be empty to decrease precision or scale');}}
          col.type=c.type;for(const r of rows)if(r.v[i]!=null)r.v[i]=coerce(isCharT(c.type)?String(r.v[i]).replace(/ +$/,''):r.v[i],c.type,cx,errCtx(o,col));}
        if(c.def!==undefined&&c.def){col.def=c.def;col.defText=c.defText;col.defOnNull=!!c.defOnNull;}
        if(c.invisible!==undefined)col.invisible=c.invisible;
        for(const ic of c.inl||[]){if(ic.k==='N'){if(o.cons.find(k=>k.k==='N'&&k.cols[0]===c.name&&!k.disabled))throw E('ORA-01442','column to be modified to NOT NULL is already NOT NULL');const k=normCons(Object.assign({},ic,{cols:[c.name]}),o,cx);addConsTo(o,k,cx,true);}
          else{const k=normCons(Object.assign({},ic,{cols:ic.cols||[c.name]}),o,cx);addConsTo(o,k,cx,true);}}
        if(c.nullable){const k=o.cons.findIndex(x=>x.k==='N'&&x.cols[0]===c.name);if(k<0){if(o.cons.find(x=>x.k==='P'&&x.cols.includes(c.name)))throw E('ORA-01451','column to be modified to NULL cannot be modified to NULL');throw E('ORA-01451','column to be modified to NULL cannot be modified to NULL');}o.cons.splice(k,1);}}
        break;
      case'dropCols':case'setUnused':{
        const idxs=a.cols.map(c=>{const i=o.cols.findIndex(x=>x.name===c&&!x.unused);if(i<0)throw E('ORA-00904','"'+c+'": invalid identifier');return i;});
        if(o.cols.filter(c=>!c.unused).length-idxs.length<1)throw E('ORA-12983','cannot drop all columns in a table');
        for(const c of a.cols){
          const pk=o.cons.find(k=>(k.k==='P'||k.k==='U')&&k.cols.includes(c));
          if(pk&&!a.casc&&childRefs(o,cx).some(r=>r.c.ref.cols.includes(c)))throw E('ORA-12992','cannot drop parent key column');
          const multi=o.cons.find(k=>k.cols&&k.cols.length>1&&k.cols.includes(c)&&!a.cols.every(x=>k.cols.includes(x)));
          if(multi&&!a.casc)throw E('ORA-12991','column is referenced in a multi-column constraint');}
        if(a.casc)for(const{t,c}of childRefs(o,cx)){if(c.ref.cols.some(x=>a.cols.includes(x)))t.cons.splice(t.cons.indexOf(c),1);}
        o.cons=o.cons.filter(k=>!(k.cols&&k.cols.some(x=>a.cols.includes(x))));
        for(const ik in cx.db.idx){const ix=cx.db.idx[ik];if(ix.tkey===o.key&&ix.cols.some(c=>a.cols.some(x=>colsUsed(c.e,new Set()).has(x))))delete cx.db.idx[ik];}
        if(a.k==='setUnused'){idxs.forEach(i=>{o.cols[i].unused=true;o.cols[i].name='SYS_C000'+(o.cols[i].name.length+i)+'_'+Date.now().toString(36).slice(-6).toUpperCase()+'$';});}
        else{idxs.sort((x,y)=>y-x).forEach(i=>{o.cols.splice(i,1);rows.forEach(r=>r.v.splice(i,1));});}
        break;}
      case'dropUnused':{for(let i=o.cols.length-1;i>=0;i--)if(o.cols[i].unused){o.cols.splice(i,1);rows.forEach(r=>r.v.splice(i,1));}break;}
      case'renCol':{const i=o.cols.findIndex(x=>x.name===a.a&&!x.unused);if(i<0)throw E('ORA-00904','"'+a.a+'": invalid identifier');if(o.cols.find(x=>x.name===a.b))throw E('ORA-00957','duplicate column name');
        o.cols[i].name=a.b;const ren=e=>scanAst(e,n=>{if(n.t==='id'&&n.parts[n.parts.length-1]===a.a){n.parts=n.parts.slice(0,-1).concat([a.b]);delete n._k;}});
        o.cons.forEach(k=>{if(k.cols)k.cols=k.cols.map(c=>c===a.a?a.b:c);if(k.cond){ren(k.cond);k.condText=k.condText&&k.condText.replace(new RegExp('\\b'+a.a+'\\b','gi'),a.b.toLowerCase());}});
        o.cols.forEach(c=>{if(c.virt)ren(c.virt);});
        for(const{t,c}of childRefs(o,cx))c.ref.cols=c.ref.cols.map(x=>x===a.a?a.b:x);
        for(const ik in cx.db.idx){const ix=cx.db.idx[ik];if(ix.tkey===o.key)ix.cols.forEach(c=>{ren(c.e);if(c.text&&c.text.toUpperCase()===a.a)c.text=a.b;});}
        break;}
      case'renTable':{const nk=o.owner+'.'+a.to;if(cx.db.objs[nk])throw E('ORA-00955','name is already used by an existing object');renameTableKey(o,nk,a.to,cx);msg='Table altered.';break;}
      case'addCons':{const k=normCons(a.c,o,cx);addConsTo(o,k,cx,true);break;}
      case'dropCons':{let i;if(a.pk)i=o.cons.findIndex(k=>k.k==='P');else if(a.uq)i=o.cons.findIndex(k=>k.k==='U'&&k.cols.join()===a.uq.join());else i=o.cons.findIndex(k=>k.name===a.name);
        if(i<0)throw E('ORA-02443','Cannot drop constraint  - nonexistent constraint');const k=o.cons[i];
        if((k.k==='P'||k.k==='U')){const refs=childRefs(o,cx).filter(r=>r.c.ref.cname===k.name||r.c.ref.cols.join()===k.cols.join());if(refs.length&&!a.casc)throw E('ORA-02273','this unique/primary key is referenced by some foreign keys');refs.forEach(r=>r.t.cons.splice(r.t.cons.indexOf(r.c),1));delete cx.db.idx[o.owner+'.'+k.name];}
        o.cons.splice(i,1);break;}
      case'consState':{const k=a.pk?o.cons.find(x=>x.k==='P'):o.cons.find(x=>x.name===a.name);if(!k)throw E('ORA-02431','cannot disable constraint ('+(a.name||'')+') - no such constraint');
        if(a.disabled&&(k.k==='P'||k.k==='U')&&childRefs(o,cx).some(r=>r.c.ref.cname===k.name&&!r.c.disabled))throw E('ORA-02297','cannot disable constraint ('+o.owner+'.'+k.name+') - dependencies exist');
        if(!a.disabled&&k.disabled){k.disabled=false;const idx=o.cons.indexOf(k);o.cons.splice(idx,1);try{addConsTo(o,k,cx,true);}catch(e){k.disabled=true;o.cons.splice(idx,0,k);throw e;}const last=o.cons.pop();o.cons.splice(idx,0,last);}
        else k.disabled=a.disabled;break;}
      case'renCons':{const k=o.cons.find(x=>x.name===a.a);if(!k)throw E('ORA-23292','The constraint does not exist');k.name=a.b;k.gen=false;break;}
      case'allTriggers':for(const tk in cx.db.trigs){const t=cx.db.trigs[tk];if(t.tkey===o.key)t.enabled=!a.disabled;}break;
      case'readOnly':o.readOnly=a.v;break;
      case'move':if(a.ts){if(!cx.db.ts[a.ts])throw E('ORA-00959','tablespace \''+a.ts+'\' does not exist');o.ts=a.ts;}break;
      case'noop':break;
    }
  }
  return{msg};
}
function renameTableKey(o,nk,nn,cx){const old=o.key;delete cx.db.objs[old];o.key=nk;o.name=nn;cx.db.objs[nk]=o;
  for(const{t,c}of allCons(cx))if(c.k==='R'&&c.ref.key===old)c.ref.key=nk;
  for(const ik in cx.db.idx){const ix=cx.db.idx[ik];if(ix.tkey===old)ix.tkey=nk;}
  for(const tk in cx.db.trigs){const t=cx.db.trigs[tk];if(t.tkey===old)t.tkey=nk;}
  invalidateDependents(old.split('.')[1],cx);}
function execDropTable(s,cx){
  const o=resolveObj(s.q,cx,true);if(!o||o.type!=='TABLE'){if(s.ifx)return{msg:'Table dropped.'};if(o&&o.type==='VIEW')throw E('ORA-00942','table or view does not exist',[hint('Yeh view hai; DROP VIEW use karo.')]);throw tabNotFound(s.q,cx);}
  if(o.owner!==curSchema(cx))needPriv(cx,'DROP ANY TABLE');
  const refs=childRefs(o,cx).filter(r=>r.t!==o);
  if(refs.length&&!s.casc)throw E('ORA-02449','unique/primary keys in table referenced by foreign keys',[hint('Doosri table ('+refs[0].t.name.toLowerCase()+') is table ko refer karti hai. DROP TABLE '+o.name.toLowerCase()+' CASCADE CONSTRAINTS; likho, ya pehle child table hatao.')]);
  refs.forEach(r=>r.t.cons.splice(r.t.cons.indexOf(r.c),1));
  delete cx.db.objs[o.key];
  const idx=[];for(const ik in cx.db.idx){if(cx.db.idx[ik].tkey===o.key){idx.push(cx.db.idx[ik]);delete cx.db.idx[ik];}}
  const trg=[];for(const tk in cx.db.trigs){if(cx.db.trigs[tk].tkey===o.key){trg.push(cx.db.trigs[tk]);delete cx.db.trigs[tk];}}
  if(!s.purge&&!o.temp){cx.db.bin=cx.db.bin||[];const bn='BIN$'+Math.random().toString(36).slice(2,12).toUpperCase()+'0Q==$0';cx.db.bin.push({o,idx,trg,bn,owner:o.owner,orig:o.name,when:fmtDate(sysdate(cx),'YYYY-MM-DD:HH24:MI:SS')});}
  invalidateDependents(o.name,cx);
  return{msg:'Table dropped.'};
}
function execFlashback(s,cx){const bin=cx.db.bin||[];const owner=s.q.owner||curSchema(cx);let i=-1;for(let k=bin.length-1;k>=0;k--)if(bin[k].owner===owner&&(bin[k].orig===s.q.name||bin[k].bn===s.q.name)){i=k;break;}
  if(i<0)throw E('ORA-38305','object not in RECYCLE BIN');const b=bin[i];const nn=s.rename||b.orig;const nk=owner+'.'+nn;if(cx.db.objs[nk])throw E('ORA-38312','original name is used by an existing object');
  bin.splice(i,1);b.o.key=nk;b.o.name=nn;cx.db.objs[nk]=b.o;b.idx.forEach(ix=>{ix.tkey=nk;cx.db.idx[ix.key]=ix;});b.trg.forEach(t=>{t.tkey=nk;cx.db.trigs[t.key]=t;});
  for(const k in cx.db.objs){const v=cx.db.objs[k];if(v.type==='VIEW'&&v.status==='INVALID'){try{compileView(v,cx);}catch(e){}}}
  return{msg:'Flashback complete.'};}
function execTruncate(s,cx){const o=resolveObj(s.q,cx);if(!o||o.type!=='TABLE')throw tabNotFound(s.q,cx);if(o.owner!==curSchema(cx))needPriv(cx,'DROP ANY TABLE');
  const refs=childRefs(o,cx).filter(r=>r.t!==o&&tableRows(r.t,cx).length);if(refs.length&&!s.casc)throw E('ORA-02266','unique/primary keys in table referenced by enabled foreign keys');
  if(s.casc)refs.forEach(r=>{if(r.c.onDelete!=='CASCADE')throw E('ORA-14705','unique or primary keys referenced by enabled foreign keys in table "'+r.t.owner+'"."'+r.t.name+'"');tableRows(r.t,cx).length=0;});
  tableRows(o,cx).length=0;o.virtual=0;return{msg:'Table truncated.'};}
function execRename(s,cx){const owner=curSchema(cx);const o=cx.db.objs[owner+'.'+s.a];if(!o)throw E('ORA-04043','object '+s.a+' does not exist');
  const nk=owner+'.'+s.b;if(cx.db.objs[nk])throw E('ORA-00955','name is already used by an existing object');
  if(o.type==='TABLE')renameTableKey(o,nk,s.b,cx);else if(o.type==='VIEW'||o.type==='SEQUENCE'||o.type==='SYNONYM'){delete cx.db.objs[o.key];o.key=nk;o.name=s.b;cx.db.objs[nk]=o;}
  else throw E('ORA-04043','object '+s.a+' does not exist');return{msg:'Table renamed.'};}
function execCreateView(s,cx){
  const owner=s.q.owner||curSchema(cx);const key=owner+'.'+s.q.name;needPriv(cx,owner===curSchema(cx)?'CREATE VIEW':'CREATE ANY VIEW');
  if(s.mods.ifNotExists&&s.mods.orReplace)throw E('ORA-11541','REPLACE and IF NOT EXISTS cannot coexist in the same DDL statement');
  const ex=cx.db.objs[key];if(ex&&s.mods.ifNotExists)return{msg:'View created.'};if(ex){if(!(s.mods.orReplace&&ex.type==='VIEW'))throw E('ORA-00955','name is already used by an existing object');}
  const v={type:'VIEW',owner,name:s.q.name,key,query:s.query,text:s.text,cols:s.cols,check:!!s.check,readOnly:!!s.readOnly,checkName:s.checkName||null};
  let r;try{r=runQuery(s.query,sub(cx,{schema:owner,f:null,stmtCache:new Map()}),{limit:0});}
  catch(e){if(s.mods.force){v.status='INVALID';if(ex)delete cx.db.objs[key];newObj(cx,v);return{msg:'Warning: View created with compilation errors.',warn:true};}throw e;}
  if(s.cols&&s.cols.length!==r.cols.length)throw E('ORA-01730','invalid number of column names specified');
  if(!s.cols){const items=s.query.body.t==='select'?s.query.body.items:[];r.cols.forEach((c,i)=>{const it=items[i];if(it&&!it.star&&!it.alias&&it.e.t!=='id')throw E('ORA-00998','must name this expression with a column alias');});
    const seen=new Set();for(const c of r.cols){if(seen.has(c))throw E('ORA-00957','duplicate column name');seen.add(c);}}
  if(s.check&&s.checkName)v.checkName=s.checkName;
  if(ex){v.oid=ex.oid;v.created=ex.created;cx.db.objs[key]=v;v.status='VALID';}else newObj(cx,v);
  return{msg:'View created.'};
}
function execDropView(s,cx){const o=resolveObj(s.q,cx,true);if(!o||o.type!=='VIEW'){if(s.ifx)return{msg:'View dropped.'};throw tabNotFound(s.q,cx);}
  for(const tk in cx.db.trigs)if(cx.db.trigs[tk].tkey===o.key)delete cx.db.trigs[tk];delete cx.db.objs[o.key];invalidateDependents(o.name,cx);return{msg:'View dropped.'};}
function execCreateIndex(s,cx){
  const owner=s.name.owner||curSchema(cx);const key=owner+'.'+s.name.name;if(cx.db.idx[key]&&s.ifx)return{msg:'Index created.'};if(cx.db.idx[key])throw E('ORA-00955','name is already used by an existing object');
  const o=resolveObj(s.q,cx);if(!o||o.type!=='TABLE')throw tabNotFound(s.q,cx);
  const desc=tableDesc(o);for(const c of s.cols){scanAst(c.e,n=>{if(n.t==='id'&&n.parts.length===1&&desc.idx[n.parts[0]]===undefined)throw E('ORA-00904','"'+n.parts[0]+'": invalid identifier');});}
  const sig=s.cols.map(c=>exprKey(c.e)).join('|');for(const ik in cx.db.idx){const ix=cx.db.idx[ik];if(ix.tkey===o.key&&ix.cols.map(c=>exprKey(c.e)).join('|')===sig)throw E('ORA-01408','such column list already indexed');}
  const ix={name:s.name.name,owner,key,tkey:o.key,cols:s.cols,unique:s.unique,bitmap:s.bitmap,type:s.bitmap?'BITMAP':s.cols.some(c=>c.e.t!=='id')?'FUNCTION-BASED NORMAL':'NORMAL',ts:s.ts||o.ts};
  if(s.bitmap&&s.unique)throw E('ORA-00968','missing INDEX keyword');
  if(s.unique){const seen=new Set();for(const r of tableRows(o,cx)){const ks=s.cols.map(c=>evalE(c.e,sub(cx,{f:rowFrame(o,r.v,cx)})));if(ks.every(x=>x==null))continue;const k=ks.map(valKey).join('\u0001');if(seen.has(k))throw E('ORA-01452','cannot CREATE UNIQUE INDEX; duplicate keys found');seen.add(k);}}
  cx.db.idx[key]=ix;return{msg:'Index created.'};
}
function execDropIndex(s,cx){const key=(s.q.owner||curSchema(cx))+'.'+s.q.name;const ix=cx.db.idx[key];if(!ix){if(s.ifx)return{msg:'Index dropped.'};throw E('ORA-01418','specified index does not exist');}
  if(ix.forCons)throw E('ORA-02429','cannot drop index used for enforcement of unique/primary key');delete cx.db.idx[key];return{msg:'Index dropped.'};}
function execCreateSeq(s,cx){const owner=s.q.owner||curSchema(cx);const key=owner+'.'+s.q.name;needPriv(cx,'CREATE SEQUENCE');if(cx.db.objs[key]&&s.ifx)return{msg:'Sequence created.'};if(cx.db.objs[key])throw E('ORA-00955','name is already used by an existing object');
  const o=s.o;const inc=o.inc==null?1:o.inc;if(inc===0)throw E('ORA-04002','INCREMENT must be a non-zero integer');
  const min=o.min!=null?o.min:(inc>0?1:-9999999999999999999999999999);const max=o.max!=null?o.max:(inc>0?9999999999999999999999999999:-1);
  const start=o.start!=null?o.start:(inc>0?min:max);
  if(start<min)throw E('ORA-04006','START WITH cannot be less than MINVALUE');if(start>max)throw E('ORA-04008','START WITH cannot be more than MAXVALUE');if(min>=max)throw E('ORA-04004','MINVALUE must be less than MAXVALUE');
  const cache=o.cache==null?20:o.cache;if(o.cycle&&cache>0&&Math.ceil((max-min)/Math.abs(inc))<cache)throw E('ORA-04013','number to CACHE must be less than one cycle');
  newObj(cx,{type:'SEQUENCE',owner,name:s.q.name,key,start,inc,min,max,cycle:!!o.cycle,cache,order:!!o.order,next:null});return{msg:'Sequence created.'};}
function execAlterSeq(s,cx){const o=resolveObj(s.q,cx);if(!o||o.type!=='SEQUENCE')throw E('ORA-02289','sequence does not exist');const x=s.o;
  if(x.inc!=null){if(x.inc===0)throw E('ORA-04002','INCREMENT must be a non-zero integer');if(o.next!=null)o.next=o.next-o.inc+x.inc;o.inc=x.inc;}
  if(x.max!=null){if(o.last!=null&&x.max<o.last)throw E('ORA-04009','MAXVALUE cannot be made to be less than the current value');o.max=x.max;}if(x.nomax)o.max=9999999999999999999999999999;
  if(x.min!=null){if(o.last!=null&&x.min>o.last)throw E('ORA-04007','MINVALUE cannot be made to exceed the current value');o.min=x.min;}
  if(x.cycle!=null)o.cycle=x.cycle;if(x.cache!=null)o.cache=x.cache;
  if(x.restart){o.start=x.start!=null?x.start:(o.inc>0?o.min:o.max);o.next=null;}
  return{msg:'Sequence altered.'};}
function execDropSeq(s,cx){const o=resolveObj(s.q,cx,true);if(!o||o.type!=='SEQUENCE'){if(s.ifx)return{msg:'Sequence dropped.'};throw E('ORA-02289','sequence does not exist');}delete cx.db.objs[o.key];return{msg:'Sequence dropped.'};}
function execCreateSyn(s,cx){
  const t={owner:s.target.owner||(s.target.link?null:curSchema(cx)),name:s.target.name,link:s.target.link};
  if(s.pub){needPriv(cx,'CREATE PUBLIC SYNONYM');if(cx.db.pubSyn[s.q.name]&&s.mods.ifNotExists)return{msg:'Synonym created.'};if(cx.db.pubSyn[s.q.name]&&!s.mods.orReplace)throw E('ORA-00955','name is already used by an existing object');cx.db.pubSyn[s.q.name]=t;return{msg:'Synonym created.'};}
  needPriv(cx,'CREATE SYNONYM');const owner=s.q.owner||curSchema(cx);const key=owner+'.'+s.q.name;const ex=cx.db.objs[key];
  if(ex&&s.mods.ifNotExists)return{msg:'Synonym created.'};
  if(ex&&!(ex.type==='SYNONYM'&&s.mods.orReplace))throw E('ORA-00955','name is already used by an existing object');
  if(owner+'.'+s.q.name===t.owner+'.'+t.name)throw E('ORA-01471','cannot create a synonym with same name as object');
  if(ex)delete cx.db.objs[key];newObj(cx,{type:'SYNONYM',owner,name:s.q.name,key,target:t});return{msg:'Synonym created.'};}
function execDropSyn(s,cx){if(s.pub){needPriv(cx,'DROP PUBLIC SYNONYM');if(!cx.db.pubSyn[s.q.name]){if(s.ifx)return{msg:'Synonym dropped.'};throw E('ORA-01432','public synonym to be dropped does not exist');}delete cx.db.pubSyn[s.q.name];return{msg:'Synonym dropped.'};}
  const key=(s.q.owner||curSchema(cx))+'.'+s.q.name;const o=cx.db.objs[key];if(!o||o.type!=='SYNONYM'){if(s.ifx)return{msg:'Synonym dropped.'};throw E('ORA-01434','private synonym to be dropped does not exist');}delete cx.db.objs[key];return{msg:'Synonym dropped.'};}
function execAlterSession(s,cx){const n=cx.sess.nls;
  for(const[k,v]of s.list){const val=v;
    switch(k){case'NLS_DATE_FORMAT':tokFmt(val);n.dateFmt=val;break;case'NLS_TIMESTAMP_FORMAT':tokFmt(val);n.tsFmt=val;break;case'NLS_TIMESTAMP_TZ_FORMAT':tokFmt(val);n.tstzFmt=val;break;
      case'TIME_ZONE':{const u=String(val).toUpperCase();if(u==='LOCAL'){n.tz=cx.db.osTZ;break;}if(u==='DBTIMEZONE'){n.tz=n.dbtz;break;}parseTZ(val,Math.floor(Date.now()/1000));n.tz=val;break;}
      case'CURRENT_SCHEMA':if(!cx.db.users[String(val).toUpperCase()])throw E('ORA-01435','user does not exist');cx.sess.schema=String(val).toUpperCase();break;
      case'NLS_LANGUAGE':case'NLS_TERRITORY':case'NLS_DATE_LANGUAGE':case'NLS_SORT':case'NLS_COMP':case'NLS_NUMERIC_CHARACTERS':case'NLS_CURRENCY':if(k==='NLS_CURRENCY')n.currency=val;n[k]=val;break;
      case'CONTAINER':break;case'PLSQL_WARNINGS':case'OPTIMIZER_MODE':case'STATISTICS_LEVEL':case'SQL_TRACE':case'EVENTS':case'PLSCOPE_SETTINGS':break;
      default:throw E('ORA-02248','invalid option for ALTER SESSION');}}
  return{msg:'Session altered.'};}
/* EXPLAIN PLAN: a small, honest approximation of the access path */
function explainPlan(s,cx){
  const lines=[];const ops=[];
  const scanFor=(tref,where)=>{const o=resolveObj(tref.q,cx,true);if(!o||o.type!=='TABLE')return[{op:'TABLE ACCESS FULL',name:tref.q.name}];
    const conj=splitAnd(where);const rows=tableRows(o,cx).length;
    for(const ik in cx.db.idx){const ix=cx.db.idx[ik];if(ix.tkey!==o.key)continue;const first=ix.cols[0];
      for(const c of conj){if(c.t!=='cmp'&&c.t!=='between'&&c.t!=='like'&&c.t!=='in')continue;const lhs=c.a;const rhs=c.b||c.lo;
        const match=e=>e&&(exprKey(stripQual(e))===exprKey(stripQual(first.e)));
        if(match(lhs)&&(c.t!=='like'||(c.b&&c.b.t==='lit'&&!/^[%_]/.test(String(c.b.v))))){
          if(ix.bitmap)return[{op:'TABLE ACCESS BY INDEX ROWID BATCHED',name:o.name},{op:' BITMAP CONVERSION TO ROWIDS',name:''},{op:'  BITMAP INDEX SINGLE VALUE',name:ix.name}];
          const uniq=ix.unique&&c.t==='cmp'&&c.op==='='&&ix.cols.length===1;
          return[{op:'TABLE ACCESS BY INDEX ROWID'+(uniq?'':' BATCHED'),name:o.name,rows:uniq?1:Math.max(1,Math.round(rows/10))},{op:' INDEX '+(uniq?'UNIQUE':'RANGE')+' SCAN',name:ix.name,rows:uniq?1:Math.max(1,Math.round(rows/10))}];}}}
    return[{op:'TABLE ACCESS FULL',name:o.name,rows}];};
  const stmt=s.s;let body=[];
  if(stmt.t==='query'&&stmt.body.t==='select'){const core=stmt.body;
    if(core.from.length===1&&core.from[0].t==='tab')body=scanFor(core.from[0],core.where);
    else{body=[{op:'HASH JOIN',name:''}];const walk=n=>{if(n.t==='tab')scanFor(n,core.where).forEach(x=>body.push({op:' '+x.op,name:x.name,rows:x.rows}));else if(n.t==='join'){walk(n.l);walk(n.r);}};core.from.forEach(walk);}
    if(core.group)body.unshift({op:'HASH GROUP BY',name:''});if(stmt.order)body.unshift({op:'SORT ORDER BY',name:''});}
  else body=[{op:'TABLE ACCESS FULL',name:'?'}];
  const all=[{op:(stmt.t==='query'?'SELECT':stmt.t.toUpperCase())+' STATEMENT',name:''}].concat(body.map(b=>Object.assign({},b,{op:' '+b.op})));
  const w=Math.max(40,...all.map(a=>a.op.length+2));const nw=Math.max(12,...all.map(a=>a.name.length+1));
  const sep='-'.repeat(w+nw+20);
  lines.push('Plan hash value: '+(1000000000+Math.abs(exprKey(stmt).length*7919)%899999999));lines.push('');lines.push(sep);
  lines.push('| Id  | '+'Operation'.padEnd(w)+'| '+'Name'.padEnd(nw)+'| Rows  |');lines.push(sep);
  all.forEach((a,i)=>lines.push('| '+(i===0?'  0':String(i).padStart(3))+' | '+a.op.padEnd(w)+'| '+a.name.padEnd(nw)+'| '+String(a.rows==null?'':a.rows).padStart(5)+' |'));
  lines.push(sep);cx.sess.plan=lines;return{msg:'Explained.'};
}
function stripQual(e){if(e&&e.t==='id'&&e.parts.length>1)return{t:'id',parts:[e.parts[e.parts.length-1]]};if(e&&typeof e==='object'&&!Array.isArray(e)){const c={};for(const k in e){if(k==='_k')continue;const v=e[k];c[k]=Array.isArray(v)?v.map(stripQual):v&&typeof v==='object'?stripQual(v):v;}return c;}return e;}

/* ===== the starting database: instance, users, OT sample schema ===== */
function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const T_=(base,o)=>Object.assign({base},o||{});
const NUMT=(p,s)=>T_('NUMBER',{p:p==null?null:p,s:s==null?(p==null?null:0):s});
const VC=n=>T_('VARCHAR2',{len:n});
function mkTable(db,cx,owner,name,cols,rows,cons,opts){
  const key=owner+'.'+name;const o={type:'TABLE',owner,name,key,cols:cols.map(c=>Object.assign({},c)),rows:[],cons:[],ts:(opts&&opts.ts)||'USERS',temp:null,virtual:0,ridSeq:0};
  o.oid=(db.nextOid=(db.nextOid||74000)+1);o.created=new DT('DATE',mkSY(2024,3,8,10,15,0),0);o.ddl=o.created;o.status='VALID';db.objs[key]=o;
  for(const c of cons||[]){const k=Object.assign({gen:!c.name},c);if(!k.cols)k.cols=[];if(!k.name)k.name=sysName(cx);if(k.ref){k.ref={key:owner+'.'+k.ref.t,cols:k.ref.cols,cname:k.ref.cname||'PK_'+k.ref.t};}o.cons.push(k);
    if(k.k==='P'||k.k==='U')db.idx[owner+'.'+k.name]={name:k.name,owner,key:owner+'.'+k.name,tkey:key,cols:k.cols.map(cc=>({e:{t:'id',parts:[cc]},text:cc})),unique:true,forCons:k.name,type:'NORMAL'};}
  for(const v of rows){o.rows.push({rid:++o.ridSeq,v:o.cols.map((c,i)=>v[i]===undefined?null:v[i])});}
  o.cols.forEach((c,i)=>{if(c.identity){const mx=Math.max(0,...o.rows.map(r=>r.v[i]||0));c.identity.next=mx+1;c.identity.start=mx+1;}});
  return o;
}
const D8=(y,m,d)=>new DT('DATE',mkSY(y,m,d),0);
function seedOT(db,cx){
  const R=rng(20240308);const pick=a=>a[Math.floor(R()*a.length)];const between=(a,b)=>a+Math.floor(R()*(b-a+1));
  const id=()=>({mode:'BY DEFAULT'});
  mkTable(db,cx,'OT','REGIONS',[{name:'REGION_ID',type:NUMT(),identity:id()},{name:'REGION_NAME',type:VC(50)}],[[1,'Europe'],[2,'Americas'],[3,'Asia'],[4,'Middle East and Africa']],[{name:'PK_REGIONS',k:'P',cols:['REGION_ID']},{k:'N',cols:['REGION_NAME']}]);
  const countries=[['AR','Argentina',2],['AU','Australia',3],['BE','Belgium',1],['BR','Brazil',2],['CA','Canada',2],['CH','Switzerland',1],['CN','China',3],['DE','Germany',1],['DK','Denmark',1],['EG','Egypt',4],['FR','France',1],['IL','Israel',4],['IN','India',3],['IT','Italy',1],['JP','Japan',3],['KW','Kuwait',4],['ML','Malaysia',3],['MX','Mexico',2],['NG','Nigeria',4],['NL','Netherlands',1],['SG','Singapore',3],['UK','United Kingdom',1],['US','United States of America',2],['ZM','Zambia',4],['ZW','Zimbabwe',4]];
  mkTable(db,cx,'OT','COUNTRIES',[{name:'COUNTRY_ID',type:T_('CHAR',{len:2})},{name:'COUNTRY_NAME',type:VC(40)},{name:'REGION_ID',type:NUMT()}],countries,[{name:'PK_COUNTRIES',k:'P',cols:['COUNTRY_ID']},{k:'N',cols:['COUNTRY_NAME']},{name:'FK_COUNTRIES_REGIONS',k:'R',cols:['REGION_ID'],ref:{t:'REGIONS',cols:['REGION_ID']},onDelete:'CASCADE'}]);
  const locs=[[1,'1297 Via Cola di Rie','00989','Roma',null,'IT'],[2,'93091 Calle della Testa','10934','Venice',null,'IT'],[3,'2017 Shinjuku-ku','1689','Tokyo','Tokyo Prefecture','JP'],[4,'9450 Kamiya-cho','6823','Hiroshima',null,'JP'],[5,'2014 Jabberwocky Rd','26192','Southlake','Texas','US'],[6,'2011 Interiors Blvd','99236','South San Francisco','California','US'],[7,'2007 Zagora St','50090','South Brunswick','New Jersey','US'],[8,'2004 Charade Rd','98199','Seattle','Washington','US'],[9,'147 Spadina Ave','M5V 2L7','Toronto','Ontario','CA'],[10,'6092 Boxwood St','YSW 9T2','Whitehorse','Yukon','CA'],[11,'40-5-12 Laogianggen','190518','Beijing',null,'CN'],[12,'1298 Vileparle (E)','490231','Bombay','Maharashtra','IN'],[13,'12-98 Victoria Street','2901','Sydney','New South Wales','AU'],[14,'198 Clementi North','540198','Singapore',null,'SG'],[15,'8204 Arthur St',null,'London',null,'UK'],[16,'Magdalen Centre, The Oxford Science Park','OX9 9ZB','Oxford','Oxford','UK'],[17,'9702 Chester Road','09629850293','Stretford','Manchester','UK'],[18,'Schwanthalerstr. 7031','80925','Munich','Bavaria','DE'],[19,'Rua Frei Caneca 1360','01307-002','Sao Paulo','Sao Paulo','BR'],[20,'20 Rue des Corps-Saints','1730','Geneva','Geneve','CH'],[21,'Murtenstrasse 921','3095','Bern','BE','CH'],[22,'Pieter Breughelstraat 837','3029SK','Utrecht','Utrecht','NL'],[23,'Mariano Escobedo 9991','11932','Mexico City','Distrito Federal','MX']];
  mkTable(db,cx,'OT','LOCATIONS',[{name:'LOCATION_ID',type:NUMT(),identity:id()},{name:'ADDRESS',type:VC(255)},{name:'POSTAL_CODE',type:VC(20)},{name:'CITY',type:VC(50)},{name:'STATE',type:VC(50)},{name:'COUNTRY_ID',type:T_('CHAR',{len:2})}],locs,[{name:'PK_LOCATIONS',k:'P',cols:['LOCATION_ID']},{k:'N',cols:['ADDRESS']},{name:'FK_LOCATIONS_COUNTRIES',k:'R',cols:['COUNTRY_ID'],ref:{t:'COUNTRIES',cols:['COUNTRY_ID']},onDelete:'CASCADE'}]);
  const wh=[[1,'Southlake, Texas',5],[2,'San Francisco',6],[3,'New Jersey',7],[4,'Seattle, Washington',8],[5,'Toronto',9],[6,'Sydney',13],[7,'Mexico City',23],[8,'Beijing',11],[9,'Bombay',12]];
  mkTable(db,cx,'OT','WAREHOUSES',[{name:'WAREHOUSE_ID',type:NUMT(),identity:id()},{name:'WAREHOUSE_NAME',type:VC(255)},{name:'LOCATION_ID',type:NUMT(12,0)}],wh,[{name:'PK_WAREHOUSES',k:'P',cols:['WAREHOUSE_ID']},{name:'FK_WAREHOUSES_LOCATIONS',k:'R',cols:['LOCATION_ID'],ref:{t:'LOCATIONS',cols:['LOCATION_ID']},onDelete:'CASCADE'}]);
  /* employees: a small company with a 4-level hierarchy */
  const emp=[[1,'Tommy','Bailey',null,'President'],[2,'Jude','Rivera',1,'Administration Vice President'],[3,'Blake','Cooper',1,'Administration Vice President'],[4,'Louie','Richardson',3,'Programmer'],[5,'Nathan','Cox',4,'Programmer'],[6,'Bobby','Torres',4,'Programmer'],[7,'Charlie','Ward',4,'Programmer'],[8,'Bella','Stone',2,'Finance Manager'],[9,'Ivy','Burns',8,'Accountant'],[10,'Lily','Fisher',8,'Accountant'],[11,'Rose','Stephens',8,'Accountant'],[12,'Isabella','Cole',2,'Accounting Manager'],[13,'Jessica','Woods',12,'Public Accountant'],[14,'Ella','Wallace',2,'Purchasing Manager'],[15,'Ava','Sullivan',14,'Purchasing Clerk'],[16,'Mia','Reynolds',14,'Purchasing Clerk'],[17,'Evie','Harrison',3,'Stock Manager'],[18,'Scarlett','Gibson',17,'Stock Clerk'],[19,'Grace','Ellis',17,'Stock Clerk'],[20,'Chloe','Mcdonald',17,'Shipping Clerk'],[21,'Freya','Barnes',3,'Human Resources Representative'],[22,'Sophia','Lewis',1,'Sales Manager'],[23,'Amelia','Myers',22,'Sales Manager'],[24,'Olivia','Mills',22,'Sales Representative'],[25,'Emily','Hunt',22,'Sales Representative'],[26,'Poppy','Holmes',23,'Sales Representative'],[27,'Daisy','Ortiz',23,'Sales Representative'],[28,'Ruby','Kelly',23,'Sales Representative'],[29,'Alice','Brown',22,'Sales Representative'],[30,'Phoebe','Rice',23,'Sales Representative'],[31,'Matilda','Hart',17,'Stock Clerk'],[32,'Florence','Cruz',3,'Marketing Manager'],[33,'Sienna','Grant',32,'Marketing Representative'],[34,'Harriet','Lane',3,'Public Relations Representative'],[35,'Elsie','Flores',2,'Accounting Manager']];
  const hire=[[2016,6,17],[2016,9,21],[2016,1,13],[2016,1,3],[2016,5,21],[2016,6,25],[2016,2,5],[2016,8,16],[2016,8,17],[2016,9,28],[2016,9,30],[2016,3,7],[2016,6,7],[2016,7,7],[2016,5,18],[2016,12,24],[2016,7,24],[2016,5,1],[2016,10,10],[2016,3,16],[2016,6,7],[2016,10,1],[2016,1,5],[2016,3,10],[2016,3,11],[2016,1,24],[2016,2,23],[2016,1,30],[2016,3,4],[2016,8,1],[2016,4,10],[2016,2,17],[2016,8,17],[2016,6,7],[2016,6,7]];
  const empRows=emp.map((e,i)=>{const h=hire[i];return[e[0],e[1],e[2],e[1].toLowerCase()+'.'+e[2].toLowerCase()+'@example.com','515.'+String(123+i*7).slice(-3)+'.'+String(4567+i*131).slice(-4),D8(h[0],h[1],h[2]),e[3],e[4]];});
  mkTable(db,cx,'OT','EMPLOYEES',[{name:'EMPLOYEE_ID',type:NUMT(),identity:id()},{name:'FIRST_NAME',type:VC(255)},{name:'LAST_NAME',type:VC(255)},{name:'EMAIL',type:VC(255)},{name:'PHONE',type:VC(50)},{name:'HIRE_DATE',type:T_('DATE')},{name:'MANAGER_ID',type:NUMT(12,0)},{name:'JOB_TITLE',type:VC(255)}],empRows,
    [{name:'PK_EMPLOYEES',k:'P',cols:['EMPLOYEE_ID']},{k:'N',cols:['FIRST_NAME']},{k:'N',cols:['LAST_NAME']},{k:'N',cols:['EMAIL']},{k:'N',cols:['PHONE']},{k:'N',cols:['HIRE_DATE']},{k:'N',cols:['JOB_TITLE']},{name:'FK_EMPLOYEES_MANAGER',k:'R',cols:['MANAGER_ID'],ref:{t:'EMPLOYEES',cols:['EMPLOYEE_ID']},onDelete:'CASCADE'}]);
  mkTable(db,cx,'OT','PRODUCT_CATEGORIES',[{name:'CATEGORY_ID',type:NUMT(),identity:id()},{name:'CATEGORY_NAME',type:VC(255)}],[[1,'CPU'],[2,'Video Card'],[3,'RAM'],[4,'Mother Board'],[5,'Storage']],[{name:'PK_PRODUCT_CATEGORIES',k:'P',cols:['CATEGORY_ID']},{k:'N',cols:['CATEGORY_NAME']}]);
  const prod=[
    [1,'Intel Xeon E5-2699 V3 (OEM/Tray)','Speed:2.3GHz,Cores:18,TDP:145W',2867.51,3410.46],[1,'Intel Xeon E5-2697 V4','Speed:2.3GHz,Cores:18,TDP:145W',2144.4,2554.99],[1,'Intel Xeon E5-2698 V4 (OEM/Tray)','Speed:2.2GHz,Cores:20,TDP:135W',2777.35,3144.89],[1,'Intel Core i7-6950X','Speed:3.0GHz,Cores:10,TDP:140W',1479.9,1723.99],[1,'Intel Core i7-5930K','Speed:3.5GHz,Cores:6,TDP:140W',424.42,494.99],[1,'AMD Ryzen 7 1800X','Speed:3.6GHz,Cores:8,TDP:95W',385.9,439.99],[1,'AMD Opteron 6378','Speed:2.4GHz,Cores:16,TDP:115W',445.13,529.3],[1,'Intel Core i5-7600K','Speed:3.8GHz,Cores:4,TDP:91W',205.99,239.99],[1,'AMD FX-8350','Speed:4.0GHz,Cores:8,TDP:125W',129.99,159.99],[1,'Intel Core i9-7900X','Speed:3.3GHz,Cores:10,TDP:140W',849.0,989.99],
    [2,'PNY VCQM6000-PB','Chipset:Quadro M6000,Memory:12GB',3876.4,4139.0],[2,'Nvidia GeForce GTX 1080 Ti','Chipset:GTX 1080 Ti,Memory:11GB',648.0,749.99],[2,'MSI GTX 1070 Gaming X','Chipset:GTX 1070,Memory:8GB',366.19,429.99],[2,'EVGA GeForce GTX 1060 SC','Chipset:GTX 1060,Memory:6GB',229.0,269.99],[2,'Sapphire Radeon RX 580 Nitro+','Chipset:RX 580,Memory:8GB',224.0,264.99],[2,'Asus ROG Strix GTX 1080','Chipset:GTX 1080,Memory:8GB',519.0,599.99],[2,'Gigabyte Radeon RX 570','Chipset:RX 570,Memory:4GB',149.0,174.99],[2,'Zotac GeForce GT 1030','Chipset:GT 1030,Memory:2GB',64.99,79.99],
    [3,'Corsair Vengeance LPX 16GB','Speed:DDR4-3200,Modules:2x8GB',104.99,134.99],[3,'G.Skill Trident Z RGB 32GB','Speed:DDR4-3600,Modules:4x8GB',249.99,309.99],[3,'Kingston HyperX Fury 8GB','Speed:DDR4-2400,Modules:1x8GB',49.99,64.99],[3,'Crucial Ballistix Sport 16GB','Speed:DDR4-2666,Modules:2x8GB',89.99,114.99],[3,'Corsair Dominator Platinum 64GB','Speed:DDR4-3000,Modules:8x8GB',519.99,629.99],[3,'Samsung 32GB DDR4 ECC','Speed:DDR4-2400,Modules:1x32GB',219.0,269.0],[3,'Patriot Viper Elite 16GB','Speed:DDR4-2666,Modules:2x8GB',79.99,99.99],
    [4,'Asus ROG Maximus IX Hero','Socket:LGA1151,Form Factor:ATX',199.99,239.99],[4,'Gigabyte GA-X99-UD4','Socket:LGA2011-3,Form Factor:ATX',179.0,209.99],[4,'MSI X370 Gaming Pro Carbon','Socket:AM4,Form Factor:ATX',139.99,169.99],[4,'ASRock Z270 Taichi','Socket:LGA1151,Form Factor:ATX',169.99,199.99],[4,'Supermicro X10DRi','Socket:LGA2011-3,Form Factor:E-ATX',409.0,489.0],[4,'Asus Prime B350-Plus','Socket:AM4,Form Factor:ATX',79.99,99.99],[4,'Gigabyte GA-AB350M','Socket:AM4,Form Factor:Micro ATX',64.99,79.99],
    [5,'Samsung 850 EVO 1TB','Capacity:1TB,Interface:SATA',279.99,329.99],[5,'Western Digital Black 4TB','Capacity:4TB,Interface:SATA,RPM:7200',189.99,229.99],[5,'Seagate Barracuda 2TB','Capacity:2TB,Interface:SATA,RPM:7200',59.99,74.99],[5,'Samsung 960 Pro 512GB','Capacity:512GB,Interface:M.2 NVMe',269.99,309.99],[5,'Kingston SSDNow A400 480GB','Capacity:480GB,Interface:SATA',129.0,159.0],[5,'Crucial MX300 525GB','Capacity:525GB,Interface:SATA',119.99,144.99],[5,'Intel 750 Series 1.2TB','Capacity:1.2TB,Interface:PCIe NVMe',599.0,699.0],[5,'Toshiba X300 6TB','Capacity:6TB,Interface:SATA,RPM:7200',179.99,214.99],[5,'Western Digital Red 8TB','Capacity:8TB,Interface:SATA,RPM:5400',249.99,299.99],[5,'Hitachi Ultrastar 4TB',null,159.0,189.0]];
  const prodRows=prod.map((p,i)=>[i+1,p[1],p[2],p[3],p[4],p[0]]);
  mkTable(db,cx,'OT','PRODUCTS',[{name:'PRODUCT_ID',type:NUMT(),identity:id()},{name:'PRODUCT_NAME',type:VC(255)},{name:'DESCRIPTION',type:VC(2000)},{name:'STANDARD_COST',type:NUMT(9,2)},{name:'LIST_PRICE',type:NUMT(9,2)},{name:'CATEGORY_ID',type:NUMT()}],prodRows,
    [{name:'PK_PRODUCTS',k:'P',cols:['PRODUCT_ID']},{k:'N',cols:['PRODUCT_NAME']},{k:'N',cols:['CATEGORY_ID']},{name:'FK_PRODUCTS_CATEGORIES',k:'R',cols:['CATEGORY_ID'],ref:{t:'PRODUCT_CATEGORIES',cols:['CATEGORY_ID']},onDelete:'CASCADE'}]);
  const cust=[['Raytheon','514 W Superior St, Kokomo, IN','http://www.raytheon.com',100],['Plains GP Holdings','2515 Bloyd Ave, Indianapolis, IN','http://www.plainsallamerican.com',100],['US Foods Holding','8768 N State Rd 37, Bloomington, IN','http://www.usfoods.com',100],['AutoNation','6445 Bay Harbor Ln, Indianapolis, IN','http://www.autonation.com',100],['Centene','4019 W 3Rd St, Bloomington, IN','http://www.centene.com',100],['Jabil Circuit','1608 Portage Ave, South Bend, IN','http://www.jabil.com',100],['CHS','23943 Sr 37, Lakeville, IN','http://www.chsinc.com',100],['Progressive','12917 Ellinger Rd, Lakeville, IN','http://www.progressive.com',100],
    ['General Mills','2500 Stimpson St, Cincinnati, OH','http://www.generalmills.com',500],['Kraft Heinz','3115 Westland Dr, Fort Wayne, IN','http://www.kraftheinzcompany.com',500],['Abbott Laboratories','4019 Ponte Vedra Cir, Fort Wayne, IN','http://www.abbott.com',1200],['Aflac','1 Aflac Ctr, Columbus, GA','http://www.aflac.com',700],['Alcoa','201 Isabella St, Pittsburgh, PA','http://www.alcoa.com',1500],['Altria Group','6601 W Broad St, Richmond, VA','http://www.altria.com',1300],['American Express','200 Vesey St, New York, NY','http://www.americanexpress.com',3500],['Amgen','1 Amgen Center Dr, Thousand Oaks, CA','http://www.amgen.com',2400],
    ['Aramark','1101 Market St, Philadelphia, PA','http://www.aramark.com',900],['AT&T','208 S Akard St, Dallas, TX','http://www.att.com',5000],['Bank of America','100 N Tryon St, Charlotte, NC','http://www.bankofamerica.com',5000],['Baxter International','1 Baxter Pkwy, Deerfield, IL','http://www.baxter.com',1100],['Best Buy','7601 Penn Ave S, Richfield, MN','http://www.bestbuy.com',2800],['Boeing','100 N Riverside Plz, Chicago, IL','http://www.boeing.com',4800],['Capital One','1680 Capital One Dr, McLean, VA','http://www.capitalone.com',2900],['Caterpillar','100 NE Adams St, Peoria, IL','http://www.caterpillar.com',3600],
    ['Chevron','6001 Bollinger Canyon Rd, San Ramon, CA','http://www.chevron.com',4500],['Cisco Systems','170 W Tasman Dr, San Jose, CA','http://www.cisco.com',3900],['Citigroup','388 Greenwich St, New York, NY','http://www.citigroup.com',5000],['Coca-Cola','1 Coca-Cola Plz, Atlanta, GA','http://www.coca-colacompany.com',3100],['Comcast','1701 John F Kennedy Blvd, Philadelphia, PA','http://www.comcastcorporation.com',2700],['Costco Wholesale','999 Lake Dr, Issaquah, WA','http://www.costco.com',3300],['CVS Health','1 CVS Dr, Woonsocket, RI','http://www.cvshealth.com',3000],['Deere','1 John Deere Pl, Moline, IL','http://www.deere.com',2100],
    ['Delta Air Lines','1030 Delta Blvd, Atlanta, GA','http://www.delta.com',1900],['Dow Chemical','2030 Dow Ctr, Midland, MI','http://www.dow.com',2600],['eBay','2025 Hamilton Ave, San Jose, CA','http://www.ebay.com',1400],['Exxon Mobil','5959 Las Colinas Blvd, Irving, TX','http://www.exxonmobil.com',5000],['FedEx','942 S Shady Grove Rd, Memphis, TN','http://www.fedex.com',2300],['Ford Motor','1 American Rd, Dearborn, MI','http://www.ford.com',4100],['General Electric','41 Farnsworth St, Boston, MA','http://www.ge.com',4400],['General Motors','300 Renaissance Ctr, Detroit, MI','http://www.gm.com',4200],
    ['Goldman Sachs Group','200 West St, New York, NY','http://www.gs.com',3800],['Home Depot','2455 Paces Ferry Rd, Atlanta, GA','http://www.homedepot.com',3700],['Honeywell International','115 Tabor Rd, Morris Plains, NJ','http://www.honeywell.com',2500],['HP','1501 Page Mill Rd, Palo Alto, CA','http://www.hp.com',2200],['IBM','1 New Orchard Rd, Armonk, NY','http://www.ibm.com',4000],['Intel','2200 Mission College Blvd, Santa Clara, CA','http://www.intel.com',3400],['Johnson & Johnson','1 Johnson & Johnson Plz, New Brunswick, NJ','http://www.jnj.com',3200],['JPMorgan Chase','270 Park Ave, New York, NY','http://www.jpmorganchase.com',5000],
    ['Kroger','1014 Vine St, Cincinnati, OH','http://www.thekrogerco.com',1600],['Lockheed Martin','6801 Rockledge Dr, Bethesda, MD','http://www.lockheedmartin.com',3000],['Lowe\'s','1000 Lowes Blvd, Mooresville, NC','http://www.lowes.com',2000],['Microsoft','1 Microsoft Way, Redmond, WA','http://www.microsoft.com',5000],['Nike','1 SW Bowerman Dr, Beaverton, OR','http://www.nike.com',1800],['Oracle','500 Oracle Pkwy, Redwood City, CA','http://www.oracle.com',4600],['PepsiCo','700 Anderson Hill Rd, Purchase, NY','http://www.pepsico.com',2900],['Pfizer','235 E 42nd St, New York, NY','http://www.pfizer.com',3500],
    ['Procter & Gamble','1 Procter & Gamble Plz, Cincinnati, OH','http://www.pg.com',3600],['Target','1000 Nicollet Mall, Minneapolis, MN','http://www.target.com',2400],['United Parcel Service','55 Glenlake Pkwy NE, Atlanta, GA','http://www.ups.com',2700],['Walmart','702 SW 8th St, Bentonville, AR','http://www.walmart.com',5000],['Wells Fargo','420 Montgomery St, San Francisco, CA','http://www.wellsfargo.com',4900],['NextEra Energy',null,'http://www.nexteraenergy.com',null],['Tesla',null,null,null]];
  const custRows=cust.map((c,i)=>[i+1,c[0],c[1],c[2],c[3]]);
  mkTable(db,cx,'OT','CUSTOMERS',[{name:'CUSTOMER_ID',type:NUMT(),identity:id()},{name:'NAME',type:VC(255)},{name:'ADDRESS',type:VC(255)},{name:'WEBSITE',type:VC(255)},{name:'CREDIT_LIMIT',type:NUMT(8,2)}],custRows,[{name:'PK_CUSTOMERS',k:'P',cols:['CUSTOMER_ID']},{k:'N',cols:['NAME']}]);
  const fn=['Flor','Lavera','Shyla','Jeni','Kathleen','Haley','Reggie','Shelia','Tiana','Dewitt','Louise','Arnold','Doretha','Tammi','Norma','Phebe','Christine','Shelly','Gaynell','Chase','Lyndsey','Agustina','Fernanda','Toby','Marshall','Clint','Cary','Ivonne','Jesusa','Shanon','Keira','Buck','Rubie','Merlene','Kenyetta','Manuel','Fatima','Kendall','Lorena','Bari','Pearlene','Rachell','Sue','Ozella','Stephen','Lera','Angelo','Kerri','Johnny','Ruth','Rosaline','Alessandra','Carmelia','Meri','Wenona','Lilla','Laure','Jaimee','Lilly','Monica','Mira','Barney','Elinor'];
  const ln=['Stone','Emerson','Ortiz','Levy','Wilkerson','Mclaughlin','Simon','Lamb','Mcbride','Sharpe','Pratt','Rogers','Dunn','Brooks','Simpson','Holmes','Hampton','Howard','Barrett','Ward','Nelson','Cohen','Medina','Holt','Rosales','Mcgee','Pearson','Mason','Morales','Snow','Gordon','Porter','Watts','Farmer','Harmon','Mendez','Reese','Ellison','Hughes','Peters','Kerr','Rice','Avery','Luna','Hayes','Swanson','Fleming','Hall','Riley','Vargas','Fox','Quinn','Holloway','Bowen','Wade','Garner','Lowe','Mccall','Carey','Ramsey','Duke','Sims','Pace'];
  const conRows=custRows.map((c,i)=>{const f=fn[i%fn.length],l=ln[(i*7)%ln.length];return[i+1,f,l,f.toLowerCase()+'.'+l.toLowerCase()+'@'+String(c[1]).toLowerCase().replace(/[^a-z]/g,'').slice(0,12)+'.com','+1 317 '+String(123+i*37).slice(-3)+' '+String(1000+i*313).slice(-4),c[0]];});
  mkTable(db,cx,'OT','CONTACTS',[{name:'CONTACT_ID',type:NUMT(),identity:id()},{name:'FIRST_NAME',type:VC(255)},{name:'LAST_NAME',type:VC(255)},{name:'EMAIL',type:VC(255)},{name:'PHONE',type:VC(20)},{name:'CUSTOMER_ID',type:NUMT()}],conRows,
    [{name:'PK_CONTACTS',k:'P',cols:['CONTACT_ID']},{k:'N',cols:['FIRST_NAME']},{k:'N',cols:['LAST_NAME']},{k:'N',cols:['EMAIL']},{name:'FK_CONTACTS_CUSTOMERS',k:'R',cols:['CUSTOMER_ID'],ref:{t:'CUSTOMERS',cols:['CUSTOMER_ID']},onDelete:'CASCADE'}]);
  const salesmen=[24,25,26,27,28,29,30,null,null];const ordRows=[];
  for(let i=1;i<=105;i++){const cid=1+Math.floor(Math.pow(R(),1.25)*(custRows.length-3));const y=pick([2015,2016,2016,2017,2017,2017]);const m=between(1,12),d=between(1,28);
    const st=y===2017&&m>=10?pick(['Pending','Pending','Shipped','Canceled']):pick(['Shipped','Shipped','Shipped','Shipped','Canceled','Pending']);ordRows.push([i,cid,st,st==='Pending'&&R()<.5?null:pick(salesmen),D8(y,m,d)]);}
  mkTable(db,cx,'OT','ORDERS',[{name:'ORDER_ID',type:NUMT(),identity:id()},{name:'CUSTOMER_ID',type:NUMT(6,0)},{name:'STATUS',type:VC(20)},{name:'SALESMAN_ID',type:NUMT(6,0)},{name:'ORDER_DATE',type:T_('DATE')}],ordRows,
    [{name:'PK_ORDERS',k:'P',cols:['ORDER_ID']},{k:'N',cols:['CUSTOMER_ID']},{k:'N',cols:['STATUS']},{k:'N',cols:['ORDER_DATE']},{name:'FK_ORDERS_CUSTOMERS',k:'R',cols:['CUSTOMER_ID'],ref:{t:'CUSTOMERS',cols:['CUSTOMER_ID']},onDelete:'CASCADE'},{name:'FK_ORDERS_EMPLOYEES',k:'R',cols:['SALESMAN_ID'],ref:{t:'EMPLOYEES',cols:['EMPLOYEE_ID']},onDelete:'SET NULL'}]);
  const itemRows=[];for(const o of ordRows){const n=between(1,5);const used=new Set();for(let k=1;k<=n;k++){let p;do{p=between(1,prodRows.length);}while(used.has(p));used.add(p);itemRows.push([o[0],k,p,between(2,15)*10,prodRows[p-1][4]]);}}
  mkTable(db,cx,'OT','ORDER_ITEMS',[{name:'ORDER_ID',type:NUMT(12,0)},{name:'ITEM_ID',type:NUMT(12,0)},{name:'PRODUCT_ID',type:NUMT(12,0)},{name:'QUANTITY',type:NUMT(8,2)},{name:'UNIT_PRICE',type:NUMT(8,2)}],itemRows,
    [{name:'PK_ORDER_ITEMS',k:'P',cols:['ORDER_ID','ITEM_ID']},{k:'N',cols:['PRODUCT_ID']},{k:'N',cols:['QUANTITY']},{k:'N',cols:['UNIT_PRICE']},{name:'FK_ORDER_ITEMS_PRODUCTS',k:'R',cols:['PRODUCT_ID'],ref:{t:'PRODUCTS',cols:['PRODUCT_ID']},onDelete:'CASCADE'},{name:'FK_ORDER_ITEMS_ORDERS',k:'R',cols:['ORDER_ID'],ref:{t:'ORDERS',cols:['ORDER_ID']},onDelete:'CASCADE'}]);
  const invRows=[];for(const p of prodRows){const ws=new Set();const n=between(1,4);while(ws.size<n)ws.add(between(1,9));[...ws].sort((a,b)=>a-b).forEach(w=>invRows.push([p[0],w,between(0,30)*10+between(0,9)]));}
  mkTable(db,cx,'OT','INVENTORIES',[{name:'PRODUCT_ID',type:NUMT(12,0)},{name:'WAREHOUSE_ID',type:NUMT(12,0)},{name:'QUANTITY',type:NUMT(8,0)}],invRows,
    [{name:'PK_INVENTORIES',k:'P',cols:['PRODUCT_ID','WAREHOUSE_ID']},{k:'N',cols:['QUANTITY']},{name:'FK_INVENTORIES_PRODUCTS',k:'R',cols:['PRODUCT_ID'],ref:{t:'PRODUCTS',cols:['PRODUCT_ID']},onDelete:'CASCADE'},{name:'FK_INVENTORIES_WAREHOUSES',k:'R',cols:['WAREHOUSE_ID'],ref:{t:'WAREHOUSES',cols:['WAREHOUSE_ID']},onDelete:'CASCADE'}]);
}
function newDb(osTZ,remote){
  const db={inst:'OPEN',listener:true,recovery:false,ts:{},defaultTs:'USERS',defaultTemp:'TEMP',deletedFiles:{},users:{},roles:{},profiles:{DEFAULT:{name:'DEFAULT',limits:{}}},
    objs:{},idx:{},trigs:{},pubSyn:{},objPrivs:[],links:{},dirs:{},dirPrivs:[],osFiles:{},remote:{},nextUserId:140,sysc:8400,nextOid:74000,fileSeq:12,osTZ:osTZ||'+00:00',bin:[]};
  const addTs=(name,type,file,size,used,id)=>{db.ts[name]={name,type,big:false,status:'ONLINE',group:null,files:[{name:file,size,auto:true,next:type==='TEMPORARY'?1:5,max:32767,id}],baseUsed:used};};
  addTs('SYSTEM','PERMANENT','/opt/oracle/oradata/FREE/system01.dbf',870,860,1);addTs('SYSAUX','PERMANENT','/opt/oracle/oradata/FREE/sysaux01.dbf',560,540,3);
  addTs('UNDOTBS1','UNDO','/opt/oracle/oradata/FREE/undotbs01.dbf',120,20,4);addTs('USERS','PERMANENT','/opt/oracle/oradata/FREE/users01.dbf',5,1,7);db.ts.USERS.files[0].next=1.25;
  addTs('TEMP','TEMPORARY','/opt/oracle/oradata/FREE/temp01.dbf',36,0,1);
  const created=new DT('DATE',mkSY(2024,3,8,9,30,0),0);
  const mkUser=(name,pw,o)=>{db.users[name]=Object.assign({name,pw,id:db.nextUserId++,status:'OPEN',profile:'DEFAULT',dts:'USERS',tts:'TEMP',quotas:{},privs:{},roles:{},defaultRoles:'ALL',failed:0,created},o||{});};
  db.roles.CONNECT={name:'CONNECT',pw:null,privs:{'CREATE SESSION':{admin:false},'SET CONTAINER':{admin:false}},roles:{}};
  db.roles.RESOURCE={name:'RESOURCE',pw:null,privs:{'CREATE TABLE':{admin:false},'CREATE SEQUENCE':{admin:false},'CREATE PROCEDURE':{admin:false},'CREATE TRIGGER':{admin:false},'CREATE TYPE':{admin:false}},roles:{}};
  db.roles.DBA={name:'DBA',pw:null,privs:{},roles:{},all:true};
  db.roles.SELECT_CATALOG_ROLE={name:'SELECT_CATALOG_ROLE',pw:null,privs:{'SELECT ANY DICTIONARY':{admin:false}},roles:{}};
  const cx={db,sess:{user:'SYS',sysdba:true,roles:new Set(),nls:Object.assign({},DEFAULT_NLS)}};
  if(remote){mkUser('BOB','oracle',{privs:{'CREATE SESSION':{admin:false},'UNLIMITED TABLESPACE':{admin:false},'CREATE TABLE':{admin:false}}});
    mkTable(db,cx,'BOB','CUSTOMERS',[{name:'CUSTOMER_ID',type:NUMT()},{name:'NAME',type:VC(100)},{name:'EMAIL',type:VC(100)}],[[1,'ABC Corp','info@abc.example'],[2,'Bharat Traders','sales@bharat.example'],[3,'Gulf Supplies','hello@gulf.example']],[{name:'PK_BOB_CUSTOMERS',k:'P',cols:['CUSTOMER_ID']}]);
    return db;}
  mkUser('SYS','oracle',{id:0,dts:'SYSTEM',all:true});
  mkUser('SYSTEM','oracle',{id:9,dts:'SYSTEM',roles:{DBA:{admin:true,def:true}}});
  mkUser('OT','oracle',{id:134,roles:{DBA:{admin:false,def:true},CONNECT:{admin:false,def:true},RESOURCE:{admin:false,def:true}},privs:{'UNLIMITED TABLESPACE':{admin:false}},created:new DT('DATE',mkSY(2024,3,8,10,0,0),0)});
  mkUser('ALICE','oracle',{id:136,status:'LOCKED',privs:{'CREATE SESSION':{admin:false}}});
  seedOT(db,cx);
  db.remote.SALES=newDb(osTZ,true);
  return db;
}

/* ===== data dictionary views ===== */
function dictOK(cx){return isSysdba(cx)||hasPriv(cx,'SELECT ANY DICTIONARY');}
function D(cols,rows){return{cols,rows,types:null};}
function tsize(t){return t?typeStr(t):'';}
function dataTypeName(t){if(!t)return'';if(t.base==='NUMBER'&&t.int)return'NUMBER';if(/^TIMESTAMP/.test(t.base))return t.base.replace('TIMESTAMP','TIMESTAMP('+t.fp+')');if(/^INTERVAL/.test(t.base))return typeStr(t);return t.base;}
function dataLen(t){if(!t)return null;if(t.len!=null)return t.base[0]==='N'?t.len*2:t.len;if(t.base==='NUMBER'||t.base==='FLOAT')return 22;if(t.base==='DATE')return 7;if(/^TIMESTAMP/.test(t.base))return t.base==='TIMESTAMP'?11:13;if(t.base==='CLOB'||t.base==='BLOB')return 4000;return null;}
function tablesOf(cx,filter){return Object.values(cx.db.objs).filter(o=>o.type==='TABLE'&&filter(o));}
function srcLines(o){return String(o.src||'').split('\n');}
const PLSQL_TYPES=['PROCEDURE','FUNCTION','PACKAGE','PACKAGE BODY','TRIGGER','TYPE','TYPE BODY'];
function dictView(name,cx){
  const db=cx.db;const me=curSchema(cx);const n=name;
  const scope=n.startsWith('USER_')?'U':n.startsWith('ALL_')?'A':n.startsWith('DBA_')?'D':null;
  if(scope==='D'&&!dictOK(cx)&&!['DBA_USERS'].includes(n)&&!(cx.sess.user==='SYSTEM'))throw E('ORA-00942','table or view does not exist',[hint('DBA_ views sirf DBA dekh sakta hai. Apne objects ke liye USER_ views use karo (jaise USER_TABLES).')]);
  if(scope==='D'&&!dictOK(cx))throw E('ORA-00942','table or view does not exist',[hint('DBA_ views ke liye DBA role ya SELECT ANY DICTIONARY chahiye.')]);
  const vis=o=>scope==='U'?o.owner===me:scope==='A'?(o.owner===me||canSeeObj(o,cx)):true;
  const own=(row,o)=>scope==='U'?row:[o.owner].concat(row);
  const ocol=c=>scope==='U'?c:['OWNER'].concat(c);
  const base=n.replace(/^(USER|ALL|DBA)_/,'');
  if(n==='DUAL')return D(['DUMMY'],[['X']]);
  if(n==='TAB')return D(['TNAME','TABTYPE','CLUSTERID'],Object.values(db.objs).filter(o=>o.owner===me&&(o.type==='TABLE'||o.type==='VIEW'||o.type==='SYNONYM')).map(o=>[o.name,o.type,null]));
  if(n==='CAT')return D(['TABLE_NAME','TABLE_TYPE'],Object.values(db.objs).filter(o=>o.owner===me&&['TABLE','VIEW','SYNONYM','SEQUENCE'].includes(o.type)).map(o=>[o.name,o.type]));
  if(n==='TABS')return dictView('USER_TABLES',cx);
  if(n==='OBJ')return dictView('USER_OBJECTS',cx);
  if(n==='DICTIONARY'||n==='DICT')return D(['TABLE_NAME','COMMENTS'],DICT_LIST.map(x=>[x[0],x[1]]));
  if(n==='RECYCLEBIN'||n==='USER_RECYCLEBIN'||n==='DBA_RECYCLEBIN')return D(n==='DBA_RECYCLEBIN'?['OWNER','OBJECT_NAME','ORIGINAL_NAME','OPERATION','TYPE','DROPTIME','CAN_UNDROP']:['OBJECT_NAME','ORIGINAL_NAME','OPERATION','TYPE','DROPTIME','CAN_UNDROP'],(db.bin||[]).filter(b=>n==='DBA_RECYCLEBIN'||b.owner===me).map(b=>(n==='DBA_RECYCLEBIN'?[b.owner]:[]).concat([b.bn,b.orig,'DROP','TABLE',b.when,'YES'])));
  if(n==='NLS_SESSION_PARAMETERS'||n==='V$NLS_PARAMETERS'||n==='NLS_DATABASE_PARAMETERS'){const s=cx.sess.nls;return D(['PARAMETER','VALUE'],[['NLS_LANGUAGE','AMERICAN'],['NLS_TERRITORY','AMERICA'],['NLS_CURRENCY',s.currency],['NLS_NUMERIC_CHARACTERS','.,'],['NLS_CALENDAR','GREGORIAN'],['NLS_DATE_FORMAT',n==='NLS_DATABASE_PARAMETERS'?'DD-MON-RR':s.dateFmt],['NLS_DATE_LANGUAGE','AMERICAN'],['NLS_SORT','BINARY'],['NLS_TIMESTAMP_FORMAT',s.tsFmt],['NLS_TIMESTAMP_TZ_FORMAT',s.tstzFmt],['NLS_TIME_FORMAT','HH.MI.SSXFF AM'],['NLS_COMP','BINARY'],['NLS_CHARACTERSET','AL32UTF8'],['NLS_LENGTH_SEMANTICS','BYTE']]);}
  if(n==='V$TIMEZONE_NAMES')return D(['TZNAME','TZABBREV','CON_ID'],TZ_NAMES.map(x=>[x[0],x[1],0]));
  if(n==='V$VERSION'||n==='PRODUCT_COMPONENT_VERSION')return D(['BANNER','BANNER_FULL','CON_ID'],[['Oracle Database 23ai Free Release 23.0.0.0.0 - Develop, Learn, and Run for Free','Oracle Database 23ai Free (in-browser simulator)',0]]);
  if(n==='V$INSTANCE')return D(['INSTANCE_NAME','HOST_NAME','VERSION','STATUS','DATABASE_STATUS','STARTUP_TIME'],[['FREE','oracle-sim','23.0.0.0.0',db.inst==='NOMOUNT'?'STARTED':db.inst==='MOUNTED'?'MOUNTED':'OPEN','ACTIVE',db.startTime||today(cx)]]);
  if(n==='V$DATABASE')return D(['NAME','OPEN_MODE','LOG_MODE','DBTIMEZONE'],[['FREE',db.inst==='OPEN'?'READ WRITE':'MOUNTED','NOARCHIVELOG',cx.sess.nls.dbtz]]);
  if(n==='V$SESSION')return D(['SID','SERIAL#','USERNAME','STATUS','PROGRAM'],[[42,1001,cx.sess.user,'ACTIVE','sqlplus@browser']]);
  if(n==='V$PARAMETER')return D(['NAME','VALUE'],[['db_name','FREE'],['processes','320'],['sga_target','2432M'],['pga_aggregate_target','800M'],['compatible','23.0.0'],['undo_tablespace','UNDOTBS1'],['max_string_size','STANDARD']]);
  if(n==='V$SGA')return D(['NAME','VALUE'],[['Fixed Size',3835304],['Variable Size',738200152],['Database Buffers',1795162112],['Redo Buffers',12939264]]);
  if(n==='V$TABLESPACE')return D(['TS#','NAME'],Object.values(db.ts).map((t,i)=>[i,t.name]));
  if(n==='V$DATAFILE')return D(['FILE#','NAME','STATUS','BYTES'],Object.values(db.ts).filter(t=>t.type!=='TEMPORARY').flatMap(t=>t.files.map(f=>[f.id||1,f.name,t.status==='OFFLINE'?'OFFLINE':'ONLINE',Math.round(f.size*1048576)])));
  if(n==='V$CONTROLFILE')return D(['NAME'],[['/opt/oracle/oradata/FREE/control01.ctl'],['/opt/oracle/oradata/FREE/control02.ctl']]);
  if(n==='V$LOGFILE')return D(['GROUP#','MEMBER'],[[1,'/opt/oracle/oradata/FREE/redo01.log'],[2,'/opt/oracle/oradata/FREE/redo02.log'],[3,'/opt/oracle/oradata/FREE/redo03.log']]);
  if(n==='V$BGPROCESS')return D(['NAME','DESCRIPTION'],[['PMON','process cleanup'],['SMON','System Monitor Process'],['DBW0','db writer process 0'],['LGWR','Redo etc.'],['CKPT','checkpoint'],['MMON','Manageability Monitor Process'],['RECO','distributed recovery']]);
  if(n==='DATABASE_PROPERTIES')return D(['PROPERTY_NAME','PROPERTY_VALUE','DESCRIPTION'],[['DEFAULT_TEMP_TABLESPACE',db.defaultTemp,'Name of default temporary tablespace'],['DEFAULT_PERMANENT_TABLESPACE',db.defaultTs,'Name of default permanent tablespace'],['GLOBAL_DB_NAME','FREEPDB1','Global database name'],['DBTIMEZONE',cx.sess.nls.dbtz,'DB time zone']]);
  if(n==='SESSION_ROLES')return D(['ROLE'],[...activeRoles(cx)].map(r=>[r]));
  if(n==='SESSION_PRIVS'){const ps=hasAll(cx)?SYS_PRIVS.filter(p=>p!=='SYSDBA'&&p!=='SYSOPER'):SYS_PRIVS.filter(p=>hasPriv(cx,p));return D(['PRIVILEGE'],ps.map(p=>[p]));}
  if(n==='ROLE_SYS_PRIVS')return D(['ROLE','PRIVILEGE','ADMIN_OPTION'],[...activeRoles(cx)].flatMap(r=>Object.keys(db.roles[r].privs).map(p=>[r,p,db.roles[r].privs[p].admin?'YES':'NO'])));
  if(n==='ROLE_TAB_PRIVS')return D(['ROLE','OWNER','TABLE_NAME','PRIVILEGE','GRANTABLE'],db.objPrivs.filter(o=>db.roles[o.grantee]).map(o=>[o.grantee,o.owner,o.obj,o.priv,o.grantable?'YES':'NO']));
  if(n==='ROLE_ROLE_PRIVS')return D(['ROLE','GRANTED_ROLE','ADMIN_OPTION'],Object.values(db.roles).flatMap(r=>Object.keys(r.roles).map(g=>[r.name,g,r.roles[g].admin?'YES':'NO'])));
  /* tables and columns */
  if(base==='TABLES'&&scope)return D(ocol(['TABLE_NAME','TABLESPACE_NAME','STATUS','NUM_ROWS','TEMPORARY','DURATION','READ_ONLY']),tablesOf(cx,vis).map(o=>own([o.name,o.temp||o.external?null:o.ts,'VALID',o.external?null:tableRows(o,cx).length+(o.virtual||0),o.temp?'Y':'N',o.temp&&o.temp.kind==='GTT'?(o.temp.onCommit==='DELETE'?'SYS$TRANSACTION':'SYS$SESSION'):null,o.readOnly?'YES':'NO'],o)));
  if(base==='EXTERNAL_TABLES'&&scope)return D(ocol(['TABLE_NAME','TYPE_NAME','DEFAULT_DIRECTORY_NAME']),tablesOf(cx,o=>o.external&&vis(o)).map(o=>own([o.name,o.external.type,o.external.dir],o)));
  if((base==='TAB_COLUMNS'||base==='TAB_COLS')&&scope){const rows=[];
    for(const o of Object.values(db.objs)){if(!(o.type==='TABLE'||o.type==='VIEW')||!vis(o))continue;let cols;
      if(o.type==='TABLE')cols=o.cols.filter(c=>base==='TAB_COLS'||(!c.unused));else{try{const r=runQuery(o.query,sub(cx,{schema:o.owner,f:null,stmtCache:new Map()}),{limit:0});cols=(o.cols||r.cols).map((c,i)=>({name:c,type:r.types[i]}));}catch(e){cols=[];}}
      cols.forEach((c,i)=>{const t=c.type||{};const nn=o.type==='TABLE'&&(o.cons.some(k=>(k.k==='N'||k.k==='P')&&!k.disabled&&k.cols.includes(c.name)));
        const r=[o.name,c.name,dataTypeName(t),dataLen(t),t.base==='NUMBER'?t.p:t.base==='FLOAT'?t.p:null,t.base==='NUMBER'?(t.p!=null||t.s!=null?t.s:null):null,nn?'N':'Y',c.unused?null:i+1,c.defText||(c.virtText?c.virtText:null)];
        if(base==='TAB_COLS')r.push(c.virt?'YES':'NO',c.unused||c.invisible?'YES':'NO');r.push(c.identity?'YES':'NO');rows.push(own(r,o));});}
    return D(ocol(['TABLE_NAME','COLUMN_NAME','DATA_TYPE','DATA_LENGTH','DATA_PRECISION','DATA_SCALE','NULLABLE','COLUMN_ID','DATA_DEFAULT'].concat(base==='TAB_COLS'?['VIRTUAL_COLUMN','HIDDEN_COLUMN']:[]).concat(['IDENTITY_COLUMN'])),rows);}
  if(base==='TAB_IDENTITY_COLS'&&scope)return D(ocol(['TABLE_NAME','COLUMN_NAME','GENERATION_TYPE','IDENTITY_OPTIONS']),tablesOf(cx,vis).flatMap(o=>o.cols.filter(c=>c.identity).map(c=>own([o.name,c.name,c.identity.mode,'START WITH: '+(c.identity.start||1)+', INCREMENT BY: '+(c.identity.inc||1)],o))));
  if(base==='CONSTRAINTS'&&scope){const rows=[];for(const o of tablesOf(cx,vis))for(const k of o.cons){const par=k.ref?db.objs[k.ref.key]:null;
      rows.push(own([k.name,k.k==='N'?'C':k.k,o.name,k.k==='N'?'"'+k.cols[0]+'" IS NOT NULL':k.condText||null,par?par.owner:null,k.ref?k.ref.cname:null,k.k==='R'?(k.onDelete||'NO ACTION'):null,k.disabled?'DISABLED':'ENABLED',k.gen?'GENERATED NAME':'USER NAME',(k.k==='P'||k.k==='U')?k.name:null],o));}
    for(const v of Object.values(db.objs))if(v.type==='VIEW'&&vis(v)&&(v.check||v.readOnly))rows.push(own([v.checkName||sysName(cx),v.check?'V':'O',v.name,null,null,null,null,'ENABLED','GENERATED NAME',null],v));
    return D(ocol(['CONSTRAINT_NAME','CONSTRAINT_TYPE','TABLE_NAME','SEARCH_CONDITION','R_OWNER','R_CONSTRAINT_NAME','DELETE_RULE','STATUS','GENERATED','INDEX_NAME']),rows);}
  if(base==='CONS_COLUMNS'&&scope){const rows=[];for(const o of tablesOf(cx,vis))for(const k of o.cons)(k.cols||[]).forEach((c,i)=>rows.push(own([k.name,o.name,c,k.k==='P'||k.k==='U'||k.k==='R'?i+1:null],o)));return D(ocol(['CONSTRAINT_NAME','TABLE_NAME','COLUMN_NAME','POSITION']),rows);}
  if(base==='INDEXES'&&scope)return D(ocol(['INDEX_NAME','INDEX_TYPE','TABLE_OWNER','TABLE_NAME','UNIQUENESS','TABLESPACE_NAME','STATUS']),Object.values(db.idx).filter(ix=>scope!=='U'||ix.owner===me).map(ix=>{const t=db.objs[ix.tkey];return own([ix.name,ix.type||'NORMAL',t?t.owner:ix.owner,t?t.name:'',ix.unique?'UNIQUE':'NONUNIQUE',ix.ts||(t&&t.ts)||'USERS','VALID'],ix);}));
  if(base==='IND_COLUMNS'&&scope){const rows=[];for(const ix of Object.values(db.idx)){if(scope==='U'&&ix.owner!==me)continue;const t=db.objs[ix.tkey];ix.cols.forEach((c,i)=>rows.push(own([ix.name,t?t.name:'',c.e.t==='id'?c.e.parts[c.e.parts.length-1]:'SYS_NC000'+(i+10)+'$',i+1,c.desc?'DESC':'ASC'],ix)));}
    return D(ocol(['INDEX_NAME','TABLE_NAME','COLUMN_NAME','COLUMN_POSITION','DESCEND']),rows);}
  if(base==='IND_EXPRESSIONS'&&scope){const rows=[];for(const ix of Object.values(db.idx)){if(scope==='U'&&ix.owner!==me)continue;const t=db.objs[ix.tkey];ix.cols.forEach((c,i)=>{if(c.e.t!=='id')rows.push(own([ix.name,t?t.name:'',c.text.toUpperCase(),i+1],ix));});}return D(ocol(['INDEX_NAME','TABLE_NAME','COLUMN_EXPRESSION','COLUMN_POSITION']),rows);}
  if(base==='VIEWS'&&scope)return D(ocol(['VIEW_NAME','TEXT_LENGTH','TEXT','READ_ONLY']),Object.values(db.objs).filter(o=>o.type==='VIEW'&&vis(o)).map(o=>own([o.name,o.text.length,o.text,o.readOnly?'Y':'N'],o)));
  if(base==='SEQUENCES'&&scope)return D(scope==='U'?['SEQUENCE_NAME','MIN_VALUE','MAX_VALUE','INCREMENT_BY','CYCLE_FLAG','ORDER_FLAG','CACHE_SIZE','LAST_NUMBER']:['SEQUENCE_OWNER','SEQUENCE_NAME','MIN_VALUE','MAX_VALUE','INCREMENT_BY','CYCLE_FLAG','ORDER_FLAG','CACHE_SIZE','LAST_NUMBER'],Object.values(db.objs).filter(o=>o.type==='SEQUENCE'&&vis(o)).map(o=>own([o.name,o.min,o.max,o.inc,o.cycle?'Y':'N',o.order?'Y':'N',o.cache,o.next==null?o.start:o.next],o)));
  if(base==='SYNONYMS'&&scope){const rows=Object.values(db.objs).filter(o=>o.type==='SYNONYM'&&(scope!=='U'?true:o.owner===me)).map(o=>own([o.name,o.target.owner,o.target.name,o.target.link||null],o));
    if(scope!=='U')for(const k in db.pubSyn){const t=db.pubSyn[k];rows.push(['PUBLIC',k,t.owner,t.name,t.link||null]);}return D(ocol(['SYNONYM_NAME','TABLE_OWNER','TABLE_NAME','DB_LINK']),rows);}
  if(base==='OBJECTS'&&scope){const rows=[];for(const o of Object.values(db.objs)){if(!vis(o)&&scope!=='D')continue;if(scope==='A'&&!vis(o))continue;rows.push(own([o.name,o.type,o.oid||0,o.status||'VALID',o.created||null,o.ddl||o.created||null,o.temp?'Y':'N'],o));}
    for(const ix of Object.values(db.idx))if(scope!=='U'||ix.owner===me)rows.push(own([ix.name,'INDEX',0,'VALID',null,null,'N'],ix));
    for(const t of Object.values(db.trigs))if(scope!=='U'||t.owner===me)rows.push(own([t.name,'TRIGGER',t.oid||0,t.status||'VALID',t.created||null,t.created||null,'N'],t));
    return D(ocol(['OBJECT_NAME','OBJECT_TYPE','OBJECT_ID','STATUS','CREATED','LAST_DDL_TIME','TEMPORARY']),rows);}
  if(base==='SOURCE'&&scope){const rows=[];for(const o of Object.values(db.objs).concat(Object.values(db.trigs))){if(!PLSQL_TYPES.includes(o.type)||!(scope!=='U'||o.owner===me))continue;srcLines(o).forEach((l,i)=>rows.push(own([o.name,o.type,i+1,l+'\n'],o)));}return D(ocol(['NAME','TYPE','LINE','TEXT']),rows);}
  if(base==='ERRORS'&&scope){const rows=[];for(const o of Object.values(db.objs).concat(Object.values(db.trigs))){if(!o.errors||!(scope!=='U'||o.owner===me))continue;o.errors.forEach((er,i)=>rows.push(own([o.name,o.type,i+1,er.line,er.col,er.text,'ERROR'],o)));}return D(ocol(['NAME','TYPE','SEQUENCE','LINE','POSITION','TEXT','ATTRIBUTE']),rows);}
  if(base==='TRIGGERS'&&scope)return D(ocol(['TRIGGER_NAME','TRIGGER_TYPE','TRIGGERING_EVENT','TABLE_OWNER','BASE_OBJECT_TYPE','TABLE_NAME','WHEN_CLAUSE','STATUS']),Object.values(db.trigs).filter(t=>scope!=='U'||t.owner===me).map(t=>{const tb=db.objs[t.tkey];return own([t.name,t.compound?'COMPOUND':(t.timing+' '+(t.level==='ROW'?'EACH ROW':'STATEMENT')),t.events.join(' OR '),tb?tb.owner:t.owner,tb?tb.type:'TABLE',tb?tb.name:t.tkey.split('.')[1],t.whenText||null,t.enabled?'ENABLED':'DISABLED'],t);}));
  if(base==='PROCEDURES'&&scope){const rows=[];for(const o of Object.values(db.objs)){if(!['PROCEDURE','FUNCTION','PACKAGE','TRIGGER'].includes(o.type)||!(scope!=='U'||o.owner===me))continue;rows.push(own([o.name,null,o.type],o));if(o.type==='PACKAGE'&&o.spec)for(const m of o.spec.members||[])if(m.k==='proc'||m.k==='func')rows.push(own([o.name,m.name,'PACKAGE'],o));}return D(ocol(['OBJECT_NAME','PROCEDURE_NAME','OBJECT_TYPE']),rows);}
  if(base==='ARGUMENTS'&&scope){const rows=[];for(const o of Object.values(db.objs)){if(!(o.type==='PROCEDURE'||o.type==='FUNCTION')||!(scope!=='U'||o.owner===me))continue;(o.unit&&o.unit.params||[]).forEach((pa,i)=>rows.push(own([o.name,null,pa.name,i+1,pa.type?dataTypeName(pa.type.base?pa.type:{base:'VARCHAR2'}):'',pa.mode],o)));}return D(ocol(['OBJECT_NAME','PACKAGE_NAME','ARGUMENT_NAME','POSITION','DATA_TYPE','IN_OUT']),rows);}
  if(base==='TYPES'&&scope)return D(ocol(['TYPE_NAME','TYPECODE']),Object.values(db.objs).filter(o=>o.type==='TYPE'&&(scope!=='U'||o.owner===me)).map(o=>own([o.name,o.typecode||'COLLECTION'],o)));
  if(base==='UNUSED_COL_TABS'&&scope)return D(ocol(['TABLE_NAME','COUNT']),tablesOf(cx,vis).filter(o=>o.cols.some(c=>c.unused)).map(o=>own([o.name,o.cols.filter(c=>c.unused).length],o)));
  if(base==='TAB_COMMENTS'&&scope)return D(ocol(['TABLE_NAME','TABLE_TYPE','COMMENTS']),Object.values(db.objs).filter(o=>(o.type==='TABLE'||o.type==='VIEW')&&vis(o)).map(o=>own([o.name,o.type,o.comment||null],o)));
  if(base==='COL_COMMENTS'&&scope)return D(ocol(['TABLE_NAME','COLUMN_NAME','COMMENTS']),tablesOf(cx,vis).flatMap(o=>o.cols.map(c=>own([o.name,c.name,c.comment||null],o))));
  if(base==='SEGMENTS'&&scope)return D(ocol(['SEGMENT_NAME','SEGMENT_TYPE','TABLESPACE_NAME','BYTES','BLOCKS']),tablesOf(cx,o=>vis(o)&&!o.external&&!o.temp&&(o.rows.length+(o.virtual||0))>0).map(o=>{const b=Math.max(65536,Math.ceil((o.rows.length+(o.virtual||0))*ROW_KB*1024/65536)*65536);return own([o.name,'TABLE',o.ts,b,b/8192],o);}));
  /* users, privileges */
  if(n==='DBA_USERS')return D(['USERNAME','USER_ID','ACCOUNT_STATUS','LOCK_DATE','EXPIRY_DATE','DEFAULT_TABLESPACE','TEMPORARY_TABLESPACE','CREATED','PROFILE','COMMON','ORACLE_MAINTAINED'],Object.values(db.users).map(u=>[u.name,u.id,u.status,u.status.includes('LOCKED')?u.lockDate||today(cx):null,null,u.dts,u.tts,u.created,u.profile,'NO',['SYS','SYSTEM'].includes(u.name)?'Y':'N']));
  if(n==='ALL_USERS')return D(['USERNAME','USER_ID','CREATED','COMMON','ORACLE_MAINTAINED'],Object.values(db.users).map(u=>[u.name,u.id,u.created,'NO',['SYS','SYSTEM'].includes(u.name)?'Y':'N']));
  if(n==='USER_USERS'){const u=db.users[cx.sess.user];return D(['USERNAME','USER_ID','ACCOUNT_STATUS','DEFAULT_TABLESPACE','TEMPORARY_TABLESPACE','CREATED'],u?[[u.name,u.id,u.status,u.dts,u.tts,u.created]]:[]);}
  if(n==='DBA_TS_QUOTAS'||n==='USER_TS_QUOTAS'){const rows=[];for(const u of Object.values(db.users)){if(n==='USER_TS_QUOTAS'&&u.name!==cx.sess.user)continue;for(const t in u.quotas){const q=u.quotas[t];let used=0;for(const o of Object.values(db.objs))if(o.type==='TABLE'&&o.owner===u.name&&o.ts===t)used+=(o.rows.length+(o.virtual||0))*ROW_KB*1024;rows.push((n==='DBA_TS_QUOTAS'?[t,u.name]:[t]).concat([used,q<0?-1:Math.round(q*1048576)]));}}return D(n==='DBA_TS_QUOTAS'?['TABLESPACE_NAME','USERNAME','BYTES','MAX_BYTES']:['TABLESPACE_NAME','BYTES','MAX_BYTES'],rows);}
  if(n==='DBA_TABLESPACES'||n==='USER_TABLESPACES')return D(['TABLESPACE_NAME','BLOCK_SIZE','STATUS','CONTENTS','LOGGING','EXTENT_MANAGEMENT','BIGFILE'],Object.values(db.ts).map(t=>[t.name,8192,t.status,t.type,'LOGGING','LOCAL',t.big?'YES':'NO']));
  if(n==='DBA_DATA_FILES')return D(['FILE_NAME','FILE_ID','TABLESPACE_NAME','BYTES','STATUS','AUTOEXTENSIBLE','MAXBYTES','INCREMENT_BY'],Object.values(db.ts).filter(t=>t.type!=='TEMPORARY').flatMap(t=>t.files.map(f=>[f.name,f.id||1,t.name,Math.round(f.size*1048576),'AVAILABLE',f.auto?'YES':'NO',f.auto?Math.round(f.max*1048576):0,f.auto?Math.round(f.next*128):0])));
  if(n==='DBA_TEMP_FILES')return D(['FILE_NAME','FILE_ID','TABLESPACE_NAME','BYTES','STATUS','AUTOEXTENSIBLE'],Object.values(db.ts).filter(t=>t.type==='TEMPORARY').flatMap(t=>t.files.map(f=>[f.name,f.id||1,t.name,Math.round(f.size*1048576),'ONLINE',f.auto?'YES':'NO'])));
  if(n==='DBA_FREE_SPACE')return D(['TABLESPACE_NAME','FILE_ID','BYTES','BLOCKS'],Object.values(db.ts).filter(t=>t.type!=='TEMPORARY').map(t=>{const b=Math.max(0,Math.round((tsSize(db,t.name)-tsUsed(db,t.name))*1048576));return[t.name,t.files[0]?t.files[0].id||1:1,b,Math.floor(b/8192)];}));
  if(n==='DBA_TEMP_FREE_SPACE')return D(['TABLESPACE_NAME','TABLESPACE_SIZE','ALLOCATED_SPACE','FREE_SPACE'],Object.values(db.ts).filter(t=>t.type==='TEMPORARY').map(t=>{const b=Math.round(tsSize(db,t.name)*1048576);return[t.name,b,1048576,b-1048576];}));
  if(n==='DBA_TABLESPACE_GROUPS')return D(['GROUP_NAME','TABLESPACE_NAME'],Object.values(db.ts).filter(t=>t.group).map(t=>[t.group,t.name]));
  if(n==='DBA_TABLESPACE_USAGE_METRICS')return D(['TABLESPACE_NAME','USED_SPACE','TABLESPACE_SIZE','USED_PERCENT'],Object.values(db.ts).filter(t=>t.type!=='TEMPORARY').map(t=>{const sz=tsSize(db,t.name),u=tsUsed(db,t.name);return[t.name,Math.round(u*128),Math.round(sz*128),+(u/sz*100).toFixed(2)];}));
  if(n==='DBA_SYS_PRIVS'){const r=[];for(const u of Object.values(db.users))for(const p in u.privs)r.push([u.name,p,u.privs[p].admin?'YES':'NO']);for(const ro of Object.values(db.roles))for(const p in ro.privs)r.push([ro.name,p,ro.privs[p].admin?'YES':'NO']);return D(['GRANTEE','PRIVILEGE','ADMIN_OPTION'],r);}
  if(n==='USER_SYS_PRIVS'){const u=db.users[cx.sess.user];return D(['USERNAME','PRIVILEGE','ADMIN_OPTION'],u?Object.keys(u.privs).map(p=>[u.name,p,u.privs[p].admin?'YES':'NO']):[]);}
  if(n==='DBA_ROLE_PRIVS'){const r=[];for(const u of Object.values(db.users))for(const ro in u.roles)r.push([u.name,ro,u.roles[ro].admin?'YES':'NO',isDefaultRole(u,ro)?'YES':'NO']);for(const x of Object.values(db.roles))for(const ro in x.roles)r.push([x.name,ro,x.roles[ro].admin?'YES':'NO','YES']);return D(['GRANTEE','GRANTED_ROLE','ADMIN_OPTION','DEFAULT_ROLE'],r);}
  if(n==='USER_ROLE_PRIVS'){const u=db.users[cx.sess.user];return D(['USERNAME','GRANTED_ROLE','ADMIN_OPTION','DEFAULT_ROLE'],u?Object.keys(u.roles).map(ro=>[u.name,ro,u.roles[ro].admin?'YES':'NO',isDefaultRole(u,ro)?'YES':'NO']):[]);}
  if(n==='DBA_TAB_PRIVS'||n==='ALL_TAB_PRIVS'||n==='USER_TAB_PRIVS'||n==='USER_TAB_PRIVS_MADE'||n==='USER_TAB_PRIVS_RECD'){let list=db.objPrivs;const u=cx.sess.user;if(n!=='DBA_TAB_PRIVS')list=list.filter(o=>o.grantee===u||o.owner===u||o.grantor===u||o.grantee==='PUBLIC');if(n==='USER_TAB_PRIVS_MADE')list=list.filter(o=>o.owner===u);if(n==='USER_TAB_PRIVS_RECD')list=list.filter(o=>o.grantee===u);
    return D(['GRANTEE','OWNER','TABLE_NAME','GRANTOR','PRIVILEGE','GRANTABLE','TYPE'],list.map(o=>[o.grantee,o.owner,o.obj,o.grantor||o.owner,o.priv,o.grantable?'YES':'NO',o.otype||'TABLE']));}
  if(n==='DBA_ROLES')return D(['ROLE','ROLE_ID','PASSWORD_REQUIRED','AUTHENTICATION_TYPE','COMMON','ORACLE_MAINTAINED'],Object.values(db.roles).map((r,i)=>[r.name,100+i,r.pw?'YES':'NO',r.pw?'PASSWORD':'NONE','NO',['CONNECT','RESOURCE','DBA','SELECT_CATALOG_ROLE'].includes(r.name)?'Y':'N']));
  if(n==='DBA_PROFILES'||n==='USER_RESOURCE_LIMITS'||n==='USER_PASSWORD_LIMITS'){const r=[];
    if(n!=='DBA_PROFILES'){const u=db.users[cx.sess.user];for(const k in PROFILE_PARAMS){if((n==='USER_PASSWORD_LIMITS')!==(PROFILE_PARAMS[k]==='PASSWORD'))continue;r.push([k,profileLimit(db,u,k)]);}return D(['RESOURCE_NAME','LIMIT'],r);}
    for(const pr of Object.values(db.profiles))for(const k in PROFILE_PARAMS){const v=pr.limits[k];r.push([pr.name,k,PROFILE_PARAMS[k],pr.name==='DEFAULT'?(v||DEFAULT_LIMITS[k]):(v||'DEFAULT')]);}return D(['PROFILE','RESOURCE_NAME','RESOURCE_TYPE','LIMIT'],r);}
  if(n==='DBA_DB_LINKS'||n==='ALL_DB_LINKS'||n==='USER_DB_LINKS'){const L=Object.values(db.links).filter(l=>n==='DBA_DB_LINKS'||(n==='ALL_DB_LINKS'?(l.pub||l.owner===me):(!l.pub&&l.owner===me)));
    if(n==='USER_DB_LINKS')return D(['DB_LINK','USERNAME','HOST','CREATED'],L.map(l=>[l.name,l.user,l.using,l.created||null]));return D(['OWNER','DB_LINK','USERNAME','HOST','CREATED'],L.map(l=>[l.pub?'PUBLIC':l.owner,l.name,l.user,l.using,l.created||null]));}
  if(n==='DBA_DIRECTORIES'||n==='ALL_DIRECTORIES')return D(['OWNER','DIRECTORY_NAME','DIRECTORY_PATH'],Object.values(db.dirs).map(d=>['SYS',d.name,d.path]));
  if(n==='DBA_DATAPUMP_JOBS')return D(['OWNER_NAME','JOB_NAME','OPERATION','JOB_MODE','STATE'],[]);
  return null;
}
const DICT_LIST=[['USER_TABLES','Tables owned by the user'],['USER_TAB_COLUMNS','Columns of the user\'s tables and views'],['USER_CONSTRAINTS','Constraints on the user\'s tables'],['USER_CONS_COLUMNS','Columns used in constraints'],['USER_INDEXES','Indexes owned by the user'],['USER_IND_COLUMNS','Columns of indexes'],['USER_VIEWS','Views owned by the user'],['USER_SEQUENCES','Sequences owned by the user'],['USER_SYNONYMS','Private synonyms'],['USER_OBJECTS','All objects owned by the user'],['USER_SOURCE','Source text of stored PL/SQL'],['USER_ERRORS','Compilation errors'],['USER_TRIGGERS','Triggers owned by the user'],['USER_PROCEDURES','Procedures and functions'],['ALL_TABLES','Tables accessible to the user'],['ALL_USERS','Users in the database'],['DBA_USERS','All users (DBA only)'],['DBA_TABLESPACES','Tablespaces (DBA only)'],['DBA_DATA_FILES','Data files (DBA only)'],['SESSION_ROLES','Roles enabled now'],['SESSION_PRIVS','Privileges available now'],['NLS_SESSION_PARAMETERS','NLS settings of this session'],['V$INSTANCE','Instance status'],['V$TIMEZONE_NAMES','Time zone names'],['RECYCLEBIN','Dropped tables you can flash back']];
const TZ_NAMES=[['UTC','UTC'],['GMT','GMT'],['US/Eastern','EST'],['US/Eastern','EDT'],['US/Central','CST'],['US/Central','CDT'],['US/Mountain','MST'],['US/Pacific','PST'],['US/Pacific','PDT'],['America/New_York','EST'],['America/Chicago','CST'],['America/Denver','MST'],['America/Los_Angeles','PST'],['Europe/London','GMT'],['Europe/London','BST'],['Europe/Paris','CET'],['Europe/Berlin','CET'],['Asia/Kolkata','IST'],['Asia/Calcutta','IST'],['Asia/Riyadh','AST'],['Asia/Dubai','GST'],['Asia/Karachi','PKT'],['Asia/Tokyo','JST'],['Asia/Singapore','SGT'],['Asia/Shanghai','CST'],['Australia/Sydney','AEST'],['Australia/Sydney','AEDT']];

/* ===== PL/SQL: parser ===== */
const PL_END_WORDS=new Set(['END','ELSE','ELSIF','EXCEPTION','WHEN']);
function plErr(p,msg){const x=p.peek()||p.last();const e=E('PLS-00103',msg||('Encountered the symbol "'+(x?(x.k==='str'?"'"+x.v+"'":x.raw||x.v):'end-of-file')+'" when expecting one of the following:'));if(x){e.line=x.line;e.col=x.col;}e.pls=true;return e;}
function plExpectW(p,...ws){if(!p.acceptW(...ws))throw plErr(p,'Encountered the symbol "'+((p.peek()&&(p.peek().raw||p.peek().v))||'end-of-file')+'" when expecting one of the following: '+ws.join(' '));}
function plExpectOp(p,o){if(!p.acceptOp(o))throw plErr(p,'Encountered the symbol "'+((p.peek()&&(p.peek().raw||p.peek().v))||'end-of-file')+'" when expecting one of the following: '+o);}
function plSemi(p){if(!p.acceptOp(';'))throw plErr(p,'Encountered the symbol "'+((p.peek()&&(p.peek().k==='str'?"'"+p.peek().v+"'":p.peek().raw||p.peek().v))||'end-of-file')+'" when expecting one of the following: ;');}
function isLabel(p){return p.isOp('<')&&p.isOp('<',1)&&p.peek(2)&&p.peek(2).k==='id'&&p.isOp('>',3)&&p.isOp('>',4);}
function readLabel(p){p.i+=2;const n=p.next().v;p.i+=2;return n;}
function plParseType(p){
  const t=parseType(p);
  if(t.base==='USER'&&p.isOp('%')&&p.peek(1)&&(p.peek(1).v==='TYPE'||p.peek(1).v==='ROWTYPE')){p.next();const k=p.next().v;return{base:k==='TYPE'?'%TYPE':'%ROWTYPE',ref:t.name};}
  if(t.base==='USER'&&p.isOp('.')&&p.peek(1)&&p.peek(1).k==='id'){p.next();t.name+='.'+p.ident();if(p.isOp('%')&&p.peek(1)&&(p.peek(1).v==='TYPE'||p.peek(1).v==='ROWTYPE')){p.next();const k=p.next().v;return{base:k==='TYPE'?'%TYPE':'%ROWTYPE',ref:t.name};}}
  return t;
}
function plParams(p){
  const ps=[];if(!p.acceptOp('('))return ps;
  do{const x=p.peek();const name=p.ident();let mode='IN';if(p.acceptW('IN')){mode=p.acceptW('OUT')?'IN OUT':'IN';}else if(p.acceptW('OUT'))mode='OUT';const nocopy=p.acceptW('NOCOPY');
    const type=plParseType(p);let def=null;if(p.acceptOp(':=')||p.acceptW('DEFAULT'))def=parseExpr(p);ps.push({name,mode,nocopy,type,def,line:x.line,col:x.col});}while(p.acceptOp(','));
  plExpectOp(p,')');return ps;
}
function plDecls(p,inSpec,compound){
  const ds=[];
  while(!p.eof()&&!p.isW('BEGIN')&&!p.isW('END')&&!(compound&&(p.isW('BEFORE')||p.isW('AFTER')||p.isW('INSTEAD'))&&(p.isW('STATEMENT',1)||p.isW('EACH',1)))){
    const x=p.peek();const line=x.line,col=x.col;
    if(p.acceptW('TYPE')){const name=p.ident();plExpectW(p,'IS');const d={k:'type',name,line,col};
      if(p.acceptW('RECORD')){plExpectOp(p,'(');d.def={kind:'record',fields:[]};do{const fx=p.peek();const fn=p.ident();const ft=plParseType(p);let nn=false,fd=null;if(p.acceptW('NOT','NULL'))nn=true;if(p.acceptOp(':=')||p.acceptW('DEFAULT'))fd=parseExpr(p);d.def.fields.push({name:fn,type:ft,notNull:nn,def:fd});}while(p.acceptOp(','));plExpectOp(p,')');}
      else if(p.acceptW('TABLE')){plExpectW(p,'OF');const et=plParseType(p);let nn=p.acceptW('NOT','NULL');if(p.acceptW('INDEX','BY')){const kt=plParseType(p);d.def={kind:'aa',elem:et,key:kt,notNull:nn};}else d.def={kind:'nt',elem:et,notNull:nn};}
      else if(p.acceptW('VARRAY')||p.acceptW('VARYING','ARRAY')){plExpectOp(p,'(');const lim=p.num();plExpectOp(p,')');plExpectW(p,'OF');const et=plParseType(p);const nn=p.acceptW('NOT','NULL');d.def={kind:'va',elem:et,limit:lim,notNull:nn};}
      else if(p.acceptW('REF','CURSOR')){let ret=null;if(p.acceptW('RETURN'))ret=plParseType(p);d.def={kind:'refcur',ret};}
      else throw plErr(p);
      plSemi(p);ds.push(d);continue;}
    if(p.acceptW('SUBTYPE')){const name=p.ident();plExpectW(p,'IS');const base=plParseType(p);let nn=false;if(p.acceptOp('(')){p.num();if(p.acceptOp(','))p.num();plExpectOp(p,')');}if(p.acceptW('RANGE')){p.num();p.acceptOp('..');p.num();}if(p.acceptW('NOT','NULL'))nn=true;plSemi(p);ds.push({k:'type',name,def:{kind:'subtype',base,notNull:nn},line,col});continue;}
    if(p.acceptW('CURSOR')){const name=p.ident();const params=plParams(p);let ret=null;if(p.acceptW('RETURN'))ret=plParseType(p);let query=null;if(p.acceptW('IS')){const st=p.i;query=parseQuery(p);query.text=p.textFrom(st);}plSemi(p);ds.push({k:'cursor',name,params,ret,query,line,col});continue;}
    if(p.acceptW('PRAGMA')){const w=p.ident();if(w==='EXCEPTION_INIT'){plExpectOp(p,'(');const exc=p.ident();plExpectOp(p,',');const code=p.num();plExpectOp(p,')');plSemi(p);ds.push({k:'pragma',name:w,exc,code,line,col});continue;}
      if(p.acceptOp('(')){let d=1;while(d>0){const t=p.next();if(t.v==='(')d++;if(t.v===')')d--;}}plSemi(p);ds.push({k:'pragma',name:w,line,col});continue;}
    if(p.isW('PROCEDURE')||p.isW('FUNCTION')){const u=plUnitHead(p);if(p.acceptOp(';')){u.forward=true;ds.push({k:u.kind==='FUNCTION'?'func':'proc',name:u.name,unit:u,line,col,sig:true});continue;}
      if(inSpec)throw plErr(p);
      if(!(p.acceptW('IS')||p.acceptW('AS')))throw plErr(p);plUnitBody(p,u);ds.push({k:u.kind==='FUNCTION'?'func':'proc',name:u.name,unit:u,line,col});continue;}
    /* variable, constant, exception */
    const name=p.ident();
    if(p.acceptW('EXCEPTION')){plSemi(p);ds.push({k:'exc',name,line,col});continue;}
    const constant=p.acceptW('CONSTANT');const type=plParseType(p);let notNull=false,def=null;
    if(p.acceptW('NOT','NULL'))notNull=true;
    if(p.acceptOp(':=')||p.acceptW('DEFAULT'))def=parseExpr(p);
    else if(p.isOp('=')){throw Object.assign(plErr(p,'Encountered the symbol "=" when expecting one of the following: := ; not null default character'),{});}
    plSemi(p);ds.push({k:'var',name,type,constant,notNull,def,line,col});
  }
  return ds;
}
function plUnitHead(p){
  const kind=p.next().v;const ine=p.acceptW('IF','NOT','EXISTS');const x=p.peek();let name=p.ident();let owner=null;if(p.isOp('.')&&p.peek(1)&&p.peek(1).k==='id'){p.next();owner=name;name=p.ident();}
  const u={kind,name,owner,params:plParams(p),line:x.line,ifNotExists:ine};
  if(kind==='FUNCTION'){plExpectW(p,'RETURN');u.ret=plParseType(p);}
  for(;;){if(p.acceptW('DETERMINISTIC')||p.acceptW('PIPELINED')||p.acceptW('PARALLEL_ENABLE')||p.acceptW('RESULT_CACHE'))continue;if(p.acceptW('AUTHID')){p.next();continue;}if(p.acceptW('ACCESSIBLE','BY')){plExpectOp(p,'(');while(!p.acceptOp(')'))p.next();continue;}break;}
  return u;
}
function plUnitBody(p,u){
  if(p.acceptW('LANGUAGE')){while(!p.isOp(';'))p.next();plSemi(p);u.external=true;return u;}
  u.decls=plDecls(p);plExpectW(p,'BEGIN');const b=plStmtsUntil(p,['EXCEPTION','END']);u.body=b;u.handlers=plHandlers(p);plExpectW(p,'END');
  const x=p.peek();if(x&&x.k==='id'&&!p.isOp(';')){const nm=p.next().v;if(nm!==u.name&&u.name)throw plErr(p,'Encountered the symbol "'+nm+'" when expecting one of the following: ;');}
  plSemi(p);return u;
}
function plHandlers(p){
  const hs=[];if(!p.acceptW('EXCEPTION'))return hs;
  while(p.acceptW('WHEN')){const names=[];do{const x=p.next();if(x.k!=='id')throw plErr(p);let n=x.v;while(p.isOp('.')&&p.peek(1)&&p.peek(1).k==='id'){p.next();n+='.'+p.next().v;}names.push(n);}while(p.acceptW('OR'));
    plExpectW(p,'THEN');const body=plStmtsUntil(p,['WHEN','END']);hs.push({names,body});}
  return hs;
}
function plBlock(p,label){
  const x=p.peek();const b={t:'block',label,decls:[],body:[],handlers:[],line:x.line};
  if(p.acceptW('DECLARE'))b.decls=plDecls(p);
  plExpectW(p,'BEGIN');b.body=plStmtsUntil(p,['EXCEPTION','END']);b.handlers=plHandlers(p);plExpectW(p,'END');
  if(p.peek()&&p.peek().k==='id')p.next();
  plSemi(p);return b;
}
function plStmtsUntil(p,stops){
  const list=[];
  while(!p.eof()){
    if(stops.some(w=>p.isW(w)))break;
    list.push(...plStmt(p));
  }
  if(!list.filter(s=>s.t!=='label').length){const x=p.peek();throw plErr(p,'Encountered the symbol "'+(x?(x.raw||x.v):'end-of-file')+'" when expecting one of the following: begin case declare exit for goto if loop mod null raise return select update while with <an identifier>');}
  return list;
}
function plStmt(p){
  const x=p.peek();const line=x.line,col=x.col;const at=s=>{s.line=line;s.col=col;return s;};
  if(isLabel(p)){const name=readLabel(p);const out=[at({t:'label',name})];
    if(p.eof()||PL_END_WORDS.has(p.peek().v)&&p.peek().k==='id'){const y=p.peek();throw plErr(p,'Encountered the symbol "'+(y?(y.raw||y.v):'end-of-file')+'" when expecting one of the following: begin case declare exit for goto if loop mod null raise return select update while with <an identifier> <a double-quoted delimited-identifier> <a bind variable> << continue close current delete fetch lock insert open rollback savepoint set sql execute commit forall merge pipe purge');}
    if(p.isW('LOOP')||p.isW('WHILE')||p.isW('FOR')||p.isW('DECLARE')||p.isW('BEGIN')){const s=plStmt(p);s[0].label=name;out.push(...s);}return out;}
  if(p.isW('DECLARE')||p.isW('BEGIN'))return[at(plBlock(p,null))];
  if(p.acceptW('NULL')){plSemi(p);return[at({t:'null'})];}
  if(p.acceptW('IF')){const conds=[];let c=parseExpr(p);plExpectW(p,'THEN');conds.push([c,plStmtsUntil(p,['ELSIF','ELSE','END'])]);let els=null;
    for(;;){if(p.acceptW('ELSIF')){c=parseExpr(p);plExpectW(p,'THEN');conds.push([c,plStmtsUntil(p,['ELSIF','ELSE','END'])]);continue;}
      if(p.isW('ELSE')&&p.isW('IF',1)){throw plErr(p,'Encountered the symbol "IF" when expecting one of the following: (ELSE IF nahi, ELSIF likho)');}
      if(p.acceptW('ELSE')){els=plStmtsUntil(p,['END']);}break;}
    plExpectW(p,'END');plExpectW(p,'IF');plSemi(p);return[at({t:'if',conds,els})];}
  if(p.acceptW('CASE')){let base=null;if(!p.isW('WHEN'))base=parseExpr(p);const whens=[];
    while(p.acceptW('WHEN')){const w=parseExpr(p);plExpectW(p,'THEN');whens.push([w,plStmtsUntil(p,['WHEN','ELSE','END'])]);}
    let els=null;if(p.acceptW('ELSE'))els=plStmtsUntil(p,['END']);plExpectW(p,'END');plExpectW(p,'CASE');if(p.peek()&&p.peek().k==='id')p.next();plSemi(p);return[at({t:'case',base,whens,els})];}
  if(p.acceptW('LOOP')){const body=plStmtsUntil(p,['END']);plExpectW(p,'END');plExpectW(p,'LOOP');if(p.peek()&&p.peek().k==='id')p.next();plSemi(p);return[at({t:'loop',body})];}
  if(p.acceptW('WHILE')){const cond=parseExpr(p);plExpectW(p,'LOOP');const body=plStmtsUntil(p,['END']);plExpectW(p,'END');plExpectW(p,'LOOP');if(p.peek()&&p.peek().k==='id')p.next();plSemi(p);return[at({t:'while',cond,body})];}
  if(p.acceptW('FOR')){const v=p.ident();plExpectW(p,'IN');const rev=p.acceptW('REVERSE');let s;
    if(p.isOp('(')&&(p.isW('SELECT',1)||p.isW('WITH',1))){p.next();const st=p.i;const q=parseQuery(p);q.text=p.textFrom(st);plExpectOp(p,')');s={t:'forc',rec:v,query:q};}
    else{const lo=parseAdd(p);if(p.acceptOp('..')){const hi=parseAdd(p);s={t:'fori',var:v,rev,lo,hi};}
      else{if(lo.t!=='id'&&lo.t!=='call')throw plErr(p);s={t:'forc',rec:v,cur:{parts:lo.parts,args:lo.args||[]}};}}
    plExpectW(p,'LOOP');s.body=plStmtsUntil(p,['END']);plExpectW(p,'END');plExpectW(p,'LOOP');if(p.peek()&&p.peek().k==='id')p.next();plSemi(p);return[at(s)];}
  if(p.acceptW('FORALL')){const v=p.ident();plExpectW(p,'IN');let s={t:'forall',var:v};
    if(p.acceptW('INDICES','OF')){s.indices=parseAdd(p);}else if(p.acceptW('VALUES','OF')){s.values=parseAdd(p);}else{s.lo=parseAdd(p);plExpectOp(p,'..');s.hi=parseAdd(p);}
    p.acceptW('SAVE','EXCEPTIONS');const st=p.i;const sq=parseSqlStatement(p);if(!sq)throw plErr(p);s.sql=sq;s.text=p.textFrom(st);plSemi(p);return[at(s)];}
  if(p.isW('EXIT')||p.isW('CONTINUE')){const k=p.next().v.toLowerCase();let label=null,cond=null;if(p.peek()&&p.peek().k==='id'&&!p.isW('WHEN'))label=p.next().v;if(p.acceptW('WHEN'))cond=parseExpr(p);plSemi(p);return[at({t:k,label,cond})];}
  if(p.acceptW('GOTO')){const label=p.ident();plSemi(p);return[at({t:'goto',label})];}
  if(p.acceptW('RAISE')){let exc=null;if(!p.isOp(';')){exc=p.next().v;while(p.isOp('.')&&p.peek(1)&&p.peek(1).k==='id'){p.next();exc+='.'+p.next().v;}}plSemi(p);return[at({t:'raise',exc})];}
  if(p.acceptW('RETURN')){let e=null;if(!p.isOp(';'))e=parseExpr(p);plSemi(p);return[at({t:'return',e})];}
  if(p.acceptW('OPEN')){const cur=parsePostfix(p);if(p.acceptW('FOR')){let q=null,dyn=null;if(p.isW('SELECT')||p.isW('WITH')||(p.isOp('(')&&p.isW('SELECT',1))){const st=p.i;q=parseQuery(p);q.text=p.textFrom(st);}else dyn=parseExpr(p);
      let using=[];if(p.acceptW('USING')){do{p.acceptW('IN');using.push(parseExpr(p));}while(p.acceptOp(','));}plSemi(p);return[at({t:'openfor',cur,q,dyn,using})];}
    plSemi(p);return[at({t:'open',cur:cur.parts,args:cur.args||[]})];}
  if(p.acceptW('FETCH')){const cur=parsePostfix(p);let bulk=false;if(p.acceptW('BULK','COLLECT'))bulk=true;plExpectW(p,'INTO');const into=parseIntoList(p);let limit=null;if(p.acceptW('LIMIT'))limit=parseExpr(p);plSemi(p);return[at({t:'fetch',cur,into,bulk,limit})];}
  if(p.acceptW('CLOSE')){const cur=parsePostfix(p);plSemi(p);return[at({t:'close',cur})];}
  if(p.isW('EXECUTE')&&p.isW('IMMEDIATE',1)){p.i+=2;const e=parseExpr(p);const s={t:'execimm',e,into:null,using:[],bulk:false};
    for(;;){if(p.acceptW('BULK','COLLECT')){s.bulk=true;plExpectW(p,'INTO');s.into=parseIntoList(p);continue;}if(p.acceptW('INTO')){s.into=parseIntoList(p);continue;}
      if(p.acceptW('USING')){do{let mode='IN';if(p.acceptW('IN')){if(p.acceptW('OUT'))mode='IN OUT';}else if(p.acceptW('OUT'))mode='OUT';s.using.push({mode,e:parseExpr(p)});}while(p.acceptOp(','));continue;}
      if(p.acceptW('RETURNING','INTO')||p.acceptW('RETURN','INTO')){s.retInto=parseIntoList(p);continue;}break;}
    plSemi(p);return[at(s)];}
  if(p.isAnyW(['SELECT','INSERT','UPDATE','DELETE','MERGE','COMMIT','ROLLBACK','SAVEPOINT','LOCK','WITH'])||(p.isW('SET')&&p.isW('TRANSACTION',1))){
    const st=p.i;if(p.isW('SET')){while(!p.isOp(';'))p.next();plSemi(p);return[at({t:'null'})];}
    let sq;try{sq=parseSqlStatement(p);}catch(e){if(e instanceof OraErr&&!e.pls){e.sqlInPl=true;}throw e;}
    if(!sq)throw plErr(p);const text=p.textFrom(st);
    if(sq.t==='query'&&sq.body.t==='select'&&!sq.body.into)throw Object.assign(E('PLS-00428','an INTO clause is expected in this SELECT statement',[]),{line,col,pls:true});
    if(!p.isOp(';')){if(sq.t==='query')throw Object.assign(E('ORA-00933','SQL command not properly ended'),{line:p.peek().line,col:p.peek().col,sqlInPl:true});throw plErr(p);}
    plSemi(p);return[at({t:'sql',s:sq,text})];}
  if(p.isAnyW(['CREATE','ALTER','DROP','GRANT','TRUNCATE','REVOKE'])){throw Object.assign(plErr(p,'Encountered the symbol "'+x.v+'" when expecting one of the following: (DDL ko PL/SQL mein seedha nahi likh sakte; EXECUTE IMMEDIATE \'...\' use karo)'),{});}
  /* assignment or procedure call */
  const target=parsePostfix(p);
  if(p.acceptOp(':=')){const e=parseExpr(p);plSemi(p);return[at({t:'assign',target,e})];}
  if(p.isOp('=')){throw plErr(p,'Encountered the symbol "=" when expecting one of the following: := . ( @ % ;'+'  (assignment ke liye := likho)');}
  if(target.t!=='call'&&target.t!=='id'&&target.t!=='callon'&&target.t!=='field')throw plErr(p);
  plSemi(p);return[at({t:'pcall',e:target})];
}
/* CREATE [OR REPLACE] PROCEDURE/FUNCTION/PACKAGE/TRIGGER/TYPE */
function plParseUnit(src){
  const p=new P(lex(src),src);plExpectW(p,'CREATE');const orRep=p.acceptW('OR','REPLACE');p.acceptW('EDITIONABLE')||p.acceptW('NONEDITIONABLE');
  if(p.isW('PROCEDURE')||p.isW('FUNCTION')){const u=plUnitHead(p);if(!(p.acceptW('IS')||p.acceptW('AS')))throw plErr(p,'Encountered the symbol "'+((p.peek()&&(p.peek().raw||p.peek().v))||'end-of-file')+'" when expecting one of the following: ( return compress compiled wrapped is as');plUnitBody(p,u);u.orRep=orRep;u.src=src;trailing(p);return u;}
  if(p.acceptW('PACKAGE')){const body=p.acceptW('BODY');const ine=p.acceptW('IF','NOT','EXISTS');let name=p.ident();let owner=null;if(p.isOp('.')&&p.peek(1)&&p.peek(1).k==='id'){p.next();owner=name;name=p.ident();}
    while(p.acceptW('AUTHID')){p.next();}if(!(p.acceptW('IS')||p.acceptW('AS')))throw plErr(p);
    const u={kind:body?'PACKAGE BODY':'PACKAGE',name,owner,orRep,src,ifNotExists:ine};
    u.decls=plDecls(p,!body);
    if(body&&p.acceptW('BEGIN')){u.init=plStmtsUntil(p,['EXCEPTION','END']);u.handlers=plHandlers(p);}
    plExpectW(p,'END');if(p.peek()&&p.peek().k==='id'){const nm=p.next().v;if(nm!==name)throw plErr(p);}plSemi(p);trailing(p);return u;}
  if(p.acceptW('TRIGGER'))return plParseTrigger(p,src,orRep);
  if(p.acceptW('TYPE')){const body=p.acceptW('BODY');const ine=p.acceptW('IF','NOT','EXISTS');let name=p.ident();if(p.isOp('.')&&p.peek(1)){p.next();name=p.ident();}
    if(body){while(!p.eof())p.next();return{kind:'TYPE BODY',name,src,orRep,ifNotExists:ine};}
    p.acceptW('FORCE');if(!(p.acceptW('IS')||p.acceptW('AS')))throw plErr(p);const u={kind:'TYPE',name,orRep,src,ifNotExists:ine};
    if(p.acceptW('TABLE')){plExpectW(p,'OF');u.def={kind:'nt',elem:plParseType(p)};p.acceptW('NOT','NULL');}
    else if(p.acceptW('VARRAY')||p.acceptW('VARYING','ARRAY')){plExpectOp(p,'(');const lim=p.num();plExpectOp(p,')');plExpectW(p,'OF');u.def={kind:'va',limit:lim,elem:plParseType(p)};p.acceptW('NOT','NULL');}
    else if(p.acceptW('OBJECT')){plExpectOp(p,'(');const fields=[];do{if(p.isAnyW(['MEMBER','STATIC','CONSTRUCTOR','MAP','ORDER'])){while(!p.isOp(',')&&!p.isOp(')'))p.next();continue;}const fn=p.ident();fields.push({name:fn,type:plParseType(p)});}while(p.acceptOp(','));plExpectOp(p,')');u.def={kind:'record',fields,object:true};
      while(p.isW('NOT')||p.isW('FINAL')||p.isW('INSTANTIABLE')){p.next();}}
    else throw plErr(p);
    p.acceptOp(';');trailing(p);return u;}
  throw E('ORA-00901','invalid CREATE command');
}
function trailing(p){while(p.acceptOp(';'));if(!p.eof()&&!p.isOp('/'))throw plErr(p);}
let plTrigHdr=null;/* header of the trigger being parsed, so a body that fails to parse still lands on its table */
function plParseTrigger(p,src,orRep){
  const ine=p.acceptW('IF','NOT','EXISTS');let name=p.ident();let owner=null;if(p.isOp('.')&&p.peek(1)&&p.peek(1).k==='id'){p.next();owner=name;name=p.ident();}
  const t={kind:'TRIGGER',name,owner,orRep,src,ifNotExists:ine,events:[],ofCols:null,level:'STATEMENT',timing:null,enabled:true};
  if(p.acceptW('BEFORE'))t.timing='BEFORE';else if(p.acceptW('AFTER'))t.timing='AFTER';else if(p.acceptW('INSTEAD','OF'))t.timing='INSTEAD OF';else if(p.acceptW('FOR')){t.timing='FOR';}else throw plErr(p);
  do{const ev=p.next().v;if(!['INSERT','UPDATE','DELETE','LOGON','LOGOFF','STARTUP','SHUTDOWN','CREATE','DROP','ALTER','DDL','SERVERERROR'].includes(ev))throw plErr(p);t.events.push(ev);
    if(ev==='UPDATE'&&p.acceptW('OF')){t.ofCols=[];do{t.ofCols.push(p.ident('column'));}while(p.acceptOp(','));}}while(p.acceptW('OR'));
  if(!p.acceptW('ON'))throw Object.assign(E('ORA-00969','missing ON keyword'),{hdr:true});if(p.acceptW('DATABASE')||p.acceptW('SCHEMA')){t.system=true;}else t.q=p.qname();
  for(;;){
    if(p.acceptW('REFERENCING')){while(p.isAnyW(['NEW','OLD','PARENT'])){const w=p.next().v;p.acceptW('AS');const al=p.ident();(t.ref||(t.ref={}))[al]=w;}continue;}
    if(p.acceptW('FOR','EACH','ROW')){t.level='ROW';continue;}
    if(p.acceptW('FOLLOWS')||p.acceptW('PRECEDES')){p.qname();continue;}
    if(p.acceptW('ENABLE')){t.enabled=true;continue;}if(p.acceptW('DISABLE')){t.enabled=false;continue;}
    if(p.acceptW('WHEN')){plExpectOp(p,'(');const st=p.i;t.when=parseExpr(p);t.whenText=p.textFrom(st);plExpectOp(p,')');let bnd=false;scanAst(t.when,n=>{if(n.t==='bind')bnd=true;});if(bnd)throw Object.assign(E('ORA-25000','invalid usage of bind variable in trigger WHEN clause',[hint('WHEN ke andar colon nahi lagta: WHEN (NEW.price > 0) likho.')]),{hdr:true});continue;}
    break;}
  plTrigHdr=t;
  if(t.timing==='FOR'){plExpectW(p,'COMPOUND');plExpectW(p,'TRIGGER');t.compound={decls:plDecls(p,false,true),sections:{}};
    while(!p.isW('END')){const x0=p.peek();const tm=p.next().v;let what;if(p.acceptW('STATEMENT'))what='STATEMENT';else{plExpectW(p,'EACH');plExpectW(p,'ROW');what='EACH ROW';}plExpectW(p,'IS');const sdecls=plDecls(p);plExpectW(p,'BEGIN');
      const body=plStmtsUntil(p,['EXCEPTION','END']);const handlers=plHandlers(p);plExpectW(p,'END');plExpectW(p,tm);if(!p.acceptW('STATEMENT'))p.acceptW('EACH','ROW');plSemi(p);t.compound.sections[tm+' '+what]={decls:sdecls,body,handlers,line:x0.line};}
    plExpectW(p,'END');if(p.peek()&&p.peek().k==='id')p.next();plSemi(p);trailing(p);t.level='ROW';t.timing='COMPOUND';return t;}
  if(p.acceptW('CALL')){const e=parsePostfix(p);t.block={t:'block',decls:[],body:[{t:'pcall',e,line:1}],handlers:[],line:1};trailing(p);return t;}
  const lab=isLabel(p)?readLabel(p):null;
  t.block=plBlock(p,lab);trailing(p);
  return t;
}

/* ===== PL/SQL: runtime ===== */
class Sig{constructor(kind,label,value){this.kind=kind;this.label=label;this.value=value;}}
const PREDEF={NO_DATA_FOUND:'ORA-01403',TOO_MANY_ROWS:'ORA-01422',ZERO_DIVIDE:'ORA-01476',VALUE_ERROR:'ORA-06502',INVALID_NUMBER:'ORA-01722',DUP_VAL_ON_INDEX:'ORA-00001',CURSOR_ALREADY_OPEN:'ORA-06511',INVALID_CURSOR:'ORA-01001',CASE_NOT_FOUND:'ORA-06592',COLLECTION_IS_NULL:'ORA-06531',SUBSCRIPT_BEYOND_COUNT:'ORA-06533',SUBSCRIPT_OUTSIDE_LIMIT:'ORA-06532',ROWTYPE_MISMATCH:'ORA-06504',LOGIN_DENIED:'ORA-01017',NOT_LOGGED_ON:'ORA-01012',PROGRAM_ERROR:'ORA-06501',STORAGE_ERROR:'ORA-06500',TIMEOUT_ON_RESOURCE:'ORA-00051',SYS_INVALID_ROWID:'ORA-01410',ACCESS_INTO_NULL:'ORA-06530',SELF_IS_NULL:'ORA-30625',NO_DATA_NEEDED:'ORA-06548'};
class Scope{constructor(parent,o){this.parent=parent;this.vars=new Map();this.labels=[];Object.assign(this,o||{});}
  find(n){for(let s=this;s;s=s.parent){const v=s.vars.get(n);if(v)return v;}return null;}
  findLabel(l){for(let s=this;s;s=s.parent){if(s.label===l)return s;}return null;}}
function plTypeName(t){return t?typeStr(t):'';}
function resolveTypeSpec(t,scope,cx,noLen){
  if(!t)return null;
  if(t.base==='%TYPE'){const parts=t.ref.split('.');
    if(scope){const v=scope.find(parts[0]);if(v&&parts.length===1)return v.type;if(v&&v.type&&v.type.rec&&parts.length===2)return v.type.fields.find(f=>f.name===parts[1]).type;
      if(parts.length===2){const lv=scope.findLabel&&scope.findLabel(parts[0]);if(lv){const vv=lv.vars.get(parts[1]);if(vv)return vv.type;}}}
    const tq=parts.length===3?{owner:parts[0],name:parts[1]}:{owner:null,name:parts[0]};const col=parts[parts.length-1];
    const o=resolveObj(tq,cx,true);if(!o||(o.type!=='TABLE'&&o.type!=='VIEW'))throw E('PLS-00201',"identifier '"+t.ref+"' must be declared");
    if(o.type==='TABLE'){const c=o.cols.find(c2=>c2.name===col);if(!c)throw E('PLS-00302',"component '"+col+"' must be declared");return c.type;}
    const r=runQuery(o.query,sub(cx,{schema:o.owner,stmtCache:new Map()}),{limit:0});const k=(o.cols||r.cols).indexOf(col);if(k<0)throw E('PLS-00302',"component '"+col+"' must be declared");return r.types[k]||{base:'VARCHAR2',len:4000};}
  if(t.base==='%ROWTYPE'){const parts=t.ref.split('.');
    if(scope&&parts.length===1){const v=scope.find(parts[0]);if(v&&v.kind==='cursor'){return cursorRowType(v.decl,scope,cx);}if(v&&v.type&&v.type.refcur)return{rec:1,fields:[],any:true};}
    const tq=parts.length===2?{owner:parts[0],name:parts[1]}:{owner:null,name:parts[0]};const o=resolveObj(tq,cx,true);
    if(!o||(o.type!=='TABLE'&&o.type!=='VIEW'))throw E('PLS-00201',"identifier '"+t.ref+"' must be declared");
    if(o.type==='TABLE')return{rec:1,fields:o.cols.filter(c=>!c.unused).map(c=>({name:c.name,type:c.type})),tname:o.name+'%ROWTYPE'};
    const r=runQuery(o.query,sub(cx,{schema:o.owner,stmtCache:new Map()}),{limit:0});return{rec:1,fields:(o.cols||r.cols).map((c,i)=>({name:c,type:r.types[i]})),tname:o.name+'%ROWTYPE'};}
  if(t.base==='USER'){const nm=t.name;const parts=nm.split('.');
    if(scope){const v=scope.find(parts[0]);if(v&&v.kind==='type'&&parts.length===1)return v.type;}
    if(parts.length===2){const pk=pkgInstance({owner:null,name:parts[0]},cx,true);if(pk){const v=pk.scope.vars.get(parts[1]);if(v&&v.kind==='type')return v.type;}}
    const o=resolveObj(parts.length===2?{owner:parts[0],name:parts[1]}:{owner:null,name:parts[0]},cx,true);if(o&&o.type==='TYPE')return schemaType(o,cx);
    throw E('PLS-00201',"identifier '"+nm+"' must be declared");}
  if((t.base==='VARCHAR2'||t.base==='NVARCHAR2')&&t.len==null&&!noLen)throw E('PLS-00215','String length constraints must be in range (1 .. 32767)');
  if(t.base==='SYS_REFCURSOR')return{base:'SYS_REFCURSOR',refcur:true};
  return t;
}
function schemaType(o,cx){if(o._t)return o._t;const d=o.def;let t;
  if(d.kind==='record')t={rec:1,fields:d.fields.map(f=>({name:f.name,type:resolveTypeSpec(f.type,null,cx)})),tname:o.name,object:true};
  else t={coll:d.kind==='nt'?'NT':'VA',elem:resolveTypeSpec(d.elem,null,cx),limit:d.limit,tname:o.name};
  o._t=t;return t;}
function cursorRowType(decl,scope,cx){if(decl._rt)return decl._rt;const cs=new Scope(scope,{});(decl.params||[]).forEach(pa=>cs.vars.set(pa.name,{kind:'param',mode:'IN',name:pa.name,type:null,v:null}));const r=runQuery(decl.query,plCx(cx,cs,{noCache:true}),{limit:0});const t={rec:1,fields:r.cols.map((c,i)=>({name:c,type:r.types[i]}))};return t;}
function typeFromDef(def,scope,cx,name){
  switch(def.kind){
    case'record':return{rec:1,fields:def.fields.map(f=>({name:f.name,type:resolveTypeSpec(f.type,scope,cx),notNull:f.notNull,def:f.def})),tname:name};
    case'aa':return{coll:'AA',elem:resolveTypeSpec(def.elem,scope,cx),key:resolveTypeSpec(def.key,scope,cx),tname:name};
    case'nt':return{coll:'NT',elem:resolveTypeSpec(def.elem,scope,cx),tname:name};
    case'va':return{coll:'VA',elem:resolveTypeSpec(def.elem,scope,cx),limit:def.limit,tname:name};
    case'refcur':return{base:'REF CURSOR',refcur:true,tname:name};
    case'subtype':{const b=resolveTypeSpec(def.base,scope,cx);return Object.assign({},b,{notNull:def.notNull||b.notNull,sub:name});}
  }
}
function initValue(t,cx,scope){
  if(!t)return null;
  if(t.rec){const r={rec:1,f:{},types:{},tname:t.tname};for(const f of t.fields){r.types[f.name]=f.type;r.f[f.name]=f.def?coerceV(evalE(f.def,plCx(cx,scope)),f.type,cx):initValue(f.type,cx,scope);}if(t.object)return null;return r;}
  if(t.coll==='AA')return{coll:'AA',map:new Map(),type:t,tname:t.tname};
  if(t.coll)return null;
  return null;
}
function copyVal(v){if(v&&v.rec){const r={rec:1,f:{},types:v.types,tname:v.tname};for(const k in v.f)r.f[k]=copyVal(v.f[k]);return r;}
  if(v&&v.coll){if(v.coll==='AA'){const m=new Map();v.map.forEach((x,k)=>m.set(k,copyVal(x)));return{coll:'AA',map:m,type:v.type,tname:v.tname};}return{coll:v.coll,items:v.items.map(x=>x===DELETED?x:copyVal(x)),type:v.type,tname:v.tname,limit:v.limit};}
  return v;}
function coerceV(v,t,cx,what){
  if(!t)return v;
  if(t.rec){if(v==null)return t.object?null:initValue(t,cx);if(!v.rec)throw E('PLS-00382','expression is of wrong type');const r={rec:1,f:{},types:{},tname:t.tname};for(const f of t.fields){r.types[f.name]=f.type;r.f[f.name]=coerceV(v.f[f.name]!==undefined?v.f[f.name]:null,f.type,cx);}return r;}
  if(t.coll){if(v==null)return t.coll==='AA'?{coll:'AA',map:new Map(),type:t,tname:t.tname}:null;if(!v.coll)throw E('PLS-00382','expression is of wrong type');const c=copyVal(v);c.type=t;c.tname=t.tname;if(t.coll==='VA'){c.limit=t.limit;if(c.items.length>t.limit)throw E('ORA-06532','Subscript outside of limit');}return c;}
  if(t.refcur||t.base==='SYS_REFCURSOR'){return v;}
  if(t.notNull&&v==null)throw E('ORA-06502','PL/SQL: numeric or value error');
  if(v&&(v.rec||v.coll))throw E('PLS-00382','expression is of wrong type');
  return coerce(v,t,cx,{pl:true});
}
/* ---------- context bridging PL/SQL scope into SQL evaluation ---------- */
function plCx(cx,scope,extra){
  const c=sub(cx,{f:extra&&extra.f||null,pl:mkPlBridge(scope),plScope:scope,stmtCache:null,noCache:true});if(extra)Object.assign(c,extra);return c;}
function mkPlBridge(scope){
  return{
    scope,
    get(parts,cx,node){const r=plLookup(parts,scope,cx,node);if(r===undefined)return undefined;return r.get();},
    has(parts){return!!scope.find(parts[0]);},
    isFn(parts){const v=scope.find(parts[0]);return!!(v&&(v.kind==='func'||v.kind==='var'));},
    call(e,cx){return plCallExpr(e,scope,cx);},
    attr(e,cx){return plAttr(e,scope,cx);},
    field(e,cx){const b=evalE(e.base,cx);if(b&&b.rec){if(!(e.name in b.f))throw E('PLS-00302',"component '"+e.name+"' must be declared");return b.f[e.name];}if(b&&b.coll){return collMethod(b,e.name,[],cx,null);}if(b==null)throw E('ORA-06530','Reference to uninitialized composite');throw E('PLS-00487','Invalid reference to variable');},
    callon(e,cx){const b=evalE(e.base,cx);const args=e.args.map(a=>evalE(a,cx));if(b&&b.coll)return collGet(b,args[0]);throw E('PLS-00222',"no function with name exists in this scope");},
    cursorRid(name,cx){const v=scope.find(name);if(!v||!v.cur||!v.cur.open)throw E('ORA-01001','invalid cursor');const st=v.cur;if(st.pos<=0)throw E('ORA-01410','invalid ROWID');return st.rids?st.rids[st.pos-1]:null;},
    collOp(e,cx){return collOperator(e,cx);}
  };
}
/* reference to a PL/SQL name: returns {get,set,type} or undefined */
function plLookup(parts,scope,cx,node){
  const n0=parts[0];
  if(parts.length===1){
    if(n0==='SQLCODE'){const e=scope.find('$ERR');return{get:()=>e?e.v.num:0};}
    if(n0==='SQLERRM'){const e=scope.find('$ERR');return{get:()=>e?errText(e.v):'ORA-0000: normal, successful completion'};}
    if(n0==='INSERTING'||n0==='UPDATING'||n0==='DELETING'){const t=scope.find('$TRIG');if(t)return{get:()=>t.v.event===n0.slice(0,6)};}
  }
  /* label-qualified: outer.var */
  if(parts.length>=2){const ls=scope.findLabel(n0);if(ls){const v=ls.vars.get(parts[1]);if(v)return refPath(v,parts.slice(2),cx);}}
  const v=scope.find(n0);
  if(v){if(v.kind==='var'||v.kind==='param')return refPath(v,parts.slice(1),cx,node);
    if(v.kind==='cursor')return{get:()=>{throw E('PLS-00382','expression is of wrong type');}};
    if(v.kind==='func'&&parts.length===1)return{get:()=>callUnit(v.unit,[],{},cx,scope,v)};
    return undefined;}
  /* package member */
  if(parts.length>=2){const pk=pkgInstance(parts.length>=3&&cx.db.objs[parts[0]+'.'+parts[1]]?{owner:parts[0],name:parts[1]}:{owner:null,name:n0},cx,true);
    if(pk){const rest=pk.qualified?parts.slice(2):parts.slice(1);const m=pk.scope.vars.get(rest[0]);
      if(m&&(m.kind==='var'||m.kind==='param')){if(!pk.public(rest[0]))throw E('PLS-00302',"component '"+rest[0]+"' must be declared");return refPath(m,rest.slice(1),cx);}
      if(m&&m.kind==='func'&&rest.length===1)return{get:()=>{if(!m.unit.body&&!m.impl)throw pkgBodyErr(pk);return callUnit(m.impl||m.unit,[],{},cx,pk.scope,m);}};}}
  return undefined;
}
function refPath(v,rest,cx,node){
  if(!rest.length)return{get:()=>v.v,set:x=>{assignVar(v,x,cx);},type:v.type,v};
  const last=rest[rest.length-1];
  const container=()=>{let c=v.v;for(let i=0;i<rest.length-1;i++){if(c==null)throw E('ORA-06530','Reference to uninitialized composite');c=c.f?c.f[rest[i]]:undefined;}return c;};
  return{get:()=>{const c=container();if(c&&c.coll){return collMethod(c,last,[],cx,v);}if(c==null){if(v.type&&v.type.coll)throw E('ORA-06531','Reference to uninitialized collection');throw E('ORA-06530','Reference to uninitialized composite');}
      if(!c.rec)throw E('PLS-00487','Invalid reference to variable \''+v.name+'\'');if(!(last in c.f))throw E('PLS-00302',"component '"+last+"' must be declared");return c.f[last];},
    set:x=>{if(v.constant)throw E('PLS-00363',"expression '"+v.name+"' cannot be used as an assignment target");let c=container();if(c==null){if(v.type&&v.type.object){v.v=initObj(v.type);c=v.v;}else throw E('ORA-06530','Reference to uninitialized composite');}
      if(!(last in c.f))throw E('PLS-00302',"component '"+last+"' must be declared");c.f[last]=coerceV(x,c.types?c.types[last]:null,cx);}};
}
function initObj(t){const r={rec:1,f:{},types:{},tname:t.tname};for(const f of t.fields){r.f[f.name]=null;r.types[f.name]=f.type;}return r;}
function assignVar(v,x,cx){
  if(v.constant)throw E('PLS-00363',"expression '"+v.name+"' cannot be used as an assignment target");
  if(v.kind==='param'&&v.mode==='IN')throw E('PLS-00363',"expression '"+v.name+"' cannot be used as an assignment target");
  if(v.notNull&&x==null)throw E('ORA-06502','PL/SQL: numeric or value error');
  v.v=coerceV(x&&(x.rec||x.coll)?copyVal(x):x,v.type,cx);
}
function errText(e){if(!e)return'';if(e.userExc&&!e.code.startsWith('ORA-2'))return e.code==='ORA-06510'?'User-Defined Exception':e.message;return e.message;}
/* ---------- collections ---------- */
function collGet(c,k){
  if(c==null)throw E('ORA-06531','Reference to uninitialized collection');
  if(c.coll==='AA'){const key=normKey(c,k);if(!c.map.has(key))throw E('ORA-01403','no data found');return c.map.get(key);}
  const i=Math.trunc(toNum(k));if(i<1||i>c.items.length||c.items[i-1]===DELETED){if(c.coll==='VA'&&i>c.limit)throw E('ORA-06532','Subscript outside of limit');if(i>c.items.length||i<1)throw E('ORA-06533','Subscript beyond count');throw E('ORA-01403','no data found');}
  return c.items[i-1];
}
function normKey(c,k){if(k==null)throw E('ORA-06502','PL/SQL: numeric or value error: NULL index table key value');const kt=c.type&&c.type.key;if(kt&&isCharT(kt))return valToStr(k);return toNum(k);}
function collSet(c,k,v,cx){
  if(c==null)throw E('ORA-06531','Reference to uninitialized collection');
  const et=c.type&&c.type.elem;v=coerceV(v&&(v.rec||v.coll)?copyVal(v):v,et,cx);
  if(c.coll==='AA'){c.map.set(normKey(c,k),v);return;}
  const i=Math.trunc(toNum(k));if(c.coll==='VA'&&i>c.limit)throw E('ORA-06532','Subscript outside of limit');if(i<1||i>c.items.length)throw E('ORA-06533','Subscript beyond count');c.items[i-1]=v;
}
function aaKeys(c){return[...c.map.keys()].sort((a,b)=>typeof a==='number'?a-b:(a<b?-1:a>b?1:0));}
function collMethod(c,m,args,cx,v){
  const live=()=>c.items.map((x,i)=>x===DELETED?null:i+1).filter(x=>x!=null);
  if(c==null){if(m==='EXISTS')return false;throw E('ORA-06531','Reference to uninitialized collection');}
  switch(m){
    case'COUNT':return c.coll==='AA'?c.map.size:c.items.filter(x=>x!==DELETED).length;
    case'FIRST':{if(c.coll==='AA'){const k=aaKeys(c);return k.length?k[0]:null;}const l=live();return l.length?l[0]:null;}
    case'LAST':{if(c.coll==='AA'){const k=aaKeys(c);return k.length?k[k.length-1]:null;}const l=live();return l.length?l[l.length-1]:null;}
    case'NEXT':case'PRIOR':{const x=args[0];if(x==null)return null;const keys=c.coll==='AA'?aaKeys(c):live();if(m==='NEXT'){for(const k of keys)if(cmpVals(k,x)>0)return k;return null;}for(let i=keys.length-1;i>=0;i--)if(cmpVals(keys[i],x)<0)return keys[i];return null;}
    case'EXISTS':{const x=args[0];if(x==null)return false;if(c.coll==='AA')return c.map.has(normKey(c,x));const i=Math.trunc(toNum(x));return i>=1&&i<=c.items.length&&c.items[i-1]!==DELETED;}
    case'LIMIT':return c.coll==='VA'?c.limit:null;
    case'DELETE':{if(!args.length){if(c.coll==='AA')c.map.clear();else c.items.length=0;return null;}
      if(c.coll==='VA')throw E('PLS-00306',"wrong number or types of arguments in call to 'DELETE'");
      if(c.coll==='AA'){if(args.length===2){for(const k of aaKeys(c))if(cmpVals(k,args[0])>=0&&cmpVals(k,args[1])<=0)c.map.delete(k);}else c.map.delete(normKey(c,args[0]));return null;}
      const a=Math.trunc(toNum(args[0])),b=args.length===2?Math.trunc(toNum(args[1])):a;for(let i=a;i<=b;i++)if(i>=1&&i<=c.items.length)c.items[i-1]=DELETED;return null;}
    case'EXTEND':{if(c.coll==='AA')throw E('PLS-00306',"wrong number or types of arguments in call to 'EXTEND'");const n=args.length?Math.trunc(toNum(args[0])):1;
      if(c.coll==='VA'&&c.items.length+n>c.limit)throw E('ORA-06532','Subscript outside of limit');for(let i=0;i<n;i++)c.items.push(args.length===2?copyVal(c.items[Math.trunc(toNum(args[1]))-1]):(c.type&&c.type.elem&&c.type.elem.rec?initValue(c.type.elem,cx):null));return null;}
    case'TRIM':{if(c.coll==='AA')throw E('PLS-00306',"wrong number or types of arguments in call to 'TRIM'");const n=args.length?Math.trunc(toNum(args[0])):1;if(n>c.items.length)throw E('ORA-06533','Subscript beyond count');c.items.length-=n;return null;}
  }
  throw E('PLS-00302',"component '"+m+"' must be declared");
}
function collOperator(e,cx){
  if(e.t==='isempty'){const c=evalE(e.a,cx);if(c==null)return null;const r=collVals(c).length===0;return e.neg?!r:r;}
  if(e.t==='member'){const x=evalE(e.a,cx),c=evalE(e.b,cx);if(c==null)return null;const r=collVals(c).some(v=>v!=null&&x!=null&&cmpVals(v,x,cx)===0);return e.neg?!r:r;}
  if(e.t==='isaset'){const c=evalE(e.a,cx);if(c==null)return null;const ks=collVals(c).map(valKey);const r=new Set(ks).size===ks.length;return e.neg?!r:r;}
  if(e.t==='submultiset'){const a=collVals(evalE(e.a,cx)).map(valKey),b=collVals(evalE(e.b,cx)).map(valKey);const r=a.every(x=>b.includes(x));return e.neg?!r:r;}
  if(e.t==='multiset'){const A=evalE(e.a,cx),B=evalE(e.b,cx);const a=collVals(A),b=collVals(B);let items;
    if(e.op==='UNION')items=a.concat(b);else if(e.op==='INTERSECT'){const bk=b.map(valKey);items=a.filter(x=>bk.includes(valKey(x)));}else{const bk=b.map(valKey);items=a.filter(x=>!bk.includes(valKey(x)));}
    if(e.d){const s=new Set();items=items.filter(x=>{const k=valKey(x);if(s.has(k))return false;s.add(k);return true;});}return{coll:'NT',items,type:A.type,tname:A.tname};}
}
function plCastColl(v,t,cx){return v;}
function plCastMultiset(e,cx){const r=runQuery(e.q,cx);const tt=resolveTypeSpec(e.type,cx.plScope||null,cx);return{coll:tt.coll||'NT',items:r.rows.map(x=>x.length===1?x[0]:{rec:1,f:Object.fromEntries(r.cols.map((c,i)=>[c,x[i]]))}),type:tt,tname:tt.tname,limit:tt.limit};}
/* ---------- calls ---------- */
const OUT_BUF_MAX=1000000;
function dbmsOutput(m,args,cx){
  const s=cx.sess;
  if(m==='PUT_LINE'){if(args.length!==1)throw E('PLS-00306',"wrong number or types of arguments in call to 'PUT_LINE'");let v=args[0];if(v&&(v.rec||v.coll))throw E('PLS-00306',"wrong number or types of arguments in call to 'PUT_LINE'");
    const line=(s.outPart||'')+(v==null?'':valToStr(v,cx));s.outPart='';if(line.length>32767)throw E('ORA-20000','ORU-10028: line length overflow, limit of 32767 bytes per line');s.outBuf.push(line);return true;}
  if(m==='PUT'){s.outPart=(s.outPart||'')+(args[0]==null?'':valToStr(args[0],cx));return true;}
  if(m==='NEW_LINE'){s.outBuf.push(s.outPart||'');s.outPart='';return true;}
  if(m==='ENABLE'||m==='DISABLE')return true;
  return false;
}
function plCallExpr(e,scope,cx){
  /* returns undefined if the name is not a PL/SQL-visible callable */
  const parts=e.parts;const n0=parts[0];
  const argv=()=>e.args.map(a=>evalE(a,cx));
  if(parts.length===1){
    if(n0==='SQLERRM'&&e.args.length===1){const c=toNum(evalE(e.args[0],cx));if(c===0)return'ORA-0000: normal, successful completion';if(c===100)return'ORA-01403: no data found';if(c>0)return'-'+c+': non-ORACLE exception ';return'ORA-'+String(-c).padStart(5,'0')+': '+(ORA_MSG[-c]||'Message '+(-c)+' not found;  product=RDBMS; facility=ORA');}
    if(n0==='UPDATING'&&e.args.length===1){const t=scope.find('$TRIG');if(t){const col=String(evalE(e.args[0],cx)).toUpperCase();return t.v.event==='UPDATE'&&(!t.v.cols||t.v.cols.includes(col));}}
    if(n0==='RAISE_APPLICATION_ERROR'){const a=argv();const code=Math.trunc(toNum(a[0]));if(code>-20000||code<-20999)throw E('ORA-21000','error number argument to raise_application_error of '+code+' is out of range');const err=E('ORA-'+String(-code),a[1]==null?'':valToStr(a[1],cx));err.appErr=true;throw err;}
    const v=scope.find(n0);
    if(v){if(v.kind==='var'||v.kind==='param'){const c=v.v;if(c&&c.coll){const a=argv();if(a.length!==1)throw E('PLS-00306','wrong number or types of arguments');return collGet(c,a[0]);}if(v.type&&v.type.coll&&c==null)throw E('ORA-06531','Reference to uninitialized collection');if(v.type&&v.type.object===undefined&&c&&c.cursor)return undefined;throw E('PLS-00222',"no function with name '"+n0+"' exists in this scope");}
      if(v.kind==='func'||v.kind==='proc')return callUnit(v.unit,e.args,e.named||{},cx,scope,v);
      if(v.kind==='type'){return construct(v.type,argv(),cx);}}
    const st=resolveObj({owner:null,name:n0},cx,true);
    if(st&&st.type==='TYPE')return construct(schemaType(st,cx),argv(),cx);
  }
  if(parts.length>=2){
    const lab=scope.findLabel(n0);if(lab){const v=lab.vars.get(parts[1]);if(v&&(v.kind==='func'||v.kind==='proc'))return callUnit(v.unit,e.args,e.named||{},cx,lab,v);}
    const v=scope.find(n0);
    if(v&&(v.kind==='var'||v.kind==='param')){let c=v.v;for(let i=1;i<parts.length-1;i++){c=c&&c.f?c.f[parts[i]]:null;}
      if(c&&c.coll){const m=parts[parts.length-1];return collMethod(c,m,argv(),cx,v);}if(c==null&&v.type&&v.type.coll){if(parts[parts.length-1]==='EXISTS')return false;throw E('ORA-06531','Reference to uninitialized collection');}
      const fld=c&&c.f?c.f[parts[parts.length-1]]:undefined;if(fld&&fld.coll){const a=argv();return collGet(fld,a[0]);}}
    if(n0==='DBMS_OUTPUT'&&parts.length===2){if(dbmsOutput(parts[1],argv(),cx))return null;}
    if(n0==='DBMS_SQL'&&parts[1]==='RETURN_RESULT'){const c=argv()[0];if(!c||!c.cursor)throw E('ORA-29470','Effective userid or roles are not the same as when cursor was parsed');cx.sess.implicit=(cx.sess.implicit||[]).concat([c]);c.returned=true;return null;}
    if((n0==='DBMS_LOCK'||n0==='DBMS_SESSION')&&parts[1]==='SLEEP')return null;
    if(n0==='DBMS_UTILITY'&&parts[1]==='FORMAT_ERROR_BACKTRACE'){const er=scope.find('$ERR');return er?(er.v.extra||[]).filter(x=>/ORA-06512/.test(x)).join('\n')+'\n':null;}
    if(n0==='DBMS_UTILITY'&&parts[1]==='FORMAT_ERROR_STACK'){const er=scope.find('$ERR');return er?er.v.message+'\n':null;}
    if(n0==='DBMS_UTILITY'&&parts[1]==='FORMAT_CALL_STACK')return'----- PL/SQL Call Stack -----\n';
    if(n0==='DBMS_STATS')return null;
    if(n0==='DBMS_APPLICATION_INFO')return null;
    const pk=pkgInstance(parts.length>=3&&cx.db.objs[n0+'.'+parts[1]]&&cx.db.objs[n0+'.'+parts[1]].type==='PACKAGE'?{owner:n0,name:parts[1]}:{owner:null,name:n0},cx,true);
    if(pk){const rest=pk.qualified?parts.slice(2):parts.slice(1);const m=pk.scope.vars.get(rest[0]);
      if(!m||!pk.public(rest[0])){throw E('PLS-00302',"component '"+rest[0]+"' must be declared");}
      if(m.kind==='func'||m.kind==='proc'){if(!m.unit.body&&!m.impl)throw pkgBodyErr(pk);return callUnit(m.impl||m.unit,e.args,e.named||{},cx,pk.scope,m);}
      if(m.kind==='var'||m.kind==='param'){const c=m.v;if(c&&c.coll){const a=argv();return rest.length>1?collMethod(c,rest[1],a,cx,m):collGet(c,a[0]);}}
      if(m.kind==='type')return construct(m.type,argv(),cx);}
  }
  return undefined;
}
function construct(t,args,cx){
  if(t.rec&&t.object){const r=initObj(t);if(args.length!==t.fields.length)throw E('PLS-00306',"wrong number or types of arguments in call to '"+t.tname+"'");t.fields.forEach((f,i)=>{r.f[f.name]=coerceV(args[i],f.type,cx);});return r;}
  if(t.coll==='NT'||t.coll==='VA'){if(t.coll==='VA'&&args.length>t.limit)throw E('ORA-06532','Subscript outside of limit');return{coll:t.coll,items:args.map(a=>coerceV(a&&(a.rec||a.coll)?copyVal(a):a,t.elem,cx)),type:t,tname:t.tname,limit:t.limit};}
  if(t.coll==='AA')throw E('PLS-00222',"no function with name '"+t.tname+"' exists in this scope");
  if(t.rec)throw E('PLS-00222',"no function with name '"+t.tname+"' exists in this scope");
  return coerceV(args[0],t,cx);
}
function plCallFn(e,cx){/* SQL calling a stored function */
  const parts=e.parts;let o=null,owner=null;
  if(parts.length===1)o=resolveObj({owner:null,name:parts[0]},cx,true);
  else if(parts.length===2){o=cx.db.objs[parts[0]+'.'+parts[1]];if(!o||o.type==='PACKAGE')o=null;}
  if(o&&o.type==='FUNCTION'){checkObjPriv(o,'EXECUTE',cx);if(o.status==='INVALID')throw E('ORA-06575','Package or function '+o.name+' is in an invalid state');return callUnit(o.unit,e.args,e.named||{},cx,null,null,o);}
  if(o&&o.type==='PROCEDURE'&&!e.noParens)throw E('ORA-00904','"'+o.name+'": invalid identifier');
  if(o&&o.type==='TYPE')return construct(schemaType(o,cx),e.args.map(a=>evalE(a,cx)),cx);
  if(parts.length>=2){const pk=pkgInstance(parts.length===3?{owner:parts[0],name:parts[1]}:{owner:null,name:parts[0]},cx,true);
    if(pk){const fname=parts[parts.length-1];const m=pk.scope.vars.get(fname);if(!m||!pk.public(fname))throw E('ORA-00904','"'+parts.join('"."')+'": invalid identifier');
      if(m.kind==='func'){if(!m.unit.body&&!m.impl)throw pkgBodyErr(pk);return callUnit(m.impl||m.unit,e.args,e.named||{},cx,pk.scope,m);}
      if(m.kind==='var')throw E('ORA-06553',"PLS-221: '"+fname+"' is not a procedure or is undefined",[hint('SQL package ka variable/constant seedha nahi padh sakta. Function banao jo value RETURN kare, ya PL/SQL mein padho.')]);}}
  return undefined;
}
function plFnType(e){return null;}
let CALL_DEPTH=0;
function callUnit(u,argNodes,named,cx,defScope,decl,obj){
  if(u.forward&&decl&&decl.impl)u=decl.impl;
  if(!u.body){if(decl&&decl.impl)u=decl.impl;else throw E('PLS-00328','A subprogram body must be defined for the forward declaration of '+u.name+'.');}
  if(++CALL_DEPTH>200){CALL_DEPTH=0;throw E('ORA-06512','maximum call depth exceeded (recursion)');}
  try{
    const base=obj?new Scope(null,{unitName:obj.owner+'.'+obj.name,owner:obj.owner}):defScope;
    const sc=new Scope(base,{unit:u,label:u.name,unitName:obj?'"'+obj.owner+'.'+obj.name+'"':(defScope&&defScope.unitName)||null});
    const ucx=obj?sub(cx,{schema:obj.owner}):cx;
    const ps=u.params||[];const outs=[];
    const given=argNodes.length+Object.keys(named).length;
    if(argNodes.length>ps.length)throw E('PLS-00306',"wrong number or types of arguments in call to '"+u.name+"'");
    ps.forEach((pa,i)=>{const t=resolveTypeSpec(pa.type,base||sc,ucx,true);let node=i<argNodes.length?argNodes[i]:named[pa.name];
      if(node===undefined){if(pa.def==null||pa.mode!=='IN')throw E('PLS-00306',"wrong number or types of arguments in call to '"+u.name+"'");sc.vars.set(pa.name,{kind:'param',name:pa.name,mode:pa.mode,type:t,v:coerceV(evalE(pa.def,plCx(ucx,sc)),t,ucx)});return;}
      let v=null;if(pa.mode!=='OUT'){v=evalE(node,cx);v=coerceV(v&&(v.rec||v.coll)?copyVal(v):v,t,ucx);}else v=t&&(t.rec||t.coll)?initValue(t,ucx,sc):null;
      if(pa.mode!=='IN'){const ref=lvalue(node,cx);if(!ref)throw E('PLS-00363',"expression '"+(node.parts?node.parts.join('.'):'?')+"' cannot be used as an assignment target");outs.push({ref,name:pa.name});}
      sc.vars.set(pa.name,{kind:'param',name:pa.name,mode:pa.mode,type:t,v});});
    for(const k in named)if(!ps.some(pa=>pa.name===k))throw E('PLS-00306',"wrong number or types of arguments in call to '"+u.name+"'");
    let ret;
    try{runBlockBody(u,sc,ucx);if(u.kind==='FUNCTION')throw E('ORA-06503','PL/SQL: Function returned without value');}
    catch(s){if(s instanceof Sig&&s.kind==='return'){ret=s.value;}else{throw addStack(s,sc,obj);}}
    for(const o of outs){o.ref.set(sc.vars.get(o.name).v);}
    if(u.kind==='FUNCTION'){const rt=resolveTypeSpec(u.ret,base||sc,ucx,true);return coerceV(ret,rt,ucx);}
    return null;
  }finally{CALL_DEPTH--;}
}
function addStack(e,sc,obj){if(!(e instanceof OraErr))return e;const line=e.plLine;if(obj&&line&&!e.stackDone){e.extra=(e.extra||[]).concat(['ORA-06512: at "'+obj.owner+'.'+obj.name+'", line '+line]);e.plLine=null;}return e;}
function lvalue(node,cx){
  const pl=cx.pl&&cx.pl.scope;
  if(node.t==='bind'){const b=cx.binds;if(node.name==='NEW'){const rec=cx.trigNew;if(!rec)throw E('ORA-04082','NEW or OLD references not allowed in table level triggers');if(cx.trigNoNewWrite)throw E('ORA-04084','cannot change NEW values for this trigger type');const c=node.parts[1];return{set:x=>{if(!(c in rec.f))throw E('PLS-00049',"bad bind variable 'NEW."+c+"'");rec.f[c]=x;},get:()=>rec.f[c]};}
    if(node.name==='OLD')throw E('ORA-04085','cannot change the value of an OLD reference variable');
    if(b&&b[node.name]&&b[node.name].hostVar)return{set:x=>{const h=b[node.name];h.v=h.t&&!(x&&x.cursor)?coerce(x,h.t,cx,{pl:true}):x;},get:()=>b[node.name].v};
    throw E('SP2-0552','Bind variable "'+node.name+'" not declared.');}
  if(!pl)return null;
  if(node.t==='id'){const r=plLookup(node.parts,pl,cx);if(r&&r.set)return r;
    if(!r){if(node.parts.length===1&&node.parts[0]!=='SQLCODE')throw Object.assign(E('PLS-00201',"identifier '"+node.parts.join('.')+"' must be declared"),{line:node.line,col:node.col,compile:true});}
    return null;}
  if(node.t==='call'){const parts=node.parts;const v=pl.find(parts[0]);
    if(v&&(v.kind==='var'||v.kind==='param')){if(v.constant)throw E('PLS-00363',"expression '"+v.name+"' cannot be used as an assignment target");
      const getColl=()=>{let c=v.v;for(let i=1;i<parts.length;i++)c=c&&c.f?c.f[parts[i]]:null;return c;};
      return{set:x=>{const c=getColl();if(c==null&&v.type&&v.type.coll==='AA'){v.v={coll:'AA',map:new Map(),type:v.type,tname:v.type.tname};}collSet(getColl(),evalE(node.args[0],cx),x,cx);},get:()=>collGet(getColl(),evalE(node.args[0],cx))};}
    const pk=parts.length>=2&&pkgInstance({owner:null,name:parts[0]},cx,true);
    if(pk){const m=pk.scope.vars.get(parts[1]);if(m&&m.v&&m.v.coll)return{set:x=>collSet(m.v,evalE(node.args[0],cx),x,cx),get:()=>collGet(m.v,evalE(node.args[0],cx))};}
    return null;}
  if(node.t==='field'){const base=node.base;
    return{set:x=>{const b=evalE(base,cx);if(!b||!b.rec)throw E('ORA-06530','Reference to uninitialized composite');if(!(node.name in b.f))throw E('PLS-00302',"component '"+node.name+"' must be declared");b.f[node.name]=coerceV(x,b.types?b.types[node.name]:null,cx);},get:()=>{const b=evalE(base,cx);return b.f[node.name];}};}
  return null;
}
/* ---------- cursor attributes ---------- */
function plAttr(e,scope,cx){
  const n=e.parts.join('.');const a=e.attr;
  if(n==='SQL'){const s=scope.find('$SQL');const st=s?s.v:{rowcount:null};
    if(a==='ROWCOUNT')return st.rowcount;if(a==='FOUND')return st.rowcount==null?null:st.rowcount>0;if(a==='NOTFOUND')return st.rowcount==null?null:st.rowcount===0;if(a==='ISOPEN')return false;
    if(a==='BULK_ROWCOUNT')return st.bulk||[];throw E('PLS-00208','identifier \''+a+'\' is not a legal cursor attribute');}
  const v=scope.find(e.parts[0]);let cur=null;
  if(v&&v.kind==='cursor')cur=v.cur;else if(v&&(v.kind==='var'||v.kind==='param'))cur=v.v;
  if(!v){const r=plLookup(e.parts,scope,cx);if(r){const x=r.get();if(x&&x.cursor)cur=x;}else throw E('PLS-00201',"identifier '"+n+"' must be declared");}
  if(a==='ISOPEN')return!!(cur&&cur.open);
  if(!cur||!cur.open)throw E('ORA-01001','invalid cursor');
  if(a==='FOUND')return cur.fetched?cur.found:null;if(a==='NOTFOUND')return cur.fetched?!cur.found:null;if(a==='ROWCOUNT')return cur.rowcount;
  throw E('PLS-00208','identifier \''+a+'\' is not a legal cursor attribute');
}
/* ---------- declarations ---------- */
function declare(ds,sc,cx){
  for(const d of ds){
    try{
    switch(d.k){
      case'var':{const t=resolveTypeSpec(d.type,sc,cx);if(d.constant&&!d.def)throw Object.assign(E('PLS-00322',"declaration of a constant '"+d.name+"' must contain an initialization assignment"),{compile:true});
        if(d.notNull&&!d.def)throw Object.assign(E('PLS-00218','a variable declared NOT NULL must have an initialization assignment'),{compile:true});
        const v={kind:'var',name:d.name,type:t,constant:d.constant,notNull:d.notNull||!!(t&&t.notNull),v:null};
        if(d.def){v.v=coerceV(evalE(d.def,plCx(cx,sc)),t,cx);if(d.notNull&&v.v==null)throw E('ORA-06502','PL/SQL: numeric or value error');}else v.v=initValue(t,cx,sc);
        if(t&&t.refcur&&!d.def)v.v=null;
        sc.vars.set(d.name,v);break;}
      case'type':sc.vars.set(d.name,{kind:'type',name:d.name,type:typeFromDef(d.def,sc,cx,d.name)});break;
      case'cursor':sc.vars.set(d.name,{kind:'cursor',name:d.name,decl:d,cur:{open:false},scope:sc});break;
      case'exc':sc.vars.set(d.name,{kind:'exc',name:d.name,code:null,id:{}});break;
      case'pragma':if(d.name==='EXCEPTION_INIT'){const v=sc.find(d.exc);if(!v||v.kind!=='exc')throw Object.assign(E('PLS-00109','unknown exception name \''+d.exc+'\' in PRAGMA EXCEPTION_INIT'),{compile:true});v.code='ORA-'+String(Math.abs(d.code)).padStart(5,'0');if(d.code===100)v.code='ORA-01403';}
        if(d.name==='AUTONOMOUS_TRANSACTION')sc.autonomous=true;break;
      case'proc':case'func':{const ex=sc.vars.get(d.name);if(ex&&(ex.kind==='proc'||ex.kind==='func')&&ex.unit.forward&&!d.unit.forward){ex.impl=d.unit;ex.unit=d.unit;break;}
        sc.vars.set(d.name,{kind:d.k,name:d.name,unit:d.unit,scope:sc});break;}
    }
    }catch(e){if(e instanceof OraErr&&!e.plLine){e.plLine=d.line;e.plCol=d.col;}throw e;}
  }
}
/* ---------- packages ---------- */
function pkgInstance(q,cx,quiet){
  const owner=q.owner||curSchema(cx);let o=cx.db.objs[owner+'.'+q.name];
  if(!o&&!q.owner){const syn=resolveObj({owner:null,name:q.name},cx,true);if(syn&&syn.type==='PACKAGE')o=syn;}
  if(o&&o.type==='SYNONYM'){o=resolveObj(o.target,cx,true);}
  if(!o||o.type!=='PACKAGE')return null;
  if(o.status==='INVALID')throw E('ORA-04063','package "'+o.owner+'.'+o.name+'" has errors');
  if(o.owner!==curSchema(cx))checkObjPriv(o,'EXECUTE',cx);
  const sess=cx.sess;sess.pkg=sess.pkg||{};let inst=sess.pkg[o.key];
  if(!inst||inst.ver!==o.ver){
    const sc=new Scope(null,{unitName:'"'+o.owner+'.'+o.name+'"',label:o.name,owner:o.owner});const pcx=sub(cx,{schema:o.owner});
    const pubNames=new Set(o.spec.decls.map(d=>d.name));
    const body=cx.db.objs[o.key+'#BODY'];
    inst={obj:o,scope:sc,ver:o.ver,public:n=>pubNames.has(n),qualified:!!q.owner,body:!body?'none':body.status==='INVALID'?'invalid':'ok'};sess.pkg[o.key]=inst;
    declare(o.spec.decls,sc,pcx);
    if(body&&body.status!=='INVALID'){declare(body.unit.decls,sc,pcx);
      for(const d of body.unit.decls)if((d.k==='proc'||d.k==='func')&&!d.unit.forward){const m=sc.vars.get(d.name);if(m)m.impl=d.unit;}
      if(body.unit.init){try{runStmts(body.unit.init,sc,pcx);}catch(e){if(e instanceof Sig)throw e;if(body.unit.handlers&&body.unit.handlers.length){const h=findHandler(body.unit.handlers,e,sc);if(h){runStmts(h.body,sc,pcx);}else throw e;}else throw e;}}}
  }
  inst.qualified=!!q.owner;return inst;
}
/* calling a package subprogram whose body is missing or invalid */
function pkgBodyErr(pk){const o=pk.obj,nm=o.owner+'.'+o.name;
  const e=pk.body==='invalid'?E('ORA-04063','package body "'+nm+'" has errors',['ORA-06508: PL/SQL: could not find program unit being called: "'+nm+'"',hint('Package body INVALID hai. SHOW ERRORS PACKAGE BODY '+o.name.toLowerCase()+' se galti dekho.')])
    :E('ORA-04067','not executed, package body "'+nm+'" does not exist',['ORA-06508: PL/SQL: could not find program unit being called: "'+nm+'"',hint('Spec hai par body nahi. Pehle CREATE PACKAGE BODY '+o.name.toLowerCase()+' banao.')]);return e;}
/* ---------- execution ---------- */
function runBlockBody(b,sc,cx){
  declare(b.decls||[],sc,cx);
  const prevSql=sc.vars.get('$SQL');if(!sc.find('$SQL'))sc.vars.set('$SQL',{kind:'sys',v:{rowcount:null}});
  try{runStmts(b.body,sc,cx);}
  catch(e){
    if(e instanceof Sig)throw e;
    if(!(e instanceof OraErr)){throw e;}
    const h=findHandler(b.handlers||[],e,sc);
    if(!h)throw e;
    const hs=new Scope(sc,{});hs.vars.set('$ERR',{kind:'sys',v:e});
    runStmts(h.body,hs,cx);
  }
}
function excMatches(name,e,sc){
  if(name==='OTHERS')return true;
  if(PREDEF[name])return e.code===PREDEF[name]&&!e.userExc;
  const v=sc.find(name);
  if(v&&v.kind==='exc'){if(e.excId===v.id)return true;if(v.code&&e.code===v.code)return true;return false;}
  const parts=name.split('.');if(parts.length===2){/* package exception */return e.excName===name||e.excName===parts[1];}
  return false;
}
function findHandler(hs,e,sc){if(isCompileErr(e))return null;/* compile errors never reach a handler */for(const h of hs){if(h.names.some(n=>excMatches(n,e,sc)))return h;}return null;}
function runStmts(list,sc,cx){
  for(let i=0;i<list.length;i++){
    const s=list[i];
    try{runStmt(s,sc,cx);}
    catch(e){
      if(e instanceof Sig&&e.kind==='goto'){const k=list.findIndex(x=>x.t==='label'&&x.name===e.label);if(k>=0){i=k;continue;}}
      if(e instanceof OraErr&&e.plLine==null){e.plLine=s.line;if(e.plCol==null)e.plCol=s.col;}
      throw e;
    }
  }
}
function loopBody(s,sc,cx){/* returns 'break' to exit this loop */
  try{runStmts(s.body,sc,cx);}
  catch(e){if(e instanceof Sig&&(e.kind==='exit'||e.kind==='continue')){if(!e.label||e.label===s.label)return e.kind==='exit'?'break':'next';}throw e;}
  return'next';
}
function sqlStateSet(sc,n){const v=sc.find('$SQL');if(v)v.v={rowcount:n};}
function runStmt(s,sc,cx){
  const c=()=>plCx(cx,sc);
  switch(s.t){
    case'null':case'label':return;
    case'block':{const ns=new Scope(sc,{label:s.label});runBlockBody(s,ns,cx);return;}
    case'assign':{const ref=lvalue(s.target,c());if(!ref){const tg=s.target;if(tg.t==='id'||tg.t==='call')throw E('PLS-00201',"identifier '"+tg.parts.join('.')+"' must be declared");throw E('PLS-00363','expression cannot be used as an assignment target');}
      ref.set(evalE(s.e,c()));return;}
    case'if':{for(const[cond,body]of s.conds){if(evalB(cond,c())===true){runStmts(body,sc,cx);return;}}if(s.els)runStmts(s.els,sc,cx);return;}
    case'case':{const cc=c();if(s.base){const b=evalE(s.base,cc);for(const[w,body]of s.whens){const v=evalE(w,cc);if(b!=null&&v!=null&&cmpVals(b,v,cc)===0){runStmts(body,sc,cx);return;}}}
      else for(const[w,body]of s.whens){if(evalB(w,cc)===true){runStmts(body,sc,cx);return;}}
      if(s.els){runStmts(s.els,sc,cx);return;}throw E('ORA-06592','CASE not found while executing CASE statement');}
    case'loop':{let guard=0;const ls=s.label?new Scope(sc,{label:s.label}):sc;for(;;){if(++guard>2000000)throw E('ORA-06512','loop ran too long (2,000,000 iterations); infinite loop?');if(loopBody(s,ls,cx)==='break')return;}}
    case'while':{let guard=0;const ls=s.label?new Scope(sc,{label:s.label}):sc;while(evalB(s.cond,c())===true){if(++guard>2000000)throw E('ORA-06512','loop ran too long (2,000,000 iterations); infinite loop?');if(loopBody(s,ls,cx)==='break')return;}return;}
    case'fori':{const lo=evalE(s.lo,c()),hi=evalE(s.hi,c());if(lo==null||hi==null)throw E('ORA-06502','PL/SQL: numeric or value error');
      const a=Math.round(toNum(lo)),b=Math.round(toNum(hi));const ls=new Scope(sc,{label:s.label});const iv={kind:'var',name:s.var,type:{base:'PLS_INTEGER'},constant:true,v:a};ls.vars.set(s.var,iv);
      if(!s.rev){for(let i=a;i<=b;i++){iv.v=i;if(loopBody(s,ls,cx)==='break')return;}}else{for(let i=b;i>=a;i--){iv.v=i;if(loopBody(s,ls,cx)==='break')return;}}return;}
    case'forc':{const ls=new Scope(sc,{label:s.label});let st,close=()=>{};
      if(s.query){st=openQuery(s.query,null,sc,cx);}
      else{const v=sc.find(s.cur.parts[0]);if(!v||v.kind!=='cursor'){if(v&&v.v&&v.v.cursor)throw E('PLS-00221',"'"+s.cur.parts[0]+"' is not a procedure or is undefined");throw E('PLS-00201',"identifier '"+s.cur.parts.join('.')+"' must be declared");}
        if(v.cur.open)throw E('ORA-06511','PL/SQL: cursor already open');st=openCursor(v,s.cur.args,sc,cx);v.cur=st;close=()=>{st.open=false;};}
      const rv={kind:'var',name:s.rec,type:{rec:1,fields:st.cols.map((cn,i)=>({name:cn,type:st.types[i]}))},v:null,constant:false};ls.vars.set(s.rec,rv);
      try{for(;;){if(st.fuBroken)throw E('ORA-01002','fetch out of sequence',[hint('FOR UPDATE cursor ke loop mein COMMIT mat karo; loop ke baad ek baar COMMIT karo.')]);if(st.pos>=st.rows.length)break;const row=st.rows[st.pos++];st.rowcount++;st.found=true;st.fetched=true;rv.v=rowRec(st,row);if(loopBody(s,ls,cx)==='break')break;}}
      finally{close();}
      return;}
    case'forall':{const cc=c();let idx=[];if(s.indices){const col=evalE(s.indices,cc);idx=col.coll==='AA'?aaKeys(col):col.items.map((x,i)=>x===DELETED?null:i+1).filter(x=>x!=null);}else if(s.values){idx=collVals(evalE(s.values,cc));}else{const a=Math.round(toNum(evalE(s.lo,cc))),b=Math.round(toNum(evalE(s.hi,cc)));for(let i=a;i<=b;i++)idx.push(i);}
      const ls=new Scope(sc,{});const iv={kind:'var',name:s.var,type:{base:'PLS_INTEGER'},v:null,constant:true};ls.vars.set(s.var,iv);let total=0;const bulk=[];
      for(const i of idx){iv.v=i;const n=execSqlStmt(s.sql,ls,cx);total+=n;bulk.push(n);}sqlStateSet(sc,total);const v=sc.find('$SQL');if(v)v.v.bulk=bulk;return;}
    case'exit':case'continue':{if(s.cond&&evalB(s.cond,c())!==true)return;if(s.label&&!sc.findLabel(s.label))throw E('PLS-00373',"EXIT label '"+s.label+"' must label a LOOP statement");throw Object.assign(new Sig(s.t,s.label),{line:s.line,col:s.col});}
    case'goto':throw Object.assign(new Sig('goto',s.label),{line:s.line,col:s.col});
    case'return':throw new Sig('return',null,s.e?evalE(s.e,c()):undefined);
    case'raise':{if(!s.exc){const er=sc.find('$ERR');if(!er)throw E('PLS-00367','a RAISE statement with no exception name must be inside an exception handler');throw er.v;}
      if(PREDEF[s.exc]){const err=E(PREDEF[s.exc],ORA_MSG[parseInt(PREDEF[s.exc].slice(4),10)]||s.exc.toLowerCase().replace(/_/g,' '));throw err;}
      let v=sc.find(s.exc);
      if(!v&&s.exc.includes('.')){const[pk,nm]=s.exc.split('.');const inst=pkgInstance({owner:null,name:pk},cx,true);if(inst)v=inst.scope.vars.get(nm);}
      if(!v||v.kind!=='exc')throw E('PLS-00201',"identifier '"+s.exc+"' must be declared");
      const err=v.code?E(v.code,v.code==='ORA-01403'?'no data found':ORA_MSG[parseInt(v.code.slice(4),10)]||''):E('ORA-06510','PL/SQL: unhandled user-defined exception');err.excId=v.id;err.userExc=!v.code;if(!v.code)err.num=1;err.excName=s.exc;throw err;}
    case'pcall':{const e=s.e;const cc=c();
      if(e.t==='id'){const r=plCallExpr({t:'call',parts:e.parts,args:[]},sc,cc);if(r!==undefined)return;
        const v=sc.find(e.parts[0]);if(v&&(v.kind==='var'||v.kind==='param')&&v.v&&v.v.coll&&e.parts.length===2){collMethod(v.v,e.parts[1],[],cc,v);return;}
        callStored(e.parts,[],{},cc);return;}
      if(e.t==='call'){const r=plCallExpr(e,sc,cc);if(r!==undefined)return;callStored(e.parts,e.args,e.named||{},cc);return;}
      evalE(e,cc);return;}
    case'sql':{execSqlStmt(s.s,sc,cx);return;}
    case'open':{const v=sc.find(s.cur[0]);if(!v||v.kind!=='cursor')throw E('PLS-00201',"identifier '"+s.cur.join('.')+"' must be declared");if(v.cur.open)throw E('ORA-06511','PL/SQL: cursor already open');v.cur=openCursor(v,s.args,sc,cx);return;}
    case'openfor':{const ref=lvalue(s.cur,c());if(!ref)throw E('PLS-00201',"identifier must be declared");let st;
      if(s.q)st=openQuery(s.q,null,sc,cx);else{const sql=evalE(s.dyn,c());const p=new P(lex(String(sql)),String(sql));const q=parseQuery(p);const vals=s.using.map(u=>evalE(u,c()));st=openQuery(q,null,sc,sub(cx,{binds:posBinds(p.t,vals)}),true);}
      st.cursor=true;st.n=(cx.sess.curN=(cx.sess.curN||0)+1);ref.set(st);return;}
    case'fetch':{const cc=c();let cur;let v=null;if(s.cur.t==='id'){v=sc.find(s.cur.parts[0]);}
      if(v&&v.kind==='cursor')cur=v.cur;else{const r=evalE(s.cur,cc);cur=r;}
      if(!cur||!cur.open)throw E('ORA-01001','invalid cursor');
      if(cur.fuBroken)throw E('ORA-01002','fetch out of sequence');
      if(s.bulk){const lim=s.limit?Math.trunc(toNum(evalE(s.limit,cc))):Infinity;const rows=[];while(cur.pos<cur.rows.length&&rows.length<lim){rows.push(cur.rows[cur.pos++]);}cur.rowcount+=rows.length;cur.fetched=true;cur.found=rows.length>0;
        bulkInto(s.into,cur.cols,cur.types,rows,sc,cx);return;}
      cur.fetched=true;if(cur.pos>=cur.rows.length){cur.found=false;return;}
      const row=cur.rows[cur.pos++];cur.rowcount++;cur.found=true;intoTargets(s.into,cur.cols,row,sc,cx,cur.cursor?'ref':true);return;}
    case'close':{let v=null;if(s.cur.t==='id')v=sc.find(s.cur.parts[0]);let cur=v&&v.kind==='cursor'?v.cur:evalE(s.cur,c());if(!cur||!cur.open)throw E('ORA-01001','invalid cursor');cur.open=false;return;}
    case'execimm':{const sql=evalE(s.e,c());if(sql==null)throw E('ORA-06535','statement string in EXECUTE IMMEDIATE is NULL or 0 length');return execImmediate(String(sql),s,sc,cx);}
  }
  throw E('PLS-00103','unsupported statement');
}
function rowRec(st,row){const r={rec:1,f:{},types:{}};st.cols.forEach((cn,i)=>{r.f[cn]=row[i];r.types[cn]=st.types[i];});return r;}
function openCursor(v,argNodes,sc,cx){
  const d=v.decl;const cs=new Scope(v.scope||sc,{});
  (d.params||[]).forEach((pa,i)=>{const t=resolveTypeSpec(pa.type,sc,cx,true);const node=argNodes[i];let val;if(node)val=evalE(node,plCx(cx,sc));else if(pa.def)val=evalE(pa.def,plCx(cx,sc));else throw E('PLS-00306',"wrong number or types of arguments in call to '"+d.name+"'");cs.vars.set(pa.name,{kind:'param',mode:'IN',name:pa.name,type:t,v:coerceV(val,t,cx)});});
  if(argNodes.length>(d.params||[]).length)throw E('PLS-00306',"wrong number or types of arguments in call to '"+d.name+"'");
  if(!d.query)throw E('PLS-00321','expression in a cursor declaration is not a query');
  return openQuery(d.query,null,cs,cx);
}
function openQuery(q,_,sc,cx,dyn){
  const r=runQuery(q,plCx(cx,sc,{stmtCache:new Map(),noCache:false}));
  const st={open:true,rows:r.rows,cols:r.cols,types:r.types,rids:r.rids,pos:0,rowcount:0,found:false,fetched:false,forUpdate:!!q.forUpdate};
  if(q.forUpdate)(cx.sess.fuCurs=cx.sess.fuCurs||[]).push(st);return st;
}
function intoTargets(targets,cols,row,sc,cx,isFetch){
  const cc=plCx(cx,sc);
  if(targets.length===1){const ref=lvalue(targets[0],cc);if(!ref)throw E('PLS-00201',"identifier '"+(targets[0].parts||[]).join('.')+"' must be declared");
    let cur;try{cur=ref.get();}catch(e){cur=undefined;}const rt=ref.type||(ref.v&&ref.v.type);
    if((rt&&rt.rec)||(cur&&cur.rec)){const rec={rec:1,f:{},types:{}};const tf=rt&&rt.fields?rt.fields:null;
      if(tf&&tf.length&&tf.length!==cols.length&&!rt.any)throw E(isFetch?'ORA-06504':'ORA-00913',isFetch?'PL/SQL: Return types of Result Set variables or query do not match':'too many values');
      cols.forEach((cn,i)=>{const fname=tf&&tf[i]?tf[i].name:cn;rec.f[fname]=row[i];});ref.set(rec);return;}}
  if(targets.length!==cols.length){if(isFetch==='ref')throw E('ORA-06504','PL/SQL: Return types of Result Set variables or query do not match');if(isFetch)throw E('PLS-00394','wrong number of values in the INTO list of a FETCH statement');throw E(targets.length<cols.length?'ORA-00913':'ORA-00947',targets.length<cols.length?'too many values':'not enough values');}
  targets.forEach((t,i)=>{const ref=lvalue(t,cc);if(!ref)throw E('PLS-00201',"identifier '"+(t.parts||[]).join('.')+"' must be declared");ref.set(row[i]);});
}
function bulkInto(targets,cols,types,rows,sc,cx){
  const cc=plCx(cx,sc);
  if(targets.length===1&&cols.length>1){const ref=lvalue(targets[0],cc);const coll=ref.get();const t=(ref.v&&ref.v.type)||(coll&&coll.type);
    const items=rows.map(r=>{const rec={rec:1,f:{},types:{}};const tf=t&&t.elem&&t.elem.fields;cols.forEach((cn,i)=>{rec.f[tf&&tf[i]?tf[i].name:cn]=r[i];});return rec;});
    ref.set(t&&t.coll==='AA'?{coll:'AA',map:new Map(items.map((x,i)=>[i+1,x])),type:t}:{coll:t?t.coll:'NT',items,type:t,limit:t&&t.limit});return;}
  if(targets.length!==cols.length)throw E(targets.length<cols.length?'ORA-00913':'ORA-00947',targets.length<cols.length?'too many values':'not enough values');
  targets.forEach((tg,k)=>{const ref=lvalue(tg,cc);const coll=ref.get();const t=(ref.v&&ref.v.type)||(coll&&coll.type);if(!t||!t.coll)throw E('PLS-00497','cannot mix between single row and multi-row (BULK) in INTO list');
    const items=rows.map(r=>r[k]);ref.set(t.coll==='AA'?{coll:'AA',map:new Map(items.map((x,i)=>[i+1,x])),type:t}:{coll:t.coll,items,type:t,limit:t.limit});});
}
function callStored(parts,args,named,cx){
  let o=null;if(parts.length===1)o=resolveObj({owner:null,name:parts[0]},cx,true);else if(parts.length===2){o=cx.db.objs[parts[0]+'.'+parts[1]];if(o&&o.type==='PACKAGE')o=null;}
  if(o&&(o.type==='PROCEDURE'||o.type==='FUNCTION')){checkObjPriv(o,'EXECUTE',cx);if(o.status==='INVALID')throw E('PLS-00905','object '+o.owner+'.'+o.name+' is invalid');
    if(o.type==='FUNCTION')throw E('PLS-00221',"'"+o.name+"' is not a procedure or is undefined");return callUnit(o.unit,args,named,cx,null,null,o);}
  throw E('PLS-00201',"identifier '"+parts.join('.')+"' must be declared");
}
function execSqlStmt(sq,sc,cx){const mark=tx(cx).undo.length;try{return execSqlStmt0(sq,sc,cx);}catch(e){if(!['commit','rollback','savepoint'].includes(sq.t))rollbackTo(cx,mark);throw e;}}
function noTxInTrig(w,sc,cx){if(!cx.inTrig)return;for(let s=sc;s;s=s.parent)if(s.autonomous)return;throw E('ORA-04092','cannot '+w+' in a trigger',[hint('Trigger ke andar COMMIT/ROLLBACK nahi chalta; transaction wahi khatam karta hai jisne DML chalaya.')]);}
/* COMMIT/ROLLBACK breaks open FOR UPDATE cursors: the next fetch gives ORA-01002 */
function fuBreak(cx){const l=cx.sess.fuCurs;if(!l)return;for(const st of l)if(st.open)st.fuBroken=true;cx.sess.fuCurs=[];}
function execSqlStmt0(sq,sc,cx){
  const cc=plCx(cx,sc,{stmtCache:new Map(),noCache:false});
  cc.returning=(ret,o)=>(tbl,row,c2)=>{const desc=tableDesc(tbl);const f={d:[desc],v:[row.v],rid:[row.rid],up:null,depth:0};const vals=ret.exprs.map(x=>evalE(x,sub(c2,{f})));intoTargets(ret.into,ret.exprs.map((x,i)=>'C'+i),vals,sc,cx);};
  switch(sq.t){
    case'query':{const core=sq.body;
      if(core.t==='select'&&core.into){const r=runQuery(sq,cc);
        if(core.bulk){bulkInto(core.into,r.cols,r.types,r.rows,sc,cx);sqlStateSet(sc,r.rows.length);return r.rows.length;}
        if(!r.rows.length)throw E('ORA-01403','no data found');if(r.rows.length>1)throw E('ORA-01422','exact fetch returns more than requested number of rows');
        intoTargets(core.into,r.cols,r.rows[0],sc,cx);sqlStateSet(sc,1);return 1;}
      throw E('PLS-00428','an INTO clause is expected in this SELECT statement');}
    case'insert':{const r=execInsert(sq,cc);sqlStateSet(sc,r.n);return r.n;}
    case'insertMulti':{const r=execInsertMulti(sq,cc);sqlStateSet(sc,r.n);return r.n;}
    case'update':{const r=execUpdate(sq,cc);sqlStateSet(sc,r.n);return r.n;}
    case'delete':{const r=execDelete(sq,cc);sqlStateSet(sc,r.n);return r.n;}
    case'merge':{const r=execMerge(sq,cc);sqlStateSet(sc,r.n);return r.n;}
    case'commit':noTxInTrig('COMMIT',sc,cx);commitTx(cx);fuBreak(cx);return 0;
    case'rollback':{noTxInTrig('ROLLBACK',sc,cx);if(!sq.to)fuBreak(cx);const t=tx(cx);if(sq.to){if(!(sq.to in t.sp))throw E('ORA-01086','savepoint \''+sq.to+'\' never established in this session or is invalid');rollbackTo(cx,t.sp[sq.to]);}else{rollbackTo(cx,0);t.sp={};}return 0;}
    case'savepoint':tx(cx).sp[sq.name]=tx(cx).undo.length;return 0;
    case'lock':return 0;
  }
  throw E('PLS-00103','unsupported SQL in PL/SQL');
}
function execImmediate(sql,s,sc,cx){
  const text=sql.trim().replace(/;\s*$/,s.e&&/^\s*(BEGIN|DECLARE)/i.test(sql)?';':'');
  const vals=s.using.map(u=>u.mode==='IN'?evalE(u.e,plCx(cx,sc)):null);
  const outRefs=s.using.map(u=>u.mode!=='IN'?lvalue(u.e,plCx(cx,sc)):null);
  const toks0=lex(text);const bcx=sub(cx,{binds:posBinds(toks0,vals)});
  if(/^\s*(BEGIN|DECLARE)/i.test(text)){const binds={};const names=[];text.replace(/:(\w+)/g,(m,n)=>{if(!names.includes(n.toUpperCase()))names.push(n.toUpperCase());});
    names.forEach((n,i)=>{binds[n]={hostVar:true,v:vals[i],t:null};});const r=plRunBlock(text,sub(cx,{binds}),null,{quiet:true});names.forEach((n,i)=>{if(outRefs[i])outRefs[i].set(binds[n].v);});return;}
  const p=new P(lex(text),text);const sq=parseSqlStatement(p);
  if(!sq){p.i=0;const out={ok:()=>{},say:()=>{},dim:()=>{},err:()=>{},push:()=>{},lines:[]};
    if(dbaStatement(p,bcx,out)){commitTx(cx);sqlStateSet(sc,0);return;}
    p.i=0;if(p.isAnyW(['CREATE','ALTER','DROP'])&&plDdl(p,text,bcx,out))return;throw E('ORA-00900','invalid SQL statement');}
  if(!p.eof())throw E('ORA-00933','SQL command not properly ended');
  if(sq.t==='query'){const r=runQuery(sq,plCx(bcx,sc,{stmtCache:new Map()}));if(s.into){if(s.bulk){bulkInto(s.into,r.cols,r.types,r.rows,sc,cx);return;}if(!r.rows.length)throw E('ORA-01403','no data found');if(r.rows.length>1)throw E('ORA-01422','exact fetch returns more than requested number of rows');intoTargets(s.into,r.cols,r.rows[0],sc,cx);}sqlStateSet(sc,r.rows.length);return;}
  const ddl=['createTable','alterTable','dropTable','truncate','rename','createView','dropView','createIndex','dropIndex','createSeq','alterSeq','dropSeq','createSyn','dropSyn','flashback','purge','comment','alterIndex'];
  if(ddl.includes(sq.t)){commitTx(cx);const out={ok:()=>{},say:()=>{},dim:()=>{},err:()=>{},push:()=>{},lines:[]};execDdlQuiet(sq,bcx);sqlStateSet(sc,0);return;}
  if(sq.t==='alterSession'){execAlterSession(sq,cx);return;}
  const n=execSqlStmt(sq,sc,bcx);sqlStateSet(sc,n);
}
function posBinds(toks,vals){const m=new Map();let i=0;for(const t of toks)if(t.k==='bind'){if(i>=vals.length)throw E('ORA-01008','not all variables bound');m.set(t.line+':'+t.col,vals[i++]);}if(i<vals.length)throw E('ORA-01006','bind variable does not exist');return{__byPos:m};}
function execDdlQuiet(s,cx){const m={createTable:execCreateTable,alterTable:execAlterTable,dropTable:execDropTable,truncate:execTruncate,rename:execRename,createView:execCreateView,dropView:execDropView,createIndex:execCreateIndex,dropIndex:execDropIndex,createSeq:execCreateSeq,alterSeq:execAlterSeq,dropSeq:execDropSeq,createSyn:execCreateSyn,dropSyn:execDropSyn,flashback:execFlashback};
  if(m[s.t])return m[s.t](s,cx);if(s.t==='comment')return;}
/* ---------- compile-time name check (catches PLS-00201 before running) ---------- */
function plCheck(unit,cx,extraScope){
  const errs=[];
  const hintOf=e=>(e.extra||[]).find(x=>/^\(/.test(x))||null;
  const push=(e,node,msg2)=>{errs.push({line:node&&node.line||e.line||1,col:node&&node.col||e.col||1,text:e.message,hint:hintOf(e)});errs.push({line:node&&node.line||1,col:node&&node.col||1,text:msg2||'PL/SQL: Statement ignored'});};
  const scopes=[];const known=n=>{for(let i=scopes.length-1;i>=0;i--)if(scopes[i].has(n))return true;return false;};
  const hid=new Map();/* scope index -> subprogram names declared later in that scope (not visible yet) */
  const isHidden=n=>{for(let i=scopes.length-1;i>=0;i--)if(scopes[i].has(n)){const h=hid.get(i);return!!(h&&h.has(n));}return false;};
  const declOf=n=>{for(let i=scopes.length-1;i>=0;i--){const s=scopes[i];if(s.has(n))return s.get?s.get(n)||null:null;}if(extraScope){const v=extraScope.find(n);if(v)return v.decl||null;}return null;};
  /* compile-time type of a declared name: bool / cur / rec / coll / obj / scalar (null = unknown) */
  const tinfo=(t,depth)=>{if(!t||(depth||0)>5)return null;const b=t.base;
    if(b==='BOOLEAN')return{cat:'bool'};if(b==='SYS_REFCURSOR')return{cat:'cur'};
    if(b==='%ROWTYPE')return{cat:'rec',key:'R:'+t.ref,rowtype:t.ref};
    if(b==='%TYPE'){const ps=t.ref.split('.');if(ps.length===1){const d=declOf(ps[0]);if(d&&(d.k==='var'||d.k==='param'))return tinfo(d.type,(depth||0)+1);}return null;}
    if(b==='USER'){if(t.name.includes('.'))return null;const d=declOf(t.name);
      if(d&&d.k==='type'){const k=d.def.kind;if(k==='record')return{cat:'rec',key:'T:'+t.name,fields:d.def.fields};if(k==='refcur')return{cat:'cur',ret:d.def.ret};if(k==='subtype')return tinfo(d.def.base,(depth||0)+1);return{cat:'coll'};}
      if(!d&&!known(t.name)){const so=resolveObj({owner:null,name:t.name},cx,true);if(so&&so.type==='TYPE'&&so.def)return so.def.kind==='record'?{cat:'obj'}:{cat:'coll'};}return null;}
    return{cat:'scalar'};};
  const BOOLOPS=new Set(['cmp','not','isnull','like','between','in','exists']);
  const etype=e=>{if(!e)return null;if(e.t==='lit')return typeof e.v==='boolean'?{cat:'bool'}:e.v==null?null:{cat:'scalar'};
    if(BOOLOPS.has(e.t)||(e.t==='bin'&&(e.op==='AND'||e.op==='OR')))return{cat:'bool'};
    if(e.t==='id'&&e.parts.length===1){const n=e.parts[0];if((n==='TRUE'||n==='FALSE')&&!known(n))return{cat:'bool'};const d=declOf(n);if(d&&(d.k==='var'||d.k==='param'))return tinfo(d.type);if(d&&d.k==='cursor')return{cat:'cursor'};}
    return null;};
  const tabCols=ref=>{const ps=ref.split('.');const d=ps.length===1?declOf(ps[0]):null;if(d)return null;if(known(ps[0])&&ps.length===1)return null;
    const o=resolveObj(ps.length===2?{owner:ps[0],name:ps[1]}:{owner:null,name:ps[0]},cx,true);return o&&o.type==='TABLE'&&o.cols?o.cols.filter(c=>!c.invisible&&!c.unused).length:null;};
  const selCount=q=>{if(!q||!q.body||q.body.t!=='select')return null;let n=0;for(const it of q.body.items){if(it.star){if(it.qual&&it.qual.length)return null;const fr=q.body.from||[];if(fr.length!==1||fr[0].t!=='tab')return null;const c=tabCols((fr[0].q.owner?fr[0].q.owner+'.':'')+fr[0].q.name);if(c==null)return null;n+=c;}else n++;}return n;};
  const recCompat=(a,b)=>{if(a.key===b.key)return true;if(a.fields&&b.fields)return false;
    const na=a.fields?a.fields.length:tabCols(a.rowtype),nb=b.fields?b.fields.length:tabCols(b.rowtype);return na==null||nb==null||na===nb;};
  const PKG_MEMBERS={DBMS_OUTPUT:['PUT_LINE','PUT','NEW_LINE','ENABLE','DISABLE','GET_LINE','GET_LINES','CHARARR','DBMSOUTPUT_LINESARRAY'],
    DBMS_SQL:['RETURN_RESULT','GET_NEXT_RESULT','OPEN_CURSOR','PARSE','BIND_VARIABLE','BIND_ARRAY','DEFINE_COLUMN','DEFINE_ARRAY','EXECUTE','EXECUTE_AND_FETCH','FETCH_ROWS','COLUMN_VALUE','VARIABLE_VALUE','CLOSE_CURSOR','IS_OPEN','DESCRIBE_COLUMNS','DESCRIBE_COLUMNS2','DESCRIBE_COLUMNS3','TO_REFCURSOR','TO_CURSOR_NUMBER','LAST_ERROR_POSITION','LAST_ROW_COUNT','LAST_ROW_ID','LAST_SQL_FUNCTION_CODE','NATIVE','V6','V7','VARCHAR2_TABLE','NUMBER_TABLE','DATE_TABLE','CLOB_TABLE','DESC_TAB','DESC_REC','VARCHAR2S','VARCHAR2A']};
  const BUILTIN=new Set(['RAISE_APPLICATION_ERROR','SQLCODE','SQLERRM','SYSDATE','SYSTIMESTAMP','USER','UID','CURRENT_DATE','CURRENT_TIMESTAMP','LOCALTIMESTAMP','DBTIMEZONE','SESSIONTIMEZONE','TRUE','FALSE','NULL','INSERTING','UPDATING','DELETING','ROWNUM','LEVEL','SQL']);
  const PKGS=new Set(['DBMS_OUTPUT','DBMS_SQL','DBMS_LOCK','DBMS_SESSION','DBMS_UTILITY','DBMS_RANDOM','DBMS_LOB','DBMS_STATS','DBMS_APPLICATION_INFO','UTL_RAW','DBMS_XPLAN','APEX_UTIL','STANDARD','DBMS_ASSERT']);
  const exists=(parts)=>{const n=parts[0];if(known(n)||BUILTIN.has(n)||PKGS.has(n)||FN[n]||FN[parts.join('.')]||PREDEF[n])return true;if(extraScope&&extraScope.find(n))return true;
    if(resolveObj({owner:null,name:n},cx,true))return true;if(cx.db.users[n])return true;if(n==='NEW'||n==='OLD')return true;return false;};
  const walkE=(e,node)=>{if(!e||typeof e!=='object')return;
    if(e.t==='sub'||e.t==='exists'||e.t==='castms')return;if(e.q&&e.t!=='id')return;
    if((e.t==='id'||e.t==='call'||e.t==='attr')&&isHidden(e.parts[0]))throw Object.assign(E('PLS-00313',"'"+e.parts[0]+"' not declared in this scope",[hint('Private subprogram ko use karne se pehle declare karo, ya upar forward declaration likho.')]),{line:e.line||node.line,col:e.col||node.col});
    if(e.t==='id'||e.t==='call'||e.t==='attr'){if(!exists(e.parts)){throw Object.assign(E('PLS-00201',"identifier '"+e.parts.join('.')+"' must be declared"),{line:e.line||node.line,col:e.col||node.col});}
      if(e.t!=='attr')typeChecks(e,node);
      if(!known(e.parts[0])){const so=resolveObj({owner:e.parts.length>1&&cx.db.users[e.parts[0]]?e.parts[0]:null,name:e.parts.length>1&&cx.db.users[e.parts[0]]?e.parts[1]:e.parts[0]},cx,true);if(so&&['PROCEDURE','FUNCTION','PACKAGE'].includes(so.type)&&so.status==='INVALID')throw Object.assign(E('PLS-00905','object '+so.owner+'.'+so.name+' is invalid'),{line:e.line||node.line,col:e.col||node.col});}}
    if(e.t==='cmp'){const ta=etype(e.a),tb=etype(e.b);if((ta&&ta.cat==='rec')||(tb&&tb.cat==='rec'))throw Object.assign(E('PLS-00306',"wrong number or types of arguments in call to '"+e.op+"'",[hint('Poore record ko = se compare nahi kar sakte; field-by-field compare karo.')]),{line:node.line,col:node.col});}
    for(const k in e){if(k==='over'||k==='within')continue;const v=e[k];if(v&&typeof v==='object'){if(Array.isArray(v))v.forEach(x=>{if(x&&x.t)walkE(x,node);else if(Array.isArray(x))x.forEach(y=>y&&y.t&&walkE(y,node));});else if(v.t)walkE(v,node);}}};
  const typeChecks=(e,node)=>{const at=x=>Object.assign(x,{line:e.line||node.line,col:e.col||node.col});const n0=e.parts[0];const d0=declOf(n0);
    if(e.t==='id'&&d0&&d0.k==='type')throw at(E('PLS-00330','invalid use of type name or subtype name',[hint(n0+' ek TYPE hai, variable nahi. Pehle variable declare karo: v '+n0.toLowerCase()+';')]));
    if(e.parts.length===2&&!known(n0)&&!(extraScope&&extraScope.find(n0))){
      if(PKG_MEMBERS[n0]&&!PKG_MEMBERS[n0].includes(e.parts[1]))throw at(E('PLS-00302',"component '"+e.parts[1]+"' must be declared"));
      const po=PKGS.has(n0)?null:resolveObj({owner:null,name:n0},cx,true);if(po&&po.type==='PACKAGE'&&po.spec&&!po.spec.decls.some(x=>x.name===e.parts[1]))throw at(E('PLS-00302',"component '"+e.parts[1]+"' must be declared"));}
    if(e.t==='call'&&n0==='DBMS_OUTPUT'&&e.parts.length===2&&!known(n0)){const m=e.parts[1];
      const t=(m==='PUT_LINE'||m==='PUT')&&e.args.length===1?etype(e.args[0]):null;
      const bad=m==='NEW_LINE'?e.args.length>0:(m==='PUT_LINE'||m==='PUT')?(e.args.length!==1||!!(t&&t.cat!=='scalar')):false;
      const H={bool:'BOOLEAN seedha print nahi hota. Aise likho: CASE WHEN v THEN \'TRUE\' ELSE \'FALSE\' END.',cur:'Cursor print nahi hota. FETCH karke columns print karo, ya DBMS_SQL.RETURN_RESULT(c) use karo.',cursor:'Cursor print nahi hota. FETCH karke columns print karo.',rec:'Poora record print nahi hota. Fields print karo, jaise r.name.',coll:'Poori collection print nahi hoti. Loop chala ke ek-ek element print karo.',obj:'Object poora print nahi hota. Uske attributes print karo.'};
      if(bad)throw at(E('PLS-00306',"wrong number or types of arguments in call to '"+m+"'",t&&H[t.cat]?[hint(H[t.cat])]:[hint(m+' ko ek hi argument chahiye: text, number ya date.')]));}};
  const checkSql=(sq,node)=>{
    if(forUpdateBad(sq.t==='query'?sq:null))throw Object.assign(E('ORA-01786','FOR UPDATE of this query expression is not allowed'),{line:node.line,col:node.col,sqlPl:true});
    {const sqlFn=n=>(n.t==='id'||n.t==='call')&&n.parts&&n.parts.length===1&&(n.parts[0]==='SQLERRM'||n.parts[0]==='SQLCODE')&&!known(n.parts[0]);let bad=null;
      if(sq.t==='insert'&&sq.rows){scanAst(sq.rows,n=>{if(!bad&&sqlFn(n))bad=n;});if(bad)throw Object.assign(E('ORA-00984','column not allowed here',[hint(bad.parts[0]+' ko SQL ke andar seedha nahi likh sakte. Pehle variable mein daalo: v_msg := '+bad.parts[0]+';')]),{line:node.line,col:node.col,sqlPl:true});}
      scanAst(sq,n=>{if(!bad&&sqlFn(n))bad=n;});if(bad)throw Object.assign(E('ORA-00904','"'+bad.parts[0]+'": invalid identifier',[hint(bad.parts[0]+' ko pehle variable mein daalo, phir SQL mein woh variable use karo.')]),{line:node.line,col:node.col,sqlPl:true});}
    {let co=null;scanAst(sq,n=>{if(!co&&n.t==='curof')co=n;});
      if(co){const d=declOf(co.cur);if(!d&&!known(co.cur)&&!(extraScope&&extraScope.find(co.cur)))throw Object.assign(E('PLS-00201',"identifier '"+co.cur+"' must be declared"),{line:node.line,col:node.col,plsSql:true});
        if(d&&d.k==='cursor'&&d.query&&!d.query.forUpdate)throw Object.assign(E('PLS-00404',"cursor '"+co.cur+"' must be declared with FOR UPDATE to use with CURRENT OF",[hint('Cursor ki query ke end mein FOR UPDATE lagao, tab hi WHERE CURRENT OF chalega.')]),{line:node.line,col:node.col,plsSql:true});}}const tabs=[];scanAst(sq,n=>{if(n.t==='tab'&&n.q&&!n.q.link)tabs.push(n.q);if(n.tg&&n.tg.q)tabs.push(n.tg.q);});
    const ctes=new Set();scanAst(sq,n=>{if(Array.isArray(n.with))n.with.forEach(w=>ctes.add(w.name));});
    for(const q of tabs){if(!q.owner&&ctes.has(q.name))continue;const o=resolveObj(q,cx,true);if(!o&&!(dictView(q.name,cx)))throw Object.assign(E('ORA-00942','table or view does not exist'),{line:node.line,col:node.col,sqlPl:true});}};
  const declScope=ds=>{const s=new Map();for(const d of ds||[])s.set(d.name,d);return s;};
  const paramScope=(ps,ds)=>{const m=new Map();for(const p of ps||[])m.set(p.name,{k:'param',name:p.name,type:p.type,mode:p.mode});for(const[k,v]of declScope(ds))m.set(k,v);return m;};
  const walkS=list=>{for(const s of list){try{
    switch(s.t){
      case'assign':{walkE(s.e,s);walkE(s.target.t==='bind'?null:s.target,s);
        const tt=s.target.t==='id'&&s.target.parts.length===1?etype(s.target):null,st=s.e.t==='id'&&s.e.parts.length===1?etype(s.e):s.e.t==='lit'?etype(s.e):null;
        if(tt&&st&&(tt.cat==='rec'||st.cat==='rec')&&!(tt.cat==='rec'&&st.cat==='rec'&&recCompat(tt,st))&&!(st.cat==='scalar'&&s.e.t==='lit'&&s.e.v==null))throw Object.assign(E('PLS-00382','expression is of wrong type',[hint('Record sirf usi TYPE ke record mein assign hota hai; alag type ho toh field-by-field copy karo.')]),{line:s.line,col:s.col});
        break;}
      case'if':s.conds.forEach(([c,b])=>{walkE(c,s);walkS(b);});if(s.els)walkS(s.els);break;
      case'case':walkE(s.base,s);s.whens.forEach(([w,b])=>{walkE(w,s);walkS(b);});if(s.els)walkS(s.els);break;
      case'loop':walkS(s.body);break;case'while':walkE(s.cond,s);walkS(s.body);break;
      case'fori':walkE(s.lo,s);walkE(s.hi,s);scopes.push(new Set([s.var]));walkS(s.body);scopes.pop();break;
      case'forc':if(s.query)checkSql(s.query,s);else if(!exists(s.cur.parts))throw Object.assign(E('PLS-00201',"identifier '"+s.cur.parts.join('.')+"' must be declared"),{line:s.line,col:s.col});scopes.push(new Set([s.rec]));walkS(s.body);scopes.pop();break;
      case'block':{const ds=declScope(s.decls);if(s.label)ds.set(s.label,{k:'label'});scopes.push(ds);}walkDecls(s.decls,scopes.length-1);walkS(s.body);(s.handlers||[]).forEach(h=>walkS(h.body));scopes.pop();break;
      case'pcall':walkE(s.e,s);break;case'return':walkE(s.e,s);break;
      case'sql':checkSql(s.s,s);break;
      case'exit':case'continue':walkE(s.cond,s);break;
      case'raise':if(s.exc&&!PREDEF[s.exc]){const ps=s.exc.split('.');if(isHidden(ps[0])||!(known(ps[0])||(extraScope&&extraScope.find(ps[0]))||(ps.length>1&&exists(ps))))throw Object.assign(E('PLS-00201',"identifier '"+s.exc+"' must be declared",[hint('Apna exception pehle DECLARE mein likho: '+s.exc.toLowerCase()+' EXCEPTION;')]),{line:s.line,col:s.col});}break;
      case'openfor':{walkE(s.cur,s);if(s.dyn)walkE(s.dyn,s);if(s.q){checkSql(s.q,s);const ti=s.cur.t==='id'&&s.cur.parts.length===1?etype(s.cur):null;
        if(ti&&ti.cat==='cur'&&ti.ret){const r=ti.ret;let want=null;if(r.base==='%ROWTYPE')want=tabCols(r.ref);else if(r.base==='USER'){const rt=tinfo(r);if(rt&&rt.fields)want=rt.fields.length;}
          const got=selCount(s.q);if(want!=null&&got!=null&&want!==got)throw Object.assign(E('PLS-00382','expression is of wrong type',[hint('Strong REF CURSOR ka RETURN type query ke columns se match hona chahiye.')]),{line:s.line,col:s.col});}}break;}
    }}catch(e){if(e instanceof OraErr){if(e.plsSql){errs.push({line:e.line,col:e.col,text:e.message,hint:hintOf(e)});errs.push({line:e.line,col:e.col,text:'PL/SQL: SQL Statement ignored'});}else if(e.sqlPl){errs.push({line:e.line,col:e.col,text:'PL/SQL: '+e.message,hint:hintOf(e)});errs.push({line:e.line,col:e.col,text:'PL/SQL: SQL Statement ignored'});}else push(e,{line:e.line,col:e.col});}else throw e;}}};
  const walkDecls=(ds,L)=>{ds=ds||[];const subs=ds.map((d,i)=>(d.k==='proc'||d.k==='func')?i:-1).filter(i=>i>=0);
   for(let i=0;i<ds.length;i++){const d=ds[i];
    if(L!=null&&subs.length){const later=new Set();for(const j of subs)if(j>i){const n=ds[j].name;if(!ds.slice(0,i+1).some(x=>x.name===n)&&!(extraScope&&extraScope.find(n)))later.add(n);}if(later.size)hid.set(L,later);else hid.delete(L);}
    if((d.k==='proc'||d.k==='func')&&d.unit.body){scopes.push(paramScope(d.unit.params,d.unit.decls));walkDecls(d.unit.decls,scopes.length-1);walkS(d.unit.body);(d.unit.handlers||[]).forEach(h=>walkS(h.body));scopes.pop();}
    if(d.k==='var'&&d.type&&d.type.base==='%TYPE'){const parts=d.type.ref.split('.');if(!exists(parts)&&!known(parts[0]))errs.push({line:d.line,col:d.col,text:"PLS-00201: identifier '"+d.type.ref+"' must be declared"},{line:d.line,col:d.col,text:'PL/SQL: Item ignored'});}
    if(d.k==='var'&&d.type&&d.type.base==='%ROWTYPE'){const parts=d.type.ref.split('.');if(!exists(parts)&&!known(parts[0]))errs.push({line:d.line,col:d.col,text:"PLS-00201: identifier '"+d.type.ref+"' must be declared"},{line:d.line,col:d.col,text:'PL/SQL: Item ignored'});}
    if(d.k==='var'&&d.def){try{walkE(d.def,d);}catch(e){if(e instanceof OraErr)push(e,d,'PL/SQL: Item ignored');}}
    if(d.k==='cursor'&&d.query){try{scopes.push(paramScope(d.params,[]));checkSql(d.query,d);scopes.pop();}catch(e){scopes.pop();if(e instanceof OraErr){errs.push({line:d.line,col:d.col,text:(e.plsSql?'':'PL/SQL: ')+e.message,hint:hintOf(e)},{line:d.line,col:d.col,text:'PL/SQL: SQL Statement ignored'});}}}}
   if(L!=null)hid.delete(L);};
  const top=paramScope(unit.params,unit.decls);if(unit.name&&!top.has(unit.name))top.set(unit.name,{k:'unit'});if(unit.label&&!top.has(unit.label))top.set(unit.label,{k:'label'});scopes.push(top);
  if(extraScope)scopes.push(new Set());
  walkDecls(unit.decls,0);if(unit.body)walkS(unit.body);(unit.handlers||[]).forEach(h=>walkS(h.body));if(unit.init)walkS(unit.init);
  return errs;
}
/* ---------- entry points used by the SQL*Plus front end ---------- */
function plRunBlock(text,cx,out,opts){
  opts=opts||{};let b;
  try{const p=new P(lex(text),text);const lab=isLabel(p)?readLabel(p):null;b=plBlock(p,lab);while(p.acceptOp(';'));if(!p.eof()&&!p.isOp('/'))throw plErr(p);}
  catch(e){throw compileErr(e);}
  const errs=plCheck(b,cx);
  if(errs.length){throw compileErrs(errs);}
  const sc=new Scope(null,{unitName:null,label:b.label});
  const mark=tx(cx).undo.length;
  try{runBlockBody(b,sc,cx);}
  catch(e0){let e=e0;
    if(e instanceof Sig){if(e.kind==='return')return finishBlock(cx,out,opts);const sl=e.line,scol=e.col;e=e.kind==='goto'?E('PLS-00375',"illegal GOTO statement; this GOTO cannot transfer control to label '"+e.label+"'"):E('PLS-00376','illegal EXIT/CONTINUE statement; it must appear inside a loop');e.plLine=sl;e.plCol=scol;}
    /* a PLS- error found while running belongs to compilation: report it the compile way, with nothing run */
    if(isCompileErr(e)){rollbackTo(cx,mark);cx.sess.outBuf=[];cx.sess.outPart='';cx.sess.implicit=[];
      const line=e.plLine||e.line||1,col=e.plCol||e.col||1;const ne=E('ORA-06550','line '+line+', column '+col+':',[e.message].concat(e.compile?[]:['ORA-06550: line '+line+', column '+col+':','PL/SQL: Statement ignored'],(e.extra||[]).filter(x=>/^\(/.test(x))));ne.line=line;throw ne;}
    if(e instanceof OraErr){rollbackTo(cx,mark);if(!e.stackDone){e.extra=(e.extra||[]).concat(['ORA-06512: at line '+(e.plLine||1)]);e.stackDone=true;}
      if(e.userExc&&e.code==='ORA-06510'){}
      if(opts.exec){e.extra=e.extra.map(x=>x.replace(/at line (\d+)/,'at line 1'));}}
    throw e;}
  return finishBlock(cx,out,opts);
}
function finishBlock(cx,out,opts){
  if(out&&!opts.quiet){if(cx.sess.serverout&&(cx.sess.outBuf.length||cx.sess.outPart)){if(cx.sess.outPart){cx.sess.outBuf.push(cx.sess.outPart);cx.sess.outPart='';}cx.sess.outBuf.forEach(l=>out.say(l));out.say('');cx.sess.outBuf=[];}
    out.ok('PL/SQL procedure successfully completed.');
    if(cx.sess.implicit&&cx.sess.implicit.length){cx.sess.implicit.forEach((c,i)=>{out.say('');out.say('ResultSet #'+(i+1));formatTable({cols:c.cols,rows:c.rows.slice(c.pos),types:c.types},cx,out.lines);});cx.sess.implicit=[];}}
}
function isCompileErr(e){return e instanceof OraErr&&/^PLS-/.test(e.code)&&!(e.extra||[]).some(x=>/^ORA-06512: at "/.test(x));}
function compileErr(e){
  if(e instanceof OraErr&&(e.pls||e.sqlInPl||e.code.startsWith('PLS-'))){const line=e.line||1,col=e.col||1;const ne=E('ORA-06550','line '+line+', column '+col+':',[(e.sqlInPl?'PL/SQL: ':'')+e.message].concat(e.sqlInPl?['ORA-06550: line '+line+', column '+col+':','PL/SQL: SQL Statement ignored']:[]));ne.line=line;return ne;}
  if(e instanceof OraErr){const line=e.line||1,col=e.col||1;const ne=E('ORA-06550','line '+line+', column '+col+':',['PLS-00103: Encountered the symbol "'+(e.message.split(':')[0])+'"',e.message]);ne.line=line;return ne;}
  return e;
}
function compileErrs(errs){const f=errs[0];const ne=E('ORA-06550','line '+f.line+', column '+f.col+':',[]);ne.line=f.line;
  const extra=[f.text];for(let i=1;i<errs.length;i++){extra.push('ORA-06550: line '+errs[i].line+', column '+errs[i].col+':');extra.push(errs[i].text);}const h=errs.find(x=>x.hint);if(h)extra.push(h.hint);ne.extra=extra;return ne;}
function plExecUnit(text,cx,out){
  const t=text.trim();
  if(/^(DECLARE|BEGIN|<<)/i.test(t))return plRunBlock(t,cx,out);
  if(/^CREATE/i.test(t))return plCreate(t,cx,out);
  /* other statements that ended with "/" */
  return plRunAsSql(t,cx,out);
}
function plRunAsSql(t,cx,out){const p=new P(lex(t),t);const s=parseSqlStatement(p);if(!s)throw E('ORA-00900','invalid SQL statement');return null;}
/* spec and body headers must conform: same parameter names, modes and type family */
function typeFam(t){if(!t)return'';const b=t.base;if(b==='%TYPE'||b==='%ROWTYPE'||b==='USER')return null;
  if(['VARCHAR2','VARCHAR','CHAR','NCHAR','NVARCHAR2','STRING','LONG','CHARACTER','CLOB','NCLOB'].includes(b))return'C';
  if(['NUMBER','INTEGER','INT','SMALLINT','DECIMAL','DEC','NUMERIC','FLOAT','REAL','PLS_INTEGER','BINARY_INTEGER','NATURAL','NATURALN','POSITIVE','POSITIVEN','SIGNTYPE','SIMPLE_INTEGER','BINARY_FLOAT','BINARY_DOUBLE'].includes(b))return'N';
  if(b==='DATE'||/^TIMESTAMP/.test(b))return'D';return b;}
function sameType(a,b){const fa=typeFam(a),fb=typeFam(b);if(fa===null||fb===null){if(a&&b&&a.base===b.base&&(a.ref||a.name)!==(b.ref||b.name))return false;return true;}return fa===fb;}
function sigMatch(a,b){const pa=a.params||[],pb=b.params||[];if(pa.length!==pb.length)return false;
  for(let i=0;i<pa.length;i++)if(pa[i].name!==pb[i].name||pa[i].mode!==pb[i].mode||!sameType(pa[i].type,pb[i].type))return false;
  if((a.ret||b.ret)&&!(a.ret&&b.ret&&sameType(a.ret,b.ret)))return false;return true;}
const UNIT_LABEL={PROCEDURE:'Procedure',FUNCTION:'Function',PACKAGE:'Package','PACKAGE BODY':'Package body',TRIGGER:'Trigger',TYPE:'Type','TYPE BODY':'Type body'};
function plCreate(text,cx,out){
  needOpen(cx);
  let u;plTrigHdr=null;try{u=plParseUnit(text);}catch(e){
    if(e instanceof OraErr&&e.hdr)throw e;
    /* store an invalid object so SHOW ERRORS has something to show */
    const m=/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:NON)?EDITIONABLE\s+)?(PROCEDURE|FUNCTION|PACKAGE\s+BODY|PACKAGE|TRIGGER|TYPE\s+BODY|TYPE)\s+(IF\s+NOT\s+EXISTS\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/i.exec(text);
    if(m&&e instanceof OraErr){const kind=m[1].toUpperCase().replace(/\s+/,' ');const name=m[4].toUpperCase();const owner=(m[3]||curSchema(cx)).toUpperCase();const key=owner+'.'+name+(kind==='PACKAGE BODY'?'#BODY':kind==='TYPE BODY'?'#TBODY':'');
      if(m[2]&&(kind==='TRIGGER'?cx.db.trigs[key]:cx.db.objs[key])){out.ok(UNIT_LABEL[kind]+' created.');return;}
      const errs=[{line:e.line||1,col:e.col||1,text:(e.sqlInPl?'PL/SQL: ':'')+e.message}];
      const o={type:kind,owner,name,key,src:text,status:'INVALID',errors:errs,unit:null};
      if(kind==='TRIGGER'){const old=cx.db.trigs[key];if(old&&!/^\s*CREATE\s+OR\s+REPLACE\b/i.test(text))throw E('ORA-04081',"trigger '"+name+"' already exists");
        const h=plTrigHdr;const tb=h&&!h.system&&h.q?resolveObj(h.q,cx,true):null;
        if(tb&&(tb.type==='TABLE'||tb.type==='VIEW'))Object.assign(o,{tkey:tb.key,events:h.events,ofCols:h.ofCols,timing:h.timing==='FOR'?'COMPOUND':h.timing,level:h.timing==='FOR'?'ROW':h.level,compound:h.timing==='FOR'?{decls:[],sections:{}}:null,enabled:h.enabled,created:today(cx),oid:(cx.db.nextOid=(cx.db.nextOid||74000)+1)});
        else Object.assign(o,{enabled:false,events:[],tkey:''});
        cx.db.trigs[key]=Object.assign(old||{},o);}else{const old=cx.db.objs[key];o.oid=old?old.oid:(cx.db.nextOid=(cx.db.nextOid||74000)+1);o.created=today(cx);cx.db.objs[key]=o;}
      cx.sess.lastErrObj=key;out.err('Warning: '+(kind==='PACKAGE BODY'?'Package Body':kind==='TYPE BODY'?'Type Body':UNIT_LABEL[kind])+' created with compilation errors.');return;}
    throw e;}
  const owner=(u.owner||curSchema(cx));const name=u.name;const kind=u.kind;
  if(kind==='PROCEDURE'||kind==='FUNCTION'||kind==='PACKAGE'||kind==='PACKAGE BODY')needPriv(cx,owner===curSchema(cx)?'CREATE PROCEDURE':'CREATE ANY PROCEDURE');
  if(kind==='TRIGGER')needPriv(cx,owner===curSchema(cx)?'CREATE TRIGGER':'CREATE ANY TRIGGER');
  const key=owner+'.'+name+(kind==='PACKAGE BODY'?'#BODY':kind==='TYPE BODY'?'#TBODY':'');
  const ex=kind==='TRIGGER'?cx.db.trigs[key]:cx.db.objs[key];
  if(u.ifNotExists){if(u.orRep)throw E('ORA-11541','REPLACE and IF NOT EXISTS cannot coexist in the same DDL statement');if(ex){out.ok(UNIT_LABEL[kind]+' created.');return;}}
  if(ex&&!u.orRep&&kind==='TRIGGER')throw E('ORA-04081',"trigger '"+name+"' already exists",[hint('Badalna ho toh CREATE OR REPLACE TRIGGER ... likho.')]);
  if(ex&&!u.orRep&&!(ex.status==='INVALID'&&false))throw E('ORA-00955','name is already used by an existing object',[hint('Badalna ho toh CREATE OR REPLACE '+kind.toLowerCase()+' ... likho.')]);
  if(ex&&kind!=='TRIGGER'&&ex.type!==kind&&!(kind==='PACKAGE BODY'))throw E('ORA-00955','name is already used by an existing object');
  const ocx=sub(cx,{schema:owner});let errs=[];
  if(kind==='PACKAGE BODY'&&!cx.db.objs[owner+'.'+name])throw E('PLS-00201',"identifier '"+name+"' must be declared",[hint('Pehle package specification (CREATE PACKAGE '+name.toLowerCase()+' AS ... END;) banao.')]);
  if(kind==='TRIGGER')return plCreateTrigger(u,owner,key,ex,cx,out);
  if(kind==='TYPE'){const o={type:'TYPE',owner,name,key,src:text,def:u.def,typecode:u.def.kind==='record'?'OBJECT':'COLLECTION',status:'VALID'};if(ex){o.oid=ex.oid;o.created=ex.created;cx.db.objs[key]=o;}else newObj(cx,o);out.ok('Type created.');return;}
  if(kind==='TYPE BODY'){out.ok('Type body created.');return;}
  if(kind==='PACKAGE BODY'){const spec=cx.db.objs[owner+'.'+name];
    for(const d of spec.spec.decls)if((d.k==='proc'||d.k==='func')){const impl=u.decls.find(x=>(x.k===d.k)&&x.name===d.name&&!x.unit.forward&&sigMatch(d.unit,x.unit));if(!impl)errs.push({line:d.line,col:d.col,text:'PLS-00323: subprogram or cursor \''+d.name+'\' is declared in a package specification and must be defined in the package body'});}
    const sc=new Scope(null);for(const d of spec.spec.decls)sc.vars.set(d.name,{kind:d.k==='proc'||d.k==='func'?d.k:'var',decl:d});
    errs=errs.concat(plCheck({decls:u.decls,body:u.init||[],handlers:u.handlers||[],name:u.name},ocx,sc));}
  else if(kind==='PACKAGE'){errs=[];}
  else errs=plCheck(u,ocx);
  const o={type:kind,owner,name,key,src:text,unit:u,status:errs.length?'INVALID':'VALID',errors:errs.length?errs:null};
  if(kind==='PACKAGE'){o.spec=u;o.ver=(ex&&ex.ver||0)+1;if(cx.sess.pkg)delete cx.sess.pkg[key];const body=cx.db.objs[key+'#BODY'];if(body)body.status=body.status;}
  if(kind==='PACKAGE BODY'){const spec=cx.db.objs[owner+'.'+name];spec.ver=(spec.ver||0)+1;if(cx.sess.pkg)delete cx.sess.pkg[spec.key];}
  if(ex){o.oid=ex.oid;o.created=ex.created;o.ddl=today(cx);cx.db.objs[key]=o;}else newObj(cx,o);
  cx.sess.lastErrObj=key;
  if(errs.length){out.err('Warning: '+(kind==='PACKAGE BODY'?'Package Body':kind==='TYPE BODY'?'Type Body':UNIT_LABEL[kind])+' created with compilation errors.');return;}
  out.ok(UNIT_LABEL[kind]+' created.');
}
function plCreateTrigger(u,owner,key,ex,cx,out){
  if(u.system){const t={type:'TRIGGER',owner,name:u.name,key,tkey:'$SYSTEM',events:u.events,timing:u.timing,level:'STATEMENT',enabled:u.enabled,src:u.src,block:u.block,status:'VALID'};cx.db.trigs[key]=t;out.ok('Trigger created.');return;}
  const o=resolveObj(u.q,cx,true);if(!o||(o.type!=='TABLE'&&o.type!=='VIEW'))throw tabNotFound(u.q,cx);
  if(u.timing==='INSTEAD OF'&&o.type!=='VIEW')throw E('ORA-25002','cannot create INSTEAD OF triggers on tables');
  if(o.type==='VIEW'&&u.timing!=='INSTEAD OF')throw E('ORA-25001','cannot create this trigger type on views',[hint('View par sirf INSTEAD OF trigger banta hai.')]);
  if(u.when&&u.level!=='ROW')throw E('ORA-04077','WHEN clause cannot be used with table level triggers');
  if(u.ofCols)for(const c of u.ofCols)if(!o.cols||!o.cols.find(x=>x.name===c))throw E('ORA-00904','"'+c+'": invalid identifier');
  const errs=[];
  /* :NEW/:OLD checks */
  const body=u.block||{decls:u.compound.decls,body:[],handlers:[]};
  if(u.level!=='ROW'){let no=false;scanAst(body,n=>{if(n.t==='bind'&&(n.name==='NEW'||n.name==='OLD'))no=true;});
    if(no)throw E('ORA-04082','NEW or OLD references not allowed in table level triggers',[hint(':NEW/:OLD sirf FOR EACH ROW trigger mein milte hain.')]);}
  else{const cols=new Set((o.cols||[]).map(c=>c.name));const vcols=o.type==='VIEW'?new Set(viewColNames(o,cx)):cols;
    scanAst(body,n=>{if(n.t==='bind'&&(n.name==='NEW'||n.name==='OLD')&&n.parts[1]&&!vcols.has(n.parts[1]))errs.push({line:n.line,col:n.col,text:'PLS-00049: bad bind variable \''+n.name+'.'+n.parts[1]+'\''});});
    if(u.timing==='AFTER'){let chg=false;scanAst(body,n=>{if(n.t==='assign'&&n.target.t==='bind'&&n.target.name==='NEW')chg=true;});
      if(chg)throw E('ORA-04084','cannot change NEW values for this trigger type',[hint(':NEW badalna ho toh BEFORE ... FOR EACH ROW trigger banao.')]);}}
  if(u.block){const ce=plCheck({decls:u.block.decls,body:u.block.body,handlers:u.block.handlers},sub(cx,{schema:owner}));errs.push(...ce);}
  else if(u.compound){const secs=Object.values(u.compound.sections).map(sc=>({t:'block',label:null,decls:sc.decls||[],body:sc.body,handlers:sc.handlers||[],line:sc.line}));
    const ce=plCheck({decls:u.compound.decls,body:secs,handlers:[]},sub(cx,{schema:owner}));errs.push(...ce);}
  const t={type:'TRIGGER',owner,name:u.name,key,tkey:o.key,events:u.events,ofCols:u.ofCols,timing:u.timing==='COMPOUND'?'COMPOUND':u.timing,level:u.level,when:u.when||null,whenText:u.whenText||null,enabled:u.enabled,src:u.src,block:u.block,compound:u.compound||null,status:errs.length?'INVALID':'VALID',errors:errs.length?errs:null,created:today(cx),oid:(cx.db.nextOid=(cx.db.nextOid||74000)+1)};
  cx.db.trigs[key]=t;cx.sess.lastErrObj=key;
  if(errs.length){out.err('Warning: Trigger created with compilation errors.');return;}
  out.ok('Trigger created.');
}
function plRunTrigger(t,info,cx){
  if(t.status==='INVALID')throw E('ORA-04098','trigger \''+t.owner+'.'+t.name+'\' is invalid and failed re-validation');
  const tcx=sub(cx,{trigNew:info.nw||null,trigOld:info.old||null,inTrig:true,schema:t.owner,trigNoNewWrite:t.timing==='AFTER'||(info.section&&info.section.startsWith('AFTER')),f:null});
  if(t.when&&info.nw){const f=info;const wcx=sub(tcx,{});const nwF=f.nw,olF=f.old;const r=evalB(t.when,sub(wcx,{pl:{get:(parts)=>{if(parts.length===2&&(parts[0]==='NEW'||parts[0]==='OLD')){const rec=parts[0]==='NEW'?nwF:olF;return rec&&rec.f[parts[1]];}return undefined;},has:()=>true,call:()=>undefined,attr:()=>null}}));if(r!==true)return;}
  const sc=new Scope(null,{unitName:'"'+t.owner+'.'+t.name+'"'});sc.vars.set('$TRIG',{kind:'sys',v:{event:info.event,cols:null}});
  try{
    if(t.compound){const secName=info.section;let state=t.__state;if(!state||secName==='BEFORE STATEMENT'||!t.__state){state=new Scope(null,{unitName:'"'+t.owner+'.'+t.name+'"'});state.vars.set('$TRIG',{kind:'sys',v:{event:info.event}});declare(t.compound.decls,state,tcx);t.__state=state;}
      state.vars.get('$TRIG').v={event:info.event};
      const sec=t.compound.sections[secName];if(sec){const ss=new Scope(state,{});runBlockBody({decls:sec.decls||[],body:sec.body,handlers:sec.handlers},ss,tcx);}
      if(secName==='AFTER STATEMENT')t.__state=null;return;}
    runBlockBody(t.block,sc,tcx);
  }catch(e){
    if(e instanceof Sig&&e.kind==='return')return;
    if(e instanceof OraErr&&!e.trigDone){e.extra=(e.extra||[]).concat(['ORA-06512: at "'+t.owner+'.'+t.name+'", line '+Math.max(1,(e.plLine||1)-((t.block&&t.block.line||1)-1)),'ORA-04088: error during execution of trigger \''+t.owner+'.'+t.name+'\'']);e.trigDone=true;e.plLine=null;}
    throw e;}
}
function plShowErrors(arg,cx,out){
  let key=null;const m=/^\s*(PROCEDURE|FUNCTION|PACKAGE\s+BODY|PACKAGE|TRIGGER|TYPE\s+BODY|TYPE)\s+(?:"?(\w+)"?\.)?"?(\w+)"?/i.exec(arg||'');
  if(m){const kind=m[1].toUpperCase().replace(/\s+/,' ');key=(m[2]?m[2].toUpperCase():curSchema(cx))+'.'+m[3].toUpperCase()+(kind==='PACKAGE BODY'?'#BODY':kind==='TYPE BODY'?'#TBODY':'');}else key=cx.sess.lastErrObj;
  const o=key&&(cx.db.objs[key]||cx.db.trigs[key]);
  if(!o||!o.errors||!o.errors.length){out.say('No errors.');return;}
  out.say('Errors for '+o.type+' '+o.owner+'.'+o.name+':');out.say('');out.say('LINE/COL ERROR');out.say('-------- -----------------------------------------------------------------');
  o.errors.forEach(er=>out.say((er.line+'/'+er.col).padEnd(8)+' '+er.text));
}
function plDescribe(o,out){
  if(o.type==='PACKAGE'){for(const d of o.spec.decls){if(d.k!=='proc'&&d.k!=='func')continue;out.say((d.k==='func'?'FUNCTION ':'PROCEDURE ')+d.name+(d.k==='func'?' RETURNS '+typeStr(d.unit.ret.base==='%TYPE'?{base:'NUMBER'}:d.unit.ret):''));descParams(d.unit,out);}return;}
  const u=o.unit;if(!u)throw E('ORA-24372','invalid object for describe');if(o.type==='FUNCTION')out.say('FUNCTION '+o.name+' RETURNS '+(u.ret.base==='%TYPE'||u.ret.base==='%ROWTYPE'?u.ret.ref+u.ret.base:typeStr(u.ret)));else out.say('PROCEDURE '+o.name);descParams(u,out);
}
function descParams(u,out){if(!u.params||!u.params.length)return;out.say(' Argument Name                  Type                    In/Out Default?');out.say(' ------------------------------ ----------------------- ------ --------');
  u.params.forEach(pa=>out.say(' '+pa.name.padEnd(30)+' '+(pa.type.base==='%TYPE'||pa.type.base==='%ROWTYPE'?pa.type.ref+pa.type.base:typeStr(pa.type)).padEnd(23)+' '+pa.mode.padEnd(6)+' '+(pa.def?'DEFAULT':'')));}
function plPrintCursor(c,cx,out){formatTable({cols:c.cols,rows:c.rows.slice(c.pos),types:c.types},cx,out.lines);c.pos=c.rows.length;}
/* DROP / ALTER for stored PL/SQL */
function plDdl(p,text,cx,out){
  const save=p.i;
  if(p.acceptW('DROP')){
    if(p.isAnyW(['PROCEDURE','FUNCTION','PACKAGE','TRIGGER','TYPE'])){const kind=p.next().v;const body=kind==='PACKAGE'&&p.acceptW('BODY');const tb=kind==='TYPE'&&p.acceptW('BODY');const ifx=p.acceptW('IF','EXISTS');const q=p.qname();p.acceptW('FORCE');
      const owner=q.owner||curSchema(cx);const key=owner+'.'+q.name;
      if(kind==='TRIGGER'){if(!cx.db.trigs[key]&&ifx){out.ok('Trigger dropped.');return true;}if(!cx.db.trigs[key])throw E('ORA-04080','trigger \''+q.name+'\' does not exist');delete cx.db.trigs[key];out.ok('Trigger dropped.');return true;}
      if(body){if(!cx.db.objs[key+'#BODY']&&ifx){out.ok('Package body dropped.');return true;}if(!cx.db.objs[key+'#BODY'])throw E('ORA-04043','object '+q.name+' does not exist');delete cx.db.objs[key+'#BODY'];if(cx.sess.pkg)delete cx.sess.pkg[key];out.ok('Package body dropped.');return true;}
      const o=cx.db.objs[key];if((!o||o.type!==kind)&&ifx){out.ok(UNIT_LABEL[tb?'TYPE BODY':kind]+' dropped.');return true;}if(!o||o.type!==kind)throw E('ORA-04043','object '+q.name+' does not exist');
      delete cx.db.objs[key];if(kind==='PACKAGE'){delete cx.db.objs[key+'#BODY'];if(cx.sess.pkg)delete cx.sess.pkg[key];}
      out.ok(UNIT_LABEL[kind]+' dropped.');return true;}
    p.i=save;return false;}
  if(p.acceptW('ALTER')){
    if(p.acceptW('TRIGGER')){const q=p.qname();const key=(q.owner||curSchema(cx))+'.'+q.name;const t=cx.db.trigs[key];if(!t)throw E('ORA-04080','trigger \''+q.name+'\' does not exist');
      if(p.acceptW('ENABLE'))t.enabled=true;else if(p.acceptW('DISABLE'))t.enabled=false;else if(p.acceptW('COMPILE')){}else if(p.acceptW('RENAME','TO')){const nn=p.ident();delete cx.db.trigs[key];t.name=nn;t.key=t.owner+'.'+nn;cx.db.trigs[t.key]=t;}else throw E('ORA-00922','missing or invalid option');
      out.ok('Trigger altered.');return true;}
    if(p.isAnyW(['PROCEDURE','FUNCTION','PACKAGE'])){const kind=p.next().v;const q=p.qname();const key=(q.owner||curSchema(cx))+'.'+q.name;const o=cx.db.objs[key];if(!o)throw E('ORA-04043','object '+q.name+' does not exist');while(!p.eof())p.next();
      if(o.unit&&o.status==='INVALID'){const errs=plCheck(o.unit,cx);if(!errs.length){o.status='VALID';o.errors=null;}else o.errors=errs;}
      if(o.status==='INVALID'){out.err('Warning: '+UNIT_LABEL[kind]+' altered with compilation errors.');return true;}out.ok(UNIT_LABEL[kind]+' altered.');return true;}
    p.i=save;return false;}
  return false;
}
const ORA_MSG={1:'unique constraint violated',1403:'no data found',1422:'exact fetch returns more than requested number of rows',1476:'divisor is equal to zero',1722:'invalid number',6502:'PL/SQL: numeric or value error',6511:'PL/SQL: cursor already open',1001:'invalid cursor',6592:'CASE not found while executing CASE statement',6531:'Reference to uninitialized collection',6533:'Subscript beyond count',6532:'Subscript outside of limit',6504:'PL/SQL: Return types of Result Set variables or query do not match',1017:'invalid username/password; logon denied',1012:'not logged on',6501:'PL/SQL: program error',6500:'PL/SQL: storage error',51:'timeout occurred while waiting for a resource',1410:'invalid ROWID',6530:'Reference to uninitialized composite',942:'table or view does not exist',2291:'integrity constraint violated - parent key not found',2292:'integrity constraint violated - child record found',1400:'cannot insert NULL',2290:'check constraint violated',12899:'value too large for column'};

/* ===== administration: instance, privileges, tablespaces, users, roles, profiles, links, data pump ===== */
const ROW_KB=1;
const SYS_PRIVS=['CREATE SESSION','ALTER SESSION','RESTRICTED SESSION','CREATE TABLE','CREATE ANY TABLE','ALTER ANY TABLE','DROP ANY TABLE','SELECT ANY TABLE','INSERT ANY TABLE','UPDATE ANY TABLE','DELETE ANY TABLE','LOCK ANY TABLE','CREATE VIEW','CREATE ANY VIEW','DROP ANY VIEW','CREATE SEQUENCE','CREATE ANY SEQUENCE','SELECT ANY SEQUENCE','CREATE PROCEDURE','CREATE ANY PROCEDURE','ALTER ANY PROCEDURE','DROP ANY PROCEDURE','EXECUTE ANY PROCEDURE','CREATE TRIGGER','CREATE ANY TRIGGER','CREATE TYPE','CREATE ANY INDEX','CREATE SYNONYM','CREATE ANY SYNONYM','CREATE PUBLIC SYNONYM','DROP PUBLIC SYNONYM','CREATE USER','ALTER USER','DROP USER','CREATE ROLE','ALTER ANY ROLE','DROP ANY ROLE','GRANT ANY ROLE','GRANT ANY PRIVILEGE','GRANT ANY OBJECT PRIVILEGE','CREATE PROFILE','ALTER PROFILE','DROP PROFILE','CREATE TABLESPACE','ALTER TABLESPACE','DROP TABLESPACE','UNLIMITED TABLESPACE','CREATE DATABASE LINK','CREATE PUBLIC DATABASE LINK','ALTER DATABASE LINK','ALTER PUBLIC DATABASE LINK','DROP PUBLIC DATABASE LINK','CREATE ANY DIRECTORY','DROP ANY DIRECTORY','SELECT ANY DICTIONARY','ALTER SYSTEM','ALTER DATABASE','AUDIT SYSTEM','CREATE MATERIALIZED VIEW','SYSDBA','SYSOPER'];
const OBJ_PRIVS=['SELECT','INSERT','UPDATE','DELETE','ALTER','INDEX','REFERENCES','EXECUTE','READ','WRITE','DEBUG','ON COMMIT REFRESH','QUERY REWRITE','FLASHBACK','UNDER'];
const PROFILE_PARAMS={SESSIONS_PER_USER:'KERNEL',CPU_PER_SESSION:'KERNEL',CPU_PER_CALL:'KERNEL',CONNECT_TIME:'KERNEL',IDLE_TIME:'KERNEL',LOGICAL_READS_PER_SESSION:'KERNEL',LOGICAL_READS_PER_CALL:'KERNEL',PRIVATE_SGA:'KERNEL',COMPOSITE_LIMIT:'KERNEL',FAILED_LOGIN_ATTEMPTS:'PASSWORD',PASSWORD_LIFE_TIME:'PASSWORD',PASSWORD_REUSE_TIME:'PASSWORD',PASSWORD_REUSE_MAX:'PASSWORD',PASSWORD_LOCK_TIME:'PASSWORD',PASSWORD_GRACE_TIME:'PASSWORD',PASSWORD_VERIFY_FUNCTION:'PASSWORD',INACTIVE_ACCOUNT_TIME:'PASSWORD'};
const DEFAULT_LIMITS={SESSIONS_PER_USER:'UNLIMITED',CPU_PER_SESSION:'UNLIMITED',CPU_PER_CALL:'UNLIMITED',CONNECT_TIME:'UNLIMITED',IDLE_TIME:'UNLIMITED',LOGICAL_READS_PER_SESSION:'UNLIMITED',LOGICAL_READS_PER_CALL:'UNLIMITED',PRIVATE_SGA:'UNLIMITED',COMPOSITE_LIMIT:'UNLIMITED',FAILED_LOGIN_ATTEMPTS:'10',PASSWORD_LIFE_TIME:'180',PASSWORD_REUSE_TIME:'UNLIMITED',PASSWORD_REUSE_MAX:'UNLIMITED',PASSWORD_LOCK_TIME:'1',PASSWORD_GRACE_TIME:'7',PASSWORD_VERIFY_FUNCTION:'NULL',INACTIVE_ACCOUNT_TIME:'UNLIMITED'};
const VFILES={
 'languages.csv':'1,Afrikaans\n2,Albanian\n3,Amharic\n4,Arabic\n5,Bengali\n6,Hindi\n7,Kannada\n8,Tamil\n9,Telugu\n10,Urdu',
 'email.dat':'1,john.doe@example.com\n2,jane.doe@example.com\n3,sam@example.com',
 'email.ctl':'load data into table emails\ninsert\nfields terminated by ","\n(\nemail_id,\nemail\n)',
 'email.par':'userid=ot/oracle\ncontrol=email.ctl\nlog=email.log\nbad=email.bad\ndata=email.dat\ndirect=true',
 'customer.par':'userid=ot/oracle\ndirectory=ot_external\ndumpfile=customer_exp%U.dmp\nlogfile=customer_exp.log\nfilesize=50K\ntables=customers',
 'ot.par':'userid=ot/oracle\ndirectory=ot_external\ndumpfile=ot_exp%U.dmp\nlogfile=ot_exp.log\nfilesize=50K\nschemas=ot',
 'customer_imp.par':'userid=ot/oracle\ndirectory=ot_external\ndumpfile=customer_exp%U.dmp\nlogfile=customer_imp.log\nremap_table=ot.customers:customers_bk'
};
/* ---------- privileges ---------- */
function S_(cx){return cx.sess;}
function isSysdba(cx){const s=cx.sess;return!!(s&&(s.sysdba||s.user==='SYS'));}
function roleClosure(db,names,seen){seen=seen||new Set();for(const r of names){if(seen.has(r)||!db.roles[r])continue;seen.add(r);roleClosure(db,Object.keys(db.roles[r].roles),seen);}return seen;}
function activeRoles(cx){const s=cx.sess;if(!s)return new Set();return roleClosure(cx.db,[...s.roles]);}
function hasAll(cx){if(isSysdba(cx))return true;const u=cx.db.users[cx.sess.user];if(u&&u.all)return true;for(const r of activeRoles(cx))if(cx.db.roles[r].all)return true;return false;}
function hasPriv(cx,priv){if(!cx.sess)return false;if(hasAll(cx))return true;const u=cx.db.users[cx.sess.user];if(u&&u.privs[priv])return true;for(const r of activeRoles(cx))if(cx.db.roles[r].privs[priv])return true;return false;}
function needPriv(cx,priv){if(!hasPriv(cx,priv))throw E('ORA-01031','insufficient privileges',[hint('Is kaam ke liye "'+priv+'" privilege chahiye. DBA se GRANT '+priv.toLowerCase()+' TO '+cx.sess.user.toLowerCase()+'; karwao.')]);}
function userHas(db,uname,priv){const u=db.users[uname];if(!u)return false;if(u.all||uname==='SYS')return true;if(u.privs[priv])return true;for(const r of roleClosure(db,Object.keys(u.roles))){if(db.roles[r].all||db.roles[r].privs[priv])return true;}return false;}
function objPrivOf(db,grantee,owner,obj,priv){return db.objPrivs.find(o=>o.grantee===grantee&&o.owner===owner&&o.obj===obj&&o.priv===priv);}
function canObj(o,priv,cx){
  const s=cx.sess;if(!s)return false;if(s.user===o.owner||isSysdba(cx)||hasAll(cx))return true;
  const anyMap={SELECT:'SELECT ANY TABLE',INSERT:'INSERT ANY TABLE',UPDATE:'UPDATE ANY TABLE',DELETE:'DELETE ANY TABLE',EXECUTE:'EXECUTE ANY PROCEDURE',ALTER:'ALTER ANY TABLE'};
  if(o.type==='SEQUENCE'&&priv==='SELECT'&&hasPriv(cx,'SELECT ANY SEQUENCE'))return true;
  if(anyMap[priv]&&hasPriv(cx,anyMap[priv]))return true;
  const db=cx.db;if(objPrivOf(db,s.user,o.owner,o.name,priv)||objPrivOf(db,'PUBLIC',o.owner,o.name,priv))return true;
  for(const r of activeRoles(cx))if(objPrivOf(db,r,o.owner,o.name,priv))return true;
  if(priv==='SELECT'&&(objPrivOf(db,s.user,o.owner,o.name,'READ')))return true;
  return false;}
function canSeeObj(o,cx){return['SELECT','INSERT','UPDATE','DELETE','EXECUTE','REFERENCES','ALTER','READ'].some(p=>canObj(o,p,cx));}
function checkObjPriv(o,priv,cx){if(cx.trustPriv)return;if(canObj(o,priv,cx))return;
  if(canSeeObj(o,cx))throw E('ORA-01031','insufficient privileges',[hint(o.owner.toLowerCase()+'.'+o.name.toLowerCase()+' par '+priv+' permission nahi hai. Owner se GRANT '+priv.toLowerCase()+' ON '+o.owner.toLowerCase()+'.'+o.name.toLowerCase()+' TO '+cx.sess.user.toLowerCase()+'; karwao.')]);
  if(o.type==='PROCEDURE'||o.type==='FUNCTION'||o.type==='PACKAGE')throw E('PLS-00201',"identifier '"+o.owner+'.'+o.name+"' must be declared");
  throw E('ORA-00942','table or view does not exist',[hint('Doosre user ki table dekhne ke liye owner.table likho aur SELECT permission chahiye.')]);}
/* ---------- space accounting ---------- */
function tsUsed(db,name){let mb=db.ts[name].baseUsed;for(const k in db.objs){const t=db.objs[k];if(t.type==='TABLE'&&t.ts===name&&!t.external&&!t.temp)mb+=(t.rows.length+(t.virtual||0))*ROW_KB/1024;}return mb;}
function tsSize(db,name){return db.ts[name].files.reduce((a,f)=>a+f.size,0);}
function ensureSpace(o,addRows,cx){
  const db=cx.db;if(!o.ts||o.temp||o.external)return;const ts=db.ts[o.ts];if(!ts)throw E('ORA-00959','tablespace \''+o.ts+'\' does not exist');
  if(ts.status==='OFFLINE')throw E('ORA-00376','file '+(ts.files[0].id||7)+' cannot be read at this time',['ORA-01110: data file '+(ts.files[0].id||7)+': \''+ts.files[0].name+'\'']);
  if(ts.status==='READ ONLY')throw E('ORA-00372','file '+(ts.files[0].id||7)+' cannot be modified at this time',['ORA-01110: data file '+(ts.files[0].id||7)+': \''+ts.files[0].name+'\'']);
  const owner=db.users[o.owner];
  if(owner&&!userHas(db,o.owner,'UNLIMITED TABLESPACE')){const q=owner.quotas[o.ts];
    if(q==null||q===0)throw E('ORA-01950','no privileges on tablespace \''+o.ts+'\'',[hint('User '+o.owner.toLowerCase()+' ka is tablespace par quota nahi hai: ALTER USER '+o.owner.toLowerCase()+' QUOTA 10M ON '+o.ts.toLowerCase()+';')]);
    if(q>0){let mine=0;for(const k in db.objs){const x=db.objs[k];if(x.type==='TABLE'&&x.owner===o.owner&&x.ts===o.ts)mine+=(x.rows.length+(x.virtual||0))*ROW_KB/1024;}
      if(mine+addRows*ROW_KB/1024>q)throw E('ORA-01536','space quota exceeded for tablespace \''+o.ts+'\'');}}
  let need=tsUsed(db,o.ts)+addRows*ROW_KB/1024-tsSize(db,o.ts);if(need<=0)return;
  for(const f of ts.files){if(!f.auto)continue;const room=f.max-f.size;if(room<=0)continue;const step=Math.max(f.next||1,0.001);
    const grow=Math.min(room,Math.ceil(need/step)*step);f.size=+(f.size+grow).toFixed(3);need-=grow;if(need<=0)return;}
  throw E('ORA-01653','unable to extend table '+o.owner+'.'+o.name+' by 128 in tablespace '+o.ts,[hint('Tablespace bhar gaya. Datafile badhao (RESIZE), naya datafile ADD karo, ya AUTOEXTEND ON karo.')]);
}
/* ---------- external tables and remote databases ---------- */
function externalRel(o,alias,cx){
  const x=o.external;const d=cx.db.dirs[x.dir];
  const fail=(m)=>E('ORA-29913','error in executing ODCIEXTTABLEOPEN callout',['ORA-29400: data cartridge error',m]);
  if(!d)throw fail('KUP-04080: directory object '+x.dir+' not found');
  if(!(isSysdba(cx)||hasAll(cx)||cx.db.dirPrivs.some(p=>p.dir===x.dir&&(p.grantee===o.owner||p.grantee===cx.sess.user)&&p.priv==='READ')))throw fail('KUP-04080: no READ privilege on directory '+x.dir);
  const rows=[];
  for(const fname of x.files){const txt=VFILES[String(fname).toLowerCase()]||(cx.db.osFiles[String(fname).toLowerCase()]||{}).text;if(txt==null)throw fail('KUP-04040: file '+fname+' in '+x.dir+' not found');
    txt.split('\n').filter(Boolean).slice(x.skip||0).forEach((line,i)=>{const p=line.split(x.delim||',');rows.push({v:[o.cols.map((c,k)=>coerce(p[k]==null||p[k]===''?null:p[k].trim(),c.type,cx,errCtx(o,c)))],rid:[null]});});}
  return{descs:[mkDesc(alias,o.cols.map(c=>c.name),o.cols.map(c=>c.type))],rows};
}
function findLink(name,cx){const s=curSchema(cx);const l=cx.db.links[s+'.'+name]||cx.db.links['PUBLIC.'+name]||cx.db.links[s+'.'+name.split('.')[0]]||cx.db.links['PUBLIC.'+name.split('.')[0]];
  if(!l)throw E('ORA-02019','connection description for remote database not found',[hint('Is naam ka database link nahi hai: SELECT db_link FROM user_db_links;')]);return l;}
function remoteCx(q,cx){
  const l=findLink(q.link,cx);const svc=String(l.using).toUpperCase();const rdb=cx.db.remote[svc];
  if(!cx.db.listener)throw E('ORA-12541','Cannot connect. No listener at host localhost port 1521.');
  if(!rdb)throw E('ORA-12154','TNS:could not resolve the connect identifier specified');
  const ru=rdb.users[l.user];if(!ru||ru.pw!==l.pw)throw E('ORA-01017','invalid username/password; logon denied',['ORA-02063: preceding line from '+l.name]);
  return sub(cx,{db:rdb,sess:Object.assign({},cx.sess,{user:l.user,schema:l.user,sysdba:false,roles:new Set(Object.keys(ru.roles)),tx:cx.sess.tx}),f:null,schema:l.user,stmtCache:new Map(),ctes:null});
}
function remoteRel(q,alias,cx){const rc=remoteCx(q,cx);try{return sourceRel({q:{owner:q.owner,name:q.name},alias:alias||q.name},rc);}catch(e){if(e.code==='ORA-00942')e.extra=['ORA-02063: preceding line from '+q.link];throw e;}}
function remoteInsert(tg,s,cx){const rc=remoteCx(tg.q,cx);return execInsert(Object.assign({},s,{tg:{q:{owner:tg.q.owner,name:tg.q.name},alias:tg.alias}}),rc);}
function remoteUpdate(tg,s,cx){const rc=remoteCx(tg.q,cx);return execUpdate(Object.assign({},s,{tg:{q:{owner:tg.q.owner,name:tg.q.name},alias:tg.alias}}),rc);}
function remoteDelete(tg,s,cx){const rc=remoteCx(tg.q,cx);return execDelete(Object.assign({},s,{tg:{q:{owner:tg.q.owner,name:tg.q.name},alias:tg.alias}}),rc);}
/* ---------- profile helpers ---------- */
function profileLimit(db,u,k){const pr=db.profiles[u.profile]||db.profiles.DEFAULT;const v=pr.limits[k];if(v&&v!=='DEFAULT')return v;return db.profiles.DEFAULT.limits[k]||DEFAULT_LIMITS[k];}
function isDefaultRole(u,ro){if(u.defaultRoles==='ALL')return true;if(u.defaultRoles==='NONE')return false;if(u.defaultRoles&&u.defaultRoles.except)return!u.defaultRoles.except.includes(ro);return u.defaultRoles.includes(ro);}
/* ---------- DBA statements (parse + execute) ---------- */
function pwTok(p){const x=p.next();if(!x)throw E('ORA-00988','missing or invalid password(s)');return x.k==='id'?(x.q?x.v:x.raw):x.k==='str'?x.v:String(x.raw);}
function fileClause(p,cx,kind){
  const name=p.str();let size=null;if(p.acceptW('SIZE'))size=p.sizeMB();else if(kind!=='add-noreq')throw E('ORA-01119','error in creating database file \''+name+'\'',['ORA-17610: file \''+name+'\' does not exist and no size specified']);
  const f={name,size,auto:false,next:1,max:size};
  p.acceptW('REUSE');
  if(p.acceptW('AUTOEXTEND')){if(p.acceptW('ON')){f.auto=true;f.next=Math.max(size/10,1);f.max=32767;if(p.acceptW('NEXT'))f.next=p.sizeMB();if(p.acceptW('MAXSIZE')){if(p.acceptW('UNLIMITED'))f.max=32767;else f.max=p.sizeMB();}}else if(p.acceptW('OFF')){}else throw E('ORA-02180','invalid option for CREATE TABLESPACE',[hint('AUTOEXTEND ke baad ON ya OFF likho: AUTOEXTEND ON NEXT 1m MAXSIZE 200m')]);}
  if(allFiles(cx.db).includes(name.toLowerCase()))throw E('ORA-01537','cannot add file \''+name+'\' - file already part of database');
  if(cx.db.deletedFiles[name.toLowerCase()]===false&&!p.t.some(t=>t.v==='REUSE'))throw E('ORA-01119','error in creating database file \''+name+'\'',['ORA-27038: created file already exists',hint('Pichhla DROP bina AND DATAFILES ke hua tha, file disk par padi hai. Naya naam do ya REUSE likho.')]);
  f.id=(cx.db.fileSeq=(cx.db.fileSeq||12)+1);return f;
}
function allFiles(db){return Object.values(db.ts).flatMap(t=>t.files.map(f=>f.name.toLowerCase()));}
function findFile(db,fn){fn=fn.toLowerCase();for(const ts of Object.values(db.ts))for(const f of ts.files)if(f.name.toLowerCase()===fn)return{ts,f};return null;}
function needOpen(cx){if(!cx.sess)throw E('SP2-0640','Not connected');const st=cx.db.inst;if(st==='OPEN')return;if(st==='SHUTDOWN')throw E('ORA-01034','ORACLE not available',['Process ID: 0','Session ID: 0 Serial number: 0']);throw E('ORA-01219','database or pluggable database not open: queries allowed on fixed tables or views only');}
function dbaStatement(p,cx,out){
  const db=cx.db;
  /* CREATE ... TABLESPACE / USER / ROLE / PROFILE / DIRECTORY / DATABASE LINK */
  if(p.isW('CREATE')){const save=p.i;p.next();const orRep=p.acceptW('OR','REPLACE');
    let big=null,temp=false,undo=false;if(p.acceptW('BIGFILE'))big=true;else if(p.acceptW('SMALLFILE'))big=false;
    if(p.acceptW('TEMPORARY'))temp=true;else if(p.acceptW('UNDO'))undo=true;
    if(p.acceptW('TABLESPACE')){needPriv(cx,'CREATE TABLESPACE');needOpen(cx);const name=p.ident();if(big==null)big=false;
      if(db.ts[name])throw E('ORA-01543','tablespace \''+name+'\' already exists');
      if(temp)p.expectW('TEMPFILE');else{if(p.isW('TEMPFILE'))throw E('ORA-02180','invalid option for CREATE TABLESPACE',[hint('Normal tablespace mein DATAFILE likhte hain, TEMPFILE sirf TEMPORARY ke saath.')]);p.expectW('DATAFILE');}
      const files=[fileClause(p,cx)];while(p.acceptOp(','))files.push(fileClause(p,cx));
      if(big&&files.length>1)throw E('ORA-32774','more than one file was specified for bigfile tablespace '+name);
      let group=null;
      while(!p.eof()){if(p.acceptW('TABLESPACE','GROUP')){group=p.ident();continue;}if(p.acceptW('EXTENT','MANAGEMENT','LOCAL')){p.acceptW('AUTOALLOCATE');if(p.acceptW('UNIFORM')){p.acceptW('SIZE');p.next();}continue;}if(p.acceptW('SEGMENT','SPACE','MANAGEMENT')){p.next();continue;}if(p.acceptW('LOGGING')||p.acceptW('NOLOGGING')||p.acceptW('ONLINE'))continue;if(p.acceptW('BLOCKSIZE')){p.next();continue;}throw E('ORA-02180','invalid option for CREATE TABLESPACE');}
      if(group&&!temp)throw E('ORA-10916','TABLESPACE GROUP cannot be specified for this type of tablespace');
      if(group&&db.ts[group])throw E('ORA-10918','TABLESPACE GROUP name cannot be the same as tablespace name');
      db.ts[name]={name,type:temp?'TEMPORARY':undo?'UNDO':'PERMANENT',big,status:'ONLINE',group,files,baseUsed:0};
      files.forEach(f=>{delete db.deletedFiles[f.name.toLowerCase()];});
      out.ok('Tablespace created.');return true;}
    if(big!=null||temp||undo){p.i=save;return false;}
    if(p.acceptW('USER')){needPriv(cx,'CREATE USER');needOpen(cx);const ine=p.acceptW('IF','NOT','EXISTS');const name=p.ident();
      if(ine&&db.users[name]){while(!p.eof()&&!p.isOp(';'))p.next();out.ok('User '+name+' created.');return true;}
      if(db.users[name]||db.roles[name])throw E('ORA-01920','user name \''+name+'\' conflicts with another user or role name');
      p.expectW('IDENTIFIED');p.expectW('BY');const pw=pwTok(p);
      const u={name,pw,id:db.nextUserId++,status:'OPEN',profile:'DEFAULT',dts:db.defaultTs,tts:db.defaultTemp,quotas:{},privs:{},roles:{},defaultRoles:'ALL',failed:0,created:today(cx)};
      userClauses(p,u,true,cx);db.users[name]=u;out.ok('User '+name+' created.');return true;}
    if(p.acceptW('ROLE')){needPriv(cx,'CREATE ROLE');needOpen(cx);const name=p.ident();
      if(db.roles[name]||db.users[name])throw E('ORA-01921','role name \''+name+'\' conflicts with another user or role name');
      let pw=null;if(p.acceptW('IDENTIFIED','BY'))pw=pwTok(p);else p.acceptW('NOT','IDENTIFIED');
      db.roles[name]={name,pw,privs:{},roles:{}};
      if(!isSysdba(cx)){const u=db.users[cx.sess.user];if(u)u.roles[name]={admin:true,def:true};}
      out.ok('Role '+name+' created.');return true;}
    if(p.isW('ROLES')){throw E('ORA-00901','invalid CREATE command',[hint('ROLES nahi, ROLE likho: CREATE ROLE naam;')]);}
    if(p.acceptW('PROFILE')){needPriv(cx,'CREATE PROFILE');needOpen(cx);const name=p.ident();if(db.profiles[name])throw E('ORA-02379','profile '+name+' already exists');
      p.expectW('LIMIT');db.profiles[name]={name,limits:parseLimits(p)};out.ok('Profile '+name+' created.');return true;}
    if(p.acceptW('DIRECTORY')){needPriv(cx,'CREATE ANY DIRECTORY');needOpen(cx);const name=p.ident();p.expectW('AS');const path=p.str();if(db.dirs[name]&&!orRep)throw E('ORA-00955','name is already used by an existing object');db.dirs[name]={name,path};out.ok('Directory created.');return true;}
    const pub=p.acceptW('PUBLIC');
    if(p.acceptW('DATABASE','LINK')){needOpen(cx);needPriv(cx,pub?'CREATE PUBLIC DATABASE LINK':'CREATE DATABASE LINK');let name=p.ident();while(p.acceptOp('.'))name+='.'+p.ident();
      p.expectW('CONNECT');p.expectW('TO');const user=p.ident();p.expectW('IDENTIFIED');p.expectW('BY');const pw=pwTok(p);p.expectW('USING');const using=p.str();
      const key=(pub?'PUBLIC':curSchema(cx))+'.'+name;if(db.links[key])throw E('ORA-02011','duplicate database link name');
      db.links[key]={owner:curSchema(cx),name,pub,user,pw,using,created:today(cx)};out.ok('Database link created.');
      if(!db.remote[String(using).toUpperCase()])out.dim('(Note: simulator ke tnsnames.ora mein sirf SALES naam ka remote database hai.)');return true;}
    p.i=save;return false;}
  if(p.isW('DROP')){const save=p.i;p.next();
    if(p.acceptW('TABLESPACE')){needPriv(cx,'DROP TABLESPACE');needOpen(cx);const name=p.ident();const ts=db.ts[name];if(!ts)throw E('ORA-00959','tablespace \''+name+'\' does not exist');
      let contents=false,andFiles=false,cascade=false;
      if(p.acceptW('INCLUDING','CONTENTS')){contents=true;if(p.acceptW('AND','DATAFILES'))andFiles=true;else p.acceptW('KEEP','DATAFILES');}
      if(p.acceptW('CASCADE','CONSTRAINTS'))cascade=true;
      if(name==='SYSTEM')throw E('ORA-01550','cannot drop system tablespace');if(name==='SYSAUX')throw E('ORA-13501','Cannot drop SYSAUX tablespace');
      if(name===db.defaultTemp||(ts.group&&ts.group===db.defaultTemp&&Object.values(db.ts).filter(t=>t.group===ts.group).length===1))throw E('ORA-12906','cannot drop default temporary tablespace');
      if(name===db.defaultTs)throw E('ORA-12919','Can not drop the default permanent tablespace');
      const inside=Object.values(db.objs).filter(t=>t.type==='TABLE'&&t.ts===name&&!t.temp);
      if(inside.length&&!contents)throw E('ORA-01549','tablespace not empty, use INCLUDING CONTENTS option');
      const keys=new Set(inside.map(t=>t.key));
      const refs=Object.values(db.objs).filter(t=>t.type==='TABLE'&&t.ts!==name&&t.cons.some(c=>c.k==='R'&&keys.has(c.ref.key)));
      if(refs.length&&!cascade)throw E('ORA-02449','unique/primary keys in table referenced by foreign keys');
      refs.forEach(t=>{t.cons=t.cons.filter(c=>!(c.k==='R'&&keys.has(c.ref.key)));});
      inside.forEach(t=>{delete db.objs[t.key];for(const ik in db.idx)if(db.idx[ik].tkey===t.key)delete db.idx[ik];});
      ts.files.forEach(f=>{db.deletedFiles[f.name.toLowerCase()]=andFiles?true:false;});
      delete db.ts[name];out.ok('Tablespace dropped.');
      if(!andFiles)out.dim('(Files disk par abhi bhi hain: '+ts.files.map(f=>f.name).join(', ')+'. Saath mein mitane ke liye AND DATAFILES likho.)');return true;}
    if(p.acceptW('USER')){needPriv(cx,'DROP USER');needOpen(cx);const ifx=p.acceptW('IF','EXISTS');const name=p.ident();const u=db.users[name];if(!u&&ifx){p.acceptW('CASCADE');out.ok('User '+name+' dropped.');return true;}if(!u)throw E('ORA-01918','user \''+name+'\' does not exist');
      const casc=p.acceptW('CASCADE');
      if(cx.sess.user===name&&!cx.sess.sysdba)throw E('ORA-01940','cannot drop a user that is currently connected');
      if(['SYS','SYSTEM'].includes(name))throw E('ORA-28014','cannot drop administrative user or role');
      const owned=Object.values(db.objs).filter(t=>t.owner===name);
      if(owned.length&&!casc)throw E('ORA-01922','CASCADE must be specified to drop \''+name+'\'',[hint('User ke paas tables/objects hain. DROP USER '+name.toLowerCase()+' CASCADE; likho.')]);
      owned.forEach(t=>delete db.objs[t.key]);for(const ik in db.idx)if(db.idx[ik].owner===name)delete db.idx[ik];for(const tk in db.trigs)if(db.trigs[tk].owner===name)delete db.trigs[tk];
      db.objPrivs=db.objPrivs.filter(o=>o.grantee!==name&&o.owner!==name);
      Object.keys(db.links).forEach(k=>{if(k.startsWith(name+'.'))delete db.links[k];});
      delete db.users[name];out.ok('User '+name+' dropped.');return true;}
    if(p.acceptW('ROLE')){needPriv(cx,'DROP ANY ROLE');needOpen(cx);const r=p.ident();if(!db.roles[r])throw E('ORA-01919','role \''+r+'\' does not exist');
      if(['DBA','CONNECT','RESOURCE'].includes(r)&&!isSysdba(cx))throw E('ORA-01031','insufficient privileges');
      delete db.roles[r];Object.values(db.users).forEach(u=>delete u.roles[r]);Object.values(db.roles).forEach(x=>delete x.roles[r]);db.objPrivs=db.objPrivs.filter(o=>o.grantee!==r);cx.sess.roles.delete(r);out.ok('Role dropped.');return true;}
    if(p.acceptW('PROFILE')){needPriv(cx,'DROP PROFILE');needOpen(cx);const pr=p.ident();if(!db.profiles[pr])throw E('ORA-02380','profile '+pr+' does not exist');if(pr==='DEFAULT')throw E('ORA-02386','profile DEFAULT cannot be dropped');
      const users=Object.values(db.users).filter(u=>u.profile===pr);const casc=p.acceptW('CASCADE');
      if(users.length&&!casc)throw E('ORA-02382','profile '+pr+' has users assigned, cannot drop without CASCADE');
      users.forEach(u=>u.profile='DEFAULT');delete db.profiles[pr];out.ok('Profile dropped.');return true;}
    if(p.acceptW('DIRECTORY')){needPriv(cx,'DROP ANY DIRECTORY');const d=p.ident();if(!db.dirs[d])throw E('ORA-04043','object '+d+' does not exist');delete db.dirs[d];out.ok('Directory dropped.');return true;}
    const pub=p.acceptW('PUBLIC');
    if(p.acceptW('DATABASE','LINK')){needOpen(cx);let name=p.ident();while(p.acceptOp('.'))name+='.'+p.ident();
      if(pub)needPriv(cx,'DROP PUBLIC DATABASE LINK');const key=(pub?'PUBLIC':curSchema(cx))+'.'+name;
      if(!db.links[key])throw E('ORA-02024','database link not found');delete db.links[key];out.ok('Database link dropped.');return true;}
    p.i=save;return false;}
  if(p.isW('ALTER')){const save=p.i;p.next();
    if(!p.isW('LINK',1)&&p.acceptW('DATABASE')){
      if(p.isW('MOUNT')||p.isW('OPEN')){if(!isSysdba(cx))throw E('ORA-01031','insufficient privileges');
        if(p.acceptW('MOUNT')){if(db.inst==='SHUTDOWN')throw E('ORA-01034','ORACLE not available');if(db.inst!=='NOMOUNT')throw E('ORA-01100','database already mounted');db.inst='MOUNTED';out.ok('Database altered.');return true;}
        p.next();if(db.inst==='SHUTDOWN')throw E('ORA-01034','ORACLE not available');if(db.inst==='NOMOUNT')throw E('ORA-01507','database not mounted');if(db.inst==='OPEN')throw E('ORA-01531','a database already open by the instance');db.inst='OPEN';db.recovery=false;out.ok('Database altered.');return true;}
      needOpen(cx);needPriv(cx,'ALTER DATABASE');
      if(p.acceptW('DEFAULT')){const temp=p.acceptW('TEMPORARY');p.expectW('TABLESPACE');const n=p.ident();
        if(temp){const isGroup=Object.values(db.ts).some(t=>t.group===n);if(!isGroup&&!db.ts[n])throw E('ORA-00959','tablespace \''+n+'\' does not exist');if(!isGroup&&db.ts[n].type!=='TEMPORARY')throw E('ORA-12904','default temporary tablespace cannot be altered to PERMANENT type');db.defaultTemp=n;}
        else{if(!db.ts[n])throw E('ORA-00959','tablespace \''+n+'\' does not exist');if(db.ts[n].type==='TEMPORARY')throw E('ORA-12902','default temporary tablespace must be SYSTEM or of TEMPORARY type');db.defaultTs=n;}
        out.ok('Database altered.');return true;}
      if(p.acceptW('DATAFILE')||p.acceptW('TEMPFILE')){const x=p.next();const fn=x.k==='str'?x.v:String(x.v);const hit=x.k==='num'?Object.values(db.ts).flatMap(t=>t.files.map(f=>({ts:t,f}))).find(h=>h.f.id===x.v):findFile(db,fn);
        if(!hit)throw E('ORA-01516','nonexistent log file, data file, or temporary file "'+fn+'"');
        if(p.acceptW('RESIZE')){const n=p.sizeMB();const used=tsUsed(db,hit.ts.name)-(tsSize(db,hit.ts.name)-hit.f.size);if(n<used)throw E('ORA-03297','file contains used data beyond requested RESIZE value');hit.f.size=n;if(hit.f.max<n)hit.f.max=n;out.ok('Database altered.');return true;}
        if(p.acceptW('AUTOEXTEND')){if(p.acceptW('ON')){hit.f.auto=true;hit.f.max=32767;if(p.acceptW('NEXT'))hit.f.next=p.sizeMB();if(p.acceptW('MAXSIZE')){if(!p.acceptW('UNLIMITED'))hit.f.max=p.sizeMB();}}else{p.expectW('OFF');hit.f.auto=false;}out.ok('Database altered.');return true;}
        if(p.acceptW('OFFLINE')||p.acceptW('ONLINE')){out.ok('Database altered.');return true;}
        throw E('ORA-02231','missing or invalid option to ALTER DATABASE');}
      if(p.acceptW('BACKUP','CONTROLFILE')){while(!p.eof())p.next();out.ok('Database altered.');return true;}
      throw E('ORA-02231','missing or invalid option to ALTER DATABASE');}
    if(p.acceptW('SYSTEM')){needPriv(cx,'ALTER SYSTEM');if(p.acceptW('SET')){while(!p.eof())p.next();}else while(!p.eof())p.next();out.ok('System altered.');return true;}
    if(p.acceptW('TABLESPACE')){needOpen(cx);needPriv(cx,'ALTER TABLESPACE');const name=p.ident();const ts=db.ts[name];if(!ts)throw E('ORA-00959','tablespace \''+name+'\' does not exist');
      if(p.acceptW('ADD')){const tempf=p.acceptW('TEMPFILE');if(!tempf)p.expectW('DATAFILE');if(ts.big)throw E('ORA-32771','cannot add file to bigfile (BFT) tablespace',[hint('Bigfile mein ek hi file hoti hai. RESIZE karo: ALTER DATABASE DATAFILE \''+ts.files[0].name+'\' RESIZE ...')]);
        if(tempf&&ts.type!=='TEMPORARY')throw E('ORA-03217','invalid option for alter of TEMPORARY TABLESPACE');if(!tempf&&ts.type==='TEMPORARY')throw E('ORA-03217','invalid option for alter of TEMPORARY TABLESPACE');
        const f=fileClause(p,cx);ts.files.push(f);out.ok('Tablespace altered.');return true;}
      if(p.acceptW('OFFLINE')){if(name==='SYSTEM')throw E('ORA-01541','system tablespace cannot be brought offline; shut down if necessary');p.acceptW('NORMAL')||p.acceptW('IMMEDIATE')||p.acceptW('TEMPORARY');ts.status='OFFLINE';out.ok('Tablespace altered.');return true;}
      if(p.acceptW('ONLINE')){ts.status='ONLINE';out.ok('Tablespace altered.');return true;}
      if(p.acceptW('READ','ONLY')){ts.status='READ ONLY';out.ok('Tablespace altered.');return true;}
      if(p.acceptW('READ','WRITE')){ts.status='ONLINE';out.ok('Tablespace altered.');return true;}
      if(p.acceptW('TABLESPACE','GROUP')){if(ts.type!=='TEMPORARY')throw E('ORA-10916','TABLESPACE GROUP cannot be specified for this type of tablespace');let g='';const x=p.peek();if(x&&x.k==='str'){g=p.next().v;}else if(x)g=p.ident();if(g&&db.ts[g])throw E('ORA-10918','TABLESPACE GROUP name cannot be the same as tablespace name');ts.group=g||null;out.ok('Tablespace altered.');return true;}
      if(p.acceptW('RESIZE')){if(!ts.big)throw E('ORA-32773','operation not supported for smallfile tablespace '+name);ts.files[0].size=p.sizeMB();out.ok('Tablespace altered.');return true;}
      if(p.acceptW('RENAME','TO')){const nn=p.ident();if(db.ts[nn])throw E('ORA-02154','a tablespace with the name \''+nn+'\' is found');db.ts[nn]=ts;ts.name=nn;delete db.ts[name];Object.values(db.objs).forEach(o=>{if(o.ts===name)o.ts=nn;});Object.values(db.users).forEach(u=>{if(u.dts===name)u.dts=nn;});out.ok('Tablespace altered.');return true;}
      throw E('ORA-02142','missing or invalid ALTER TABLESPACE option');}
    if(p.acceptW('USER')){needOpen(cx);const name=p.ident();const u=db.users[name];if(!u)throw E('ORA-01918','user \''+name+'\' does not exist');
      const self=cx.sess.user===name;if(!(self&&p.isW('IDENTIFIED')))needPriv(cx,'ALTER USER');
      userClauses(p,u,false,cx);out.ok('User '+name+' altered.');return true;}
    if(p.acceptW('ROLE')){needOpen(cx);const r=p.ident();const ro=db.roles[r];if(!ro)throw E('ORA-01919','role \''+r+'\' does not exist');needPriv(cx,'ALTER ANY ROLE');
      if(p.acceptW('NOT','IDENTIFIED'))ro.pw=null;else{p.expectW('IDENTIFIED');p.expectW('BY');ro.pw=pwTok(p);}out.ok('Role altered.');return true;}
    if(p.acceptW('PROFILE')){needOpen(cx);needPriv(cx,'ALTER PROFILE');const pr=p.ident();if(!db.profiles[pr])throw E('ORA-02380','profile '+pr+' does not exist');p.expectW('LIMIT');Object.assign(db.profiles[pr].limits,parseLimits(p));out.ok('Profile altered.');out.dim('(Naye rules agle login se lagu honge.)');return true;}
    const pub=p.acceptW('PUBLIC');
    if(p.acceptW('DATABASE','LINK')){needOpen(cx);let name=p.ident();while(p.acceptOp('.'))name+='.'+p.ident();needPriv(cx,pub?'ALTER PUBLIC DATABASE LINK':'ALTER DATABASE LINK');const l=db.links[(pub?'PUBLIC':curSchema(cx))+'.'+name];if(!l)throw E('ORA-02024','database link not found');
      p.expectW('CONNECT');p.expectW('TO');l.user=p.ident();p.expectW('IDENTIFIED');p.expectW('BY');l.pw=pwTok(p);out.ok('Database link altered.');return true;}
    p.i=save;return false;}
  if(p.isW('GRANT')){grantStmt(p,cx,out);return true;}
  if(p.isW('REVOKE')){revokeStmt(p,cx,out);return true;}
  if(p.isW('SET')&&p.isW('ROLE',1)){setRoleStmt(p,cx,out);return true;}
  if(p.isW('AUDIT')||p.isW('NOAUDIT')){while(!p.eof())p.next();out.ok(p.t[0].v==='AUDIT'?'Audit succeeded.':'Noaudit succeeded.');return true;}
  return false;
}
function userClauses(p,u,isCreate,cx){const db=cx.db;
  while(!p.eof()){
    if(p.acceptW('DEFAULT','TABLESPACE')){const t=p.ident();if(!db.ts[t])throw E('ORA-00959','tablespace \''+t+'\' does not exist');if(db.ts[t].type==='TEMPORARY')throw E('ORA-12911','permanent tablespace cannot be temporary tablespace');u.dts=t;continue;}
    if(p.acceptW('TEMPORARY','TABLESPACE')){const t=p.ident();if(!db.ts[t]&&!Object.values(db.ts).some(x=>x.group===t))throw E('ORA-00959','tablespace \''+t+'\' does not exist');if(db.ts[t]&&db.ts[t].type!=='TEMPORARY')throw E('ORA-10615','Invalid tablespace type for temporary tablespace');u.tts=t;continue;}
    if(p.acceptW('QUOTA')){let q;if(p.acceptW('UNLIMITED'))q=-1;else q=p.sizeMB();p.expectW('ON');const t=p.ident();if(!db.ts[t])throw E('ORA-00959','tablespace \''+t+'\' does not exist');u.quotas[t]=q;continue;}
    if(p.acceptW('PROFILE')){const pr=p.ident();if(!db.profiles[pr])throw E('ORA-02380','profile '+pr+' does not exist');u.profile=pr;continue;}
    if(p.acceptW('PASSWORD','EXPIRE')){u.status=u.status.includes('LOCKED')?'EXPIRED & LOCKED':'EXPIRED';continue;}
    if(p.acceptW('ACCOUNT','LOCK')){u.status=u.status.includes('EXPIRED')?'EXPIRED & LOCKED':'LOCKED';continue;}
    if(p.acceptW('ACCOUNT','UNLOCK')){u.status=u.status.includes('EXPIRED')?'EXPIRED':'OPEN';u.failed=0;continue;}
    if(!isCreate&&p.acceptW('IDENTIFIED','BY')){u.pw=pwTok(p);if(p.acceptW('REPLACE'))pwTok(p);if(u.status==='EXPIRED')u.status='OPEN';else if(u.status==='EXPIRED & LOCKED')u.status='LOCKED';continue;}
    if(!isCreate&&p.acceptW('DEFAULT','ROLE')){
      if(p.acceptW('ALL')){u.defaultRoles='ALL';if(p.acceptW('EXCEPT')){const ex=[];do{ex.push(p.ident());}while(p.acceptOp(','));u.defaultRoles={except:ex};}}
      else if(p.acceptW('NONE'))u.defaultRoles='NONE';
      else{const rs=[];do{const r=p.ident();if(!u.roles[r])throw E('ORA-01955','DEFAULT ROLE \''+r+'\' not granted to user');rs.push(r);}while(p.acceptOp(','));u.defaultRoles=rs;}
      continue;}
    if(p.acceptW('CONTAINER')){p.acceptOp('=');p.next();continue;}
    throw E('ORA-00922','missing or invalid option');
  }
}
function parseLimits(p){const l={};while(!p.eof()){const k=p.ident();if(!PROFILE_PARAMS[k])throw E('ORA-02376','invalid or redundant resource');const x=p.next();if(!x)throw E('ORA-02377','invalid profile limit '+k);l[k]=x.k==='num'?String(x.v):x.v;}return l;}
function privList(p,stop){const items=[];let cur=[];
  while(!p.eof()&&!stop.some(w=>p.isW(w))){if(p.acceptOp(',')){items.push(cur.join(' '));cur=[];continue;}if(p.isOp('(')){let d=0;do{const x=p.next();if(x.v==='(')d++;if(x.v===')')d--;}while(d>0&&!p.eof());continue;}const x=p.next();cur.push(x.k==='id'?x.v:x.raw);}
  if(cur.length)items.push(cur.join(' '));return items.filter(Boolean);}
function grantees(p){const g=[];do{const x=p.next();if(!x||x.k!=='id')throw E('ORA-00987','missing or invalid username(s)');g.push(x.v);}while(p.acceptOp(','));return g;}
function checkGrantee(db,g){if(g==='PUBLIC')return;if(!db.users[g]&&!db.roles[g])throw E('ORA-01917','user or role \''+g+'\' does not exist');}
function grantStmt(p,cx,out){const db=cx.db;
  p.expectW('GRANT');needOpen(cx);
  const items=privList(p,['ON','TO']);
  if(p.acceptW('ON')){
    let dir=false;if(p.acceptW('DIRECTORY'))dir=true;const q=p.qname();p.expectW('TO');const gs=grantees(p);const go=p.acceptW('WITH','GRANT','OPTION');
    if(dir){const d=q.name;if(!db.dirs[d])throw E('ORA-00942','table or view does not exist');gs.forEach(g=>{checkGrantee(db,g);items.forEach(it=>{const pv=it==='ALL'?['READ','WRITE']:[it];pv.forEach(x=>db.dirPrivs.push({dir:d,grantee:g,priv:x}));});});out.ok('Grant succeeded.');return;}
    const o=resolveObj(q,cx,true);if(!o)throw tabNotFound(q,cx);
    const privs=items.flatMap(it=>it==='ALL'||it==='ALL PRIVILEGES'?(o.type==='TABLE'||o.type==='VIEW'?['SELECT','INSERT','UPDATE','DELETE','ALTER','INDEX','REFERENCES']:o.type==='SEQUENCE'?['SELECT','ALTER']:['EXECUTE','DEBUG']):[it]);
    privs.forEach(pv=>{if(!OBJ_PRIVS.includes(pv))throw E('ORA-00990','missing or invalid privilege');});
    if(o.owner!==cx.sess.user&&!hasAll(cx)&&!hasPriv(cx,'GRANT ANY OBJECT PRIVILEGE')&&!privs.every(pv=>db.objPrivs.some(x=>x.grantee===cx.sess.user&&x.owner===o.owner&&x.obj===o.name&&x.priv===pv&&x.grantable)))throw E('ORA-01031','insufficient privileges');
    gs.forEach(g=>{checkGrantee(db,g);if(g===o.owner)throw E('ORA-01749','you may not GRANT/REVOKE privileges to/from yourself');privs.forEach(pv=>{const ex=objPrivOf(db,g,o.owner,o.name,pv);if(ex){if(go)ex.grantable=true;}else db.objPrivs.push({grantee:g,owner:o.owner,obj:o.name,priv:pv,grantable:go,grantor:cx.sess.user,otype:o.type});});});
    out.ok('Grant succeeded.');return;}
  p.expectW('TO');const gs=grantees(p);const admin=p.acceptW('WITH','ADMIN','OPTION');
  if(p.acceptW('WITH','GRANT','OPTION'))throw E('ORA-01939','only the ADMIN OPTION can be specified');
  for(const it of items){
    if(it==='ALL PRIVILEGES'||it==='ALL'){if(!hasAll(cx))throw E('ORA-01031','insufficient privileges');gs.forEach(g=>{checkGrantee(db,g);const x=db.users[g]||db.roles[g];x.all=true;SYS_PRIVS.forEach(pv=>{if(pv!=='SYSDBA'&&pv!=='SYSOPER')x.privs[pv]=x.privs[pv]||{admin:false};});});continue;}
    if(SYS_PRIVS.includes(it)){
      if(!hasAll(cx)&&!hasPriv(cx,'GRANT ANY PRIVILEGE')){const me=db.users[cx.sess.user];const mine=me&&me.privs[it];if(!(mine&&mine.admin))throw E('ORA-01031','insufficient privileges');}
      gs.forEach(g=>{checkGrantee(db,g);const x=db.users[g]||db.roles[g];x.privs[it]={admin:admin||(x.privs[it]&&x.privs[it].admin)||false};});continue;}
    if(db.roles[it]){
      if(!hasAll(cx)&&!hasPriv(cx,'GRANT ANY ROLE')){const me=db.users[cx.sess.user];if(!(me&&me.roles[it]&&me.roles[it].admin))throw E('ORA-01031','insufficient privileges');}
      gs.forEach(g=>{checkGrantee(db,g);if(g===it)throw E('ORA-01934','circular role grant detected');const x=db.users[g]||db.roles[g];x.roles[it]={admin,def:true};});continue;}
    if(OBJ_PRIVS.includes(it))throw E('ORA-00905','missing keyword',[hint(it+' object privilege hai; ON table_name likhna padta hai: GRANT '+it.toLowerCase()+' ON ot.customers TO user;')]);
    if(/^(CREATE|ALTER|DROP|SELECT|INSERT|UPDATE|DELETE|EXECUTE|GRANT|UNLIMITED)\b/.test(it))throw E('ORA-00990','missing or invalid privilege');
    throw E('ORA-01919','role \''+it+'\' does not exist');
  }
  out.ok('Grant succeeded.');
}
function revokeStmt(p,cx,out){const db=cx.db;
  p.expectW('REVOKE');needOpen(cx);const items=privList(p,['ON','FROM']);
  if(p.acceptW('ON')){const dir=p.acceptW('DIRECTORY');const q=p.qname();p.expectW('FROM');const gs=grantees(p);
    if(dir){db.dirPrivs=db.dirPrivs.filter(x=>!(x.dir===q.name&&gs.includes(x.grantee)));out.ok('Revoke succeeded.');return;}
    const o=resolveObj(q,cx,true);if(!o)throw tabNotFound(q,cx);
    const privs=items.flatMap(it=>it==='ALL'||it==='ALL PRIVILEGES'?OBJ_PRIVS:[it]);
    for(const g of gs)for(const pv of privs){const x=objPrivOf(db,g,o.owner,o.name,pv);if(!x){if(items.includes('ALL')||items.includes('ALL PRIVILEGES'))continue;throw E('ORA-01927','cannot REVOKE privileges you did not grant');}
      if(x.grantor!==cx.sess.user&&!hasAll(cx)&&!hasPriv(cx,'GRANT ANY OBJECT PRIVILEGE'))throw E('ORA-01927','cannot REVOKE privileges you did not grant');}
    /* cascade: privileges this grantee passed on WITH GRANT OPTION go too */
    const gone=db.objPrivs.filter(x=>gs.includes(x.grantee)&&x.owner===o.owner&&x.obj===o.name&&privs.includes(x.priv));
    db.objPrivs=db.objPrivs.filter(x=>!gone.includes(x)&&!(x.owner===o.owner&&x.obj===o.name&&gone.some(gx=>gx.grantee===x.grantor&&gx.priv===x.priv)));
    out.ok('Revoke succeeded.');return;}
  p.expectW('FROM');const gs=grantees(p);
  for(const it of items){
    if(it==='ALL PRIVILEGES'||it==='ALL'){gs.forEach(g=>{const x=db.users[g]||db.roles[g];if(!x)throw E('ORA-01917','user or role \''+g+'\' does not exist');x.privs={};x.all=false;});continue;}
    if(SYS_PRIVS.includes(it)){
      if(!hasAll(cx)&&!hasPriv(cx,'GRANT ANY PRIVILEGE')){const me=db.users[cx.sess.user];if(!(me&&me.privs[it]&&me.privs[it].admin))throw E('ORA-01031','insufficient privileges');}
      gs.forEach(g=>{const x=db.users[g]||db.roles[g];if(!x)throw E('ORA-01917','user or role \''+g+'\' does not exist');if(!x.privs[it])throw E('ORA-01952','system privileges not granted to \''+g+'\'');delete x.privs[it];});continue;}
    if(db.roles[it]){gs.forEach(g=>{const x=db.users[g]||db.roles[g];if(!x||!x.roles[it])throw E('ORA-01951','ROLE \''+it+'\' not granted to \''+g+'\'');delete x.roles[it];if(cx.sess.user===g)cx.sess.roles.delete(it);});continue;}
    throw E('ORA-00990','missing or invalid privilege');
  }
  out.ok('Revoke succeeded.');
}
function setRoleStmt(p,cx,out){const db=cx.db;
  p.expectW('SET');p.expectW('ROLE');const u=db.users[cx.sess.user];
  if(cx.sess.sysdba){while(!p.eof())p.next();out.ok('Role set.');return;}
  if(p.acceptW('NONE')){cx.sess.roles=new Set();out.ok('Role set.');return;}
  if(p.acceptW('ALL')){const ex=[];if(p.acceptW('EXCEPT')){do{ex.push(p.ident());}while(p.acceptOp(','));}
    cx.sess.roles=new Set(Object.keys(u.roles).filter(r=>!ex.includes(r)&&!(db.roles[r]&&db.roles[r].pw)));out.ok('Role set.');return;}
  const want=[];
  do{const r=p.ident();let pw=null;if(p.acceptW('IDENTIFIED','BY'))pw=pwTok(p);
    if(!db.roles[r]||!u.roles[r])throw E('ORA-01924','role \''+r+'\' not granted or does not exist');
    if(db.roles[r].pw&&db.roles[r].pw!==pw)throw E('ORA-01979','missing or invalid password for role \''+r+'\'');
    want.push(r);}while(p.acceptOp(','));
  cx.sess.roles=new Set(want);out.ok('Role set.');
}
/* ---------- instance ---------- */
function startupCmd(st,cx,out){const db=cx.db;
  if(!isSysdba(cx))throw E('ORA-01031','insufficient privileges');
  if(db.inst!=='SHUTDOWN')throw E('ORA-01081','cannot start already-running ORACLE - shut it down first');
  const m=st.toUpperCase();const to=/NOMOUNT/.test(m)?'NOMOUNT':/MOUNT/.test(m)?'MOUNTED':'OPEN';
  out.say('ORACLE instance started.');out.say('');['Total System Global Area 2550136832 bytes','Fixed Size                  3835304 bytes','Variable Size             738200152 bytes','Database Buffers         1795162112 bytes','Redo Buffers               12939264 bytes'].forEach(x=>out.say(x));
  db.inst='NOMOUNT';if(to==='NOMOUNT')return;out.say('Database mounted.');db.inst='MOUNTED';if(to==='MOUNTED')return;
  if(db.recovery){out.dim('(Pichla SHUTDOWN ABORT tha: SMON ne instance recovery kar di.)');db.recovery=false;}
  out.say('Database opened.');db.inst='OPEN';
}
function shutdownCmd(st,cx,out){const db=cx.db;
  const opt=st.trim().replace(/^SHUTDOWN\s*/i,'').replace(/;\s*$/,'').trim().toUpperCase();
  if(opt&&!['NORMAL','TRANSACTIONAL','IMMEDIATE','ABORT'].includes(opt))throw E('SP2-0717','illegal SHUTDOWN option',[hint('SHUTDOWN ke saath sirf NORMAL, TRANSACTIONAL, IMMEDIATE ya ABORT chalta hai.')]);
  if(!isSysdba(cx))throw E('ORA-01031','insufficient privileges');
  if(db.inst==='SHUTDOWN')throw E('ORA-01034','ORACLE not available');
  const m=st.toUpperCase();
  if(/ABORT/.test(m)){db.inst='SHUTDOWN';db.recovery=true;out.say('ORACLE instance shut down.');return;}
  if(hasPending(cx)&&!/TRANSACTIONAL|IMMEDIATE/.test(m)){}
  if(db.inst==='OPEN')out.say('Database closed.');if(db.inst!=='NOMOUNT')out.say('Database dismounted.');
  out.say('ORACLE instance shut down.');db.inst='SHUTDOWN';
}
/* ---------- shell tools ---------- */
function shellCmd(cmd,cx,out){const db=cx.db;
  const parts=cmd.trim().replace(/;$/,'').split(/\s+/);const tool=parts[0].toLowerCase();
  if(tool==='clear'||tool==='cls'){out.clear=true;return;}
  if(tool==='lsnrctl'){const sub2=(parts[1]||'status').toLowerCase();
    if(sub2==='stop'){out.say('Connecting to (DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=localhost)(PORT=1521)))');if(!db.listener){out.err('TNS-12541: TNS:no listener');return;}db.listener=false;out.say('The command completed successfully');return;}
    if(sub2==='start'){if(db.listener){out.err('TNS-01106: Listener using listener name LISTENER has already been started');return;}db.listener=true;out.say('Starting /u01/app/oracle/product/23ai/bin/tnslsnr: please wait...');out.say('Listening on: (DESCRIPTION=(ADDRESS=(PROTOCOL=tcp)(HOST=localhost)(PORT=1521)))');out.say('The command completed successfully');return;}
    if(sub2==='status'||sub2==='services'){out.say('Connecting to (DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=localhost)(PORT=1521)))');if(!db.listener){out.err('TNS-12541: TNS:no listener');return;}
      ['STATUS of the LISTENER','------------------------','Alias                     LISTENER','Version                   TNSLSNR for Linux: Version 23.0.0.0.0','Start Date                '+fmtDate(sysdate(cx),'DD-MON-YYYY HH24:MI:SS'),'Uptime                    0 days 2 hr. 14 min. 7 sec','Listener Log File         /u01/app/oracle/diag/tnslsnr/listener/alert/log.xml','Listening Endpoints Summary...','  (DESCRIPTION=(ADDRESS=(PROTOCOL=tcp)(HOST=localhost)(PORT=1521)))','Services Summary...','Service "FREEPDB1" has 1 instance(s).','  Instance "FREE", status '+(db.inst==='SHUTDOWN'?'BLOCKED':'READY')+', has 1 handler(s) for this service...','The command completed successfully'].forEach(x=>out.say(x));return;}
    if(sub2==='help'){out.say('start  stop  status  services  version  reload');return;}
    out.err('NL-00853: undefined command "'+sub2+'".  Try "help"');return;}
  if(tool==='cat'){const f=(parts[1]||'').split(/[\\/]/).pop().toLowerCase();if(VFILES[f]!=null){VFILES[f].split('\n').forEach(x=>out.say(x));return;}if(db.osFiles[f]){out.say(db.osFiles[f].text||'(binary dump file)');return;}out.err('cat: '+parts[1]+': No such file or directory');return;}
  if(tool==='ls'){out.say(Object.keys(VFILES).concat(Object.keys(db.osFiles)).join('  '));return;}
  if(tool==='mkdir'){return;}
  const args=parseArgs(parts.slice(1));
  if(tool==='expdp')return expdp(args,cx,out);if(tool==='impdp')return impdp(args,cx,out);if(tool==='sqlldr')return sqlldr(args,cx,out);
}
function parseArgs(list){const a={};const pos=[];for(const x of list){const m=x.match(/^(\w+)=(.*)$/);if(m)a[m[1].toLowerCase()]=m[2];else pos.push(x);}
  if(a.parfile){const f=a.parfile.split(/[\\/]/).pop().toLowerCase();const txt=VFILES[f];if(txt==null)throw E('LRM-00109','could not open parameter file "'+a.parfile+'"');txt.split('\n').forEach(l=>{const m=l.match(/^(\w+)=(.*)$/);if(m&&a[m[1].toLowerCase()]==null)a[m[1].toLowerCase()]=m[2];});}
  if(pos.length&&!a.userid)a.userid=pos[0];return a;}
function dpUser(a,cx){const up=(a.userid||'').split('@')[0];const[u,pw]=up.split('/');const user=(u||'').toUpperCase();const x=cx.db.users[user];
  if(!x||x.pw!==pw)throw E('ORA-01017','invalid username/password; logon denied');if(cx.db.inst!=='OPEN')throw E('ORA-01033','ORACLE initialization or shutdown in progress');return user;}
function dpDir(a,user,cx){const db=cx.db;const d=(a.directory||'').toUpperCase();if(!d||!db.dirs[d])throw E('ORA-39002','invalid operation',['ORA-39070: Unable to open the log file.','ORA-39087: directory name '+(d||'DATA_PUMP_DIR')+' is invalid']);
  if(!userHas(db,user,'CREATE ANY DIRECTORY')&&!db.dirPrivs.some(p=>p.dir===d&&p.grantee===user&&p.priv==='WRITE'))throw E('ORA-39002','invalid operation',['ORA-39070: Unable to open the log file.','ORA-39087: directory name '+d+' is invalid']);return db.dirs[d];}
function cloneTable(t){return{type:'TABLE',owner:t.owner,name:t.name,key:t.key,cols:t.cols.map(c=>Object.assign({},c,{identity:c.identity?Object.assign({},c.identity):undefined})),rows:t.rows.map(r=>({rid:r.rid,v:r.v.slice()})),cons:t.cons.map(c=>Object.assign({},c,{cols:c.cols?c.cols.slice():null})),ts:t.ts,virtual:t.virtual||0,ridSeq:t.ridSeq};}
function expdp(a,cx,out){const db=cx.db;
  const user=dpUser(a,cx);const dir=dpDir(a,user,cx);
  let tabs=[];const mode=a.schemas?'SCHEMA':'TABLE';
  if(a.schemas){const sch=a.schemas.toUpperCase();tabs=Object.values(db.objs).filter(t=>t.type==='TABLE'&&t.owner===sch&&!t.external&&!t.temp);}
  else if(a.tables){tabs=a.tables.split(',').map(n=>{const q=n.trim().toUpperCase();const[o,t]=q.includes('.')?q.split('.'):[user,q];const x=db.objs[o+'.'+t];if(!x||x.type!=='TABLE')throw E('ORA-39166','Object '+o+'.'+t+' was not found or could not be exported or imported.');return x;});}
  else throw E('ORA-39001','invalid argument value',['ORA-39071: Value for TABLES or SCHEMAS is required in this simulator.']);
  const job='"'+user+'"."SYS_EXPORT_'+mode+'_01"';
  out.say('Export: Release 23.0.0.0.0 - Production');out.say('Connected to: Oracle Database 23ai Free (simulator)');
  out.say('Starting '+job+':  '+(a.userid||'').split('/')[0]+'/******** '+(a.parfile?'parfile='+a.parfile:''));
  out.say('Processing object type '+mode+'_EXPORT/TABLE/TABLE_DATA');
  let total=0;tabs.forEach(t=>{const n=t.rows.length+(t.virtual||0);const kb=Math.max(5.5,n*0.09);total+=kb;out.say('. . exported "'+t.owner+'"."'+t.name+'"'.padEnd(40)+kb.toFixed(1).padStart(8)+' KB'+String(n).padStart(8)+' rows');});
  out.say('Master table '+job+' successfully loaded/unloaded');
  const pat=(a.dumpfile||'expdat.dmp');const cap=a.filesize?toMB(parseFloat(a.filesize),(a.filesize.match(/[kmgt]/i)||[''])[0].toUpperCase())*1024:Infinity;
  const nFiles=pat.includes('%U')?Math.max(1,Math.ceil((total+20)/cap)):1;
  out.say('******************************************************************************');out.say('Dump file set for '+job+' is:');
  const snapshot=tabs.map(t=>({key:t.key,copy:cloneTable(t)}));
  for(let i=1;i<=nFiles;i++){const fn=pat.replace(/%U/i,String(i).padStart(2,'0'));db.osFiles[fn.toLowerCase()]={dir:dir.name,dump:true,tables:snapshot};out.say('  '+dir.path.replace(/\/$/,'')+'/'+fn);}
  if(a.logfile)db.osFiles[a.logfile.toLowerCase()]={text:'Export job log for '+job};
  out.ok('Job '+job+' successfully completed at '+fmtDate(sysdate(cx),'Dy Mon DD HH24:MI:SS YYYY'));
}
function impdp(a,cx,out){const db=cx.db;
  const user=dpUser(a,cx);const dir=dpDir(a,user,cx);
  const pat=(a.dumpfile||'expdat.dmp').toLowerCase();const re=new RegExp('^'+pat.replace(/[.]/g,'\\.').replace(/%u/i,'\\d{2}')+'$');
  const files=Object.keys(db.osFiles).filter(f=>re.test(f)&&db.osFiles[f].dump);
  if(!files.length)throw E('ORA-39001','invalid argument value',['ORA-39000: bad dump file specification','ORA-31640: unable to open dump file "'+dir.path+'/'+(a.dumpfile||'')+'" for read']);
  const job='"'+user+'"."SYS_IMPORT_FULL_01"';
  out.say('Import: Release 23.0.0.0.0 - Production');out.say('Master table '+job+' successfully loaded/unloaded');out.say('Starting '+job+':  '+(a.userid||'').split('/')[0]+'/********');
  const remaps={};(a.remap_table||'').split(',').filter(Boolean).forEach(x=>{const[f,t]=x.split(':');const[o,n]=f.toUpperCase().includes('.')?f.toUpperCase().split('.'):[user,f.toUpperCase()];remaps[o+'.'+n]=t.toUpperCase();});
  const rs=a.remap_schema?a.remap_schema.toUpperCase().split(':'):null;const tea=(a.table_exists_action||'SKIP').toUpperCase();
  out.say('Processing object type TABLE_EXPORT/TABLE/TABLE');const seen=new Set();let errs=0;
  db.osFiles[files[0]].tables.forEach(({key,copy})=>{if(seen.has(key))return;seen.add(key);
    let owner=copy.owner,name=copy.name;if(remaps[key])name=remaps[key];if(rs&&rs[0]===owner)owner=rs[1];
    if(!db.users[owner]){out.err('ORA-39083: Object type TABLE:"'+owner+'"."'+name+'" failed to create with error:');out.err('ORA-01918: user \''+owner+'\' does not exist');errs++;return;}
    const nk=owner+'.'+name;const ex=db.objs[nk];
    if(ex&&tea==='SKIP'){out.err('ORA-39151: Table "'+owner+'"."'+name+'" exists. All dependent metadata and data will be skipped due to table_exists_action of skip');errs++;return;}
    const t=cloneTable(copy);t.owner=owner;t.name=name;t.key=nk;
    if(ex&&tea==='APPEND'){t.rows.forEach(r=>ex.rows.push({rid:newRid(ex),v:r.v}));}else if(ex&&tea==='TRUNCATE'){ex.rows=t.rows;}else{if(ex)delete db.objs[nk];t.cons=t.cons.filter(c=>c.k!=='R');t.cons.forEach(c=>{if(c.gen||db.objs[nk])c.name=sysName(cx);});newObj(cx,t);}
    const n=t.rows.length+(t.virtual||0);out.say('. . imported "'+owner+'"."'+name+'"'.padEnd(40)+(Math.max(5.5,n*0.09)).toFixed(1).padStart(8)+' KB'+String(n).padStart(8)+' rows');});
  out.ok('Job '+job+(errs?' completed with '+errs+' error(s)':' successfully completed')+' at '+fmtDate(sysdate(cx),'Dy Mon DD HH24:MI:SS YYYY'));
}
function sqlldr(a,cx,out){const db=cx.db;
  const user=dpUser(a,cx);const ctl=VFILES[(a.control||'').toLowerCase()];const dat=VFILES[(a.data||'').toLowerCase()];
  if(ctl==null)throw E('SQL*Loader-500','Unable to open file ('+(a.control||'')+')');if(dat==null)throw E('SQL*Loader-500','Unable to open file ('+(a.data||'')+')');
  const tm=ctl.match(/into\s+table\s+(\w+)/i);const tname=tm[1].toUpperCase();const t=db.objs[user+'.'+tname];
  out.say('SQL*Loader: Release 23.0.0.0.0 - Production');out.say('');
  if(!t||t.type!=='TABLE')throw E('SQL*Loader-941','Error during describe of table '+tname,['ORA-04043: Object '+tname+' does not exist.']);
  const lines=dat.split('\n').filter(Boolean);let okN=0,bad=0;const lcx=sub(cx,{sess:Object.assign({},cx.sess,{user,schema:user})});
  for(const ln of lines){const p=ln.split(',');try{insertRows(t,t.cols.map((c,i)=>i).filter(i=>!t.cols[i].virt),[p.map(x=>x.trim())],lcx,{});okN++;}catch(e){bad++;}}
  commitTx(cx);
  out.say('Path used:      '+(String(a.direct).toLowerCase()==='true'?'Direct':'Conventional'));out.say('');
  out.say('Load completed - logical record count '+lines.length+'.');out.say('');out.say('Table '+tname+':');
  out.ok('  '+okN+' Rows successfully loaded.');if(bad)out.err('  '+bad+' Rows not loaded due to data errors. (bad file: '+(a.bad||'')+')');
  out.say('');out.say('Check the log file:');out.say('  '+(a.log||'sqlldr.log'));out.say('for more information about the load.');
}

/* ===== SQL*Plus front end ===== */
const SHELL_RE=/^\s*(?:!|HOST\s+)?(lsnrctl|expdp|impdp|sqlldr|cat|ls|mkdir|clear|cls)\b/i;
const PLUS_RE=/^\s*(CONN(?:ECT)?|DISC(?:ONNECT)?|EXIT|QUIT|SHO(?:W)?|DESC(?:RIBE)?|STARTUP|SHUTDOWN|HELP|PROMPT|REM(?:ARK)?|SPOOL|COL(?:UMN)?|CLEAR|VAR(?:IABLE)?|PRINT|EXEC(?:UTE)?|DEFINE|UNDEFINE|TTITLE|BTITLE|BREAK|COMPUTE|PAUSE|WHENEVER|SET\s+(?!ROLE\b|TRANSACTION\b)\w+|@)(\s|;|$)/i;
const PLSQL_START=/^\s*(DECLARE|BEGIN|<<\w+>>|CREATE\s+(OR\s+REPLACE\s+)?((NON)?EDITIONABLE\s+)?(PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE)\b)/i;
function stripStrings(s){return s.replace(/'(?:[^']|'')*'/g,"''").replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');}
function splitStatements(text){
  const res=[];let cur='';let q=false,blk=false,inCmt=false;const lines=text.replace(/\r/g,'').split('\n');
  for(let li=0;li<lines.length;li++){const line=lines[li];
    if(!blk&&!cur.trim()){
      if(/^\s*\/\s*$/.test(line)){res.push({rerun:true});continue;}
      if(SHELL_RE.test(line)||PLUS_RE.test(line)){res.push({text:line.replace(/;\s*$/,''),plus:true,line:li+1});continue;}
      if(!line.trim()||/^\s*--/.test(line))continue;
      if(PLSQL_START.test(line)||PLSQL_START.test(line+' '+(lines[li+1]||'')))blk=true;}
    if(blk){if(/^\s*\/\s*$/.test(line)){res.push({text:cur,plsql:true});cur='';blk=false;continue;}if(/^\s*\.\s*$/.test(line)){res.push({text:cur,plsql:true,noRun:true});cur='';blk=false;continue;}cur+=line+'\n';continue;}
    let piece='';
    for(let i=0;i<line.length;i++){const c=line[i];
      if(inCmt){if(c==='*'&&line[i+1]==='/'){inCmt=false;piece+='*/';i++;continue;}piece+=c;continue;}
      if(!q&&c==='/'&&line[i+1]==='*'){inCmt=true;piece+='/*';i++;continue;}
      if(!q&&c==='-'&&line[i+1]==='-'){piece+=line.slice(i);break;}
      if(c==="'")q=!q;
      if(c===';'&&!q){cur+=piece;res.push({text:cur});cur='';piece='';const rest=line.slice(i+1);if(rest.trim()&&!/^\s*--/.test(rest)){lines.splice(li+1,0,rest);}break;}
      piece+=c;}
    if(piece!==''||!cur)cur+=piece+'\n';else cur+=piece+'\n';
  }
  if(cur.trim())res.push({text:cur,plsql:blk,unterminated:true});
  return res.filter(s=>s.rerun||(s.text&&s.text.trim()));
}
function isCompleteInput(text){
  const s=text.replace(/\s+$/,'');if(!s.trim())return false;
  const first=s.split('\n').find(l=>l.trim())||'';
  if((SHELL_RE.test(first)||PLUS_RE.test(first))&&s.split('\n').filter(l=>l.trim()).length===1)return true;
  if(PLSQL_START.test(first)||PLSQL_START.test(s))return/\n\s*\/\s*$/.test(s)||/^\s*\/\s*$/.test(s);
  if(/^\s*\/\s*$/.test(s))return true;
  return/;\s*$/.test(stripStrings(s));
}
/* ---------- result formatting ---------- */
function cellStr(v,t,cx){if(v==null)return'';if(typeof v==='number'){if(t&&(t.base==='BINARY_FLOAT'||t.base==='BINARY_DOUBLE')){const s=v.toExponential(t.base==='BINARY_FLOAT'?6:14).toUpperCase().replace(/E([+-])(\d+)$/,(m,s2,d)=>'E'+s2+d.padStart(3,'0'));return s;}return numToStr(v);}
  if(typeof v==='boolean')return v?'TRUE':'FALSE';if(v&&v.coll)return collStr(v,cx);if(v&&v.rec)return'(record)';if(v&&v.cursor)return'CURSOR STATEMENT : '+(v.n||1);return valToStr(v,cx);}
function collStr(v,cx){const items=collVals(v);return(v.tname||'COLLECTION')+'('+items.map(x=>x==null?'NULL':typeof x==='string'?"'"+x+"'":cellStr(x,null,cx)).join(', ')+')';}
function formatTable(r,cx,out,maxRows){
  maxRows=maxRows||500;
  if(!r.rows.length){out.push({k:'out',t:''});out.push({k:'dim',t:'no rows selected'});return;}
  const n=r.cols.length;const rows=r.rows.slice(0,maxRows);
  const isNum=r.cols.map((c,i)=>{const t=r.types&&r.types[i];if(t&&isNumT(t))return true;return rows.every(x=>x[i]==null||typeof x[i]==='number');});
  const strs=rows.map(x=>x.map((v,i)=>cellStr(v,r.types&&r.types[i],cx)));
  const CAP=60;const w=r.cols.map((c,i)=>Math.min(CAP,Math.max(Math.min(c.length,CAP),...strs.map(x=>x[i].length))));
  const head=r.cols.map((c,i)=>{const h=c.length>w[i]?c.slice(0,w[i]):c;return isNum[i]?h.padStart(w[i]):h.padEnd(w[i]);}).join(' ');
  out.push({k:'out',t:''});out.push({k:'head',t:head.replace(/\s+$/,'')});out.push({k:'head',t:w.map(x=>'-'.repeat(x)).join(' ')});
  for(const x of strs){const chunks=x.map((s,i)=>{if(s.length<=w[i])return[s];const parts=[];for(let k=0;k<s.length;k+=w[i])parts.push(s.slice(k,k+w[i]));return parts;});
    const h=Math.max(...chunks.map(c=>c.length));
    for(let k=0;k<h;k++)out.push({k:'out',t:chunks.map((c,i)=>{const s=c[k]||'';return isNum[i]?s.padStart(w[i]):s.padEnd(w[i]);}).join(' ').replace(/\s+$/,'')});}
  out.push({k:'out',t:''});
  if(r.rows.length>maxRows)out.push({k:'dim',t:'('+(r.rows.length-maxRows)+' aur rows hain; pehli '+maxRows+' dikhayi. FETCH FIRST n ROWS ONLY se kam karo.)'});
  out.push({k:'dim',t:r.rows.length===1?'1 row selected.':r.rows.length+' rows selected.'});
}
/* ---------- deep clone (for practice checking) ---------- */
function cloneDeep(x,seen){
  if(x===null||typeof x!=='object')return x;seen=seen||new Map();if(seen.has(x))return seen.get(x);
  if(x instanceof DT){const d=new DT(x.kind,x.s,x.ns,x.tz?Object.assign({},x.tz):null);d.fp=x.fp;seen.set(x,d);return d;}
  if(x instanceof IV){const v=x.kind==='YM'?new IV('YM',x.m):new IV('DS',x.s,x.ns);v.fp=x.fp;seen.set(x,v);return v;}
  if(x instanceof Set){const s=new Set();seen.set(x,s);x.forEach(v=>s.add(cloneDeep(v,seen)));return s;}
  if(x instanceof Map){const m=new Map();seen.set(x,m);x.forEach((v,k)=>m.set(k,cloneDeep(v,seen)));return m;}
  if(x instanceof RegExp)return x;
  if(Array.isArray(x)){const a=[];seen.set(x,a);for(const v of x)a.push(cloneDeep(v,seen));return a;}
  if(x.__ast)return x;
  const o=Object.create(Object.getPrototypeOf(x));seen.set(x,o);for(const k of Object.keys(x))o[k]=cloneDeep(x[k],seen);return o;
}
function localOffset(){const m=-new Date().getTimezoneOffset();return offStr(m);}
function newSession(db,user,opts){return{user,schema:user,sysdba:!!(opts&&opts.sysdba),roles:new Set(user&&db.users[user]?Object.keys(db.users[user].roles).filter(r=>isDefaultRole(db.users[user],r)):[]),
  nls:Object.assign({},DEFAULT_NLS,{tz:db.osTZ}),tx:{undo:[],sp:{}},gtt:{},seqCur:{},serverout:false,outBuf:[],binds:{},pkg:{},plan:null};}
function create(opts){
  opts=opts||{};const osTZ=opts.tz||localOffset();
  let db=opts.noSeed?null:newDb(osTZ);let sess=db?newSession(db,'OT'):null;let lastStmt=null;let pending=null;
  const api={};
  function mkCx(){return{db,sess,f:null,runTrigger:typeof plRunTrigger==='function'?plRunTrigger:null,callFn:typeof plCallFn==='function'?plCallFn:null,binds:sess.binds,castColl:typeof plCastColl==='function'?plCastColl:null,castMultiset:typeof plCastMultiset==='function'?plCastMultiset:null,fnType:typeof plFnType==='function'?plFnType:null};}
  function outApi(lines){return{ok:t=>lines.push({k:'ok',t}),say:t=>lines.push({k:'out',t}),dim:t=>lines.push({k:'dim',t}),err:t=>lines.push({k:'err',t}),push:x=>lines.push(x),lines,grids:[]};}
  function errLines(e,lines,isPl){
    if(e instanceof OraErr){if(!isPl&&!/^SP2-|^TNS-|^LRM-|^SQL\*Loader|^KUP-/.test(e.code))lines.push({k:'err',t:'ERROR at line '+(e.line||1)+':'});
      lines.push({k:'err',t:e.message});const ex=e.extra||[];ex.forEach(x=>{if(!/^\(/.test(x))lines.push({k:'err',t:x});});ex.forEach(x=>{if(/^\(/.test(x))lines.push({k:'hint',t:x.slice(1,-1)});});}
    else{lines.push({k:'err',t:'ORA-00600: internal error code, arguments: ['+(e&&e.message||e)+']'});if(typeof console!=='undefined'&&opts.debug)console.error(e);}
  }
  function connect(rest,out){
    rest=String(rest||'').replace(/;\s*$/,'').trim();
    const asSysdba=/\s+AS\s+SYS(DBA|OPER)\s*$/i.test(rest)||/^\/\s*AS\s+SYSDBA$/i.test(rest);rest=rest.replace(/\s*AS\s+SYS(DBA|OPER)\s*$/i,'').trim();
    let svc=null,m;if((m=rest.match(/@([\w.\/:]+)\s*$/))){svc=m[1];rest=rest.replace(/@[\w.\/:]+\s*$/,'');}
    let user=rest,pw=null;if(rest.includes('/')){[user,pw]=rest.split('/');}
    user=(user||'').trim().replace(/^"|"$/g,'');
    const finish=(s)=>{if(hasPending({db,sess}))commitTx({db,sess});const keepOut=sess.serverout;sess=s;sess.serverout=keepOut;};
    if(svc&&!db.listener)throw E('ORA-12541','Cannot connect. No listener at host localhost port 1521.',[hint('Listener band hai. "lsnrctl start" chalao, ya @service hata ke local connect karo.')]);
    if(asSysdba&&(user===''||user==='/')){finish(newSession(db,'SYS',{sysdba:true}));out.ok(db.inst==='SHUTDOWN'?'Connected to an idle instance.':'Connected.');return;}
    if(!user){pending={prompt:'Enter user-name: ',fn:(u)=>connect(u+(asSysdba?' as sysdba':''),out)};return;}
    if(pw==null){pending={prompt:'Enter password: ',secret:true,fn:(x)=>connect(user+'/'+x+(svc?'@'+svc:'')+(asSysdba?' as sysdba':''),out)};return;}
    const U=user.toUpperCase();const u=db.users[U];
    if(asSysdba){if(!u||u.pw!==pw||!(U==='SYS'||userHas(db,U,'SYSDBA')||u.all))throw E('ORA-01017','invalid username/password; logon denied');finish(newSession(db,'SYS',{sysdba:true}));out.ok(db.inst==='SHUTDOWN'?'Connected to an idle instance.':'Connected.');return;}
    if(db.inst==='SHUTDOWN')throw E('ORA-01034','ORACLE not available',['ORA-27101: shared memory realm does not exist']);
    if(db.inst!=='OPEN')throw E('ORA-01033','ORACLE initialization or shutdown in progress');
    if(!u||u.pw!==pw){if(u&&!u.status.includes('LOCKED')){u.failed++;const lim=profileLimit(db,u,'FAILED_LOGIN_ATTEMPTS');if(lim!=='UNLIMITED'&&u.failed>=Number(lim)){u.status=u.status.includes('EXPIRED')?'EXPIRED & LOCKED(TIMED)':'LOCKED(TIMED)';u.lockDate=today({db,sess});}}
      throw E('ORA-01017','invalid username/password; logon denied');}
    if(u.status.includes('LOCKED'))throw E('ORA-28000','The account is locked.',[hint('DBA account kholega: ALTER USER '+U.toLowerCase()+' ACCOUNT UNLOCK;')]);
    if(!userHas(db,U,'CREATE SESSION'))throw E('ORA-01045','Login denied. User '+U+' does not have CREATE SESSION privilege.',[hint('DBA se kaho: GRANT CREATE SESSION TO '+U.toLowerCase()+';')]);
    if(u.status.includes('EXPIRED')){out.err('ERROR:');out.err('ORA-28001: The password has expired.');out.say('');out.say('Changing password for '+user.toLowerCase());
      pending={prompt:'New password: ',secret:true,fn:(np)=>{if(!np){out.err('ORA-28003: password verification for the specified password failed');return;}u.pw=np;u.status='OPEN';u.failed=0;out.say('Password changed');u.failed=0;finish(newSession(db,U));out.ok('Connected.');}};return;}
    u.failed=0;finish(newSession(db,U));out.ok('Connected.');
  }
  function describe(name,out){
    const cx=mkCx();const p=new P(lex(name.replace(/;\s*$/,'')));const q=p.qname();
    if(q.link){const r=remoteRel(q,q.name,cx);out.say(' Name'.padEnd(33)+' Null?    Type');out.say(' '+'-'.repeat(31)+' -------- '+'-'.repeat(28));r.descs[0].cols.forEach((c,i)=>out.say(' '+c.padEnd(32)+'          '+typeStr(r.descs[0].types[i])));return;}
    const o=resolveObj(q,cx,true);
    if(o&&(o.type==='PROCEDURE'||o.type==='FUNCTION'||o.type==='PACKAGE')&&typeof plDescribe==='function'){plDescribe(o,out);return;}
    let cols;
    if(o&&o.type==='TABLE'){if(!canSeeObj(o,cx))throw E('ORA-04043','object '+q.name.toLowerCase()+' does not exist');cols=o.cols.filter(c=>!c.unused&&!c.invisible).map(c=>({name:c.name,type:typeStr(c.type),nn:o.cons.some(k=>(k.k==='N'||k.k==='P')&&!k.disabled&&k.cols.includes(c.name))}));}
    else if(o&&o.type==='VIEW'){const r=runQuery(o.query,sub(cx,{schema:o.owner,stmtCache:new Map()}),{limit:0});cols=(o.cols||r.cols).map((c,i)=>({name:c,type:r.types[i]?typeStr(r.types[i].lit?{base:'CHAR',len:r.types[i].len}:r.types[i]):'VARCHAR2(4000)'}));}
    else if(!o&&(!q.owner||q.owner==='SYS')){const dv=dictView(q.name,cx);if(!dv)throw E('ORA-04043','object '+q.name.toLowerCase()+' does not exist');cols=dv.cols.map((c,i)=>{const v=dv.rows.map(r=>r[i]).find(x=>x!=null);return{name:c,type:typeof v==='number'?'NUMBER':v instanceof DT?'DATE':'VARCHAR2(128)'};});}
    else throw E('ORA-04043','object '+(q.owner?q.owner.toLowerCase()+'.':'')+q.name.toLowerCase()+' does not exist');
    out.say(' Name'.padEnd(33)+' Null?    Type');out.say(' '+'-'.repeat(31)+' -------- '+'-'.repeat(28));
    cols.forEach(c=>out.say(' '+c.name.padEnd(32)+' '+(c.nn?'NOT NULL ':'         ')+c.type));
  }
  function help(out){
    out.say('Playground (simulator) mein ye sab chalta hai:');
    ['SQL: SELECT (joins, GROUP BY, ROLLUP/CUBE, subqueries, UNION, PIVOT, FETCH, analytic OVER), INSERT/UPDATE/DELETE/MERGE, COMMIT/ROLLBACK/SAVEPOINT',
     'DDL: CREATE/ALTER/DROP TABLE (constraints, identity, virtual), VIEW, INDEX, SEQUENCE, SYNONYM, TRUNCATE, RENAME, FLASHBACK TABLE',
     'Functions: string, number, date/time zone, conversion (TO_CHAR/TO_DATE), NVL/DECODE/COALESCE, regex, aggregates, LISTAGG',
     'PL/SQL: DECLARE/BEGIN blocks, IF/CASE/LOOP, cursors, exceptions, records, collections, procedures, functions, packages, triggers',
     'SQL*Plus: SET SERVEROUTPUT ON, DESC table, SHOW USER, SHOW ERRORS, VARIABLE / PRINT, EXEC proc, CONNECT user/pass, CLEAR SCREEN',
     'DBA: STARTUP/SHUTDOWN, tablespaces, users/roles/profiles, GRANT/REVOKE, database links (@sales), directories, lsnrctl, expdp/impdp, sqlldr',
     'Sample data: OT schema ki tables (customers, orders, order_items, products, employees, ...). Dekho: SELECT table_name FROM user_tables;'].forEach(x=>out.dim('  '+x));
  }
  function show(st,out){
    const w=st.trim().split(/\s+/);const W=(w[1]||'').toUpperCase().replace(/;$/,'');
    if(W==='USER'){out.say('USER is "'+sess.user+'"');return;}
    if(W==='SGA'){if(!isSysdba({db,sess}))throw E('ORA-01031','insufficient privileges');['Total System Global Area 2550136832 bytes','Fixed Size                  3835304 bytes','Variable Size             738200152 bytes','Database Buffers         1795162112 bytes','Redo Buffers               12939264 bytes'].forEach(x=>out.say(x));return;}
    if(W==='CON_NAME'){out.say('CON_NAME');out.say('------------------------------');out.say('FREEPDB1');return;}
    if(W==='SERVEROUTPUT'||W==='SERVEROUT'){out.say('serveroutput '+(sess.serverout?'ON SIZE UNLIMITED FORMAT WORD_WRAPPED':'OFF'));return;}
    if(W==='ERRORS'||W==='ERR'||W==='ERROR'){if(typeof plShowErrors==='function')return plShowErrors(w.slice(2).join(' '),mkCx(),out);out.say('No errors.');return;}
    if(W==='PARAMETER'||W==='PARAMETERS'){const nm=(w[2]||'').toLowerCase();const ps=[['db_name','string','FREE'],['sga_target','big integer','2432M'],['pga_aggregate_target','big integer','800M'],['processes','integer','320'],['undo_tablespace','string','UNDOTBS1'],['compatible','string','23.0.0'],['max_string_size','string','STANDARD'],['nls_date_format','string',sess.nls.dateFmt]].filter(p=>p[0].includes(nm));
      out.say('');out.say('NAME                                 TYPE        VALUE');out.say('------------------------------------ ----------- ------------------------------');ps.forEach(p=>out.say(p[0].padEnd(36)+' '+p[1].padEnd(11)+' '+p[2]));return;}
    if(W==='RECYCLEBIN'){const r=dictView('RECYCLEBIN',mkCx());formatTable({cols:['ORIGINAL NAME','RECYCLEBIN NAME','OBJECT TYPE','DROP TIME'],rows:r.rows.map(x=>[x[1],x[0],x[3],x[4]]),types:[]},mkCx(),out.lines);return;}
    if(W==='TABLES')throw E('SP2-0158','unknown SHOW option "'+w[1].replace(/;$/,'')+'"',[hint('Oracle mein SHOW TABLES nahi hota. Apni tables dekhne ke liye: SELECT table_name FROM user_tables;')]);
    out.dim('(SHOW '+W+' simulator mein nahi hai. SHOW USER, SHOW ERRORS ya SHOW SERVEROUTPUT try karo.)');
  }
  function setCmd(st,out){const m=st.trim().split(/\s+/);const k=(m[1]||'').toUpperCase();const v=(m[2]||'').toUpperCase();
    if(k==='SERVEROUTPUT'||k==='SERVEROUT'){sess.serverout=v==='ON';return;}
    if(k==='TIMING'){sess.timing=v==='ON';return;}
    if(['LINESIZE','LINES','PAGESIZE','PAGES','FEEDBACK','FEED','HEADING','HEAD','ECHO','VERIFY','VER','TERMOUT','LONG','NUMWIDTH','COLSEP','TRIMSPOOL','TRIMOUT','AUTOCOMMIT','AUTOTRACE','DEFINE','SQLPROMPT','WRAP','TAB','NULL','SQLBLANKLINES','UNDERLINE','NEWPAGE','ARRAYSIZE','COLINVISIBLE'].includes(k)){if(k==='AUTOCOMMIT')sess.autocommit=v==='ON'||v==='IMM'||v==='IMMEDIATE';return;}
    out.dim('(SET '+k+' simulator mein ignore hota hai.)');}
  function variable(st,out){const m=/^\s*VAR(?:IABLE)?\s+(\w+)\s+(.+?)\s*;?\s*$/i.exec(st);if(!m){const names=Object.keys(sess.binds);names.forEach(n=>out.say('variable   '+n.toLowerCase()+'\ndatatype   '+sess.binds[n].type));return;}
    const name=m[1].toUpperCase();const t=parseType(new P(lex(m[2])));sess.binds[name]={hostVar:true,v:null,type:typeStr(t),t};}
  function print(st,out){const m=/^\s*PRINT\s*(\w+)?/i.exec(st);const names=m[1]?[m[1].toUpperCase()]:Object.keys(sess.binds);
    for(const n of names){const b=sess.binds[n];if(!b){out.err('SP2-0552: Bind variable "'+n+'" not declared.');continue;}
      if(b.v&&b.v.cursor&&typeof plPrintCursor==='function'){plPrintCursor(b.v,mkCx(),out);continue;}
      formatTable({cols:[n],rows:[[b.v]],types:[b.t]},mkCx(),out.lines);const L=out.lines;if(L.length&&L[L.length-1].k==='dim'&&/^1 row selected\.$/.test(L[L.length-1].t))L.pop();/* PRINT of a scalar bind shows no row count */}}
  function dispatchSql(stmt,text,cx,out){
    const p=new P(lex(text),text);
    let s=null;
    try{s=parseSqlStatement(p);}catch(e){if(!(e instanceof OraErr))throw e;throw e;}
    if(s){
      if(!p.eof()){const x=p.peek();throw p.errAt('ORA-00933','SQL command not properly ended');}
      return execSql(s,cx,out,text);}
    p.i=0;
    if(dbaStatement(p,cx,out)){if(!p.eof())throw p.errAt('ORA-00933','SQL command not properly ended');commitTx(cx);return;}
    p.i=0;const x=p.peek();
    if(x&&x.k==='id'&&['CREATE','ALTER','DROP'].includes(x.v)&&typeof plDdl==='function'){if(plDdl(p,text,cx,out))return;}
    if(!x)return;
    if(x.k==='id'&&x.v==='CREATE')throw E('ORA-00901','invalid CREATE command');
    if(x.k==='id'&&x.v==='ALTER')throw E('ORA-00940','invalid ALTER command');
    if(x.k==='id'&&x.v==='DROP')throw E('ORA-00950','invalid DROP option');
    if(x.k==='id'&&(x.v==='SELEC'||x.v==='SLECT'||x.v==='SELCT'))throw E('SP2-0734','unknown command beginning "'+text.trim().slice(0,10)+'..." - rest of line ignored.',[hint('Spelling: SELECT')]);
    if(x.k==='id'&&['DECLARE','BEGIN'].includes(x.v)&&typeof plRunBlock==='function')return plRunBlock(text,cx,out);
    throw E('SP2-0734','unknown command beginning "'+text.trim().split(/\s+/).slice(0,2).join(' ').slice(0,12)+'..." - rest of line ignored.');
  }
  function execSql(s,cx,out,text){
    const t=s.t;const ddl=['createTable','alterTable','dropTable','truncate','rename','createView','dropView','createIndex','dropIndex','alterIndex','createSeq','alterSeq','dropSeq','createSyn','dropSyn','flashback','purge','comment'];
    if(t==='query'){if(!cx.sess||cx.db.inst==='SHUTDOWN')needOpen(cx);}
    else if(t!=='alterSession'&&t!=='commit'&&t!=='rollback'&&t!=='savepoint')needOpen(cx);
    if(ddl.includes(t))commitTx(cx);
    switch(t){
      case'query':{const r=runQuery(s,sub(cx,{stmtCache:new Map()}));if(s.forUpdate)cx.sess.locked=true;const g0=out.lines.length;formatTable(r,cx,out.lines);if(r.rows.length&&out.grids){const r5=r.rows.slice(0,500),qi=out.grids.length;out.grids.push({cols:r.cols,total:r.rows.length,isNum:r.cols.map((c,i)=>{const tp=r.types&&r.types[i];if(tp&&isNumT(tp))return true;return r5.every(x=>x[i]==null||typeof x[i]==='number');}),cells:r5.map(x=>x.map((v,i)=>v==null?null:cellStr(v,r.types&&r.types[i],cx)))});for(let li=g0;li<out.lines.length;li++)out.lines[li].qi=qi;}api.lastResult=r;return;}
      case'insert':{const r=execInsert(s,cx);out.ok(r.msg);return autoc(cx);}
      case'insertMulti':{const r=execInsertMulti(s,cx);out.ok(r.msg);return autoc(cx);}
      case'update':{const r=execUpdate(s,cx);out.ok(r.msg);return autoc(cx);}
      case'delete':{const r=execDelete(s,cx);out.ok(r.msg);return autoc(cx);}
      case'merge':{const r=execMerge(s,cx);out.ok(r.msg);return autoc(cx);}
      case'commit':commitTx(cx);out.ok('Commit complete.');return;
      case'rollback':{const tx2=tx(cx);if(s.to){if(!(s.to in tx2.sp))throw E('ORA-01086','savepoint \''+s.to+'\' never established in this session or is invalid');rollbackTo(cx,tx2.sp[s.to]);out.ok('Rollback complete.');return;}rollbackTo(cx,0);tx2.sp={};
        for(const k in cx.db.objs){const o=cx.db.objs[k];if(o.temp&&o.temp.kind==='GTT'&&o.temp.onCommit==='DELETE'&&cx.sess.gtt[k])cx.sess.gtt[k].length=0;}out.ok('Rollback complete.');return;}
      case'savepoint':tx(cx).sp[s.name]=tx(cx).undo.length;out.ok('Savepoint created.');return;
      case'createTable':{const r=execCreateTable(s,cx);(r.warn?out.err:out.ok)(r.msg);return;}
      case'alterTable':out.ok(execAlterTable(s,cx).msg);return;
      case'dropTable':out.ok(execDropTable(s,cx).msg);return;
      case'truncate':out.ok(execTruncate(s,cx).msg);return;
      case'rename':out.ok(execRename(s,cx).msg);return;
      case'flashback':out.ok(execFlashback(s,cx).msg);return;
      case'purge':{if(s.all){cx.db.bin=(cx.db.bin||[]).filter(b=>b.owner!==curSchema(cx));out.ok('Recyclebin purged.');}else{const i=(cx.db.bin||[]).findIndex(b=>b.orig===s.q.name&&b.owner===curSchema(cx));if(i<0)throw E('ORA-38307','object not in RECYCLE BIN');cx.db.bin.splice(i,1);out.ok('Table purged.');}return;}
      case'createView':{const r=execCreateView(s,cx);if(r.warn)out.err(r.msg);else out.ok(r.msg);return;}
      case'dropView':out.ok(execDropView(s,cx).msg);return;
      case'createIndex':out.ok(execCreateIndex(s,cx).msg);return;
      case'dropIndex':out.ok(execDropIndex(s,cx).msg);return;
      case'alterIndex':{const key=(s.q.owner||curSchema(cx))+'.'+s.q.name;const ix=cx.db.idx[key];if(!ix)throw E('ORA-01418','specified index does not exist');if(s.rename){delete cx.db.idx[key];ix.name=s.rename;ix.key=ix.owner+'.'+s.rename;cx.db.idx[ix.key]=ix;}out.ok('Index altered.');return;}
      case'createSeq':out.ok(execCreateSeq(s,cx).msg);return;
      case'alterSeq':out.ok(execAlterSeq(s,cx).msg);return;
      case'dropSeq':out.ok(execDropSeq(s,cx).msg);return;
      case'createSyn':out.ok(execCreateSyn(s,cx).msg);return;
      case'dropSyn':out.ok(execDropSyn(s,cx).msg);return;
      case'comment':{const o=resolveObj(s.kind==='COLUMN'?{owner:s.q.owner?null:null,name:s.q.owner||s.q.name}:s.q,cx,true);if(o){if(s.kind==='COLUMN'){const c=o.cols&&o.cols.find(x=>x.name===s.q.name);if(c)c.comment=s.txt;}else o.comment=s.txt;}out.ok('Comment created.');return;}
      case'alterSession':out.ok(execAlterSession(s,cx).msg);return;
      case'explain':out.ok(explainPlan(s,cx).msg);return;
      case'lock':out.ok('Table(s) Locked.');return;
      case'noopMsg':out.ok(s.msg);return;
    }
    throw E('ORA-00900','invalid SQL statement');
  }
  function autoc(cx){if(cx.sess.autocommit){commitTx(cx);}}
  function runOne(st,out){
    const cx=mkCx();
    if(st.rerun){if(!lastStmt){out.err('SP2-0103: Nothing in SQL buffer to run.');return;}st=lastStmt;}
    const text=st.text;
    if(st.plus){
      const t=text.trim();const W=t.split(/\s+/)[0].toUpperCase();
      if(SHELL_RE.test(t)){shellCmd(t.replace(/^\s*(!|HOST\s+)/i,''),cx,out);return;}
      if(/^CONN/.test(W))return connect(t.replace(/^\S+\s*/,''),out);
      if(/^DISC/.test(W)){if(hasPending(cx))commitTx(cx);sess=newSession(db,null);sess.user=null;out.say('Disconnected from Oracle Database 23ai Free (simulator).');return;}
      if(W==='EXIT'||W==='QUIT'){if(hasPending(cx))commitTx(cx);out.say('Disconnected from Oracle Database 23ai Free (simulator).');out.dim('(Playground mein naya session: CONNECT ot/oracle)');sess=newSession(db,null);sess.user=null;return;}
      if(W==='HELP')return help(out);
      if(/^SHO/.test(W))return show(t,out);
      if(/^DESC/.test(W)){if(!sess.user)throw E('SP2-0640','Not connected');return describe(t.replace(/^\S+\s*/,''),out);}
      if(W==='STARTUP')return startupCmd(t,cx,out);
      if(W==='SHUTDOWN'){shutdownCmd(t,cx,out);return;}
      if(W==='PROMPT'){out.say(t.replace(/^PROMPT\s*/i,''));return;}
      if(W==='SET')return setCmd(t,out);
      if(/^VAR/.test(W))return variable(t,out);
      if(W==='PRINT')return print(t,out);
      if(W==='CLEAR'){if(/SCR/i.test(t))out.clear=true;return;}
      if(/^EXEC/.test(W)){if(!sess.user)throw E('SP2-0640','Not connected');const body=t.replace(/^\S+\s*/,'').replace(/;\s*$/,'');if(typeof plRunBlock!=='function')throw NOT_SUP('EXEC');return plRunBlock('BEGIN '+body+'; END;',cx,out,{exec:true});}
      if(W==='@'||W.startsWith('@')){out.err('SP2-0310: unable to open file "'+t.slice(1)+'"');out.dim('(Script files simulator mein nahi chalte; SQL seedha yahan paste karo.)');return;}
      return;}
    /* SQL*Plus keeps a PL/SQL unit without a closing "/" in the buffer and runs nothing */
    if(st.plsql&&st.unterminated){lastStmt={text:st.text,plsql:true};out.push({k:'hint',t:'Block abhi buffer mein hai. Chalane ke liye aakhri line par sirf / likho.'});return;}
    if(!sess.user){throw E('SP2-0640','Not connected',[hint('Pehle CONNECT karo, jaise: CONNECT ot/oracle')]);}
    lastStmt=st;
    const mark=tx(cx).undo.length;
    try{
      if(st.plsql&&typeof plExecUnit==='function'){if(st.noRun)return;plExecUnit(text,cx,out);if(sess.autocommit)commitTx(cx);return;}
      dispatchSql(st,text,cx,out);
    }catch(e){if(e instanceof OraErr||e instanceof Error){rollbackTo(cx,mark);}throw e;}
  }
  api.run=function(text){
    const lines=[];const out=outApi(lines);
    if(pending){const pd=pending;pending=null;try{pd.fn(String(text).trim());}catch(e){errLines(e,lines);}return result(lines,out);}
    let stmts;try{stmts=splitStatements(String(text));}catch(e){errLines(e,lines);return result(lines,out);}
    for(const st of stmts){
      const t0=Date.now();
      try{runOne(st,out);}catch(e){errLines(e,lines,false);}
      if(sess.serverout&&sess.outBuf.length){lines.push({k:'out',t:''});sess.outBuf.forEach(l=>lines.push({k:'out',t:l}));sess.outBuf=[];}
      else if(sess.outBuf.length){if(!sess.warnedOut){lines.push({k:'hint',t:'DBMS_OUTPUT ka output chhupa hai. Dekhne ke liye pehle chalao: SET SERVEROUTPUT ON'});sess.warnedOut=true;}sess.outBuf=[];}
      if(sess.timing)lines.push({k:'dim',t:'Elapsed: 00:00:00.'+String(Math.min(99,Date.now()-t0)).padStart(2,'0')});
      if(pending)break;
    }
    return result(lines,out);
  };
  function result(lines,out){const r={lines,grids:out.grids||[],prompt:pending?pending.prompt:null,secret:!!(pending&&pending.secret),clear:!!out.clear,state:api.state()};return r;}
  api.isComplete=isCompleteInput;
  api.reset=function(){db=newDb(osTZ);sess=newSession(db,'OT');pending=null;lastStmt=null;};
  api.state=function(){
    const me=sess.user;const objs=Object.values(db.objs);
    return{inst:db.inst,listener:db.listener,user:sess.user?(sess.sysdba?'SYS AS SYSDBA':sess.user):null,schema:sess.user?(sess.schema||sess.user):null,pendingTx:!!(sess.tx&&sess.tx.undo.length),serverout:sess.serverout,
      roles:sess.user?[...activeRoles({db,sess})]:[],
      tables:objs.filter(o=>o.type==='TABLE').map(o=>({owner:o.owner,name:o.name,rows:o.external?null:tableRows(o,{db,sess}).length+(o.virtual||0),ts:o.external?'external':o.ts,temp:!!o.temp})),
      views:objs.filter(o=>o.type==='VIEW').map(o=>({owner:o.owner,name:o.name,status:o.status})),
      seqs:objs.filter(o=>o.type==='SEQUENCE').map(o=>({owner:o.owner,name:o.name})),
      syns:objs.filter(o=>o.type==='SYNONYM').map(o=>({owner:o.owner,name:o.name})).concat(Object.keys(db.pubSyn).map(n=>({owner:'PUBLIC',name:n}))),
      progs:objs.filter(o=>['PROCEDURE','FUNCTION','PACKAGE','TYPE'].includes(o.type)).map(o=>({owner:o.owner,name:o.name,type:o.type,status:o.status})),
      trigs:Object.values(db.trigs).map(t=>({owner:t.owner,name:t.name,enabled:t.enabled,status:t.status})),
      idx:Object.values(db.idx).map(i=>({owner:i.owner,name:i.name,table:(db.objs[i.tkey]||{}).name})),
      ts:Object.values(db.ts).map(t=>({name:t.name,type:t.type,status:t.status,group:t.group,used:+tsUsed(db,t.name).toFixed(2),size:+tsSize(db,t.name).toFixed(2),files:t.files.map(f=>f.name)})),
      users:Object.values(db.users).map(u=>({name:u.name,status:u.status,profile:u.profile})),
      roleNames:Object.keys(db.roles),profiles:Object.keys(db.profiles),links:Object.values(db.links).map(l=>(l.pub?'PUBLIC.':l.owner+'.')+l.name),dirs:Object.keys(db.dirs),defaultTemp:db.defaultTemp};
  };
  api.prompt=()=>pending?pending.prompt:'SQL> ';
  api.clone=function(){const c=create(Object.assign({},opts,{noSeed:true}));c._load(cloneDeep({db,sess}));return c;};
  api._load=function(st){db=st.db;sess=st.sess;pending=null;};
  api.fingerprint=function(){
    const cx={db,sess};const parts=[];
    for(const k of Object.keys(db.objs).sort()){const o=db.objs[k];
      if(o.type==='TABLE'){const rows=o.external?[]:tableRows(o,cx).map(r=>r.v.map(v=>v instanceof DT?'D':valKey(v)).join('|')).sort();parts.push(k+':T:'+o.cols.filter(c=>!c.unused).map(c=>c.name+' '+typeStr(c.type)+(c.invisible?' I':'')).join(',')+':'+o.cons.map(c=>c.k+(c.cols||[]).join('+')+(c.disabled?'d':'')).sort().join(',')+':'+rows.join(';'));}
      else parts.push(k+':'+o.type+':'+(o.status||'')+(o.type==='VIEW'?o.text:'')+(o.type==='SEQUENCE'?':'+o.inc+':'+o.max:''));}
    for(const k of Object.keys(db.idx).sort())parts.push('IX:'+k+':'+(db.idx[k].unique?'U':'')+(db.idx[k].bitmap?'B':''));
    for(const k of Object.keys(db.trigs).sort())parts.push('TR:'+k+':'+db.trigs[k].enabled);
    for(const u of Object.values(db.users).sort((a,b)=>a.name<b.name?-1:1))parts.push('U:'+u.name+':'+u.status+':'+u.profile+':'+u.dts+':'+Object.keys(u.privs).sort().join(',')+':'+Object.keys(u.roles).sort().join(',')+':'+JSON.stringify(u.quotas));
    parts.push('R:'+Object.keys(db.roles).sort().map(r=>r+'='+Object.keys(db.roles[r].privs).sort().join('+')+'/'+Object.keys(db.roles[r].roles).sort().join('+')).join(','));
    parts.push('P:'+Object.keys(db.profiles).sort().map(p=>p+JSON.stringify(db.profiles[p].limits)).join(','));
    parts.push('OP:'+db.objPrivs.map(o=>o.grantee+'>'+o.owner+'.'+o.obj+':'+o.priv).sort().join(','));
    parts.push('TS:'+Object.values(db.ts).map(t=>t.name+':'+t.type+':'+t.status+':'+t.group+':'+t.files.map(f=>f.name+'@'+f.size+(f.auto?'a':'')).join('+')).sort().join(','));
    parts.push('L:'+Object.keys(db.links).sort().join(',')+':D:'+Object.keys(db.dirs).sort().join(',')+':DT:'+db.defaultTemp+':I:'+db.inst+':LS:'+db.listener+':PS:'+Object.keys(db.pubSyn).sort().join(','));
    return parts.join('\n');
  };
  api.lastResult=null;
  api.query=function(sql){/* run a query and return {cols,rows} without printing (used by checks) */const cx=mkCx();const p=new P(lex(sql),sql);const q=parseQuery(p);return runQuery(q,sub(cx,{stmtCache:new Map()}));};
  api.tableInfo=function(owner,name){const o=db.objs[(owner||sess.schema||sess.user||'OT').toUpperCase()+'.'+String(name).toUpperCase()];if(!o||o.type!=='TABLE')return null;return o.cols.filter(c=>!c.unused&&!c.invisible).map(c=>{const pk=o.cons.some(k=>k.k==='P'&&!k.disabled&&k.cols&&k.cols.includes(c.name));const fk=o.cons.find(k=>k.k==='R'&&!k.disabled&&k.cols&&k.cols.includes(c.name));const nn=pk||o.cons.some(k=>k.k==='N'&&!k.disabled&&k.cols&&k.cols.includes(c.name));return{name:c.name,type:typeStr(c.type),pk,nn,fk:fk&&fk.ref?(fk.ref.key||'').replace(/^OT\./,''):null,virt:!!c.virtual};});};
  api.session=()=>sess;api.db=()=>db;
  return api;
}

return{create,_t:{lex,P,parseQuery,parseExpr,evalE,fmtDate,parseDate,fmtNumber,numToStr,DT,IV}};
})();
if(typeof module!=="undefined")module.exports=SIM;

