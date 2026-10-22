// Tests d'interface d'Orbe : Playwright pilote le vrai navigateur avec de
// vraies entrées (clics, frappes, glisser-déposer) et lit le résultat dans la
// barre latérale.
//   node scripts/test-ui.js            tous les groupes
//   node scripts/test-ui.js glisser    seulement les groupes dont le nom contient « glisser »
//   ORBE_UI_CPU=4 node scripts/test-ui.js   coque quatre fois plus lente (machine chargée simulée)
//
// Chaque groupe (fichier NN-nom.js) démarre un navigateur neuf sur un profil
// temporaire. Une vérification précédée de « BOGUE: » décrit un défaut connu de
// l'application : son échec est signalé mais ne fait pas échouer la suite.
const fs = require('fs');
const path = require('path');
const { lancer, delai } = require('./harness');

const FOCUS = process.env.ORBE_UI_FOCUS === '1';
const total = { ok: 0, ko: 0, bogues: 0, corriges: 0, ignores: 0 };
const echecs = [];
const bogues = [];

// ORBE_UI_DETAIL=1 : message d'erreur entier (différences comprises).
const court = (err) => (process.env.ORBE_UI_DETAIL ? String((err && err.message) || err) : String((err && err.message) || err).split('\n')[0].slice(0, 300));

// Vérification en échec : ce que montrait la barre latérale à cet instant
// (lignes, sélection, glisser en cours) et une capture de la coque.
async function constater(ctx, groupe, n) {
  if (ctx.arretInattendu()) return;
  try {
    const vu = await delai(ctx.shell.evaluate(() => ({
      aujourdhui: [...document.querySelectorAll('#today .row.tab')].map((r) => (r.querySelector('.title') || r).textContent + (r.classList.contains('active') ? '*' : '') + (r.classList.contains('sel') ? '+' : '') + (r.classList.contains('out') ? '(sort)' : '')),
      epingles: [...document.querySelectorAll('#pinned .row .title')].map((el) => el.textContent),
      corps: document.body.className,
      animations: document.getAnimations().filter((a) => a.playState === 'running').length,
    })), 3000, 'état de la barre');
    console.log(`      barre : ${JSON.stringify(vu)}`);
    const nom = `echec-${groupe.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-${n}`;
    await delai(ctx.capture(nom), 4000, 'capture');
    console.log(`      capture : ${path.join(ctx.captures, nom + '.png')}`);
  } catch (err) {
    console.log(`      (état de la barre illisible : ${String(err.message).split('\n')[0]})`);
  }
}

function rapport(groupe, ctx) {
  const essai = async (fn) => {
    if (ctx.bloque) throw new Error('application bloquée par une vérification précédente');
    if (ctx.arretInattendu()) throw new Error(ctx.constat());
    try {
      await delai(Promise.resolve().then(fn), 40000, 'vérification');
    } catch (err) {
      // L'application s'est arrêtée pendant la vérification : c'est la vraie cause.
      if (ctx.arretInattendu()) err.message = `${ctx.constat()} — ${String(err.message).split('\n')[0]}`;
      throw err;
    }
  };
  const t = {
    // Vérification normale : son échec fait échouer la suite.
    async verifier(nom, fn) {
      try {
        await essai(fn);
        total.ok += 1;
        console.log(`  ✓ ${nom}`);
        return true;
      } catch (err) {
        total.ko += 1;
        echecs.push(`${groupe} › ${nom}`);
        console.log(`  ✗ ${nom} — ${court(err)}`);
        await constater(ctx, groupe, total.ko);
        return false;
      }
    },
    // Défaut connu de l'application (à corriger dans src/) : l'échec est attendu.
    async bogue(nom, fn) {
      try {
        await essai(fn);
        total.corriges += 1;
        console.log(`  ✓ BOGUE corrigé ? ${nom} (la vérification passe : retirer le marqueur)`);
        return true;
      } catch (err) {
        total.bogues += 1;
        bogues.push(`${groupe} › ${nom}`);
        console.log(`  ⚠ BOGUE: ${nom} — ${court(err)}`);
        return false;
      }
    },
    ignorer(nom, raison) {
      total.ignores += 1;
      console.log(`  – ignoré : ${nom} (${raison})`);
    },
    // Vérifications qui ont besoin d'images présentées à l'écran (cadence, animation
    // jouée jusqu'au bout) : écran verrouillé ou en veille, elles sont ignorées, avec la raison.
    avecEcran(mode, nom, fn) {
      if (!ctx.milieu.vivant) return t.ignorer(nom, ctx.milieu.raison);
      return t[mode](nom, fn);
    },
    // Vérifications qui lisent le focus natif : la fenêtre doit être au premier
    // plan, ce qui prend le clavier. Uniquement avec ORBE_UI_FOCUS=1.
    avecFocus(mode, nom, fn) {
      if (!FOCUS) return t.ignorer(nom, 'ORBE_UI_FOCUS=1 requis : lit le focus clavier natif');
      return t[mode](nom, fn);
    },
  };
  return t;
}

async function main() {
  const filtres = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const fichiers = fs.readdirSync(__dirname)
    .filter((f) => /^\d\d-.*\.js$/.test(f))
    .filter((f) => !filtres.length || filtres.some((x) => f.includes(x)))
    .sort();
  console.log('\nOrbe — tests d’interface (Playwright, vraies entrées souris et clavier)');
  if (!FOCUS) console.log('Fenêtre de test ouverte sans prendre le clavier (ORBE_UI_FOCUS=1 pour les vérifications de focus).');

  for (const f of fichiers) {
    const groupe = require(path.join(__dirname, f));
    console.log(`\n${groupe.nom}`);
    let ctx = null;
    const avant = total.ko;
    try {
      ctx = await delai(lancer(), 45000, 'lancement du navigateur');
      if (!ctx.milieu.vivant) console.log(`  – écran : ${ctx.milieu.resume}`);
      await groupe.test(ctx, rapport(groupe.nom, ctx));
    } catch (err) {
      total.ko += 1;
      echecs.push(`${groupe.nom} › (groupe interrompu)`);
      console.log(`  ✗ groupe interrompu — ${ctx && ctx.arretInattendu() ? ctx.constat() + ' — ' : ''}${court(err)}`);
    } finally {
      if (ctx) {
        const arret = ctx.arretInattendu();
        // Application arrêtée sans qu'on le lui demande : ce qu'elle a écrit en dernier.
        if (arret) {
          console.log(`  ! ${ctx.constat()}`);
          console.log('  ! dernières lignes du processus principal :');
          for (const l of ctx.journal.slice(-40)) console.log('      ' + l.slice(0, 400));
        }
        // Groupe en échec : journal entier du processus principal, à côté des captures.
        if (total.ko > avant || arret) {
          try {
            fs.mkdirSync(ctx.captures, { recursive: true });
            const fichier = path.join(ctx.captures, `journal-${f.replace(/\.js$/, '')}.log`);
            fs.writeFileSync(fichier, ctx.journal.join('\n') + `\n\n${ctx.constat()}\n`);
            console.log(`  ! journal du processus principal : ${fichier}`);
          } catch {}
        }
        await ctx.fermer();
      }
    }
  }

  const n = total.ok + total.ko;
  console.log(`\n${total.ok}/${n} vérifications réussies`
    + (total.bogues ? `, ${total.bogues} bogue(s) connu(s)` : '')
    + (total.corriges ? `, ${total.corriges} bogue(s) apparemment corrigé(s)` : '')
    + (total.ignores ? `, ${total.ignores} ignorée(s)` : ''));
  if (bogues.length) console.log('\nBogues connus :\n' + bogues.map((b) => '  ⚠ ' + b).join('\n'));
  if (echecs.length) console.log('\nÉchecs :\n' + echecs.map((b) => '  ✗ ' + b).join('\n'));
  console.log('');
  process.exit(total.ko ? 1 : 0);
}

main().catch((err) => { console.error('\nÉCHEC', err); process.exit(1); });
