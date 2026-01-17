// Firebase設定
const firebaseConfig = {
    apiKey: "AIzaSyBBNxYD46f-HPoeHo0JlBqIDiZs8_E7l_k",
    authDomain: "shift-app-956a0.firebaseapp.com",
    databaseURL: "https://shift-app-956a0-default-rtdb.firebaseio.com",
    projectId: "shift-app-956a0",
    storageBucket: "shift-app-956a0.firebasestorage.app",
    messagingSenderId: "81668991091",
    appId: "1:81668991091:web:ccac553daf21cd3e15e206",
    measurementId: "G-002NDWGWGL"
};

// Firebase初期化
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 設定
let CONFIG = { ADMIN_PIN: '1234' };

// Firebaseから暗証番号を読み込み
database.ref('settings/adminPin').once('value', snap => {
    if (snap.val()) CONFIG.ADMIN_PIN = snap.val();
});

// 状態管理
const state = {
    currentWeekStart: getWeekStart(new Date()),
    shifts: [],
    fixedShifts: [],
    changeRequests: [],
    leaveRequests: [],
    employees: [],
    messages: [],
    swapRequests: [],
    selectedColor: '#6366f1',
    isAdmin: false,
    activeAdminTab: 'shiftChanges',
    editingShiftId: null,
    isConnected: false,
    zoomLevel: 100,
    currentPopoverShift: null
};

// 接続状態の監視
database.ref('.info/connected').on('value', (snap) => {
    const statusEl = document.getElementById('connectionStatus');
    const textEl = statusEl?.querySelector('.status-text');
    if (snap.val() === true) {
        state.isConnected = true;
        statusEl?.classList.remove('disconnected');
        statusEl?.classList.add('connected');
        if (textEl) textEl.textContent = '接続中';
    } else {
        state.isConnected = false;
        statusEl?.classList.remove('connected');
        statusEl?.classList.add('disconnected');
        if (textEl) textEl.textContent = 'オフライン';
    }
});

// ユーティリティ関数
function getWeekStart(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    return d;
}
function formatDate(date) { return new Date(date).toISOString().split('T')[0]; }
function formatDateTime(str) {
    const d = new Date(str);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function getDayName(i) { return ['日', '月', '火', '水', '木', '金', '土'][i]; }
function getMonthDay(date) {
    const d = new Date(date);
    return { month: d.getMonth() + 1, day: d.getDate(), dayOfWeek: d.getDay() };
}
function getDayOfWeek(str) { return new Date(str).getDay(); }

// 時刻をフォーマットするヘルパー関数（30分単位対応）
function formatTime(val) {
    const hours = Math.floor(val);
    const mins = Math.round((val - hours) * 60);
    return `${hours}:${mins.toString().padStart(2, '0')}`;
}

// 日付選択時に曜日を表示
function updateShiftDateDay() {
    const dateInput = document.getElementById('shiftDate');
    const dayDisplay = document.getElementById('shiftDateDay');
    if (dateInput.value) {
        const dow = getDayOfWeek(dateInput.value);
        const dayNames = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
        dayDisplay.textContent = dayNames[dow];
        dayDisplay.style.color = dow === 0 ? '#ef4444' : dow === 6 ? '#3b82f6' : 'inherit';
    } else {
        dayDisplay.textContent = '';
    }
}

// Firebase からデータを読み込み
function loadData() {
    const refs = ['shifts', 'fixedShifts', 'changeRequests', 'leaveRequests', 'employees', 'messages', 'swapRequests'];
    refs.forEach(key => {
        database.ref(key).on('value', snap => {
            const data = snap.val();
            state[key] = data ? Object.values(data) : [];
            if (key === 'employees') updateEmployeeSelects();
            render();
            if (state.isAdmin) renderAdminPanel();
            updateMessageBar();
        });
    });
}

// Firebase にデータを保存
function saveToFirebase(key, data) {
    const ref = database.ref(key);
    ref.set(data.reduce((acc, item) => { acc[item.id] = item; return acc; }, {}));
}

// 従業員セレクト更新
function updateEmployeeSelects() {
    ['shiftName', 'leaveName', 'swapTargetEmployee', 'changeApplicant', 'swapApplicant'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">選択してください</option>';
        state.employees.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.name;
            opt.textContent = e.name;
            sel.appendChild(opt);
        });
    });
}

// 担当者色マップ
function getNameColors() {
    const map = {};
    [...state.shifts, ...state.fixedShifts].forEach(s => { if (!map[s.name]) map[s.name] = s.color; });
    return map;
}

// 時間ヘッダー
function renderTimeHeader() {
    const h = document.getElementById('timeHeader');
    h.innerHTML = '';
    for (let i = 0; i < 24; i++) {
        const c = document.createElement('div');
        c.className = 'time-cell';
        c.textContent = `${i}時`;
        h.appendChild(c);
    }
}

// シフトレベル計算
function calculateShiftLevels(shifts) {
    const levels = {};
    const sorted = [...shifts].sort((a, b) => a.startHour - b.startHour);
    sorted.forEach(s => {
        let lvl = 0;
        for (const o of sorted) {
            if (o.id === s.id || levels[o.id] === undefined) continue;
            if (!(s.endHour <= o.startHour || s.startHour >= o.endHour) && levels[o.id] >= lvl) lvl = levels[o.id] + 1;
        }
        levels[s.id] = lvl;
    });
    return levels;
}

// ガントチャート
function renderGanttBody() {
    const body = document.getElementById('ganttBody');
    body.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const date = new Date(state.currentWeekStart);
        date.setDate(date.getDate() + i);
        const dateStr = formatDate(date);
        const { day, dayOfWeek } = getMonthDay(date);

        const row = document.createElement('div');
        row.className = 'gantt-row';

        let dayClass = 'date-day';
        if (dayOfWeek === 0) dayClass += ' sunday';
        if (dayOfWeek === 6) dayClass += ' saturday';

        const label = document.createElement('div');
        label.className = 'gantt-date-label';
        label.innerHTML = `<span class="date-number">${day}</span><span class="${dayClass}">${getDayName(dayOfWeek)}</span>`;
        row.appendChild(label);

        const timeline = document.createElement('div');
        timeline.className = 'gantt-timeline';
        for (let h = 0; h < 24; h++) {
            const cell = document.createElement('div');
            cell.className = 'hour-cell';
            timeline.appendChild(cell);
        }

        // シフト収集
        const dayShifts = state.shifts.filter(s => s.date === dateStr);
        const prevDate = new Date(date); prevDate.setDate(prevDate.getDate() - 1);
        const prevStr = formatDate(prevDate);
        const overnight = state.shifts.filter(s => s.date === prevStr && s.overnight).map(s => ({
            ...s, id: `on-${s.id}`, date: dateStr, startHour: 0, endHour: s.endHour, isOvernightContinuation: true
        }));
        const fixed = state.fixedShifts.filter(f => f.dayOfWeek === dayOfWeek).map(f => ({
            ...f, id: `fx-${f.id}-${dateStr}`, date: dateStr, isFixed: true
        }));
        const prevDow = (dayOfWeek + 6) % 7;
        const fixedOvernight = state.fixedShifts.filter(f => f.dayOfWeek === prevDow && f.overnight).map(f => ({
            ...f, id: `fxo-${f.id}-${dateStr}`, date: dateStr, startHour: 0, endHour: f.endHour, isFixed: true, isOvernightContinuation: true
        }));

        const all = [...dayShifts, ...overnight, ...fixed, ...fixedOvernight];
        const levels = calculateShiftLevels(all);
        const maxLvl = Math.max(0, ...Object.values(levels));
        const baseH = 80, perLvl = 28;
        timeline.style.minHeight = `${baseH + maxLvl * perLvl}px`;

        all.forEach(s => timeline.appendChild(createShiftBar(s, levels[s.id])));

        // 有給
        const leaves = state.leaveRequests.filter(l => l.status === 'approved' && dateStr >= l.startDate && dateStr <= l.endDate);
        leaves.forEach((l, idx) => {
            const bar = document.createElement('div');
            bar.className = 'leave-bar';
            bar.style.top = `${baseH + (maxLvl + 1 + idx) * perLvl}px`;
            bar.style.height = `${perLvl - 4}px`;
            bar.textContent = `🏖️ ${l.name} 有給`;
            timeline.appendChild(bar);
            timeline.style.minHeight = `${baseH + (maxLvl + 2 + idx) * perLvl}px`;
        });

        row.appendChild(timeline);
        body.appendChild(row);
    }
}

// セルの実際の幅を取得する関数
function getCellWidth() {
    const hourCell = document.querySelector('.hour-cell');
    if (hourCell) {
        return hourCell.getBoundingClientRect().width;
    }
    // デフォルト値（フォールバック）
    return window.innerWidth <= 768 ? 38 : 50;
}

// タッチイベントかどうかを判定
let touchMoved = false;

// シフトバー作成（パーセントベースで位置計算）
function createShiftBar(s, lvl) {
    const bar = document.createElement('div');
    let cls = 'shift-bar';
    if (s.isFixed) cls += ' fixed';
    if (s.overnight && !s.isOvernightContinuation) cls += ' overnight';
    bar.className = cls;
    bar.dataset.id = s.id;

    // パーセントベースで位置を計算（24時間 = 100%）
    let start = s.startHour, end = s.endHour;
    if (s.overnight && !s.isOvernightContinuation) end = 24;

    const leftPercent = (start / 24) * 100;
    const widthPercent = ((end - start) / 24) * 100;

    bar.style.left = `${leftPercent}%`;
    bar.style.width = `${widthPercent}%`;
    bar.style.top = `${8 + lvl * 28}px`;
    bar.style.height = '24px';
    bar.style.background = `linear-gradient(135deg, ${s.color}, ${adjustColor(s.color, -20)})`;

    let icons = '';
    if (s.changeHistory) icons += '<span class="change-icon" title="シフト変更あり">📝</span>';
    if (s.swapHistory) icons += '<span class="swap-icon" title="シフト交代あり">🤝</span>';
    if (s.isFixed) icons += '<span class="fixed-icon">🔁</span>';
    if (s.overnight && !s.isOvernightContinuation) icons += '<span class="overnight-icon">🌙</span>';
    if (s.isOvernightContinuation) icons += '<span class="overnight-icon">→</span>';

    let time = s.overnight && !s.isOvernightContinuation ? `${formatTime(s.startHour)}-翌${formatTime(s.endHour)}` :
        s.isOvernightContinuation ? `〜${formatTime(s.endHour)}` : `${formatTime(s.startHour)}-${formatTime(s.endHour)}`;

    // 変更履歴がある場合はツールチップに表示
    if (s.changeHistory) {
        const h = s.changeHistory;
        bar.title = `変更前: ${h.previousDate} ${formatTime(h.previousStartHour)}-${formatTime(h.previousEndHour)}\n理由: ${h.reason}`;
        bar.classList.add('changed');
    }

    // 交代履歴がある場合はツールチップに表示
    if (s.swapHistory) {
        const h = s.swapHistory;
        bar.title = `交代前: ${h.previousName} → 交代後: ${h.newName}`;
        bar.classList.add('swapped');
    }

    bar.innerHTML = `${icons}<span class="shift-name">${s.name}</span><span class="shift-time">${time}</span><button class="delete-btn">×</button>`;

    // タッチ位置を保存するための変数
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    // クリックイベント（デスクトップ用）
    bar.addEventListener('click', e => {
        if (e.target.classList.contains('delete-btn')) return;
        // ポップオーバーを表示
        showShiftPopover(s, e, bar);
    });

    // タッチイベント（モバイル用）
    bar.addEventListener('touchstart', (e) => {
        touchMoved = false;
        touchStartTime = Date.now();
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }
        // イベントの伝播を停止してピンチズームとの競合を防ぐ
        e.stopPropagation();
    }, { passive: true });

    bar.addEventListener('touchmove', (e) => {
        // 少しでも動いたらスクロールとみなす
        if (e.touches.length === 1) {
            const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
            const deltaY = Math.abs(e.touches[0].clientY - touchStartY);
            if (deltaX > 10 || deltaY > 10) {
                touchMoved = true;
            }
        }
    }, { passive: true });

    bar.addEventListener('touchend', (e) => {
        // タップ判定：動きが少なく、短い時間
        const touchDuration = Date.now() - touchStartTime;
        if (touchMoved || touchDuration > 500) return;

        // 削除ボタンのタップは除外
        const touch = e.changedTouches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        if (element && element.classList.contains('delete-btn')) return;

        e.preventDefault();
        e.stopPropagation();

        // ポップオーバーを表示（タッチ位置を使用）
        showShiftPopover(s, {
            clientX: touchStartX,
            clientY: touchStartY,
            target: bar
        }, bar);
    }, { passive: false });

    // 削除ボタン
    const deleteBtn = bar.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (s.isFixed) deleteFixedShift(s.id.split('-')[1]);
        else if (!s.isOvernightContinuation) deleteShift(s.id);
    });

    // 削除ボタンのタッチイベント
    deleteBtn.addEventListener('touchend', e => {
        e.stopPropagation();
        e.preventDefault();
        if (s.isFixed) deleteFixedShift(s.id.split('-')[1]);
        else if (!s.isOvernightContinuation) deleteShift(s.id);
    }, { passive: false });

    return bar;
}

// シフト詳細ポップオーバーを表示
function showShiftPopover(s, event, barElement = null) {
    const popover = document.getElementById('shiftPopover');

    // シフト情報を取得（固定シフトや夜勤継続の場合は元のシフトを取得）
    let displayShift = s;
    if (s.isFixed) {
        const parts = s.id.split('-');
        const originalId = parts[1];
        const original = state.fixedShifts.find(f => f.id === originalId);
        if (original) {
            displayShift = { ...original, date: s.date, isFixed: true };
        }
    } else if (s.isOvernightContinuation && s.id.startsWith('on-')) {
        const originalId = s.id.replace('on-', '');
        const original = state.shifts.find(x => x.id === originalId);
        if (original) {
            displayShift = original;
        }
    }

    state.currentPopoverShift = s;

    // ポップオーバーの内容を更新
    document.getElementById('popoverName').textContent = displayShift.name;

    // 日付表示
    const dateObj = new Date(displayShift.date || s.date);
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dateStr = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日（${dayNames[dateObj.getDay()]}）`;
    document.getElementById('popoverDate').textContent = dateStr;

    // 時間表示
    let timeStr;
    if (displayShift.overnight && !s.isOvernightContinuation) {
        timeStr = `${formatTime(displayShift.startHour)} 〜 翌${formatTime(displayShift.endHour)}`;
    } else if (s.isOvernightContinuation) {
        timeStr = `0:00 〜 ${formatTime(displayShift.endHour)}（前日からの継続）`;
    } else {
        timeStr = `${formatTime(displayShift.startHour)} 〜 ${formatTime(displayShift.endHour)}`;
    }
    document.getElementById('popoverTime').textContent = timeStr;

    // タイプ表示
    document.getElementById('popoverOvernightRow').style.display =
        (displayShift.overnight && !s.isOvernightContinuation) ? 'flex' : 'none';
    document.getElementById('popoverFixedRow').style.display = s.isFixed ? 'flex' : 'none';

    // 変更履歴表示
    if (displayShift.changeHistory) {
        document.getElementById('popoverChangeRow').style.display = 'flex';
        const h = displayShift.changeHistory;
        document.getElementById('popoverChangeInfo').textContent =
            `${h.previousDate} ${formatTime(h.previousStartHour)}-${formatTime(h.previousEndHour)}から変更`;
    } else {
        document.getElementById('popoverChangeRow').style.display = 'none';
    }

    // 交代履歴表示
    if (displayShift.swapHistory) {
        document.getElementById('popoverSwapRow').style.display = 'flex';
        const h = displayShift.swapHistory;
        document.getElementById('popoverSwapInfo').textContent = `${h.previousName} → ${h.newName}`;
    } else {
        document.getElementById('popoverSwapRow').style.display = 'none';
    }

    // ポップオーバーの位置を計算
    // バー要素を取得（直接渡されたか、イベントから取得）
    let bar = barElement;
    if (!bar && event && event.target) {
        bar = event.target.closest ? event.target.closest('.shift-bar') : event.target;
    }

    const popoverWidth = 300;
    const popoverHeight = 280;
    let left, top;

    if (bar && bar.getBoundingClientRect) {
        const rect = bar.getBoundingClientRect();
        left = rect.left + (rect.width / 2) - (popoverWidth / 2);
        top = rect.bottom + 10;

        // 画面からはみ出さないように調整
        if (top + popoverHeight > window.innerHeight - 10) {
            top = rect.top - popoverHeight - 10;
        }
    } else if (event && (event.clientX !== undefined)) {
        // タッチイベントの場合、タッチ位置を基準に配置
        left = event.clientX - (popoverWidth / 2);
        top = event.clientY + 20;
    } else {
        // フォールバック：画面中央
        left = (window.innerWidth - popoverWidth) / 2;
        top = (window.innerHeight - popoverHeight) / 2;
    }

    // 左右のはみ出し調整
    if (left < 10) left = 10;
    if (left + popoverWidth > window.innerWidth - 10) {
        left = window.innerWidth - popoverWidth - 10;
    }

    // 上下のはみ出し調整
    if (top < 10) top = 10;
    if (top + popoverHeight > window.innerHeight - 10) {
        top = window.innerHeight - popoverHeight - 10;
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.classList.add('active');
}

// ポップオーバーを閉じる
function closeShiftPopover() {
    const popover = document.getElementById('shiftPopover');
    popover.classList.remove('active');
    state.currentPopoverShift = null;
}

// 変更履歴モーダル表示
function showChangeHistoryModal(s) {
    const h = s.changeHistory;
    const result = confirm(
        `📝 シフト変更履歴\n\n` +
        `【変更前】\n日付: ${h.previousDate}\n時間: ${h.previousStartHour}:00〜${h.previousEndHour}:00\n\n` +
        `【変更後（現在）】\n日付: ${s.date}\n時間: ${s.startHour}:00〜${s.endHour}:00\n\n` +
        `理由: ${h.reason}\n\n` +
        `「OK」で編集画面を開きます`
    );
    if (result) openEditShiftModal(s);
}

// 交代履歴モーダル表示
function showSwapHistoryModal(s) {
    const h = s.swapHistory;
    const result = confirm(
        `🤝 シフト交代履歴\n\n` +
        `【交代前】\n担当者: ${h.previousName}\n\n` +
        `【交代後（現在）】\n担当者: ${h.newName}\n\n` +
        `メッセージ: ${h.message || 'なし'}\n\n` +
        `「OK」で編集画面を開きます`
    );
    if (result) openEditShiftModal(s);
}

function adjustColor(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, (n >> 16) + amt));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 0xFF) + amt));
    const b = Math.min(255, Math.max(0, (n & 0xFF) + amt));
    return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}

// 凡例
function renderLegend() {
    const el = document.getElementById('legendItems');
    const colors = getNameColors();
    if (!Object.keys(colors).length) { el.innerHTML = '<span style="color:var(--text-muted)">シフトを追加すると担当者が表示されます</span>'; return; }
    el.innerHTML = '';
    Object.entries(colors).forEach(([n, c]) => {
        const d = document.createElement('div');
        d.className = 'legend-item';
        d.innerHTML = `<span class="legend-color" style="background:${c}"></span><span>${n}</span>`;
        el.appendChild(d);
    });
}

// 期間表示
function updatePeriodDisplay() {
    const el = document.getElementById('currentPeriod');
    const s = new Date(state.currentWeekStart), e = new Date(s);
    e.setDate(e.getDate() + 6);
    const sm = s.getMonth() + 1, sd = s.getDate(), em = e.getMonth() + 1, ed = e.getDate();
    el.textContent = sm === em ? `${s.getFullYear()}年${sm}月${sd}日 〜 ${ed}日` : `${s.getFullYear()}年${sm}月${sd}日 〜 ${em}月${ed}日`;
}

// メッセージバー
function updateMessageBar() {
    const cnt = state.messages.filter(m => !m.read).length + state.swapRequests.filter(r => r.status === 'pending').length;
    const bar = document.getElementById('messageBar'), num = document.getElementById('messageCount');
    if (cnt > 0) { bar.style.display = 'flex'; num.textContent = cnt; }
    else bar.style.display = 'none';
}

// CRUD操作
function addShift(d) { const s = { id: Date.now().toString(), ...d }; state.shifts.push(s); saveToFirebase('shifts', state.shifts); }
function updateShift(id, d) { const i = state.shifts.findIndex(s => s.id === id); if (i >= 0) { state.shifts[i] = { ...state.shifts[i], ...d }; saveToFirebase('shifts', state.shifts); } }
function addFixedShift(d) { const s = { id: Date.now().toString(), dayOfWeek: getDayOfWeek(d.date), ...d }; delete s.date; state.fixedShifts.push(s); saveToFirebase('fixedShifts', state.fixedShifts); }
function deleteShift(id) { state.shifts = state.shifts.filter(s => s.id !== id); saveToFirebase('shifts', state.shifts); }
function deleteFixedShift(id) { state.fixedShifts = state.fixedShifts.filter(s => s.id !== id); saveToFirebase('fixedShifts', state.fixedShifts); }
function updateFixedShift(id, d) {
    const i = state.fixedShifts.findIndex(s => s.id === id);
    if (i >= 0) {
        const updated = { ...state.fixedShifts[i], ...d, dayOfWeek: getDayOfWeek(d.date) };
        delete updated.date;
        state.fixedShifts[i] = updated;
        saveToFirebase('fixedShifts', state.fixedShifts);
    }
}
function addChangeRequest(d) {
    const r = { id: Date.now().toString(), status: 'pending', createdAt: new Date().toISOString(), ...d };
    state.changeRequests.push(r);
    saveToFirebase('changeRequests', state.changeRequests);

    // シフトの持ち主と管理者にメッセージを送信
    const shift = state.shifts.find(s => s.id === d.originalShiftId);
    if (shift) {
        const title = '🔄 シフト変更申請';
        const content = `${d.applicant}さんからシフト変更申請がありました。\nシフト: ${shift.date} ${shift.startHour}:00-${shift.endHour}:00\n変更後: ${d.newDate} ${d.newStartHour}:00-${d.newEndHour}:00\n理由: ${d.reason}`;

        // シフトの持ち主に通知（申請者と異なる場合）
        if (shift.name !== d.applicant) {
            state.messages.push({ id: Date.now().toString() + '_owner', to: shift.name, from: d.applicant, title, content, createdAt: new Date().toISOString(), read: false });
        }

        // 管理者に通知
        state.messages.push({ id: Date.now().toString() + '_admin', to: '管理者', from: d.applicant, title, content, createdAt: new Date().toISOString(), read: false });

        saveToFirebase('messages', state.messages);
    }
}
function addLeaveRequest(d) { const r = { id: Date.now().toString(), status: 'pending', createdAt: new Date().toISOString(), ...d }; state.leaveRequests.push(r); saveToFirebase('leaveRequests', state.leaveRequests); }
function addSwapRequest(d) {
    const r = { id: Date.now().toString(), status: 'pending', createdAt: new Date().toISOString(), ...d };
    state.swapRequests.push(r);
    saveToFirebase('swapRequests', state.swapRequests);

    // 交代相手と管理者にメッセージを送信
    const shift = state.shifts.find(s => s.id === d.shiftId);
    if (shift) {
        const title = '🤝 シフト交代依頼';
        const content = `${d.applicant}さんからシフト交代依頼がありました。\nシフト: ${shift.date} ${shift.startHour}:00-${shift.endHour}:00\n現在の担当: ${shift.name}\n交代先: ${d.targetEmployee}\nメッセージ: ${d.message}`;

        // 交代相手に通知
        state.messages.push({ id: Date.now().toString() + '_target', to: d.targetEmployee, from: d.applicant, title, content, createdAt: new Date().toISOString(), read: false });

        // 管理者に通知
        state.messages.push({ id: Date.now().toString() + '_admin', to: '管理者', from: d.applicant, title, content, createdAt: new Date().toISOString(), read: false });

        saveToFirebase('messages', state.messages);
    }
}
function addEmployee(d) { const e = { id: Date.now().toString(), ...d }; state.employees.push(e); saveToFirebase('employees', state.employees); }
function deleteEmployee(id) { state.employees = state.employees.filter(e => e.id !== id); saveToFirebase('employees', state.employees); }
function sendBroadcast(title, content) {
    state.employees.forEach(e => {
        state.messages.push({ id: Date.now().toString() + e.id, to: e.name, from: '管理者', title, content, createdAt: new Date().toISOString(), read: false });
    });
    saveToFirebase('messages', state.messages);
}

// 承認・却下
function approveRequest(type, id) {
    if (type === 'change') {
        const r = state.changeRequests.find(x => x.id === id);
        if (r) {
            r.status = 'approved';
            const s = state.shifts.find(x => x.id === r.originalShiftId);
            if (s) {
                // 変更前の情報を保存
                s.changeHistory = {
                    previousDate: s.date,
                    previousStartHour: s.startHour,
                    previousEndHour: s.endHour,
                    changedAt: new Date().toISOString(),
                    reason: r.reason
                };
                // 新しい情報に更新
                s.date = r.newDate;
                s.startHour = r.newStartHour;
                s.endHour = r.newEndHour;
            }
            saveToFirebase('shifts', state.shifts);
            saveToFirebase('changeRequests', state.changeRequests);
        }
    } else if (type === 'leave') {
        const r = state.leaveRequests.find(x => x.id === id);
        if (r) { r.status = 'approved'; saveToFirebase('leaveRequests', state.leaveRequests); }
    } else if (type === 'swap') {
        const r = state.swapRequests.find(x => x.id === id);
        if (r) {
            r.status = 'approved';
            const s = state.shifts.find(x => x.id === r.shiftId);
            if (s) {
                // 交代前の情報を保存
                s.swapHistory = {
                    previousName: s.name,
                    newName: r.targetEmployee,
                    swappedAt: new Date().toISOString(),
                    message: r.message
                };
                // 新しい担当者に更新
                s.name = r.targetEmployee;
            }
            saveToFirebase('shifts', state.shifts);
            saveToFirebase('swapRequests', state.swapRequests);
        }
    }
    render(); renderAdminPanel(); updateMessageBar();
}
function rejectRequest(type, id) {
    const arr = type === 'change' ? state.changeRequests : type === 'leave' ? state.leaveRequests : state.swapRequests;
    const r = arr.find(x => x.id === id);
    if (r) { r.status = 'rejected'; saveToFirebase(type === 'change' ? 'changeRequests' : type === 'leave' ? 'leaveRequests' : 'swapRequests', arr); }
    renderAdminPanel(); updateMessageBar();
}

// ナビ
function goToPrevWeek() { state.currentWeekStart.setDate(state.currentWeekStart.getDate() - 7); render(); }
function goToNextWeek() { state.currentWeekStart.setDate(state.currentWeekStart.getDate() + 7); render(); }

// 認証
function showPinModal() { document.getElementById('adminPin').value = ''; document.getElementById('pinError').style.display = 'none'; openModal(document.getElementById('pinModalOverlay')); }
function verifyPin(p) { return p === CONFIG.ADMIN_PIN; }
function switchToAdmin() { state.isAdmin = true; document.getElementById('roleToggle').classList.add('admin'); document.getElementById('roleText').textContent = '管理者'; document.querySelector('.role-icon').textContent = '👑'; document.getElementById('adminPanel').style.display = 'block'; renderAdminPanel(); }
function switchToStaff() { state.isAdmin = false; document.getElementById('roleToggle').classList.remove('admin'); document.getElementById('roleText').textContent = 'スタッフ'; document.querySelector('.role-icon').textContent = '👤'; document.getElementById('adminPanel').style.display = 'none'; }
function toggleRole() { state.isAdmin ? switchToStaff() : showPinModal(); }

// 管理者タブの通知バッジ更新
function updateAdminBadges() {
    const changeCount = state.changeRequests.filter(r => r.status === 'pending').length;
    const swapCount = state.swapRequests.filter(r => r.status === 'pending').length;
    const leaveCount = state.leaveRequests.filter(r => r.status === 'pending').length;

    document.querySelectorAll('.admin-tab').forEach(tab => {
        // 既存のバッジを削除
        const existingBadge = tab.querySelector('.tab-badge');
        if (existingBadge) existingBadge.remove();

        let count = 0;
        if (tab.dataset.tab === 'shiftChanges') count = changeCount;
        else if (tab.dataset.tab === 'shiftSwaps') count = swapCount;
        else if (tab.dataset.tab === 'leaveRequests') count = leaveCount;

        if (count > 0) {
            const badge = document.createElement('span');
            badge.className = 'tab-badge';
            badge.textContent = count;
            tab.appendChild(badge);
        }
    });
}

// 管理者パネル
function renderAdminPanel() {
    updateAdminBadges();
    const c = document.getElementById('adminContent');
    c.innerHTML = '';
    if (state.activeAdminTab === 'shiftChanges') {
        const reqs = state.changeRequests.filter(r => r.status === 'pending');
        if (!reqs.length) { c.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">承認待ちなし</p>'; return; }
        reqs.forEach(r => {
            const s = state.shifts.find(x => x.id === r.originalShiftId);
            const card = document.createElement('div'); card.className = 'request-card';
            card.innerHTML = `<div class="request-info"><h4>🔄 シフト変更申請</h4><p>申請者: ${r.applicant || '不明'}</p><p>対象シフト: ${s?.name || '不明'} - ${s?.date || '?'} ${s?.startHour || '?'}:00-${s?.endHour || '?'}:00</p><p>変更後: ${r.newDate} ${r.newStartHour}:00-${r.newEndHour}:00</p><p>理由: ${r.reason}</p></div><div class="request-actions"><button class="btn btn-success btn-sm" onclick="approveRequest('change','${r.id}')">承認</button><button class="btn btn-danger btn-sm" onclick="rejectRequest('change','${r.id}')">却下</button></div>`;
            c.appendChild(card);
        });
    } else if (state.activeAdminTab === 'shiftSwaps') {
        const reqs = state.swapRequests.filter(r => r.status === 'pending');
        if (!reqs.length) { c.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">承認待ちなし</p>'; return; }
        reqs.forEach(r => {
            const s = state.shifts.find(x => x.id === r.shiftId);
            const card = document.createElement('div'); card.className = 'request-card';
            card.innerHTML = `<div class="request-info"><h4>🤝 シフト交換依頼</h4><p>申請者: ${r.applicant || '不明'}</p><p>シフト: ${s?.date || '?'} ${s?.startHour || '?'}:00-${s?.endHour || '?'}:00</p><p>現在の担当: ${r.fromEmployee} → 交代先: ${r.targetEmployee}</p><p>メッセージ: ${r.message}</p></div><div class="request-actions"><button class="btn btn-success btn-sm" onclick="approveRequest('swap','${r.id}')">承認</button><button class="btn btn-danger btn-sm" onclick="rejectRequest('swap','${r.id}')">却下</button></div>`;
            c.appendChild(card);
        });
    } else if (state.activeAdminTab === 'leaveRequests') {
        const reqs = state.leaveRequests.filter(r => r.status === 'pending');
        if (!reqs.length) { c.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">承認待ちなし</p>'; return; }
        reqs.forEach(r => {
            const card = document.createElement('div'); card.className = 'request-card';
            card.innerHTML = `<div class="request-info"><h4>${r.name} - 有給申請</h4><p>期間: ${r.startDate} 〜 ${r.endDate}</p><p>理由: ${r.reason}</p></div><div class="request-actions"><button class="btn btn-success btn-sm" onclick="approveRequest('leave','${r.id}')">承認</button><button class="btn btn-danger btn-sm" onclick="rejectRequest('leave','${r.id}')">却下</button></div>`;
            c.appendChild(card);
        });
    } else if (state.activeAdminTab === 'employees') {
        c.innerHTML = `<div style="margin-bottom:16px"><button class="btn btn-primary btn-sm" onclick="openModal(document.getElementById('employeeModalOverlay'))">+ 従業員追加</button></div><div class="employee-list" id="employeeList"></div>`;
        const list = document.getElementById('employeeList');
        const roleNames = { staff: 'スタッフ', shiftLeader: 'シフトリーダー', employee: '社員', manager: 'マネージャー', leader: 'リーダー' };
        const shiftNames = { day: '日勤', evening: '夕勤', night: '夜勤' };
        state.employees.forEach(e => {
            const card = document.createElement('div'); card.className = 'employee-card';
            const roleName = roleNames[e.role] || e.role;
            const shiftName = shiftNames[e.shiftTime] || '';
            card.innerHTML = `<div class="employee-info"><div class="employee-avatar">${e.name.charAt(0)}</div><div><div class="employee-name">${e.name}</div><div class="employee-role">${roleName}${shiftName ? ' / ' + shiftName : ''}</div></div></div><button class="btn btn-danger btn-sm" onclick="deleteEmployee('${e.id}')">削除</button>`;
            list.appendChild(card);
        });
    } else if (state.activeAdminTab === 'broadcast') {
        c.innerHTML = `<div style="text-align:center;padding:20px"><p style="margin-bottom:16px;color:var(--text-secondary)">全従業員にメッセージを送信</p><button class="btn btn-primary" onclick="openModal(document.getElementById('broadcastModalOverlay'))">📢 メッセージ作成</button></div>`;
    } else if (state.activeAdminTab === 'settings') {
        c.innerHTML = `<div style="text-align:center;padding:20px"><p style="margin-bottom:16px;color:var(--text-secondary)">管理者設定</p><button class="btn btn-primary" onclick="openModal(document.getElementById('changePinModalOverlay'))">🔑 暗証番号を変更</button></div>`;
    }
}

// メッセージ表示
function renderMessages() {
    const c = document.getElementById('messagesContent');
    const all = [...state.messages.map(m => ({ ...m, type: 'message' })), ...state.swapRequests.filter(r => r.status === 'pending').map(r => ({ ...r, type: 'swap' }))].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!all.length) { c.innerHTML = '<p style="color:var(--text-muted);text-align:center">メッセージなし</p>'; return; }
    c.innerHTML = '';
    all.forEach(m => {
        const card = document.createElement('div'); card.className = 'message-card' + (!m.read ? ' unread' : '');
        if (m.type === 'message') {
            card.innerHTML = `<div class="message-header"><span class="message-from">${m.from}</span><span class="message-date">${formatDateTime(m.createdAt)}</span></div><div class="message-content"><strong>${m.title}</strong><br>${m.content}</div>`;
            card.onclick = () => { m.read = true; saveToFirebase('messages', state.messages); updateMessageBar(); renderMessages(); };
        } else {
            const s = state.shifts.find(x => x.id === m.shiftId);
            card.innerHTML = `<div class="message-header"><span class="message-from">🤝 シフト交代依頼</span><span class="message-date">${formatDateTime(m.createdAt)}</span></div><div class="message-content"><strong>${m.fromEmployee}</strong>さんからの依頼<br>シフト: ${s?.date || '?'} ${s?.startHour || '?'}:00-${s?.endHour || '?'}:00<br>${m.message}</div><div class="message-actions"><button class="btn btn-success btn-sm" onclick="approveRequest('swap','${m.id}')">交代する</button><button class="btn btn-danger btn-sm" onclick="rejectRequest('swap','${m.id}')">お断り</button></div>`;
        }
        c.appendChild(card);
    });
}

function render() { renderTimeHeader(); renderGanttBody(); renderLegend(); updatePeriodDisplay(); updateMessageBar(); }

// モーダル操作
function openModal(o) { o.classList.add('active'); }
function closeModal(o) { o.classList.remove('active'); }

function openEditShiftModal(s) {
    // 固定シフトや夜勤継続の場合、元のシフトを取得
    let actualShift = s;
    let actualId = s.id;

    if (s.isFixed) {
        // 固定シフトの場合（IDが fx-123-date または fxo-123-date 形式）
        const parts = s.id.split('-');
        const originalId = parts[1];
        const original = state.fixedShifts.find(f => f.id === originalId);
        if (original) {
            actualShift = { ...original, date: s.date };
            actualId = originalId;
        }
    } else if (s.isOvernightContinuation && s.id.startsWith('on-')) {
        // 夜勤継続の場合（IDが on-123 形式）
        const originalId = s.id.replace('on-', '');
        const original = state.shifts.find(x => x.id === originalId);
        if (original) {
            actualShift = original;
            actualId = originalId;
        }
    }

    state.editingShiftId = actualId;
    document.getElementById('shiftModalTitle').textContent = s.isFixed ? '固定シフト編集' : 'シフト編集';
    document.getElementById('shiftSubmitBtn').textContent = '更新';
    document.getElementById('editShiftId').value = actualId;
    document.getElementById('shiftDate').value = actualShift.date || s.date;
    updateShiftDateDay();
    document.getElementById('shiftName').value = actualShift.name;
    document.getElementById('shiftStart').value = actualShift.startHour;
    document.getElementById('shiftEnd').value = actualShift.endHour;
    document.getElementById('overnightShift').checked = actualShift.overnight || false;
    document.getElementById('fixedShift').checked = s.isFixed || false;
    document.querySelectorAll('.color-option').forEach(o => { o.classList.toggle('selected', o.dataset.color === actualShift.color); });
    state.selectedColor = actualShift.color;
    openModal(document.getElementById('modalOverlay'));
}

function openChangeModal() {
    const sel = document.getElementById('changeShiftSelect');
    sel.innerHTML = '<option value="">選択してください</option>';
    state.shifts.forEach(s => {
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = `${s.name} - ${s.date} ${formatTime(s.startHour)}-${formatTime(s.endHour)}`;
        sel.appendChild(o);
    });
    document.getElementById('changeDate').value = formatDate(new Date());
    document.getElementById('changeStart').value = 9;
    document.getElementById('changeEnd').value = 17;
    openModal(document.getElementById('changeModalOverlay'));
}

function openSwapModal() {
    const sel = document.getElementById('swapShiftSelect');
    sel.innerHTML = '<option value="">選択してください</option>';
    state.shifts.forEach(s => {
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = `${s.name} - ${s.date} ${formatTime(s.startHour)}-${formatTime(s.endHour)}`;
        sel.appendChild(o);
    });
    openModal(document.getElementById('swapModalOverlay'));
}

// 時刻選択肢（30分単位）
function initTimeSelects() {
    [{ id: 'shiftStart', max: 23.5 }, { id: 'shiftEnd', min: 0.5, max: 24 }, { id: 'changeStart', max: 23.5 }, { id: 'changeEnd', min: 0.5, max: 24 }].forEach(({ id, min = 0, max }) => {
        const s = document.getElementById(id); if (!s) return;
        for (let i = min; i <= max; i += 0.5) {
            const o = document.createElement('option');
            o.value = i;
            o.textContent = formatTime(i);
            s.appendChild(o);
        }
    });
    document.getElementById('shiftStart').value = 9;
    document.getElementById('shiftEnd').value = 17;
    document.getElementById('changeStart').value = 9;
    document.getElementById('changeEnd').value = 17;
}

// イベント設定
function initEventListeners() {
    document.getElementById('prevWeek').onclick = goToPrevWeek;
    document.getElementById('nextWeek').onclick = goToNextWeek;
    document.getElementById('roleToggle').onclick = toggleRole;
    document.querySelectorAll('.admin-tab').forEach(t => t.onclick = () => { document.querySelectorAll('.admin-tab').forEach(x => x.classList.remove('active')); t.classList.add('active'); state.activeAdminTab = t.dataset.tab; renderAdminPanel(); });

    document.getElementById('addShiftBtn').onclick = () => {
        state.editingShiftId = null;
        document.getElementById('shiftModalTitle').textContent = 'シフト追加';
        document.getElementById('shiftSubmitBtn').textContent = '追加';
        document.getElementById('editShiftId').value = '';
        document.getElementById('shiftDate').value = formatDate(new Date());
        updateShiftDateDay();
        document.getElementById('shiftName').value = '';
        document.getElementById('overnightShift').checked = false;
        document.getElementById('fixedShift').checked = false;
        document.querySelectorAll('.color-option').forEach((o, i) => o.classList.toggle('selected', i === 0));
        state.selectedColor = '#6366f1';
        openModal(document.getElementById('modalOverlay'));
    };

    // 日付変更時に曜日を表示
    document.getElementById('shiftDate').onchange = updateShiftDateDay;

    document.getElementById('modalClose').onclick = () => closeModal(document.getElementById('modalOverlay'));
    document.getElementById('cancelBtn').onclick = () => closeModal(document.getElementById('modalOverlay'));
    document.getElementById('modalOverlay').onclick = e => { if (e.target.id === 'modalOverlay') closeModal(document.getElementById('modalOverlay')); };

    document.getElementById('requestChangeBtn').onclick = openChangeModal;
    document.getElementById('changeModalClose').onclick = () => closeModal(document.getElementById('changeModalOverlay'));
    document.getElementById('changeCancelBtn').onclick = () => closeModal(document.getElementById('changeModalOverlay'));
    document.getElementById('changeModalOverlay').onclick = e => { if (e.target.id === 'changeModalOverlay') closeModal(document.getElementById('changeModalOverlay')); };
    document.getElementById('changeShiftSelect').onchange = e => { const s = state.shifts.find(x => x.id === e.target.value); if (s) { document.getElementById('changeDate').value = s.date; document.getElementById('changeStart').value = s.startHour; document.getElementById('changeEnd').value = s.endHour; } };

    document.getElementById('shiftSwapBtn').onclick = openSwapModal;
    document.getElementById('swapModalClose').onclick = () => closeModal(document.getElementById('swapModalOverlay'));
    document.getElementById('swapCancelBtn').onclick = () => closeModal(document.getElementById('swapModalOverlay'));
    document.getElementById('swapModalOverlay').onclick = e => { if (e.target.id === 'swapModalOverlay') closeModal(document.getElementById('swapModalOverlay')); };

    document.getElementById('requestLeaveBtn').onclick = () => { document.getElementById('leaveStartDate').value = formatDate(new Date()); document.getElementById('leaveEndDate').value = formatDate(new Date()); openModal(document.getElementById('leaveModalOverlay')); };
    document.getElementById('leaveModalClose').onclick = () => closeModal(document.getElementById('leaveModalOverlay'));
    document.getElementById('leaveCancelBtn').onclick = () => closeModal(document.getElementById('leaveModalOverlay'));
    document.getElementById('leaveModalOverlay').onclick = e => { if (e.target.id === 'leaveModalOverlay') closeModal(document.getElementById('leaveModalOverlay')); };

    document.getElementById('pinModalClose').onclick = () => closeModal(document.getElementById('pinModalOverlay'));
    document.getElementById('pinCancelBtn').onclick = () => closeModal(document.getElementById('pinModalOverlay'));
    document.getElementById('pinModalOverlay').onclick = e => { if (e.target.id === 'pinModalOverlay') closeModal(document.getElementById('pinModalOverlay')); };
    document.getElementById('pinForm').onsubmit = e => { e.preventDefault(); if (verifyPin(document.getElementById('adminPin').value)) { closeModal(document.getElementById('pinModalOverlay')); switchToAdmin(); } else { document.getElementById('pinError').style.display = 'block'; document.getElementById('adminPin').value = ''; } };

    document.getElementById('viewMessagesBtn').onclick = () => { renderMessages(); openModal(document.getElementById('messagesModalOverlay')); };
    document.getElementById('messagesModalClose').onclick = () => closeModal(document.getElementById('messagesModalOverlay'));
    document.getElementById('messagesModalOverlay').onclick = e => { if (e.target.id === 'messagesModalOverlay') closeModal(document.getElementById('messagesModalOverlay')); };

    document.getElementById('employeeModalClose').onclick = () => closeModal(document.getElementById('employeeModalOverlay'));
    document.getElementById('employeeCancelBtn').onclick = () => closeModal(document.getElementById('employeeModalOverlay'));
    document.getElementById('employeeModalOverlay').onclick = e => { if (e.target.id === 'employeeModalOverlay') closeModal(document.getElementById('employeeModalOverlay')); };
    document.getElementById('employeeForm').onsubmit = e => { e.preventDefault(); addEmployee({ name: document.getElementById('employeeName').value.trim(), role: document.getElementById('employeeRole').value, shiftTime: document.getElementById('employeeShiftTime').value }); closeModal(document.getElementById('employeeModalOverlay')); document.getElementById('employeeForm').reset(); alert('従業員を追加しました'); };

    document.getElementById('broadcastModalClose').onclick = () => closeModal(document.getElementById('broadcastModalOverlay'));
    document.getElementById('broadcastCancelBtn').onclick = () => closeModal(document.getElementById('broadcastModalOverlay'));
    document.getElementById('broadcastModalOverlay').onclick = e => { if (e.target.id === 'broadcastModalOverlay') closeModal(document.getElementById('broadcastModalOverlay')); };
    document.getElementById('broadcastForm').onsubmit = e => { e.preventDefault(); sendBroadcast(document.getElementById('broadcastTitle').value.trim(), document.getElementById('broadcastMessage').value.trim()); closeModal(document.getElementById('broadcastModalOverlay')); document.getElementById('broadcastForm').reset(); alert('全従業員にメッセージを送信しました'); };

    document.querySelectorAll('.color-option').forEach(o => o.onclick = () => { document.querySelectorAll('.color-option').forEach(x => x.classList.remove('selected')); o.classList.add('selected'); state.selectedColor = o.dataset.color; });

    document.getElementById('shiftForm').onsubmit = e => {
        e.preventDefault();
        const id = document.getElementById('editShiftId').value;
        const isFixedChecked = document.getElementById('fixedShift').checked;
        const d = { date: document.getElementById('shiftDate').value, name: document.getElementById('shiftName').value, startHour: +document.getElementById('shiftStart').value, endHour: +document.getElementById('shiftEnd').value, color: state.selectedColor, overnight: document.getElementById('overnightShift').checked };
        if (!d.overnight && d.startHour >= d.endHour) { alert('終了時刻は開始時刻より後に'); return; }
        if (d.overnight && d.startHour <= d.endHour) { alert('夜勤は終了時刻を翌日の時刻に'); return; }

        if (id) {
            // 編集の場合：固定シフトか通常シフトかを判定
            const isFixedShift = state.fixedShifts.some(s => s.id === id);
            if (isFixedShift) {
                updateFixedShift(id, d);
            } else {
                updateShift(id, d);
            }
        } else if (isFixedChecked) {
            addFixedShift(d);
        } else {
            addShift(d);
        }
        closeModal(document.getElementById('modalOverlay'));
        document.getElementById('shiftForm').reset();
    };

    document.getElementById('changeForm').onsubmit = e => {
        e.preventDefault();
        const applicant = document.getElementById('changeApplicant').value;
        const d = { applicant, originalShiftId: document.getElementById('changeShiftSelect').value, newDate: document.getElementById('changeDate').value, newStartHour: +document.getElementById('changeStart').value, newEndHour: +document.getElementById('changeEnd').value, reason: document.getElementById('changeReason').value.trim() };
        if (d.newStartHour >= d.newEndHour) { alert('終了時刻は開始時刻より後に'); return; }
        addChangeRequest(d);
        closeModal(document.getElementById('changeModalOverlay'));
        document.getElementById('changeForm').reset();
        alert('シフト変更申請を送信しました');
    };

    document.getElementById('swapForm').onsubmit = e => {
        e.preventDefault();
        const applicant = document.getElementById('swapApplicant').value;
        const sid = document.getElementById('swapShiftSelect').value;
        const s = state.shifts.find(x => x.id === sid);
        addSwapRequest({ applicant, shiftId: sid, fromEmployee: s.name, targetEmployee: document.getElementById('swapTargetEmployee').value, message: document.getElementById('swapMessage').value.trim() });
        closeModal(document.getElementById('swapModalOverlay'));
        document.getElementById('swapForm').reset();
        alert('シフト交代依頼を送信しました');
    };

    document.getElementById('leaveForm').onsubmit = e => {
        e.preventDefault();
        const d = { name: document.getElementById('leaveName').value, startDate: document.getElementById('leaveStartDate').value, endDate: document.getElementById('leaveEndDate').value, reason: document.getElementById('leaveReason').value.trim() };
        if (d.startDate > d.endDate) { alert('終了日は開始日以降に'); return; }
        addLeaveRequest(d);
        closeModal(document.getElementById('leaveModalOverlay'));
        document.getElementById('leaveForm').reset();
        alert('有給申請を送信しました');
    };

    document.onkeydown = e => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach(m => closeModal(m)); };

    // 暗証番号変更モーダル
    document.getElementById('changePinModalClose').onclick = () => closeModal(document.getElementById('changePinModalOverlay'));
    document.getElementById('changePinCancelBtn').onclick = () => closeModal(document.getElementById('changePinModalOverlay'));
    document.getElementById('changePinModalOverlay').onclick = e => { if (e.target.id === 'changePinModalOverlay') closeModal(document.getElementById('changePinModalOverlay')); };
    document.getElementById('changePinForm').onsubmit = e => {
        e.preventDefault();
        const current = document.getElementById('currentPin').value;
        const newPin = document.getElementById('newPin').value;
        const confirm = document.getElementById('confirmPin').value;
        const errEl = document.getElementById('changePinError');
        if (current !== CONFIG.ADMIN_PIN) { errEl.textContent = '現在の暗証番号が違います'; errEl.style.display = 'block'; return; }
        if (newPin !== confirm) { errEl.textContent = '新しい暗証番号が一致しません'; errEl.style.display = 'block'; return; }
        if (newPin.length !== 4) { errEl.textContent = '暗証番号は4桁で入力してください'; errEl.style.display = 'block'; return; }
        CONFIG.ADMIN_PIN = newPin;
        database.ref('settings/adminPin').set(newPin);
        closeModal(document.getElementById('changePinModalOverlay'));
        document.getElementById('changePinForm').reset();
        errEl.style.display = 'none';
        alert('暗証番号を変更しました');
    };
}

// ========================================
// ズーム機能
// ========================================
function setZoom(level) {
    // 50% - 150% の範囲に制限
    state.zoomLevel = Math.min(150, Math.max(50, level));
    applyZoom();

    // UI更新
    const slider = document.getElementById('zoomSlider');
    const value = document.getElementById('zoomValue');
    if (slider) slider.value = state.zoomLevel;
    if (value) value.textContent = `${state.zoomLevel}%`;
}

function applyZoom() {
    const ganttContainer = document.querySelector('.gantt-container');
    if (!ganttContainer) return;

    const scale = state.zoomLevel / 100;

    // ガントチャートのセル幅を調整
    const timeCells = document.querySelectorAll('.time-cell');
    const hourCells = document.querySelectorAll('.hour-cell');

    const baseWidth = window.innerWidth <= 768 ? 38 : 50;
    const newWidth = Math.round(baseWidth * scale);

    timeCells.forEach(cell => {
        cell.style.minWidth = `${newWidth}px`;
    });

    hourCells.forEach(cell => {
        cell.style.minWidth = `${newWidth}px`;
    });

    // ヘッダーと行の最小幅を更新
    const minWidth = Math.round((window.innerWidth <= 768 ? 60 : 120) + (newWidth * 24));
    const ganttHeader = document.querySelector('.gantt-header');
    const ganttRows = document.querySelectorAll('.gantt-row');

    if (ganttHeader) ganttHeader.style.minWidth = `${minWidth}px`;
    ganttRows.forEach(row => {
        row.style.minWidth = `${minWidth}px`;
    });
}

function initZoomControls() {
    const zoomIn = document.getElementById('zoomIn');
    const zoomOut = document.getElementById('zoomOut');
    const zoomSlider = document.getElementById('zoomSlider');
    const zoomReset = document.getElementById('zoomReset');

    if (zoomIn) {
        zoomIn.onclick = () => setZoom(state.zoomLevel + 10);
    }

    if (zoomOut) {
        zoomOut.onclick = () => setZoom(state.zoomLevel - 10);
    }

    if (zoomSlider) {
        zoomSlider.oninput = (e) => setZoom(parseInt(e.target.value));
    }

    if (zoomReset) {
        zoomReset.onclick = () => setZoom(100);
    }

    // ピンチジェスチャー対応（モバイル）
    let lastTouchDistance = 0;
    let isPinching = false;
    const ganttContainer = document.querySelector('.gantt-container');

    if (ganttContainer) {
        // タッチ開始時
        ganttContainer.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                isPinching = true;
                lastTouchDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                // 2本指タッチの場合はデフォルト動作を防止
                e.preventDefault();
            }
        }, { passive: false });

        // タッチ移動時（ピンチズーム）
        ganttContainer.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && isPinching) {
                // ブラウザのデフォルトピンチズームを防止
                e.preventDefault();

                const currentDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );

                if (lastTouchDistance > 0) {
                    const delta = (currentDistance - lastTouchDistance) / 3;
                    setZoom(state.zoomLevel + delta);
                }

                lastTouchDistance = currentDistance;
            }
        }, { passive: false });

        // タッチ終了時
        ganttContainer.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                isPinching = false;
                lastTouchDistance = 0;
            }
        }, { passive: true });
    }
}

// ========================================
// PDF出力・印刷機能
// ========================================
function exportToPdf() {
    const element = document.querySelector('.app-container');
    if (!element) return;

    // PDF出力中のローディング表示
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'pdf-loading-overlay';
    loadingOverlay.innerHTML = `
        <div class="pdf-loading-content">
            <div class="pdf-loading-spinner"></div>
            <p>PDFを生成中...</p>
        </div>
    `;
    loadingOverlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        color: white;
        font-size: 1.2rem;
    `;
    document.body.appendChild(loadingOverlay);

    // PDF出力用のクラスを追加
    document.body.classList.add('pdf-export-mode');

    // 期間情報を取得
    const periodText = document.getElementById('currentPeriod')?.textContent || 'シフト表';
    const fileName = `シフト表_${periodText.replace(/\s/g, '_')}.pdf`;

    // html2pdf のオプション
    const opt = {
        margin: [10, 10, 10, 10],
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            scrollX: 0,
            scrollY: 0,
            windowWidth: 1200
        },
        jsPDF: {
            unit: 'mm',
            format: 'a4',
            orientation: 'landscape'
        },
        pagebreak: { mode: 'avoid-all' }
    };

    // PDF生成
    html2pdf().set(opt).from(element).save().then(() => {
        // クラスを削除
        document.body.classList.remove('pdf-export-mode');
        // ローディング削除
        loadingOverlay.remove();
    }).catch(err => {
        console.error('PDF生成エラー:', err);
        document.body.classList.remove('pdf-export-mode');
        loadingOverlay.remove();
        alert('PDFの生成に失敗しました。もう一度お試しください。');
    });
}

function printShiftTable() {
    window.print();
}

function initPdfExport() {
    const exportBtn = document.getElementById('exportPdfBtn');
    const printBtn = document.getElementById('printBtn');

    if (exportBtn) {
        exportBtn.onclick = exportToPdf;
    }

    if (printBtn) {
        printBtn.onclick = printShiftTable;
    }
}

// ========================================
// ポップオーバーイベントリスナー
// ========================================
function initPopoverEvents() {
    const popover = document.getElementById('shiftPopover');
    const closeBtn = document.getElementById('popoverClose');
    const editBtn = document.getElementById('popoverEditBtn');
    const deleteBtn = document.getElementById('popoverDeleteBtn');

    // 閉じるボタン
    if (closeBtn) {
        closeBtn.onclick = closeShiftPopover;
        closeBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeShiftPopover();
        }, { passive: false });
    }

    // 編集ボタン
    const handleEdit = () => {
        if (state.currentPopoverShift) {
            const shift = state.currentPopoverShift;
            closeShiftPopover();
            // 少し遅延を入れてポップオーバーが閉じてから開く
            setTimeout(() => {
                openEditShiftModal(shift);
            }, 100);
        }
    };

    if (editBtn) {
        editBtn.onclick = handleEdit;
        editBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleEdit();
        }, { passive: false });
    }

    // 削除ボタン
    const handleDelete = () => {
        if (state.currentPopoverShift) {
            const s = state.currentPopoverShift;
            closeShiftPopover();
            // 少し遅延を入れてから確認ダイアログを表示
            setTimeout(() => {
                if (confirm('このシフトを削除しますか？')) {
                    if (s.isFixed) {
                        const parts = s.id.split('-');
                        deleteFixedShift(parts[1]);
                    } else if (!s.isOvernightContinuation) {
                        deleteShift(s.id);
                    }
                }
            }, 100);
        }
    };

    if (deleteBtn) {
        deleteBtn.onclick = handleDelete;
        deleteBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDelete();
        }, { passive: false });
    }

    // 外側クリック/タッチで閉じる
    const handleOutsideInteraction = (e) => {
        if (popover && popover.classList.contains('active')) {
            // タッチイベントの場合は位置から要素を取得
            let targetElement = e.target;
            if (e.type === 'touchend' && e.changedTouches && e.changedTouches[0]) {
                const touch = e.changedTouches[0];
                targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
            }

            if (targetElement && !popover.contains(targetElement) && !targetElement.closest('.shift-bar')) {
                closeShiftPopover();
            }
        }
    };

    document.addEventListener('click', handleOutsideInteraction);
    document.addEventListener('touchend', handleOutsideInteraction, { passive: true });


    // Escapeキーで閉じる
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && popover && popover.classList.contains('active')) {
            closeShiftPopover();
        }
    });
}

// 初期化
function init() {
    initTimeSelects();
    initEventListeners();
    initZoomControls();
    initPdfExport();
    initPopoverEvents();
    loadData();
    render();

    // ウィンドウリサイズ時にシフトバーを再描画
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            render();
            applyZoom();
        }, 100);
    });
}

document.addEventListener('DOMContentLoaded', init);
