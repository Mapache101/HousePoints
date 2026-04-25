import { HOUSES } from "../config.js";
import { listenHouseTotals } from "../services/house-service.js";
import { escapeHtml } from "../utils.js";
import { pageHeader } from "../ui/dom.js";

let unsubscribe = null;

export function renderPublicDashboard(ctx) {
  if (unsubscribe) unsubscribe();
  ctx.setMain(`${pageHeader("House Cup Dashboard", "Live house totals from the existing Firebase database.")}
    <div id="house-total-grid" class="grid cols-4"></div>
    <div class="card mt-4">
      <h3>Unified V2 testing</h3>
      <p class="muted mb-0">This page reads the same <code>houseTotals</code> collection used by the legacy House Cup page.</p>
    </div>
  `);

  const grid = document.getElementById("house-total-grid");
  const draw = (totals) => {
    const ordered = [...HOUSES].sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0));
    grid.innerHTML = ordered.map((house, index) => `
      <div class="card house-card" style="--house-color:${house.color}">
        <div>
          <span class="badge ${index === 0 ? "success" : ""}">${index === 0 ? "Leader" : `Rank ${index + 1}`}</span>
          <div class="house-name mt-2">${escapeHtml(house.name)}</div>
        </div>
        <div>
          <div class="house-points">${Number(totals[house.id] || 0).toLocaleString()}</div>
          <div class="muted small">points</div>
        </div>
      </div>
    `).join("");
  };

  draw(Object.fromEntries(HOUSES.map((h) => [h.id, 0])));
  unsubscribe = listenHouseTotals(draw);
  ctx.registerCleanup(() => unsubscribe && unsubscribe());
}
