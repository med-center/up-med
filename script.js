import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// --- 1. Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyAmt2szWOjQBPfzfs7QfQVysgfaRzHyPa0",
    authDomain: "up-med-online.firebaseapp.com",
    databaseURL: "https://up-med-online-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "up-med-online",
    storageBucket: "up-med-online.appspot.com",
    messagingSenderId: "381838942970",
    appId: "1:381838942970:web:8f83a02ba1544d54a95f43"
};

const SHEET_URL = "https://script.google.com/macros/s/AKfycbx3w-VDqi8gOYZIjIhCXnlzexcfczbscvVEATgPIh_gKuQ7hN3ZT7tdHbiL4FWSNFgXpg/exec";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Global Variables
window.sheetMeds = [];
window.sheetWithdrawals = [];
window.expiringMeds = []; 
window.firebaseMeds = [];
window.currentFilter = 'all';

// --- 2. Utility Functions ---
const getVal = (obj, keys) => {
    if (!obj) return null;
    const objKeys = Object.keys(obj);
    let targetKey = objKeys.find(k => keys.some(key => k.trim().toLowerCase() === key.trim().toLowerCase()));
    if (!targetKey) {
        targetKey = objKeys.find(k => keys.some(key => k.includes(key) || key.includes(k)));
    }
    const val = targetKey ? obj[targetKey] : null;
    return (val === "" || val === undefined || String(val).trim() === "") ? null : val;
};

const parseStockValue = (val) => {
    if (val === null || val === undefined || val === "") return 0;
    const cleaned = String(val).replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
};

const normalizeName = (name) => {
    if (!name) return "";
    return String(name).replace(/\s+/g, '').toLowerCase();
};

window.parseDate = (dateVal) => {
    if (!dateVal || String(dateVal).trim() === "" || dateVal === "-") return null;
    if (dateVal instanceof Date) return dateVal;
    let d = new Date(dateVal);
    if (!isNaN(d.getTime())) {
        if (d.getFullYear() <= 1970) return null; 
        if (d.getFullYear() > 2500) d.setFullYear(d.getFullYear() - 543);
        return d;
    }
    return null;
};

// --- 3. UI Navigation & Modal ---
window.toggleMenu = () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (sidebar.classList.contains('hidden')) {
        sidebar.classList.remove('hidden');
        sidebar.classList.add('fixed', 'inset-y-0', 'left-0', 'w-64');
        overlay.classList.remove('hidden');
    } else {
        sidebar.classList.add('hidden');
        sidebar.classList.remove('fixed', 'inset-y-0', 'left-0', 'w-64');
        overlay.classList.add('hidden');
    }
};

window.changePage = (p) => {
    const pageDb = document.getElementById('page-db');
    const pageIn = document.getElementById('page-in');
    
    // Desktop Buttons
    const btnDb = document.getElementById('btn-db');
    const btnIn = document.getElementById('btn-in');

    // Mobile Buttons
    const btnDbMob = document.getElementById('btn-db-mob');
    const btnInMob = document.getElementById('btn-in-mob');
    
    // Switch Pages
    pageDb?.classList.toggle('hidden-page', p !== 'db');
    pageIn?.classList.toggle('hidden-page', p !== 'in');
    
    // UI Feedback Desktop
    [btnDb, btnIn].forEach(btn => btn?.classList.remove('bg-white/20', 'opacity-100'));
    if (p === 'db') btnDb?.classList.add('bg-white/20', 'opacity-100');
    else btnIn?.classList.add('bg-white/20', 'opacity-100');

    // UI Feedback Mobile
    if(p === 'db') {
        btnDbMob?.classList.add('bg-purple-100', 'text-purple-700');
        btnDbMob?.classList.remove('text-slate-400');
        btnInMob?.classList.remove('bg-purple-100', 'text-purple-700');
        btnInMob?.classList.add('text-slate-400');
    } else {
        btnInMob?.classList.add('bg-purple-100', 'text-purple-700');
        btnInMob?.classList.remove('text-slate-400');
        btnDbMob?.classList.remove('bg-purple-100', 'text-purple-700');
        btnDbMob?.classList.add('text-slate-400');
    }

    if (window.innerWidth < 1024) {
        document.getElementById('sidebar')?.classList.add('hidden');
        document.getElementById('overlay')?.classList.add('hidden');
    }
    window.render();
};

window.goToFilter = (f) => {
    window.currentFilter = f;
    window.changePage('in'); 
};

window.setFilter = (f) => {
    window.currentFilter = f;
    const label = document.getElementById('filter-status-label');
    if(label) {
        const labels = { 'all': 'ทั้งหมด', 'low': 'ใกล้หมด', 'out': 'หมดคลัง', 'exp': 'วิกฤต/หมดอายุ', 'dead': 'Dead Stock' };
        label.innerText = labels[f] || 'ทั้งหมด';
    }
    window.render();
};

window.showMedDetail = (medJson) => {
    const m = JSON.parse(decodeURIComponent(medJson));
    const modal = document.getElementById('med-modal');
    if (!modal) return;
    
    document.getElementById('modal-name').innerText = m.name;
    document.getElementById('modal-cat').innerText = m.category || 'ทั่วไป';
    document.getElementById('modal-stock').innerText = m.stock.toLocaleString();
    document.getElementById('modal-min').innerText = m.minStock.toLocaleString();
    document.getElementById('modal-lot').innerText = m.lot;
    document.getElementById('modal-unit').innerText = m.unit || 'หน่วย';

    const expLabel = document.getElementById('modal-exp');
    if (expLabel) {
        expLabel.innerText = m.daysToExpiry !== undefined ? `อีก ${m.daysToExpiry} วันหมดอายุ` : 'ไม่ระบุ';
    }

    const statusEl = document.getElementById('modal-status');
    if (m.stock <= 0) {
        statusEl.innerText = "สินค้าหมดคลัง";
        statusEl.className = "text-xs font-black uppercase px-3 py-1 rounded-full bg-red-100 text-red-600";
    } else if (m.daysToExpiry <= 30) {
        statusEl.innerText = "วิกฤต/ใกล้หมดอายุ";
        statusEl.className = "text-xs font-black uppercase px-3 py-1 rounded-full bg-red-600 text-white";
    } else if (m.daysToExpiry <= 180) {
        statusEl.innerText = "ใกล้หมดอายุ (180ว.)";
        statusEl.className = "text-xs font-black uppercase px-3 py-1 rounded-full bg-purple-100 text-purple-600";
    } else if (m.stock < m.minStock) {
        statusEl.innerText = "ควรเติมสินค้า";
        statusEl.className = "text-xs font-black uppercase px-3 py-1 rounded-full bg-orange-100 text-orange-600";
    } else {
        statusEl.innerText = "ปกติ";
        statusEl.className = "text-xs font-black uppercase px-3 py-1 rounded-full bg-emerald-100 text-emerald-600";
    }
    modal.classList.remove('hidden');
};

window.closeMedModal = () => document.getElementById('med-modal')?.classList.add('hidden');

// --- 4. Data Fetching ---
async function fetchData() {
    try {
        const res = await fetch(`${SHEET_URL}?action=dashboard_data&t=${Date.now()}`);
        const data = await res.json();
        
        const inventoryData = data.inventory || [];
        window.sheetMeds = inventoryData.map(item => {
            const raw = Object.values(item);
            return {
                name: String(getVal(item, ["ชื่อสินค้า", "รายการ"]) || raw[0] || "ไม่ระบุชื่อ").trim(),
                normName: normalizeName(getVal(item, ["ชื่อสินค้า", "รายการ"]) || raw[0]),
                stock: parseStockValue(getVal(item, ["จำนวนสินค้าคงเหลือ", "คงเหลือ"])),
                minStock: parseStockValue(getVal(item, ["จำนวนขั้นต่ำ", "จุดสั่งซื้อ"])),
                category: String(getVal(item, ["กลุ่มสินค้า", "ประเภท"]) || "ทั่วไป").trim(),
                lot: String(getVal(item, ["Lot No.", "Lot"]) || "-").trim(),
                unit: String(getVal(item, ["หน่วยนับ"]) || "หน่วย")
            };
        }).filter(m => m.name !== "ไม่ระบุชื่อ");

        const expirySource = data.expiring || [];
        window.expiringMeds = expirySource.map(item => ({
            normName: normalizeName(getVal(item, ["ชื่อสินค้า"])),
            daysToExpiry: parseStockValue(getVal(item, ["กี่วันถึงหมดอายุ", "days"]))
        }));

        if (data.withdrawals) {
            window.sheetWithdrawals = data.withdrawals.map(item => ({
                name: String(getVal(item, ["ชื่อสินค้า"]) || "ไม่ระบุชื่อ").trim(),
                normName: normalizeName(getVal(item, ["ชื่อสินค้า"])),
                qty: parseStockValue(getVal(item, ["จำนวนที่เบิก", "จำนวน"])),
                unit: getVal(item, ["หน่วย"]) || "หน่วย",
                timestamp: getVal(item, ["วันที่"]) || ""
            }));
        }
        window.render();
    } catch (e) { console.error("Fetch Error:", e); }
}

onValue(ref(db, 'meds'), (snap) => {
    const data = snap.val();
    window.firebaseMeds = data ? Object.keys(data).map(k => ({ 
        ...data[k], 
        id: k, 
        normName: normalizeName(data[k].name),
        stock: parseStockValue(data[k].stock),
        minStock: parseStockValue(data[k].minStock)
    })) : [];
    window.render();
});

// --- 5. Render Logic ---
window.render = () => {
    const q = (document.getElementById('search')?.value || "").toLowerCase();
    
    const allInv = [...window.sheetMeds, ...window.firebaseMeds].map(item => {
        const expData = window.expiringMeds.find(e => e.normName === item.normName);
        return expData ? { ...item, daysToExpiry: expData.daysToExpiry } : item;
    });
    
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const lastWithdrawMap = window.sheetWithdrawals.reduce((acc, curr) => {
        const d = window.parseDate(curr.timestamp);
        if (d && (!acc[curr.normName] || d > acc[curr.normName])) acc[curr.normName] = d;
        return acc;
    }, {});

    const stats = allInv.reduce((acc, item) => {
        if (item.stock > 0 && item.stock < item.minStock) acc.near_exp++;
        if (item.stock <= 0) acc.out++;
        if (item.daysToExpiry !== undefined && item.daysToExpiry <= 180) acc.expired++;
        const lastDate = lastWithdrawMap[item.normName];
        if (item.stock > 0 && (!lastDate || lastDate < sixMonthsAgo)) acc.dead++;
        return acc;
    }, { near_exp: 0, out: 0, expired: 0, dead: 0 });

    const update = (id, val) => { 
        const el = document.getElementById(id);
        if(el) el.innerText = val.toLocaleString(); 
    };
    
    // อัปเดตตัวเลขทุกจุด (รวม Mobile Header)
    ['stat-total', 'stat-total-db'].forEach(id => update(id, allInv.length));
    ['stat-low', 'stat-low-db'].forEach(id => update(id, stats.near_exp));
    ['stat-out', 'stat-out-db', 'stat-out-db-mobile'].forEach(id => update(id, stats.out));
    ['stat-exp', 'stat-exp-db', 'stat-exp-db-mobile'].forEach(id => update(id, stats.expired));
    ['stat-dead', 'stat-dead-db'].forEach(id => update(id, stats.dead));

    let filtered = allInv.filter(m => m.name.toLowerCase().includes(q) || m.lot.toLowerCase().includes(q));
    
    if (window.currentFilter === 'low') {
        filtered = filtered.filter(i => i.stock > 0 && i.stock < i.minStock);
    } else if (window.currentFilter === 'out') {
        filtered = filtered.filter(i => i.stock <= 0);
    } else if (window.currentFilter === 'exp') {
        filtered = filtered.filter(i => i.daysToExpiry !== undefined && i.daysToExpiry <= 180);
    } else if (window.currentFilter === 'dead') {
        filtered = filtered.filter(i => {
            const last = lastWithdrawMap[i.normName];
            return i.stock > 0 && (!last || last < sixMonthsAgo);
        });
    }

    renderTable(filtered, lastWithdrawMap, sixMonthsAgo);
    renderWithdrawSummary(allInv);
    renderRecentItems(allInv); // ฟังก์ชันเสริมสำหรับแสดงรายการล่าสุด
};

function renderTable(data, lastWithdrawMap, sixMonthsAgo) {
    const tbody = document.getElementById('table-in-body');
    if (!tbody) return;

    tbody.innerHTML = data.map(m => {
        const lastWithdraw = lastWithdrawMap[m.normName];
        const isDead = m.stock > 0 && (!lastWithdraw || lastWithdraw < sixMonthsAgo);
        const medJson = encodeURIComponent(JSON.stringify(m));
        
        let badgeClass = "bg-emerald-100 text-emerald-600";
        let statusText = "ปกติ";

        if (m.stock <= 0) { 
            badgeClass = "bg-red-100 text-red-600"; 
            statusText = "สินค้าหมด"; 
        } else if (m.daysToExpiry !== undefined && m.daysToExpiry <= 180) {
            badgeClass = "bg-purple-100 text-purple-600";
            statusText = "ใกล้หมดอายุ (180ว.)";
            if (m.daysToExpiry <= 30) {
                badgeClass = "bg-red-600 text-white";
                statusText = "วิกฤต/หมดอายุ";
            }
        } else if (m.stock < m.minStock) { 
            badgeClass = "bg-orange-100 text-orange-600"; 
            statusText = "ควรเติมสินค้า"; 
        } else if (isDead) { 
            badgeClass = "bg-slate-200 text-slate-600"; 
            statusText = "Dead Stock"; 
        }

        return `
        <tr onclick="showMedDetail('${medJson}')" class="border-b border-slate-50 hover:bg-slate-100 cursor-pointer transition-colors">
            <td class="px-6 py-4">
                <div class="font-bold text-slate-800">${m.name}</div>
                <div class="text-[10px] text-purple-600 font-black">หมวดหมู่: ${m.category}</div>
            </td>
            <td class="px-6 py-4 text-center">
                <div class="text-lg font-black ${m.stock <= 0 ? 'text-red-500' : (m.stock < m.minStock ? 'text-orange-500' : 'text-slate-700')}">
                    ${m.stock.toLocaleString()}
                </div>
                <div class="text-[9px] text-slate-400 font-bold uppercase">Min: ${m.minStock.toLocaleString()}</div>
            </td>
            <td class="px-6 py-4 font-bold text-slate-600 text-center">
                ${m.daysToExpiry !== undefined ? `<span class="${m.daysToExpiry <= 180 ? 'text-red-500' : 'text-slate-600'}">${m.daysToExpiry} วัน</span>` : '-'}
            </td>
            <td class="px-6 py-4 text-right">
                <span class="px-3 py-1 rounded-full text-[10px] font-bold ${badgeClass}">
                    ${statusText}
                </span>
            </td>
        </tr>`;
    }).join('');
}

function renderWithdrawSummary(allInventory) {
    const withdrawBody = document.getElementById('withdraw-table-body');
    if (!withdrawBody) return;

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const summary = (window.sheetWithdrawals || []).reduce((acc, curr) => {
        const d = window.parseDate(curr.timestamp);
        if (d && d >= threeMonthsAgo) {
            if (!acc[curr.normName]) acc[curr.normName] = { name: curr.name, total: 0, unit: curr.unit };
            acc[curr.normName].total += curr.qty;
        }
        return acc;
    }, {});
    
    const sorted = Object.values(summary).sort((a, b) => b.total - a.total).slice(0, 5);

    withdrawBody.innerHTML = sorted.map(w => {
        const invItem = allInventory.find(i => i.normName === normalizeName(w.name));
        const currentStock = invItem ? invItem.stock : 0;
        return `
        <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div>
                <div class="font-bold text-slate-800 text-sm">${w.name}</div>
                <div class="text-[10px] text-orange-600 font-black">เบิกสะสม: ${w.total.toLocaleString()} ${w.unit}</div>
            </div>
            <div class="text-right">
                <div class="text-xs text-slate-400 font-bold">คงเหลือ</div>
                <div class="font-black ${currentStock <= 0 ? 'text-red-500' : 'text-slate-700'}">${currentStock.toLocaleString()}</div>
            </div>
        </div>`;
    }).join('');
}

function renderRecentItems() {
    const recentBody = document.getElementById('recent-table-body');
    if (!recentBody) return;
    
    const recent = (window.sheetWithdrawals || []).slice(0, 5);
    recentBody.innerHTML = recent.map(r => `
        <div class="flex items-center gap-4 p-3 hover:bg-slate-50 rounded-xl transition-all">
            <div class="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
                ${r.qty}
            </div>
            <div class="min-w-0">
                <div class="text-sm font-bold text-slate-800 truncate">${r.name}</div>
                <div class="text-[10px] text-slate-400">${r.timestamp}</div>
            </div>
        </div>
    `).join('');
}

// Start
fetchData();
setInterval(fetchData, 60000);