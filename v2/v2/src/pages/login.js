import { signInWithMicrosoft } from "../services/auth-service.js";
import { pageHeader, notice, setBusy } from "../ui/dom.js";

export function renderLogin(ctx) {
  if (ctx.user) {
    location.hash = "#/home";
    return;
  }

  ctx.setMain(`${pageHeader("Sign in", "Use your SCIS Microsoft account to access teacher, coordinator, and admin tools.")}
    <div class="grid cols-2">
      <div class="card">
        <h2>Microsoft account</h2>
        <p class="muted">Access is assigned by email in the Access Control dashboard.</p>
        <button id="login-button" class="btn gold">Sign in with Microsoft</button>
        <div id="login-message" class="mt-3"></div>
      </div>
      <div class="card">
        <h3>Testing side-by-side</h3>
        <p class="muted">The legacy pages stay where they are. This V2 app runs under <strong>/v2/</strong> and uses the same Firestore data paths.</p>
      </div>
    </div>`);

  document.getElementById("login-button").addEventListener("click", async (event) => {
    const done = setBusy(event.currentTarget, "Opening Microsoft...");
    const msg = document.getElementById("login-message");
    try {
      await signInWithMicrosoft();
      msg.innerHTML = notice("Signed in successfully.", "success");
      location.hash = "#/home";
    } catch (error) {
      console.error(error);
      msg.innerHTML = notice(error.message || "Microsoft sign-in failed.", "danger");
    } finally {
      done();
    }
  });
}
