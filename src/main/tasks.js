// Gestionnaire de tâches (EXT-22) : les processus d'Orbe, ce qu'ils portent, leur
// mémoire et leur part de processeur ; arrêt d'un onglet qui s'emballe.
//
// Tout est relevé ici, dans le processus principal (`app.getAppMetrics()`, cadres
// des onglets vivants). Les titres viennent des pages : ils partent tronqués et
// sont affichés comme du texte. « Arrêter » ne vaut que pour un processus qui
// porte un onglet vivant, revérifié au moment de l'action : jamais le processus
// principal, l'interface, le processus graphique ni un service.
const { app, webContents } = require('electron');
const empreinte = require('./empreinte');
const { store } = require('./store');

const W = () => require('./window');
const SAMPLE_GAP = 10e3; // relevé d'empreinte (macOS) : au plus toutes les dix secondes, page ouverte

// pid -> onglets vivants dont un cadre tourne dans ce processus ; `main` : c'est le processus de leur page.
function tabsByPid() {
  const out = new Map();
  for (const rt of W().live.values()) {
    if (rt.wc.isDestroyed()) continue;
    let mainPid = 0;
    const pids = new Set();
    try { mainPid = rt.wc.getOSProcessId(); for (const f of rt.wc.mainFrame.framesInSubtree) pids.add(f.osProcessId); } catch {}
    for (const pid of pids) {
      if (!out.has(pid)) out.set(pid, []);
      out.get(pid).push({ rt, main: pid === mainPid });
    }
  }
  return out;
}

function list() {
  const { OrbeWindow, processMb } = W();
  const tabs = tabsByPid();
  const ui = new Set();
  for (const w of OrbeWindow.all) { try { ui.add(w.ui.webContents.getOSProcessId()); } catch {} }
  const ext = new Map(); // pid -> hôte d'extension
  for (const wc of webContents.getAllWebContents()) {
    try { const u = new URL(wc.getURL()); if (u.protocol === 'chrome-extension:') ext.set(wc.getOSProcessId(), u.hostname); } catch {}
  }
  const t = (k, v) => store.t(k, null, v);
  const rows = app.getAppMetrics().map((m) => {
    const row = { pid: m.pid, mb: Math.round(processMb(m)), cpu: Math.round((m.cpu && m.cpu.percentCPUUsage) * 10) / 10 || 0, kind: 'other', titles: [], canEnd: false };
    if (m.type === 'Browser') { row.kind = 'app'; row.name = 'Orbe'; }
    else if (m.type === 'GPU') { row.kind = 'gpu'; row.name = t('tasks.gpu'); }
    else if (m.type === 'Tab') {
      const mine = tabs.get(m.pid);
      if (mine) {
        row.kind = 'tab';
        row.titles = mine.slice(0, 8).map(({ rt }) => { if (rt.owner && rt.owner.incognito) return t('tasks.private'); const tab = rt.owner && rt.owner.data.tabs[rt.id]; return String((tab && (tab.title || tab.url)) || '').slice(0, 80); });
        row.more = Math.max(0, mine.length - 8);
        row.canEnd = mine.some((x) => x.main);
      } else if (ui.has(m.pid)) { row.kind = 'ui'; row.name = t('tasks.ui'); }
      else if (ext.has(m.pid)) { row.kind = 'ext'; row.name = t('tasks.ext', { id: ext.get(m.pid) }); }
      else row.name = t('tasks.other');
    } else row.name = String(m.name || m.serviceName || m.type || '').slice(0, 60);
    return row;
  });
  rows.sort((a, b) => b.mb - a.mb);
  const real = process.platform === 'win32' || (process.platform === 'darwin' && empreinte.state.at > 0 && Date.now() - empreinte.state.at < empreinte.FRESH);
  return { rows, real, total: rows.reduce((a, r) => a + r.mb, 0) };
}

// Liste pour la page : sur macOS, l'empreinte réelle est d'abord relevée (pas plus d'une fois toutes les dix secondes).
async function fresh() {
  if (process.platform === 'darwin' && Date.now() - empreinte.state.at > SAMPLE_GAP) {
    await empreinte.refresh(app.getAppMetrics().map((m) => ({ pid: m.pid, creationTime: m.creationTime })));
  }
  return list();
}

// Arrête le processus d'un onglet. Renvoie le nombre d'onglets arrêtés (0 : refusé).
function end(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return 0;
  const mine = (tabsByPid().get(pid) || []).filter((x) => x.main);
  let n = 0;
  for (const { rt } of mine) {
    if (rt.wc.isDestroyed()) continue;
    try { rt.wc.forcefullyCrashRenderer(); n += 1; } catch {}
  }
  return n;
}

async function handle(action, a) {
  if (action === 'tasks:list') return fresh();
  if (action === 'tasks:end') return end(Number(a));
  return undefined;
}

module.exports = { list, fresh, end, handle };
