const API_URL = "/api/state";
const PASSWORD_KEY = "tom-leaderboard-admin-password";
const MAX_PLAYER_IMAGES = 12;
const IMAGE_MAX_DIMENSION = 1400;
const IMAGE_QUALITY = 0.82;
const EVENT_DESCRIPTION_MAX_LENGTH = 3000;
const EVENT_NOTE_MAX_LENGTH = 300;
const THEME_IDS = new Set(["default", "rally", "coastal", "night", "roman"]);
const DEFAULT_OVERALL_IMAGE_URL = "/assets/web-pic.png";

const els = {
  competitionTitle: document.querySelector("#competitionTitle"),
  updatedAt: document.querySelector("#updatedAt"),
  adminButton: document.querySelector("#adminButton"),
  refreshButton: document.querySelector("#refreshButton"),
  tabs: Array.from(document.querySelectorAll(".view-tab")),
  views: {
    overall: document.querySelector("#overallView"),
    events: document.querySelector("#eventsView"),
    about: document.querySelector("#aboutView"),
    admin: document.querySelector("#adminView")
  },
  overallBoard: document.querySelector("#overallBoard"),
  overallCount: document.querySelector("#overallCount"),
  overallApparitionImage: document.querySelector("#overallApparitionImage"),
  aboutContent: document.querySelector("#aboutContent"),
  eventSelector: document.querySelector("#eventSelector"),
  eventDetail: document.querySelector("#eventDetail"),
  eventBoard: document.querySelector("#eventBoard"),
  loginForm: document.querySelector("#loginForm"),
  adminPassword: document.querySelector("#adminPassword"),
  loginError: document.querySelector("#loginError"),
  adminEditor: document.querySelector("#adminEditor"),
  adminState: document.querySelector("#adminState"),
  competitionNameInput: document.querySelector("#competitionNameInput"),
  themeSelect: document.querySelector("#themeSelect"),
  addEventButton: document.querySelector("#addEventButton"),
  saveButton: document.querySelector("#saveButton"),
  logoutButton: document.querySelector("#logoutButton"),
  saveStatus: document.querySelector("#saveStatus"),
  adminSectionButtons: Array.from(document.querySelectorAll("[data-admin-section]")),
  adminSections: {
    events: document.querySelector("#adminEventsPanel"),
    players: document.querySelector("#adminPlayersPanel"),
    about: document.querySelector("#adminAboutPanel"),
    visuals: document.querySelector("#adminVisualsPanel")
  },
  aboutTextInput: document.querySelector("#aboutTextInput"),
  overallImagePreview: document.querySelector("#overallImagePreview"),
  overallImageUpload: document.querySelector("#overallImageUpload"),
  resetOverallImageButton: document.querySelector("#resetOverallImageButton"),
  overallImageMeta: document.querySelector("#overallImageMeta"),
  eventEditorList: document.querySelector("#eventEditorList"),
  playerEditorList: document.querySelector("#playerEditorList"),
  dialog: document.querySelector("#competitorDialog"),
  dialogClose: document.querySelector("#dialogClose"),
  dialogName: document.querySelector("#dialogName"),
  dialogMedals: document.querySelector("#dialogMedals"),
  dialogTitles: document.querySelector("#dialogTitles"),
  dialogSummary: document.querySelector("#dialogSummary"),
  dialogScores: document.querySelector("#dialogScores"),
  dialogGallery: document.querySelector("#dialogGallery"),
  failedLoginVideoOverlay: document.querySelector("#failedLoginVideoOverlay"),
  failedLoginVideo: document.querySelector("#failedLoginVideo"),
  failedLoginVideoClose: document.querySelector("#failedLoginVideoClose"),
  toast: document.querySelector("#toast")
};

let state = null;
let draftState = null;
let activeView = ["overall", "events", "about", "admin"].includes(location.hash.slice(1))
  ? location.hash.slice(1)
  : "overall";
let activeEventId = null;
let activeAdminSection = "events";
let toastTimer = null;

init();

function init() {
  bindEvents();
  setView(activeView, false);
  loadState();
}

function bindEvents() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  });

  els.refreshButton.addEventListener("click", () => loadState());
  els.adminButton.addEventListener("click", () => setView("admin"));
  els.eventSelector.addEventListener("click", (event) => {
    const eventButton = event.target.closest("[data-event-id]");
    if (!eventButton) return;

    activeEventId = eventButton.dataset.eventId;
    renderEventSelector();
    renderEventDetail();
    renderEventBoard();
  });

  els.overallBoard.addEventListener("click", (event) => {
    const row = event.target.closest("[data-competitor-id]");
    if (row) openCompetitorDialog(row.dataset.competitorId);
  });

  els.loginForm.addEventListener("submit", handleLogin);
  els.logoutButton.addEventListener("click", logout);
  els.addEventButton.addEventListener("click", addEvent);
  els.saveButton.addEventListener("click", saveDraft);
  els.adminSectionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (draftState) collectDraftFromForm();
      activeAdminSection = button.dataset.adminSection;
      renderAdminSection();
    });
  });

  els.eventEditorList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-event]");
    if (!deleteButton) return;

    const eventId = deleteButton.dataset.deleteEvent;
    const eventItem = draftState.events.find((item) => item.id === eventId);
    const eventName = eventItem ? eventItem.name : "this event";

    if (window.confirm(`Delete ${eventName}?`)) {
      collectDraftFromForm();
      draftState.events = draftState.events.filter((item) => item.id !== eventId);
      if (activeEventId === eventId) activeEventId = draftState.events[0]?.id || null;
      renderAdminEditor();
      setSaveStatus("Unsaved changes");
    }
  });

  els.eventEditorList.addEventListener("input", () => {
    setSaveStatus("Unsaved changes");
  });

  els.playerEditorList.addEventListener("input", () => {
    setSaveStatus("Unsaved changes");
  });

  els.playerEditorList.addEventListener("change", handlePlayerImageUpload);
  els.playerEditorList.addEventListener("click", handlePlayerImageDelete);
  els.overallImageUpload.addEventListener("change", handleOverallImageUpload);
  els.resetOverallImageButton.addEventListener("click", resetOverallImage);

  els.competitionNameInput.addEventListener("input", () => {
    setSaveStatus("Unsaved changes");
  });

  els.themeSelect.addEventListener("change", () => {
    if (draftState) draftState.theme = normalizeThemeId(els.themeSelect.value);
    applyTheme(els.themeSelect.value);
    setSaveStatus("Unsaved changes");
  });

  els.aboutTextInput.addEventListener("input", () => {
    setSaveStatus("Unsaved changes");
  });

  els.dialogClose.addEventListener("click", () => els.dialog.close());
  els.dialog.addEventListener("click", (event) => {
    if (event.target === els.dialog) els.dialog.close();
  });
  els.dialogGallery.addEventListener("click", handleGalleryClick);
  els.failedLoginVideoClose.addEventListener("click", closeFailedLoginVideo);
  els.failedLoginVideo.addEventListener("ended", closeFailedLoginVideo);
  els.failedLoginVideoOverlay.addEventListener("click", (event) => {
    if (event.target === els.failedLoginVideoOverlay) closeFailedLoginVideo();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.failedLoginVideoOverlay.hidden) closeFailedLoginVideo();
  });

  window.addEventListener("hashchange", () => {
    const nextView = location.hash.slice(1);
    if (["overall", "events", "about", "admin"].includes(nextView)) setView(nextView, false);
  });
}

async function loadState(options = {}) {
  const quiet = options.quiet === true;
  if (!quiet) setHeaderLoading();

  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    const payload = await readApiJson(response);
    if (!response.ok) throw new Error(payload.error || "Could not load scores.");

    state = normalizeState(payload.state);
    if (!activeEventId || !state.events.some((eventItem) => eventItem.id === activeEventId)) {
      activeEventId = state.events[0]?.id || null;
    }
    if (isLoggedIn()) draftState = cloneState(state);
    renderAll();
    if (!quiet) showToast("Scores refreshed");
  } catch (error) {
    renderLoadError(error.message);
  }
}

function setView(view, updateHash = true) {
  activeView = view;
  els.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === view));
  els.adminButton.classList.toggle("is-active", view === "admin");
  els.adminButton.setAttribute("aria-current", view === "admin" ? "true" : "false");
  Object.entries(els.views).forEach(([name, viewEl]) => {
    viewEl.classList.toggle("is-active", name === view);
  });

  if (updateHash) history.replaceState(null, "", `#${view}`);
  if (view === "admin") renderAdmin();
}

function renderAll() {
  applyTheme(state.theme);
  renderOverallApparition();
  els.competitionTitle.textContent = state.competitionName || "Leaderboard";
  els.updatedAt.textContent = state.updatedAt
    ? `Updated ${formatDateTime(state.updatedAt)}`
    : "No updates yet";
  renderOverall();
  renderEventSelector();
  renderEventDetail();
  renderEventBoard();
  renderAbout();
  renderAdmin();
}

function renderOverallApparition() {
  const imageUrl = getOverallImageUrl(state.overallImage);
  if (els.overallApparitionImage.getAttribute("src") !== imageUrl) {
    els.overallApparitionImage.src = imageUrl;
  }
}

function renderOverall() {
  const rows = getOverallRows(state);
  els.overallCount.textContent = `${state.competitors.length} competitors`;

  if (!rows.length) {
    els.overallBoard.innerHTML = `<div class="empty-state">No competitors yet.</div>`;
    return;
  }

  els.overallBoard.innerHTML = rows.map((row) => {
    const titleLines = normalizeTitleLines(row.titles);
    const medalClass = getMedalClass(row.rank);
    const medals = row.medals || [];
    return `
      <button class="leaderboard-row${medalClass ? ` ${medalClass}` : ""}" type="button" data-competitor-id="${escapeHtml(row.id)}">
        <span class="rank">#${row.rank}</span>
        <span>
          <span class="competitor-heading">
            <span class="competitor-name">${escapeHtml(row.name)}</span>
            ${medals.length ? `
              <span class="player-medals" aria-label="${escapeAttribute(getMedalSummary(medals))}">
                ${medals.map((medal) => `<span aria-hidden="true">${medal}</span>`).join("")}
              </span>
            ` : ""}
          </span>
          ${titleLines.length ? `
            <span class="player-title-list">
              ${titleLines.map((line) => `<span>${formatInlineText(line)}</span>`).join("")}
            </span>
          ` : ""}
        </span>
        <span class="points">
          <strong>${formatNumber(row.total)}</strong>
          <span>pts</span>
        </span>
      </button>
    `;
  }).join("");
}

function renderEventSelector() {
  if (!state.events.length) {
    els.eventSelector.innerHTML = "";
    return;
  }

  els.eventSelector.innerHTML = state.events.map((eventItem, index) => {
    const isActive = eventItem.id === activeEventId;
    const isComplete = eventItem.completed === true;
    return `
      <button
        class="event-link${isActive ? " is-active" : ""}${isComplete ? " is-complete" : ""}"
        type="button"
        data-event-id="${escapeHtml(eventItem.id)}"
        aria-label="Event ${index + 1}: ${escapeAttribute(eventItem.name)}${isComplete ? " complete" : ""}"
        ${isActive ? 'aria-current="true"' : ""}
      >
        ${index + 1}
      </button>
    `;
  }).join("");
}

function renderEventDetail() {
  if (!state.events.length) {
    els.eventDetail.innerHTML = "";
    return;
  }

  const eventItem = state.events.find((item) => item.id === activeEventId) || state.events[0];
  activeEventId = eventItem.id;
  const description = eventItem.description?.trim() || "No description yet.";
  const statusMarkup = eventItem.completed
    ? `<span class="event-status is-complete">Complete</span>`
    : `<span class="event-status is-open">Not complete</span>`;

  els.eventDetail.innerHTML = `
    <div>
      <p class="kicker">Selected event</p>
      <h3>${escapeHtml(eventItem.name)}</h3>
    </div>
    ${statusMarkup}
    <p class="event-description">${formatInlineText(description).replaceAll("\n", "<br>")}</p>
  `;
}

function renderEventBoard() {
  if (!state.events.length) {
    els.eventBoard.innerHTML = `<div class="empty-state">No events yet.</div>`;
    return;
  }

  const eventItem = state.events.find((item) => item.id === activeEventId) || state.events[0];
  activeEventId = eventItem.id;
  const rows = getEventRows(state, eventItem.id);

  els.eventBoard.innerHTML = `
    <table>
      <thead>
        <tr>
          <th scope="col">Rank</th>
          <th scope="col">Competitor</th>
          <th scope="col">Points</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr class="${getMedalClass(row.rank)}">
            <td>${row.score === null ? "-" : `#${row.rank}`}</td>
            <td>
              <span class="event-player-name">${escapeHtml(row.name)}</span>
              ${row.note ? `<span class="event-player-note">${formatInlineText(row.note).replaceAll("\n", "<br>")}</span>` : ""}
            </td>
            <td>${row.score === null ? "-" : formatNumber(row.score)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderAbout() {
  const aboutText = state.aboutText?.trim();

  if (!aboutText) {
    els.aboutContent.innerHTML = `<p>No about text yet.</p>`;
    return;
  }

  els.aboutContent.innerHTML = aboutText
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${formatInlineText(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function renderAdmin() {
  const loggedIn = isLoggedIn();
  els.loginForm.hidden = loggedIn;
  els.adminEditor.hidden = !loggedIn;
  els.adminState.textContent = loggedIn ? "Unlocked" : "Locked";

  if (loggedIn && state) {
    if (!draftState) draftState = cloneState(state);
    renderAdminEditor();
    renderAdminSection();
  }
}

function renderAdminEditor() {
  if (!draftState) return;

  els.competitionNameInput.value = draftState.competitionName || "";
  els.themeSelect.value = normalizeThemeId(draftState.theme);
  els.aboutTextInput.value = draftState.aboutText || "";
  renderVisualsEditor();
  els.eventEditorList.innerHTML = draftState.events.map((eventItem, index) => `
    <article class="event-card" data-event-card="${escapeHtml(eventItem.id)}">
      <div class="event-card-header">
        <label class="field">
          <span>Event ${index + 1} name</span>
          <input class="event-name-input" data-event-name="${escapeHtml(eventItem.id)}" type="text" maxlength="80" value="${escapeAttribute(eventItem.name)}">
        </label>
        <button class="button button-danger" type="button" data-delete-event="${escapeHtml(eventItem.id)}">Delete</button>
      </div>
      <div class="event-card-body">
        <label class="checkbox-field">
          <input class="event-completed-input" data-event-completed="${escapeHtml(eventItem.id)}" type="checkbox"${eventItem.completed ? " checked" : ""}>
          <span>Event complete</span>
        </label>
        <label class="field">
          <span>Event ${index + 1} bio</span>
          <textarea class="event-description-input" data-event-description="${escapeHtml(eventItem.id)}" maxlength="${EVENT_DESCRIPTION_MAX_LENGTH}" rows="5">${escapeHtml(eventItem.description || "")}</textarea>
        </label>
      </div>
      <table class="score-editor">
        <thead>
          <tr>
            <th scope="col">Competitor</th>
            <th scope="col">Points</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          ${draftState.competitors.map((competitor) => {
            const score = parseScore(eventItem.scores?.[competitor.id]);
            const note = normalizeEventNote(eventItem.notes?.[competitor.id]);
            return `
              <tr>
                <td>${escapeHtml(competitor.name)}</td>
                <td>
                  <input class="score-input" data-event-id="${escapeHtml(eventItem.id)}" data-competitor-id="${escapeHtml(competitor.id)}" type="number" inputmode="decimal" step="0.01" value="${score === null ? "" : escapeAttribute(String(score))}">
                </td>
                <td>
                  <textarea
                    class="event-note-input"
                    data-event-note-id="${escapeHtml(eventItem.id)}"
                    data-competitor-id="${escapeHtml(competitor.id)}"
                    maxlength="${EVENT_NOTE_MAX_LENGTH}"
                    rows="2"
                    aria-label="${escapeAttribute(`${eventItem.name} note for ${competitor.name}`)}"
                  >${escapeHtml(note)}</textarea>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </article>
  `).join("");

  els.playerEditorList.innerHTML = draftState.competitors.map((competitor) => {
    const titleText = normalizeTitleLines(competitor.titles).join("\n");
    const images = normalizePlayerImages(competitor.images);
    const uploadDisabled = images.length >= MAX_PLAYER_IMAGES;
    return `
      <article class="player-card">
        <div class="player-card-header">
          <h3>${escapeHtml(competitor.name)}</h3>
        </div>
        <label class="field">
          <span>Player titles</span>
          <textarea class="player-title-input" data-player-titles="${escapeHtml(competitor.id)}" maxlength="2200" rows="5">${escapeHtml(titleText)}</textarea>
        </label>
        <div class="player-image-manager">
          <div class="player-image-toolbar">
            <label class="button button-secondary file-button${uploadDisabled ? " is-disabled" : ""}">
              Add images
              <input class="player-image-upload" data-player-image-upload="${escapeHtml(competitor.id)}" type="file" accept="image/*" multiple${uploadDisabled ? " disabled" : ""}>
            </label>
            <span class="meta">${images.length}/${MAX_PLAYER_IMAGES} images</span>
          </div>
          ${images.length ? `
            <div class="admin-image-grid" aria-label="${escapeAttribute(`${competitor.name} images`)}">
              ${images.map((image, imageIndex) => `
                <figure class="admin-image-item">
                  <img src="${getImageUrl(image.id)}" alt="${escapeAttribute(`${competitor.name} image ${imageIndex + 1}`)}" loading="lazy">
                  <figcaption>${escapeHtml(image.name)}</figcaption>
                  <button class="button button-danger" type="button" data-delete-player-image="${escapeHtml(image.id)}">Delete</button>
                </figure>
              `).join("")}
            </div>
          ` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function renderVisualsEditor() {
  const overallImage = normalizeStoredImage(draftState.overallImage);
  els.overallImagePreview.src = getOverallImageUrl(overallImage);
  els.overallImageMeta.textContent = overallImage ? overallImage.name : "Default image";
  els.resetOverallImageButton.disabled = !overallImage;
}

function renderAdminSection() {
  els.adminSectionButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.adminSection === activeAdminSection);
  });

  Object.entries(els.adminSections).forEach(([name, section]) => {
    section.hidden = name !== activeAdminSection;
  });

  els.addEventButton.hidden = activeAdminSection !== "events";
}

async function handleLogin(event) {
  event.preventDefault();
  els.loginError.textContent = "";

  const password = els.adminPassword.value;
  if (!password) return;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "verify", password })
    });
    const payload = await readApiJson(response);
    if (!response.ok) {
      if (response.status === 401) playFailedLoginVideo();
      throw new Error(payload.error || "Password check failed.");
    }

    sessionStorage.setItem(PASSWORD_KEY, password);
    els.adminPassword.value = "";
    draftState = cloneState(state);
    renderAdmin();
    showToast("Admin unlocked");
  } catch (error) {
    els.loginError.textContent = error.message;
  }
}

function playFailedLoginVideo() {
  const overlay = els.failedLoginVideoOverlay;
  const video = els.failedLoginVideo;
  if (!overlay || !video) return;

  overlay.hidden = false;
  overlay.classList.add("is-visible");
  video.currentTime = 0;
  video.muted = false;

  const playResult = video.play();
  if (playResult && typeof playResult.catch === "function") {
    playResult.catch(() => {
      video.muted = true;
      video.play().catch(() => {});
    });
  }
}

function closeFailedLoginVideo() {
  const overlay = els.failedLoginVideoOverlay;
  const video = els.failedLoginVideo;
  if (!overlay || !video) return;

  video.pause();
  video.currentTime = 0;
  overlay.classList.remove("is-visible");
  overlay.hidden = true;
}

function logout() {
  sessionStorage.removeItem(PASSWORD_KEY);
  draftState = null;
  els.saveStatus.textContent = "";
  if (state) applyTheme(state.theme);
  renderAdmin();
}

async function handlePlayerImageUpload(event) {
  const input = event.target.closest("[data-player-image-upload]");
  if (!input) return;

  const competitorId = input.dataset.playerImageUpload;
  const files = Array.from(input.files || []).filter((file) => file.type.startsWith("image/"));
  input.value = "";
  if (!files.length) return;

  const password = sessionStorage.getItem(PASSWORD_KEY);
  if (!password) {
    logout();
    return;
  }

  collectDraftFromForm();
  const saved = await saveDraft({ quiet: true });
  if (!saved) return;

  const competitor = state.competitors.find((item) => item.id === competitorId);
  const existingCount = normalizePlayerImages(competitor?.images).length;
  const remaining = Math.max(0, MAX_PLAYER_IMAGES - existingCount);
  const filesToUpload = files.slice(0, remaining);

  if (!filesToUpload.length) {
    setSaveStatus("This player already has 12 images.", true);
    return;
  }

  try {
    setSaveStatus("Preparing images...");

    for (let index = 0; index < filesToUpload.length; index += 1) {
      const file = filesToUpload[index];
      const dataUrl = await compressImageFile(file);
      setSaveStatus(`Uploading image ${index + 1} of ${filesToUpload.length}...`);

      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "uploadPlayerImage",
          password,
          competitorId,
          image: {
            name: file.name,
            dataUrl
          }
        })
      });
      const payload = await readApiJson(response);
      if (!response.ok) throw new Error(payload.error || "Could not upload image.");

      state = normalizeState(payload.state);
      draftState = cloneState(state);
    }

    renderAll();
    const skipped = files.length - filesToUpload.length;
    setSaveStatus(skipped > 0
      ? `Uploaded ${filesToUpload.length} image(s). ${skipped} skipped because the player reached 12 images.`
      : `Uploaded ${filesToUpload.length} image(s).`
    );
    showToast("Images uploaded");
  } catch (error) {
    setSaveStatus(error.message, true);
  }
}

async function handleOverallImageUpload(event) {
  const input = event.target;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !file.type.startsWith("image/")) return;

  const password = sessionStorage.getItem(PASSWORD_KEY);
  if (!password) {
    logout();
    return;
  }

  collectDraftFromForm();
  const saved = await saveDraft({ quiet: true });
  if (!saved) return;

  try {
    setSaveStatus("Preparing image...");
    const dataUrl = await compressImageFile(file, { outputType: "image/webp" });
    setSaveStatus("Uploading overall image...");

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "uploadOverallImage",
        password,
        image: {
          name: file.name,
          dataUrl
        }
      })
    });
    const payload = await readApiJson(response);
    if (!response.ok) throw new Error(payload.error || "Could not upload image.");

    state = normalizeState(payload.state);
    draftState = cloneState(state);
    renderAll();
    setSaveStatus("Overall image updated.");
    showToast("Overall image updated");
  } catch (error) {
    setSaveStatus(error.message, true);
  }
}

async function resetOverallImage() {
  const password = sessionStorage.getItem(PASSWORD_KEY);
  if (!password) {
    logout();
    return;
  }

  collectDraftFromForm();
  const saved = await saveDraft({ quiet: true });
  if (!saved) return;

  try {
    setSaveStatus("Restoring default image...");
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "resetOverallImage", password })
    });
    const payload = await readApiJson(response);
    if (!response.ok) throw new Error(payload.error || "Could not restore default image.");

    state = normalizeState(payload.state);
    draftState = cloneState(state);
    renderAll();
    setSaveStatus("Default overall image restored.");
    showToast("Default image restored");
  } catch (error) {
    setSaveStatus(error.message, true);
  }
}

async function handlePlayerImageDelete(event) {
  const deleteButton = event.target.closest("[data-delete-player-image]");
  if (!deleteButton) return;

  const password = sessionStorage.getItem(PASSWORD_KEY);
  if (!password) {
    logout();
    return;
  }

  collectDraftFromForm();
  const saved = await saveDraft({ quiet: true });
  if (!saved) return;

  try {
    setSaveStatus("Deleting image...");
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "deletePlayerImage",
        password,
        imageId: deleteButton.dataset.deletePlayerImage
      })
    });
    const payload = await readApiJson(response);
    if (!response.ok) throw new Error(payload.error || "Could not delete image.");

    state = normalizeState(payload.state);
    draftState = cloneState(state);
    renderAll();
    setSaveStatus("Image deleted.");
    showToast("Image deleted");
  } catch (error) {
    setSaveStatus(error.message, true);
  }
}

function addEvent() {
  if (!draftState) return;
  collectDraftFromForm();

  const id = makeId("event");
  const nextNumber = draftState.events.length + 1;
  draftState.events.push({
    id,
    name: `Event ${nextNumber}`,
    description: "",
    completed: false,
    scores: Object.fromEntries(draftState.competitors.map((competitor) => [competitor.id, null])),
    notes: Object.fromEntries(draftState.competitors.map((competitor) => [competitor.id, ""]))
  });

  activeEventId = id;
  renderAdminEditor();
  setSaveStatus("Unsaved changes");
}

async function saveDraft(options = {}) {
  if (!draftState) return false;
  collectDraftFromForm();

  const password = sessionStorage.getItem(PASSWORD_KEY);
  if (!password) {
    logout();
    return;
  }

  els.saveButton.disabled = true;
  setSaveStatus("Saving...");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "saveState", password, state: draftState })
    });
    const payload = await readApiJson(response);

    if (response.status === 409) {
      throw new Error("Someone else saved newer scores. Refresh, then re-apply your changes.");
    }
    if (!response.ok) throw new Error(payload.error || "Could not save scores.");

    state = normalizeState(payload.state);
    draftState = cloneState(state);
    if (!state.events.some((eventItem) => eventItem.id === activeEventId)) {
      activeEventId = state.events[0]?.id || null;
    }
    renderAll();
    setSaveStatus(`Saved ${formatDateTime(state.updatedAt)}`);
    if (!options.quiet) showToast("Scores saved");
    return true;
  } catch (error) {
    setSaveStatus(error.message, true);
    return false;
  } finally {
    els.saveButton.disabled = false;
  }
}

function collectDraftFromForm() {
  if (!draftState) return;

  draftState.competitionName = els.competitionNameInput.value.trim() || "Leaderboard";
  draftState.theme = normalizeThemeId(els.themeSelect.value);
  draftState.aboutText = els.aboutTextInput.value.trim();

  draftState.competitors = draftState.competitors.map((competitor) => {
    const titlesInput = els.playerEditorList.querySelector(`[data-player-titles="${cssEscape(competitor.id)}"]`);
    return {
      ...competitor,
      titles: titlesInput ? normalizeTitleLines(titlesInput.value) : normalizeTitleLines(competitor.titles),
      images: normalizePlayerImages(competitor.images)
    };
  });

  draftState.events = draftState.events.map((eventItem) => {
    const nameInput = els.eventEditorList.querySelector(`[data-event-name="${cssEscape(eventItem.id)}"]`);
    const descriptionInput = els.eventEditorList.querySelector(`[data-event-description="${cssEscape(eventItem.id)}"]`);
    const completedInput = els.eventEditorList.querySelector(`[data-event-completed="${cssEscape(eventItem.id)}"]`);
    const scores = {};
    const notes = {};

    draftState.competitors.forEach((competitor) => {
      const input = els.eventEditorList.querySelector(
        `[data-event-id="${cssEscape(eventItem.id)}"][data-competitor-id="${cssEscape(competitor.id)}"]`
      );
      const noteInput = els.eventEditorList.querySelector(
        `[data-event-note-id="${cssEscape(eventItem.id)}"][data-competitor-id="${cssEscape(competitor.id)}"]`
      );
      scores[competitor.id] = input ? parseScore(input.value) : null;
      notes[competitor.id] = noteInput ? normalizeEventNote(noteInput.value) : normalizeEventNote(eventItem.notes?.[competitor.id]);
    });

    return {
      ...eventItem,
      name: nameInput ? nameInput.value.trim() || "Untitled event" : eventItem.name,
      description: descriptionInput ? descriptionInput.value.trim() : eventItem.description || "",
      completed: completedInput ? completedInput.checked : eventItem.completed === true,
      scores,
      notes
    };
  });
}

function openCompetitorDialog(competitorId) {
  const row = getOverallRows(state).find((item) => item.id === competitorId);
  if (!row) return;

  els.dialogName.textContent = row.name;
  const medals = row.medals || [];
  els.dialogMedals.hidden = !medals.length;
  els.dialogMedals.setAttribute("aria-label", medals.length ? getMedalSummary(medals) : "");
  els.dialogMedals.innerHTML = medals.map((medal) => `<span aria-hidden="true">${medal}</span>`).join("");
  const titleLines = normalizeTitleLines(row.titles);
  els.dialogTitles.innerHTML = titleLines.length
    ? titleLines.map((line) => `<span>${formatInlineText(line)}</span>`).join("")
    : "";
  els.dialogSummary.innerHTML = `
    <div class="summary-stat">
      <strong>${formatNumber(row.total)}</strong>
      <span>Total points</span>
    </div>
    <div class="summary-stat">
      <strong>#${row.rank}</strong>
      <span>Overall rank</span>
    </div>
  `;
  els.dialogScores.innerHTML = state.events.length
    ? state.events.map((eventItem) => {
      const score = parseScore(eventItem.scores?.[competitorId]);
      return `
        <div class="detail-row">
          <span>${escapeHtml(eventItem.name)}</span>
          <strong>${score === null ? "-" : formatNumber(score)}</strong>
        </div>
      `;
    }).join("")
    : `<div class="empty-state">No event scores yet.</div>`;

  const images = normalizePlayerImages(row.images);
  els.dialogGallery.innerHTML = images.length ? `
    <div class="dialog-gallery-header">
      <p class="kicker">Gallery</p>
      <h3>Images</h3>
    </div>
    <div class="gallery-preview" data-gallery-preview hidden>
      <div class="gallery-preview-actions">
        <button class="button button-secondary" type="button" data-gallery-close>Back to player card</button>
      </div>
      <img data-gallery-preview-image alt="">
    </div>
    <div class="thumbnail-grid">
      ${images.map((image, index) => `
        <button
          class="thumbnail-button"
          type="button"
          data-gallery-src="${escapeAttribute(getImageUrl(image.id))}"
          data-gallery-alt="${escapeAttribute(`${row.name} image ${index + 1}`)}"
          aria-label="${escapeAttribute(`View ${row.name} image ${index + 1}`)}"
        >
          <img src="${getImageUrl(image.id)}" alt="${escapeAttribute(`${row.name} image ${index + 1}`)}" loading="lazy">
        </button>
      `).join("")}
    </div>
  ` : "";

  if (typeof els.dialog.showModal === "function") {
    els.dialog.showModal();
  }
}

function handleGalleryClick(event) {
  if (!(event.target instanceof Element)) return;

  const closeButton = event.target.closest("[data-gallery-close]");
  if (closeButton) {
    closeGalleryPreview();
    return;
  }

  const thumbnail = event.target.closest("[data-gallery-src]");
  if (!thumbnail || !els.dialogGallery.contains(thumbnail)) return;

  openGalleryPreview(thumbnail.dataset.gallerySrc, thumbnail.dataset.galleryAlt || "Player image");
}

function openGalleryPreview(src, alt) {
  const preview = els.dialogGallery.querySelector("[data-gallery-preview]");
  const previewImage = els.dialogGallery.querySelector("[data-gallery-preview-image]");
  const thumbnailGrid = els.dialogGallery.querySelector(".thumbnail-grid");
  const closeButton = els.dialogGallery.querySelector("[data-gallery-close]");

  if (!preview || !previewImage || !thumbnailGrid) return;

  previewImage.src = src;
  previewImage.alt = alt;
  preview.hidden = false;
  thumbnailGrid.hidden = true;
  closeButton?.focus();
}

function closeGalleryPreview() {
  const preview = els.dialogGallery.querySelector("[data-gallery-preview]");
  const previewImage = els.dialogGallery.querySelector("[data-gallery-preview-image]");
  const thumbnailGrid = els.dialogGallery.querySelector(".thumbnail-grid");
  const firstThumbnail = els.dialogGallery.querySelector("[data-gallery-src]");

  if (!preview || !thumbnailGrid) return;

  preview.hidden = true;
  thumbnailGrid.hidden = false;
  if (previewImage) {
    previewImage.removeAttribute("src");
    previewImage.alt = "";
  }
  firstThumbnail?.focus();
}

function getOverallRows(data) {
  const rows = data.competitors.map((competitor) => {
    const scores = data.events.map((eventItem) => parseScore(eventItem.scores?.[competitor.id]));
    const scoredEvents = scores.filter((score) => score !== null).length;
    const total = scores.reduce((sum, score) => sum + (score || 0), 0);
    return { ...competitor, scoredEvents, total, medals: getCompletedMedals(data, competitor.id) };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return addRanks(rows, "total");
}

function getCompletedMedals(data, competitorId) {
  return data.events
    .filter((eventItem) => eventItem.completed === true)
    .flatMap((eventItem) => {
      const row = getEventRows(data, eventItem.id).find((item) => item.id === competitorId);
      if (!row || row.score === null) return [];
      if (row.rank === 1) return ["🥇"];
      if (row.rank === 2) return ["🥈"];
      if (row.rank === 3) return ["🥉"];
      return [];
    });
}

function getEventRows(data, eventId) {
  const eventItem = data.events.find((item) => item.id === eventId);
  if (!eventItem) return [];

  const rows = data.competitors.map((competitor) => {
    const score = parseScore(eventItem.scores?.[competitor.id]);
    const note = normalizeEventNote(eventItem.notes?.[competitor.id]);
    return { ...competitor, score, note };
  }).sort((a, b) => {
    const aScore = a.score === null ? Number.NEGATIVE_INFINITY : a.score;
    const bScore = b.score === null ? Number.NEGATIVE_INFINITY : b.score;
    return bScore - aScore || a.name.localeCompare(b.name);
  });

  return addRanks(rows, "score");
}

function addRanks(rows, scoreKey) {
  let lastScore = Symbol("unset");
  let currentRank = 0;

  return rows.map((row, index) => {
    const score = row[scoreKey];
    if (score === null) return { ...row, rank: null };
    if (score !== lastScore) currentRank = index + 1;
    lastScore = score;
    return { ...row, rank: currentRank };
  });
}

function getMedalClass(rank) {
  if (rank === 1) return "medal-gold";
  if (rank === 2) return "medal-silver";
  if (rank === 3) return "medal-bronze";
  return "";
}

function getMedalSummary(medals) {
  const counts = medals.reduce((acc, medal) => {
    acc[medal] = (acc[medal] || 0) + 1;
    return acc;
  }, {});

  return [
    counts["🥇"] ? `${counts["🥇"]} gold` : "",
    counts["🥈"] ? `${counts["🥈"]} silver` : "",
    counts["🥉"] ? `${counts["🥉"]} bronze` : ""
  ].filter(Boolean).join(", ");
}

function normalizeState(input) {
  const normalized = {
    version: input?.version || 1,
    competitionName: input?.competitionName || "Leaderboard",
    theme: normalizeThemeId(input?.theme),
    overallImage: normalizeStoredImage(input?.overallImage),
    aboutText: typeof input?.aboutText === "string" ? input.aboutText : "",
    competitors: Array.isArray(input?.competitors) ? input.competitors : [],
    events: Array.isArray(input?.events) ? input.events : [],
    revision: Number.isInteger(input?.revision) ? input.revision : 0,
    updatedAt: input?.updatedAt || null
  };

  normalized.competitors = normalized.competitors.map((competitor) => ({
    id: competitor.id,
    name: competitor.name || "Untitled player",
    titles: normalizeTitleLines(competitor.titles),
    images: normalizePlayerImages(competitor.images)
  }));

  normalized.events = normalized.events.map((eventItem) => ({
    id: eventItem.id,
    name: eventItem.name || "Untitled event",
    description: typeof eventItem.description === "string" ? eventItem.description : "",
    completed: eventItem.completed === true,
    scores: { ...(eventItem.scores || {}) },
    notes: normalizeEventNotes(eventItem.notes, normalized.competitors)
  }));

  return normalized;
}

function normalizeThemeId(value) {
  return THEME_IDS.has(value) ? value : "default";
}

function applyTheme(value) {
  document.documentElement.dataset.theme = normalizeThemeId(value);
}

function normalizeTitleLines(value) {
  const lines = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  return lines
    .map((line) => String(line).trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((line) => line.slice(0, 100));
}

function normalizeEventNotes(value, competitors) {
  const input = value && typeof value === "object" ? value : {};
  return Object.fromEntries(competitors.map((competitor) => [
    competitor.id,
    normalizeEventNote(input[competitor.id])
  ]));
}

function normalizeEventNote(value) {
  return String(value || "").trim().slice(0, EVENT_NOTE_MAX_LENGTH);
}

function normalizePlayerImages(value) {
  const images = Array.isArray(value) ? value : [];
  return images
    .map((image) => normalizeStoredImage(image))
    .filter(Boolean)
    .slice(0, MAX_PLAYER_IMAGES);
}

function normalizeStoredImage(image) {
  if (!image || typeof image.id !== "string") return null;
  return {
    id: image.id,
    name: typeof image.name === "string" ? image.name : "Image",
    contentType: typeof image.contentType === "string" ? image.contentType : "image/jpeg",
    uploadedAt: typeof image.uploadedAt === "string" ? image.uploadedAt : null
  };
}

function getImageUrl(imageId) {
  return `${API_URL}?image=${encodeURIComponent(imageId)}`;
}

function getOverallImageUrl(image) {
  const normalized = normalizeStoredImage(image);
  return normalized ? getImageUrl(normalized.id) : DEFAULT_OVERALL_IMAGE_URL;
}

async function compressImageFile(file, options = {}) {
  const image = await loadImage(file);
  const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  const outputType = options.outputType || "image/jpeg";
  if (outputType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL(outputType, IMAGE_QUALITY);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}.`));
    };
    image.src = url;
  });
}

function parseScore(value) {
  if (value === "" || value === null || typeof value === "undefined") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatNumber(number) {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(number);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function isLoggedIn() {
  return Boolean(sessionStorage.getItem(PASSWORD_KEY));
}

function setHeaderLoading() {
  els.updatedAt.textContent = "Loading scores...";
}

function renderLoadError(message) {
  els.updatedAt.textContent = "Could not load scores";
  const error = `<div class="error-state">${escapeHtml(message)}</div>`;
  els.overallBoard.innerHTML = error;
  els.aboutContent.innerHTML = error;
  els.eventDetail.innerHTML = "";
  els.eventBoard.innerHTML = error;
}

function setSaveStatus(message, isError = false) {
  els.saveStatus.textContent = message;
  els.saveStatus.style.color = isError ? "var(--warn)" : "var(--muted)";
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2200);
}

async function readApiJson(response) {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`Server returned an empty response (${response.status}). Refresh, then try again.`);
  }

  try {
    return JSON.parse(text);
  } catch {
    const contentType = response.headers.get("content-type") || "unknown content type";
    throw new Error(`Server returned an invalid response (${response.status}, ${contentType}). Refresh, then try again.`);
  }
}

function makeId(prefix) {
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatInlineText(value) {
  return formatInlineSegment(String(value || ""));
}

function formatInlineSegment(text) {
  let html = "";
  let cursor = 0;

  while (cursor < text.length) {
    const nextMarker = findNextInlineMarker(text, cursor);
    if (!nextMarker) {
      html += escapeHtml(text.slice(cursor));
      break;
    }

    const { marker, start } = nextMarker;
    const end = text.indexOf(marker, start + marker.length);
    if (end === -1) {
      html += escapeHtml(text.slice(cursor));
      break;
    }

    html += escapeHtml(text.slice(cursor, start));
    const markedText = text.slice(start + marker.length, end);
    html += markedText ? formatInlineMarkup(marker, markedText) : escapeHtml(marker + marker);
    cursor = end + marker.length;
  }

  return html;
}

function findNextInlineMarker(text, cursor) {
  return ["***", "///"]
    .map((marker) => ({ marker, start: text.indexOf(marker, cursor) }))
    .filter((item) => item.start !== -1)
    .sort((a, b) => a.start - b.start)[0] || null;
}

function formatInlineMarkup(marker, text) {
  if (marker === "***") return `<strong>${formatInlineSegment(text)}</strong>`;
  if (marker === "///") return `<span class="rainbow-text">${formatInlineSegment(text)}</span>`;
  return escapeHtml(text);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}
