import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import {
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
    createUserWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import {
    getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
    collection, query, where, orderBy, limit, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";
import { firebaseConfig, businessInfo } from "./firebase-config.js";

// =====================================================================
//  Small helpers
// =====================================================================
const $ = (id) => document.getElementById(id);

// Builds an element safely. Text is always set with textContent, never innerHTML,
// so anything a user types is shown as plain text.
function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === "text") node.textContent = String(value);
        else if (key === "className") node.className = value;
        else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of [].concat(children)) {
        if (child === null || child === undefined || child === false) continue;
        node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
}

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function show(node, on = true) { node.style.display = on ? "" : "none"; }
function setLoading(container, message = "Loading...") { clear(container); container.appendChild(el("div", { className: "loading", text: message })); }
function setEmpty(container, message) { clear(container); container.appendChild(el("div", { className: "empty", text: message })); }

function money(n) {
    const num = Number(n) || 0;
    return num.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(isoDate) {
    if (!isoDate) return "";
    const [y, m, d] = String(isoDate).split("-").map(Number);
    if (!y || !m || !d) return String(isoDate);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function todayISO() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function normEmail(e) { return String(e || "").trim().toLowerCase(); }

let toastTimer = null;
function toast(message) {
    const t = $("toast");
    t.textContent = message;
    show(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => show(t, false), 3500);
}

function globalStatus(message, kind = "") {
    const box = $("global-status");
    if (!message) { show(box, false); return; }
    box.className = "notice" + (kind ? " " + kind : "");
    box.textContent = message;
    show(box);
}

// Turns Firebase error codes into plain-English messages.
function friendlyError(error) {
    const code = (error && error.code) || "";
    const map = {
        "auth/invalid-credential": "That email and password don't match. Please try again.",
        "auth/invalid-login-credentials": "That email and password don't match. Please try again.",
        "auth/wrong-password": "That email and password don't match. Please try again.",
        "auth/user-not-found": "That email and password don't match. Please try again.",
        "auth/invalid-email": "That email address doesn't look right.",
        "auth/email-already-in-use": "An account with this email already exists. Try logging in or use 'Forgot password'.",
        "auth/weak-password": "Please choose a password with at least 6 characters.",
        "auth/too-many-requests": "Too many tries. Please wait a few minutes and try again.",
        "auth/network-request-failed": "Can't reach the internet. Check your connection and try again.",
        "auth/user-disabled": "This account has been turned off. Please contact Johnny.",
        "auth/operation-not-allowed": "Email/password sign-in isn't turned on in Firebase yet (see SETUP.md).",
        "auth/unauthorized-domain": "This website address isn't approved in Firebase yet (see SETUP.md, authorized domains).",
        "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "The Firebase settings in firebase-config.js aren't right yet.",
        "permission-denied": "You don't have permission to do that.",
        "unavailable": "Can't reach the server right now. Check your connection and try again.",
        "not-found": "That item couldn't be found. It may have been deleted."
    };
    if (map[code]) return map[code];
    if (code.startsWith("auth/api-key")) return map["auth/api-key-not-valid.-please-pass-a-valid-api-key."];
    return "Something went wrong. Please try again.";
}

async function withBusy(button, fn) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Please wait...";
    try { return await fn(); }
    finally { button.disabled = false; button.textContent = original; }
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        toast("Copied: " + text);
    } catch {
        window.prompt("Copy this:", text);
    }
}

function openModal(id) { show($(id)); document.body.style.overflow = "hidden"; }
function closeModal(id) { show($(id), false); document.body.style.overflow = ""; }
document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
        if (e.target === modal || e.target.classList.contains("modal-close")) closeModal(modal.id);
    });
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".modal").forEach((m) => { if (m.style.display !== "none") closeModal(m.id); });
});

// =====================================================================
//  Firebase setup
// =====================================================================
const configMissing = !firebaseConfig || !firebaseConfig.apiKey || String(firebaseConfig.apiKey).startsWith("YOUR_")
    || String(firebaseConfig.projectId || "").startsWith("YOUR_");

// DOM Elements
const loginSection = $("login-section");
const signupSection = $("signup-section");
const resetSection = $("reset-section");
const verifySection = $("verify-section");
const customerPortal = $("customer-portal");
const ownerDashboard = $("owner-dashboard");
const loginForm = $("login-form");
const logoutBtn = $("logout-btn");
const errorMsg = $("login-error");

const allScreens = [loginSection, signupSection, resetSection, verifySection, customerPortal, ownerDashboard];
function showScreen(screen) {
    allScreens.forEach((s) => show(s, s === screen));
    show(logoutBtn, screen === customerPortal || screen === ownerDashboard || screen === verifySection);
}

let app, auth, db;
if (configMissing) {
    show($("config-warning"));
    showScreen(loginSection);
    loginForm.querySelectorAll("input, button").forEach((n) => { n.disabled = true; });
} else {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    globalStatus("Loading...");
}

// App state
const state = {
    role: null,          // "owner" or "customer"
    customers: [],       // owner: all customer records
    customerUsers: new Set(), // owner: emails that have created an account
    logs: [],            // owner: all logs, or customer: own logs
    requests: [],
    payment: {},         // settings/payment
    myCustomer: null     // customer: own customer record
};

// =====================================================================
//  Login / sign up / password reset
// =====================================================================
document.querySelectorAll(".back-to-login").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); showScreen(loginSection); }));
$("show-signup").addEventListener("click", (e) => { e.preventDefault(); $("signup-error").textContent = ""; showScreen(signupSection); });
$("show-reset").addEventListener("click", (e) => {
    e.preventDefault();
    $("reset-email").value = $("email").value;
    $("reset-message").textContent = ""; $("reset-error").textContent = "";
    showScreen(resetSection);
});

// Handle Login
loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (configMissing) return;
    const email = $("email").value.trim();
    const password = $("password").value;
    errorMsg.textContent = "";
    const btn = loginForm.querySelector("button[type=submit]");
    withBusy(btn, () => signInWithEmailAndPassword(auth, email, password))
        .catch((error) => {
            errorMsg.textContent = friendlyError(error);
            console.error(error);
        });
});

// Handle Create Account
$("signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (configMissing) return;
    const err = $("signup-error");
    err.textContent = "";
    const name = $("signup-name").value.trim();
    const email = $("signup-email").value.trim();
    const pw = $("signup-password").value;
    if (pw !== $("signup-password2").value) { err.textContent = "The two passwords don't match."; return; }
    const btn = e.target.querySelector("button[type=submit]");
    try {
        await withBusy(btn, async () => {
            const cred = await createUserWithEmailAndPassword(auth, email, pw);
            try { await updateProfile(cred.user, { displayName: name }); } catch (x) { console.warn(x); }
            await sendEmailVerification(cred.user);
        });
        // onAuthStateChanged will now show the "check your email" screen.
    } catch (error) {
        err.textContent = friendlyError(error);
        console.error(error);
    }
});

// Handle Forgot Password
$("reset-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (configMissing) return;
    $("reset-message").textContent = ""; $("reset-error").textContent = "";
    const btn = e.target.querySelector("button[type=submit]");
    try {
        await withBusy(btn, () => sendPasswordResetEmail(auth, $("reset-email").value.trim()));
        $("reset-message").textContent = "If that email has an account, a reset link is on its way. Check your inbox (and spam folder).";
    } catch (error) {
        if (error.code === "auth/user-not-found") {
            $("reset-message").textContent = "If that email has an account, a reset link is on its way. Check your inbox (and spam folder).";
        } else {
            $("reset-error").textContent = friendlyError(error);
        }
    }
});

// Email verification screen
$("verify-resend-btn").addEventListener("click", async (e) => {
    $("verify-message").textContent = ""; $("verify-error").textContent = "";
    try {
        await withBusy(e.target, () => sendEmailVerification(auth.currentUser));
        $("verify-message").textContent = "Sent! Check your inbox.";
    } catch (error) { $("verify-error").textContent = friendlyError(error); }
});
$("verify-done-btn").addEventListener("click", async (e) => {
    $("verify-message").textContent = ""; $("verify-error").textContent = "";
    await withBusy(e.target, async () => {
        try {
            await auth.currentUser.reload();
            await auth.currentUser.getIdToken(true); // refresh so the database sees "verified"
            if (!auth.currentUser.emailVerified) {
                $("verify-error").textContent = "We don't see the verification yet. Click the link in the email first, then try again.";
                return;
            }
            await routeUser(auth.currentUser);
        } catch (error) { $("verify-error").textContent = friendlyError(error); }
    });
});

// Handle Logout
logoutBtn.addEventListener("click", () => {
    signOut(auth);
});

// =====================================================================
//  Auth State Observer & Role Routing
// =====================================================================
if (!configMissing) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await routeUser(user);
        } else {
            // User is signed out.
            state.role = null;
            globalStatus("");
            errorMsg.textContent = errorMsg.dataset.keep ? errorMsg.textContent : "";
            delete errorMsg.dataset.keep;
            showScreen(loginSection);
        }
    });
}

async function routeUser(user) {
    globalStatus("Loading your account...");
    try {
        // Check user role in Firestore 'users' collection
        const userRef = doc(db, "users", user.uid);
        let userDoc = await getDoc(userRef);

        if (userDoc.exists() && userDoc.data().role === "owner") {
            state.role = "owner";
            globalStatus("");
            showScreen(ownerDashboard);
            await loadOwnerData();
            return;
        }

        // Everyone else is a customer and must verify their email first.
        if (!user.emailVerified) {
            globalStatus("");
            $("verify-email-address").textContent = user.email || "";
            showScreen(verifySection);
            return;
        }

        if (!userDoc.exists()) {
            // First login: link this account to the customer record Johnny created.
            const linked = await linkCustomerAccount(user);
            if (!linked) return;
            userDoc = await getDoc(userRef);
        }

        state.role = "customer";
        globalStatus("");
        showScreen(customerPortal);
        await loadCustomerData(user);
    } catch (error) {
        console.error(error);
        globalStatus(friendlyError(error), "error-box");
    }
}

// Creates users/{uid} with role "customer". The security rules only allow this
// when Johnny has already added a customer record with the same email.
async function linkCustomerAccount(user) {
    const email = normEmail(user.email);
    let name = user.displayName || "";
    try {
        const custSnap = await getDoc(doc(db, "customers", email));
        if (!custSnap.exists()) throw { code: "permission-denied" };
        name = custSnap.data().name || name;
        await setDoc(doc(db, "users", user.uid), {
            role: "customer",
            email,
            name,
            createdAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error(error);
        if (error.code === "permission-denied") {
            errorMsg.textContent = "We couldn't find " + email + " on Johnny's customer list. Please contact Johnny so he can add you, then log in again.";
            errorMsg.dataset.keep = "1";
        } else {
            errorMsg.textContent = friendlyError(error);
            errorMsg.dataset.keep = "1";
        }
        globalStatus("");
        await signOut(auth);
        return false;
    }
}

// =====================================================================
//  Shared: service log status + payment buttons
// =====================================================================
function logStatus(log) {
    if (log.paid) return "paid";
    if (log.customerReportedPaid) return "pending";
    return "unpaid";
}
function statusLabel(status) {
    return { paid: "Paid", unpaid: "Unpaid", pending: "Payment sent - awaiting confirmation" }[status];
}

function cleanHandle(h) { return String(h || "").trim().replace(/^\$+/, ""); }
function cashAppUrl(cashtag, amount) {
    const tag = cleanHandle(cashtag).replace(/[^A-Za-z0-9_-]/g, "");
    if (!tag) return "";
    const amt = (Number(amount) || 0).toFixed(2);
    return "https://cash.app/$" + encodeURIComponent(tag) + "/" + amt;
}
function safeHttpsUrl(url) {
    try {
        const u = new URL(String(url || "").trim());
        return u.protocol === "https:" ? u.href : "";
    } catch { return ""; }
}
function hasPaymentOptions(p) {
    return !!(cleanHandle(p.cashtag) || String(p.zelle || "").trim() || cleanHandle(p.chime) || safeHttpsUrl(p.squareUrl));
}

// Pay buttons for an unpaid amount. forPrint=true shows plain text for receipts.
function buildPayBox(amount, forPrint = false) {
    const p = state.payment || {};
    if (!hasPaymentOptions(p)) return null;
    const box = el("div", { className: "pay-box" }, [el("div", { className: "pay-title", text: "Pay " + money(amount) + " online:" })]);
    const opts = el("div", { className: "pay-options" });
    const cash = cashAppUrl(p.cashtag, amount);
    if (cash) opts.appendChild(el("a", { className: "pay-link", href: cash, target: "_blank", rel: "noopener noreferrer", text: "Cash App ($" + cleanHandle(p.cashtag) + ")" }));
    const sq = safeHttpsUrl(p.squareUrl);
    if (sq) opts.appendChild(el("a", { className: "pay-link", href: sq, target: "_blank", rel: "noopener noreferrer", text: "Pay with card (Square)" }));
    const zelle = String(p.zelle || "").trim();
    if (zelle) opts.appendChild(el("span", { className: "pay-handle" }, [
        "Zelle: ", el("strong", { text: zelle }), " · " + money(amount),
        forPrint ? null : el("button", { className: "small secondary", type: "button", text: "Copy", onclick: () => copyText(zelle) })
    ]));
    const chime = cleanHandle(p.chime);
    if (chime) opts.appendChild(el("span", { className: "pay-handle" }, [
        "Chime: ", el("strong", { text: "$" + chime }), " · " + money(amount),
        forPrint ? null : el("button", { className: "small secondary", type: "button", text: "Copy", onclick: () => copyText("$" + chime) })
    ]));
    box.appendChild(opts);
    return box;
}

async function loadPaymentSettings() {
    try {
        const snap = await getDoc(doc(db, "settings", "payment"));
        state.payment = snap.exists() ? snap.data() : {};
    } catch (error) {
        console.warn("Could not load payment settings", error);
        state.payment = {};
    }
}

// =====================================================================
//  Receipt (owner and customer)
// =====================================================================
let currentReceiptLog = null;

function openReceipt(log) {
    currentReceiptLog = log;
    const box = $("receipt-content");
    clear(box);
    const status = logStatus(log);
    const head = el("div", { className: "receipt-head" }, [
        el("h2", { text: businessInfo.name || "Johnny G's Pool Service, Tile & Metal" }),
        businessInfo.city ? el("div", { text: businessInfo.city }) : null,
        businessInfo.phone ? el("div", { text: businessInfo.phone }) : null,
        businessInfo.email ? el("div", { text: businessInfo.email }) : null
    ]);
    const rows = [
        ["Receipt #", (log.id || "").slice(0, 8).toUpperCase()],
        ["Customer", log.customerName || log.customerEmail],
        ["Service date", formatDate(log.date)],
        ["Service", log.serviceType]
    ];
    if (log.ph !== null && log.ph !== undefined) rows.push(["pH", String(log.ph)]);
    if (log.chlorine !== null && log.chlorine !== undefined) rows.push(["Chlorine", log.chlorine + " ppm"]);
    if (log.alkalinity !== null && log.alkalinity !== undefined) rows.push(["Alkalinity", log.alkalinity + " ppm"]);
    if (log.notes) rows.push(["Notes", log.notes]);
    rows.push(["Status", statusLabel(status)]);
    const table = el("table", {}, rows.map(([k, v]) => el("tr", {}, [el("td", { text: k }), el("td", { text: v })])));
    table.appendChild(el("tr", { className: "total-row" }, [el("td", { text: status === "paid" ? "Amount paid" : "Amount due" }), el("td", { text: money(log.amount) })]));
    box.append(head, table);
    if (status !== "paid") { const pay = buildPayBox(log.amount, true); if (pay) box.appendChild(pay); }
    box.appendChild(el("div", { className: "receipt-foot", text: "Thank you for your business!" }));

    const isOwner = state.role === "owner";
    show($("receipt-email-btn"), isOwner);
    $("receipt-note").textContent = isOwner
        ? "'Email to Customer' opens your email app with the receipt filled in. Review it and press Send."
        : "";
    openModal("receipt-modal");
}

function receiptPlainText(log) {
    const status = logStatus(log);
    const lines = [
        businessInfo.name || "Johnny G's Pool Service, Tile & Metal",
        [businessInfo.city, businessInfo.phone, businessInfo.email].filter(Boolean).join(" | "),
        "",
        "RECEIPT #" + (log.id || "").slice(0, 8).toUpperCase(),
        "Customer: " + (log.customerName || log.customerEmail),
        "Service date: " + formatDate(log.date),
        "Service: " + log.serviceType
    ];
    if (log.ph !== null && log.ph !== undefined) lines.push("pH: " + log.ph);
    if (log.chlorine !== null && log.chlorine !== undefined) lines.push("Chlorine: " + log.chlorine + " ppm");
    if (log.alkalinity !== null && log.alkalinity !== undefined) lines.push("Alkalinity: " + log.alkalinity + " ppm");
    if (log.notes) lines.push("Notes: " + log.notes);
    lines.push("", (status === "paid" ? "Amount paid: " : "Amount due: ") + money(log.amount), "Status: " + statusLabel(status));
    if (status !== "paid" && hasPaymentOptions(state.payment)) {
        const p = state.payment;
        lines.push("", "Ways to pay:");
        const cash = cashAppUrl(p.cashtag, log.amount); if (cash) lines.push("Cash App: " + cash);
        const sq = safeHttpsUrl(p.squareUrl); if (sq) lines.push("Card (Square): " + sq);
        if (String(p.zelle || "").trim()) lines.push("Zelle: " + String(p.zelle).trim());
        if (cleanHandle(p.chime)) lines.push("Chime: $" + cleanHandle(p.chime));
    }
    lines.push("", "Thank you for your business!");
    return lines.join("\n");
}

$("receipt-print-btn").addEventListener("click", () => window.print());
$("receipt-email-btn").addEventListener("click", () => {
    const log = currentReceiptLog;
    if (!log) return;
    const subject = "Receipt - " + (businessInfo.name || "Johnny G's Pool Service") + " - " + formatDate(log.date);
    const href = "mailto:" + encodeURIComponent(log.customerEmail || "")
        + "?subject=" + encodeURIComponent(subject)
        + "&body=" + encodeURIComponent(receiptPlainText(log));
    window.location.href = href;
});

// =====================================================================
//  OWNER DASHBOARD
// =====================================================================
async function loadOwnerData() {
    setLoading($("owner-customers"));
    setLoading($("owner-logs"));
    setLoading($("owner-requests"));
    await Promise.all([loadCustomers(), loadOwnerLogs(), loadOwnerRequests(), loadPaymentSettings()]);
    renderPaymentSettings();
    renderOwnerSummary();
}

// ---------- Customers ----------
async function loadCustomers() {
    try {
        const [custSnap, userSnap] = await Promise.all([
            getDocs(query(collection(db, "customers"), orderBy("name"))),
            getDocs(query(collection(db, "users"), where("role", "==", "customer")))
        ]);
        state.customers = custSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        state.customerUsers = new Set(userSnap.docs.map((d) => normEmail(d.data().email)));
        renderCustomers();
        renderCustomerPickers();
    } catch (error) {
        console.error(error);
        setEmpty($("owner-customers"), "Couldn't load customers. " + friendlyError(error));
    }
}

function renderCustomers() {
    const box = $("owner-customers");
    clear(box);
    if (!state.customers.length) { setEmpty(box, "No customers yet. Tap 'Add Customer' to add your first one."); return; }
    for (const c of state.customers) {
        const balance = state.logs.filter((l) => l.customerEmail === c.id && !l.paid).reduce((s, l) => s + (Number(l.amount) || 0), 0);
        const hasAccount = state.customerUsers.has(c.id);
        box.appendChild(el("div", { className: "item-card" }, [
            el("div", { className: "item-top" }, [
                el("div", {}, [
                    el("div", { className: "item-title", text: c.name }),
                    el("div", { className: "item-meta", text: [c.email, c.phone].filter(Boolean).join(" · ") }),
                    c.address ? el("div", { className: "item-meta", text: c.address }) : null
                ]),
                el("div", {}, [
                    el("span", { className: "badge " + (hasAccount ? "paid" : ""), text: hasAccount ? "Has account" : "No account yet" }),
                    balance > 0 ? el("div", { className: "item-meta", text: "Owes " + money(balance) }) : null
                ])
            ]),
            c.poolNotes ? el("div", { className: "item-notes", text: c.poolNotes }) : null,
            el("div", { className: "item-actions" }, [
                el("button", { className: "small secondary", text: "Edit", onclick: () => openCustomerForm(c) }),
                el("button", { className: "small secondary", text: "Log Service", onclick: () => openLogForm(null, c.id) }),
                el("button", { className: "small danger", text: "Delete", onclick: () => deleteCustomer(c) })
            ])
        ]));
    }
}

function renderCustomerPickers() {
    const filter = $("log-customer-filter");
    const keep = filter.value;
    clear(filter);
    filter.appendChild(el("option", { value: "", text: "All customers" }));
    state.customers.forEach((c) => filter.appendChild(el("option", { value: c.id, text: c.name })));
    filter.value = state.customers.some((c) => c.id === keep) ? keep : "";
}

let editingCustomerId = null;
function openCustomerForm(c = null) {
    editingCustomerId = c ? c.id : null;
    $("customer-modal-title").textContent = c ? "Edit Customer" : "Add Customer";
    $("cust-name").value = c ? c.name || "" : "";
    $("cust-email").value = c ? c.email || c.id : "";
    $("cust-email").disabled = !!c;
    show($("cust-email-note"), !!c);
    $("cust-phone").value = c ? c.phone || "" : "";
    $("cust-address").value = c ? c.address || "" : "";
    $("cust-notes").value = c ? c.poolNotes || "" : "";
    $("customer-form-error").textContent = "";
    openModal("customer-modal");
    $("cust-name").focus();
}
$("add-customer-btn").addEventListener("click", () => openCustomerForm());

$("customer-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("customer-form-error");
    err.textContent = "";
    const email = editingCustomerId || normEmail($("cust-email").value);
    if (!email || !email.includes("@") || email.includes("/")) { err.textContent = "Please enter a valid email address."; return; }
    if (!editingCustomerId && state.customers.some((c) => c.id === email)) { err.textContent = "A customer with this email already exists."; return; }
    const data = {
        name: $("cust-name").value.trim(),
        email,
        phone: $("cust-phone").value.trim(),
        address: $("cust-address").value.trim(),
        poolNotes: $("cust-notes").value.trim(),
        updatedAt: serverTimestamp()
    };
    if (!data.name) { err.textContent = "Please enter a name."; return; }
    if (!editingCustomerId) data.createdAt = serverTimestamp();
    try {
        await withBusy(e.target.querySelector("button[type=submit]"), () => setDoc(doc(db, "customers", email), data, { merge: true }));
        closeModal("customer-modal");
        toast(editingCustomerId ? "Customer updated." : "Customer added. They can now create an account with " + email + ".");
        await loadCustomers();
    } catch (error) { console.error(error); err.textContent = friendlyError(error); }
});

async function deleteCustomer(c) {
    if (!confirm("Delete " + c.name + "? Their past service logs will be kept, but they won't be able to create a new account.")) return;
    try {
        await deleteDoc(doc(db, "customers", c.id));
        toast("Customer deleted.");
        await loadCustomers();
    } catch (error) { console.error(error); toast(friendlyError(error)); }
}

// ---------- Service logs ----------
async function loadOwnerLogs() {
    try {
        const snap = await getDocs(query(collection(db, "serviceLogs"), orderBy("date", "desc"), limit(500)));
        state.logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderOwnerLogs();
        renderCustomers();
    } catch (error) {
        console.error(error);
        setEmpty($("owner-logs"), "Couldn't load service logs. " + friendlyError(error));
    }
}

function filteredOwnerLogs() {
    const cust = $("log-customer-filter").value;
    const paid = $("log-paid-filter").value;
    return state.logs.filter((l) => (!cust || l.customerEmail === cust) && (!paid || logStatus(l) === paid));
}
$("log-customer-filter").addEventListener("change", renderOwnerLogs);
$("log-paid-filter").addEventListener("change", renderOwnerLogs);

function readingsText(l) {
    const parts = [];
    if (l.ph !== null && l.ph !== undefined) parts.push("pH " + l.ph);
    if (l.chlorine !== null && l.chlorine !== undefined) parts.push("Cl " + l.chlorine + " ppm");
    if (l.alkalinity !== null && l.alkalinity !== undefined) parts.push("Alk " + l.alkalinity + " ppm");
    return parts.join(" · ");
}

function renderOwnerLogs() {
    const box = $("owner-logs");
    clear(box);
    const logs = filteredOwnerLogs();
    if (!logs.length) { setEmpty(box, state.logs.length ? "No service logs match these filters." : "No service logs yet. Tap 'Log New Service' to add one."); return; }
    for (const l of logs) {
        const status = logStatus(l);
        const actions = [
            el("button", { className: "small", text: "Receipt", onclick: () => openReceipt(l) }),
            el("button", { className: "small secondary", text: "Edit", onclick: () => openLogForm(l) })
        ];
        if (status === "paid") actions.push(el("button", { className: "small secondary", text: "Mark Unpaid", onclick: () => setPaid(l, false) }));
        else actions.push(el("button", { className: "small secondary", text: status === "pending" ? "Confirm Paid" : "Mark Paid", onclick: () => setPaid(l, true) }));
        actions.push(el("button", { className: "small danger", text: "Delete", onclick: () => deleteLog(l) }));
        box.appendChild(el("div", { className: "item-card " + status }, [
            el("div", { className: "item-top" }, [
                el("div", {}, [
                    el("div", { className: "item-title", text: (l.customerName || l.customerEmail) + " - " + l.serviceType }),
                    el("div", { className: "item-meta", text: formatDate(l.date) + (readingsText(l) ? " · " + readingsText(l) : "") })
                ]),
                el("div", {}, [el("div", { className: "amount", text: money(l.amount) }), el("span", { className: "badge " + status, text: statusLabel(status) })])
            ]),
            l.notes ? el("div", { className: "item-notes", text: l.notes }) : null,
            el("div", { className: "item-actions" }, actions)
        ]));
    }
}

async function setPaid(l, paid) {
    try {
        const update = { paid, updatedAt: serverTimestamp() };
        if (!paid) update.customerReportedPaid = false;
        await updateDoc(doc(db, "serviceLogs", l.id), update);
        toast(paid ? "Marked as paid." : "Marked as unpaid.");
        await loadOwnerLogs();
        renderOwnerSummary();
    } catch (error) { console.error(error); toast(friendlyError(error)); }
}

async function deleteLog(l) {
    if (!confirm("Delete this service log for " + (l.customerName || l.customerEmail) + " on " + formatDate(l.date) + "? This can't be undone.")) return;
    try {
        await deleteDoc(doc(db, "serviceLogs", l.id));
        toast("Service log deleted.");
        await loadOwnerLogs();
        renderOwnerSummary();
    } catch (error) { console.error(error); toast(friendlyError(error)); }
}

let editingLogId = null;
function openLogForm(log = null, presetCustomer = "") {
    if (!state.customers.length) { toast("Add a customer first."); openCustomerForm(); return; }
    editingLogId = log ? log.id : null;
    $("log-modal-title").textContent = log ? "Edit Service Log" : "Log New Service";
    const sel = $("log-customer");
    clear(sel);
    sel.appendChild(el("option", { value: "", text: "Choose a customer..." }));
    state.customers.forEach((c) => sel.appendChild(el("option", { value: c.id, text: c.name + " (" + c.id + ")" })));
    if (log && !state.customers.some((c) => c.id === log.customerEmail)) {
        sel.appendChild(el("option", { value: log.customerEmail, text: (log.customerName || log.customerEmail) + " (deleted customer)" }));
    }
    sel.value = log ? log.customerEmail : presetCustomer;
    $("log-date").value = log ? log.date : todayISO();
    $("log-type").value = log ? log.serviceType : "Cleaning";
    $("log-ph").value = log && log.ph !== null && log.ph !== undefined ? log.ph : "";
    $("log-chlorine").value = log && log.chlorine !== null && log.chlorine !== undefined ? log.chlorine : "";
    $("log-alkalinity").value = log && log.alkalinity !== null && log.alkalinity !== undefined ? log.alkalinity : "";
    $("log-notes").value = log ? log.notes || "" : "";
    $("log-amount").value = log ? log.amount : "";
    $("log-paid").checked = log ? !!log.paid : false;
    $("log-form-error").textContent = "";
    openModal("log-modal");
}
$("add-service-log").addEventListener("click", () => openLogForm());

function numOrNull(v) { if (v === "" || v === null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; }

$("log-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("log-form-error");
    err.textContent = "";
    const custId = $("log-customer").value;
    if (!custId) { err.textContent = "Please choose a customer."; return; }
    const cust = state.customers.find((c) => c.id === custId);
    const amount = numOrNull($("log-amount").value);
    if (amount === null || amount < 0) { err.textContent = "Please enter the amount charged (0 or more)."; return; }
    const data = {
        customerId: custId,              // the customer's record id (their email)
        customerEmail: custId,
        customerName: cust ? cust.name : (state.logs.find((l) => l.id === editingLogId) || {}).customerName || custId,
        date: $("log-date").value,
        serviceType: $("log-type").value,
        ph: numOrNull($("log-ph").value),
        chlorine: numOrNull($("log-chlorine").value),
        alkalinity: numOrNull($("log-alkalinity").value),
        notes: $("log-notes").value.trim(),
        amount: Math.round(amount * 100) / 100,
        paid: $("log-paid").checked,
        updatedAt: serverTimestamp()
    };
    if (!data.date) { err.textContent = "Please choose a date."; return; }
    try {
        await withBusy(e.target.querySelector("button[type=submit]"), async () => {
            if (editingLogId) {
                await updateDoc(doc(db, "serviceLogs", editingLogId), data);
            } else {
                data.customerReportedPaid = false;
                data.createdAt = serverTimestamp();
                await addDoc(collection(db, "serviceLogs"), data);
            }
        });
        closeModal("log-modal");
        toast(editingLogId ? "Service log updated." : "Service logged.");
        await loadOwnerLogs();
        renderOwnerSummary();
    } catch (error) { console.error(error); err.textContent = friendlyError(error); }
});

// 'Send Email Receipt' button: pick a log, then show its receipt.
$("send-receipt").addEventListener("click", () => {
    const sel = $("pick-log-select");
    clear(sel);
    $("pick-log-error").textContent = "";
    if (!state.logs.length) { toast("No service logs yet. Log a service first."); return; }
    state.logs.slice(0, 100).forEach((l) => sel.appendChild(el("option", {
        value: l.id,
        text: formatDate(l.date) + " - " + (l.customerName || l.customerEmail) + " - " + l.serviceType + " - " + money(l.amount)
    })));
    openModal("pick-log-modal");
});
$("pick-log-go").addEventListener("click", () => {
    const log = state.logs.find((l) => l.id === $("pick-log-select").value);
    if (!log) { $("pick-log-error").textContent = "Please choose a service log."; return; }
    closeModal("pick-log-modal");
    openReceipt(log);
});

// ---------- Service requests (owner) ----------
async function loadOwnerRequests() {
    try {
        const snap = await getDocs(query(collection(db, "serviceRequests"), orderBy("createdAt", "desc"), limit(300)));
        state.requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderOwnerRequests();
    } catch (error) {
        console.error(error);
        setEmpty($("owner-requests"), "Couldn't load service requests. " + friendlyError(error));
    }
}
$("request-status-filter").addEventListener("change", renderOwnerRequests);

function renderOwnerRequests() {
    const box = $("owner-requests");
    clear(box);
    const f = $("request-status-filter").value;
    const list = state.requests.filter((r) => f === "all" || (f === "open" ? r.status !== "done" : r.status === f));
    if (!list.length) { setEmpty(box, state.requests.length ? "No requests match this filter." : "No service requests yet."); return; }
    for (const r of list) {
        const statusSel = el("select", { "aria-label": "Request status", onchange: (e) => setRequestStatus(r, e.target.value) },
            ["new", "scheduled", "done"].map((s) => el("option", { value: s, text: s[0].toUpperCase() + s.slice(1) })));
        statusSel.value = r.status || "new";
        box.appendChild(el("div", { className: "item-card" }, [
            el("div", { className: "item-top" }, [
                el("div", {}, [
                    el("div", { className: "item-title", text: (r.customerName || r.customerEmail) + " - " + r.serviceType }),
                    el("div", { className: "item-meta", text: "Preferred date: " + formatDate(r.preferredDate) + " · " + r.customerEmail })
                ]),
                el("span", { className: "badge " + (r.status || "new"), text: r.status || "new" })
            ]),
            r.notes ? el("div", { className: "item-notes", text: r.notes }) : null,
            el("div", { className: "item-actions" }, [
                el("label", { className: "muted", text: "Status:" }), statusSel,
                el("button", { className: "small secondary", text: "Log Service", onclick: () => openLogForm(null, r.customerEmail) })
            ])
        ]));
    }
}

async function setRequestStatus(r, status) {
    try {
        await updateDoc(doc(db, "serviceRequests", r.id), { status, updatedAt: serverTimestamp() });
        r.status = status;
        toast("Request marked " + status + ".");
        renderOwnerRequests();
        renderOwnerSummary();
    } catch (error) { console.error(error); toast(friendlyError(error)); }
}

// ---------- Payment settings (owner) ----------
function renderPaymentSettings() {
    const p = state.payment || {};
    $("pay-cashtag").value = p.cashtag || "";
    $("pay-zelle").value = p.zelle || "";
    $("pay-chime").value = p.chime || "";
    $("pay-square").value = p.squareUrl || "";
    const box = $("payment-settings-summary");
    clear(box);
    if (!hasPaymentOptions(p)) { setEmpty(box, "No payment options set yet. Tap 'Edit' to add your Cash App, Zelle, Chime, or Square link."); return; }
    const items = [];
    if (cleanHandle(p.cashtag)) items.push("Cash App: $" + cleanHandle(p.cashtag));
    if (String(p.zelle || "").trim()) items.push("Zelle: " + p.zelle);
    if (cleanHandle(p.chime)) items.push("Chime: $" + cleanHandle(p.chime));
    if (safeHttpsUrl(p.squareUrl)) items.push("Square: " + safeHttpsUrl(p.squareUrl));
    box.appendChild(el("ul", {}, items.map((t) => el("li", { text: t }))));
}
$("toggle-payment-settings").addEventListener("click", () => {
    const f = $("payment-settings-form");
    show(f, f.style.display === "none");
    $("payment-settings-message").textContent = ""; $("payment-settings-error").textContent = "";
});
$("payment-settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("payment-settings-message"), err = $("payment-settings-error");
    msg.textContent = ""; err.textContent = "";
    const squareRaw = $("pay-square").value.trim();
    if (squareRaw && !safeHttpsUrl(squareRaw)) { err.textContent = "The Square link must start with https://"; return; }
    const data = {
        cashtag: cleanHandle($("pay-cashtag").value),
        zelle: $("pay-zelle").value.trim(),
        chime: cleanHandle($("pay-chime").value),
        squareUrl: squareRaw,
        updatedAt: serverTimestamp()
    };
    try {
        await withBusy(e.target.querySelector("button[type=submit]"), () => setDoc(doc(db, "settings", "payment"), data));
        state.payment = data;
        renderPaymentSettings();
        msg.textContent = "Saved. Customers will see these Pay options on unpaid invoices.";
    } catch (error) { console.error(error); err.textContent = friendlyError(error); }
});

function renderOwnerSummary() {
    const box = $("owner-summary");
    clear(box);
    const unpaid = state.logs.filter((l) => !l.paid);
    const owed = unpaid.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const pending = state.logs.filter((l) => logStatus(l) === "pending").length;
    const newReq = state.requests.filter((r) => r.status === "new").length;
    const card = (label, value, extra = "") => el("div", { className: "summary-card " + extra }, [el("div", { className: "label", text: label }), el("div", { className: "value", text: value })]);
    box.append(
        card("Customers", String(state.customers.length)),
        card("Owed to you", money(owed), owed > 0 ? "due" : ""),
        card("Payments to confirm", String(pending)),
        card("New requests", String(newReq))
    );
}

// =====================================================================
//  CUSTOMER PORTAL
// =====================================================================
async function loadCustomerData(user) {
    const email = normEmail(user.email);
    setLoading($("customer-data"));
    setLoading($("customer-requests"), "Loading your requests...");
    try {
        const [custSnap] = await Promise.all([getDoc(doc(db, "customers", email)), loadPaymentSettings()]);
        state.myCustomer = custSnap.exists() ? custSnap.data() : null;
    } catch (error) { console.warn(error); state.myCustomer = null; }
    const name = (state.myCustomer && state.myCustomer.name) || user.displayName || "";
    $("customer-name-greeting").textContent = name ? ", " + name.split(" ")[0] : "";
    await Promise.all([loadMyLogs(email), loadMyRequests(email)]);
}

async function loadMyLogs(email) {
    try {
        // Only this customer's logs. The security rules block everything else.
        const snap = await getDocs(query(collection(db, "serviceLogs"), where("customerEmail", "==", email)));
        state.logs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.date).localeCompare(String(a.date)));
        renderMyLogs();
    } catch (error) {
        console.error(error);
        setEmpty($("customer-data"), "Couldn't load your service history. " + friendlyError(error));
    }
}

function renderMyLogs() {
    const box = $("customer-data");
    clear(box);
    const summary = $("customer-summary");
    clear(summary);
    const due = state.logs.filter((l) => !l.paid).reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const pendingAmt = state.logs.filter((l) => logStatus(l) === "pending").reduce((s, l) => s + (Number(l.amount) || 0), 0);
    summary.append(
        el("div", { className: "summary-card " + (due > 0 ? "due" : "") }, [el("div", { className: "label", text: "Balance due" }), el("div", { className: "value", text: money(due) })]),
        el("div", { className: "summary-card" }, [el("div", { className: "label", text: "Awaiting confirmation" }), el("div", { className: "value", text: money(pendingAmt) })]),
        el("div", { className: "summary-card" }, [el("div", { className: "label", text: "Service visits" }), el("div", { className: "value", text: String(state.logs.length) })])
    );
    if (!state.logs.length) { setEmpty(box, "No service visits yet. Once Johnny logs a visit, it will show up here."); return; }
    for (const l of state.logs) {
        const status = logStatus(l);
        const actions = [el("button", { className: "small secondary", text: "View Receipt", onclick: () => openReceipt(l) })];
        if (status === "unpaid") actions.push(el("button", { className: "small", text: "I've Paid", onclick: (e) => reportPaid(l, e.target) }));
        box.appendChild(el("div", { className: "item-card " + status }, [
            el("div", { className: "item-top" }, [
                el("div", {}, [
                    el("div", { className: "item-title", text: l.serviceType }),
                    el("div", { className: "item-meta", text: formatDate(l.date) + (readingsText(l) ? " · " + readingsText(l) : "") })
                ]),
                el("div", {}, [el("div", { className: "amount", text: money(l.amount) }), el("span", { className: "badge " + status, text: statusLabel(status) })])
            ]),
            l.notes ? el("div", { className: "item-notes", text: l.notes }) : null,
            status === "unpaid" ? buildPayBox(l.amount) : null,
            el("div", { className: "item-actions" }, actions)
        ]));
    }
}

async function reportPaid(l, btn) {
    if (!confirm("Let Johnny know you've paid " + money(l.amount) + " for " + l.serviceType + " on " + formatDate(l.date) + "? He'll confirm once he sees it.")) return;
    try {
        await withBusy(btn, () => updateDoc(doc(db, "serviceLogs", l.id), { customerReportedPaid: true, customerReportedAt: serverTimestamp() }));
        l.customerReportedPaid = true;
        toast("Thanks! Johnny will confirm your payment.");
        renderMyLogs();
    } catch (error) { console.error(error); toast(friendlyError(error)); }
}

// ---------- Service requests (customer) ----------
async function loadMyRequests(email) {
    try {
        const snap = await getDocs(query(collection(db, "serviceRequests"), where("customerEmail", "==", email)));
        state.requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0));
        renderMyRequests();
    } catch (error) {
        console.error(error);
        setEmpty($("customer-requests"), "Couldn't load your requests. " + friendlyError(error));
    }
}

function renderMyRequests() {
    const box = $("customer-requests");
    clear(box);
    if (!state.requests.length) { setEmpty(box, "No requests yet. Tap 'New Request' to ask for a visit."); return; }
    for (const r of state.requests.slice(0, 20)) {
        box.appendChild(el("div", { className: "item-card" }, [
            el("div", { className: "item-top" }, [
                el("div", {}, [
                    el("div", { className: "item-title", text: r.serviceType }),
                    el("div", { className: "item-meta", text: "Preferred date: " + formatDate(r.preferredDate) })
                ]),
                el("span", { className: "badge " + (r.status || "new"), text: r.status || "new" })
            ]),
            r.notes ? el("div", { className: "item-notes", text: r.notes }) : null
        ]));
    }
}

function toggleRequestForm(on) {
    show($("request-form"), on);
    if (on) { $("req-date").value = todayISO(); $("req-date").min = todayISO(); $("req-notes").value = ""; $("request-error").textContent = ""; }
}
$("toggle-request-form").addEventListener("click", () => toggleRequestForm($("request-form").style.display === "none"));
$("cancel-request").addEventListener("click", () => toggleRequestForm(false));

$("request-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("request-error");
    err.textContent = "";
    const user = auth.currentUser;
    const email = normEmail(user.email);
    const data = {
        customerId: email,               // the customer's record id (their email)
        customerEmail: email,
        customerUid: user.uid,
        customerName: (state.myCustomer && state.myCustomer.name) || user.displayName || email,
        preferredDate: $("req-date").value,
        serviceType: $("req-type").value,
        notes: $("req-notes").value.trim().slice(0, 1000),
        status: "new",
        createdAt: serverTimestamp()
    };
    if (!data.preferredDate) { err.textContent = "Please choose a date."; return; }
    try {
        await withBusy(e.target.querySelector("button[type=submit]"), () => addDoc(collection(db, "serviceRequests"), data));
        toggleRequestForm(false);
        toast("Request sent! Johnny will be in touch.");
        await loadMyRequests(email);
    } catch (error) { console.error(error); err.textContent = friendlyError(error); }
});
