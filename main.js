// Utility: Fix markdown tables that are not properly formatted (AI bug workaround)
function fixMarkdownTables(md) {
  // If the string contains at least two pipe chars and at least one line without a newline, try to fix
  if (!md.includes('|')) return md;
  // Heuristic: If there are table pipes but no newlines between rows, try to split into rows
  // Replace multiple spaces after pipes with a single pipe and newline
  let fixed = md.replace(/\|\s*(?=\|)/g, '|');
  // If there are table headers and no newlines, insert newlines after each table row
  // Find table header lines (pipes with dashes)
  fixed = fixed.replace(/(\|[\- ]+\|)/g, '$1\n');
  // Insert newlines after each row if not present
  fixed = fixed.replace(/(\|[^\n]+\|)/g, (m) => m.endsWith('\n') ? m : m + '\n');
  return fixed;
}

// Utility: Convert [ \math ] and [\math] to $\math$ for KaTeX rendering
function convertBracketsToMath(md) {
  // Replace [ \something ] or [\something ] or [ \something] with $\something$
  return md.replace(/\[\\([^\]]+)\]/g, (m, expr) => `$\\${expr.trim()}$`);
}

// Utility: Render math expressions in the DOM using KaTeX (after marked)
function renderMathInElementIfAvailable(el) {
  if (window.renderMathInElement) {
    window.renderMathInElement(el, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false}
      ],
      throwOnError: false
    });
  }
}

// Entry point for LAN AI Chat
import './style.css';
import { Sidebar } from './components/sidebar.js';
import { ChatView } from './components/chatview.js';
import { Composer } from './components/composer.js';
import { ModelPicker } from './components/modelpicker.js';
import { CostMeter } from './components/costmeter.js';
import { marked } from 'marked';

// DEBUG: Test markdown table rendering
// Uncomment to test table rendering in chat view
// setTimeout(() => {
//   const testDiv = document.createElement('div');
//   testDiv.className = 'msg msg-assistant';
//   testDiv.innerHTML = `<span class="msg-label">AI:</span> ` + marked.parse(`| Col1 | Col2 |\n|------|------|\n| A    | B    |\n| C    | D    |`);
//   chatViewElement.appendChild(testDiv);
// }, 1000);

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
      if (msg.role === 'assistant') {
        let fixedContent = fixMarkdownTables(msg.content || '');
        fixedContent = convertBracketsToMath(fixedContent);
        div.innerHTML = `<span class="msg-label">AI:</span> ` + marked.parse(fixedContent);
        renderMathInElementIfAvailable(div);
      } else {
        let userContent = convertBracketsToMath(msg.content || '');
        div.innerHTML = `<span class="msg-label">You:</span> ` + marked.parseInline(userContent);
        renderMathInElementIfAvailable(div);
      }
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

  // --- PERSIST USER MESSAGE BEFORE SENDING TO AI ---
  await fetch(`http://localhost:8000/sessions/${currentSession}/messages`, {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: "user", content: msg })
  });

  // Build message history for context (limit to last 30 messages)
  let history = [];
  try {
    const res = await fetch(`http://localhost:8000/sessions/${currentSession}/messages`);
    if (res.ok) {
      history = await res.json();
      // Only keep the last 30 messages for context
      history = history.slice(-30);
    } else {
      // Fallback: just use the current message
      history = [{ role: 'user', content: msg }];
    }
  } catch (e) {
    console.warn('[WARN] Could not fetch message history for context:', e);
    history = [{ role: 'user', content: msg }];
  }

  const file_ids = files && files.length ? files.filter(f => f.file_id).map(f => f.file_id) : [];
  const body = {
    session_id: currentSession,
    prompt: msg,
    model: selectedModel,
    file_ids,
    history // Pass context to backend
  };
  console.log('[DEBUG] Sending chat body:', body);

  // Remove any existing placeholder/duplicate assistant message
  const existingPlaceholders = chatViewElement.querySelectorAll('.msg-assistant[data-temp]');
  existingPlaceholders.forEach(el => el.remove());

  // Append a placeholder for the assistant message
  const assistantMsgDiv = document.createElement('div');
  assistantMsgDiv.className = 'msg msg-assistant';
  assistantMsgDiv.setAttribute('data-temp', '1');
  assistantMsgDiv.innerHTML = `<span class="msg-label">AI:</span> <span class="msg-content"></span>`;
  chatViewElement.appendChild(assistantMsgDiv);
  chatViewElement.scrollTop = chatViewElement.scrollHeight;

  try {
    const res = await fetch('http://localhost:8000/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok || !res.body) {
        const errText = await res.text();
        assistantMsgDiv.innerHTML = `<span class="msg-label">AI:</span> [error ${res.status}] ${errText}`;
        console.error('[ERROR] /chat response:', res.status, errText);
        return;
    }

    // Streaming response handling
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let done = false;
    let assistantContent = ""; // Accumulate content here
    let buffer = ""; // Buffer for partial JSON chunks

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
                        let fixedChunk = fixMarkdownTables(chunkData.content || '');
                        fixedChunk = convertBracketsToMath(fixedChunk);
                        assistantContent += fixedChunk;
                        // Streamed content update
                        assistantMsgDiv.querySelector('.msg-content').innerHTML = marked.parse(fixedChunk);
                        renderMathInElementIfAvailable(assistantMsgDiv);
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
    let fixedFinal = fixMarkdownTables(assistantContent);
    fixedFinal = convertBracketsToMath(fixedFinal);
    assistantMsgDiv.querySelector('.msg-content').innerHTML = marked.parse(fixedFinal);
    renderMathInElementIfAvailable(assistantMsgDiv);
    assistantMsgDiv.removeAttribute('data-temp'); // Mark as permanent
    console.log("[DEBUG] Stream finished. Final accumulated content:", fixedFinal);
    console.log("[DEBUG] Final innerHTML set:", assistantMsgDiv.innerHTML);

    // Persist the assistant message to the backend
    await fetch(`http://localhost:8000/sessions/${currentSession}/messages`, {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: "assistant", content: fixedFinal })
    });

    chatViewElement.scrollTop = chatViewElement.scrollHeight;

    // Remove the streaming placeholder and reload chat history for this session
    assistantMsgDiv.remove();
    await updateChatView(currentSession, chatViewElement);
  } catch (err) {
    assistantMsgDiv.innerHTML = `<span class="msg-label">AI:</span> [error] ${err.message}`;
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
