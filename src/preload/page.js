// Gestionnaire de mots de passe : côté page web.
//
// Enregistré sur les sessions de profil (`registerPreloadScript`), ce script
// s'exécute dans un monde isolé : la page ne peut ni le lire, ni l'appeler, ni
// altérer ses objets. Il ne connaît aucun compte enregistré. Son rôle :
//   - signaler au processus principal qu'un champ de connexion a le clavier
//     (la liste des comptes s'affiche alors dans une vue d'Orbe, hors de la page) ;
//   - remplir le formulaire avec le seul compte que l'utilisateur a choisi ;
//   - signaler l'envoi d'un formulaire, pour proposer d'enregistrer.
// Il n'insère rien dans le DOM de la page. Le processus principal ne croit
// rien de ce qu'il dit sur l'origine : voir src/main/passwords.js.
const { ipcRenderer } = require('electron');

const CHANNEL = 'orbe-pw';

function start() {
  const send = (msg) => { try { ipcRenderer.send(CHANNEL, msg); } catch {} };
  const TEXT_TYPES = new Set(['', 'text', 'email', 'tel', 'url', 'number']);
  const wasPassword = new WeakSet(); // champs « afficher le mot de passe » passés en type=text
  // Ce que l'utilisateur a réellement saisi ou collé, par champ :
  // { pw : le champ était de type password à la première saisie, v : la valeur
  // à la dernière saisie }. Un champ rempli par le script de la page, changé de
  // type après coup ou dont la valeur a été remplacée ne propose rien.
  const typed = new WeakMap();
  const userTyped = (el) => { const r = typed.get(el); return !!r && r.v === el.value; };
  const userTypedPassword = (el) => userTyped(el) && typed.get(el).pw;
  // Dernier geste réel de l'utilisateur : un champ ne se signale que s'il vient
  // d'être cliqué, ou atteint au clavier. Un focus() ou un événement fabriqué
  // par la page n'ouvre jamais la liste.
  let gesture = { el: null, key: false, at: 0 };
  let current = null; // dernier champ signalé : { el, kind, user, pass, scope }
  let reported = false;
  let lastUsername = '';
  let watch = null;

  const isInput = (el) => !!el && el.localName === 'input';
  const typeOf = (el) => (el.getAttribute('type') || '').toLowerCase();
  const isPassword = (el) => isInput(el) && (typeOf(el) === 'password' || wasPassword.has(el));
  const isText = (el) => isInput(el) && !isPassword(el) && TEXT_TYPES.has(typeOf(el));
  const tokens = (el) => (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/);
  const hint = (el) => `${el.getAttribute('name') || ''} ${el.id || ''}`.toLowerCase();

  // Visible pour de bon : ni minuscule, ni transparent (lui ou un ancêtre).
  function visible(el) {
    if (!el.isConnected || el.disabled || typeOf(el) === 'hidden' || !el.getClientRects().length) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    let opacity = 1;
    for (let n = el, depth = 0; n && n.nodeType === 1 && depth < 12; n = n.parentElement, depth++) {
      opacity *= Number(getComputedStyle(n).opacity);
      if (!(opacity >= 0.1)) return false;
    }
    return true;
  }

  // Visible et dans la fenêtre : exigé du champ qui ouvre la liste.
  function onScreen(el) {
    if (!visible(el)) return false;
    const r = el.getBoundingClientRect();
    return r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  }

  // Zone du formulaire : la balise <form>, sinon le plus petit ancêtre qui
  // contient un mot de passe (applications sans <form>), sinon le document
  // (ou la racine fantôme) du champ.
  function scopeOf(el) {
    if (el.form) return el.form;
    const root = el.getRootNode();
    for (let n = el.parentElement, depth = 0; n && depth < 8; n = n.parentElement, depth++) {
      if (n.querySelector('input[type=password]')) return n;
    }
    return root;
  }

  const inputs = (scope) => [...scope.querySelectorAll('input')];
  const passwordsIn = (scope) => inputs(scope).filter((el) => isPassword(el) && visible(el));

  const USER_RE = /user|login|e-?mail|courriel|identif|ident\b|account|compte|pseudo|phone|mobile|\blog\b|\bid\b/;
  // Champ identifiant associé à un mot de passe : le champ de texte visible
  // qui le précède, de préférence annoncé comme tel.
  function userFor(scope, pw) {
    const before = inputs(scope).filter((el) => isText(el) && visible(el) && (pw.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING));
    return before.find((el) => tokens(el).includes('username'))
      || before.find((el) => tokens(el).includes('email') || typeOf(el) === 'email')
      || [...before].reverse().find((el) => USER_RE.test(hint(el)))
      || before[before.length - 1]
      || null;
  }

  // Identifiant même masqué (seconde étape d'une connexion en deux temps :
  // beaucoup de sites le gardent dans un champ caché).
  function hiddenUsername(scope) {
    const all = inputs(scope).filter((el) => !isPassword(el) && el.value && el.value.length < 200);
    const el = all.find((x) => tokens(x).includes('username'))
      || all.find((x) => (typeOf(x) === 'hidden' || typeOf(x) === 'email' || x.readOnly || !visible(x)) && /user|login|e-?mail|identifier|identifiant|loginfmt/.test(hint(x)) && !/token|csrf|nonce|state|challenge/.test(hint(x)));
    return el ? el.value : '';
  }

  const NOT_LOGIN_RE = /search|query|\bq\b|newsletter|subscri|coupon|promo|comment|recherch/;
  const LOGIN_PAGE_RE = /log-?in|sign-?in|signin|connexion|connect|auth|session|sso|identif|account|compte/;
  // Première étape d'une connexion en deux temps : un identifiant seul.
  function usernameOnly(el, scope) {
    if (typeOf(el) === 'search' || el.getAttribute('role') === 'searchbox' || el.getAttribute('role') === 'combobox') return false;
    const tk = tokens(el);
    if (tk.includes('username') || tk.includes('webauthn')) return true;
    const h = hint(el);
    if (NOT_LOGIN_RE.test(h)) return false;
    if (inputs(scope).filter((x) => isText(x) && visible(x)).length > 2) return false;
    const form = scope.localName === 'form' ? `${scope.getAttribute('action') || ''} ${scope.id || ''} ${scope.getAttribute('name') || ''} ${scope.className || ''}` : '';
    const loginPlace = LOGIN_PAGE_RE.test(form.toLowerCase()) || LOGIN_PAGE_RE.test(location.pathname.toLowerCase()) || LOGIN_PAGE_RE.test(location.hostname);
    if (/user|login|identif|loginfmt|pseudo/.test(h)) return true;
    const emailish = typeOf(el) === 'email' || tk.includes('email') || /e-?mail|courriel/.test(h);
    return emailish && loginPlace;
  }

  // Un mot de passe à créer (inscription, changement) plutôt qu'à saisir.
  const SIGNUP_RE = /sign-?up|signup|register|registration|inscription|inscri|join|create|creer|nouveau-compte|new-account/;
  function isNewPassword(el, pws) {
    const tk = tokens(el);
    if (tk.includes('new-password')) return true;
    if (tk.includes('current-password')) return false;
    if (pws.length === 2) return true;
    if (pws.length >= 3) return el !== pws[0];
    // Un seul champ, sans indication : le formulaire ou l'adresse tranchent.
    const form = el.form ? `${el.form.getAttribute('action') || ''} ${el.form.id || ''} ${el.form.getAttribute('name') || ''}`.toLowerCase() : '';
    return SIGNUP_RE.test(form) || (!LOGIN_PAGE_RE.test(form) && SIGNUP_RE.test(location.pathname.toLowerCase()));
  }

  // Que représente ce champ ? null : rien qui nous concerne.
  function analyze(el, force) {
    if (!isInput(el) || el.disabled || el.readOnly || !onScreen(el)) return null;
    const scope = scopeOf(el);
    const pws = passwordsIn(scope);
    if (isPassword(el)) {
      if (isNewPassword(el, pws)) return { el, kind: 'new-password', user: userFor(scope, el), pass: el, scope };
      return { el, kind: 'password', user: userFor(scope, el), pass: el, scope };
    }
    if (!isText(el)) return null;
    if (pws.length) {
      const pw = pws[0];
      const login = pws.length === 1 && !isNewPassword(pw, pws);
      if ((login && userFor(scope, pw) === el) || force) return { el, kind: 'username', user: el, pass: login ? pw : null, scope };
      return null;
    }
    if (force || usernameOnly(el, scope)) return { el, kind: 'username', user: el, pass: null, scope };
    return null;
  }

  function report(info, menu) {
    current = info;
    reported = !menu;
    const r = info.el.getBoundingClientRect();
    send({
      type: 'focus',
      field: info.kind,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      pass: !!info.pass,
      user: !!info.user && info.user !== info.pass,
      menu: !!menu,
    });
  }

  function hide() {
    if (!reported) return;
    reported = false;
    send({ type: 'blur' });
  }

  const target = (e) => (e.composedPath ? e.composedPath()[0] : e.target);

  // Le champ vient-il d'être désigné par l'utilisateur lui-même ?
  const byUser = (el) => {
    if (Date.now() - gesture.at > 1000) return false;
    if (gesture.key || gesture.el === el) return true;
    // Clic sur le libellé du champ.
    const label = gesture.el && gesture.el.closest ? gesture.el.closest('label') : null;
    return !!label && label.control === el;
  };
  addEventListener('focusin', (e) => {
    const el = target(e);
    const info = e.isTrusted && byUser(el) ? analyze(el) : null;
    if (info) report(info); else hide();
  }, true);
  addEventListener('focusout', hide, true);
  addEventListener('mousedown', (e) => {
    if (!e.isTrusted || e.button !== 0) return;
    const el = target(e);
    gesture = { el, key: false, at: Date.now() };
    // Clic dans le champ déjà actif : la liste se rouvre.
    const info = isInput(el) && el === (el.getRootNode().activeElement) ? analyze(el) : null;
    if (info) report(info);
  }, true);
  // Tabulation : le champ suivant est atteint au clavier.
  addEventListener('keydown', (e) => {
    if (e.isTrusted && e.key === 'Tab') gesture = { el: null, key: true, at: Date.now() };
  }, true);
  // Clic droit : la cible est retenue pour « Remplir un mot de passe… ».
  addEventListener('contextmenu', (e) => {
    const info = e.isTrusted ? analyze(target(e), true) : null;
    if (info) report(info, true);
  }, true);
  addEventListener('scroll', hide, { capture: true, passive: true });
  addEventListener('resize', hide);

  // --- Envoi d'un formulaire -------------------------------------------------
  // Les valeurs sont relevées quand l'utilisateur valide ; le processus
  // principal ne propose d'enregistrer qu'une fois l'envoi confirmé (la page
  // navigue, ou le champ du mot de passe disparaît).
  function arm(scope) {
    const pws = inputs(scope).filter((el) => isPassword(el) && el.value && userTypedPassword(el) && (visible(el) || wasPassword.has(el)));
    if (!pws.length) {
      // Étape « identifiant seul » : on le retient pour la suivante.
      const user = inputs(scope).find((el) => isText(el) && visible(el) && el.value && userTyped(el) && usernameOnly(el, scope));
      if (user) { lastUsername = user.value; send({ type: 'username', username: user.value.slice(0, 300) }); }
      return;
    }
    let pw = pws[0];
    const fresh = pws.find((el) => tokens(el).includes('new-password'));
    if (fresh) pw = fresh;
    else if (pws.length >= 3) pw = pws[1];
    if (pw.value.length > 1000) return;
    const userEl = userFor(scope, pws[0]);
    const username = (userEl && userEl.value) || hiddenUsername(scope) || lastUsername || '';
    if (userEl && userEl.value) lastUsername = userEl.value;
    send({ type: 'armed', username: username.slice(0, 300), password: pw.value });
    clearInterval(watch);
    let ticks = 0;
    watch = setInterval(() => {
      ticks += 1;
      if (!pw.isConnected || !visible(pw)) { clearInterval(watch); send({ type: 'gone' }); } else if (ticks > 60) clearInterval(watch);
    }, 250);
  }

  const SUBMIT_RE = /log ?in|sign ?in|sign ?up|connexion|connecter|connecte|identifier|continu|next|suivant|submit|valider|envoyer|créer|create|register|inscri|enregistrer|confirm|ok\b|go\b|entrer|enter|anmelden|weiter|acceder|entrar|accedi/i;
  function looksLikeSubmit(btn) {
    const type = typeOf(btn);
    if (btn.localName === 'input') return type === 'submit' || type === 'image';
    if (btn.localName === 'button' && btn.form && type !== 'button' && type !== 'reset') return true;
    const text = `${btn.textContent || ''} ${btn.getAttribute('aria-label') || ''} ${btn.id || ''} ${btn.getAttribute('value') || ''}`.slice(0, 200);
    return SUBMIT_RE.test(text);
  }

  addEventListener('input', (e) => {
    const el = target(e);
    if (!e.isTrusted) return;
    if (isInput(el)) {
      const isPw = typeOf(el) === 'password';
      const before = typed.get(el);
      // « Mot de passe » se décide à la première saisie : un champ de texte
      // changé en password par la page n'en devient pas un. L'inverse (bouton
      // « afficher ») reste un mot de passe.
      if (isPw && !before) wasPassword.add(el);
      typed.set(el, { pw: before ? before.pw : isPw, v: el.value });
    }
    // L'utilisateur saisit lui-même : la liste se retire.
    hide();
  }, true);
  addEventListener('submit', (e) => {
    if (e.isTrusted && e.target && e.target.localName === 'form') arm(e.target);
  }, true);
  addEventListener('keydown', (e) => {
    if (!e.isTrusted || e.key !== 'Enter') return;
    const el = target(e);
    if (isInput(el)) arm(scopeOf(el));
  }, true);
  addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    const el = target(e);
    const btn = el && el.closest ? el.closest('button, input[type=submit], input[type=image], input[type=button], [role=button], a') : null;
    if (!btn || !looksLikeSubmit(btn)) return;
    arm(btn.form || (current && current.scope && current.scope.isConnected ? current.scope : btn.getRootNode()));
  }, true);

  // --- Remplissage -----------------------------------------------------------
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  function setValue(el, value) {
    valueSetter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  ipcRenderer.on(CHANNEL, (e, msg) => {
    if (!msg || !current || !current.el.isConnected) return;
    if (msg.type === 'fill') {
      if (typeof msg.username === 'string' && current.user && current.user !== current.pass && current.user.isConnected) {
        setValue(current.user, msg.username);
        lastUsername = msg.username;
      }
      if (typeof msg.password === 'string' && current.pass && current.pass.isConnected) {
        wasPassword.add(current.pass);
        setValue(current.pass, msg.password);
      }
    } else if (msg.type === 'generated' && typeof msg.password === 'string') {
      // Nouveau mot de passe et sa confirmation, pas l'éventuel « mot de passe actuel ».
      const pws = passwordsIn(current.scope);
      for (const el of pws) {
        if (!isNewPassword(el, pws) && el !== current.el) continue;
        wasPassword.add(el);
        setValue(el, msg.password);
      }
      const user = userFor(current.scope, current.el);
      send({ type: 'generated', username: ((user && user.value) || '').slice(0, 300) });
    }
    reported = false;
  });
}

// Pages web seulement : ni l'interface d'Orbe, ni les extensions, ni about:blank.
if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) start();
