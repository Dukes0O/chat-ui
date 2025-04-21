// Sidebar: Lists chat sessions
export function Sidebar({ onSelectSession }) {
  const el = document.createElement('div');
  el.className = 'sidebar';
  el.innerHTML = `<h2>Sessions</h2><ul id="session-list"></ul><button id="new-session">New Session</button>`;

  async function loadSessions() {
    let sessions = [];
    try {
      const res = await fetch('http://localhost:8000/sessions');
      sessions = await res.json();
    } catch (e) {
      sessions = [{ id: '1', title: 'Demo Session (offline)' }];
    }
    const ul = el.querySelector('#session-list');
    ul.innerHTML = '';
    sessions.forEach(sess => {
      const li = document.createElement('li');
      li.textContent = sess.title;
      li.tabIndex = 0;
      li.style.cursor = 'pointer';
      li.onclick = () => {
        console.log('[DEBUG] Session selected:', sess.id);
        onSelectSession(sess.id);
      };
      li.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          li.onclick();
        }
      };
      ul.appendChild(li);
    });
  }

  // Create new session
  el.querySelector('#new-session').onclick = async () => {
    const title = prompt('Session title?');
    if (!title) return;
    const res = await fetch(`http://localhost:8000/sessions?title=${title}`, {
      method: 'POST'
    });
    await loadSessions();
  };

  loadSessions();
  return el;
}
