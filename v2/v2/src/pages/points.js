import { HOUSES, RANK_LABELS } from "../config.js";
import {
  submitRanking,
  listenMyPendingRankings,
  listenAllRankings,
  deleteRanking,
  processPendingRankings,
  resetHouseTotals
} from "../services/house-service.js";
import { escapeHtml, formatDateTime, houseById, getSafeArray, downloadText } from "../utils.js";
import { pageHeader, notice, optionList, setBusy } from "../ui/dom.js";

let unsubs = [];
let myPending = [];
let allRankings = [];
let editing = null;

function stop() {
  unsubs.forEach((fn) => fn && fn());
  unsubs = [];
}

function selectedRanksFromForm(form) {
  const ranks = {};
  for (const [rank] of RANK_LABELS) {
    ranks[rank] = [form.querySelector(`[name="${rank}"]`).value].filter(Boolean);
  }
  return ranks;
}

function ranksAreValid(ranks) {
  const values = Object.values(ranks).flat().filter(Boolean);
  return values.length === HOUSES.length && new Set(values).size === HOUSES.length;
}

function ranksSummary(ranks = {}) {
  return RANK_LABELS.map(([rank, label]) => {
    const names = getSafeArray(ranks[rank]).map((id) => houseById(id).name).join(", ") || "-";
    return `${label}: ${names}`;
  }).join(" | ");
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
            <div class="record-title">${escapeHtml(row.month || "No month")}</div>
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
      form.month.value = editing.month || "";
      for (const [rank] of RANK_LABELS) {
        form.querySelector(`[name="${rank}"]`).value = getSafeArray(editing.ranks?.[rank])[0] || "";
      }
      document.getElementById("ranking-submit-label").textContent = "Update pending submission";
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

function drawAdminRankings(ctx) {
  const target = document.getElementById("all-rankings");
  if (!target) return;
  const pending = allRankings.filter((r) => !r.processed);
  const rows = allRankings.slice(0, 60);
  target.innerHTML = `
    <div class="btn-row mb-0">
      <button id="process-rankings" class="btn success" ${pending.length ? "" : "disabled"}>Process ${pending.length} pending</button>
      <button id="reset-points" class="btn danger">Reset totals</button>
      <button id="export-rankings" class="btn secondary">Export CSV</button>
    </div>
    <div class="table-wrap mt-3">
      <table>
        <thead><tr><th>Date</th><th>Teacher</th><th>Month</th><th>Ranks</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(formatDateTime(row.timestamp))}</td>
              <td>${escapeHtml(row.teacherEmail || "")}</td>
              <td>${escapeHtml(row.month || "")}</td>
              <td>${escapeHtml(ranksSummary(row.ranks))}</td>
              <td><span class="badge ${row.processed ? "success" : "warn"}">${row.processed ? "Processed" : "Pending"}</span></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

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

  document.getElementById("export-rankings")?.addEventListener("click", () => {
    const csv = ["date,teacherEmail,month,first,second,third,fourth,status"].concat(allRankings.map((row) => {
      const cells = [
        formatDateTime(row.timestamp),
        row.teacherEmail || "",
        row.month || "",
        getSafeArray(row.ranks?.first).map((id) => houseById(id).name).join("; "),
        getSafeArray(row.ranks?.second).map((id) => houseById(id).name).join("; "),
        getSafeArray(row.ranks?.third).map((id) => houseById(id).name).join("; "),
        getSafeArray(row.ranks?.fourth).map((id) => houseById(id).name).join("; "),
        row.processed ? "Processed" : "Pending"
      ];
      return cells.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",");
    })).join("\n");
    downloadText("house-point-submissions.csv", csv, "text/csv");
  });
}

export function renderPoints(ctx) {
  stop();
  const canSubmit = ctx.can("canSubmitPoints");
  const canProcess = ctx.can("canProcessHousePoints");

  ctx.setMain(`${pageHeader("House Points", "Submit rankings and process points using the existing rankings and houseTotals collections.")}
    <div id="points-toast"></div>
    ${!canSubmit ? notice("You do not currently have permission to submit house points.", "warn") : ""}
    <div class="grid ${canProcess ? "cols-2" : ""}">
      <div class="card">
        <h2>Submit rankings</h2>
        <form id="ranking-form" class="form-grid">
          <div class="field">
            <label>Month / class / event label</label>
            <input name="month" placeholder="April House Match" required ${canSubmit ? "" : "disabled"} />
          </div>
          <div class="form-grid cols-2">
            ${RANK_LABELS.map(([rank, label, points]) => `
              <div class="field">
                <label>${escapeHtml(label)} (${points} pts)</label>
                <select name="${rank}" required ${canSubmit ? "" : "disabled"}>
                  <option value="">Choose house</option>
                  ${optionList(HOUSES.map((h) => ({ value: h.id, label: h.name })))}
                </select>
              </div>`).join("")}
          </div>
          <div class="btn-row">
            <button class="btn gold" id="ranking-submit-label" type="submit" ${canSubmit ? "" : "disabled"}>Submit ranking</button>
            <button class="btn secondary" id="clear-ranking" type="button">Clear</button>
          </div>
        </form>
      </div>
      <div class="card">
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

  const form = document.getElementById("ranking-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const ranks = selectedRanksFromForm(form);
    if (!ranksAreValid(ranks)) {
      ctx.toast("Each house must appear exactly once.", "warn");
      return;
    }
    const done = setBusy(form.querySelector("button[type='submit']"), editing ? "Updating..." : "Submitting...");
    try {
      await submitRanking({ user: ctx.user, month: form.month.value, ranks, editingId: editing?.id || null });
      ctx.toast(editing ? "Pending submission updated." : "Ranking submitted for processing.", "success");
      editing = null;
      form.reset();
      document.getElementById("ranking-submit-label").textContent = "Submit ranking";
    } catch (error) {
      console.error(error);
      ctx.toast(error.message || "Could not save ranking.", "danger");
    } finally {
      done();
    }
  });

  document.getElementById("clear-ranking").addEventListener("click", () => {
    editing = null;
    form.reset();
    document.getElementById("ranking-submit-label").textContent = "Submit ranking";
  });

  if (ctx.user) {
    unsubs.push(listenMyPendingRankings(ctx.user, (rows) => { myPending = rows; drawMyPending(); }));
  }
  if (canProcess) {
    unsubs.push(listenAllRankings((rows) => { allRankings = rows; drawAdminRankings(ctx); }));
  }
  ctx.registerCleanup(stop);
}
