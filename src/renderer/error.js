// Page affichée quand un site ne répond pas. Aucun accès privilégié ici.
const q = new URLSearchParams(location.search);
document.title = q.get('title') || '';
document.getElementById('title').textContent = q.get('title') || '';
document.getElementById('url').textContent = q.get('url') || '';
document.getElementById('desc').textContent = `${q.get('desc') || ''} (${q.get('code') || ''})`;
const retry = document.getElementById('retry');
retry.textContent = q.get('retry') || '↻';
const target = q.get('url') || '';
if (/^https?:/i.test(target)) retry.href = target;
