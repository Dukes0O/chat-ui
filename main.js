// Entry point for LAN AI Chat
import './style.css';
import { Sidebar } from './components/sidebar.js';
import { ChatView } from './components/chatview.js';
import { Composer } from './components/composer.js';
import { ModelPicker } from './components/modelpicker.js';
import { CostMeter } from './components/costmeter.js';

const app = document.getElementById('app');

let currentSession = null;
let currentCost = 0.0;
let selectedModel = 'gpt-4.1-mini'; // default to general
let attachedFiles = [];

// Persistent DOM elements
let sidebarElement;
let chatViewElement;
let composerElement;
let modelPickerElement;
let costMeterElement;
let mainAreaElement;

// Function to load messages for a session into the chat view
async function updateChatView(sessionId, viewElement) {
  if (!sessionId) {
    viewElement.innerHTML = '<div class="empty">No session selected.</div>';
    return;
  }
  viewElement.innerHTML = '<div class="empty">Loading messages...</div>'; // Show loading state
  try {
    console.log(`[DEBUG] Fetching messages for session: ${sessionId}`);
    const res = await fetch(`http://localhost:8000/sessions/${sessionId}/messages`);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const messages = await res.json();
    console.log(`[DEBUG] Received ${messages.length} messages.`);
    viewElement.innerHTML = ''; // Clear loading/previous messages
    if (messages.length === 0) {
        viewElement.innerHTML = '<div class="empty">No messages yet. Start chatting!</div>';
    }
    messages.forEach(msg => {
      const div = document.createElement('div');
      div.className = `msg msg-${msg.role}`;
      div.textContent = `${msg.role === 'user' ? 'You' : 'AI'}: ${msg.content}`;
      viewElement.appendChild(div);
    });
    // Scroll to bottom
    viewElement.scrollTop = viewElement.scrollHeight;
  } catch (e) {
    console.error('[ERROR] Failed to load messages:', e);
    viewElement.innerHTML = `<div class="empty">Failed to load messages: ${e.message}</div>`;
  }
}

// Function to handle sending a message
async function handleSend(msg, files) {
  if (!currentSession) {
    console.error('[ERROR] No session selected');
    return;
  }
  if (!selectedModel) {
    console.error('[ERROR] No model selected');
    return;
  }
  if (!msg) {
    console.error('[ERROR] Prompt is empty');
    return;
  }

  // Clear empty message if present
  const emptyMsg = chatViewElement.querySelector('.empty');
  if (emptyMsg) chatViewElement.removeChild(emptyMsg);

  // Append user message immediately
  const userMsgDiv = document.createElement('div');
  userMsgDiv.className = 'msg msg-user';
  userMsgDiv.textContent = `You: ${msg}`;
  chatViewElement.appendChild(userMsgDiv);
  chatViewElement.scrollTop = chatViewElement.scrollHeight; // Scroll down

  // Clear composer and reset files
  if (composerElement.querySelector('textarea')) {
    composerElement.querySelector('textarea').value = '';
  }
  attachedFiles = [];
  // TODO: Update composer UI to reflect cleared files if needed

  const file_ids = files && files.length ? files.filter(f => f.file_id).map(f => f.file_id) : [];
  const body = {
    session_id: currentSession,
    prompt: msg,
    model: selectedModel,
    file_ids
  };
  console.log('[DEBUG] Sending chat body:', body);

  // Append a placeholder for the assistant message
  const assistantMsgDiv = document.createElement('div');
  assistantMsgDiv.className = 'msg msg-assistant';
  assistantMsgDiv.innerHTML = 'AI: Thinking...'; // Placeholder
  chatViewElement.appendChild(assistantMsgDiv);
  chatViewElement.scrollTop = chatViewElement.scrollHeight; // Scroll down

  try {
    const res = await fetch('http://localhost:8000/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok || !res.body) {
        const errText = await res.text();
        assistantMsgDiv.innerHTML = `AI: [error ${res.status}] ${errText}`;
        console.error('[ERROR] /chat response:', res.status, errText);
        return;
    }

    // Streaming response handling
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let done = false;
    let assistantContent = ""; // Accumulate content here
    let buffer = ""; // Buffer for partial JSON chunks

    assistantMsgDiv.innerHTML = 'AI: '; // Clear placeholder

    while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (line) {
                try {
                    const chunkData = JSON.parse(line);
                    if (chunkData.content) {
                        assistantContent += chunkData.content;
                        assistantMsgDiv.innerHTML = 'AI: ' + assistantContent;
                        chatViewElement.scrollTop = chatViewElement.scrollHeight;
                    }
                } catch (e) {
                    console.warn('[WARN] Failed to parse JSON line during stream:', line, e);
                }
            }
        }
    }
    // After loop, process any remaining buffer content (e.g., if backend doesn't end with newline)
    if (buffer.trim()) {
        console.log("[DEBUG] Processing final buffer content:", buffer);
        try {
            const chunkData = JSON.parse(buffer.trim());
            if (chunkData.content) {
                assistantContent += chunkData.content;
            }
        } catch (e) {
             console.warn('[WARN] Failed to parse final buffer content as JSON:', buffer, e);
             assistantContent += buffer.trim();
        }
    }
    // Final update to ensure the complete message persists
    console.log("[DEBUG] Stream finished. Final accumulated content:", assistantContent);
    assistantMsgDiv.innerHTML = 'AI: ' + assistantContent;
    console.log("[DEBUG] Final innerHTML set:", assistantMsgDiv.innerHTML);

    // Persist the assistant message to the backend
    await fetch(`http://localhost:8000/sessions/${currentSession}/messages`, {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: "assistant", content: assistantContent })
    });

    chatViewElement.scrollTop = chatViewElement.scrollHeight;

  } catch (err) {
    assistantMsgDiv.innerHTML = `AI: [error] ${err.message}`;
    console.error('Chat send error:', err);
    chatViewElement.scrollTop = chatViewElement.scrollHeight;
  }
}

// Function to handle session selection
function handleSelectSession(sessionId) {
  console.log(`[DEBUG] Selecting session: ${sessionId}`);
  currentSession = sessionId;
  attachedFiles = []; // Reset files on session switch
  updateChatView(sessionId, chatViewElement); // Update the persistent chat view
  // Optionally, update composer state (e.g., enable/disable)
  if (composerElement.querySelector('textarea')) {
    composerElement.querySelector('textarea').disabled = !sessionId;
  }
}

// Function to initialize and render the layout once
function renderLayout() {
  app.innerHTML = ''; // Clear app container
  const container = document.createElement('div');
  container.className = 'chat-container';

  // Create Sidebar (only needs creating once if its internal state doesn't change drastically)
  sidebarElement = Sidebar({
    onSelectSession: handleSelectSession
  });
  container.appendChild(sidebarElement);

  // Create Main Area
  mainAreaElement = document.createElement('div');
  mainAreaElement.className = 'chat-main';

  // Top Bar (ModelPicker, CostMeter)
  const topBar = document.createElement('div');
  topBar.className = 'top-bar';
  modelPickerElement = ModelPicker({ selectedModel: selectedModel, onChange: (newModel) => { selectedModel = newModel; } });
  costMeterElement = CostMeter({ cost: currentCost }); // Assuming CostMeter just displays
  topBar.appendChild(modelPickerElement);
  topBar.appendChild(costMeterElement);
  mainAreaElement.appendChild(topBar);

  // Create ChatView (persistent element)
  chatViewElement = ChatView({ sessionId: currentSession });
  mainAreaElement.appendChild(chatViewElement);

  // Create Composer (persistent element)
  composerElement = Composer({
    onSend: handleSend,
    onFile: (file) => {
      attachedFiles.push(file);
      console.log('[DEBUG] File attached:', file, 'Current files:', attachedFiles);
      // Optionally update UI to show attached files
    }
  });
  mainAreaElement.appendChild(composerElement);

  // Assemble
  container.appendChild(mainAreaElement);
  app.appendChild(container);

  // Initial load for default/restored session if any
  if (currentSession) {
    updateChatView(currentSession, chatViewElement);
  }
}

// Initial render
renderLayout();
