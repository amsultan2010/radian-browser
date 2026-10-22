// Liste des raccourcis, générée depuis la table des commandes.
async function draw() {
  document.title = t('help.shortcuts');
  const groups = (await O.send('shortcuts:get')) || [];
  document.getElementById('groups').innerHTML = groups.map((g) => `<h2>${esc(g.title)}</h2><div class="card">${
    g.items.map((i) => `<div class="line"><span class="grow">${esc(i.label.replace('…', ''))}</span><kbd>${esc(i.keys)}</kbd></div>`).join('')
  }</div>`).join('');
}
O.on('settings', (s) => { if (setLang(s.lang)) draw(); });
draw();
