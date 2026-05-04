// ═══════════════════════════════════════════
//   TALENTSPOT — script.js
// ═══════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  addDoc,
  collection,
  getDocs,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ══════════════════════════════════════════
//   YOUR FIREBASE CONFIG
// ══════════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyC1IpincQdy4fml8_MOk3sfyjba9_cXVMw",
  authDomain: "talentspot-425bf.firebaseapp.com",
  projectId: "talentspot-425bf",
  storageBucket: "talentspot-425bf.firebasestorage.app",
  messagingSenderId: "417253968541",
  appId: "1:417253968541:web:24520203c35595b325a274",
  measurementId: "G-F84THZQVFM"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── State ─────────────────────────────────
let currentUser   = "";
let currentCoords = "";
let locationText  = "";
let allProfiles   = [];
let toastTimer;

// ── Avatar colours (warm palette) ─────────
const PALETTE = [
  "#c94a1e","#e8813a","#1c7c54","#0d8c8c",
  "#7c3aed","#d97706","#0f766e","#be185d"
];

function avatarColor(name) {
  let n = 0;
  for (const c of name) n += c.charCodeAt(0);
  return PALETTE[n % PALETTE.length];
}

function initials(name) {
  return name.trim().split(" ").slice(0, 2)
    .map(w => w[0]?.toUpperCase() || "")
    .join("");
}

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}


// ═══════════════════════════════════════════
//   LOGIN
// ═══════════════════════════════════════════
window.login = function () {
  const name = document.getElementById("username").value.trim();
  if (!name) { showToast("Please enter your name", "error"); return; }

  currentUser = name;
  const first = name.split(" ")[0];

  document.getElementById("loginPage").style.display = "none";
  document.getElementById("mainApp").classList.remove("hidden");

  // Personalise UI
  document.getElementById("navUser").textContent = `Hi, ${first} 👋`;
  document.getElementById("postGreet").textContent =
    `${timeGreeting()}, ${first}! Let's get you visible.`;
  document.getElementById("reg_name").value = name;

  switchTab("post");
  loadProfiles();
};


// ═══════════════════════════════════════════
//   GO HOME — logo click
// ═══════════════════════════════════════════
window.goHome = function () {
  document.getElementById("mainApp").classList.add("hidden");
  document.getElementById("loginPage").style.display = "flex";
  document.getElementById("username").value = "";
  currentUser = ""; currentCoords = ""; locationText = "";
  allProfiles  = [];
};


// ═══════════════════════════════════════════
//   TABS
// ═══════════════════════════════════════════
window.switchTab = function (tab) {
  const postPanel   = document.getElementById("postPanel");
  const browsePanel = document.getElementById("browsePanel");
  const tabPost     = document.getElementById("tab-post");
  const tabBrowse   = document.getElementById("tab-browse");

  if (tab === "post") {
    postPanel.classList.remove("hidden");
    browsePanel.classList.add("hidden");
    tabPost.classList.add("active");
    tabBrowse.classList.remove("active");
  } else {
    postPanel.classList.add("hidden");
    browsePanel.classList.remove("hidden");
    tabPost.classList.remove("active");
    tabBrowse.classList.add("active");
  }
};


// ═══════════════════════════════════════════
//   LIVE SKILL CHIPS PREVIEW
// ═══════════════════════════════════════════
window.previewSkills = function () {
  const raw    = document.getElementById("reg_skills").value;
  const skills = raw.split(",").map(s => s.trim()).filter(Boolean);
  document.getElementById("skillPreview").innerHTML =
    skills.map(s => `<span class="skill-chip">${s}</span>`).join("");
};


// ═══════════════════════════════════════════
//   GPS LOCATION
// ═══════════════════════════════════════════
window.getLocation = function () {
  const btn    = document.getElementById("gpsBtn");
  const status = document.getElementById("gpsStatus");

  if (!navigator.geolocation) {
    showToast("Geolocation not supported by your browser", "error");
    return;
  }

  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting…';
  btn.disabled  = true;
  status.textContent = "";

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude.toFixed(5);
      const lon = pos.coords.longitude.toFixed(5);
      currentCoords = `${lat},${lon}`;

      try {
        const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
        const data = await res.json();
        const a    = data.address;
        locationText = [a.city || a.town || a.village, a.state, a.country]
          .filter(Boolean).join(", ");
      } catch {
        locationText = currentCoords;
      }

      document.getElementById("reg_location").value = locationText;
      status.textContent = `✓ Location captured (${currentCoords})`;
      btn.innerHTML = '<i class="fas fa-check"></i> Detected';
      btn.classList.add("done");
      btn.disabled = false;
    },
    () => {
      showToast("Couldn't get location — please allow location access", "error");
      btn.innerHTML = '<i class="fas fa-crosshairs"></i> Detect';
      btn.disabled = false;
    }
  );
};


// ═══════════════════════════════════════════
//   SUBMIT PROFILE
// ═══════════════════════════════════════════
window.submitProfile = async function () {
  const name     = document.getElementById("reg_name").value.trim();
  const role     = document.getElementById("reg_role").value.trim();
  const skillsRaw= document.getElementById("reg_skills").value.trim();
  const contact  = document.getElementById("reg_contact").value.trim();
  const location = document.getElementById("reg_location").value;

  if (!name || !role || !skillsRaw || !location) {
    showToast("Please fill all required fields and detect your location", "error");
    return;
  }

  const skills = skillsRaw.split(",").map(s => s.trim()).filter(Boolean);
  const btn    = document.getElementById("submitBtn");

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting…';

  try {
    await addDoc(collection(db, "talentspot_profiles"), {
      name, role, skills, contact,
      location: locationText || location,
      coords:   currentCoords,
      timestamp: Date.now()
    });

    showToast("Profile posted! You're now visible to employers 🎉", "success");
    resetForm();
    await loadProfiles();   // refresh list first
    switchTab("browse");    // then switch to browse
  } catch (err) {
    console.error(err);
    showToast("Failed to post — check Firebase config.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Post My Profile';
  }
};

function resetForm() {
  ["reg_role", "reg_skills", "reg_contact", "reg_location"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("reg_name").value = currentUser;
  document.getElementById("skillPreview").innerHTML = "";
  document.getElementById("gpsStatus").textContent = "";
  currentCoords = ""; locationText = "";

  const btn = document.getElementById("gpsBtn");
  if (btn) {
    btn.innerHTML = '<i class="fas fa-crosshairs"></i> Detect';
    btn.classList.remove("done");
    btn.disabled = false;
  }
}


// ═══════════════════════════════════════════
//   LOAD PROFILES
// ═══════════════════════════════════════════
async function loadProfiles() {
  try {
    const q    = query(collection(db, "talentspot_profiles"), orderBy("timestamp", "desc"));
    const snap = await getDocs(q);
    allProfiles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateBadge(allProfiles.length);
    renderProfiles(allProfiles);
  } catch (err) {
    console.error("Load error:", err);
  }
}

function updateBadge(n) {
  document.getElementById("navCount").textContent = n;
  document.getElementById("browseSubtitle").textContent =
    `${n} profile${n !== 1 ? "s" : ""} open to opportunities`;
}


// ═══════════════════════════════════════════
//   RENDER PROFILES
// ═══════════════════════════════════════════
function renderProfiles(list) {
  const grid  = document.getElementById("candidateGrid");
  const empty = document.getElementById("emptyState");
  const count = document.getElementById("resultCount");

  Array.from(grid.children).forEach(c => {
    if (c.id !== "emptyState") c.remove();
  });

  count.textContent = list.length
    ? `${list.length} profile${list.length !== 1 ? "s" : ""}`
    : "No matches";

  if (!list.length) { empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");

  list.forEach((p, i) => {
    const color  = avatarColor(p.name || "?");
    const abbr   = initials(p.name || "?");
    const skills = (p.skills || []).slice(0, 4);
    const more   = (p.skills || []).length - 4;

    const card = document.createElement("div");
    card.className = "ccard";
    card.style.animationDelay = `${i * 0.04}s`;

    card.innerHTML = `
      <div class="cc-top">
        <div class="cc-avatar" style="background:${color}">${abbr}</div>
        <span class="open-badge">Open</span>
      </div>
      <div class="cc-name">${p.name || "—"}</div>
      <div class="cc-role">${p.role || "—"}</div>
      <div class="cc-skills">
        ${skills.map(s => `<span class="cc-skill">${s}</span>`).join("")}
        ${more > 0 ? `<span class="cc-skill">+${more} more</span>` : ""}
      </div>
      <div class="cc-foot">
        <span class="cc-loc"><i class="fas fa-map-marker-alt"></i> ${p.location || "—"}</span>
      </div>
    `;

    card.addEventListener("click", () => openProfile(p));
    grid.appendChild(card);
  });
}


// ═══════════════════════════════════════════
//   FILTERS
// ═══════════════════════════════════════════
window.applyFilters = function () {
  const q   = document.getElementById("searchInput").value.toLowerCase();
  const exp = document.getElementById("expFilter").value;

  const filtered = allProfiles.filter(p => {
    const hay = [p.name, p.role, ...(p.skills || []), p.location].join(" ").toLowerCase();
    return (!q || hay.includes(q)) && (!exp || p.exp === exp);
  });

  renderProfiles(filtered);
};

window.clearFilters = function () {
  document.getElementById("searchInput").value = "";
  document.getElementById("expFilter").value   = "";
  renderProfiles(allProfiles);
};


// ═══════════════════════════════════════════
//   PROFILE MODAL
// ═══════════════════════════════════════════
function openProfile(p) {
  const color = avatarColor(p.name || "?");
  const abbr  = initials(p.name || "?");

  const mapBtn = p.coords
    ? `<button class="pm-map-btn" onclick="showMap('${p.coords}','${p.name}')">
         <i class="fas fa-map-marker-alt"></i> View on Map
       </button>`
    : "";

  const contactHtml = p.contact
    ? `<a class="pm-contact" href="mailto:${p.contact}">
         <i class="fas fa-envelope"></i> ${p.contact}
       </a>`
    : `<span style="color:var(--ink3);font-size:.85rem">Not provided</span>`;

  document.getElementById("profileContent").innerHTML = `
    <div class="pm-inner">
      <div class="pm-avatar" style="background:${color}">${abbr}</div>
      <div class="pm-name">${p.name || "—"}</div>
      <div class="pm-role">${p.role || "—"}</div>
      <span class="open-badge">Open to Work</span>

      <hr class="pm-divider">

      <div class="pm-label">Skills</div>
      <div class="pm-chips">
        ${(p.skills || []).map(s => `<span class="pm-chip">${s}</span>`).join("")
          || '<span style="color:var(--ink3)">—</span>'}
      </div>

      <div class="pm-label">Location</div>
      <div class="pm-val">${p.location || "—"}</div>
      ${mapBtn}

      <hr class="pm-divider">

      <div class="pm-label">Contact</div>
      ${contactHtml}
    </div>
  `;

  document.getElementById("profileModal").classList.remove("hidden");
}

window.closeProfile = function (e) {
  if (e.target === document.getElementById("profileModal")) closeProfileDirect();
};
window.closeProfileDirect = function () {
  document.getElementById("profileModal").classList.add("hidden");
};


// ═══════════════════════════════════════════
//   MAP MODAL
// ═══════════════════════════════════════════
window.showMap = function (coords, name) {
  document.getElementById("mapLabel").textContent = name || "Location";
  document.getElementById("mapFrame").src =
    `https://maps.google.com/maps?q=${coords}&z=14&output=embed`;
  document.getElementById("mapModal").classList.remove("hidden");
};

window.closeMap = function (e) {
  if (e.target === document.getElementById("mapModal")) closeMapDirect();
};
window.closeMapDirect = function () {
  document.getElementById("mapModal").classList.add("hidden");
  document.getElementById("mapFrame").src = "";
};


// ═══════════════════════════════════════════
//   TOAST
// ═══════════════════════════════════════════
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3400);
}

// Escape key closes modals
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeMapDirect(); closeProfileDirect(); }
});
