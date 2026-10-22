// Import depuis un navigateur installé : liste des navigateurs trouvés, aperçu
// (nombre de signets) avant d'importer, destination, annulation. Partagé par le
// volet Import des réglages et la page d'accueil. Les noms lus sur le disque
// (profils, Espaces) sont posés comme du texte.
// eslint-disable-next-line no-unused-vars
function mountImport(box, opts = {}) {
  const mk = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };
  const notes = {}; // navigateur -> message à garder d'un dessin à l'autre
  let info = null;

  function destSelect() {
    const sel = mk('select', 'imp-dest');
    for (const d of info.dests.list) sel.append(new Option(t(d.kind === 'new' ? 'impb.destNew' : 'impb.destSpace', { name: d.name }), d.id));
    // Accueil : l'Espace affiché s'il est encore vide ; sinon un nouvel Espace.
    const cur = info.dests.list.find((d) => d.id === info.dests.current);
    sel.value = opts.preferCurrent && cur && cur.empty ? cur.id : (info.dests.list.find((d) => d.kind === 'new') || {}).id || '';
    return sel;
  }

  function row(b) {
    const line = mk('div', 'line imp-row');
    line.dataset.browser = b.id;
    const body = mk('div', 'grow');
    const sub = mk('div', 'sub wrap imp-sub', notes[b.id] || t('impb.hint'));
    body.append(mk('div', 'imp-name', b.name), sub);
    line.append(body);
    const controls = mk('span', 'imp-controls');
    line.append(controls);
    const say = (text) => { sub.textContent = text; };

    const start = () => {
      controls.textContent = '';
      if (b.blocked) {
        say(t('impb.safariBlocked'));
        const open = mk('button', 'btn imp-access', t('impb.access'));
        open.onclick = () => O.send('import:diskAccess');
        const retry = mk('button', 'btn imp-retry', t('impb.retry'));
        retry.onclick = () => refresh();
        controls.append(open, retry);
        return;
      }
      let profile = null;
      if (b.profiles.length > 1) {
        profile = mk('select', 'imp-profile');
        profile.title = t('impb.profile');
        for (const p of b.profiles) profile.append(new Option(p.name || b.name, p.id));
        controls.append(profile);
      }
      const go = mk('button', 'btn imp-go', t('impb.preview'));
      go.onclick = async () => {
        go.disabled = true;
        const r = await O.send('import:preview', { browser: b.id, profile: profile ? profile.value : b.profiles[0].id });
        go.disabled = false;
        if (!r || r.error) return say(t('impb.err.' + ((r && r.error) || 'unreadable')));
        return review(r);
      };
      controls.append(go);
    };

    const review = (r) => {
      controls.textContent = '';
      say([
        t('impb.found', { n: r.bookmarks, folders: r.folders }),
        r.dropped ? t('bm.dropped', { n: r.dropped }) : '',
        r.truncated ? t('bm.truncated', { n: r.max }) : '',
        r.source === 'backup' ? t('impb.backup', { date: r.date }) : '',
      ].filter(Boolean).join(' '));
      const dest = destSelect();
      const ok = mk('button', 'btn primary imp-apply', t('import.go'));
      const cancel = mk('button', 'btn imp-cancel', t('edit.undo'));
      cancel.onclick = () => { say(t('impb.hint')); start(); };
      ok.onclick = async () => {
        ok.disabled = true;
        const done = await O.send('import:apply', { token: r.token, dest: dest.value, stay: !!opts.stay });
        if (!done || done.error) { say(t('impb.err.' + ((done && done.error) || 'unreadable'))); return start(); }
        notes[b.id] = t('impb.done', { n: done.bookmarks, space: done.spaceName });
        say(notes[b.id]);
        controls.textContent = '';
        const undo = mk('button', 'btn imp-undo', t('impb.undo'));
        undo.onclick = async () => {
          undo.disabled = true;
          const u = await O.send('import:undo', { id: done.undoId });
          notes[b.id] = t(u && u.ok ? 'impb.undone' : 'impb.undoExpired');
          say(notes[b.id]);
          start();
          if (opts.onChange) opts.onChange();
        };
        controls.append(undo);
        if (opts.onChange) opts.onChange(done);
        return undefined;
      };
      controls.append(dest, ok, cancel);
    };

    start();
    return line;
  }

  async function refresh() {
    info = await O.send('import:list');
    box.textContent = '';
    if (!info || !info.browsers.length) {
      const empty = mk('div', 'line imp-none');
      empty.append(mk('span', 'grow sub wrap', t('impb.none')));
      box.append(empty);
    } else for (const b of info.browsers) box.append(row(b));
    if (opts.onList) opts.onList(info);
    return info;
  }

  refresh();
  return { refresh };
}
