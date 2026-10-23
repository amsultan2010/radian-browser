// macOS-specific pieces gathered in one place: window chrome, default browser, Arc paths.
// Radian runs on macOS only.
const os = require('os');
const path = require('path');

const isMac = process.platform === 'darwin';

// --- Habillage des fenêtres ---------------------------------------------------
// Options de fenêtre propres au système.
//   traffic : position des feux tricolores ;
//   inset   : fenêtre annexe à barre de titre « hiddenInset » (réglages, Boost).
function windowChrome({ traffic, inset = false } = {}) {
  const o = { titleBarStyle: inset ? 'hiddenInset' : 'hidden', vibrancy: 'sidebar', backgroundColor: '#00000000' };
  if (traffic) o.trafficLightPosition = traffic;
  return o;
}

// Feux tricolores de macOS.
function setButtons(win, visible, traffic) {
  win.setWindowButtonVisibility(visible);
  if (visible) win.setWindowButtonPosition(traffic);
}

// --- Navigateur par défaut ------------------------------------------------------
function makeDefault() {
  const { app } = require('electron');
  app.setAsDefaultProtocolClient('http');
  app.setAsDefaultProtocolClient('https');
}

// --- Chemins ------------------------------------------------------------------
// Fichier de barre latérale d'Arc.
function arcSidebarFile() {
  return isMac ? path.join(os.homedir(), 'Library', 'Application Support', 'Arc', 'StorableSidebar.json') : '';
}

// Dossier des profils Chromium d'Arc (historique, mots de passe, cookies).
function arcUserDataDir() {
  return isMac ? path.join(os.homedir(), 'Library', 'Application Support', 'Arc', 'User Data') : '';
}

module.exports = { isMac, windowChrome, setButtons, makeDefault, arcSidebarFile, arcUserDataDir };
