import { HOUSES, RANK_LABELS, POINTS_BY_RANK } from "../config.js";
import {
  submitRanking,
  listenMyPendingRankings,
  listenAllRankings,
  deleteRanking,
  processPendingRankings,
  resetHouseTotals,
  listenHouseTotals
} from "../services/house-service.js";
import { escapeHtml, formatDateTime, houseById, getSafeArray, downloadCsv } from "../utils.js";
import { pageHeader, notice, setBusy } from "../ui/dom.js";

let unsubs = [];
let myPending = [];
let allRankings = [];
let totals = {};
let editing = null;
let rankingFilter = { status: "all", search: "" };
let draftRanks = { first: [], second: [], third: [], fourth: [] };

function stop() {
  unsubs.forEach((fn) => fn && fn());
  unsubs = [];
  editing = null;
  draftRanks = { first: [], second: [], third: [], fourth: [] };
}

function resetDraftRanks() {
  draftRanks = { first: [], second: [], third: [], fourth: [] };
}

function normalizeRanks(ranks = {}) {
  return Object.fromEntries(RANK_LABELS.map(([rank]) => [rank, getSafeArray(ranks[rank])]));
}

function ranksAreValid(ranks) {
  const values = Object.values(ranks).flat().filter(Boolean);
  return values.length === HOUSES.length && new Set(values).size === HOUSES.length;
}

function rankForHouse(houseId) {
  for (const [rank] of RANK_LABELS) {
    if (draftRanks[rank].includes(houseId)) return rank;
  }
  return null;
}

function toggleHouse(place, houseId) {
  const alreadyInPlace = draftRanks[place].includes(houseId);
  for (const [rank] of RANK_LABELS) {
    draftRanks[rank] = draftRanks[rank].filter((id) => id !== houseId);
  }
  if (!alreadyInPlace) draftRanks[place].push(houseId);
  drawRankBuilder();
}

function ranksSummary(ranks = {}) {
  return RANK_LABELS.map(([rank, label, points]) => {
    const names = getSafeArray(ranks[rank]).map((id) => houseById(id).name).join(", ") || "-";
    return `${label} (${points}): ${names}`;
  }).join(" | ");
}

function drawRankBuilder() {
  const target = document.getElementById("rank-builder");
  const complete = document.getElementById("rank-complete-state");
  if (!target) return;
  const placed = Object.values(draftRanks).flat().length;
  const unique = new Set(Object.values(draftRanks).flat()).size;
  target.innerHTML = `<div class="rank-board">
    ${RANK_LABELS.map(([rank, label, points]) => `
      <div class="rank-column">
        <div class="rank-header"><strong>${escapeHtml(label)}</strong><span>${points} pts</span></div>
        <div class="rank-house-grid">
          ${HOUSES.map((house) => {
            const selected = draftRanks[rank].includes(house.id);
            const otherRank = rankForHouse(house.id);
            return `<button type="button" class="house-rank-button ${selected ? "selected" : ""}" style="--house-color:${house.color}" data-rank="${rank}" data-house="${house.id}">
              <span>${escapeHtml(house.name)}</span>
              ${otherRank && !selected ? `<small>in ${escapeHtml(otherRank)}</small>` : ""}
            </button>`;
          }).join("")}
        </div>
      </div>`).join("")}
  </div>`;
  if (complete) {
    complete.innerHTML = ranksAreValid(draftRanks)
      ? `<span class="badge success">Complete: ${placed}/${HOUSES.length} houses placed</span>`
      : `<span class="badge warn">Place every house exactly once (${unique}/${HOUSES.length})</span>`;
  }
  target.querySelectorAll("[data-rank][data-house]").forEach((button) => {
    button.addEventListener("click", () => toggleHouse(button.dataset.rank, button.dataset.house));
  });
}

function drawTotals() {
  const target = document.getElementById("points-totals");
  if (!target) return;
  const ordered = [...HOUSES].sort((a, b) => Number(totals[b.id] || 0) - Number(totals[a.id] || 0));
  target.innerHTML = `<div class="mini-house-list">
    ${ordered.map((h, index) => `<div class="mini-house-row" style="--house-color:${h.color}">
      <span><strong>#${index + 1} ${escapeHtml(h.name)}</strong></span>
      <strong>${Number(totals[h.id] || 0).toLocaleString()}</strong>
    </div>`).join("")}
  </div>`;
}

function drawMyPending() {
  const target = document.getElementById("my-pending-rankings");
  if (!target) return;
  if (!myPending.length) {
    target.innerHTML = `<p class="muted">No pending submissions.</p>`;
    return;
  }
  target.innerHTML = `<div class="record-list">
    ${myPending.map((row) => `
      <div class="record-item">
        <div class="record-top">
          <div>
            <div class="record-title">${escapeHtml(row.month || "No label")}</div>
            <div class="muted small">${escapeHtml(formatDateTime(row.timestamp))}</div>
          </div>
          <span class="badge warn">Pending</span>
        </div>
        <p class="muted">${escapeHtml(ranksSummary(row.ranks))}</p>
        <div class="btn-row">
          <button class="btn small secondary" data-edit-ranking="${escapeHtml(row.id)}">Edit</button>
          <button class="btn small danger" data-delete-ranking="${escapeHtml(row.id)}">Delete</button>
        </div>
      </div>`).join("")}
  </div>`;

  target.querySelectorAll("[data-edit-ranking]").forEach((button) => {
    button.addEventListener("click", () => {
      editing = myPending.find((r) => r.id === button.dataset.editRanking);
      const form = document.getElementById("ranking-form");
      form.month.value = editing.month || editing.className || "";
      draftRanks = normalizeRanks(editing.ranks || {});
      document.getElementById("ranking-submit-label").textContent = "Update pending submission";
      drawRankBuilder();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  target.querySelectorAll("[data-delete-ranking]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this pending point submission?")) return;
      await deleteRanking(button.dataset.deleteRanking);
    });
  });
}

function filteredAdminRows() {
  const status = rankingFilter.status;
  const search = rankingFilter.search.toLowerCase();
  let rows = [...allRankings];
  if (status === "pending") rows = rows.filter((r) => !r.processed);
  if (status === "processed") rows = rows.filter((r) => r.processed);
  if (search) {
    rows = rows.filter((r) => `${r.teacherEmail || ""} ${r.month || ""} ${ranksSummary(r.ranks)}`.toLowerCase().includes(search));
  }
  return rows;
}

function pendingTally(rows = allRankings.filter((r) => !r.processed)) {
  const tally = Object.fromEntries(HOUSES.map((h) => [h.id, 0]));
  for (const row of rows) {
    for (const [rank, points] of Object.entries(POINTS_BY_RANK)) {
      for (const houseId of getSafeArray(row.ranks?.[rank])) {
        if (tally[houseId] !== undefined) tally[houseId] += points;
      }
    }
  }
  return tally;
}

function exportRankings(rows = allRankings) {
  downloadCsv("house-point-submissions.csv", [
    "Date", "Teacher Email", "Month/Event", "First", "Second", "Third", "Fourth", "Processed", "Processed By", "Processed At", "Source"
  ], rows.map((row) => [
    formatDateTime(row.timestamp),
    row.teacherEmail || "",
    row.month || "",
    getSafeArray(row.ranks?.first).map((id) => houseById(id).name).join("; "),
    getSafeArray(row.ranks?.second).map((id) => houseById(id).name).join("; "),
    getSafeArray(row.ranks?.third).map((id) => houseById(id).name).join("; "),
    getSafeArray(row.ranks?.fourth).map((id) => houseById(id).name).join("; "),
    row.processed ? "Processed" : "Pending",
    row.processedBy || "",
    formatDateTime(row.processedAt),
    row.sourceApp || "legacy"
  ]));
}

function drawAdminRankings(ctx) {
  const target = document.getElementById("all-rankings");
  if (!target) return;
  const pending = allRankings.filter((r) => !r.processed);
  const rows = filteredAdminRows();
  const tally = pendingTally(pending);
  target.innerHTML = `
    <div class="grid cols-4">
      <div class="card subtle"><div class="muted small">Pending submissions</div><div class="kpi small-kpi">${pending.length}</div></div>
      ${HOUSES.slice(0, 3).map((h) => `<div class="card subtle"><div class="muted small">Pending ${escapeHtml(h.name)}</div><div class="kpi small-kpi">+${tally[h.id] || 0}</div></div>`).join("")}
    </div>
    <div class="btn-row mt-3 mb-0">
      <button id="process-rankings" class="btn success" ${pending.length ? "" : "disabled"}>Process ${pending.length} pending</button>
      <button id="reset-points" class="btn danger">Reset totals</button>
      <button id="export-rankings" class="btn secondary">Export visible CSV</button>
      <select id="ranking-status-filter"><option value="all">All statuses</option><option value="pending">Pending</option><option value="processed">Processed</option></select>
      <input id="ranking-search" placeholder="Search teacher, month, house" />
    </div>
    <div class="table-wrap mt-3">
      <table>
        <thead><tr><th>Date</th><th>Teacher</th><th>Month/Event</th><th>Ranks</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(formatDateTime(row.timestamp))}</td>
              <td>${escapeHtml(row.teacherEmail || "")}</td>
              <td>${escapeHtml(row.month || "")}</td>
              <td>${escapeHtml(ranksSummary(row.ranks))}</td>
              <td><span class="badge ${row.processed ? "success" : "warn"}">${row.processed ? "Processed" : "Pending"}</span></td>
              <td><button class="btn small danger" data-admin-delete-ranking="${escapeHtml(row.id)}">Delete</button></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  document.getElementById("ranking-status-filter").value = rankingFilter.status;
  document.getElementById("ranking-search").value = rankingFilter.search;
  document.getElementById("process-rankings")?.addEventListener("click", async (event) => {
    if (!confirm(`Process ${pending.length} pending submissions and add points to house totals?`)) return;
    const done = setBusy(event.currentTarget, "Processing...");
    try {
      const result = await processPendingRankings({ actorEmail: ctx.user.email });
      ctx.toast(`Processed ${result.count || pending.length} submissions.`, "success");
    } catch (error) {
      console.error(error);
      ctx.toast(error.message || "Failed to process points.", "danger");
    } finally {
      done();
    }
  });

  document.getElementById("reset-points")?.addEventListener("click", async (event) => {
    if (!confirm("This will reset all house totals to 0. Continue?")) return;
    const done = setBusy(event.currentTarget, "Resetting...");
    try {
      await resetHouseTotals({ actorEmail: ctx.user.email });
      ctx.toast("House totals reset.", "success");
    } catch (error) {
      console.error(error);
      ctx.toast(error.message || "Failed to reset totals.", "danger");
    } finally {
      done();
    }
  });

  document.getElementById("export-rankings")?.addEventListener("click", () => exportRankings(filteredAdminRows()));
  document.getElementById("ranking-status-filter")?.addEventListener("change", (event) => { rankingFilter.status = event.target.value; drawAdminRankings(ctx); });
  document.getElementById("ranking-search")?.addEventListener("input", (event) => { rankingFilter.search = event.target.value; drawAdminRankings(ctx); });
  target.querySelectorAll("[data-admin-delete-ranking]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this ranking record? This does not reverse already processed points.")) return;
      await deleteRanking(button.dataset.adminDeleteRanking);
      ctx.toast("Ranking record deleted.", "success");
    });
  });
}

export function renderPoints(ctx) {
  stop();
  const canSubmit = ctx.can("canSubmitPoints");
  const canProcess = ctx.can("canProcessHousePoints");
  resetDraftRanks();

  ctx.setMain(`${pageHeader("House Points", "Submit rankings and process points using the existing rankings and houseTotals collections.")}
    <div id="points-toast"></div>
    ${!canSubmit ? notice("You do not currently have permission to submit house points.", "warn") : ""}
    <div class="grid ${canProcess ? "cols-3" : "cols-2"}">
      <div class="card ${canProcess ? "wide-2" : ""}">
        <h2>Submit rankings</h2>
        <p class="muted small">Same as the original portal: each house must be placed exactly once. Multiple houses can share a rank if you intentionally leave another rank empty, but every house must be assigned.</p>
        <form id="ranking-form" class="form-grid">
          <div class="field">
            <label>Month / class / event label</label>
            <input name="month" placeholder="April House Match" required ${canSubmit ? "" : "disabled"} />
          </div>
          <div id="rank-builder"></div>
          <div id="rank-complete-state"></div>
          <div class="btn-row">
            <button class="btn gold" id="ranking-submit-label" type="submit" ${canSubmit ? "" : "disabled"}>Submit ranking</button>
            <button class="btn secondary" id="clear-ranking" type="button">Clear</button>
          </div>
        </form>
      </div>
      <div class="card">
        <h2>Current totals</h2>
        <div id="points-totals">Loading...</div>
        <div class="divider"></div>
        <h2>My pending submissions</h2>
        <div id="my-pending-rankings">Loading...</div>
      </div>
    </div>
    ${canProcess ? `<div class="card mt-4"><h2>Coordinator processing</h2><div id="all-rankings">Loading...</div></div>` : ""}`);

  ctx.toast = (message, type = "blue") => {
    const target = document.getElementById("points-toast");
    if (target) target.innerHTML = notice(message, type);
    setTimeout(() => { if (target) target.innerHTML = ""; }, 3500);
  };

  drawRankBuilder();

  const form = document.getElementById("ranking-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ranksAreValid(draftRanks)) {
      ctx.toast("Each house must appear exactly once before submitting.", "warn");
      return;
    }
    const done = setBusy(form.querySelector("button[type='submit']"), editing ? "Updating..." : "Submitting...");
    try {
      await submitRanking({ user: ctx.user, month: form.month.value, ranks: normalizeRanks(draftRanks), editingId: editing?.id || null });
      ctx.toast(editing ? "Pending submission updated." : "Ranking submitted for processing.", "success");
      editing = null;
      resetDraftRanks();
      form.reset();
      document.getElementById("ranking-submit-label").textContent = "Submit ranking";
      drawRankBuilder();
    } catch (error) {
      console.error(error);
      ctx.toast(error.message || "Could not save ranking.", "danger");
    } finally {
      done();
    }
  });

  document.getElementById("clear-ranking").addEventListener("click", () => {
    editing = null;
    resetDraftRanks();
    form.reset();
    document.getElementById("ranking-submit-label").textContent = "Submit ranking";
    drawRankBuilder();
  });

  if (ctx.user) {
    unsubs.push(listenMyPendingRankings(ctx.user, (rows) => { myPending = rows; drawMyPending(); }));
    unsubs.push(listenHouseTotals((nextTotals) => { totals = nextTotals; drawTotals(); }));
  }
  if (canProcess) {
    unsubs.push(listenAllRankings((rows) => { allRankings = rows; drawAdminRankings(ctx); }));
  }
  ctx.registerCleanup(stop);
}
