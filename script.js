// ═══════════════════════════════════════════
//   TALENTSPOT — Job Finder Portal Script
//   Firebase + Vanilla JS
// ═══════════════════════════════════════════

// ── Firebase Imports ──────────────────────
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
//  🔴 PASTE YOUR FIREBASE CONFIG HERE
// ══════════════════════════════════════════
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ── Init Firebase ─────────────────────────
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── State ─────────────────────────────────
let currentCoords  = "";
let locationText   = "";
let allProfiles    = [];   // cached from Firestore
let currentUser    = "";

// ── Avatar colour palette ─────────────────
const COLORS = [
  "#c94a1e","#e8813a","#1c7c54","#0d8c8c",
  "#7c3aed","#d97706","#0f766e","#be185d"
];

function avatarColor(name) {
  let n = 0;
  for (const c of name) n += c.charCodeAt(0);
  return COLORS[n % COLORS.length];
}

function initials(name) {
  return name.trim().split(" ").slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

function expLabel(val) {
  const map = {
    fresher: "Fresher",
    junior:  "Junior",
    mid:     "Mid-level",
    senior:  "Senior"
  };
  return map[val] || val;
}

// ── Greeting based on time of day ─────────
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
  const user = document.getElementById("username").value.trim();
  if (!user) {
    showToast("Please enter your name to continue", "error");
    return;
  }
  currentUser = user;

  document.getElementById("loginPage").style.display = "none";
  document.getElementById("mainApp").classList.remove("hidden");

  const greeting = `${timeGreeting()}, ${user.split(" ")[0]}! 👋`;
  document.getElementById("heroGreeting").textContent = greeting;
  document.getElementById("userGreeting").textContent = `Hi, ${user.split(" ")[0]}`;

  // Pre-fill name in register form
  document.getElementById("reg_name").value = user;

  loadProfiles();
};

// Allow pressing Enter on login input
document.getElementById("username")?.addEventListener("keydown", e => {
  if (e.key === "Enter") window.login();
});

// ═══════════════════════════════════════════
//   LOGOUT
// ═══════════════════════════════════════════
window.logout = function () {
  document.getElementById("mainApp").classList.add("hidden");
  document.getElementById("loginPage").style.display = "flex";
  document.getElementById("username").value = "";
  currentUser = "";
  currentCoords = "";
};

// ═══════════════════════════════════════════
//   TABS
// ═══════════════════════════════════════════
window.switchTab = function (tab) {
  const browsePanel   = document.getElementById("browsePanel");
  const registerPanel = document.getElementById("registerPanel");
  const tabBrowse     = document.getElementById("tab-browse");
  const tabRegister   = document.getElementById("tab-register");

  if (tab === "browse") {
    browsePanel.classList.remove("hidden");
    registerPanel.classList.add("hidden");
    tabBrowse.classList.add("active");
    tabRegister.classList.remove("active");
  } else {
    browsePanel.classList.add("hidden");
    registerPanel.classList.remove("hidden");
    tabBrowse.classList.remove("active");
    tabRegister.classList.add("active");
  }
};

// ═══════════════════════════════════════════
//   GET LOCATION (GPS)
// ═══════════════════════════════════════════
window.getLocation = function () {
  const hint = document.getElementById("locationHint");
  const btn  = document.querySelector(".btn-location");

  if (!navigator.geolocation) {
    showToast("Geolocation not supported by your browser.", "error");
    return;
  }

  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting…';
  btn.disabled  = true;

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      currentCoords = `${lat},${lon}`;

      // Reverse geocode using free Nominatim API
      try {
        const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
        const data = await res.json();
        const addr = data.address;
        locationText = [addr.city || addr.town || addr.village, addr.state, addr.country]
          .filter(Boolean).join(", ");
      } catch {
        locationText = currentCoords;
      }

      document.getElementById("reg_location").value = locationText;
      hint.textContent = `✓ Location captured (${currentCoords})`;

      btn.innerHTML = '<i class="fas fa-check"></i> Detected';
      btn.style.background = "var(--green)";
      btn.disabled = false;
    },
    (err) => {
      showToast("Could not get location. Please allow location access.", "error");
      btn.innerHTML = '<i class="fas fa-map-marker-alt"></i> Detect GPS';
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
  const category = document.getElementById("reg_category").value;
  const exp      = document.getElementById("reg_exp").value;
  const qual     = document.getElementById("reg_qual").value.trim();
  const skills   = document.getElementById("reg_skills").value.trim();
  const bio      = document.getElementById("reg_bio").value.trim();
  const contact  = document.getElementById("reg_contact").value.trim();
  const location = document.getElementById("reg_location").value;

  if (!name || !role || !category || !exp || !qual || !skills || !bio || !location) {
    showToast("Please fill all required fields (including GPS location)", "error");
    return;
  }

  const skillArray = skills.split(",").map(s => s.trim()).filter(Boolean);

  const btn = document.querySelector(".btn-submit");
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting…';
  btn.disabled = true;

  try {
    await addDoc(collection(db, "talentspot_profiles"), {
      name,
      role,
      category,
      exp,
      qual,
      skills: skillArray,
      bio,
      contact,
      location: locationText || location,
      coords: currentCoords,
      timestamp: Date.now()
    });

    showToast("Profile posted! You're now visible to employers 🎉", "success");
    resetRegisterForm();
    switchTab("browse");
    loadProfiles();
  } catch (err) {
    console.error(err);
    showToast("Failed to post profile. Check Firebase config.", "error");
  } finally {
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Post My Profile';
    btn.disabled = false;
  }
};

function resetRegisterForm() {
  ["reg_role","reg_qual","reg_skills","reg_bio","reg_contact","reg_location"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("reg_category").value = "";
  document.getElementById("reg_exp").value = "";
  document.getElementById("reg_name").value = currentUser;
  document.getElementById("locationHint").textContent = "";
  currentCoords = "";
  locationText  = "";

  const btn = document.querySelector(".btn-location");
  if (btn) {
    btn.innerHTML = '<i class="fas fa-map-marker-alt"></i> Detect GPS';
    btn.style.background = "";
  }
}

// ═══════════════════════════════════════════
//   LOAD PROFILES FROM FIRESTORE
// ═══════════════════════════════════════════
async function loadProfiles() {
  try {
    const q     = query(collection(db, "talentspot_profiles"), orderBy("timestamp", "desc"));
    const snap  = await getDocs(q);
    allProfiles = [];

    snap.forEach(doc => {
      allProfiles.push({ id: doc.id, ...doc.data() });
    });

    updateCount(allProfiles.length);
    renderProfiles(allProfiles);
  } catch (err) {
    console.error("Load error:", err);
    showToast("Failed to load profiles. Check Firebase config.", "error");
  }
}

function updateCount(n) {
  document.getElementById("totalCount").innerHTML =
    `<i class="fas fa-users"></i> <span>${n} Profile${n !== 1 ? "s" : ""}</span>`;
}

// ═══════════════════════════════════════════
//   RENDER PROFILES
// ═══════════════════════════════════════════
function renderProfiles(profiles) {
  const grid     = document.getElementById("candidateGrid");
  const empty    = document.getElementById("emptyState");
  const resInfo  = document.getElementById("resultsInfo");

  // Clear existing cards but keep empty state element
  Array.from(grid.children).forEach(child => {
    if (child.id !== "emptyState") child.remove();
  });

  resInfo.textContent = profiles.length
    ? `Showing ${profiles.length} profile${profiles.length !== 1 ? "s" : ""}`
    : "No profiles match your search";

  if (profiles.length === 0) {
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  profiles.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "candidate-card";
    card.style.animationDelay = `${i * 0.05}s`;

    const color   = avatarColor(p.name || "?");
    const abbr    = initials(p.name || "?");
    const skills  = (p.skills || []).slice(0, 4);
    const more    = (p.skills || []).length - 4;

    card.innerHTML = `
      <div class="card-avatar" style="background:${color}">${abbr}</div>
      <div class="card-header">
        <div>
          <div class="card-name">${p.name || "—"}</div>
          <div class="card-role">${p.role || "—"} · ${p.category || "—"}</div>
        </div>
        <span class="open-badge">Open</span>
      </div>
      <p class="card-bio">${p.bio || ""}</p>
      <div class="skills-row">
        ${skills.map(s => `<span class="skill-tag">${s}</span>`).join("")}
        ${more > 0 ? `<span class="skill-tag">+${more} more</span>` : ""}
      </div>
      <div class="card-footer">
        <span class="card-location">
          <i class="fas fa-map-marker-alt"></i>
          ${p.location || "Location not set"}
        </span>
        <span class="card-exp-badge">${expLabel(p.exp)}</span>
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
  const search = document.getElementById("searchInput").value.toLowerCase();
  const role   = document.getElementById("roleFilter").value;
  const exp    = document.getElementById("expFilter").value;

  const filtered = allProfiles.filter(p => {
    const haystack = [p.name, p.role, p.bio, p.qual, ...(p.skills || []), p.location]
      .join(" ").toLowerCase();
    const matchSearch   = !search || haystack.includes(search);
    const matchRole     = !role || p.category === role;
    const matchExp      = !exp  || p.exp === exp;
    return matchSearch && matchRole && matchExp;
  });

  renderProfiles(filtered);
};

window.clearFilters = function () {
  document.getElementById("searchInput").value = "";
  document.getElementById("roleFilter").value  = "";
  document.getElementById("expFilter").value   = "";
  renderProfiles(allProfiles);
};

// ═══════════════════════════════════════════
//   PROFILE DETAIL MODAL
// ═══════════════════════════════════════════
function openProfile(p) {
  const color = avatarColor(p.name || "?");
  const abbr  = initials(p.name || "?");

  const contactHtml = p.contact
    ? `<a class="pm-contact-link" href="mailto:${p.contact}">
         <i class="fas fa-envelope"></i> ${p.contact}
       </a>`
    : `<span style="color:var(--ink3);font-size:.88rem;">Not provided</span>`;

  const mapBtn = p.coords
    ? `<button class="pm-location-btn" onclick="showMap('${p.coords}', '${p.name}')">
         <i class="fas fa-map-marker-alt"></i> View on Map
       </button>`
    : "";

  document.getElementById("profileModalContent").innerHTML = `
    <div class="profile-modal-inner">
      <div class="pm-avatar" style="background:${color}">${abbr}</div>
      <div class="pm-name">${p.name || "—"}</div>
      <div class="pm-role">${p.role || "—"} · <strong>${p.category || "—"}</strong></div>
      <span class="open-badge">Open to Work</span>

      <hr class="pm-divider">

      <div class="pm-section">
        <div class="pm-section-label">About</div>
        <div class="pm-section-value">${p.bio || "—"}</div>
      </div>

      <div class="pm-section">
        <div class="pm-section-label">Qualifications</div>
        <div class="pm-section-value">${p.qual || "—"}</div>
      </div>

      <div class="pm-section">
        <div class="pm-section-label">Experience Level</div>
        <div class="pm-section-value">${expLabel(p.exp)}</div>
      </div>

      <div class="pm-section">
        <div class="pm-section-label">Skills</div>
        <div class="pm-chips">
          ${(p.skills || []).map(s => `<span class="pm-chip">${s}</span>`).join("")}
        </div>
      </div>

      <div class="pm-section">
        <div class="pm-section-label">Location</div>
        <div class="pm-section-value">${p.location || "—"}</div>
        ${mapBtn}
      </div>

      <div class="pm-section">
        <div class="pm-section-label">Contact</div>
        ${contactHtml}
      </div>
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
  document.getElementById("mapModalName").textContent = name || "Location";
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
let toastTimer;
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className   = `toast ${type} show`;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove("show");
  }, 3200);
}

// ── Close modals with Escape key ──────────
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeMapDirect();
    closeProfileDirect();
  }
});
