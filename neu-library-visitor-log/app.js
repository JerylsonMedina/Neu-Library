import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, setDoc, doc, getDoc, onSnapshot, query, where, orderBy, serverTimestamp, getDocs, getDocFromServer } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Firebase Configuration from environment
import firebaseConfig from './firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth();
const provider = new GoogleAuthProvider();

// Predefined Data
const DEPARTMENTS = {
    'Student': ['CAS', 'COE', 'CBA', 'CED', 'CON', 'CCS', 'CRIM', 'SHS'],
    'Employee': ['Academic', 'Non-Academic', 'Administration'],
    'Visitor': ['External', 'Alumni', 'Guest']
};

const PROGRAMS = {
    'CAS': ['BA Communication', 'BS Psychology', 'BS Biology'],
    'COE': ['BS Civil Engineering', 'BS Electrical Engineering', 'BS Mechanical Engineering'],
    'CBA': ['BS Accountancy', 'BS Business Administration', 'BS Hospitality Management'],
    'CED': ['BSEd English', 'BSEd Mathematics', 'BEEd'],
    'CON': ['BS Nursing'],
    'CCS': ['BS Computer Science', 'BS Information Technology', 'BS Information Systems'],
    'CRIM': ['BS Criminology'],
    'SHS': ['STEM', 'ABM', 'HUMSS', 'GAS'],
    'Academic': ['Faculty', 'Department Head'],
    'Non-Academic': ['Maintenance', 'Security', 'Library Staff'],
    'Administration': ['Registrar', 'Finance', 'HR'],
    'External': ['Researcher', 'Observer'],
    'Alumni': ['Graduate'],
    'Guest': ['Visitor']
};

const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  // Surface to UI
  const errorMsg = `Firestore ${operationType} error at ${path}: ${errInfo.error}`;
  alert(errorMsg);
  
  throw new Error(JSON.stringify(errInfo));
}

// Global State
const appState = {
    user: null,
    isAdmin: false,
    visits: [],
    blockedUsers: [],
    filteredVisits: [],
    stats: { today: 0, week: 0, month: 0 }
};

// DOM Elements
const screens = {
    login: document.getElementById('login-screen'),
    visitor: document.getElementById('visitor-screen'),
    admin: document.getElementById('admin-dashboard'),
    confirm: document.getElementById('confirm-modal')
};

const overlays = {
    success: document.getElementById('success-overlay'),
    blocked: document.getElementById('blocked-overlay'),
    confirm: document.getElementById('confirm-modal')
};

// Confirmation System
let confirmCallback = null;

function showConfirm(title, message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    
    confirmCallback = onConfirm;
    
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.add('opacity-100');
        modal.querySelector('div').classList.remove('scale-90');
        modal.querySelector('div').classList.add('scale-100');
    }, 10);
}

function hideConfirm() {
    const modal = document.getElementById('confirm-modal');
    modal.classList.remove('opacity-100');
    modal.querySelector('div').classList.remove('scale-100');
    modal.querySelector('div').classList.add('scale-90');
    setTimeout(() => modal.classList.add('hidden'), 300);
    confirmCallback = null;
}

// Toast System
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `p-4 rounded-lg shadow-lg text-white font-medium transform translate-y-10 opacity-0 transition-all duration-300 ${
        type === 'success' ? 'bg-neu-green' : 'bg-red-600'
    }`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    }, 10);
    
    // Remove after 3s
    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initialization
function init() {
    setupAuthListeners();
    setupEventListeners();
}

function setupAuthListeners() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log('User logged in:', user.email);
            
            // Check if blocked
            try {
                const blockedDoc = await getDoc(doc(db, 'blockedUsers', user.uid));
                if (blockedDoc.exists()) {
                    showOverlay('blocked');
                    setTimeout(() => signOut(auth), 3000);
                    return;
                }
            } catch (error) {
                handleFirestoreError(error, OperationType.GET, `blockedUsers/${user.uid}`);
            }

            appState.user = user;
            
            // Improved Admin Check
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                appState.isAdmin = user.email === 'jerylsonmedina@gmail.com' || (userDoc.exists() && userDoc.data().role === 'admin');
            } catch (error) {
                console.warn('Admin check failed, falling back to email check');
                appState.isAdmin = user.email === 'jerylsonmedina@gmail.com';
            }
            
            if (appState.isAdmin) {
                document.getElementById('admin-switch-container').classList.remove('hidden');
                showScreen('admin');
                startAdminListeners();
            } else {
                showScreen('visitor');
                populateVisitorForm(user);
                // Focus RFID
                setTimeout(() => document.getElementById('visitor-rfid').focus(), 500);
            }
        } else {
            appState.user = null;
            appState.isAdmin = false;
            showScreen('login');
        }
    });
}

function setupEventListeners() {
    // Confirm Buttons
    document.getElementById('confirm-cancel').addEventListener('click', hideConfirm);
    document.getElementById('confirm-ok').addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
        hideConfirm();
    });

    // Login Buttons
    document.getElementById('btn-visitor-login').addEventListener('click', () => handleLogin(false));
    document.getElementById('btn-admin-login').addEventListener('click', () => handleLogin(true));

    // Switch Buttons
    document.getElementById('btn-switch-to-admin').addEventListener('click', () => showScreen('admin'));
    document.getElementById('btn-switch-to-visitor').addEventListener('click', () => {
        showScreen('visitor');
        setTimeout(() => document.getElementById('visitor-rfid').focus(), 500);
    });
    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

    // Visitor Form
    const visitorForm = document.getElementById('visitor-form');
    visitorForm.addEventListener('submit', handleVisitorSubmit);

    // RFID Auto-submit simulation (if RFID is 10 digits)
    const rfidInput = document.getElementById('visitor-rfid');
    rfidInput.addEventListener('input', (e) => {
        if (e.target.value.length >= 10) {
            // Simulate scan completion
            showToast('RFID Scanned Successfully');
        }
    });

    // Dropdown Logic
    const categorySelect = document.getElementById('visitor-category');
    const deptSelect = document.getElementById('visitor-department');
    const progSelect = document.getElementById('visitor-program');

    categorySelect.addEventListener('change', (e) => {
        const cat = e.target.value;
        updateDropdown(deptSelect, DEPARTMENTS[cat] || []);
        updateDropdown(progSelect, []);
    });

    deptSelect.addEventListener('change', (e) => {
        const dept = e.target.value;
        updateDropdown(progSelect, PROGRAMS[dept] || []);
    });

    // Admin Tabs
    document.getElementById('tab-logs').addEventListener('click', () => switchAdminTab('logs'));
    document.getElementById('tab-blocked').addEventListener('click', () => switchAdminTab('blocked'));

    // Admin Filters
    document.getElementById('search-input').addEventListener('input', applyFilters);
    document.getElementById('filter-category').addEventListener('change', applyFilters);
    document.getElementById('filter-department').addEventListener('change', applyFilters);
    document.getElementById('filter-program').addEventListener('change', applyFilters);
    document.getElementById('filter-reason').addEventListener('change', applyFilters);
    
    // Export
    document.getElementById('btn-export').addEventListener('click', handleExport);

    // Populate Admin Filter Dropdowns (Initial)
    const allDepts = Object.values(DEPARTMENTS).flat();
    const allProgs = Object.values(PROGRAMS).flat();
    updateDropdown(document.getElementById('filter-department'), [...new Set(allDepts)], 'All Departments');
    updateDropdown(document.getElementById('filter-program'), [...new Set(allProgs)], 'All Programs');
}

function switchAdminTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active', 'text-neu-green', 'border-b-2', 'border-neu-green');
        btn.classList.add('text-gray-500');
    });
    const activeBtn = document.getElementById(`tab-${tabId}`);
    activeBtn.classList.add('active', 'text-neu-green', 'border-b-2', 'border-neu-green');
    activeBtn.classList.remove('text-gray-500');

    document.querySelectorAll('.admin-section').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(`section-${tabId}`).classList.remove('hidden');
}

// Logic Handlers
async function handleLogin(isAdminRequest) {
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        if (isAdminRequest) {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            const isAdmin = user.email === 'jerylsonmedina@gmail.com' || (userDoc.exists() && userDoc.data().role === 'admin');
            
            if (!isAdmin) {
                showToast('Access Denied: You do not have administrator privileges.', 'error');
                signOut(auth);
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('Login failed: ' + error.message, 'error');
    }
}

async function handleVisitorSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const visitData = {
        uid: appState.user.uid,
        name: appState.user.displayName,
        email: appState.user.email,
        rfid: document.getElementById('visitor-rfid').value || null,
        category: document.getElementById('visitor-category').value,
        department: document.getElementById('visitor-department').value,
        program: document.getElementById('visitor-program').value,
        reason: document.getElementById('visitor-reason').value,
        timeIn: serverTimestamp(),
        date: new Date().toISOString().split('T')[0]
    };

    try {
        await addDoc(collection(db, 'visits'), visitData);
        
        // Show Success
        const msg = document.getElementById('success-message');
        msg.textContent = `Welcome to NEU Library, ${visitData.name}!`;
        const sub = document.getElementById('success-submessage');
        sub.textContent = `Enjoy your visit (${visitData.program}).`;
        showOverlay('success');

        // Kiosk Auto-Logout
        setTimeout(async () => {
            await signOut(auth);
            hideOverlay('success');
            e.target.reset();
            btn.disabled = false;
        }, 3000);

    } catch (error) {
        console.error('Submit error:', error);
        showToast('Error saving entry. Please try again.', 'error');
        btn.disabled = false;
    }
}

function startAdminListeners() {
    // Visits Listener
    const qVisits = query(collection(db, 'visits'), orderBy('timeIn', 'desc'));
    onSnapshot(qVisits, (snapshot) => {
        appState.visits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        calculateStats();
        applyFilters();
    }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'visits');
    });

    // Blocked Users Listener
    const qBlocked = collection(db, 'blockedUsers');
    onSnapshot(qBlocked, (snapshot) => {
        appState.blockedUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderBlockedTable();
    }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'blockedUsers');
    });
}

function calculateStats() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    // Week start (Sunday)
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0,0,0,0);

    // Month start
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    appState.stats.today = appState.visits.filter(v => v.date === todayStr).length;
    appState.stats.week = appState.visits.filter(v => v.timeIn?.toDate() >= weekStart).length;
    appState.stats.month = appState.visits.filter(v => v.timeIn?.toDate() >= monthStart).length;

    document.getElementById('stat-today').textContent = appState.stats.today;
    document.getElementById('stat-week').textContent = appState.stats.week;
    document.getElementById('stat-month').textContent = appState.stats.month;
}

function applyFilters() {
    const search = document.getElementById('search-input').value.toLowerCase();
    const cat = document.getElementById('filter-category').value;
    const dept = document.getElementById('filter-department').value;
    const prog = document.getElementById('filter-program').value;
    const reason = document.getElementById('filter-reason').value;

    appState.filteredVisits = appState.visits.filter(v => {
        const matchesSearch = !search || 
            v.name.toLowerCase().includes(search) || 
            v.program.toLowerCase().includes(search) || 
            v.reason.toLowerCase().includes(search);
        
        const matchesCat = !cat || v.category === cat;
        const matchesDept = !dept || v.department === dept;
        const matchesProg = !prog || v.program === prog;
        const matchesReason = !reason || v.reason === reason;

        return matchesSearch && matchesCat && matchesDept && matchesProg && matchesReason;
    });

    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('visitor-table-body');
    tbody.innerHTML = '';

    appState.filteredVisits.forEach(v => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 transition-colors';
        
        const time = v.timeIn?.toDate() ? v.timeIn.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...';
        const date = v.date;

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-bold text-gray-900">${v.name}</div>
                <div class="text-xs text-gray-500">${v.email}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-700">${v.category}</div>
                <div class="text-xs text-gray-500">${v.program}</div>
            </td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 text-xs font-semibold rounded-full bg-neu-green/10 text-neu-green">
                    ${v.reason}
                </span>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-900">${time}</div>
                <div class="text-xs text-gray-500">${date}</div>
            </td>
            <td class="px-6 py-4">
                <button class="btn-block text-red-600 hover:text-red-800 text-xs font-bold uppercase tracking-wider" data-uid="${v.uid}" data-email="${v.email}">
                    Block
                </button>
            </td>
        `;

        tr.querySelector('.btn-block').addEventListener('click', (e) => handleBlockUser(e.target.dataset.uid, e.target.dataset.email));
        tbody.appendChild(tr);
    });
}

function renderBlockedTable() {
    const tbody = document.getElementById('blocked-table-body');
    tbody.innerHTML = '';

    appState.blockedUsers.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 transition-colors';
        
        const date = u.blockedAt?.toDate() ? u.blockedAt.toDate().toLocaleString() : '...';

        tr.innerHTML = `
            <td class="px-6 py-4 text-sm font-medium text-gray-900">${u.email}</td>
            <td class="px-6 py-4 text-sm text-gray-500">${date}</td>
            <td class="px-6 py-4">
                <button class="btn-unblock text-neu-green hover:text-green-800 text-xs font-bold uppercase tracking-wider" data-uid="${u.uid}">
                    Unblock
                </button>
            </td>
        `;

        tr.querySelector('.btn-unblock').addEventListener('click', (e) => handleUnblockUser(e.target.dataset.uid));
        tbody.appendChild(tr);
    });
}

async function handleBlockUser(uid, email) {
    showConfirm(
        'Block User',
        `Are you sure you want to block ${email}? This user will be barred from entering the library.`,
        async () => {
            try {
                await setDoc(doc(db, 'blockedUsers', uid), {
                    uid,
                    email,
                    blockedAt: serverTimestamp()
                });
                showToast('User has been blocked successfully.');
            } catch (error) {
                console.error('Block error:', error);
                showToast('Error blocking user.', 'error');
            }
        }
    );
}

async function handleUnblockUser(uid) {
    showConfirm(
        'Unblock User',
        'Are you sure you want to unblock this user?',
        async () => {
            try {
                const { deleteDoc } = await import('firebase/firestore');
                await deleteDoc(doc(db, 'blockedUsers', uid));
                showToast('User has been unblocked.');
            } catch (error) {
                console.error('Unblock error:', error);
                showToast('Error unblocking user.', 'error');
            }
        }
    );
}

function handleExport() {
    try {
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.setTextColor(0, 104, 55); // NEU Green
        doc.text('NEU Library Visitor Log Report', 14, 22);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

        const tableData = appState.filteredVisits.map(v => [
            v.name,
            v.email,
            v.category,
            v.program,
            v.reason,
            v.date,
            v.timeIn?.toDate()?.toLocaleTimeString() || ''
        ]);

        autoTable(doc, {
            startY: 35,
            head: [['Name', 'Email', 'Category', 'Program', 'Reason', 'Date', 'Time In']],
            body: tableData,
            headStyles: { fillColor: [0, 104, 55] },
            alternateRowStyles: { fillColor: [245, 245, 245] }
        });

        doc.save(`NEU_Library_Log_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('PDF Report generated successfully.');
    } catch (error) {
        console.error('Export error:', error);
        showToast('Error generating PDF report.', 'error');
    }
}

// UI Helpers
function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[screenId].classList.remove('hidden');
}

function showOverlay(overlayId) {
    const overlay = overlays[overlayId];
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('show'), 10);
}

function hideOverlay(overlayId) {
    const overlay = overlays[overlayId];
    overlay.classList.remove('show');
    setTimeout(() => overlay.classList.add('hidden'), 300);
}

function populateVisitorForm(user) {
    document.getElementById('visitor-name').value = user.displayName;
    document.getElementById('visitor-email').value = user.email;
}

function updateDropdown(select, items, defaultText = 'Select Option') {
    select.innerHTML = `<option value="" disabled selected>${defaultText}</option>`;
    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item;
        opt.textContent = item;
        select.appendChild(opt);
    });
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection test successful.");
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
    // Skip logging for other errors, as this is simply a connection test.
  }
}

init();
testConnection();
