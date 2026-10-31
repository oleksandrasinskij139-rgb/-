/* LuxVisuals admin panel. Работает только через сервер (config.js → LUX_API_BASE).
   Пароль и данные игроков в браузере не хранятся, все права проверяет сервер. */
const $ = id => document.getElementById(id);
const BASE = (window.LUX_API_BASE || "").replace(/\/$/, "");
const SKEY = "lux_admin_session";
let session = sessionStorage.getItem(SKEY) || "", role = sessionStorage.getItem(SKEY + "_role") || "limited";
let players = [], admins = [], selected = null, timer = null;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const full = () => role === "full";
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),2200)}
function mins(v){v=Number(v)||0;return Math.floor(v/60)+" ч "+(v%60)+" мин"}
function ago(ts){if(!ts)return "никогда";const s=Math.max(0,Math.floor(Date.now()/1000-ts));if(s<60)return s+" сек назад";if(s<3600)return Math.floor(s/60)+" мин назад";if(s<86400)return Math.floor(s/3600)+" ч назад";return Math.floor(s/86400)+" дн назад"}
function avatar(name){return "https://mc-heads.net/avatar/"+encodeURIComponent(name)+"/64"}
const FALLBACK="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2264%22 height=%2264%22%3E%3Crect width=%2264%22 height=%2264%22 fill=%22%23202e45%22/%3E%3Ctext x=%2250%25%22 y=%2258%25%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2228%22%3E?%3C/text%3E%3C/svg%3E";

async function api(path, opts = {}) {
  if (!BASE) throw new Error("Укажи адрес API в config.js");
  const ctl = new AbortController(), kill = setTimeout(() => ctl.abort(), 75000);
  try {
    const r = await fetch(BASE + path, {
      method: opts.method || "GET", signal: ctl.signal,
      headers: Object.assign({"Content-Type":"application/json"}, session ? {"Authorization":"Bearer "+session} : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    let data = {}; try { data = await r.json(); } catch {}
    if (r.status === 401 && session) { logout(); throw new Error("Сессия истекла. Войди снова."); }
    if (!r.ok) throw new Error(data.error || (r.status === 429 ? "Слишком много попыток." : "Ошибка сервера ("+r.status+")"));
    return data;
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "Сервер не ответил. Попробуй через минуту." : e.message === "Failed to fetch" ? "Нет связи с сервером." : e.message);
  } finally { clearTimeout(kill); }
}

function renderStats(){const on=players.filter(p=>p.online).length;$("total-count").textContent=players.length;$("online-count").textContent=on;$("offline-count").textContent=players.length-on;$("side-count").textContent=players.length}
function renderPlayers(){
  const q=$("search").value.trim().toLowerCase(),f=$("status-filter").value;
  const list=players.filter(p=>p.name.toLowerCase().includes(q)&&(f==="all"||(f==="online"?p.online:!p.online)));
  $("player-grid").innerHTML=list.length?list.map(p=>`<article class="player-card"><div class="player-top"><img class="skin" src="${esc(avatar(p.skin||p.name))}" alt="Скин ${esc(p.name)}" data-fb><div><div class="player-name">${esc(p.name)}${p.banned_until?" 🚫":""}</div><div class="player-meta">${p.online?"Сейчас играет":"Был в сети: "+ago(p.last_seen)}</div></div><span class="status ${p.online?"online":"offline"}">${p.online?"● В СЕТИ":"НЕ В СЕТИ"}</span></div><div class="player-stats"><div class="mini-stat"><span>Время с модом</span><b>${mins(p.mins)}</b></div><div class="mini-stat"><span>Баланс токенов</span><b>◈ ${Number(p.balance)||0}</b></div></div><button class="manage-btn" data-manage="${esc(p.id)}">Управлять игроком →</button></article>`).join(""):`<div class="empty">Игроки не найдены</div>`;
  document.querySelectorAll("img[data-fb]").forEach(i=>i.addEventListener("error",()=>{i.src=FALLBACK},{once:true}));
  renderStats();
}
function showPage(page){["players","admins","mass"].forEach(x=>$(x+"-page").classList.toggle("hidden",page!==x));$("page-title").textContent=({players:"Игроки",admins:"Администраторы",mass:"Массовые действия"})[page];document.querySelectorAll(".side-link").forEach(b=>b.classList.toggle("active",b.dataset.page===page));if(page==="admins")loadAdmins()}

const FEATURES=[
 ["jump","Заставить прыгать","Спам пробела"],["chat","Открыть / закрыть чат","Переключить чат"],
 ["say","Написать от имени игрока","Сообщение в чат от его имени"],["freeze","Заморозить управление","На заданное число секунд"],
 ["flip","Перевернуть экран","Эффект переворота камеры"],["third","Вид от третьего лица","Переключить перспективу F5"],
 ["sound","Спам звуками","Воспроизвести выбранный звук"],["inventory","Открыть инвентарь / меню","Принудительно открыть интерфейс"],
 ["title","В главное меню","Вернуть в меню без закрытия игры"],["flash","Вспышка экрана","Короткий эффект вспышки"],
 ["close","Закрыть Minecraft","Закрыть игру у игрока"]
];
const FLAGS=[["cheater","Читер"],["toxic","Токсичный"],["spam","Спам"],["watch","Под наблюдением"],["suspicious","Подозрительный"],["trusted","Проверенный"]];
function playerModal(p){
 selected=p; const lim=!full(); const fps=Math.max(5,Math.min(1000,Number(p.fps)||60));
 $("modal-content").innerHTML=`<div class="eyebrow">LUXVISUALS / PLAYER CONTROL</div>
 <div class="player-modal-head"><div><h2>${esc(p.name)}</h2><div class="modal-sub">${p.online?"● Сейчас в сети":"○ Не в сети · "+ago(p.last_seen)} · Сессия ${mins(p.mins)}</div></div><span class="status ${p.online?"online":"offline"}">${p.online?"ONLINE":"OFFLINE"}</span></div>
 <nav class="modal-tabs"><button class="active" data-tab="control">Управление</button><button data-tab="keyboard">Клавиатура</button><button data-tab="info">Информация</button>${lim?"":'<button data-tab="moderation">Модерация</button>'}</nav>
 <section class="player-tab" id="tab-control">
 <div class="control-columns">
 <div class="action-tile fps-tile"><h3>Ограничитель FPS</h3><div class="fps-value"><b id="fps-label">${fps}</b><span>FPS</span></div><input id="fps-slider" class="fps-slider" type="range" min="5" max="1000" step="1" value="${fps}"><div class="range-labels"><span>5 FPS</span><span>1000 FPS</span></div><button data-action="fps">Применить лимит</button></div>
 ${lim?"":`<div class="action-tile"><h3>Баланс токенов</h3><p>Сейчас: <b id="bal-label">◈ ${Number(p.balance)||0}</b>. Минус — списать.</p><input id="add-tokens" type="number" min="-100000" max="100000" placeholder="Например 500 или -100"><button data-action="tokens">Применить</button></div>`}
 </div>
 <h3 class="subheading">Троллинг и управление</h3><div class="action-tile action-options"><label>Длительность заморозки / прыжков (сек.)<input id="duration-seconds" type="number" min="1" max="300" value="10"></label><label>Текст от имени игрока<input id="impersonate-message" maxlength="200" placeholder="Введите сообщение"></label><label>Звук<select id="sound-choice"><option value="entity creeper primed">Creeper</option><option value="entity enderman scream">Enderman</option><option value="entity ghast scream">Ghast</option><option value="entity villager no">Villager</option><option value="entity lightning bolt thunder">Гром</option></select></label></div>
 <div class="feature-grid">${FEATURES.map(([id,t,d])=>`<div class="feature-item"><div><b>${t}</b><small>${d}</small></div><button data-feature="${id}">Выполнить</button></div>`).join("")}</div>
 <div class="action-tile extra-action"><h3>Сообщение от администратора</h3><p>Обычное сообщение в чат игрока.</p><input id="player-message" maxlength="200" placeholder="Текст сообщения"><button data-action="message">Отправить</button></div>
 </section>
 <section class="player-tab hidden" id="tab-keyboard"><div class="keyboard-head"><div><h3>Клавиатура и мышь</h3><p class="muted">Нажатия в демо отображаются как события. В реальной игре нужен обработчик мода.</p></div><button class="subtle-btn" id="hide-keyboard">Скрыть клавиатуру</button></div><div id="keyboard-wrap"><div id="full-keyboard"></div></div><div id="key-event" class="key-event">Ожидание нажатия…</div></section>
 <section class="player-tab hidden" id="tab-info"><div class="info-grid">
 <div class="mini-stat"><span>Время в игре / сессия</span><b>${mins(p.mins)}</b></div><div class="mini-stat"><span>Последний раз в сети</span><b>${p.online?"сейчас":ago(p.last_seen)}</b></div><div class="mini-stat"><span>Лимит FPS</span><b>${fps}</b></div><div class="mini-stat"><span>Первый запуск</span><b>${esc(p.first||"29.10.2026")}</b></div><div class="mini-stat"><span>IP / регион</span><b>${esc(p.region||"Нет данных")}</b></div><div class="mini-stat"><span>Установлено косметик</span><b>${Number(p.cosmetics)||3}</b></div></div>
 <h3 class="subheading">Последние действия</h3><div class="history-row"><span>Подключение к LuxVisuals</span><span>${esc(p.first||"29.10.2026")}</span></div><div class="history-row"><span>Последний сервер</span><span>${esc(p.server||"Неизвестен")}</span></div><div class="history-row"><span>Список косметик</span><span>Крылья · Плащ · Шляпа</span></div><h3 class="subheading">Последние сервера</h3><div class="history-row"><span>${esc(p.server||"play.example.net")}</span><span>${esc(p.last_server_date||"31.10.2026")}</span></div><h3 class="subheading">История действий игрока</h3><div id="activity-log" class="history-row"><span>Вход в игру</span><span>Сегодня</span></div><h3 class="subheading">История наказаний</h3><div class="history-row"><span>Наказаний нет</span><span>—</span></div>
 </section>
 ${lim?"":`<section class="player-tab hidden" id="tab-moderation"><h3 class="subheading">Модерация игрока</h3><div class="action-tile"><p>Флаги игрока</p><div class="flag-list">${FLAGS.map(([id,t])=>`<label><input type="checkbox" data-flag="${id}" ${(p.flags||[]).includes(id)?"checked":""}> ${t}</label>`).join("")}</div><button data-action="flags">Сохранить флаги</button><p class="note-label">Заметка администратора</p><textarea id="admin-note" maxlength="500" placeholder="Добавить заметку по игроку...">${esc(p.note||"")}</textarea><button data-action="note">Сохранить заметку</button></div>
 <div class="action-tile extra-action"><h3>Бан</h3><p>${p.banned_until?"Сейчас в бане до "+new Date(p.banned_until*1000).toLocaleString("ru-RU"):"Игрок не в бане."}</p><input id="ban-minutes" type="number" min="1" max="525600" placeholder="Бан на сколько минут"><button data-action="ban">Забанить</button>${p.banned_until?'<button data-action="unban">Снять бан</button>':""}</div></section>`}`;
 $("manage-modal").classList.remove("hidden"); buildKeyboard();
}
function buildKeyboard(){
  const rows=[["Esc","F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12","Prt","Scr","Pau"],["`","1","2","3","4","5","6","7","8","9","0","-","=","Backspace"],["Tab","Q","W","E","R","T","Y","U","I","O","P","[","]","\\"],["Caps","A","S","D","F","G","H","J","K","L",";","'","Enter"],["Shift","Z","X","C","V","B","N","M",",",".","/","Shift"],["Ctrl","Win","Alt","Space","Alt","Win","Menu","Ctrl"]];
  const pad=[["Num","/","*","-"],["7","8","9","+"],["4","5","6","+"],["1","2","3","Enter"],["0",".","Enter"]];
  const wide=["Backspace","Tab","Caps","Enter","Shift","Space"];
  $("full-keyboard").innerHTML=`<div class="keyboard-layout"><div class="keyboard-real">${rows.map(r=>`<div class="key-row">${r.map(k=>`<button class="keycap ${wide.includes(k)?"key-wide":""}" data-key="${esc(k)}">${esc(k)}</button>`).join("")}</div>`).join("")}</div><div class="numpad">${pad.map(r=>`<div class="num-row">${r.map(k=>`<button class="keycap" data-key="Num ${esc(k)}">${esc(k)}</button>`).join("")}</div>`).join("")}</div></div><div class="mouse-keys">${["←","↑","↓","→"].map(k=>`<button class="keycap" data-key="${k}">${k}</button>`).join("")}</div>`;
}
function renderAdmins(){$("admin-list").innerHTML=admins.length?admins.map(a=>`<div class="admin-row"><div class="admin-avatar">${esc((a.name||"?")[0].toUpperCase())}</div><div><b>${esc(a.name)}</b><small>Ограниченный доступ · без токенов игроков и UUID</small></div><button data-del="${esc(a.id)}">Удалить</button></div>`).join(""):`<div class="empty">Администраторов пока нет</div>`}

async function loadPlayers(quiet){try{const d=await api("/api/admin/players");players=d.players||[];if($("manage-modal").classList.contains("hidden"))renderPlayers();else renderStats()}catch(e){if(!quiet)toast(e.message)}}
async function loadAdmins(){try{const d=await api("/api/admin/admins");admins=d.admins||[];renderAdmins()}catch(e){toast(e.message)}}
function enterApp(){
  $("login").classList.add("hidden");$("app").classList.remove("hidden");
  const f=full();
  document.querySelector('[data-page="admins"]').classList.toggle("hidden",!f);
  document.querySelector('[data-page="mass"]').classList.toggle("hidden",!f);
  $("side-role").textContent=f?"Полный доступ":"Ограниченный доступ";
  loadPlayers();clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)loadPlayers(true)},4000);
}
function logout(){session="";sessionStorage.removeItem(SKEY);sessionStorage.removeItem(SKEY+"_role");clearInterval(timer);$("app").classList.add("hidden");$("login").classList.remove("hidden");$("admin-pass").value=""}
function setSession(d,r){session=d.session_token;role=r;sessionStorage.setItem(SKEY,session);sessionStorage.setItem(SKEY+"_role",role)}

$("login-form").addEventListener("submit",async e=>{
  e.preventDefault();const btn=e.target.querySelector("button"),err=$("login-error");err.textContent="";btn.disabled=true;
  try{const d=await api("/api/admin/login",{method:"POST",body:{password:$("admin-pass").value}});if(!d.session_token)throw new Error("Сервер не вернул сессию.");setSession(d,d.role||"limited");enterApp()}
  catch(ex){err.textContent=ex.message}finally{btn.disabled=false}
});

$("demo-players").addEventListener("click",()=>{
 const now=Math.floor(Date.now()/1000);
 const demos=[
  {id:"demo-monix",name:"Monix_Demo",skin:"Steve",online:true,last_seen:now,mins:128,balance:240,fps:144,first:"31.10.2026",owned:7,cosmetics:4,server:"play.example.net",region:"Демо-регион",flags:[],note:"Тестовая заметка",demo:true},
  {id:"demo-alex",name:"AlexCraft_Demo",skin:"Alex",online:false,last_seen:now-3600,mins:56,balance:85,fps:60,first:"30.10.2026",owned:3,cosmetics:2,server:"mc.example.org",region:"Нет данных",flags:["watch"],note:"Демо-аккаунт",demo:true}
 ];
 players=players.filter(p=>!p.demo).concat(demos);renderPlayers();toast("Добавлены 2 демо-игрока. Их действия не отправляются в Minecraft.");
});

$("logout").addEventListener("click",logout);
document.querySelectorAll(".side-link").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
$("search").addEventListener("input",renderPlayers);$("status-filter").addEventListener("change",renderPlayers);
$("refresh").addEventListener("click",async()=>{await loadPlayers();toast("Список обновлён")});
$("player-grid").addEventListener("click",e=>{const b=e.target.closest("[data-manage]");if(b){const p=players.find(x=>String(x.id)===b.dataset.manage);if(p)playerModal(p)}});
$("manage-modal").addEventListener("click",e=>{if(e.target===$("manage-modal")||e.target.hasAttribute("data-close")){$("manage-modal").classList.add("hidden");renderPlayers()}});

async function act(action,value,okMsg){
  if(selected?.demo){selected.demoLog=selected.demoLog||[];selected.demoLog.unshift({action,value,at:new Date().toLocaleTimeString("ru-RU")});toast("ДЕМО: "+(okMsg||action)+" — событие записано");return {demo:true,balance:selected.balance};}
  try{const d=await api("/api/admin/players/"+encodeURIComponent(selected.id)+"/action",{method:"POST",body:{action,value}});if(okMsg)toast(okMsg);return d}
  catch(e){toast(e.message);return null}
}
$("modal-content").addEventListener("input",e=>{if(e.target.id==="fps-slider")$("fps-label").textContent=e.target.value});
$("modal-content").addEventListener("click",async e=>{
  const t=e.target,tab=t.dataset.tab;
  if(t.id==="hide-keyboard"){$("keyboard-wrap").classList.toggle("hidden");t.textContent=$("keyboard-wrap").classList.contains("hidden")?"Показать клавиатуру":"Скрыть клавиатуру";return}
  if(tab){document.querySelectorAll(".modal-tabs button").forEach(b=>b.classList.toggle("active",b===t));document.querySelectorAll(".player-tab").forEach(s=>s.classList.toggle("hidden",s.id!=="tab-"+tab));return}
  if(t.dataset.key){if(!selected.online){toast("Игрок не в сети");return}$("key-event").textContent="Нажата клавиша: "+t.dataset.key;await act("key",t.dataset.key,"Нажато: "+t.dataset.key);return}
  if(t.dataset.feature){if(!selected.online){toast("Игрок не в сети");return}const f=t.dataset.feature;let value=null;if(["freeze","jump"].includes(f))value=Number($("duration-seconds").value)||10;if(f==="say"){value=$("impersonate-message").value.trim();if(!value){toast("Введи текст сообщения");return}}if(f==="sound")value=$("sound-choice").value;if(f==="close"&&!confirm("Закрыть Minecraft у "+selected.name+"?"))return;await act(f,value,"Команда отправлена (демо/API)");return}
  const a=t.dataset.action;if(!a)return;
  if(a==="fps"){if(!selected.online){toast("Игрок не в сети");return}const n=Math.max(5,Math.min(1000,Number($("fps-slider").value)));if(await act("fps",n,"Лимит FPS: "+n))selected.fps=n}
  if(a==="tokens"){const n=Number($("add-tokens").value);if(!Number.isInteger(n)||n===0||Math.abs(n)>100000){toast("Введи целое число от -100000 до 100000");return}const d=await act("tokens",n,n>0?"Выдано "+n+" токенов":"Списано "+(-n)+" токенов");if(d){selected.balance=d.balance;$("bal-label").textContent="◈ "+d.balance;$("add-tokens").value="";loadPlayers(true)}}
  if(a==="message"){const m=$("player-message").value.trim();if(!m){toast("Введи сообщение");return}if(!selected.online){toast("Игрок не в сети");return}if(await act("message",m,"Сообщение отправлено"))$("player-message").value=""}
  if(a==="flags"){const v=[...document.querySelectorAll("[data-flag]:checked")].map(x=>x.dataset.flag);if(await act("flags",v,"Флаги сохранены"))selected.flags=v}
  if(a==="note"){const v=$("admin-note").value;if(await act("note",v,"Заметка сохранена"))selected.note=v}
  if(a==="ban"){const n=Number($("ban-minutes").value);if(!Number.isInteger(n)||n<1){toast("Укажи минуты");return}if(!confirm("Забанить "+selected.name+" на "+n+" мин?"))return;if(await act("ban",n,"Бан выдан")){await loadPlayers(true);const p=players.find(x=>x.id===selected.id);if(p)playerModal(p)}}
  if(a==="unban"){if(await act("ban",0,"Бан снят")){await loadPlayers(true);const p=players.find(x=>x.id===selected.id);if(p)playerModal(p)}}
});
document.addEventListener("click",async e=>{
  const a=e.target.dataset.mass;if(!a)return;
  const msg=$("mass-message")?.value.trim();
  if(a==="message"&&!msg){toast("Введи текст объявления");return}
  if(a==="close"&&!confirm("Закрыть игру у всех игроков онлайн?"))return;
  try{const d=await api("/api/admin/mass",{method:"POST",body:{action:a,value:a==="message"?msg:a==="freeze"?Number($("mass-freeze-seconds").value):a==="effect"?$("mass-effect").value:null}});toast("Отправлено игрокам: "+d.sent);if(a==="message")$("mass-message").value=""}catch(ex){toast(ex.message)}
});
$("admin-form").addEventListener("submit",async e=>{
  e.preventDefault();const name=$("new-admin-name").value.trim();if(!name)return;
  try{const d=await api("/api/admin/admins",{method:"POST",body:{name}});$("new-admin-name").value="";await loadAdmins();if(d.invite){const url=location.origin+"/admins/?invite="+d.invite;navigator.clipboard?.writeText(url).catch(()=>{});prompt("Ссылка для администратора (показывается один раз, уже скопирована):",url)}}catch(ex){toast(ex.message)}
});
$("admin-list").addEventListener("click",async e=>{const id=e.target.dataset.del;if(id===undefined||!confirm("Удалить администратора? Его ссылка перестанет работать."))return;try{await api("/api/admin/admins/"+encodeURIComponent(id),{method:"DELETE"});await loadAdmins();toast("Администратор удалён")}catch(ex){toast(ex.message)}});

(async()=>{
  const inv=new URLSearchParams(location.search).get("invite");
  if(inv){try{const d=await api("/api/admin/login",{method:"POST",body:{invite:inv}});setSession(d,"limited");history.replaceState(null,"",location.pathname);enterApp();return}catch(ex){$("login-error").textContent=ex.message}}
  if(session)enterApp();
})();
