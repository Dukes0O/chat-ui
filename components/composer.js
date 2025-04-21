// Composer: Textarea + file upload + file chips
export function Composer({ onSend, onFile }) {
  const el = document.createElement('form');
  el.id = 'chat-form';
  el.innerHTML = `
    <input type="text" id="chat-input" placeholder="Type a message..." autocomplete="off" />
    <button type="submit">Send</button>
    <input type="file" id="file-upload" multiple style="display:none;" />
    <button type="button" id="file-btn">Attach File</button>
    <div id="file-chips"></div>
  `;

  const fileChips = [];

  el.addEventListener('submit', e => {
    e.preventDefault();
    const input = el.querySelector('#chat-input');
    if (input.value.trim()) {
      onSend(input.value, fileChips.map(f => f.fileInfo));
      input.value = '';
      // Clear file chips after send
      fileChips.length = 0;
      el.querySelector('#file-chips').innerHTML = '';
    }
  });
  el.querySelector('#file-btn').onclick = () => el.querySelector('#file-upload').click();
  el.querySelector('#file-upload').onchange = async (e) => {
    for (const file of Array.from(e.target.files)) {
      // Upload file to backend
      const formData = new FormData();
      formData.append('file', file);
      let fileInfo = { name: file.name };
      try {
        const res = await fetch('http://localhost:8000/upload', {
          method: 'POST',
          body: formData
        });
        fileInfo = await res.json();
      } catch (err) {
        fileInfo = { name: file.name, error: true };
      }
      fileChips.push({ fileInfo });
      const chip = document.createElement('span');
      chip.textContent = fileInfo.name + (fileInfo.error ? ' (failed)' : '');
      chip.className = 'file-chip';
      chip.onclick = () => {
        // Remove chip on click
        fileChips.splice(fileChips.findIndex(f => f.fileInfo === fileInfo), 1);
        chip.remove();
      };
      el.querySelector('#file-chips').appendChild(chip);
      onFile(fileInfo);
    }
    // Reset input so same file can be re-added
    e.target.value = '';
  };
  return el;
}
