// CostMeter: Shows per-session cost
export function CostMeter({ cost = 0.0 }) {
  const el = document.createElement('div');
  el.className = 'cost-meter';
  el.textContent = `Cost: $${cost.toFixed(2)}`;
  // TODO: Update cost live from SSE/meta events or API
  return el;
}
