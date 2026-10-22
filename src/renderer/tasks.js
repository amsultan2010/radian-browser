// Gestionnaire de tâches : processus d'Orbe, mémoire, processeur (src/main/tasks.js).
// Les titres viennent des pages : affichés comme du texte, jamais comme du HTML.
const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const mo = (n) => t('tasks.mb', { n: Number(n).toLocaleString(lang) });
let busy = false;

async function draw() {
  if (busy || document.hidden) return;
  busy = true;
  let data = null;
  try { data = await O.send('tasks:list'); } finally { busy = false; }
  if (!data || !Array.isArray(data.rows)) return;
  document.title = t('help.taskManager');
  const box = document.getElementById('rows');
  const head = make('div', 'line head');
  head.append(make('span', 'grow', t('tasks.process')), make('span', 'num', t('tasks.memory')), make('span', 'num', t('tasks.cpu')), make('span', 'act', ''));
  const lines = [head];
  for (const r of data.rows) {
    const line = make('div', 'line');
    line.dataset.pid = String(r.pid);
    line.dataset.kind = r.kind;
    const text = make('div', 'grow');
    const title = r.kind === 'tab' ? (r.titles.length > 1 ? t('tasks.tabs', { n: r.titles.length + (r.more || 0) }) : t('tasks.tab', { title: r.titles[0] || '' })) : r.name;
    text.append(make('div', 'name', title));
    text.append(make('div', 'sub', (r.kind === 'tab' && r.titles.length > 1 ? r.titles.join(' · ') + ' — ' : '') + t('tasks.pid', { pid: r.pid })));
    const act = make('span', 'act');
    if (r.canEnd) {
      const b = make('button', 'btn', t('tasks.end'));
      b.onclick = async () => { b.disabled = true; await O.send('tasks:end', r.pid); setTimeout(draw, 300); };
      act.append(b);
    }
    line.append(text, make('span', 'num', mo(r.mb)), make('span', 'num', r.cpu.toLocaleString(lang, { maximumFractionDigits: 1 }) + ' %'), act);
    lines.push(line);
  }
  const total = make('div', 'line head');
  total.append(make('span', 'grow', t('tasks.total', { n: data.rows.length })), make('span', 'num', mo(data.total)), make('span', 'num', ''), make('span', 'act', ''));
  lines.push(total);
  box.replaceChildren(...lines);
  document.getElementById('note').textContent = t(data.real ? 'tasks.noteReal' : 'tasks.noteResident');
}
O.on('settings', (s) => { if (setLang(s.lang)) draw(); });
document.addEventListener('visibilitychange', draw);
setInterval(draw, 2500);
draw();
