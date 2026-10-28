/* ===== Oracle in Motion: User Profile, Progress Tracking & Supabase Cloud Sync ===== */
(function(){
'use strict';
const oim = window.__oim;
if(!oim) return;

const $ = id => document.getElementById(id);
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const todayKey = () => new Date().toISOString().slice(0,10);

/* ---------- Built-in Supabase Cloud Configuration ---------- */
const SUPABASE_URL = 'https://hrpgjtatvyktpgkfuzpa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhycGdqdGF0dnlrdHBna2Z1enBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMDMxMzgsImV4cCI6MjEwODc3OTEzOH0.XmhoXWmn4ckRqfo0HFXK__4q9O2bKnkWmxRCoVgobOw';

/* ---------- Storage helpers ---------- */
const store = {
  get(k, d){ try{ const v = localStorage.getItem('oim.'+k); return v==null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem('oim.'+k, JSON.stringify(v)); }catch(e){} }
};

/* ---------- Profile & Tracking State ---------- */
let profile = store.get('profile', {
  name: 'Learner',
  role: 'SQL & PL/SQL Developer',
  goalMin: 20,
  avatarColor: '#B1530A',
  joinedAt: todayKey()
});
let quizzes   = store.get('quizzes', {});     // { [lessonId]: { ans: idx, ok: bool, ts: number } }
let bookmarks = new Set(store.get('bookmarks', []));
let notes     = store.get('notes', {});       // { [lessonId]: string }
let activity  = store.get('activity', {});    // { [YYYY-MM-DD]: { sec: number, lessons: number, tasks: number, quizzes: number } }

let sbClient = null;
let sbUser = null;
let lastSyncAt = store.get('lastSyncAt', null);

function ensureDay(d){
  if(!activity[d]) activity[d] = { sec: 0, lessons: 0, tasks: 0, quizzes: 0 };
  return activity[d];
}

function saveAllLocal(){
  store.set('profile', profile);
  store.set('quizzes', quizzes);
  store.set('bookmarks', [...bookmarks]);
  store.set('notes', notes);
  store.set('activity', activity);
}

/* ---------- Streak & XP Calculation ---------- */
function calcStreak(){
  const days = Object.keys(activity).filter(d => {
    const a = activity[d];
    return a && (a.sec >= 30 || a.lessons > 0 || a.tasks > 0 || a.quizzes > 0);
  }).sort().reverse();
  if(!days.length) return { current: 0, best: 0, todaySec: (activity[todayKey()] && activity[todayKey()].sec) || 0 };

  let best = 0, cur = 0;
  const asc = days.slice().reverse();
  let run = 0, prev = null;
  asc.forEach(d => {
    if(!prev){ run = 1; }
    else {
      const diff = Math.round((new Date(d) - new Date(prev)) / 86400000);
      run = diff === 1 ? run + 1 : 1;
    }
    if(run > best) best = run;
    prev = d;
  });

  const t = todayKey();
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  const activeSet = new Set(days);
  let check = activeSet.has(t) ? t : (activeSet.has(yest) ? yest : null);
  while(check && activeSet.has(check)){
    cur++;
    const dt = new Date(check);
    dt.setUTCDate(dt.getUTCDate() - 1);
    check = dt.toISOString().slice(0,10);
  }
  return { current: cur, best: Math.max(best, cur), todaySec: (activity[t] && activity[t].sec) || 0 };
}

function getDoneSet(){ return new Set(store.get('done', [])); }
function getTasksSet(){ return new Set(store.get('tasks', [])); }

function calcStats(){
  const done = getDoneSet();
  const tasks = getTasksSet();
  const qKeys = Object.keys(quizzes);
  const qRight = qKeys.filter(k => quizzes[k] && quizzes[k].ok).length;
  const totalSec = Object.values(activity).reduce((s, a) => s + (a.sec || 0), 0);
  const xp = (done.size * 50) + (tasks.size * 30) + (qRight * 20) + Math.floor(totalSec / 60) * 2;
  const level = Math.floor(xp / 250) + 1;
  const streak = calcStreak();
  return {
    doneCount: done.size,
    totalLessons: oim.ALL.length,
    tasksCount: tasks.size,
    quizTotal: qKeys.length,
    quizRight: qRight,
    totalMin: Math.round(totalSec / 60),
    xp,
    level,
    streak
  };
}

/* ---------- Active Study Time Tracker ---------- */
setInterval(() => {
  if(document.hidden) return;
  const d = ensureDay(todayKey());
  d.sec = (d.sec || 0) + 5;
  store.set('activity', activity);
  updateHeaderPill();
}, 5000);

/* ---------- Inject UI Elements into Header & Notes ---------- */
function initUI(){
  const top = document.querySelector('header.top');
  const bTheme = $('bTheme');
  if(top && bTheme){
    // Bookmark button for current lesson
    const bmBtn = document.createElement('button');
    bmBtn.className = 'ibtn';
    bmBtn.id = 'bBookmark';
    bmBtn.type = 'button';
    bmBtn.title = 'Is lesson ko bookmark karo';
    bmBtn.setAttribute('aria-label', 'Bookmark lesson');
    bmBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h8a1 1 0 0 1 1 1v10l-5-3-5 3v-10a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    bmBtn.addEventListener('click', toggleBookmark);
    top.insertBefore(bmBtn, bTheme);

    // Profile button in header
    const pBtn = document.createElement('button');
    pBtn.className = 'pbtn';
    pBtn.id = 'bProfile';
    pBtn.type = 'button';
    pBtn.title = 'User Profile & Progress Tracking';
    pBtn.innerHTML = '<span class="av" id="pAv">L</span><span class="pname" id="pName">Learner</span><span class="st" id="pStreak">🔥 0d</span><span class="cdot" id="pCloudDot" title="Cloud Synced"></span>';
    pBtn.addEventListener('click', () => openProfileModal('overview'));
    top.appendChild(pBtn);
  }

  // Add "Notes" tab in right-hand Lesson Notes panel
  const tabs = $('tabs');
  const panels = $('panels');
  if(tabs && panels){
    const nTab = document.createElement('button');
    nTab.className = 'tab';
    nTab.role = 'tab';
    nTab.type = 'button';
    nTab.dataset.tab = 'mynote';
    nTab.id = 't-mynote';
    nTab.textContent = 'Notes';
    tabs.appendChild(nTab);

    const nPanel = document.createElement('div');
    nPanel.className = 'panel';
    nPanel.id = 'p-mynote';
    nPanel.role = 'tabpanel';
    nPanel.setAttribute('aria-labelledby', 't-mynote');
    nPanel.hidden = true;
    nPanel.innerHTML = `
      <div class="note-box">
        <h3>Is lesson par tumhara personal note</h3>
        <p class="note">Apne key points, SQL snippets ya doubts yahan likho. Yeh tumhare profile ke saath auto-save aur cloud sync hota hai.</p>
        <div class="pfield">
          <textarea id="lessonNoteIn" placeholder="Jaise: LEFT JOIN mein right table ke match na milne par NULL aata hai..."></textarea>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="note" id="noteSavedMsg">Auto-saved</span>
          <button type="button" class="btn ghost" id="bOpenAllNotes">Saare notes dekho</button>
        </div>
      </div>
    `;
    panels.appendChild(nPanel);

    const noteIn = $('lessonNoteIn');
    let nTimer = 0;
    noteIn.addEventListener('input', () => {
      const st = oim.state();
      if(!st || !st.id) return;
      const val = noteIn.value;
      if(val.trim()) notes[st.id] = val;
      else delete notes[st.id];
      store.set('notes', notes);
      updateNoteBadge();
      $('noteSavedMsg').textContent = 'Saving...';
      clearTimeout(nTimer);
      nTimer = setTimeout(() => {
        $('noteSavedMsg').textContent = 'Saved ✓';
        scheduleCloudPush();
      }, 500);
    });
    $('bOpenAllNotes').addEventListener('click', () => openProfileModal('bookmarks'));
  }

  // Build Profile Modal
  const modalWrap = document.createElement('div');
  modalWrap.className = 'pmodal-back';
  modalWrap.id = 'pModalBack';
  modalWrap.hidden = true;
  const ico = d => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  modalWrap.innerHTML = `
    <div class="pmodal" role="dialog" aria-modal="true" aria-labelledby="pmTitle">
      <aside class="pm-rail">
        <div class="pm-id">
          <div class="pmodal-av" id="pmAv">L</div>
          <div class="pm-id-txt">
            <h2 id="pmTitle">Learner</h2>
            <p id="pmRole">SQL & PL/SQL Developer</p>
          </div>
        </div>
        <div class="pm-level">
          <div class="pm-level-top"><b id="pmLevel">Level 1</b><span id="pmXp">0 / 250 XP</span></div>
          <div class="pm-meter"><i id="pmXpBar"></i></div>
          <small id="pmXpNext"></small>
        </div>
        <nav class="ptabs" role="tablist" id="pmTabs" aria-orientation="vertical" aria-label="Profile sections">
          <button type="button" class="ptab" role="tab" data-ptab="overview" aria-selected="true">${ico('M2.5 13.5h11M4 11V8M7 11V4.5M10 11V6.5M13 11V3')}Progress</button>
          <button type="button" class="ptab" role="tab" data-ptab="bookmarks" aria-selected="false">${ico('M4 2.5h8a1 1 0 0 1 1 1v10l-5-3-5 3v-10a1 1 0 0 1 1-1z')}Bookmarks & notes<span class="ct" id="pmSavedCt"></span></button>
          <button type="button" class="ptab" role="tab" data-ptab="certificates" aria-selected="false">${ico('M8 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5.8 8.6 5 14l3-1.6 3 1.6-.8-5.4')}Certificates<span class="ct" id="pmCertCt"></span></button>
          <button type="button" class="ptab" role="tab" data-ptab="cloud" aria-selected="false">${ico('M8 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 13.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4')}Account</button>
        </nav>
        <p class="pm-sync" id="pmSyncBadge"><span class="dot"></span><span id="pmSyncTxt">Sirf is browser mein saved</span></p>
      </aside>
      <section class="pm-main">
        <header class="pm-main-hd">
          <h3 id="pmTabTitle">Progress</h3>
          <button class="ibtn" id="pmClose" type="button" aria-label="Band karo" title="Band karo (Esc)">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </header>
        <div class="pbody" id="pmBody" role="tabpanel" aria-labelledby="pmTabTitle"></div>
      </section>
    </div>
  `;
  document.body.appendChild(modalWrap);

  $('pmClose').addEventListener('click', closeProfileModal);
  modalWrap.addEventListener('click', e => { if(e.target === modalWrap) closeProfileModal(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && !modalWrap.hidden) closeProfileModal(); });
  $('pmTabs').addEventListener('click', e => {
    const b = e.target.closest('.ptab');
    if(!b) return;
    renderModalTab(b.dataset.ptab);
  });
  $('pmTabs').addEventListener('keydown', e => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if(!step) return;
    e.preventDefault();
    const tabs = [...$('pmTabs').querySelectorAll('.ptab')];
    const i = tabs.findIndex(b => b.dataset.ptab === activeModalTab);
    const next = tabs[(i + step + tabs.length) % tabs.length];
    renderModalTab(next.dataset.ptab);
    next.focus();
  });

  // Hook into Quiz (`Test` tab) clicks to record quiz score
  const checkA = $('checkA');
  if(checkA){
    checkA.addEventListener('click', e => {
      const opt = e.target.closest('.opt');
      if(!opt) return;
      const st = oim.state();
      const l = st && oim.byId[st.id];
      if(!l || !l.check) return;
      const chosen = +opt.dataset.i;
      const isOk = chosen === l.check.c;
      const prev = quizzes[l.id];
      quizzes[l.id] = { ans: chosen, ok: isOk, ts: Date.now() };
      store.set('quizzes', quizzes);
      if(!prev){
        const d = ensureDay(todayKey());
        d.quizzes = (d.quizzes || 0) + 1;
        store.set('activity', activity);
      }
      updateHeaderPill();
      scheduleCloudPush();
    });
  }

  // Intercept localStorage.setItem for `oim.done` and `oim.tasks` to track daily activity & trigger cloud sync
  const origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(k, v){
    const prevDone = k === 'oim.done' ? getDoneSet().size : 0;
    const prevTasks = k === 'oim.tasks' ? getTasksSet().size : 0;
    origSetItem(k, v);
    if(k === 'oim.done'){
      const nowDone = getDoneSet().size;
      if(nowDone > prevDone){
        const d = ensureDay(todayKey());
        d.lessons = (d.lessons || 0) + (nowDone - prevDone);
        origSetItem('oim.activity', JSON.stringify(activity));
      }
      updateHeaderPill();
      scheduleCloudPush();
    } else if(k === 'oim.tasks'){
      const nowTasks = getTasksSet().size;
      if(nowTasks > prevTasks){
        const d = ensureDay(todayKey());
        d.tasks = (d.tasks || 0) + (nowTasks - prevTasks);
        origSetItem('oim.activity', JSON.stringify(activity));
      }
      updateHeaderPill();
      scheduleCloudPush();
    } else if(k === 'oim.last'){
      setTimeout(onLessonSwitched, 20);
    }
  };

  onLessonSwitched();
  updateHeaderPill();
  initSupabase();
}

function getInitials(name){
  const parts = String(name || 'Learner').trim().split(/\s+/);
  return (parts[0] ? parts[0][0] : 'L') + (parts[1] ? parts[1][0] : '');
}

function updateHeaderPill(){
  const st = calcStats();
  const av = $('pAv');
  const nm = $('pName');
  const sr = $('pStreak');
  const bBtn = $('bProfile');
  if(av){ av.textContent = getInitials(profile.name); av.style.background = profile.avatarColor || 'var(--accent)'; }
  if(nm) nm.textContent = profile.name || 'Learner';
  if(sr) sr.textContent = '🔥 ' + st.streak.current + 'd · ' + st.xp + ' XP';
  if(bBtn) bBtn.classList.toggle('synced', !!sbUser);
  decorateSidebarBookmarks();
}

function updateNoteBadge(){
  const st = oim.state();
  const b = $('t-mynote');
  if(!b || !st) return;
  const old = b.querySelector('.bd');
  if(old) old.remove();
  if(notes[st.id] && notes[st.id].trim()){
    b.insertAdjacentHTML('beforeend', '<span class="bd">1</span>');
  }
}

function onLessonSwitched(){
  const st = oim.state();
  if(!st || !st.id) return;
  const bmBtn = $('bBookmark');
  if(bmBtn){
    const isBm = bookmarks.has(st.id);
    bmBtn.classList.toggle('bookmarked', isBm);
    bmBtn.title = isBm ? 'Bookmark hatao' : 'Is lesson ko bookmark karo';
    bmBtn.querySelector('path').setAttribute('fill', isBm ? 'currentColor' : 'none');
  }
  const noteIn = $('lessonNoteIn');
  if(noteIn){
    noteIn.value = notes[st.id] || '';
    $('noteSavedMsg').textContent = notes[st.id] ? 'Saved ✓' : 'Auto-saved';
  }
  updateNoteBadge();
  // Restore saved quiz answer if already answered
  const l = oim.byId[st.id];
  const qSaved = quizzes[st.id];
  if(l && l.check && qSaved != null){
    const checkA = $('checkA');
    const why = $('checkWhy');
    if(checkA && why){
      const opts = checkA.querySelectorAll('.opt');
      if(opts.length){
        opts.forEach(x => {
          x.disabled = true;
          const j = +x.dataset.i;
          if(j === l.check.c) x.classList.add('right');
          else if(j === qSaved.ans) x.classList.add('wrong');
        });
        why.innerHTML = '<b>' + (qSaved.ok ? 'Sahi jawab!' : 'Galat, koi baat nahi.') + '</b> ' + esc(l.check.why).replace(/`([^`]+)`/g,'<code>$1</code>');
        why.hidden = false;
      }
    }
  }
  decorateSidebarBookmarks();
}

function toggleBookmark(){
  const st = oim.state();
  if(!st || !st.id) return;
  if(bookmarks.has(st.id)) bookmarks.delete(st.id);
  else bookmarks.add(st.id);
  store.set('bookmarks', [...bookmarks]);
  onLessonSwitched();
  scheduleCloudPush();
}

function decorateSidebarBookmarks(){
  const nav = $('nav');
  if(!nav) return;
  nav.querySelectorAll('a[data-id]').forEach(a => {
    const id = a.dataset.id;
    let dot = a.querySelector('.bm-dot');
    if(bookmarks.has(id)){
      if(!dot){
        dot = document.createElement('span');
        dot.className = 'bm-dot';
        dot.textContent = '★ ';
        const titleSpan = a.children[1];
        if(titleSpan) titleSpan.prepend(dot);
      }
    } else if(dot){
      dot.remove();
    }
  });
}

/* ---------- Modal Rendering ---------- */
let activeModalTab = 'overview';
let modalReturnFocus = null;
const TAB_TITLES = { overview: 'Progress', bookmarks: 'Bookmarks aur notes', certificates: 'Certificates', cloud: 'Profile aur account' };

function openProfileModal(tabName){
  activeModalTab = tabName || 'overview';
  modalReturnFocus = document.activeElement;
  $('pModalBack').hidden = false;
  renderModalTab(activeModalTab);
  const sel = document.querySelector('#pmTabs .ptab[aria-selected="true"]');
  if(sel) sel.focus();
}
function closeProfileModal(){
  $('pModalBack').hidden = true;
  if(modalReturnFocus && modalReturnFocus.focus) modalReturnFocus.focus();
}

function courseCounts(c, done){
  const cDone = c.lessons.filter(l => done.has(l.id)).length;
  return { cDone, total: c.lessons.length, pct: c.lessons.length ? cDone / c.lessons.length * 100 : 0 };
}

function renderModalHeader(){
  const st = calcStats();
  const done = getDoneSet();
  const lvFloor = (st.level - 1) * 250, lvCeil = st.level * 250;
  $('pmAv').textContent = getInitials(profile.name);
  $('pmAv').style.background = profile.avatarColor || 'var(--accent)';
  $('pmTitle').textContent = profile.name || 'Learner';
  $('pmRole').textContent = profile.role || 'SQL & PL/SQL Developer';
  $('pmLevel').textContent = 'Level ' + st.level;
  $('pmXp').textContent = st.xp + ' / ' + lvCeil + ' XP';
  $('pmXpBar').style.width = ((st.xp - lvFloor) / 250 * 100).toFixed(1) + '%';
  $('pmXpNext').textContent = (lvCeil - st.xp) + ' XP aur, phir Level ' + (st.level + 1);
  const saved = bookmarks.size + Object.keys(notes).filter(id => notes[id] && notes[id].trim()).length;
  $('pmSavedCt').textContent = saved || '';
  const certs = getCoursesList().filter(c => { const k = courseCounts(c, done); return k.total && k.cDone >= k.total; }).length;
  $('pmCertCt').textContent = certs || '';
  const sb = $('pmSyncBadge');
  sb.classList.toggle('on', !!sbUser);
  $('pmSyncTxt').textContent = sbUser ? 'Cloud sync: ' + (sbUser.email || 'on') : 'Sirf is browser mein saved';
  sb.title = sbUser ? (lastSyncAt ? 'Last sync ' + new Date(lastSyncAt).toLocaleTimeString() : '') : 'Account tab se sign in karke cloud sync chalu karo';
}

function getCoursesList(){
  const map = new Map();
  oim.ALL.forEach(l => {
    if(l.c && !map.has(l.c.id)) map.set(l.c.id, l.c);
  });
  return [...map.values()];
}

function renderModalTab(tabName){
  activeModalTab = tabName;
  document.querySelectorAll('#pmTabs .ptab').forEach(b => {
    const on = b.dataset.ptab === tabName;
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  });
  $('pmTabTitle').textContent = TAB_TITLES[tabName] || '';
  renderModalHeader();
  const body = $('pmBody');
  body.scrollTop = 0;
  const st = calcStats();
  const done = getDoneSet();
  const tasks = getTasksSet();
  const courses = getCoursesList();

  if(tabName === 'overview'){
    const pct = st.totalLessons ? (st.doneCount / st.totalLessons) * 100 : 0;
    const todayMin = Math.round(st.streak.todaySec / 60);
    const goalMin = profile.goalMin || 20;
    const goalPct = Math.min(100, Math.round((todayMin / goalMin) * 100));
    const tKey = todayKey();

    // Last 14 days activity strip
    const days14 = [];
    for(let i = 13; i >= 0; i--){
      const dt = new Date(Date.now() - i * 86400000);
      const k = dt.toISOString().slice(0,10);
      const a = activity[k] || { sec: 0, lessons: 0, tasks: 0 };
      const min = Math.round((a.sec || 0) / 60);
      const lv = (min >= 20 || a.lessons >= 2) ? 'l3' : (min >= 5 || a.lessons >= 1 || a.tasks >= 1) ? 'l2' : (a.sec > 0 ? 'l1' : '');
      days14.push({ k, wd: dt.toLocaleDateString('en', { weekday: 'narrow' }), dn: +k.slice(8,10), min, lessons: a.lessons || 0, lv, today: k === tKey });
    }

    // Course ruler: one segment per course, sized by lesson count, with cumulative lesson ticks
    let cum = 0;
    const segs = courses.map(c => {
      const k = courseCounts(c, done);
      const s = { c, k, start: cum };
      cum += k.total;
      return s;
    });
    // label a course boundary only when it sits at least 8% away from its labelled neighbours
    const ticks = [];
    segs.forEach(s => {
      const left = s.start / cum * 100;
      const prev = ticks[ticks.length - 1];
      if((!prev || left - prev.left >= 8) && 100 - left >= 8) ticks.push({ at: s.start, left });
    });
    ticks.push({ at: cum, left: 100, end: true });

    body.innerHTML = `
      <section class="pm-hero">
        <div class="pm-hero-num">
          <b>${st.doneCount}</b><span>/ ${st.totalLessons} lessons poore</span>
          <em>${pct < 1 && pct > 0 ? '<1' : Math.round(pct)}%</em>
        </div>
        <div class="pm-ruler" role="img" aria-label="${st.doneCount} of ${st.totalLessons} lessons complete across ${courses.length} courses">
          ${segs.map(s => `<div class="seg ${s.k.pct >= 100 ? 'done' : ''}" style="flex:${s.k.total} 1 0" title="${esc(s.c.name)}: ${s.k.cDone}/${s.k.total}"><i style="width:${s.k.pct.toFixed(1)}%"></i></div>`).join('')}
        </div>
        <div class="pm-scale" aria-hidden="true">
          ${ticks.map(t => `<span class="${t.at === 0 ? 'first' : t.end ? 'last' : ''}" style="left:${t.left.toFixed(2)}%">${t.at}</span>`).join('')}
        </div>
      </section>

      <section class="pm-stats">
        <div class="pm-stat"><span>Practice tasks</span><b>${st.tasksCount}</b><small>queries solve ki</small></div>
        <div class="pm-stat"><span>Quiz</span><b>${st.quizTotal ? Math.round((st.quizRight / st.quizTotal) * 100) + '%' : '0'}</b><small>${st.quizTotal ? st.quizRight + ' of ' + st.quizTotal + ' sahi' : 'abhi koi quiz nahi diya'}</small></div>
        <div class="pm-stat"><span>Streak</span><b>${st.streak.current} din</b><small>best ${st.streak.best} din</small></div>
        <div class="pm-stat"><span>Total padhai</span><b>${st.totalMin >= 60 ? (st.totalMin / 60).toFixed(1) + ' hr' : st.totalMin + ' min'}</b><small>active time</small></div>
      </section>

      <section class="psec">
        <div class="psec-hd"><h4>Aaj ka target</h4><span>Goal Account tab se badlo</span></div>
        <div class="pm-today">
          <div class="pm-goal">
            <p><b>${todayMin}</b> / ${goalMin} min</p>
            <div class="pm-meter ${goalPct >= 100 ? 'done' : ''}"><i style="width:${goalPct}%"></i></div>
            <small>${goalPct >= 100 ? 'Aaj ka target poora ho gaya.' : (goalMin - todayMin) + ' min aur padho'}</small>
          </div>
          <div class="pm-days" aria-label="Pichhle 14 din ki activity">
            ${days14.map(d => `
              <div class="pm-day ${d.today ? 'today' : ''}" title="${d.k}: ${d.min} min, ${d.lessons} lessons">
                <i class="${d.lv}"></i><span>${d.dn}</span>
              </div>`).join('')}
          </div>
        </div>
      </section>

      <section class="psec">
        <div class="psec-hd"><h4>Courses</h4><span>${courses.length} courses</span></div>
        <div class="pm-list">
          ${segs.map(({ c, k }) => {
            const cTasksTotal = c.lessons.reduce((acc, l) => acc + ((l.tasks && l.tasks.length) || 0), 0);
            const cTasksDone = c.lessons.reduce((acc, l) => acc + ((l.tasks || []).filter((_, i) => tasks.has(l.id+'#'+i)).length), 0);
            const complete = k.pct >= 100;
            const nextL = c.lessons.find(l => !done.has(l.id)) || c.lessons[0];
            const cta = complete ? 'Review karo' : k.cDone ? 'Jaari rakho' : 'Shuru karo';
            return `
              <div class="pm-course">
                <div class="pm-course-name">
                  <b>${esc(c.name)}</b>
                  <small>${complete ? 'Course poora ho gaya' : 'Agla: ' + esc(nextL.title)}</small>
                </div>
                <div class="pm-course-prog">
                  <div class="pm-meter ${complete ? 'done' : ''}"><i style="width:${k.pct.toFixed(1)}%"></i></div>
                  <small>${k.cDone}/${k.total} lessons, ${cTasksDone}/${cTasksTotal} tasks</small>
                </div>
                <button type="button" class="btn ${k.cDone && !complete ? '' : 'ghost'}" data-goto="${esc(nextL.id)}">${cta}</button>
              </div>`;
          }).join('')}
        </div>
      </section>
    `;
    body.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => {
      location.hash = b.dataset.goto;
      closeProfileModal();
    }));
  }

  else if(tabName === 'bookmarks'){
    const bmArr = [...bookmarks].map(id => oim.byId[id]).filter(Boolean);
    const noteIds = Object.keys(notes).filter(id => notes[id] && notes[id].trim() && oim.byId[id]);

    body.innerHTML = `
      <section class="psec">
        <div class="psec-hd"><h4>Bookmarks</h4><span>${bmArr.length} lessons</span></div>
        ${bmArr.length ? `<div class="pm-list">${bmArr.map(l => `
          <div class="pm-item">
            <div class="pm-item-txt">
              <a href="#${esc(l.id)}" data-close="1">${esc(l.title)}</a>
              <small>${esc(l.c.name)}, ${esc(l.secName)}</small>
            </div>
            <button type="button" class="btn ghost" data-unbm="${esc(l.id)}">Hatao</button>
          </div>
        `).join('')}</div>` : '<p class="pm-empty">Koi bookmark nahi hai. Mushkil lesson par header ka bookmark button dabao, woh yahan aa jayega.</p>'}
      </section>

      <section class="psec">
        <div class="psec-hd"><h4>Notes</h4><span>${noteIds.length} lessons</span></div>
        ${noteIds.length ? `<div class="pm-list">${noteIds.map(id => {
          const l = oim.byId[id];
          return `
            <div class="pm-item pm-note">
              <div class="pm-item-row">
                <div class="pm-item-txt">
                  <a href="#${esc(l.id)}" data-close="1">${esc(l.title)}</a>
                  <small>${esc(l.c.name)}</small>
                </div>
                <button type="button" class="btn ghost" data-delnote="${esc(l.id)}">Delete</button>
              </div>
              <pre>${esc(notes[id])}</pre>
            </div>
          `;
        }).join('')}</div>` : '<p class="pm-empty">Koi note nahi hai. Kisi bhi lesson ke Notes tab mein likho, sab notes yahan ek jagah milenge.</p>'}
      </section>
    `;
    body.querySelectorAll('[data-close]').forEach(a => a.addEventListener('click', closeProfileModal));
    body.querySelectorAll('[data-unbm]').forEach(b => b.addEventListener('click', () => {
      bookmarks.delete(b.dataset.unbm);
      store.set('bookmarks', [...bookmarks]);
      onLessonSwitched();
      renderModalTab('bookmarks');
      scheduleCloudPush();
    }));
    body.querySelectorAll('[data-delnote]').forEach(b => b.addEventListener('click', () => {
      delete notes[b.dataset.delnote];
      store.set('notes', notes);
      onLessonSwitched();
      renderModalTab('bookmarks');
      scheduleCloudPush();
    }));
  }

  else if(tabName === 'certificates'){
    body.innerHTML = `
      <p class="pm-lead">Kisi course ke saare lessons poore karo, phir uska certificate <b>${esc(profile.name)}</b> naam ke saath print ya PDF save kar sakte ho. Naam Account tab se badlo.</p>
      <div class="pm-list">
        ${courses.map(c => {
          const k = courseCounts(c, done);
          const isComplete = k.total > 0 && k.cDone >= k.total;
          return `
            <div class="pm-course pm-cert">
              <div class="pm-course-name">
                <b>${esc(c.name)}</b>
                <small>${isComplete ? 'Certificate taiyaar hai' : (k.total - k.cDone) + ' lessons baaki'}</small>
              </div>
              <div class="pm-course-prog">
                <div class="pm-meter ${isComplete ? 'done' : ''}"><i style="width:${k.pct.toFixed(1)}%"></i></div>
                <small>${k.cDone}/${k.total} lessons</small>
              </div>
              ${isComplete
                ? `<button type="button" class="btn" data-cert="${esc(c.id)}">Certificate kholo</button>`
                : `<button type="button" class="btn ghost" disabled>Locked</button>`}
            </div>
          `;
        }).join('')}
      </div>
    `;
    body.querySelectorAll('[data-cert]').forEach(b => b.addEventListener('click', () => printCertificate(b.dataset.cert)));
  }

  else if(tabName === 'cloud'){
    const colors = ['#B1530A','#2F55B2','#0A7367','#27803E','#6A4BAE','#B0362B'];
    body.innerHTML = `
      <section class="psec">
        <div class="psec-hd"><h4>Profile</h4><span>Certificate par yahi naam chhapega</span></div>
        <div class="pform">
          <div class="prow">
            <div class="pfield">
              <label for="pfName">Naam</label>
              <input id="pfName" type="text" value="${esc(profile.name)}" placeholder="Apna poora naam" autocomplete="name">
            </div>
            <div class="pfield">
              <label for="pfRole">Role ya goal</label>
              <select id="pfRole">
                ${['SQL & PL/SQL Developer','Oracle DBA Trainee','Forms & Reports 12c Dev','Python + Oracle Engineer','Full-Stack Student'].map(r => `<option value="${esc(r)}" ${profile.role===r?'selected':''}>${esc(r)}</option>`).join('')}
              </select>
            </div>
            <div class="pfield">
              <label for="pfGoal">Roz ka target (minutes)</label>
              <input id="pfGoal" type="number" min="5" max="240" step="5" value="${profile.goalMin || 20}">
            </div>
          </div>
          <div class="pfield">
            <span class="pfield-lb" id="pfColLb">Avatar ka rang</span>
            <div class="pm-swatches" role="group" aria-labelledby="pfColLb">
              ${colors.map(c => `<button type="button" class="pm-swatch" data-col="${c}" style="background:${c}" aria-label="${c}" aria-pressed="${profile.avatarColor===c}"></button>`).join('')}
            </div>
          </div>
          <div class="pm-actions">
            <button type="button" class="btn" id="pfSaveBtn">Profile save karo</button>
            <span id="pfSavedMsg" class="pm-ok" role="status" hidden>Profile save ho gaya</span>
          </div>
        </div>
      </section>

      <section class="psec">
        <div class="psec-hd"><h4>Cloud sync</h4><span>${sbUser ? 'Signed in' : 'Abhi sirf is browser mein saved'}</span></div>
        ${authSectionHtml()}
      </section>

      <section class="psec">
        <div class="psec-hd"><h4>Backup</h4><span>JSON file</span></div>
        <p class="pm-lead">Poora progress ek file mein download karo, ya kisi doosre browser ki file yahan import karo.</p>
        <div class="pm-actions">
          <button type="button" class="btn ghost" id="bExportJson">Backup download karo</button>
          <label class="btn ghost pm-file">
            Backup import karo
            <input type="file" id="bImportJson" accept=".json,application/json">
          </label>
        </div>
      </section>
    `;

    // Profile Save Handlers
    body.querySelectorAll('[data-col]').forEach(b => b.addEventListener('click', () => {
      profile.avatarColor = b.dataset.col;
      body.querySelectorAll('[data-col]').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      $('pmAv').style.background = profile.avatarColor;
    }));
    $('pfSaveBtn').addEventListener('click', () => {
      profile.name = $('pfName').value.trim() || 'Learner';
      profile.role = $('pfRole').value;
      profile.goalMin = Math.max(5, Math.min(240, parseInt($('pfGoal').value, 10) || 20));
      profile.updatedAt = Date.now();
      saveAllLocal();
      updateHeaderPill();
      renderModalHeader();
      $('pfSavedMsg').hidden = false;
      scheduleCloudPush();
      setTimeout(() => { if($('pfSavedMsg')) $('pfSavedMsg').hidden = true; }, 2000);
    });

    bindAuth(body);

    // Export / Import JSON
    $('bExportJson').addEventListener('click', exportBackupJson);
    $('bImportJson').addEventListener('change', importBackupJson);
  }
}

/* ---------- Certificate Generator ---------- */
function printCertificate(courseId){
  const courses = getCoursesList();
  const c = courses.find(x => x.id === courseId);
  if(!c) return;
  const w = window.open('', '_blank', 'width=900,height=650');
  if(!w) return;
  const dt = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Certificate - ${esc(c.name)}</title>
  <style>
    body{margin:0;padding:30px;background:#E8ECEF;font-family:'IBM Plex Sans',system-ui,sans-serif;display:grid;place-items:center;min-height:90vh}
    .cert{width:800px;padding:48px 56px;background:#FAFBFC;border:3px solid #121C26;box-shadow:0 12px 40px rgba(0,0,0,.15);position:relative;text-align:center}
    .cert::before{content:"";position:absolute;inset:10px;border:1.5px dashed #B1530A;pointer-events:none}
    .tag{font:700 13px monospace;letter-spacing:.15em;text-transform:uppercase;color:#B1530A}
    h1{font-size:38px;margin:12px 0 6px;color:#121C26;letter-spacing:-.02em}
    .sub{color:#55626E;font-size:16px;margin:0 0 28px}
    .name{font-size:32px;font-weight:800;color:#B1530A;border-bottom:2px solid #C3CCD5;display:inline-block;padding:0 28px 6px;margin:8px 0 20px}
    .course{font-size:24px;font-weight:700;color:#121C26;margin:8px 0}
    .meta{margin-top:38px;display:flex;justify-content:space-between;font-family:monospace;font-size:13px;color:#55626E;border-top:1px solid #C3CCD5;padding-top:16px}
    @media print{body{background:#fff;padding:0}.no-print{display:none}}
  </style></head><body>
  <div>
    <div class="cert">
      <div class="tag">Oracle in Motion · Hinglish Interactive Course</div>
      <h1>Certificate of Completion</h1>
      <p class="sub">Yeh pramanit kiya jaata hai ki</p>
      <div class="name">${esc(profile.name || 'Learner')}</div>
      <p class="sub" style="margin-bottom:8px">ne animated lessons, quizzes aur SQL/PLSQL practice ke saath</p>
      <div class="course">${esc(c.name)} (${c.lessons.length} Lessons)</div>
      <p class="sub" style="margin-top:8px">safaltapoorvak poora kiya hai.</p>
      <div class="meta">
        <span>Date: ${esc(dt)}</span>
        <span>Role: ${esc(profile.role)}</span>
        <span>Oracle in Motion</span>
      </div>
    </div>
    <div class="no-print" style="text-align:center;margin-top:18px">
      <button onclick="window.print()" style="padding:10px 22px;background:#B1530A;color:#fff;border:0;border-radius:8px;font-weight:700;cursor:pointer">🖨 Print / Save as PDF</button>
    </div>
  </div>
  </body></html>`);
  w.document.close();
}

/* ---------- Export / Import JSON ---------- */
function buildPayload(){
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    profile,
    done: [...getDoneSet()],
    tasks: [...getTasksSet()],
    quizzes,
    bookmarks: [...bookmarks],
    notes,
    activity,
    last: store.get('last', null)
  };
}

function mergePayload(remote){
  if(!remote || typeof remote !== 'object') return;
  // Newer profile edit wins; a never-edited local profile always takes the cloud one.
  if(remote.profile && remote.profile.name && (profile.name === 'Learner' || (remote.profile.updatedAt || 0) > (profile.updatedAt || 0))){
    profile = Object.assign({}, profile, remote.profile);
  }
  const done = getDoneSet();
  (remote.done || []).forEach(x => done.add(x));
  store.set('done', [...done]);

  const tasks = getTasksSet();
  (remote.tasks || []).forEach(x => tasks.add(x));
  store.set('tasks', [...tasks]);

  if(remote.quizzes){
    Object.keys(remote.quizzes).forEach(k => {
      if(!quizzes[k] || (remote.quizzes[k].ts || 0) > (quizzes[k].ts || 0)){
        quizzes[k] = remote.quizzes[k];
      }
    });
  }
  (remote.bookmarks || []).forEach(x => bookmarks.add(x));
  if(remote.notes){
    Object.keys(remote.notes).forEach(k => {
      if(!notes[k]) notes[k] = remote.notes[k];
    });
  }
  if(remote.activity){
    Object.keys(remote.activity).forEach(d => {
      const ra = remote.activity[d];
      const la = ensureDay(d);
      la.sec = Math.max(la.sec || 0, ra.sec || 0);
      la.lessons = Math.max(la.lessons || 0, ra.lessons || 0);
      la.tasks = Math.max(la.tasks || 0, ra.tasks || 0);
      la.quizzes = Math.max(la.quizzes || 0, ra.quizzes || 0);
    });
  }
  saveAllLocal();
  if(oim.reloadProgress) oim.reloadProgress();
  onLessonSwitched();
  updateHeaderPill();
}

function exportBackupJson(){
  const data = JSON.stringify(buildPayload(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'oracle-in-motion-progress-' + todayKey() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importBackupJson(e){
  const f = e.target.files && e.target.files[0];
  if(!f) return;
  const r = new FileReader();
  r.onload = () => {
    try{
      const data = JSON.parse(r.result);
      mergePayload(data);
      renderModalTab('cloud');
      alert('Progress safaltapoorvak import ho gaya!');
    }catch(err){
      alert('Invalid JSON file: ' + err.message);
    }
  };
  r.readAsText(f);
}

/* ---------- Supabase Cloud Auth & Sync ---------- */
// Progress lives in per-user tables (see supabase/migrations). A full pull happens on sign-in, page load and
// "Abhi sync karo"; everything else only pushes the rows that changed since the last push.
const authRedirect = () => location.origin + location.pathname;
let authMode = 'signin';   // signin | signup | forgot | reset
let authNotice = '';       // message kept across re-renders of the Account tab
let authSettings = null;   // GET /auth/v1/settings, tells which providers are on
let pushTimer = 0, syncing = false, syncAgain = false;
let remoteKeys = null;     // bookmarks / notes last seen in the cloud, so local removals become deletes
let pushedRows = {};       // table -> { rowKey: json } last pushed

function scheduleCloudPush(){
  if(!sbClient || !sbUser) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncWithCloud(false, true), 2500);
}
setInterval(() => { if(sbUser && !document.hidden) scheduleCloudPush(); }, 60000);
document.addEventListener('visibilitychange', () => { if(document.hidden && sbUser) syncWithCloud(false, true); });

function loadSupabaseSdk(){
  return new Promise((resolve, reject) => {
    if(window.supabase && window.supabase.createClient) return resolve(window.supabase);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    s.onload = () => resolve(window.supabase);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// Links from auth emails come back as #access_token=...&type=signup|recovery|magiclink or #error=...
function readAuthHash(){
  const hp = new URLSearchParams(location.hash.slice(1));
  if(hp.get('error_description') || hp.get('error_code')){
    const code = hp.get('error_code') || '';
    history.replaceState(null, '', location.pathname + location.search);
    return { error: /otp_expired/.test(code)
      ? 'Yeh link expire ho gaya ya pehle use ho chuka hai. Sign in karo, ya naya link mangwao.'
      : 'Login link kaam nahi kiya: ' + (hp.get('error_description') || code) };
  }
  return { type: hp.get('access_token') ? hp.get('type') : null };
}

let sbInitPromise = null;
function initSupabase(){
  if(!sbInitPromise) sbInitPromise = startSupabase();
  return sbInitPromise;
}
async function startSupabase(){
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  const link = readAuthHash();
  if(link.error){ authNotice = link.error; openProfileModal('cloud'); }
  try{
    const sdk = await loadSupabaseSdk();
    sbClient = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true } });
    fetch(SUPABASE_URL + '/auth/v1/settings', { headers: { apikey: SUPABASE_ANON_KEY } })
      .then(r => r.json()).then(j => { authSettings = j; refreshAccountTab(); }).catch(() => {});
    sbClient.auth.onAuthStateChange((event, session) => {
      const wasIn = !!sbUser;
      sbUser = session ? session.user : null;
      if(event === 'PASSWORD_RECOVERY'){
        authMode = 'reset';
        authNotice = '';
        openProfileModal('cloud');
      }
      if(sbUser && !wasIn){
        pushedRows = {};
        remoteKeys = null;
        if(link.type === 'signup'){ authNotice = 'Email confirm ho gaya. Aap signed in ho, progress ab cloud mein save hoga.'; openProfileModal('cloud'); }
        else if(link.type === 'magiclink'){ authNotice = 'Login link se sign in ho gaye.'; }
        link.type = null;
        // supabase-js warns against awaiting its own calls inside this callback
        setTimeout(() => syncWithCloud(false), 0);
      }
      if(!sbUser && wasIn){ pushedRows = {}; remoteKeys = null; authMode = 'signin'; }
      updateHeaderPill();
      refreshAccountTab();
    });
  }catch(e){
    console.warn('Supabase init failed:', e);
  }
}

function refreshAccountTab(){
  const back = $('pModalBack');
  if(!back || back.hidden) return;
  if(activeModalTab === 'cloud') renderModalTab('cloud');
  else renderModalHeader();
}

async function fetchAll(table, col){
  const out = [];
  for(let from = 0; ; from += 1000){
    const { data, error } = await sbClient.from(table).select('*').eq(col, sbUser.id).range(from, from + 999);
    if(error) throw error;
    out.push(...data);
    if(data.length < 1000) return out;
  }
}

async function pullFromCloud(){
  const [prof, lessons, taskRows, quizRows, bmRows, noteRows, actRows] = await Promise.all([
    fetchAll('profiles', 'id'), fetchAll('lesson_progress', 'user_id'), fetchAll('task_progress', 'user_id'),
    fetchAll('quiz_attempts', 'user_id'), fetchAll('bookmarks', 'user_id'), fetchAll('notes', 'user_id'),
    fetchAll('daily_activity', 'user_id')
  ]);
  const p = prof[0];
  mergePayload({
    profile: p ? { name: p.name, role: p.role, goalMin: p.goal_min, avatarColor: p.avatar_color, updatedAt: Date.parse(p.updated_at) } : null,
    done: lessons.map(r => r.lesson_id),
    tasks: taskRows.map(r => r.task_key),
    quizzes: Object.fromEntries(quizRows.map(r => [r.lesson_id, { ans: r.answer, ok: r.correct, ts: Date.parse(r.answered_at) }])),
    bookmarks: bmRows.map(r => r.lesson_id),
    notes: Object.fromEntries(noteRows.map(r => [r.lesson_id, r.body])),
    activity: Object.fromEntries(actRows.map(r => [r.day, { sec: r.seconds, lessons: r.lessons, tasks: r.tasks, quizzes: r.quizzes }]))
  });
  remoteKeys = { bookmarks: new Set(bmRows.map(r => r.lesson_id)), notes: new Set(noteRows.map(r => r.lesson_id)) };
}

function cloudRows(){
  const uid = sbUser.id;
  const noteIds = Object.keys(notes).filter(id => notes[id] && notes[id].trim());
  return {
    profiles: { conflict: 'id', key: r => r.id, rows: [{
      id: uid,
      name: String(profile.name || 'Learner').trim().slice(0, 80) || 'Learner',
      role: String(profile.role || 'SQL & PL/SQL Developer').slice(0, 60),
      goal_min: Math.max(5, Math.min(240, profile.goalMin || 20)),
      avatar_color: /^#[0-9A-Fa-f]{6}$/.test(profile.avatarColor || '') ? profile.avatarColor : '#B1530A'
    }] },
    lesson_progress: { conflict: 'user_id,lesson_id', ignore: true, key: r => r.lesson_id,
      rows: [...getDoneSet()].map(id => ({ user_id: uid, lesson_id: id })) },
    task_progress: { conflict: 'user_id,task_key', ignore: true, key: r => r.task_key,
      rows: [...getTasksSet()].map(k => ({ user_id: uid, task_key: k })) },
    quiz_attempts: { conflict: 'user_id,lesson_id', key: r => r.lesson_id,
      rows: Object.keys(quizzes).filter(k => quizzes[k] && Number.isInteger(quizzes[k].ans)).map(k => ({
        user_id: uid, lesson_id: k, answer: quizzes[k].ans, correct: !!quizzes[k].ok,
        answered_at: new Date(quizzes[k].ts || Date.now()).toISOString() })) },
    bookmarks: { conflict: 'user_id,lesson_id', ignore: true, key: r => r.lesson_id,
      rows: [...bookmarks].map(id => ({ user_id: uid, lesson_id: id })) },
    notes: { conflict: 'user_id,lesson_id', key: r => r.lesson_id,
      rows: noteIds.map(id => ({ user_id: uid, lesson_id: id, body: notes[id].slice(0, 20000), updated_at: new Date().toISOString() })) },
    daily_activity: { conflict: 'user_id,day', key: r => r.day,
      rows: Object.keys(activity).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).map(d => ({
        user_id: uid, day: d, seconds: Math.round(activity[d].sec || 0), lessons: activity[d].lessons || 0,
        tasks: activity[d].tasks || 0, quizzes: activity[d].quizzes || 0 })) }
  };
}

async function pushToCloud(){
  const uid = sbUser.id;
  for(const [table, spec] of Object.entries(cloudRows())){
    const seen = pushedRows[table] || (pushedRows[table] = {});
    // updated_at is volatile, so leave it out of the change check
    const sig = r => JSON.stringify(Object.assign({}, r, { updated_at: undefined }));
    const changed = spec.rows.filter(r => seen[spec.key(r)] !== sig(r));
    if(!changed.length) continue;
    const { error } = await sbClient.from(table).upsert(changed, { onConflict: spec.conflict, ignoreDuplicates: !!spec.ignore });
    if(error) throw error;
    changed.forEach(r => { seen[spec.key(r)] = sig(r); });
  }
  if(remoteKeys){
    const liveNotes = new Set(Object.keys(notes).filter(id => notes[id] && notes[id].trim()));
    for(const [table, live] of [['bookmarks', bookmarks], ['notes', liveNotes]]){
      const gone = [...remoteKeys[table]].filter(id => !live.has(id));
      if(gone.length){
        const { error } = await sbClient.from(table).delete().eq('user_id', uid).in('lesson_id', gone);
        if(error) throw error;
        gone.forEach(id => { if(pushedRows[table]) delete pushedRows[table][id]; });
      }
      remoteKeys[table] = new Set(live);
    }
  }
}

function setSyncMsg(t){ const el = $('sbSyncMsg'); if(el) el.textContent = t; }

async function syncWithCloud(manual, pushOnly){
  if(!sbClient || !sbUser) return;
  if(syncing){ syncAgain = true; return; }
  syncing = true;
  setSyncMsg('Sync ho raha hai...');
  try{
    if(!pushOnly || !remoteKeys) await pullFromCloud();
    await pushToCloud();
    lastSyncAt = Date.now();
    store.set('lastSyncAt', lastSyncAt);
    setSyncMsg('Last sync ' + new Date(lastSyncAt).toLocaleString());
  }catch(err){
    console.warn('Cloud sync failed:', err);
    setSyncMsg('Sync nahi hua: ' + authErrorText(err));
  }finally{
    syncing = false;
  }
  updateHeaderPill();
  if(!$('pModalBack').hidden) renderModalHeader();
  if(manual && !$('pModalBack').hidden && activeModalTab !== 'cloud') renderModalTab(activeModalTab);
  if(syncAgain){ syncAgain = false; scheduleCloudPush(); }
}

/* ---------- Account tab: sign in, sign up, reset ---------- */
function authErrorText(err){
  const m = (err && err.message) || '';
  if(/Invalid login credentials/i.test(m)) return 'Email ya password galat hai. Naye ho to "Account banao" chuno.';
  if(/Email not confirmed/i.test(m)) return 'Email abhi confirm nahi hua. Inbox mein aaya link kholo, ya neeche se link dobara bhejo.';
  if(/already (been )?registered|already exists/i.test(m)) return 'Is email ka account pehle se hai. Sign in karo.';
  if(/rate limit|security purposes|too many/i.test(m)) return 'Thodi der mein bahut koshish ho gayi. Ek minute ruk kar dobara try karo.';
  if(/should be at least|weak|pwned|leaked/i.test(m)) return 'Yeh password kamzor hai. Kam se kam 6 characters ka koi aur password rakho.';
  if(/different from the old|same as/i.test(m)) return 'Naya password purane se alag hona chahiye.';
  if(/Signups not allowed/i.test(m)) return 'Naye account abhi band hain.';
  if(/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Server tak nahi pahunch paye. Internet check karo.';
  if(/relation .* does not exist|schema cache/i.test(m)) return 'Cloud tables abhi bani nahi hain.';
  return m || 'Kuch galat ho gaya. Dobara try karo.';
}

function authField(id, label, type, ac, extra){
  return `<div class="pfield"><label for="${id}">${label}</label><input id="${id}" type="${type}" autocomplete="${ac}" ${extra || ''}></div>`;
}

function authSectionHtml(){
  const notice = authNotice ? `<p class="pm-notice" role="status">${esc(authNotice)}</p>` : '';
  if(sbUser && authMode === 'reset'){
    return `
      ${notice}
      <form class="pform" id="authForm" data-mode="reset" novalidate>
        <p class="pm-lead">Apne account <b>${esc(sbUser.email)}</b> ke liye naya password likho.</p>
        <div class="prow">
          ${authField('sbPass', 'Naya password', 'password', 'new-password', 'minlength="6"')}
          ${authField('sbPass2', 'Password dobara', 'password', 'new-password', 'minlength="6"')}
        </div>
        <div class="pm-actions">
          <button type="submit" class="btn">Password save karo</button>
          <button type="button" class="btn ghost" data-mode-to="signin">Cancel</button>
        </div>
        <p class="pm-msg" id="sbAuthMsg" role="alert"></p>
      </form>`;
  }
  if(sbUser){
    return `
      ${notice}
      <div class="pm-acct">
        <div class="pm-item-txt">
          <b>${esc(sbUser.email)}</b>
          <small id="sbSyncMsg" role="status">${lastSyncAt ? 'Last sync ' + new Date(lastSyncAt).toLocaleString() : 'Abhi sync nahi hua'}</small>
        </div>
        <div class="pm-actions">
          <button type="button" class="btn" id="sbSyncNow">Abhi sync karo</button>
          <button type="button" class="btn ghost" data-mode-to="reset">Password badlo</button>
          <button type="button" class="btn ghost" id="sbLogout">Sign out</button>
        </div>
      </div>`;
  }

  const google = authSettings && authSettings.external && authSettings.external.google;
  const seg = `
    <div class="pm-seg" role="group" aria-label="Sign in ya naya account">
      <button type="button" data-mode-to="signin" aria-pressed="${authMode !== 'signup'}">Sign in</button>
      <button type="button" data-mode-to="signup" aria-pressed="${authMode === 'signup'}">Account banao</button>
    </div>`;
  const googleBtn = google ? `
    <button type="button" class="btn ghost pm-google" id="sbGoogle">
      <svg viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.7H9v3.3h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z"/><path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3z"/><path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.5 1.4l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z"/></svg>
      Google se continue karo
    </button>
    <div class="pm-or"><span>ya email se</span></div>` : '';

  if(authMode === 'forgot'){
    return `
      ${notice}
      <form class="pform" id="authForm" data-mode="forgot" novalidate>
        <p class="pm-lead">Account ka email likho. Hum us par password reset ka link bhejenge.</p>
        ${authField('sbEmail', 'Email', 'email', 'email', 'placeholder="naam@email.com"')}
        <div class="pm-actions">
          <button type="submit" class="btn">Reset link bhejo</button>
          <button type="button" class="btn ghost" data-mode-to="signin">Wapas sign in</button>
        </div>
        <p class="pm-msg" id="sbAuthMsg" role="alert"></p>
      </form>`;
  }
  if(authMode === 'signup'){
    return `
      ${seg}${notice}
      <p class="pm-lead">Account banao to progress, notes aur bookmarks cloud mein save honge, aur phone ya laptop kahin se bhi wahin se shuru kar sakoge.</p>
      ${googleBtn}
      <form class="pform" id="authForm" data-mode="signup" novalidate>
        <div class="prow">
          ${authField('sbName', 'Naam (certificate par chhapega)', 'text', 'name', `value="${esc(profile.name === 'Learner' ? '' : profile.name)}" maxlength="80"`)}
          ${authField('sbEmail', 'Email', 'email', 'email', 'placeholder="naam@email.com"')}
        </div>
        <div class="prow">
          ${authField('sbPass', 'Password (kam se kam 6 characters)', 'password', 'new-password', 'minlength="6"')}
          ${authField('sbPass2', 'Password dobara', 'password', 'new-password', 'minlength="6"')}
        </div>
        <div class="pm-actions"><button type="submit" class="btn">Account banao</button></div>
        <p class="pm-msg" id="sbAuthMsg" role="alert"></p>
      </form>`;
  }
  return `
    ${seg}${notice}
    ${googleBtn}
    <form class="pform" id="authForm" data-mode="signin" novalidate>
      <div class="prow">
        ${authField('sbEmail', 'Email', 'email', 'email', 'placeholder="naam@email.com"')}
        ${authField('sbPass', 'Password', 'password', 'current-password')}
      </div>
      <div class="pm-actions">
        <button type="submit" class="btn">Sign in</button>
        <button type="button" class="lk" data-mode-to="forgot">Password bhool gaye?</button>
        <button type="button" class="lk" id="sbMagicLink">Password ke bina, email par login link bhejo</button>
      </div>
      <p class="pm-msg" id="sbAuthMsg" role="alert"></p>
      <button type="button" class="btn ghost" id="sbResend" hidden>Confirm link dobara bhejo</button>
    </form>`;
}

function bindAuth(body){
  const msg = $('sbAuthMsg');
  const say = (t, ok) => { if(msg){ msg.textContent = t; msg.classList.toggle('ok', !!ok); } };
  const val = id => ($(id) ? $(id).value : '');
  const withClient = async () => { await initSupabase(); if(!sbClient) say('Cloud server se connect nahi ho paya. Internet check karo.'); return !!sbClient; };

  body.querySelectorAll('[data-mode-to]').forEach(b => b.addEventListener('click', () => {
    authMode = b.dataset.modeTo;
    authNotice = '';
    renderModalTab('cloud');
    const first = $('pmBody').querySelector('#authForm input');
    if(first) first.focus();
  }));

  if($('sbSyncNow')) $('sbSyncNow').addEventListener('click', () => syncWithCloud(true));
  if($('sbLogout')) $('sbLogout').addEventListener('click', async () => {
    if(sbClient) await sbClient.auth.signOut();
    sbUser = null;
    authNotice = 'Sign out ho gaye. Progress is browser mein abhi bhi saved hai.';
    updateHeaderPill();
    renderModalTab('cloud');
  });

  if($('sbGoogle')) $('sbGoogle').addEventListener('click', async () => {
    if(!(await withClient())) return;
    const { error } = await sbClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: authRedirect() } });
    if(error) say(authErrorText(error));
  });

  if($('sbMagicLink')) $('sbMagicLink').addEventListener('click', async () => {
    const email = val('sbEmail').trim();
    if(!email){ say('Pehle email likho.'); $('sbEmail').focus(); return; }
    if(!(await withClient())) return;
    say('Link bhej rahe hain...');
    const { error } = await sbClient.auth.signInWithOtp({ email, options: { emailRedirectTo: authRedirect(), shouldCreateUser: false } });
    say(error ? (/not found|Signups not allowed/i.test(error.message) ? 'Is email ka account nahi mila. Pehle "Account banao" se account banao.' : authErrorText(error))
              : 'Login link ' + email + ' par bhej diya. Email kholo aur link par click karo.', !error);
  });

  if($('sbResend')) $('sbResend').addEventListener('click', async () => {
    const email = val('sbEmail').trim();
    if(!(await withClient())) return;
    const { error } = await sbClient.auth.resend({ type: 'signup', email, options: { emailRedirectTo: authRedirect() } });
    say(error ? authErrorText(error) : 'Confirm link ' + email + ' par dobara bhej diya.', !error);
  });

  const form = $('authForm');
  if(!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const mode = form.dataset.mode;
    const email = val('sbEmail').trim();
    const pass = val('sbPass');
    const submit = form.querySelector('[type="submit"]');
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if(mode !== 'reset' && !emailOk){ say('Sahi email likho, jaise naam@email.com.'); $('sbEmail').focus(); return; }
    if(mode === 'signup' && !val('sbName').trim()){ say('Apna naam likho.'); $('sbName').focus(); return; }
    if((mode === 'signin' || mode === 'signup' || mode === 'reset') && pass.length < 6){ say('Password kam se kam 6 characters ka hona chahiye.'); $('sbPass').focus(); return; }
    if((mode === 'signup' || mode === 'reset') && pass !== val('sbPass2')){ say('Dono password ek jaise nahi hain.'); $('sbPass2').focus(); return; }
    if(!(await withClient())) return;

    submit.disabled = true;
    say('Ruko...');
    try{
      if(mode === 'signin'){
        const { error } = await sbClient.auth.signInWithPassword({ email, password: pass });
        if(error){
          say(authErrorText(error));
          if($('sbResend')) $('sbResend').hidden = !/Email not confirmed/i.test(error.message);
        }
        // success re-renders through onAuthStateChange
      }
      else if(mode === 'signup'){
        const name = val('sbName').trim().slice(0, 80);
        const { data, error } = await sbClient.auth.signUp({ email, password: pass, options: { data: { name }, emailRedirectTo: authRedirect() } });
        if(error){ say(authErrorText(error)); return; }
        if(data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0){
          say('Is email ka account pehle se hai. Sign in karo, ya "Password bhool gaye?" se reset karo.');
          return;
        }
        profile.name = name;
        profile.updatedAt = Date.now();
        saveAllLocal();
        updateHeaderPill();
        if(!data.session){
          authMode = 'signin';
          authNotice = 'Confirm link ' + email + ' par bheja hai. Email kholo aur link par click karo, app khud sign in ho jayega.';
          renderModalTab('cloud');
        }
      }
      else if(mode === 'forgot'){
        const { error } = await sbClient.auth.resetPasswordForEmail(email, { redirectTo: authRedirect() });
        if(error){ say(authErrorText(error)); return; }
        authMode = 'signin';
        authNotice = 'Agar ' + email + ' ka account hai to reset link bhej diya hai. Link kholo, app naya password maangega.';
        renderModalTab('cloud');
      }
      else if(mode === 'reset'){
        const { error } = await sbClient.auth.updateUser({ password: pass });
        if(error){ say(authErrorText(error)); return; }
        authMode = 'signin';
        authNotice = 'Password badal gaya.';
        renderModalTab('cloud');
      }
    }finally{
      if(submit.isConnected) submit.disabled = false;
    }
  });
}

initUI();
})();
