// ChatView: Displays chat messages
export function ChatView({ sessionId }) {
  const el = document.createElement('div');
  el.className = 'messages';
  el.id = 'messages';

  // Initial placeholder content, will be populated by updateChatView in main.js
  if (!sessionId) {
    el.innerHTML = '<div class="empty">No session selected.</div>';
  }
  // Message loading logic is removed from here and handled in main.js

  return el;
}
