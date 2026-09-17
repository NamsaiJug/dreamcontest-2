/* dashboard.js */

/* ==========================================
   STATE
========================================== */
const state = {
  selectedCatId: null,
  selectedQId: null,
  selectedEvtId: null,
  selectedDemographicTags: new Set(),
  filter: 'all',
  sort: 'most_commented',
  searchQuery: '',
  search: '',
  // Data
  categories: {},          // catName -> { questions: [{question_id, question}] }
  questions: {},           // question_id -> { question, category }
  topics: [],              // [{id, question_id, event_id, title, agree, partial, disagree, total}]
  comments: [],            // raw rows
  commentsByTopic: {},     // topic_id -> [comments]
  events: {},              // event_id -> event obj
  topicQuestions: {},      // topic_id -> [{question_id, distance_to_question, distance_to_center}]
  questionTopics: {},      // question_id -> [topic_id]
  topicEvents: {},         // topic_id -> [event_id]
  eventTopics: {},         // event_id -> [topic_id]
  commentEvents: {},       // comment_id -> [event_id]
};

/* ==========================================
   CSV LOADING
========================================== */
function parseCSVText(text) {
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: r => resolve(r.data),
      error: e => reject(e),
    });
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Cannot read ' + file.name));
    reader.readAsText(file, 'UTF-8');
  });
}

async function fetchCSV(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(res.status);
  return res.text();
}

function resetStateData() {
  state.categories = {};
  state.questions = {};
  state.topics = [];
  state.commentsByTopic = {};
  state.commentsByComment = {};
  state.events = {};
  state.topicQuestions = {};
  state.questionTopics = {};
  state.topicEvents = {};
  state.eventTopics = {};
  state.commentEvents = {};
  state.selectedDemographicTags = new Set();
}

async function processAndRender(catText, topicText, topicQText, commentText, eventText, topicEventText, commentEventText) {
  const [cats, topics, topicQs, comments, events, topicEvents, commentEvents] = await Promise.all([
    parseCSVText(catText),
    parseCSVText(topicText),
    parseCSVText(topicQText),
    parseCSVText(commentText),
    parseCSVText(eventText),
    parseCSVText(topicEventText),
    parseCSVText(commentEventText),
  ]);
  resetStateData();
  buildCategories(cats);
  buildTopics(topics, comments, commentEvents);
  buildTopicQuestions(topicQs);
  buildTopicEvents(topicEvents);
  buildEvents(events);
  // Handle URL params BEFORE rendering so filters apply on first render
  const params = new URLSearchParams(window.location.search);
  const urlTopic = params.get('topic');
  const urlCat   = params.get('cat');
  const urlQ     = params.get('q');
  const urlDemo  = params.get('demo');

  const urlEvt  = params.get('evt');

  if (urlCat) {
    const catName = decodeURIComponent(urlCat).trim();
    const allKeys = Object.keys(state.categories);
    const catKey = allKeys.find(k => k.trim() === catName) || catName;
    state.selectedCatId = catKey;
  }
  if (urlQ) {
    state.selectedQId = decodeURIComponent(urlQ).trim();
    state.sort = 'distance_to_question';
  }
  if (urlEvt) {
    state.selectedEvtId = decodeURIComponent(urlEvt).trim();
  }
  if (urlDemo) {
    state.selectedDemographicTags = new Set([decodeURIComponent(urlDemo).trim()]);
  }

  renderSidebar();
  renderTopics();
  // Enforce correct tab panel visibility after render
  const activeTab = (urlDemo || urlEvt)
    ? 'evt'
    : document.getElementById('sidebar-tab-evt')?.classList.contains('active') ? 'evt' : 'cat';
  switchSidebarTab(activeTab);

  if (urlCat || urlQ || urlDemo || urlEvt) {
    updateBreadcrumb();
    updateResetBtn();
  }
  if (urlTopic) openDetail(urlTopic);
}

// On page load: try auto-fetch first, show picker only if it fails
async function loadAll() {
  const area = document.getElementById('topics-area');
  // Show spinner while attempting auto-fetch
  area.innerHTML = `<div class="loading-wrap" style="min-height:300px">
    <div class="spinner"></div>
    <div style="font-size:var(--font-size-sm);color:var(--color-text-muted)">กำลังโหลดข้อมูล...</div>
  </div>`;

  try {
    const [catText, topicText, topicQText, commentText, eventText, topicEventText, commentEventText] = await Promise.all([
      fetchCSV('data/category.csv'),
      fetchCSV('data/topics.csv'),
      fetchCSV('data/topic_question.csv'),
      fetchCSV('data/comments.csv'),
      fetchCSV('data/events.csv'),
      fetchCSV('data/topic_event.csv'),
      fetchCSV('data/comment_event.csv'),
    ]);
    await processAndRender(catText, topicText, topicQText, commentText, eventText, topicEventText, commentEventText);
  } catch (err) {
    showFilePicker();
  }
}

function showFilePicker() {
  const area = document.getElementById('topics-area');
  area.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:var(--space-4);text-align:center">
      <div style="font-size:2rem;opacity:0.35">📂</div>
      <div style="font-weight:500;font-size:var(--font-size-lg);color:var(--color-text)">เลือกไฟล์ข้อมูล CSV</div>
      <div style="font-size:var(--font-size-sm);color:var(--color-text-muted);line-height:1.7;max-width:380px">
        เลือก 4 ไฟล์พร้อมกัน<br>
        <span style="font-family:monospace;font-size:0.8rem;background:var(--color-surface-alt);padding:3px 8px;border-radius:4px;border:1px solid var(--color-border)">category.csv &nbsp;topics.csv &nbsp;topic_question.csv &nbsp;comments.csv &nbsp;events.csv &nbsp;topic_event.csv &nbsp;comment_event.csv</span>
      </div>
      <label style="margin-top:var(--space-2);display:inline-flex;align-items:center;gap:8px;padding:10px 24px;background:var(--color-accent);color:#fff;border-radius:var(--radius-md);cursor:pointer;font-size:var(--font-size-sm);font-family:var(--font-body);transition:opacity 0.15s" onmouseenter="this.style.opacity='.85'" onmouseleave="this.style.opacity='1'">
        เลือกไฟล์
        <input type="file" accept=".csv" multiple style="display:none" onchange="handleFileUpload(this.files)">
      </label>
      <div id="upload-status" style="font-size:var(--font-size-xs);color:var(--color-text-subtle);min-height:18px"></div>
    </div>`;
}

async function handleFileUpload(files) {
  const required = ['category.csv', 'topics.csv', 'topic_question.csv', 'comments.csv', 'events.csv', 'topic_event.csv', 'comment_event.csv'];
  const fileMap = {};
  for (const f of files) {
    const name = f.name.toLowerCase();
    if (name.includes('category'))                                          fileMap['category.csv'] = f;
    if (name.includes('topic_question') || name.includes('topic-question')) fileMap['topic_question.csv'] = f;
    else if (name.includes('topic_event') || name.includes('topic-event'))      fileMap['topic_event.csv'] = f;
    else if (name.includes('topic') && !name.includes('question') && !name.includes('event')) fileMap['topics.csv'] = f;
    if (name.includes('comment_event') || name.includes('comment-event'))       fileMap['comment_event.csv'] = f;
    if (name.includes('comment'))                                           fileMap['comments.csv'] = f;
    if (name.includes('event'))                                             fileMap['events.csv'] = f;
  }

  const missing = required.filter(r => !fileMap[r]);
  const statusEl = document.getElementById('upload-status');

  if (missing.length) {
    statusEl.style.color = 'var(--color-disagree)';
    statusEl.textContent = 'ไม่พบไฟล์: ' + missing.join(', ');
    return;
  }

  statusEl.style.color = 'var(--color-text-subtle)';
  statusEl.textContent = 'กำลังโหลด...';

  try {
    const [catText, topicText, topicQText, commentText, eventText, topicEventText, commentEventText] = await Promise.all(
      required.map(r => readFileAsText(fileMap[r]))
    );
    await processAndRender(catText, topicText, topicQText, commentText, eventText, topicEventText, commentEventText);
  } catch (err) {
    statusEl.style.color = 'var(--color-disagree)';
    statusEl.textContent = 'เกิดข้อผิดพลาด: ' + err.message;
  }
}

function buildCategories(rows) {
  rows.forEach(r => {
    if (!r.question_id || !r.category) return;
    const cat = r.category.trim();
    if (!state.categories[cat]) {
      state.categories[cat] = { questions: [] };
    }
    state.categories[cat].questions.push({ question_id: r.question_id.trim(), question: r.question || '', phrase: r.phrase || '' });
    state.questions[r.question_id.trim()] = { question: r.question || '', category: cat, phrase: r.phrase || '' };
  });
}

function buildTopicQuestions(rows) {
  rows.forEach(r => {
    const tid = (r.id || r.topic_id || '').trim();
    const qid = (r.question_id || '').trim();
    if (!tid || !qid) return;
    const dtq = parseFloat(r.distance_to_question) || 0;
    const dtc = parseFloat(r.distance_to_center) || 0;

    if (!state.topicQuestions[tid]) state.topicQuestions[tid] = [];
    state.topicQuestions[tid].push({ question_id: qid, distance_to_question: dtq, distance_to_center: dtc });

    if (!state.questionTopics[qid]) state.questionTopics[qid] = [];
    if (!state.questionTopics[qid].includes(tid)) state.questionTopics[qid].push(tid);
  });
}


function buildTopicEvents(rows) {
  rows.forEach(r => {
    const tid = (r.topic_id || '').trim();
    const eid = (r.event_id  || '').trim();
    if (!tid || !eid) return;
    if (!state.topicEvents[tid]) state.topicEvents[tid] = [];
    if (!state.topicEvents[tid].includes(eid)) state.topicEvents[tid].push(eid);
    if (!state.eventTopics[eid]) state.eventTopics[eid] = [];
    if (!state.eventTopics[eid].includes(tid)) state.eventTopics[eid].push(tid);
  });
}

function buildTopics(topicRows, commentRows, commentEventRows) {
  const commentsByTopic = {};
  const commentsByComment = {};

  // Build commentEvents index
  if (commentEventRows) {
    commentEventRows.forEach(r => {
      const cid = (r.comment_id || '').trim();
      const eid = (r.event_id  || '').trim();
      if (!cid || !eid) return;
      if (!state.commentEvents[cid]) state.commentEvents[cid] = [];
      if (!state.commentEvents[cid].includes(eid)) state.commentEvents[cid].push(eid);
    });
  }

  commentRows.forEach(c => {
    if (!c.comment_id) return;
    const tid = (c.parent_topic_id  || '').trim();
    const pid = (c.parent_comment_id || '').trim();
    const cid = String(c.comment_id).trim();
    c.comment_id = cid;
    c.parent_topic_id = tid;
    c.parent_comment_id = pid;
    if (pid) {
      if (!commentsByComment[pid]) commentsByComment[pid] = [];
      commentsByComment[pid].push(c);
    } else if (tid) {
      if (!commentsByTopic[tid]) commentsByTopic[tid] = [];
      commentsByTopic[tid].push(c);
    }
  });

  state.commentsByTopic = commentsByTopic;
  state.commentsByComment = commentsByComment;

  topicRows.forEach(t => {
    if (!t.id) return;
    const topicId = String(t.id).trim();
    // Depth-0 only
    const d0Comments = commentsByTopic[topicId] || [];
    let d0agree = 0, d0partial = 0, d0disagree = 0;
    d0Comments.forEach(c => {
      const v = c.comment_view || '';
      if (v === 'เห็นด้วย') d0agree++;
      else if (v === 'เห็นด้วยบางส่วน') d0partial++;
      else if (v === 'ไม่เห็นด้วย') d0disagree++;
    });

    state.topics.push({
      id: topicId,
      title: t.title || '',
      agree: d0agree, partial: d0partial, disagree: d0disagree,
      total: d0agree + d0partial + d0disagree,
    });
  });
}

function flattenComments(topLevelComments, commentsByComment) {
  const all = [];
  function dfs(list) {
    list.forEach(c => {
      all.push(c);
      dfs(commentsByComment[c.comment_id] || []);
    });
  }
  dfs(topLevelComments);
  return all;
}

function buildEvents(rows) {
  rows.forEach(r => {
    if (!r.event_id) return;
    state.events[r.event_id] = r;
  });
}

/* ==========================================
   SIDEBAR RENDERING
========================================== */
function renderSidebar() {
  const catEl = document.getElementById('sidebar-content-cat');
  const evtEl = document.getElementById('sidebar-content-evt');
  if (catEl) catEl.innerHTML = renderCategorySidebar();
  if (evtEl) evtEl.innerHTML = renderEventSidebar();
}

function renderCategorySidebar() {
  const cats = Object.entries(state.categories);
  if (!cats.length) return '<div style="padding:20px;color:var(--color-sidebar-muted);font-size:var(--font-size-xs)">ไม่มีข้อมูลหมวดหมู่</div>';

  // Sort categories by topic count descending, อื่นๆ always last
  cats.sort((a, b) => {
    if (a[0] === 'อื่นๆ') return 1;
    if (b[0] === 'อื่นๆ') return -1;
    const aQIds = a[1].questions.map(q => q.question_id);
    const aTopicIds = new Set(aQIds.flatMap(qid => state.questionTopics[qid] || []));
    const aTopics = aTopicIds.size;
    const bQIds = b[1].questions.map(q => q.question_id);
    const bTopicIds = new Set(bQIds.flatMap(qid => state.questionTopics[qid] || []));
    const bTopics = bTopicIds.size;
    return bTopics - aTopics;
  });

  const totalCats = cats.length;

  // Build result label mirroring category breadcrumb
  let catResultText = '';
  if (state.selectedQId) {
    const qInfo = state.questions[state.selectedQId] || {};
    catResultText = `${qInfo.category || ''} › ${qInfo.phrase || qInfo.question || state.selectedQId}`;
  } else if (state.selectedCatId) {
    catResultText = state.selectedCatId;
  }

  let html = `<div style="padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--color-sidebar-border)">
    <div style="font-size:var(--font-size-sm);font-weight:600;color:var(--color-sidebar-text)">ทั้งหมด ${totalCats} หมวด</div>
    ${catResultText ? `<div style="margin-top:4px;font-size:var(--font-size-xs);color:var(--color-accent);display:flex;align-items:center;gap:var(--space-2)">ผลลัพธ์: ${escHtml(catResultText)} <button onclick="resetCatFilter()" style="background:none;border:none;font-family:var(--font-body);font-size:var(--font-size-xs);color:var(--color-text-muted);cursor:pointer;text-decoration:underline;padding:0;white-space:nowrap">✕ ล้างตัวกรอง</button></div>` : ''}
  </div>`;

  cats.forEach(([catName, catData], idx) => {
    const isOpen = state.selectedCatId === catName || (state.selectedQId && catData.questions.some(q => q.question_id === state.selectedQId));
    const qCount = catData.questions.length;
    // count topics for this category
    const catQIds = catData.questions.map(q => q.question_id);
    const topicCount = new Set(catQIds.flatMap(qid => state.questionTopics[qid] || [])).size;

    html += `<div class="cat-item ${isOpen ? 'open' : ''}" id="cat-${idx}">
      <div class="cat-header ${state.selectedCatId === catName ? 'active' : ''}" onclick="toggleCatItem('cat-${idx}', '${escAttr(catName)}')">
        <span class="cat-chevron">▶</span>
        <span class="cat-name">${escHtml(catName)}</span>
        <span class="cat-count" style="white-space:nowrap">${topicCount} ข้อถกเถียง</span>
      </div>
      <div class="cat-body">
        <div style="font-size:var(--font-size-xs);color:var(--color-sidebar-muted);padding:0 var(--space-3) var(--space-2);line-height:1.4">${qCount} กลุ่มประเด็นถกเถียง สรุปโดย AI</div>
        ${[...catData.questions].sort((a, b) => {
          const ca = (state.questionTopics[a.question_id] || []).length;
          const cb = (state.questionTopics[b.question_id] || []).length;
          return cb - ca;
        }).map((q, qIdx) => {
          const qTopicCount = (state.questionTopics[q.question_id] || []).length;
          return `<div class="q-item ${state.selectedQId === q.question_id ? 'active' : ''}" data-qid="${escAttr(q.question_id)}" onclick="selectQuestion('${escAttr(q.question_id)}', '${escAttr(catName)}')">
            <div class="q-item-text"><span style="margin-right:4px;opacity:0.5">${qIdx + 1}.</span>${escHtml(q.phrase || q.question)}</div>
            <div style="display:flex;justify-content:flex-end;margin-top:4px"><div class="q-item-count">${qTopicCount} ข้อถกเถียง</div></div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  });

  return html;
}

function renderEventSidebar() {
  const evts = Object.values(state.events);
  if (!evts.length) return '<div style="padding:20px;color:var(--color-sidebar-muted);font-size:var(--font-size-xs)">ไม่มีข้อมูลวงสนทนา</div>';

  const totalEvts = evts.length;

  // Collect all unique demographic tags
  const allTags = [...new Set(
    evts.flatMap(e => (e.demographic_tag || '').split(',').map(t => t.trim()).filter(Boolean))
  )].sort();

  // Result label — mirrors event breadcrumb text
  let resultText = '';
  if (state.selectedDemographicTags.size > 0) {
    const tagList = [...state.selectedDemographicTags].join(' | ');
    resultText = `ทุกวงสนทนาที่มี ${tagList}`;
  } else if (state.selectedEvtId) {
    const evt = state.events[state.selectedEvtId] || {};
    resultText = evt.display_name || evt.title_en || state.selectedEvtId;
  }

  // ── Header ──
  let html = `<div style="padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--color-sidebar-border)">
    <div style="font-size:var(--font-size-sm);font-weight:600;color:var(--color-sidebar-text)">ทั้งหมด ${totalEvts} วงสนทนา</div>
    ${resultText ? `<div style="margin-top:4px;font-size:var(--font-size-xs);color:var(--color-accent);display:flex;align-items:center;gap:var(--space-2)">ผลลัพธ์: ${escHtml(resultText)} <button onclick="resetEventFilter()" style="background:none;border:none;font-family:var(--font-body);font-size:var(--font-size-xs);color:var(--color-text-muted);cursor:pointer;text-decoration:underline;padding:0;white-space:nowrap">✕ ล้างตัวกรอง</button></div>` : ''}
  </div>`;

  // ── SECTION 1: by_tag ──
  const tagChips = allTags.map(t => {
    const active = state.selectedDemographicTags.has(t);
    return `<button onclick="toggleDemographicTag('${escAttr(t)}')" style="font-size:0.65rem;padding:2px 8px;border-radius:20px;border:1px solid ${active ? 'var(--color-accent)' : 'var(--color-border-strong)'};background:${active ? 'var(--color-accent)' : 'transparent'};color:${active ? 'white' : 'var(--color-sidebar-muted)'};cursor:pointer;font-family:var(--font-body);transition:all 0.15s;white-space:nowrap">${escHtml(t)}</button>`;
  }).join('');

  html += `<div style="border-bottom:2px solid var(--color-sidebar-border)">
    <div style="padding:var(--space-3) var(--space-4) var(--space-2);font-size:var(--font-size-xs);font-weight:600;color:var(--color-text-subtle);letter-spacing:0.04em;text-transform:uppercase">เลือกจากลักษณะผู้เข้าร่วม</div>
    <div style="padding:0 var(--space-4) var(--space-3);display:flex;flex-wrap:wrap;gap:6px">${tagChips}</div>
  </div>`;

  // ── SECTION 2: by_title ──
  // Filter events by selected tags if any
  const filteredEvts = state.selectedDemographicTags.size > 0
    ? evts.filter(e => {
        const tags = (e.demographic_tag || '').split(',').map(t => t.trim()).filter(Boolean);
        return tags.some(t => state.selectedDemographicTags.has(t));
      })
    : evts;

  // Sort: selected event always first, then by date descending (newest first)
  filteredEvts.sort((a, b) => {
    const aSelected = a.event_id === state.selectedEvtId;
    const bSelected = b.event_id === state.selectedEvtId;
    if (aSelected && !bSelected) return -1;
    if (bSelected && !aSelected) return 1;
    const da = a.date ? new Date(a.date) : new Date(0);
    const db = b.date ? new Date(b.date) : new Date(0);
    return db - da;
  });

  html += `<div>
    <div style="padding:var(--space-3) var(--space-4) var(--space-1);font-size:var(--font-size-xs);font-weight:600;color:var(--color-text-subtle);letter-spacing:0.04em;text-transform:uppercase">เลือกจากวงสนทนา (${filteredEvts.length})</div>
    <div style="padding:0 var(--space-4) var(--space-2);font-size:0.65rem;color:var(--color-text-subtle)">เรียงตามวันที่จัด: ใหม่ไปเก่า</div>`;

  filteredEvts.forEach((evt) => {
    const eid = evt.event_id;
    const domId = `evt-${eid}`;
    const isOpen = state.selectedEvtId === eid;
    const topicCount = (state.eventTopics[eid] || []).length;
    const dateStr = evt.date ? formatThaiDate(evt.date) : '';
    const titleEn = evt.title_en || evt.display_name || eid;
    const loc = evt.location || '';
    const group = evt.target_group || '';
    const participants = evt.participants || '';
    const desc = evt.description || '';
    const newsLink = evt.news_link || '';
    const organizer = evt.organizer || '';
    const eventDetailUrl = evt.event_detail || '';

    const tags = (evt.demographic_tag || '').split(',').map(t => t.trim()).filter(Boolean);
    const tagsHtml = tags.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px">${tags.map(t => `<span style="font-size:0.65rem;padding:1px 7px;border-radius:20px;background:var(--color-accent-light);color:var(--color-accent);font-weight:500;white-space:nowrap">${escHtml(t)}</span>`).join('')}</div>`
      : '';

    html += `<div class="cat-item ${isOpen ? 'open' : ''}" id="${domId}">
      <div class="evt-header ${isOpen ? 'active' : ''}" onclick="toggleEvtItem('${escAttr(domId)}', '${escAttr(eid)}')">
        <div style="display:flex;align-items:flex-start;gap:8px">
          <span class="cat-chevron" style="margin-top:4px;flex-shrink:0">▶</span>
          <div style="flex:1">
            ${dateStr ? `<div style="font-size:var(--font-size-xs);color:var(--color-sidebar-muted);margin-bottom:2px">${dateStr}</div>` : ''}
            <div style="font-size:var(--font-size-sm);color:var(--color-sidebar-text);line-height:1.35">${escHtml(titleEn)}</div>
            ${tagsHtml}
            <div style="display:flex;justify-content:flex-end;margin-top:4px"><span class="q-item-count">${topicCount} ข้อถกเถียง</span></div>
          </div>
        </div>
      </div>
      <div class="evt-body">
        <div class="evt-detail">
          ${loc ? `<div style="margin-bottom:6px"><strong>สถานที่</strong>${escHtml(loc)}</div>` : ''}
          ${group ? `<div style="margin-bottom:6px"><strong>กลุ่มเป้าหมาย</strong>${escHtml(group)}</div>` : ''}
          ${organizer ? `<div style="margin-bottom:6px"><strong>ผู้จัด</strong>${escHtml(organizer)}</div>` : ''}
          ${participants ? `<div style="margin-bottom:6px"><strong>ผู้เข้าร่วม</strong>${escHtml(participants)} คน</div>` : ''}
          ${desc ? `<div style="margin-bottom:6px"><strong>รายละเอียด</strong>${escHtml(desc.substring(0, 200))}${desc.length > 200 ? '...' : ''}</div>` : ''}
          ${newsLink ? `<a class="evt-news-link" href="${escAttr(newsLink)}" target="_blank" rel="noopener">🔗 อ่านข่าวเพิ่มเติม</a>` : ''}
          ${eventDetailUrl ? `<a class="evt-news-link" href="${escAttr(eventDetailUrl)}" target="_blank" rel="noopener" style="display:block;margin-top:4px">📄 เอกสารกำหนดการ ตารางกิจกรรม</a>` : ''}
        </div>
      </div>
    </div>`;
  });

  html += '</div>';
  return html;
}



/* ==========================================
   TOPIC RENDERING
========================================== */
/* ==========================================
   SEARCH
========================================== */

/* ==========================================
   SEARCH
========================================== */

// Normalize Thai text: remove tone marks and some diacritics for lenient matching
function normalizeThai(s) {
  if (!s) return '';
  return s.toLowerCase().replace(/[่้๊๋็์ํ๎]/g, '');
}

function findNormalizedIndex(text, query) {
  return normalizeThai(text).indexOf(normalizeThai(query));
}

function fuzzyMatch(query, target) {
  if (!query) return true;
  return findNormalizedIndex(target, query) !== -1;
}

// Build a search corpus string for a topic (title + all comment reasons + category)
function topicSearchCorpus(topicId) {
  const topicTitle = (state.topics.find(t => t.id === topicId) || {}).title || '';

  // Category from linked questions
  const qLinks = state.topicQuestions[topicId] || [];
  const cats = new Set(qLinks.map(q => (state.questions[q.question_id] || {}).category || ''));
  const catText = [...cats].join(' ');

  // All comment text (flatten full tree)
  const allComments = flattenComments(
    state.commentsByTopic[topicId] || [],
    state.commentsByComment
  );
  const commentText = allComments.map(c => c.reason || '').join(' ');

  return topicTitle + ' ' + catText + ' ' + commentText;
}

let _searchTimer = null;
function onSearchInput() {
  const val = document.getElementById('topic-search').value;
  const btn = document.getElementById('search-commit-btn');
  if (btn) btn.style.display = val.length > 0 ? 'inline-block' : 'none';
  // If field was cleared, reset search immediately
  if (!val.trim() && state.searchQuery) {
    state.searchQuery = '';
    updateResetBtn();
    renderTopics();
  }
}

function commitSearch() {
  const val = (document.getElementById('topic-search').value || '').trim();
  state.searchQuery = val;
  updateResetBtn();
  renderTopics();
}

function handleSearch(value) {
  // Legacy no-op kept for safety
}

function getFilteredTopics() {
  let filtered = [...state.topics];

  // Category filter
  if (state.selectedQId) {
    const topicIds = new Set(state.questionTopics[state.selectedQId] || []);
    filtered = filtered.filter(t => topicIds.has(t.id));
  } else if (state.selectedCatId) {
    const catQIds = (state.categories[state.selectedCatId]?.questions || []).map(q => q.question_id);
    const topicIds = new Set(catQIds.flatMap(qid => state.questionTopics[qid] || []));
    filtered = filtered.filter(t => topicIds.has(t.id));
  }

  // Event filter (applied independently, AND with category)
  if (state.selectedEvtId) {
    const eventTopicIds = new Set(state.eventTopics[state.selectedEvtId] || []);
    filtered = filtered.filter(t => eventTopicIds.has(t.id));
  }

  // Demographic tag filter (applied alongside event filter, OR across tags)
  if (state.selectedDemographicTags.size > 0) {
    const matchingEvtIds = new Set(
      Object.values(state.events)
        .filter(e => {
          const tags = (e.demographic_tag || '').split(',').map(t => t.trim()).filter(Boolean);
          return tags.some(t => state.selectedDemographicTags.has(t));
        })
        .map(e => e.event_id)
    );
    // Topics linked to any matching event
    const matchingTopicIds = new Set(
      [...matchingEvtIds].flatMap(eid => state.eventTopics[eid] || [])
    );
    filtered = filtered.filter(t => matchingTopicIds.has(t.id));
  }
  if (state.searchQuery) {
    filtered = filtered.filter(t => fuzzyMatch(state.searchQuery, topicSearchCorpus(t.id)));
  }

  // Sort
  if (state.sort === 'most_agreed') {
    filtered.sort((a, b) => b.agree - a.agree);
  } else if (state.sort === 'most_disagreed_partial') {
    filtered.sort((a, b) => (b.partial + b.disagree) - (a.partial + a.disagree));
  } else if (state.sort === 'distance_to_question') {
    filtered.sort((a, b) => {
      const getDist = (t) => {
        const links = state.topicQuestions[t.id] || [];
        if (state.selectedQId) {
          const link = links.find(q => q.question_id === state.selectedQId);
          return link ? link.distance_to_question : Infinity;
        }
        return links.length ? Math.min(...links.map(q => q.distance_to_question)) : Infinity;
      };
      return getDist(a) - getDist(b);
    });
  } else {
    // most_commented default
    filtered.sort((a, b) => b.total - a.total);
  }

  return filtered;
}

function renderTopics() {
  const area = document.getElementById('topics-area');
  const filtered = getFilteredTopics();

  // Breadcrumb
  updateBreadcrumb();

  if (!filtered.length) {
    area.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📭</div>
      <div class="empty-title">ไม่พบหัวข้อ</div>
      <div class="empty-sub">ลองเปลี่ยนตัวกรอง</div>
    </div>`;
    return;
  }

  let html = `<div class="topics-stats-bar">
    <div style="display:flex;align-items:center;gap:var(--space-4);flex-wrap:wrap">
      <div class="topics-count">แสดง <strong>${filtered.length}</strong> จากทั้งหมด ${state.topics.length} ข้อถกเถียง</div>
      <div style="display:flex;align-items:center;gap:var(--space-2)">
        <span style="font-size:var(--font-size-xs);color:var(--color-text-muted);white-space:nowrap">เรียงตาม</span>
        <select class="sort-select" onchange="handleSort(this.value)" id="sort-select">        <option value="most_commented" ${state.sort === 'most_commented' ? 'selected' : ''}>จำนวนความคิดเห็น</option>
        <option value="most_agreed" ${state.sort === 'most_agreed' ? 'selected' : ''}>จำนวนเห็นด้วย</option>
        <option value="most_disagreed_partial" ${state.sort === 'most_disagreed_partial' ? 'selected' : ''}>จำนวนเห็นด้วยบางส่วนหรือไม่เห็นด้วย</option>
        ${state.selectedQId ? `<option value="distance_to_question" ${state.sort === 'distance_to_question' ? 'selected' : ''}>ความเกี่ยวข้องกับประเด็นที่เลือก</option>` : ''}
      </select>
        ${state.sort === 'distance_to_question' ? `<span class="evt-info-wrap" data-tooltip-html="${escAttr('<div style=&quot;line-height:1.6&quot;><strong>ความเกี่ยวข้องกับประเด็นที่เลือก</strong><div style=&quot;margin-top:6px;font-size:var(--font-size-xs);color:var(--color-text-muted)&quot;>เป็นการเรียงลำดับโดยพิจารณาจากความหมายที่ใกล้เคียงกันระหว่างข้อความในข้อถกเถียงกับชื่อกลุ่มประเด็น โดยใช้โมเดลคณิตศาสตร์ Agglomerative</div></div>')}" style="display:inline-flex;align-items:center;cursor:default"><span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:var(--color-border-strong);color:var(--color-text-muted);font-size:10px;font-weight:700;user-select:none;transition:background var(--transition)" onmouseenter="this.style.background='var(--color-accent)';this.style.color='white'" onmouseleave="this.style.background='var(--color-border-strong)';this.style.color='var(--color-text-muted)'">?</span></span>` : ''}
      </div>
    </div>
    <div id="topic-legend" style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;font-size:var(--font-size-xs);color:var(--color-text-muted)">
      <span style="display:flex;align-items:center;gap:5px"><span style="display:inline-block;width:15px;height:15px;border-radius:50%;background:var(--color-agree-light);border:1px solid rgba(0,0,0,0.08)"></span>เห็นด้วย</span>
      <span style="display:flex;align-items:center;gap:5px"><span style="display:inline-block;width:15px;height:15px;border-radius:50%;background:var(--color-partial-light);border:1px solid rgba(0,0,0,0.08)"></span>เห็นด้วยบางส่วน</span>
      <span style="display:flex;align-items:center;gap:5px"><span style="display:inline-block;width:15px;height:15px;border-radius:50%;background:var(--color-disagree-light);border:1px solid rgba(0,0,0,0.08)"></span>ไม่เห็นด้วย</span>
      <span style="color:var(--color-text-subtle)">|</span>
      <span style="display:flex;align-items:center;gap:5px"><span style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:transparent;border:1.5px solid rgba(0,0,0,0.35)"><span style="position:absolute;font-size:10px;line-height:1;color:rgba(0,0,0,0.45);font-weight:700">+</span></span>ความคิดเห็นที่มีการต่อยอด</span>
      <span style="color:var(--color-text-subtle)">|</span>
      <button onclick="showHowToRead()" style="background:none;border:none;font-family:var(--font-body);font-size:var(--font-size-xs);color:var(--color-accent);cursor:pointer;padding:0;text-decoration:underline">เกี่ยวกับข้อมูล</button>
    </div>
  </div>
  <div class="topics-list">`;

  filtered.forEach((t, i) => {
    const qLinks = state.topicQuestions[t.id] || [];
    const firstQId = qLinks.length ? qLinks[0].question_id : '';
    const qInfo = state.questions[firstQId] || {};
    const cat = qInfo.category || '';

    // Only count depth-0 (top-level) comments
    const topLevel = state.commentsByTopic[t.id] || [];
    const depth0Total = topLevel.length;

    // Highlight and excerpt logic
    const q = state.searchQuery;
    const titleHtml = q ? highlightMatch(t.title, q) : escHtml(t.title);
    const titleMatches = q ? findNormalizedIndex(t.title, q) !== -1 : false;
    const excerpt = q && !titleMatches ? findExcerpt(t.id, q) : '';

    html += `<div class="topic-card" style="animation-delay:${Math.min(i * 0.03, 0.4)}s" onclick="openDetail('${escAttr(t.id)}')">
      <div class="topic-card-top">
        ${cat ? `<div class="topic-card-tags"><span class="tag tag-category">${escHtml(cat)}</span></div>` : ''}
        <div class="topic-title">${titleHtml}</div>
      </div>
      <div class="topic-card-bottom">
        <div class="total-comments">${depth0Total}<span style="color:#979797"> ความคิดเห็น</span></div>
        ${depth0Total === 0 ? '' : `<div class="circle-bar-wrap">${buildCircleBars(t.id)}</div>`}
        ${excerpt ? `<div style="font-size:var(--font-size-xs);color:var(--color-text-muted);line-height:1.5;margin-top:var(--space-2)">${excerpt}</div>` : ''}
      </div>
    </div>`;
  });

  html += '</div>';
  area.innerHTML = html;
  requestAnimationFrame(() => requestAnimationFrame(layoutMasonry));
}

// Highlight matched keyword in text, returns HTML string
function highlightMatch(text, query) {
  if (!text || !query) return escHtml(text);
  const idx = findNormalizedIndex(text, query);
  if (idx === -1) return escHtml(text);
  const removedRe = /[่้๊๋็์ํ๎]/;
  const normQ = normalizeThai(query);
  let kept = 0, start = -1, end = -1;
  for (let i = 0; i < text.length; i++) {
    if (start === -1 && kept === idx) start = i;
    if (start !== -1 && kept === idx + normQ.length) { end = i; break; }
    if (!removedRe.test(text[i])) kept++;
  }
  if (end === -1) end = text.length;
  if (start === -1) return escHtml(text);
  return escHtml(text.slice(0, start)) +
    '<mark style="background:#E0E0E0;border-radius:2px;padding:0 1px">' +
    escHtml(text.slice(start, end)) + '</mark>' +
    escHtml(text.slice(end));
}

function findExcerpt(topicId, query) {
  if (!query) return '';
  const allComments = flattenComments(
    state.commentsByTopic[topicId] || [],
    state.commentsByComment
  );
  const removedRe = /[่้๊๋็์ํ๎]/;
  for (const c of allComments) {
    const reason = c.reason || '';
    if (!reason) continue;
    const idx = findNormalizedIndex(reason, query);
    if (idx === -1) continue;
    let kept = 0, origStart = 0;
    for (let i = 0; i < reason.length; i++) {
      if (kept === idx) { origStart = i; break; }
      if (!removedRe.test(reason[i])) kept++;
    }
    const PAD = 10;
    const start = Math.max(0, origStart - PAD);
    const end   = Math.min(reason.length, origStart + query.length + PAD);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < reason.length ? '...' : '';
    return prefix + highlightMatch(reason.slice(start, end), query) + suffix;
  }
  return '';
}


function buildCircleBars(topicId) {
  const topLevel = (state.commentsByTopic[String(topicId).trim()] || [])
    .sort((a, b) => sentimentOrder(a) - sentimentOrder(b));

  return topLevel.map(c => {
    const v = c.comment_view || '';
    let color = '#E8E8E8';
    if (v === 'เห็นด้วย')             color = 'var(--color-agree-light)';
    else if (v === 'เห็นด้วยบางส่วน') color = 'var(--color-partial-light)';
    else if (v === 'ไม่เห็นด้วย')     color = 'var(--color-disagree-light)';
    const hasReplies = (state.commentsByComment[String(c.comment_id).trim()] || []).length > 0;
    return `<span style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:${color};border:1px solid rgba(0,0,0,0.10);flex-shrink:0">${hasReplies ? `<span style="position:absolute;font-size:10px;line-height:1;color:rgba(0,0,0,0.45);font-weight:700;pointer-events:none">+</span>` : ''}</span>`;
  }).join('');
}

function getMaxDepth(topicId) {
  let max = 0;
  function walk(comments, depth) {
    if (depth > max) max = depth;
    comments.forEach(c => {
      const children = state.commentsByComment[String(c.comment_id).trim()] || [];
      if (children.length) walk(children, depth + 1);
    });
  }
  walk(state.commentsByTopic[String(topicId).trim()] || [], 0);
  return max;
}

function buildVerticalBars(topicId) {
  const BAR_WIDTH = 15;
  const rows = [];

  function walk(comments, depth) {
    const sorted = [...comments].sort((a, b) => sentimentOrder(a) - sentimentOrder(b));
    sorted.forEach(c => {
      const v = c.comment_view || '';
      let color = '#E8E8E8';
      if (v === 'เห็นด้วย') color = 'var(--color-agree-light)';
      else if (v === 'เห็นด้วยบางส่วน') color = 'var(--color-partial-light)';
      else if (v === 'ไม่เห็นด้วย') color = 'var(--color-disagree-light)';
      rows.push(`<div class="vbar-seg" style="background:${color};margin-left:${depth * BAR_WIDTH / 2}px;width:${BAR_WIDTH}px${depth > 0 ? ';opacity:0.3' : ''}"></div>`);
      const children = state.commentsByComment[String(c.comment_id).trim()] || [];
      if (children.length) walk(children, depth + 1);
    });
  }

  walk(state.commentsByTopic[String(topicId).trim()] || [], 0);
  return rows.length ? rows.join('') : '<div class="vbar-seg" style="background:#E8E8E8;width:15px"></div>';
}

function switchSidebarTab(tab) {
  const catPanel = document.getElementById('sidebar-content-cat');
  const evtPanel = document.getElementById('sidebar-content-evt');
  if (catPanel) catPanel.style.display = tab === 'cat' ? 'block' : 'none';
  if (evtPanel) evtPanel.style.display = tab === 'evt' ? 'block' : 'none';
  document.getElementById('sidebar-tab-cat')?.classList.toggle('active', tab === 'cat');
  document.getElementById('sidebar-tab-evt')?.classList.toggle('active', tab === 'evt');
}

function toggleSidebarPanel(panel) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  // If 'main' just toggle collapse
  sidebar.classList.toggle('collapsed');
  setTimeout(layoutMasonry, 270);
}

function collapseSidebar() { document.getElementById('sidebar')?.classList.add('collapsed'); setTimeout(layoutMasonry, 270); }
function expandSidebar()   { document.getElementById('sidebar')?.classList.remove('collapsed'); setTimeout(layoutMasonry, 270); }
function toggleSidebarFromBreadcrumb(tab) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const collapsed = sidebar.classList.contains('collapsed');
  const currentTab = document.getElementById('sidebar-tab-' + tab)?.classList.contains('active');
  if (collapsed) {
    // Open and switch to requested tab
    sidebar.classList.remove('collapsed');
    switchSidebarTab(tab);
  } else if (currentTab) {
    // Already on this tab and open — collapse
    sidebar.classList.add('collapsed');
  } else {
    // Open but on different tab — just switch tab
    switchSidebarTab(tab);
  }
  setTimeout(layoutMasonry, 270);
}

function toggleSidebarMobile() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('open');
}

function layoutMasonry() {
  const grid = document.querySelector('.topics-list');
  if (!grid) return;

  const isMobile = window.innerWidth <= 768;
  const sidebarCollapsed = document.getElementById('sidebar')?.classList.contains('collapsed');
  const COLS = isMobile ? 1 : sidebarCollapsed ? 4 : 3;
  const GAP = 16;
  const containerWidth = grid.offsetWidth;
  const colWidth = (containerWidth - GAP * (COLS - 1)) / COLS;

  const cards = Array.from(grid.querySelectorAll('.topic-card'));
  if (!cards.length) return;

  // Set all cards to correct width first so heights are accurate
  cards.forEach(c => {
    c.style.width = colWidth + 'px';
    c.style.position = 'absolute';
  });

  // Track bottom of each column
  const colBottoms = new Array(COLS).fill(0);

  // Row-first: process cards in order, place each in the shortest column
  // BUT to maintain row-first feel, we place in pairs (left col then right col)
  cards.forEach((card, i) => {
    const col = i % COLS; // strict row-first: card 0->col0, card 1->col1, card 2->col0 ...
    const x = col * (colWidth + GAP);
    const y = colBottoms[col];

    card.style.left = x + 'px';
    card.style.top = y + 'px';

    colBottoms[col] = y + card.offsetHeight + GAP;
  });

  grid.style.height = Math.max(...colBottoms) - GAP + 'px';
}

function updateBreadcrumb() {
  // Category breadcrumb
  const catEl = document.getElementById('breadcrumb-cat-text');
  if (catEl) {
    if (state.selectedQId) {
      const qInfo = state.questions[state.selectedQId] || {};
      catEl.innerHTML = `<span>${escHtml(qInfo.category || '')}</span><span class="breadcrumb-sep"> › </span><span class="breadcrumb-active">${escHtml(qInfo.phrase || qInfo.question || state.selectedQId)}</span>`;
    } else if (state.selectedCatId) {
      catEl.innerHTML = `<span class="breadcrumb-active">${escHtml(state.selectedCatId)}</span>`;
    } else {
      catEl.textContent = 'ทุกหมวดหมู่';
    }
  }
  // Event breadcrumb
  const evtEl = document.getElementById('breadcrumb-evt-text');
  if (evtEl) {
    if (state.selectedDemographicTags.size > 0) {
      const tagList = [...state.selectedDemographicTags].map(t => escHtml(t)).join(' | ');
      evtEl.innerHTML = `<span style="color:var(--color-text-subtle);font-weight:400">ทุกวงสนทนาที่มี</span> <span class="breadcrumb-active">${tagList}</span>`;
    } else if (state.selectedEvtId) {
      const evt = state.events[state.selectedEvtId] || {};
      evtEl.innerHTML = `<span class="breadcrumb-active">${escHtml(evt.display_name || evt.title_en || state.selectedEvtId)}</span>`;
    } else {
      evtEl.textContent = 'ทุกวงสนทนา';
    }
  }
}

/* ==========================================
   INTERACTIONS
========================================== */

function toggleCatItem(id, catName) {
  const el = document.getElementById(id);
  const wasOpen = el.classList.contains('open');

  // Close all
  document.querySelectorAll('.cat-item').forEach(e => e.classList.remove('open'));
  document.querySelectorAll('.cat-header').forEach(e => e.classList.remove('active'));

  if (!wasOpen) {
    el.classList.add('open');
    el.querySelector('.cat-header').classList.add('active');
    state.selectedCatId = catName;
    state.selectedQId = null;
    if (state.sort === 'distance_to_question') {
      state.sort = 'most_commented';
    }
  } else {
    state.selectedCatId = null;
    state.selectedQId = null;
    if (state.sort === 'distance_to_question') {
      state.sort = 'most_commented';
    }
  }

  // Clear any active q-item in place
  document.querySelectorAll('.q-item').forEach(e => e.classList.remove('active'));
  const sel = document.getElementById('sort-select');
  if (sel) sel.value = state.sort;

  updateBreadcrumb();
  updateResetBtn();
  renderSidebar();
  renderTopics();
}

function selectQuestion(qId, catName) {
  if (state.selectedQId === qId) {
    state.selectedQId = null;
    // Revert to comment sort when deselecting
    if (state.sort === 'distance_to_question') {
      state.sort = 'most_commented';
    }
  } else {
    state.selectedQId = qId;
    state.selectedCatId = catName;
    // Auto-sort by relevance when selecting a question
    state.sort = 'distance_to_question';
  }
  // Update sort dropdown to reflect current sort
  const sel = document.getElementById('sort-select');
  if (sel) sel.value = state.sort;
  updateBreadcrumb();
  updateResetBtn();
  renderSidebar();
  renderTopics();
}

function resetSelection() {
  state.selectedCatId = null;
  state.selectedQId = null;
  state.selectedEvtId = null;
  state.selectedDemographicTags = new Set();
  state.searchQuery = '';
  const searchEl = document.getElementById('topic-search');
  if (searchEl) searchEl.value = '';
  const searchBtn = document.getElementById('search-commit-btn');
  if (searchBtn) searchBtn.style.display = 'none';
  if (state.sort === 'distance_to_question') state.sort = 'most_commented';
  updateResetBtn();
  renderSidebar();
  renderTopics();
}

function updateResetBtn() {
  const btn = document.getElementById('reset-btn');
  if (!btn) return;
  const hasSelection = state.selectedCatId || state.selectedQId || state.selectedEvtId || state.searchQuery || state.selectedDemographicTags.size > 0;
  btn.style.display = hasSelection ? 'inline-flex' : 'none';
}

function toggleEvtItem(id, evtId) {
  const el = document.getElementById(id);
  const wasOpen = el.classList.contains('open');
  document.querySelectorAll('.cat-item').forEach(e => e.classList.remove('open'));
  document.querySelectorAll('.evt-header').forEach(e => e.classList.remove('active'));
  if (!wasOpen) {
    el.classList.add('open');
    el.querySelector('.evt-header').classList.add('active');
    state.selectedEvtId = evtId;
    state.selectedDemographicTags = new Set(); // clear tag filter
  } else {
    state.selectedEvtId = null;
  }
  updateBreadcrumb();
  updateResetBtn();
  renderSidebar();
  renderTopics();
}

function selectCategory(catName) {
  state.selectedCatId = catName;
  state.selectedQId = null;
  updateResetBtn();
  renderSidebar();
  renderTopics();
}

function selectEvent(evtId) {
  state.selectedEvtId = evtId;
  updateResetBtn();
  renderSidebar();
  renderTopics();
}

function handleSort(val) {
  state.sort = val;
  renderTopics();
}

/* ==========================================
   DETAIL PANEL
========================================== */
// Reusable event tooltip component — same markup/fields used at topic level and comment level
function buildEventTooltip(eid, style) {
  const e = state.events[eid];
  if (!e) return '';
  const title = e.display_name || e.title_en || eid;
  const topicCount = (state.eventTopics[eid] || []).length;
  const tooltipRows = [];
  if (e.display_name) tooltipRows.push(`<div class="evt-tooltip-row"><div class="evt-tooltip-label">ชื่อวงสนทนา</div><div>${escHtml(e.display_name)}</div></div>`);
  if (e.title_en)     tooltipRows.push(`<div class="evt-tooltip-row"><div class="evt-tooltip-label">Title (EN)</div><div>${escHtml(e.title_en)}</div></div>`);
  if (e.location)     tooltipRows.push(`<div class="evt-tooltip-row"><div class="evt-tooltip-label">สถานที่</div><div>${escHtml(e.location)}</div></div>`);
  if (e.date)         tooltipRows.push(`<div class="evt-tooltip-row"><div class="evt-tooltip-label">วันที่</div><div>${formatThaiDate(e.date)}</div></div>`);
  if (e.target_group) tooltipRows.push(`<div class="evt-tooltip-row"><div class="evt-tooltip-label">กลุ่มเป้าหมาย</div><div>${escHtml(e.target_group)}</div></div>`);
  if (e.organizer)    tooltipRows.push(`<div class="evt-tooltip-row"><div class="evt-tooltip-label">ผู้จัด</div><div>${escHtml(e.organizer)}</div></div>`);
  if (e.participants) tooltipRows.push(`<div class="evt-tooltip-row"><div class="evt-tooltip-label">ผู้เข้าร่วม</div><div>${escHtml(e.participants)} คน</div></div>`);
  if (e.description)  tooltipRows.push(`<div class="evt-tooltip-row"><div class="evt-tooltip-label">รายละเอียด</div><div>${escHtml(e.description)}</div></div>`);
  if (e.event_detail)  tooltipRows.push(`<div class="evt-tooltip-row"><div class="evt-tooltip-label">เอกสารกำหนดการ ตารางกิจกรรม</div><div><a href="${escAttr(e.event_detail)}" target="_blank" rel="noopener" style="color:var(--color-accent)">🔗 เปิดเอกสาร</a></div></div>`);
  const tooltipHtml = `<div style="font-size:0.6875rem;color:var(--color-text-subtle);margin-bottom:var(--space-3)">คลิกชื่อเพื่อดูข้อถกเถียงทั้งหมดจากวงสนทนานี้ (${topicCount})</div>` + tooltipRows.join('');
  const styleAttr = style ? ` style="${style}"` : '';
  return `<span class="evt-info-wrap"${styleAttr} data-tooltip-html="${escAttr(tooltipHtml)}"><span style="text-decoration:underline;cursor:pointer;color:inherit" onclick="filterByEventFromDetail('${escAttr(eid)}')">${escHtml(title)}</span></span>`;
}

let currentDetailTopicId = null;

function openDetail(topicId) {
  const topic = state.topics.find(t => t.id === topicId);
  if (!topic) return;
  currentDetailTopicId = topicId;

  const qLinks = state.topicQuestions[topic.id] || [];
  const firstQId = qLinks.length ? qLinks[0].question_id : '';
  const qInfo = state.questions[firstQId] || {};
  const topicEventIds = state.topicEvents[topic.id] || [];
  const tot = topic.total;

  // Tags -- category only
  const tags = [];
  if (qInfo.category) tags.push(`<span class="tag tag-category">${escHtml(qInfo.category)}</span>`);
  document.getElementById('detail-tags').innerHTML = tags.join('');
  document.getElementById('detail-title').textContent = topic.title;

  // Event info: "ข้อถกเถียงจาก n วงสนทนา: [title] | [title]"
  const evtTitles = topicEventIds.map(eid => buildEventTooltip(eid)).filter(Boolean);

  const n = evtTitles.length;
  document.getElementById('detail-event-info').innerHTML = n
    ? `<span style="color:var(--color-text-subtle)">ข้อถกเถียงจาก ${n} วงสนทนา:</span> ${evtTitles.join('<span style="color:var(--color-text-subtle);margin:0 4px">|</span>')}`
    : '';

  // Comments
  const topLevelComments = state.commentsByTopic[topicId] || [];
  document.getElementById('comments-tree').innerHTML = renderCommentTree(topLevelComments, 0);

  document.getElementById('detail-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => requestAnimationFrame(drawConnectors));
  const cs = document.getElementById('comments-section');
  cs.onscroll = () => requestAnimationFrame(drawConnectors);
}

function closeDetail() {
  document.getElementById('detail-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function resetCatFilter() {
  state.selectedCatId = null;
  state.selectedQId = null;
  if (state.sort === 'distance_to_question') state.sort = 'most_commented';
  document.querySelectorAll('.cat-item').forEach(e => e.classList.remove('open'));
  document.querySelectorAll('.cat-header').forEach(e => e.classList.remove('active'));
  document.querySelectorAll('.q-item').forEach(e => e.classList.remove('active'));
  updateBreadcrumb();
  updateResetBtn();
  renderSidebar();
  renderTopics();
}

function resetEventFilter() {
  state.selectedEvtId = null;
  state.selectedDemographicTags = new Set();
  updateBreadcrumb();
  updateResetBtn();
  renderSidebar();
  renderTopics();
}

function toggleDemographicTag(tag) {
  if (state.selectedDemographicTags.has(tag)) {
    state.selectedDemographicTags.delete(tag);
  } else {
    state.selectedDemographicTags.add(tag);
  }
  // Clear specific event selection when using tag filter
  state.selectedEvtId = null;
  updateResetBtn();
  updateBreadcrumb();
  renderSidebar();
  renderTopics();
}

function showDownloadModal() {
  const el = document.getElementById('download-overlay');
  if (el) { el.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

function closeDownloadModal() {
  const el = document.getElementById('download-overlay');
  if (el) { el.style.display = 'none'; document.body.style.overflow = ''; }
}

async function confirmDownload() {
  const btn = document.getElementById('download-confirm-btn');
  if (btn) { btn.textContent = 'กำลังเตรียม...'; btn.disabled = true; }

  try {
    const files = [
      'data/category.csv', 'data/topics.csv', 'data/comments.csv',
      'data/events.csv', 'data/topic_question.csv',
      'data/topic_event.csv', 'data/comment_event.csv'
    ];
    const zip = new JSZip();
    await Promise.all(files.map(async path => {
      const res = await fetch(path);
      const text = await res.text();
      zip.file(path.replace('data/', ''), text);
    }));
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dreamcon-data.zip';
    a.click();
    URL.revokeObjectURL(url);
    closeDownloadModal();
  } catch (err) {
    console.error('Download failed:', err);
    if (btn) { btn.textContent = 'เกิดข้อผิดพลาด'; }
  } finally {
    if (btn) { btn.textContent = '⬇ ดาวน์โหลด'; btn.disabled = false; }
  }
}

function showHowToRead() {
  const el = document.getElementById('how-to-read-overlay');
  if (el) { el.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

function closeHowToRead() {
  const el = document.getElementById('how-to-read-overlay');
  if (el) { el.style.display = 'none'; document.body.style.overflow = ''; }
}

function copyTopicLink() {
  if (!currentDetailTopicId) return;
  const url = new URL(window.location.href);
  url.searchParams.set('topic', currentDetailTopicId);
  const btn = document.getElementById('detail-copy-btn');
  navigator.clipboard.writeText(url.toString()).then(() => {
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ คัดลอกลิงก์แล้ว';
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = url.toString();
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

function filterByEventFromDetail(evtId) {
  closeDetail();
  // Reset all filters
  state.selectedCatId = null;
  state.selectedQId = null;
  state.selectedDemographicTags = new Set();
  state.searchQuery = '';
  const searchEl = document.getElementById('topic-search');
  if (searchEl) searchEl.value = '';
  const searchBtn = document.getElementById('search-commit-btn');
  if (searchBtn) searchBtn.style.display = 'none';
  if (state.sort === 'distance_to_question') state.sort = 'most_commented';
  // Apply event filter
  state.selectedEvtId = evtId;
  // Switch sidebar to event tab
  toggleSidebarFromBreadcrumb('evt');
  updateBreadcrumb();
  updateResetBtn();
  renderSidebar();
  renderTopics();
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('detail-overlay')) closeDetail();
}

function sentimentOrder(c) {
  const v = c.comment_view || '';
  if (v === 'เห็นด้วย') return 0;
  if (v === 'เห็นด้วยบางส่วน') return 1;
  if (v === 'ไม่เห็นด้วย') return 2;
  return 3;
}

function renderCommentTree(comments, depth) {
  if (!comments || !comments.length) return '';
  const sorted = [...comments].sort((a, b) => sentimentOrder(a) - sentimentOrder(b));

  const INDENT_PX = 20;
  const indent = depth * INDENT_PX;

  const groups = [
    { view: 'เห็นด้วย',        badgeClass: 'csb-agree',    label: 'เห็นด้วย' },
    { view: 'เห็นด้วยบางส่วน', badgeClass: 'csb-partial',  label: 'เห็นด้วยบางส่วน' },
    { view: 'ไม่เห็นด้วย',     badgeClass: 'csb-disagree', label: 'ไม่เห็นด้วย' },
  ];

  // Only render groups that have members
  const activeGroups = groups.filter(g => sorted.some(c => (c.comment_view || '') === g.view));
  if (!activeGroups.length) return '';

  const treeId = `tree-${depth}-${comments[0]?.comment_id || Math.random().toString(36).slice(2)}`;
  const defaultView = activeGroups[0].view;
  const contextLabel = depth === 0
    ? `<span style="font-size:var(--font-size-xs);color:var(--color-text-muted)">กับข้อถกเถียงนี้</span>`
    : `<span style="font-size:var(--font-size-xs);color:var(--color-text-muted)">กับความคิดเห็นนี้</span>`;

  // Tab bar
  const colorKey = v => v === 'เห็นด้วย' ? 'agree' : v === 'เห็นด้วยบางส่วน' ? 'partial' : 'disagree';

  const tabs = activeGroups.map(g => {
    const count = sorted.filter(c => (c.comment_view || '') === g.view).length;
    const isDefault = g.view === defaultView;
    const ck = colorKey(g.view);
    const activeBg   = `var(--color-${ck}-light)`;
    const activeColor = `var(--color-${ck})`;
    const inactiveBg  = `var(--color-${ck}-light)`;
    const style = isDefault
      ? `background:${activeBg};color:${activeColor};opacity:1;`
      : `background:${inactiveBg};color:${activeColor};opacity:0.35;`;
    return `<button
      class="comment-tab ${isDefault ? 'comment-tab--active' : ''}"
      data-view="${escAttr(g.view)}"
      data-tree="${escAttr(treeId)}"
      onclick="switchCommentTab(this)"
      style="padding:3px 10px;border-radius:20px;border:none;font-family:var(--font-body);font-size:var(--font-size-xs);cursor:pointer;font-weight:600;transition:all 0.15s;${style}"
    >${count} ${g.label}</button>`;
  }).join('');

  const tabBar = `<div style="display:flex;align-items:center;gap:var(--space-2);padding:var(--space-2) 0;border-bottom:1px solid var(--color-border);flex-wrap:wrap;padding-left:${indent}px">
    ${tabs}
    ${contextLabel}
  </div>`;

  // Comment panels — only default visible
  const panels = activeGroups.map(g => {
    const members = sorted.filter(c => (c.comment_view || '') === g.view);
    const isDefault = g.view === defaultView;
    return `<div data-panel="${escAttr(g.view)}" data-tree="${escAttr(treeId)}" style="display:${isDefault ? 'block' : 'none'}">${members.map(c => renderCommentNode(c, depth)).join('')}</div>`;
  }).join('');

  return tabBar + panels;
}

function renderCommentNode(c, depth) {
  const view = c.comment_view || '';
  const reason = c.reason || '';
  const children = state.commentsByComment[String(c.comment_id).trim()] || [];
  const hasChildren = children.length > 0;
  const circleColor = view === 'เห็นด้วย'        ? 'var(--color-agree-light)'
                    : view === 'เห็นด้วยบางส่วน' ? 'var(--color-partial-light)'
                    : view === 'ไม่เห็นด้วย'     ? 'var(--color-disagree-light)'
                    : 'var(--color-border-strong)';
  const circleHtml = `<span data-badge="${c.comment_id}" style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:${circleColor};flex-shrink:0;border:1px solid rgba(0,0,0,0.12)">${hasChildren ? '<span style="position:absolute;font-size:10px;line-height:1;color:rgba(0,0,0,0.45);font-weight:700;pointer-events:none">+</span>' : ''}</span>`;

  const INDENT_PX = 20;
  const BADGE_HALF = 5; // circle center
  const nodeClass = depth > 0 ? 'comment-node is-child' : 'comment-node';
  const nodeStyle = `padding-left:${depth * INDENT_PX}px;--badge-center-x:${BADGE_HALF}px`;

  // Build event title tags
  const evtIds = state.commentEvents[String(c.comment_id).trim()] || [];
  const evtHtml = evtIds.map(eid => buildEventTooltip(eid, 'font-size:var(--font-size-xs);color:var(--color-text-subtle)')).filter(Boolean).join('<span style="color:var(--color-text-subtle);margin:0 3px">|</span>');

  return `<div class="${nodeClass}" style="${nodeStyle}" data-cid="${c.comment_id}">
    <div class="comment-card">
      <div class="comment-card-header">${circleHtml}</div>
      <div style="flex:1;display:flex;flex-direction:column;">
        ${reason ? `<div class="comment-body">${escHtml(reason)}</div>` : ''}
        ${evtHtml ? `<div style="margin-top:4px;font-size:var(--font-size-xs);color:var(--color-text-subtle)">จากวง ${evtHtml}</div>` : ''}
      </div>
    </div>
    ${hasChildren ? `<div style="margin-left:30px;background:var(--color-surface-alt);border-radius:var(--radius-md);margin-top:2px">${renderCommentTree(children, depth + 1)}</div>` : ''}
  </div>`;
}

function switchCommentTab(btn) {
  const treeId = btn.dataset.tree;
  const view   = btn.dataset.view;
  const colorMap = { 'เห็นด้วย': 'agree', 'เห็นด้วยบางส่วน': 'partial', 'ไม่เห็นด้วย': 'disagree' };

  // Deactivate all tabs in this tree
  document.querySelectorAll(`.comment-tab[data-tree="${treeId}"]`).forEach(t => {
    t.classList.remove('comment-tab--active');
    t.style.opacity = '0.35';
  });

  // Activate clicked tab
  btn.classList.add('comment-tab--active');
  btn.style.opacity = '1';

  // Show matching panel, hide others
  document.querySelectorAll(`[data-panel][data-tree="${treeId}"]`).forEach(p => {
    p.style.display = p.dataset.panel === view ? 'block' : 'none';
  });
}

function drawConnectors() {
  const section = document.getElementById('comments-section');
  if (!section) return;

  section.querySelectorAll('.comment-connector-line').forEach(el => el.remove());

  section.querySelectorAll('[data-cid]').forEach(node => {
    const childNodes = Array.from(node.children).filter(el => el.hasAttribute('data-cid'));
    if (!childNodes.length) return;

    const parentBadge   = node.querySelector(':scope > .comment-card [data-badge]');
    const lastChildBadge = childNodes[childNodes.length - 1].querySelector(':scope > .comment-card [data-badge]');
    if (!parentBadge || !lastChildBadge) return;

    const nodeRect   = node.getBoundingClientRect();
    const pRect      = parentBadge.getBoundingClientRect();
    const cRect      = lastChildBadge.getBoundingClientRect();

    const x      = pRect.left + pRect.width  / 2 - nodeRect.left;
    const yStart = pRect.top  + pRect.height / 2 - nodeRect.top;
    const yEnd   = cRect.top  + cRect.height / 2 - nodeRect.top;
    const height = yEnd - yStart;

    if (height <= 0) return;

    const line = document.createElement('div');
    line.className = 'comment-connector-line';
    line.style.cssText = `left:${x}px;top:${yStart}px;height:${height}px`;
    // Insert before first child so it's behind content
    node.insertBefore(line, node.firstChild);
  });
}

// Global tooltip for evt-info-wrap — single div appended to body, shown on hover
const _tt = document.createElement('div');
_tt.className = 'evt-tooltip';
_tt.style.display = 'none';
_tt.style.position = 'fixed';
_tt.style.zIndex = '9999';
document.body.appendChild(_tt);

let _ttHideTimer = null;

function _showTooltipFor(wrap) {
  clearTimeout(_ttHideTimer);
  const content = wrap.dataset.tooltipHtml;
  if (!content) return;
  const rect = wrap.getBoundingClientRect();
  _tt.innerHTML = content;
  _tt.style.display = 'block';
  // Position below, flip up if not enough space
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < 200) {
    _tt.style.top = '';
    _tt.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
  } else {
    _tt.style.bottom = '';
    _tt.style.top = (rect.bottom + 6) + 'px';
  }
  _tt.style.left = Math.min(rect.left, window.innerWidth - 330) + 'px';
}

function _scheduleHideTooltip() {
  clearTimeout(_ttHideTimer);
  // Small delay so the cursor has time to travel from the wrap into the tooltip
  _ttHideTimer = setTimeout(() => { _tt.style.display = 'none'; }, 150);
}

document.addEventListener('mouseenter', e => {
  const wrap = e.target.closest('.evt-info-wrap');
  if (wrap) { _showTooltipFor(wrap); return; }
}, true);

document.addEventListener('mouseleave', e => {
  const wrap = e.target.closest('.evt-info-wrap');
  if (wrap && !wrap.contains(e.relatedTarget)) _scheduleHideTooltip();
}, true);

// Keep tooltip open while hovering it, and close it once the cursor truly leaves
_tt.addEventListener('mouseenter', () => clearTimeout(_ttHideTimer));
_tt.addEventListener('mouseleave', () => _scheduleHideTooltip());

// Init
// Init
document.addEventListener('DOMContentLoaded', () => {
  // Category tab active by default
  switchSidebarTab('cat');
});
loadAll();
window.addEventListener('resize', layoutMasonry);
