// ModelPicker: Dropdown populated by /models
export function ModelPicker({ onChange, attachedFiles = [] }) {
  const el = document.createElement('div');
  el.className = 'model-selector';
  const select = document.createElement('select');
  select.id = 'model-select';
  el.innerHTML = 'Model: ';
  el.appendChild(select);

  async function loadModels() {
    try {
      const res = await fetch('http://localhost:8000/models');
      const models = await res.json();
      select.innerHTML = '';
      let anyEnabled = false;
      models.forEach(model => {
        const opt = document.createElement('option');
        opt.value = model.id;
        opt.textContent = model.name;
        // Disable if files attached but model does not support vision
        if (attachedFiles.length && model.vision === false) {
          opt.disabled = true;
        } else {
          anyEnabled = true;
        }
        select.appendChild(opt);
      });
      if (!anyEnabled) {
        select.innerHTML = '<option>No models available</option>';
        select.disabled = true;
      } else {
        select.disabled = false;
      }
    } catch (e) {
      select.innerHTML = '<option>Failed to load models</option>';
      select.disabled = true;
      console.error('Failed to load models:', e);
    }
  }
  select.onchange = e => onChange(e.target.value);
  loadModels();
  return el;
}
