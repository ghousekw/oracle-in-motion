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
  modalWrap.innerHTML = `
    <div class="pmodal" role="dialog" aria-modal="true" aria-labelledby="pmTitle">
      <header class="pmodal-hd">
        <div class="pmodal-user">
          <div class="pmodal-av" id="pmAv">L</div>
          <div>
            <h2 id="pmTitle">Learner</h2>
            <p><span id="pmRole">SQL & PL/SQL Developer</span> <span class="pbadge" id="pmLevel">LVL 1 · 0 XP</span> <span class="pbadge ok" id="pmSyncBadge" hidden>Cloud Synced</span></p>
          </div>
        </div>
        <button class="ibtn" id="pmClose" type="button" aria-label="Band karo" title="Band karo (Esc)">
          <svg viewBox="0 0 16 16"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </header>
      <div class="ptabs" role="tablist" id="pmTabs">
        <button type="button" class="ptab" role="tab" data-ptab="overview" aria-selected="true">Dashboard & Tracking</button>
        <button type="button" class="ptab" role="tab" data-ptab="bookmarks" aria-selected="false">Bookmarks & Notes</button>
        <button type="button" class="ptab" role="tab" data-ptab="certificates" aria-selected="false">Certificates</button>
        <button type="button" class="ptab" role="tab" data-ptab="cloud" aria-selected="false">Profile & Cloud Login</button>
      </div>
      <div class="pbody" id="pmBody"></div>
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
function openProfileModal(tabName){
  activeModalTab = tabName || 'overview';
  $('pModalBack').hidden = false;
  renderModalHeader();
  renderModalTab(activeModalTab);
}
function closeProfileModal(){
  $('pModalBack').hidden = true;
}

function renderModalHeader(){
  const st = calcStats();
  $('pmAv').textContent = getInitials(profile.name);
  $('pmAv').style.background = profile.avatarColor || 'var(--accent)';
  $('pmTitle').textContent = profile.name || 'Learner';
  $('pmRole').textContent = profile.role || 'SQL & PL/SQL Developer';
  $('pmLevel').textContent = 'LVL ' + st.level + ' · ' + st.xp + ' XP';
  const sb = $('pmSyncBadge');
  if(sb){
    sb.hidden = !sbUser;
    if(sbUser) sb.textContent = '☁ ' + (sbUser.email || 'Cloud Synced');
  }
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
    b.setAttribute('aria-selected', b.dataset.ptab === tabName ? 'true' : 'false');
  });
  renderModalHeader();
  const body = $('pmBody');
  const st = calcStats();
  const done = getDoneSet();
  const tasks = getTasksSet();
  const courses = getCoursesList();

  if(tabName === 'overview'){
    const pct = st.totalLessons ? Math.round((st.doneCount / st.totalLessons) * 100) : 0;
    const todayMin = Math.round(st.streak.todaySec / 60);
    const goalMin = profile.goalMin || 20;
    const goalPct = Math.min(100, Math.round((todayMin / goalMin) * 100));

    // Build last 14 days heatmap
    const days14 = [];
    for(let i = 13; i >= 0; i--){
      const dt = new Date(Date.now() - i * 86400000);
      const k = dt.toISOString().slice(0,10);
      const a = activity[k] || { sec: 0, lessons: 0, tasks: 0 };
      const min = Math.round((a.sec || 0) / 60);
      const lv = (min >= 20 || a.lessons >= 2) ? 'l3' : (min >= 5 || a.lessons >= 1 || a.tasks >= 1) ? 'l2' : (a.sec > 0 ? 'l1' : '');
      days14.push({ k, label: k.slice(8,10), min, lessons: a.lessons || 0, lv });
    }

    body.innerHTML = `
      <div class="kpis">
        <div class="kpi">
          <span>Lessons Completed</span>
          <b>${st.doneCount} / ${st.totalLessons}</b>
          <small>${pct}% overall course progress</small>
        </div>
        <div class="kpi">
          <span>Practice Tasks</span>
          <b>${st.tasksCount}</b>
          <small>SQL & PL/SQL queries solved</small>
        </div>
        <div class="kpi">
          <span>Quiz Accuracy</span>
          <b>${st.quizTotal ? Math.round((st.quizRight / st.quizTotal)*100) + '%' : '—'}</b>
          <small>${st.quizRight} / ${st.quizTotal} tests sahi</small>
        </div>
        <div class="kpi">
          <span>Current Streak</span>
          <b>🔥 ${st.streak.current} Din</b>
          <small>Best: ${st.streak.best} din · Total ${st.totalMin} min</small>
        </div>
      </div>

      <div class="pcard">
        <h3><span>Aaj ka Daily Target (${todayMin} / ${goalMin} min)</span><span>${goalPct}%</span></h3>
        <div class="cprog-bar ${goalPct>=100?'done':''}"><i style="width:${goalPct}%"></i></div>
        <div class="heat-row">
          ${days14.map(d => `
            <div class="heat-cell" title="${d.k}: ${d.min} min, ${d.lessons} lessons">
              <div class="heat-box ${d.lv}"></div>
              <span>${d.label}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="pcard">
        <h3><span>Course-wise Tracking</span><span>7 Courses</span></h3>
        <div class="cprog-list">
          ${courses.map(c => {
            const cDone = c.lessons.filter(l => done.has(l.id)).length;
            const cTasksTotal = c.lessons.reduce((acc, l) => acc + ((l.tasks && l.tasks.length) || 0), 0);
            const cTasksDone = c.lessons.reduce((acc, l) => acc + ((l.tasks || []).filter((_, i) => tasks.has(l.id+'#'+i)).length), 0);
            const cQuizDone = c.lessons.filter(l => quizzes[l.id] && quizzes[l.id].ok).length;
            const cp = c.lessons.length ? (cDone / c.lessons.length * 100) : 0;
            const nextL = c.lessons.find(l => !done.has(l.id)) || c.lessons[0];
            return `
              <div class="cprog-item">
                <div class="cprog-top">
                  <b>${esc(c.name)}</b>
                  <span>${cDone}/${c.lessons.length} lessons · ${cTasksDone}/${cTasksTotal} tasks · ${cQuizDone} quizzes</span>
                </div>
                <div class="cprog-bar ${cp>=100?'done':''}"><i style="width:${cp.toFixed(1)}%"></i></div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
                  <small style="color:var(--muted);font-size:12px">${cp>=100 ? '✅ Course Complete!' : 'Agla: ' + esc(nextL.title)}</small>
                  <button type="button" class="lk" data-goto="${esc(nextL.id)}">${cp>=100 ? 'Review karo' : 'Continue →'}</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
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
      <div class="pcard">
        <h3><span>★ Bookmarked Lessons (${bmArr.length})</span></h3>
        ${bmArr.length ? `<div class="bmlist">${bmArr.map(l => `
          <div class="bmitem">
            <div>
              <a href="#${esc(l.id)}" data-close="1">${esc(l.title)}</a>
              <small>${esc(l.c.name)} · ${esc(l.secName)}</small>
            </div>
            <button type="button" class="btn ghost" data-unbm="${esc(l.id)}">Hatao</button>
          </div>
        `).join('')}</div>` : '<p class="note">Abhi koi lesson bookmark nahi kiya hai. Header mein ★ button daba kar mushkil topics save karo.</p>'}
      </div>

      <div class="pcard">
        <h3><span>📝 Tumhare Saved Notes (${noteIds.length})</span></h3>
        ${noteIds.length ? `<div class="bmlist">${noteIds.map(id => {
          const l = oim.byId[id];
          return `
            <div class="bmitem" style="align-items:flex-start;flex-direction:column">
              <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
                <a href="#${esc(l.id)}" data-close="1">${esc(l.title)} <small style="display:inline">(${esc(l.c.name)})</small></a>
                <button type="button" class="lk" data-delnote="${esc(l.id)}">Delete</button>
              </div>
              <pre style="margin:4px 0 0;font:400 13px/1.45 var(--f-body);white-space:pre-wrap;color:var(--ink)">${esc(notes[id])}</pre>
            </div>
          `;
        }).join('')}</div>` : '<p class="note">Kisi bhi lesson ke "Notes" tab mein jaakar apne personal notes likho.</p>'}
      </div>
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
      <div class="pcard">
        <h3><span>Course Completion Certificates</span></h3>
        <p class="note">Jis course ke saare lessons tum poore kar loge, uska official <b>Oracle in Motion</b> certificate apne naam (${esc(profile.name)}) ke saath download/print kar sakte ho.</p>
        <div class="bmlist">
          ${courses.map(c => {
            const cDone = c.lessons.filter(l => done.has(l.id)).length;
            const isComplete = cDone >= c.lessons.length && c.lessons.length > 0;
            const pct = Math.round((cDone / c.lessons.length) * 100);
            return `
              <div class="bmitem">
                <div>
                  <b>${esc(c.name)}</b>
                  <small>${cDone} / ${c.lessons.length} lessons (${pct}%)</small>
                </div>
                ${isComplete
                  ? `<button type="button" class="btn" data-cert="${esc(c.id)}">🎓 Certificate Download</button>`
                  : `<span class="pbadge">${c.lessons.length - cDone} baaki</span>`
                }
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    body.querySelectorAll('[data-cert]').forEach(b => b.addEventListener('click', () => printCertificate(b.dataset.cert)));
  }

  else if(tabName === 'cloud'){
    const colors = ['#B1530A','#2F55B2','#0A7367','#27803E','#6A4BAE','#B0362B'];
    body.innerHTML = `
      <div class="pcard">
        <h3><span>1. Tumhari Profile</span><span>Local + Cloud</span></h3>
        <div class="pform">
          <div class="prow">
            <div class="pfield">
              <label for="pfName">Tumhara Naam (Certificate ke liye)</label>
              <input id="pfName" type="text" value="${esc(profile.name)}" placeholder="Apna naam likho">
            </div>
            <div class="pfield">
              <label for="pfRole">Role / Goal</label>
              <select id="pfRole">
                ${['SQL & PL/SQL Developer','Oracle DBA Trainee','Forms & Reports 12c Dev','Python + Oracle Engineer','Full-Stack Student'].map(r => `<option value="${esc(r)}" ${profile.role===r?'selected':''}>${esc(r)}</option>`).join('')}
              </select>
            </div>
            <div class="pfield">
              <label for="pfGoal">Daily Study Goal (Minutes)</label>
              <input id="pfGoal" type="number" min="5" max="240" step="5" value="${profile.goalMin || 20}">
            </div>
          </div>
          <div class="pfield">
            <label>Avatar Colour</label>
            <div style="display:flex;gap:8px;align-items:center">
              ${colors.map(c => `<button type="button" data-col="${c}" style="width:28px;height:28px;border-radius:50%;background:${c};border:${profile.avatarColor===c?'3px solid var(--ink)':'1px solid var(--line)'}"></button>`).join('')}
            </div>
          </div>
          <div>
            <button type="button" class="btn" id="pfSaveBtn">Profile Save Karo</button>
            <span id="pfSavedMsg" style="margin-left:10px;font-size:13px;color:var(--ok)" hidden>Profile save ho gaya!</span>
          </div>
        </div>
      </div>

      <div class="pcard">
        <h3>
          <span>2. Cloud Account & Cross-Device Sync</span>
          <span class="pbadge ${sbUser?'ok':''}">${sbUser ? '☁ Signed in: ' + esc(sbUser.email) : 'Guest / Local Mode'}</span>
        </h3>
        <p class="note">
          Apna progress cloud par surakshit rakhne aur mobile ya laptop kahin se bhi login karke wahin se shuru karne ke liye Sign In / Sign Up karo.
        </p>

        ${sbUser ? `
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding-top:4px">
            <button type="button" class="btn" id="sbSyncNow">☁ Abhi Cloud Sync Karo</button>
            <button type="button" class="btn ghost" id="sbLogout">Sign Out</button>
            <span class="note" id="sbSyncMsg">${lastSyncAt ? 'Last synced: ' + new Date(lastSyncAt).toLocaleTimeString() : ''}</span>
          </div>
        ` : `
          <div class="pform" style="padding-top:4px">
            <div class="prow">
              <div class="pfield">
                <label for="sbEmail">Email Address</label>
                <input id="sbEmail" type="email" placeholder="tumhara@email.com">
              </div>
              <div class="pfield">
                <label for="sbPass">Password (कम से कम 6 अक्षर)</label>
                <input id="sbPass" type="password" placeholder="••••••••">
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <button type="button" class="btn" id="sbLoginPass">Sign In / Sign Up</button>
              <button type="button" class="btn ghost" id="sbMagicLink">✉ Email Magic Link</button>
            </div>
            <p class="note" id="sbAuthMsg"></p>
          </div>
        `}
      </div>

      <div class="pcard">
        <h3><span>3. Offline Backup (JSON Export / Import)</span></h3>
        <p class="note">Apna poora progress JSON file mein download karke backup rakh sakte ho ya kisi doosre browser mein import kar sakte ho.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button type="button" class="btn ghost" id="bExportJson">⬇ Export Progress JSON</button>
          <label class="btn ghost" style="cursor:pointer">
            ⬆ Import Progress JSON
            <input type="file" id="bImportJson" accept=".json,application/json" hidden>
          </label>
        </div>
      </div>
    `;

    // Profile Save Handlers
    body.querySelectorAll('[data-col]').forEach(b => b.addEventListener('click', () => {
      profile.avatarColor = b.dataset.col;
      renderModalTab('cloud');
    }));
    $('pfSaveBtn').addEventListener('click', () => {
      profile.name = $('pfName').value.trim() || 'Learner';
      profile.role = $('pfRole').value;
      profile.goalMin = Math.max(5, Math.min(240, parseInt($('pfGoal').value, 10) || 20));
      saveAllLocal();
      updateHeaderPill();
      renderModalHeader();
      $('pfSavedMsg').hidden = false;
      scheduleCloudPush();
      setTimeout(() => { if($('pfSavedMsg')) $('pfSavedMsg').hidden = true; }, 2000);
    });

    if(sbUser){
      $('sbSyncNow').addEventListener('click', () => syncWithCloud(true));
      $('sbLogout').addEventListener('click', async () => {
        if(sbClient) await sbClient.auth.signOut();
        sbUser = null;
        updateHeaderPill();
        renderModalTab('cloud');
      });
    } else {
      const msg = $('sbAuthMsg');
      $('sbLoginPass').addEventListener('click', async () => {
        if(!sbClient){ await initSupabase(); }
        if(!sbClient){ msg.textContent = 'Cloud server se connect nahi ho paya.'; return; }
        const email = $('sbEmail').value.trim();
        const password = $('sbPass').value;
        if(!email || !password){ msg.textContent = 'Email aur password dono bharo.'; return; }
        if(password.length < 6){ msg.textContent = 'Password kam se kam 6 characters ka hona chahiye.'; return; }
        msg.textContent = 'Signing in...';
        let res = await sbClient.auth.signInWithPassword({ email, password });
        if(res.error && /Invalid login credentials/i.test(res.error.message)){
          res = await sbClient.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
          if(!res.error){
            if(res.data && res.data.session){
              msg.textContent = 'Account ban gaya aur sign in ho gaya!';
            } else {
              msg.textContent = 'Account ban gaya! Apna email check karke verification link par click karo.';
            }
            return;
          }
        }
        if(res.error) msg.textContent = 'Error: ' + res.error.message;
      });
      $('sbMagicLink').addEventListener('click', async () => {
        if(!sbClient){ await initSupabase(); }
        if(!sbClient){ msg.textContent = 'Cloud server se connect nahi ho paya.'; return; }
        const email = $('sbEmail').value.trim();
        if(!email){ msg.textContent = 'Pehle apna email address likho.'; return; }
        msg.textContent = 'Sending magic link...';
        const { error } = await sbClient.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
        msg.textContent = error ? ('Error: ' + error.message) : 'Magic link bhej diya! Apna email inbox check karo.';
      });
    }

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
  if(remote.profile && remote.profile.name && profile.name === 'Learner'){
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
  const st = oim.state();
  if(st && st.id) oim.load(st.id);
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
let pushTimer = 0;
function scheduleCloudPush(){
  if(!sbClient || !sbUser) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncWithCloud(false), 2500);
}

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

async function initSupabase(){
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  try{
    const sdk = await loadSupabaseSdk();
    sbClient = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data } = await sbClient.auth.getSession();
    sbUser = data && data.session ? data.session.user : null;
    sbClient.auth.onAuthStateChange((_event, session) => {
      sbUser = session ? session.user : null;
      updateHeaderPill();
      if(sbUser) syncWithCloud(false);
      if(!$('pModalBack').hidden && activeModalTab === 'cloud') renderModalTab('cloud');
    });
    if(sbUser) await syncWithCloud(false);
  }catch(e){
    console.warn('Supabase init failed:', e);
  }
}

async function syncWithCloud(manual){
  if(!sbClient || !sbUser) return;
  const msgEl = $('sbSyncMsg');
  if(msgEl) msgEl.textContent = 'Syncing...';
  try{
    const { data, error } = await sbClient
      .from('oim_profiles')
      .select('data')
      .eq('user_id', sbUser.id)
      .maybeSingle();

    if(!error && data && data.data){
      mergePayload(data.data);
    }
    const payload = buildPayload();
    const { error: upErr } = await sbClient
      .from('oim_profiles')
      .upsert({ user_id: sbUser.id, data: payload, updated_at: new Date().toISOString() });

    if(upErr) throw upErr;
    lastSyncAt = Date.now();
    store.set('lastSyncAt', lastSyncAt);
    updateHeaderPill();
    if(msgEl) msgEl.textContent = 'Synced ✓ (' + new Date(lastSyncAt).toLocaleTimeString() + ')';
    if(manual && !$('pModalBack').hidden) renderModalHeader();
  }catch(err){
    if(msgEl) msgEl.textContent = 'Sync error: ' + (err.message || 'Check connection');
  }
}

initUI();
})();
