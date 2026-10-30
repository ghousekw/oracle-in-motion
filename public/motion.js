/* ===== Motion: SVG stage engine (scene model, renderers, operations, tweens) =====
   Motion.create(svg, opts) -> stage; stage.load(lesson); stage.goStep(k, animate); stage.frame(dt) each animation frame. */
const Motion=(function(){
'use strict';
const NS='http://www.w3.org/2000/svg';const W=960,H=540;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const C=t=>'var(--'+(t||'ink')+')';
const f=v=>Math.round(v*10)/10;
const ease={lin:p=>p,out:p=>1-Math.pow(1-p,3),inout:p=>p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2,back:p=>{const c1=1.5,c3=c1+1;return 1+c3*Math.pow(p-1,3)+c1*Math.pow(p-1,2);}};
const DEF_TONE={region:'muted',box:'ink',proc:'proc',pill:'proc',disk:'file',doc:'file',user:'mem',term:'ink',chip:'accent',table:'ink',meter:'accent',stages:'accent',label:'ink',venn:'mem',var:'violet'};
const BELOW={disk:38,user:38,var:0};
function tw8(s,px){return String(s).length*px+14;}
function create(svg,opts){
  opts=opts||{};const tr=opts.tr||(s=>s);const RM=!!opts.reducedMotion;
  let clock=0,S=null,ANIM=false,T0=0,tweens=[],timers=[],dirty=true;
  function tw(o,k,to,dur,at,e){if(!ANIM){o[k]=to;return;}if(RM&&k!=='o'&&k!=='n')dur=1;tweens.push({o,k,to,dur:Math.max(1,dur),start:T0+(at||0),e:ease[e||'inout']});}
  function twNow(o,k,to,dur,e,delay){if(RM&&k!=='o'&&k!=='n')dur=1;tweens.push({o,k,to,dur:Math.max(1,dur),start:clock+(delay||0),e:ease[e||'inout']});}
  function later(at,fn){if(!ANIM){fn(false);return;}timers.push({at:T0+(at||0),fn});}
  function mkRow(c,o){return{c:c.slice(),o:o==null?1:o,tone:null,tv:0,dim:0,strike:0,y:0,flash:{}};}
  function mkNode(spec){
    const[id,k,x,y,w,h,label,opt]=spec;const o=opt||{};
    const n={id,k,x,y,w:w||0,h:h||0,label:label==null?'':label,sub:o.sub||'',tone:o.tone||DEF_TONE[k]||'ink',
      o:o.on?1:0,dy:o.on?0:12,s:1,sh:0,ring:1,level:o.level||0,at:o.at||0,items:o.items||[],cols:(o.cols||[]).slice(),cw:o.cw?o.cw.slice():null,
      rows:(o.rows||[]).map((c,i)=>{const r=mkRow(c);r.y=i;return r;}),hl:-1,lines:(o.lines||[]).map(t=>({t,n:t.length,tone:o.ltone})),
      b:{lock:0,x:0,ok:0},strike:0,dim:0,opt:o,el:null,colhl:null,colTone:'accent',venn:o.fill||'none',vfade:{},val:o.v==null?'':String(o.v),vflash:0,newCol:-1,newColP:1};
    if(k==='venn'){['inner','left','right','full','leftonly','rightonly','xor','none','a','b'].forEach(r=>{n.vfade[r]=r===n.venn?1:0;});}
    return n;
  }
  function N(id){const n=S.nodes[id];if(!n)throw new Error('Unknown node "'+id+'" in lesson '+S.lesson.id);return n;}
  /* row anchors: "tbl#2" is row 2 (0-based) of table tbl */
  function NA(id){if(typeof id==='string'&&id.includes('#')){const[t,r]=id.split('#');const n=N(t);const rh=n.opt.rh||25,hh=27;const ri=+r;const row=n.rows[ri];const yy=row?row.y:ri;
      return{k:'box',x:n.x,y:n.y+n.dy+hh+yy*rh,w:n.w,h:rh,dy:0,o:n.o*(row?row.o:1),label:''};}return N(id);}
  function center(n){if(n.k==='label')return[n.x,n.y+n.dy];return[n.x+n.w/2,n.y+n.dy+n.h/2];}
  function edgePt(n,tx,ty,pad){pad=pad==null?7:pad;const c=center(n);if(n.k==='label')return c;
    const dx=tx-c[0],dy=ty-c[1];const hw=n.w/2+pad;let hh=n.h/2+pad;if(dy>0&&BELOW[n.k]&&(n.label||n.sub))hh+=BELOW[n.k]-(n.sub?0:14);
    const sx=dx?hw/Math.abs(dx):Infinity,sy=dy?hh/Math.abs(dy):Infinity;const s=Math.min(sx,sy,1);if(!isFinite(s))return c;return[c[0]+dx*s,c[1]+dy*s];}
  function geom(fromId,toId,bend){const a=NA(fromId),b=NA(toId);const ca=center(a),cb=center(b);let ctrl=null;
    if(bend){const mx=(ca[0]+cb[0])/2,my=(ca[1]+cb[1])/2,dx=cb[0]-ca[0],dy=cb[1]-ca[1],len=Math.hypot(dx,dy)||1;ctrl=[mx-dy/len*bend,my+dx/len*bend];}
    return{pa:edgePt(a,...(ctrl||cb)),pb:edgePt(b,...(ctrl||ca)),ctrl};}
  function ptAt(g,t){const{pa,pb,ctrl}=g;if(!ctrl)return{p:[pa[0]+(pb[0]-pa[0])*t,pa[1]+(pb[1]-pa[1])*t],tan:[pb[0]-pa[0],pb[1]-pa[1]]};
    const u=1-t;return{p:[u*u*pa[0]+2*u*t*ctrl[0]+t*t*pb[0],u*u*pa[1]+2*u*t*ctrl[1]+t*t*pb[1]],tan:[2*u*(ctrl[0]-pa[0])+2*t*(pb[0]-ctrl[0]),2*u*(ctrl[1]-pa[1])+2*t*(pb[1]-ctrl[1])]};}
  function partialPath(g,t){const{pa,pb,ctrl}=g;if(!ctrl){const e=[pa[0]+(pb[0]-pa[0])*t,pa[1]+(pb[1]-pa[1])*t];return'M'+f(pa[0])+' '+f(pa[1])+'L'+f(e[0])+' '+f(e[1]);}
    const c1=[pa[0]+(ctrl[0]-pa[0])*t,pa[1]+(ctrl[1]-pa[1])*t],c2=[ctrl[0]+(pb[0]-ctrl[0])*t,ctrl[1]+(pb[1]-ctrl[1])*t];const e=[c1[0]+(c2[0]-c1[0])*t,c1[1]+(c2[1]-c1[1])*t];
    return'M'+f(pa[0])+' '+f(pa[1])+'Q'+f(c1[0])+' '+f(c1[1])+' '+f(e[0])+' '+f(e[1]);}
  function arrowHead(p,tan,tone,size){size=size||9;const len=Math.hypot(tan[0],tan[1])||1;const ux=tan[0]/len,uy=tan[1]/len,vx=-uy,vy=ux;const b=[p[0]-ux*size,p[1]-uy*size];
    return'<path d="M'+f(p[0])+' '+f(p[1])+'L'+f(b[0]+vx*size*.55)+' '+f(b[1]+vy*size*.55)+'L'+f(b[0]-vx*size*.55)+' '+f(b[1]-vy*size*.55)+'Z" style="fill:'+C(tone)+'"/>';}
  function textBlock(n,cx,cy,cls,lh){cls=cls||'tl';lh=lh||19;const L=String(n.label).split('\n');const total=L.length*lh+(n.sub?17:0);const y=cy-total/2+15;let s='';
    if(n.label!=='')s+='<text text-anchor="middle" class="'+cls+'" data-maxw="'+f(n.w-8)+'">'+L.map((l,i)=>'<tspan x="'+f(cx)+'" y="'+f(y+i*lh)+'">'+esc(l)+'</tspan>').join('')+'</text>';
    if(n.sub)s+='<text text-anchor="middle" class="ts" x="'+f(cx)+'" y="'+f(y+(L.length-1)*lh+18)+'">'+esc(n.sub)+'</text>';return s;}
  function below(n,y){let s='';const L=String(n.label).split('\n');L.forEach((l,i)=>{if(l)s+='<text x="'+f(n.w/2)+'" y="'+f(y+i*17)+'" text-anchor="middle" class="tm">'+esc(l)+'</text>';});
    if(n.sub)s+='<text x="'+f(n.w/2)+'" y="'+f(y+(L.length-1)*17+16)+'" text-anchor="middle" class="ts">'+esc(n.sub)+'</text>';return s;}
  const R={
    box(n){const{w,h}=n,t=C(n.tone);let s='<rect width="'+w+'" height="'+h+'" rx="8" class="face" style="stroke:'+t+'" stroke-width="1.6"'+(n.opt.dash?' stroke-dasharray="6 5"':'')+'/>';
      s+='<rect width="'+w+'" height="'+h+'" rx="8" style="fill:'+t+'" fill-opacity="'+(n.opt.solid?0.17:0.06)+'"/>';return s+textBlock(n,w/2,h/2,n.opt.small?'tls':'tl',n.opt.small?17:19);},
    region(n){const{w,h}=n,t=C(n.tone);let s='<rect width="'+w+'" height="'+h+'" rx="12" style="fill:'+t+';stroke:'+t+'" fill-opacity="0.05" stroke-opacity="0.75" stroke-width="1.3" stroke-dasharray="7 5"/>';
      s+='<text x="14" y="22" class="tr" style="fill:'+t+'">'+esc(String(n.label).toUpperCase())+'</text>';if(n.sub)s+='<text x="'+(w-14)+'" y="22" text-anchor="end" class="ts">'+esc(n.sub)+'</text>';return s;},
    proc(n){const{w,h}=n,t=C(n.tone);let s='<rect width="'+w+'" height="'+h+'" rx="'+h/2+'" class="face" style="stroke:'+t+'" stroke-width="1.6"/>';s+='<rect width="'+w+'" height="'+h+'" rx="'+h/2+'" style="fill:'+t+'" fill-opacity="0.15"/>';return s+textBlock(n,w/2,h/2,'tm',17);},
    pill(n){return R.proc(n);},
    disk(n){const{w,h}=n,t=C(n.tone);const ry=Math.min(11,h*.14),rx=w/2;let s='<path d="M0 '+ry+'V'+(h-ry)+'A'+rx+' '+ry+' 0 0 0 '+w+' '+(h-ry)+'V'+ry+'A'+rx+' '+ry+' 0 0 0 0 '+ry+'Z" class="face" style="stroke:'+t+'" stroke-width="1.6"/>';
      const lv=Math.max(0,Math.min(1,n.level));if(lv>0.001){const yl=ry+(h-2*ry)*(1-lv);s+='<path d="M0 '+f(yl)+'V'+(h-ry)+'A'+rx+' '+ry+' 0 0 0 '+w+' '+(h-ry)+'V'+f(yl)+'A'+rx+' '+ry+' 0 0 1 0 '+f(yl)+'Z" style="fill:'+t+'" fill-opacity="0.28"/>';s+='<ellipse cx="'+rx+'" cy="'+f(yl)+'" rx="'+(rx-1)+'" ry="'+ry+'" style="fill:'+t+'" fill-opacity="0.18"/>';}
      s+='<ellipse cx="'+rx+'" cy="'+ry+'" rx="'+rx+'" ry="'+ry+'" class="face" style="stroke:'+t+'" stroke-width="1.6"/>';if(n.opt.inside)s+='<text x="'+rx+'" y="'+f(h/2+8)+'" text-anchor="middle" class="tm">'+esc(n.opt.inside)+'</text>';return s+below(n,h+19);},
    doc(n){const{w,h}=n,t=C(n.tone);const c=14;let s='<path d="M0 0H'+(w-c)+'L'+w+' '+c+'V'+h+'H0Z" class="face" style="stroke:'+t+'" stroke-width="1.5"/>';s+='<path d="M'+(w-c)+' 0V'+c+'H'+w+'" fill="none" style="stroke:'+t+'" stroke-width="1.5"/>';
      const L=String(n.label).split('\n');
      if(L.length>1){return s+textBlock(n,w/2,h/2,'tm',16);}
      if(h>=56)for(let i=0;i<3;i++)s+='<line x1="10" x2="'+(w-(i===0?c+12:14+i*10))+'" y1="'+(16+i*8)+'" y2="'+(16+i*8)+'" style="stroke:'+t+'" stroke-opacity=".35" stroke-width="2"/>';
      s+='<text x="'+w/2+'" y="'+(h>=56?h-12:h/2+5)+'" text-anchor="middle" class="tm" data-maxw="'+f(w-10)+'">'+esc(n.label)+'</text>';if(n.sub)s+='<text x="'+w/2+'" y="'+(h+17)+'" text-anchor="middle" class="ts">'+esc(n.sub)+'</text>';return s;},
    user(n){const{w,h}=n,t=C(n.tone);const r=h*.2,cx=w/2;let s='<circle cx="'+cx+'" cy="'+f(h*.3)+'" r="'+f(r)+'" class="face" style="stroke:'+t+'" stroke-width="1.8"/>';s+='<circle cx="'+cx+'" cy="'+f(h*.3)+'" r="'+f(r)+'" style="fill:'+t+'" fill-opacity=".18"/>';
      const bw=r*2;const body='M'+f(cx-bw)+' '+h+'Q'+f(cx-bw)+' '+f(h*.58)+' '+cx+' '+f(h*.58)+'Q'+f(cx+bw)+' '+f(h*.58)+' '+f(cx+bw)+' '+h+'Z';s+='<path d="'+body+'" class="face" style="stroke:'+t+'" stroke-width="1.8"/><path d="'+body+'" style="fill:'+t+'" fill-opacity=".18"/>';return s+below(n,h+19);},
    term(n){const{w,h}=n;const lh=18;let s='<defs><clipPath id="clip-'+n.id+'"><rect width="'+w+'" height="'+h+'" rx="8"/></clipPath></defs>';
      s+='<g clip-path="url(#clip-'+n.id+')"><rect width="'+w+'" height="'+h+'" style="fill:var(--term)"/><rect width="'+w+'" height="24" style="fill:var(--term-bar)"/>';
      s+='<circle cx="13" cy="12" r="3.5" style="fill:var(--term-acc)"/><text x="24" y="16" class="tt" style="fill:var(--term-dim);font-size:11.5px">'+esc(n.label||'SQL*Plus')+'</text>';
      const vis=Math.max(1,Math.floor((h-34)/lh));const L=n.lines;const start=Math.max(0,L.length-vis);
      for(let i=start;i<L.length;i++){const ln=L[i];const y=24+lh+(i-start)*lh-2;const txt=ln.t.slice(0,Math.round(ln.n));const typing=ln.n<ln.t.length;
        const m=txt.match(/^(SQL>|RMAN>|LSNRCTL>|>>>|\.\.\.|\$|#|(?:[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+:[^#$]*[#$])|C:\\[^>]*>|Enter [^:]*:|\s+\d+\s)\s?(.*)$/);
        let cls=ln.tone==='err'?'var(--term-err)':ln.tone==='ok'?'var(--term-ok)':ln.tone==='dim'?'var(--term-dim)':'var(--term-fg)';
        if(!ln.tone&&/^(ORA-|TNS-|SP2-|PLS-|ERROR|Traceback|\w+Error:|bash:|chmod:|chown:|kill:|grep:|sed:|awk:|tar:|rsync:|systemctl:|journalctl:|curl:|ssh:|crontab:|find:|cat:|mkdir:|rm:|cp:|mv:|mount:|umount:|df:|du:|ss:|lsof:|ip:|ps:|free:|top:|vmstat:|dmesg:|Permission denied|No such file or directory|command not found|Operation not permitted)/i.test(txt))cls='var(--term-err)';
        s+='<text x="12" y="'+y+'" class="tt" xml:space="preserve" data-maxw="'+f(w-20)+'">';if(m)s+='<tspan style="fill:var(--term-acc)">'+esc(m[1])+'</tspan><tspan style="fill:'+cls+'">'+esc(m[2])+'</tspan>';else s+='<tspan style="fill:'+cls+'">'+esc(txt)+'</tspan>';s+='</text>';
        if(typing)s+='<rect x="'+f(12+txt.length*7.8)+'" y="'+(y-11)+'" width="7" height="14" style="fill:var(--term-acc)"/>';}
      s+='</g><rect width="'+w+'" height="'+h+'" rx="8" fill="none" style="stroke:var(--term-line)"/>';return s;},
    chip(n){const{w,h}=n,t=C(n.tone);let s='<rect width="'+w+'" height="'+h+'" rx="'+h/2+'" class="face" style="stroke:'+t+'" stroke-width="1.4"/>';s+='<rect width="'+w+'" height="'+h+'" rx="'+h/2+'" style="fill:'+t+'" fill-opacity="'+(n.opt.solid?0.9:0.15)+'"/>';
      s+='<text x="'+w/2+'" y="'+f(h/2+4.5)+'" text-anchor="middle" class="tm" data-maxw="'+f(w-10)+'" style="fill:'+(n.opt.solid?'var(--panel)':t)+';font-size:12.5px">'+esc(n.label)+'</text>';return s;},
    label(n){const o=n.opt;const size=o.size||15;const anchor=o.anchor||'middle';const fam=o.mono?'var(--f-mono)':o.display?'var(--f-display)':'var(--f-body)';const L=String(n.label).split('\n');
      return'<text text-anchor="'+anchor+'" style="font:'+(o.weight||600)+' '+size+'px '+fam+';fill:'+C(n.tone)+(o.display?';font-stretch:112%':'')+'">'+L.map((l,i)=>'<tspan x="0" y="'+f(i*size*1.3)+'">'+esc(l)+'</tspan>').join('')+'</text>';},
    stages(n){const it=n.items,k=it.length,sp=n.w/k,ph=n.h,pw=sp-14,t=C(n.tone);let s='<line x1="'+sp/2+'" y1="'+ph/2+'" x2="'+(n.w-sp/2)+'" y2="'+ph/2+'" style="stroke:var(--line)" stroke-width="2"/>';
      s+='<line x1="'+sp/2+'" y1="'+ph/2+'" x2="'+f(sp/2+sp*n.at)+'" y2="'+ph/2+'" style="stroke:'+t+'" stroke-width="3"/>';
      it.forEach((x,i)=>{const cx=sp*(i+.5),past=i<n.at-.5;s+='<rect x="'+f(cx-pw/2)+'" y="0" width="'+f(pw)+'" height="'+ph+'" rx="'+ph/2+'" class="face" style="stroke:'+(past?t:'var(--line)')+'" stroke-width="1.5"/>';});
      const ix=sp*(n.at+.5);s+='<rect x="'+f(ix-pw/2)+'" y="0" width="'+f(pw)+'" height="'+ph+'" rx="'+ph/2+'" style="fill:'+t+'"/>';
      it.forEach((x,i)=>{const cx=sp*(i+.5),on=Math.abs(i-n.at)<.5,past=i<n.at-.5;s+='<text x="'+f(cx)+'" y="'+f(ph/2+4.5)+'" text-anchor="middle" class="tm" style="fill:'+(on?'var(--panel)':past?t:'var(--muted)')+'">'+esc(x)+'</text>';});
      if(n.label)s+='<text x="0" y="-11" class="tr" style="fill:var(--muted)">'+esc(String(n.label).toUpperCase())+'</text>';return s;},
    table(n){const{w,h}=n;const cols=n.cols,cw=n.cw||cols.map(()=>1/cols.length);const rh=n.opt.rh||25,hh=27;
      let s='<rect width="'+w+'" height="'+h+'" rx="7" class="face" style="stroke:var(--line)" stroke-width="1.3"/>';
      if(n.label)s+='<text x="2" y="-10" class="tr" style="fill:'+C(n.tone==='ink'?'muted':n.tone)+'">'+esc(String(tr(n.label)).toUpperCase())+'</text>';
      if(n.sub)s+='<text x="'+w+'" y="-10" text-anchor="end" class="ts">'+esc(tr(n.sub))+'</text>';
      const tot=cw.reduce((a,b)=>a+b,0)||1;let xs=[],ws=[],x=12;cols.forEach((c,i)=>{xs.push(x);const ww=cw[i]/tot*(w-24);ws.push(ww);x+=ww;});
      if(n.colhl&&n.colhl.size){n.colhl.forEach(ci=>{if(ci<0||ci>=cols.length)return;s+='<rect x="'+f(xs[ci]-6)+'" y="2" width="'+f(ws[ci])+'" height="'+f(h-4)+'" rx="5" style="fill:'+C(n.colTone)+'" fill-opacity=".12"/>';});}
      cols.forEach((c,i)=>{const nw=i===n.newCol?n.newColP:1;s+='<text x="'+f(xs[i])+'" y="18" class="th" data-maxw="'+f(ws[i]-4)+'" opacity="'+f(nw)+'"'+(n.colhl&&n.colhl.has(i)?' style="fill:'+C(n.colTone)+'"':'')+'>'+esc(String(tr(c)).toUpperCase())+'</text>';});
      s+='<line x1="0" x2="'+w+'" y1="'+hh+'" y2="'+hh+'" style="stroke:var(--line)"/>';
      s+='<defs><clipPath id="tclip-'+n.id+'"><rect x="0" y="'+hh+'" width="'+w+'" height="'+(h-hh)+'"/></clipPath></defs><g clip-path="url(#tclip-'+n.id+')">';
      n.rows.forEach((r,ri)=>{const y=hh+r.y*rh;if(y>h+2)return;const op=r.o*(1-0.7*r.dim);if(op<=0.01)return;
        s+='<g opacity="'+f(op)+'">';
        if(ri===n.hl)s+='<rect x="3" y="'+f(y+2)+'" width="'+(w-6)+'" height="'+(rh-3)+'" rx="4" style="fill:var(--accent)" fill-opacity=".16"/>';
        if(r.tone&&r.tv>0.01)s+='<rect x="3" y="'+f(y+2)+'" width="'+(w-6)+'" height="'+(rh-3)+'" rx="4" style="fill:'+C(r.tone)+'" fill-opacity="'+f(.2*r.tv)+'"/><rect x="3" y="'+f(y+2)+'" width="3" height="'+(rh-3)+'" rx="1.5" style="fill:'+C(r.tone)+'" opacity="'+f(r.tv)+'"/>';
        r.c.forEach((c,ci)=>{if(ci>=cols.length)return;const v=c==null?'':String(c);const err=/^(ORA-|PLS-)/.test(v);const nul=c==null||v==='(null)';const fl=r.flash[ci]||0;
          if(fl>0.01)s+='<rect x="'+f(xs[ci]-4)+'" y="'+f(y+3)+'" width="'+f(ws[ci])+'" height="'+(rh-5)+'" rx="3" style="fill:var(--accent)" fill-opacity="'+f(.3*fl)+'"/>';
          const nw=ci===n.newCol?n.newColP:1;
          s+='<text x="'+f(xs[ci])+'" y="'+f(y+17)+'" class="td" data-maxw="'+f(ws[ci]-4)+'"'+(err?' style="fill:var(--danger)"':nul?' style="fill:var(--muted);font-style:italic;opacity:.75"':'')+' opacity="'+f(nw)+'">'+esc(c==null?'NULL':tr(v))+'</text>';});
        if(r.strike>0.01)s+='<line x1="6" y1="'+f(y+rh/2)+'" x2="'+f(6+(w-12)*r.strike)+'" y2="'+f(y+rh/2)+'" style="stroke:var(--danger)" stroke-width="2.4" stroke-linecap="round"/>';
        s+='</g>';});
      s+='</g>';
      if(!n.rows.length&&n.opt.empty)s+='<text x="12" y="'+(hh+18)+'" class="ts">'+esc(tr(n.opt.empty))+'</text>';
      return s;},
    meter(n){const{w,h}=n,t=C(n.tone);const lv=Math.max(0,Math.min(1,n.level));let s='<rect width="'+w+'" height="'+h+'" rx="'+Math.min(6,h/2)+'" style="fill:var(--panel-2);stroke:var(--line)"/>';
      s+='<rect width="'+f(w*lv)+'" height="'+h+'" rx="'+Math.min(6,h/2)+'" style="fill:'+t+'" fill-opacity=".85"/>';if(n.label)s+='<text x="0" y="-8" class="tls">'+esc(n.label)+'</text>';if(n.sub)s+='<text x="'+w+'" y="-8" text-anchor="end" class="ts">'+esc(n.sub)+'</text>';return s;},
    venn(n){const{w,h}=n;const r=Math.min(h/2-14,w/3.2);const cy=h/2+10,cxA=w/2-r*0.55,cxB=w/2+r*0.55;const tA=C(n.opt.ta||'mem'),tB=C(n.opt.tb||'proc');const id=n.id;
      let s='<defs><clipPath id="vA-'+id+'"><circle cx="'+f(cxA)+'" cy="'+f(cy)+'" r="'+f(r)+'"/></clipPath><clipPath id="vB-'+id+'"><circle cx="'+f(cxB)+'" cy="'+f(cy)+'" r="'+f(r)+'"/></clipPath>'+
        '<mask id="vnA-'+id+'"><rect width="'+w+'" height="'+h+'" fill="white"/><circle cx="'+f(cxA)+'" cy="'+f(cy)+'" r="'+f(r)+'" fill="black"/></mask><mask id="vnB-'+id+'"><rect width="'+w+'" height="'+h+'" fill="white"/><circle cx="'+f(cxB)+'" cy="'+f(cy)+'" r="'+f(r)+'" fill="black"/></mask></defs>';
      const fillA='<circle cx="'+f(cxA)+'" cy="'+f(cy)+'" r="'+f(r)+'" style="fill:var(--accent)"',fillB='<circle cx="'+f(cxB)+'" cy="'+f(cy)+'" r="'+f(r)+'" style="fill:var(--accent)"';
      const reg=(name,svgS)=>{const v=n.vfade[name]||0;return v>0.01?'<g opacity="'+f(v*0.42)+'">'+svgS+'</g>':'';};
      s+=reg('inner','<g clip-path="url(#vA-'+id+')">'+fillB+'/></g>');
      s+=reg('left','<g>'+fillA+'/></g>');s+=reg('right','<g>'+fillB+'/></g>');
      s+=reg('full','<g>'+fillA+'/>'+fillB+'/></g>');
      s+=reg('leftonly','<g mask="url(#vnB-'+id+')">'+fillA+'/></g>');s+=reg('rightonly','<g mask="url(#vnA-'+id+')">'+fillB+'/></g>');
      s+=reg('xor','<g mask="url(#vnB-'+id+')">'+fillA+'/></g><g mask="url(#vnA-'+id+')">'+fillB+'/></g>');
      s+='<circle cx="'+f(cxA)+'" cy="'+f(cy)+'" r="'+f(r)+'" fill="none" style="stroke:'+tA+'" stroke-width="2"/><circle cx="'+f(cxB)+'" cy="'+f(cy)+'" r="'+f(r)+'" fill="none" style="stroke:'+tB+'" stroke-width="2"/>';
      s+='<text x="'+f(cxA-r*0.3)+'" y="'+f(cy-r-9)+'" text-anchor="middle" class="tm" style="fill:'+tA+'">'+esc(tr(n.opt.a||'A'))+'</text>';
      s+='<text x="'+f(cxB+r*0.3)+'" y="'+f(cy-r-9)+'" text-anchor="middle" class="tm" style="fill:'+tB+'">'+esc(tr(n.opt.b||'B'))+'</text>';
      if(n.label)s+='<text x="'+f(w/2)+'" y="'+f(h+20)+'" text-anchor="middle" class="tm">'+esc(tr(n.label))+'</text>';
      if(n.sub)s+='<text x="'+f(w/2)+'" y="'+f(h+37)+'" text-anchor="middle" class="ts">'+esc(tr(n.sub))+'</text>';
      return s;},
    var(n){const{w,h}=n,t=C(n.tone);let s='<rect width="'+w+'" height="'+h+'" rx="7" class="face" style="stroke:'+t+'" stroke-width="1.6"/>';
      s+='<rect width="'+w+'" height="'+h+'" rx="7" style="fill:'+t+'" fill-opacity="'+f(0.07+0.25*n.vflash)+'"/>';
      s+='<text x="2" y="-8" class="tm" style="fill:'+t+';font-size:12.5px">'+esc(n.label)+(n.opt.type?'  ':'')+'</text>';
      if(n.opt.type)s+='<text x="'+w+'" y="-8" text-anchor="end" class="ts">'+esc(n.opt.type)+'</text>';
      const v=n.val;const isNull=v===''||v==null;s+='<text x="'+f(w/2)+'" y="'+f(h/2+5.5)+'" text-anchor="middle" class="tm" data-maxw="'+f(w-8)+'" style="font-size:15px'+(isNull?';fill:var(--muted);font-style:italic':'')+'">'+esc(isNull?'NULL':v)+'</text>';
      return s;}
  };
  function badges(n){let s='',i=0;const bx=n.k==='label'?0:n.w,by=0;const order=[['ok','ok'],['lock','accent'],['x','danger']];
    for(const[k,tone]of order){const v=n.b[k];if(v<=0.01)continue;const cx=bx-4-i*30,cy=by+2;i++;
      s+='<g transform="translate('+f(cx)+' '+f(cy)+') scale('+f(v)+')"><circle r="13" style="fill:'+C(tone)+';stroke:var(--stage)" stroke-width="3"/>';
      if(k==='lock')s+='<path d="M-4 -1V-4a4 4 0 0 1 8 0V-1" fill="none" style="stroke:var(--badge-ink)" stroke-width="1.9"/><rect x="-6" y="-1" width="12" height="9" rx="1.5" style="fill:var(--badge-ink)"/>';
      if(k==='x')s+='<path d="M-4.5 -4.5L4.5 4.5M4.5 -4.5L-4.5 4.5" style="stroke:var(--badge-ink)" stroke-width="2.4" stroke-linecap="round"/>';
      if(k==='ok')s+='<path d="M-5.5 0L-1.5 4L5.5 -4" fill="none" style="stroke:var(--badge-ink)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';s+='</g>';}
    return s;}
  function renderNode(n){const el=n.el;const alpha=n.o*(1-0.62*n.dim);if(alpha<=0.005){el.setAttribute('visibility','hidden');return;}el.removeAttribute('visibility');
    const shx=n.sh>0&&n.sh<1?Math.sin(n.sh*Math.PI*6)*7*(1-n.sh):0;const cx=n.w/2,cy=n.h/2;
    el.setAttribute('transform','translate('+f(n.x+shx+cx)+' '+f(n.y+n.dy+cy)+') scale('+f(n.s)+') translate('+f(-cx)+' '+f(-cy)+')');el.setAttribute('opacity',f(alpha*100)/100);
    const ol=n.label,os=n.sub;n.label=tr(ol);n.sub=tr(os);let s=(R[n.k]||R.box)(n);n.label=ol;n.sub=os;
    if(n.strike>0.01){const ex=n.k==='label'?0:n.w;s+='<line x1="-6" y1="'+f(n.h/2)+'" x2="'+f(-6+(ex+12)*n.strike)+'" y2="'+f(n.h/2)+'" style="stroke:var(--danger)" stroke-width="3" stroke-linecap="round"/>';}
    if(n.ring<1){const g=4+n.ring*14;s+='<rect x="'+f(-g)+'" y="'+f(-g)+'" width="'+f(n.w+2*g)+'" height="'+f(n.h+2*g)+'" rx="'+f(10+g)+'" fill="none" style="stroke:var(--accent)" stroke-width="2.2" opacity="'+f((1-n.ring)*.9)+'"/>';}
    s+=badges(n);el.innerHTML=s;}
  function renderLink(l){const a=NA(l.from),b=NA(l.to);const alpha=l.o*Math.min(a.o,b.o)*(1-0.62*Math.max(l.dim||0,0));if(alpha<=0.01||l.p<=0.001){l.el.setAttribute('visibility','hidden');return;}
    l.el.removeAttribute('visibility');l.el.setAttribute('opacity',f(alpha*100)/100);const g=geom(l.from,l.to,l.bend);const t=l.tone||'muted';
    let s='<path d="'+partialPath(g,l.p)+'" fill="none" style="stroke:'+C(t)+'" stroke-width="'+(l.w||1.8)+'"'+(l.dash?' stroke-dasharray="6 5"':'')+' stroke-linecap="round"/>';
    const end=ptAt(g,l.p);if(!l.noArrow)s+=arrowHead(end.p,end.tan,t);if(l.both&&l.p>.99){const st=ptAt(g,0);s+=arrowHead(st.p,[-st.tan[0],-st.tan[1]],t);}
    if(l.label&&l.p>.5){const m=ptAt(g,.5).p;const lab=tr(l.label);const lw=tw8(lab,7.2);s+='<g opacity="'+f(Math.min(1,(l.p-.5)*3))+'"><rect x="'+f(m[0]-lw/2)+'" y="'+f(m[1]-11)+'" width="'+f(lw)+'" height="20" rx="5" style="fill:var(--stage);stroke:'+C(t)+'" stroke-opacity=".5"/><text x="'+f(m[0])+'" y="'+f(m[1]+3.5)+'" text-anchor="middle" class="fl" style="fill:'+C(t)+'">'+esc(lab)+'</text></g>';}
    l.el.innerHTML=s;}
  function renderFlow(fl){if(fl.o<=0.01)return'';const g=geom(fl.from,fl.to,fl.bend);const t=fl.tone||'accent';const pt=ptAt(g,fl.t).p;const tp=ptAt(g,Math.max(0,fl.t-.16)).p;
    let s='<g opacity="'+f(fl.o)+'"><line x1="'+f(tp[0])+'" y1="'+f(tp[1])+'" x2="'+f(pt[0])+'" y2="'+f(pt[1])+'" style="stroke:'+C(t)+'" stroke-width="4" stroke-linecap="round" opacity=".35"/>';
    s+='<circle cx="'+f(pt[0])+'" cy="'+f(pt[1])+'" r="7.5" style="fill:'+C(t)+';stroke:var(--stage)" stroke-width="2.5"/>';
    if(fl.label){const lab=tr(fl.label);const lw=tw8(lab,7.3);const ly=pt[1]-24;s+='<rect x="'+f(pt[0]-lw/2)+'" y="'+f(ly-12)+'" width="'+f(lw)+'" height="21" rx="10.5" style="fill:'+C(t)+'"/><text x="'+f(pt[0])+'" y="'+f(ly+3)+'" text-anchor="middle" class="fl" style="fill:var(--panel)">'+esc(lab)+'</text>';}
    return s+'</g>';}
  /* ---------- operations ---------- */
  const ids=a=>a.filter(x=>typeof x==='string');
  const optOf=a=>{const o=a[a.length-1];return o&&typeof o==='object'&&!Array.isArray(o)?o:{};};
  const rowIdx=(n,sel)=>sel==='all'?n.rows.map((r,i)=>i):(Array.isArray(sel)?sel:[sel]).filter(i=>i>=0&&i<n.rows.length);
  function pulseNow(n){n.ring=0;twNow(n,'ring',1,900,'out');twNow(n,'s',1.05,180,'out');twNow(n,'s',1,320,'inout',180);}
  const OPS={
    show(a,at){const L=ids(a);L.forEach((id,i)=>{const n=N(id),t=at+i*90;tw(n,'o',1,380,t,'out');tw(n,'dy',0,460,t,'out');});return 140+90*L.length;},
    hide(a,at){ids(a).forEach(id=>{tw(N(id),'o',0,320,at);});return 240;},
    drop(a,at){ids(a).forEach(id=>{const n=N(id);if(!ANIM){n.o=0;n.tone='danger';n.strike=1;return;}later(at,()=>{n.tone='danger';n.sh=0;twNow(n,'sh',1,480,'lin');twNow(n,'strike',1,380,'out',300);twNow(n,'o',0,420,'inout',880);});});return 1350;},
    move(a,at){const n=N(a[0]);tw(n,'x',a[1],650,at);tw(n,'y',a[2],650,at);return 560;},
    size(a,at){const n=N(a[0]);if(a[1]!=null)tw(n,'w',a[1],700,at);if(a[2]!=null)tw(n,'h',a[2],700,at);return 620;},
    label(a,at){const n=N(a[0]);later(at,A=>{n.label=a[1];if(a.length>2&&typeof a[2]==='string')n.sub=a[2];if(A)pulseNow(n);});return 300;},
    sub(a,at){const n=N(a[0]);later(at,()=>{n.sub=a[1];});return 220;},
    tone(a,at){const n=N(a[0]);later(at,()=>{n.tone=a[1];});return 220;},
    level(a,at){const n=N(a[0]);tw(n,'level',a[1],900,at);return 820;},
    at(a,at){const n=N(a[0]);tw(n,'at',a[1],720,at);return 760;},
    pulse(a,at){ids(a).forEach(id=>{const n=N(id);later(at,A=>{if(A)pulseNow(n);});});return 320;},
    dim(a,at){ids(a).forEach(id=>tw(N(id),'dim',1,400,at));return 200;},
    undim(a,at){ids(a).forEach(id=>tw(N(id),'dim',0,400,at));return 200;},
    lock(a,at){ids(a).forEach(id=>tw(N(id).b,'lock',1,420,at,'back'));return 420;},
    unlock(a,at){ids(a).forEach(id=>tw(N(id).b,'lock',0,300,at));return 320;},
    x(a,at){ids(a).forEach(id=>tw(N(id).b,'x',1,420,at,'back'));return 420;},
    unx(a,at){ids(a).forEach(id=>tw(N(id).b,'x',0,300,at));return 300;},
    danger(a,at){ids(a).forEach(id=>{const n=N(id);later(at,A=>{n.tone='danger';if(A){n.sh=0;twNow(n,'sh',1,480,'lin');twNow(n.b,'x',1,420,'back');pulseNow(n);}else{n.b.x=1;}});});return 450;},
    ok(a,at){ids(a).forEach(id=>tw(N(id).b,'ok',1,420,at,'back'));return 420;},
    unok(a,at){ids(a).forEach(id=>tw(N(id).b,'ok',0,300,at));return 300;},
    strike(a,at){ids(a).forEach(id=>tw(N(id),'strike',1,420,at,'out'));return 420;},
    unstrike(a,at){ids(a).forEach(id=>tw(N(id),'strike',0,300,at));return 300;},
    link(a,at){const[from,to]=a;const o=optOf(a);NA(from);NA(to);const id=o.id||(from+'>'+to);let l=S.links[id];
      if(!l){l={id,from,to,p:0,o:1,el:null};S.links[id]=l;l.el=document.createElementNS(NS,'g');S.gLinks.appendChild(l.el);}
      Object.assign(l,{from,to,label:o.label,dash:o.dash,tone:o.tone,bend:o.bend,both:o.both,noArrow:o.noArrow,w:o.w});l.o=1;l.p=ANIM?0:l.p;tw(l,'p',1,650,at,'inout');return 560;},
    unlink(a,at){const id=a.length>1&&typeof a[1]==='string'?a[0]+'>'+a[1]:a[0];const l=S.links[id];if(!l)throw new Error('Unknown link '+id+' in '+S.lesson.id);tw(l,'o',0,320,at);return 240;},
    flow(a,at){const[from,to,label]=a;NA(from);NA(to);let o=a[3];if(typeof o==='string')o={tone:o};o=o||{};const dur=o.dur||950;
      if(ANIM)later(at,()=>{const fl={from,to,label,tone:o.tone,bend:o.bend,t:0,o:1};S.flows.push(fl);if(RM){fl.t=1;twNow(fl,'o',0,300,'lin',700);}else{twNow(fl,'t',1,dur,'inout');twNow(fl,'o',0,260,'lin',dur+40);}fl.end=clock+dur+400;});
      return dur+(o.gap!=null?o.gap-dur:80);},
    term(a,at){const n=N(a[0]);const text=a[1];const tone=a[2];const dur=Math.min(1500,text.length*24+120);later(at,A=>{const ln={t:text,n:A?0:text.length,tone};n.lines.push(ln);if(A)twNow(ln,'n',text.length,dur,'lin');});return dur+160;},
    out(a,at){const n=N(a[0]);const lines=a.slice(1).filter(x=>typeof x==='string');const tone=optOf(a).tone;lines.forEach((t,i)=>later(at+i*110,()=>{const autoTone=/^(ORA-|TNS-|SP2-|PLS-|ls:|chmod:|chown:|rm:|bash:|find:|kill:)|(\bERROR\b|FAILURE|Failed password|Active: failed|\[FAIL\]|Permission denied|No such file|Connection refused)/i.test(t)?'err':/(\[OK\]|\[DONE\]|Active: active \(running\)|0% packet loss|"status":"UP")/i.test(t)?'ok':'dim';n.lines.push({t,n:t.length,tone:tone||autoTone});}));return 120+110*lines.length;},
    clear(a,at){const n=N(a[0]);later(at,()=>{n.lines=[];});return 120;},
    /* tables */
    rows(a,at){const n=N(a[0]);const rows=a[1];later(at,A=>{n.rows=rows.map((c,i)=>{const r=mkRow(c,A?0:1);r.y=i;if(A)twNow(r,'o',1,280,'out',i*110);return r;});n.hl=-1;});return 220+110*Math.min(rows.length,10);},
    addrow(a,at){const n=N(a[0]);const o=optOf(a);later(at,A=>{const r=mkRow(a[1],A?0:1);r.y=n.rows.length;if(o.tone){r.tone=o.tone;r.tv=1;}n.rows.push(r);if(A)twNow(r,'o',1,320,'out');});return 380;},
    delrow(a,at){const n=N(a[0]);const sel=a[1];
      if(!ANIM){const set=new Set(rowIdx(n,sel));n.rows=n.rows.filter((r,i)=>!set.has(i));n.rows.forEach((r,i)=>{r.y=i;});n.hl=-1;return 300;}
      later(at,()=>{const set=new Set(rowIdx(n,sel));const doomed=n.rows.filter((r,i)=>set.has(i));doomed.forEach(r=>{r.tone='danger';r.tv=1;twNow(r,'strike',1,320,'out');twNow(r,'o',0,300,'inout',380);});
        timers.push({at:clock+720,fn:()=>{n.rows=n.rows.filter(r=>!doomed.includes(r));n.rows.forEach((r,i)=>{twNow(r,'y',i,360,'inout');});n.hl=-1;}});});return 1100;},
    hl(a,at){const n=N(a[0]);later(at,()=>{n.hl=a[1];});return 300;},
    mark(a,at){const n=N(a[0]);const tone=a[2]===undefined?'accent':a[2];later(at,A=>{rowIdx(n,a[1]).forEach((i,k)=>{const r=n.rows[i];if(tone==null){if(A)twNow(r,'tv',0,250);else r.tv=0;return;}r.tone=tone;if(A){r.tv=0;twNow(r,'tv',1,280,'out',k*90);}else r.tv=1;});});return 260+90*Math.min(rowIdx(n,a[1]).length,8);},
    unmark(a,at){const n=N(a[0]);later(at,A=>{rowIdx(n,a[1]==null?'all':a[1]).forEach(i=>{const r=n.rows[i];if(A)twNow(r,'tv',0,250);else r.tv=0;});});return 260;},
    fade(a,at){const n=N(a[0]);later(at,A=>{rowIdx(n,a[1]).forEach((i,k)=>{const r=n.rows[i];if(A)twNow(r,'dim',1,320,'inout',k*60);else r.dim=1;});});return 320+60*Math.min(rowIdx(n,a[1]).length,8);},
    unfade(a,at){const n=N(a[0]);later(at,A=>{rowIdx(n,a[1]==null?'all':a[1]).forEach(i=>{const r=n.rows[i];if(A)twNow(r,'dim',0,300);else r.dim=0;});});return 300;},
    strikerow(a,at){const n=N(a[0]);later(at,A=>{rowIdx(n,a[1]).forEach(i=>{const r=n.rows[i];if(A)twNow(r,'strike',1,320,'out');else r.strike=1;});});return 340;},
    cell(a,at){const n=N(a[0]);const[ ,ri,ci,v]=a;later(at,A=>{const r=n.rows[ri];if(!r)return;r.c[ci]=v;if(A){r.flash[ci]=1;twNow(r.flash,ci,0,900,'out',150);}});return 380;},
    sort(a,at){const n=N(a[0]);const order=a[1];later(at,A=>{const newRows=order.map(i=>n.rows[i]).filter(Boolean);n.rows.filter(r=>!newRows.includes(r)).forEach(r=>newRows.push(r));
      newRows.forEach((r,i)=>{if(A)twNow(r,'y',i,620,'inout');else r.y=i;});n.rows=newRows;n.hl=-1;});return 700;},
    colhl(a,at){const n=N(a[0]);const sel=Array.isArray(a[1])?a[1]:a[1]==null?[]:[a[1]];later(at,()=>{n.colhl=new Set(sel);if(a[2])n.colTone=a[2];});return 260;},
    cols(a,at){const n=N(a[0]);later(at,A=>{n.cols=a[1].slice();if(a[2])n.cw=a[2].slice();else n.cw=null;n.rows.forEach(r=>{while(r.c.length<n.cols.length)r.c.push(null);});if(A)pulseNow(n);});return 320;},
    addcol(a,at){const n=N(a[0]);const name=a[1],vals=a[2]||[],cw=a[3];later(at,A=>{n.cols.push(name);if(cw)n.cw=cw.slice();else if(n.cw)n.cw.push(n.cw.reduce((x,y)=>x+y,0)/Math.max(1,n.cw.length));
      n.rows.forEach((r,i)=>{r.c.push(vals[i]===undefined?null:vals[i]);});n.newCol=n.cols.length-1;if(A){n.newColP=0;twNow(n,'newColP',1,500,'out');}else n.newColP=1;});return 560;},
    dropcol(a,at){const n=N(a[0]);const ci=a[1];later(at,A=>{n.cols.splice(ci,1);if(n.cw)n.cw.splice(ci,1);n.rows.forEach(r=>r.c.splice(ci,1));n.newCol=-1;if(n.colhl)n.colhl=null;if(A)pulseNow(n);});return 360;},
    /* variables and venn */
    val(a,at){const n=N(a[0]);const o=optOf(a);later(at,A=>{n.val=a[1]==null?'':String(a[1]);if(o.tone)n.tone=o.tone;if(A){n.vflash=1;twNow(n,'vflash',0,700,'out');pulseNow(n);}});return 420;},
    venn(a,at){const n=N(a[0]);const fill=a[1]||'none';later(at,A=>{Object.keys(n.vfade).forEach(k=>{const to=k===fill?1:0;if(A)twNow(n.vfade,k,to,480,'inout');else n.vfade[k]=to;});n.venn=fill;});return 520;},
    items(a,at){const n=N(a[0]);later(at,()=>{n.items=a[1];});return 200;},
    wait(a){return a[0]||400;}
  };
  /* ---------- scene ---------- */
  function build(lesson){
    svg.innerHTML='';
    const grid='<defs><pattern id="gridp" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" style="stroke:var(--grid)" stroke-width="1"/></pattern></defs><rect width="'+W+'" height="'+H+'" fill="url(#gridp)"/>';
    const g0=document.createElementNS(NS,'g');g0.innerHTML=grid+'<text x="20" y="'+(H-14)+'" class="meta">'+esc(String(lesson.meta||('SQL*Plus · '+(lesson.as||'connected as SYSDBA'))).toUpperCase())+'</text><text x="'+(W-20)+'" y="'+(H-14)+'" class="meta" text-anchor="end" data-meta="step"></text>';
    svg.appendChild(g0);
    const gLinks=document.createElementNS(NS,'g'),gNodes=document.createElementNS(NS,'g'),gFlows=document.createElementNS(NS,'g');svg.appendChild(gLinks);svg.appendChild(gNodes);svg.appendChild(gFlows);
    S={lesson,nodes:{},order:[],links:{},flows:[],gLinks,gNodes,gFlows,step:0,stepEnd:0,metaEl:g0.querySelector('[data-meta]')};
    for(const spec of lesson.nodes){const n=mkNode(spec);if(S.nodes[n.id])throw new Error('Duplicate node '+n.id+' in '+lesson.id);n.el=document.createElementNS(NS,'g');n.el.setAttribute('data-node',n.id);gNodes.appendChild(n.el);S.nodes[n.id]=n;S.order.push(n);}
  }
  function reset(){tweens=[];timers=[];for(const spec of S.lesson.nodes){const fresh=mkNode(spec);const n=S.nodes[spec[0]];const el=n.el;Object.assign(n,fresh);n.el=el;}
    for(const id in S.links)S.links[id].el.remove();S.links={};S.flows=[];S.gFlows.innerHTML='';}
  function applyStep(i,animate){const st=S.lesson.steps[i];ANIM=animate;T0=clock;let cur=0;
    for(const op of(st.ops||[])){let name=op[0],par=false;if(name[0]==='&'){par=true;name=name.slice(1);}const fn=OPS[name];if(!fn)throw new Error('Unknown op '+name+' in '+S.lesson.id);const gap=fn(op.slice(1),cur);if(!par)cur+=gap;}
    ANIM=false;return cur;}
  function goStep(k,animate){k=Math.max(0,Math.min(S.lesson.steps.length-1,k));reset();for(let i=0;i<k;i++)applyStep(i,false);const len=applyStep(k,animate);S.step=k;S.stepStart=clock;S.stepEnd=clock+(animate?len:0);dirty=true;return len;}
  function render(){for(const n of S.order)renderNode(n);for(const id in S.links)renderLink(S.links[id]);S.gFlows.innerHTML=S.flows.map(renderFlow).join('');}
  function frame(dt){
    clock+=dt;let changed=false;
    if(timers.length){timers.sort((a,b)=>a.at-b.at);while(timers.length&&timers[0].at<=clock){const tm=timers.shift();tm.fn(true);changed=true;}}
    if(tweens.length){const keep=[];for(const w of tweens){if(clock<w.start){keep.push(w);continue;}if(w.from===undefined)w.from=w.o[w.k];const p=Math.min(1,(clock-w.start)/w.dur);w.o[w.k]=w.from+(w.to-w.from)*w.e(p);if(p<1)keep.push(w);else w.o[w.k]=w.to;}tweens=keep;changed=true;}
    if(S&&S.flows.length){const before=S.flows.length;S.flows=S.flows.filter(fl=>!(fl.end&&clock>fl.end));if(S.flows.length!==before)changed=true;}
    if((changed||dirty)&&S){render();dirty=false;}
    return changed;
  }
  function settle(){/* jump to the end of all running animations (for previews/tests) */let guard=0;while((tweens.length||timers.length)&&guard++<400)frame(100);frame(0);render();}
  return{load(lesson){build(lesson);reset();},goStep,frame,render,settle,get clock(){return clock;},get scene(){return S;},setMeta(t){if(S&&S.metaEl)S.metaEl.textContent=t;},busy(){return tweens.length>0||timers.length>0;},OPS:Object.keys(OPS)};
}
return{create,W,H};
})();
if(typeof module!=='undefined')module.exports=Motion;
