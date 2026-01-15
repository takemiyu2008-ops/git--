// ========================================
// シフトアプリ - メインJavaScript
// ========================================

// 設定
const CONFIG = {
    ADMIN_PIN: '1234'
};

// 状態管理
const state = {
    currentWeekStart: getWeekStart(new Date()),
    shifts: JSON.parse(localStorage.getItem('shifts') || '[]'),
    fixedShifts: JSON.parse(localStorage.getItem('fixedShifts') || '[]'),
    changeRequests: JSON.parse(localStorage.getItem('changeRequests') || '[]'),
    leaveRequests: JSON.parse(localStorage.getItem('leaveRequests') || '[]'),
    employees: JSON.parse(localStorage.getItem('employees') || '[]'),
    messages: JSON.parse(localStorage.getItem('messages') || '[]'),
    swapRequests: JSON.parse(localStorage.getItem('swapRequests') || '[]'),
    selectedColor: '#6366f1',
    isAdmin: false,
    activeAdminTab: 'shiftChanges',
    editingShiftId: null
};

// 初期従業員データ
if (state.employees.length === 0) {
    state.employees = [
        { id: '1', name: '田中太郎', role: 'leader' },
        { id: '2', name: '佐藤花子', role: 'staff' },
        { id: '3', name: '鈴木一郎', role: 'staff' }
    ];
    saveData();
}

// ユーティリティ関数
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
}

function formatDate(date) {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
}

function formatDateTime(dateStr) {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getDayName(dayIndex) {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[dayIndex];
}

function getMonthDay(date) {
    const d = new Date(date);
    return {
        month: d.getMonth() + 1,
        day: d.getDate(),
        dayOfWeek: d.getDay()
    };
}

function getDayOfWeek(dateStr) {
    const d = new Date(dateStr);
    return d.getDay();
}

// 担当者ごとの色マップを生成
function getNameColors() {
    const colorMap = {};
    state.shifts.forEach(shift => {
        if (!colorMap[shift.name]) {
            colorMap[shift.name] = shift.color;
        }
    });
    state.fixedShifts.forEach(shift => {
        if (!colorMap[shift.name]) {
            colorMap[shift.name] = shift.color;
        }
    });
    return colorMap;
}

// 従業員セレクトの更新
function updateEmployeeSelects() {
    const selects = ['shiftName', 'leaveName', 'swapTargetEmployee'];

    selects.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;

        select.innerHTML = '<option value="">選択してください</option>';
        state.employees.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.name;
            option.textContent = emp.name;
            select.appendChild(option);
        });
    });
}

// 時間軸ヘッダーの生成
function renderTimeHeader() {
    const timeHeader = document.getElementById('timeHeader');
    timeHeader.innerHTML = '';

    for (let hour = 0; hour < 24; hour++) {
        const cell = document.createElement('div');
        cell.className = 'time-cell';
        cell.textContent = `${hour}時`;
        timeHeader.appendChild(cell);
    }
}

// シフトのレベル（縦位置）を計算
function calculateShiftLevels(shifts) {
    const levels = {};
    const sortedShifts = [...shifts].sort((a, b) => a.startHour - b.startHour);

    sortedShifts.forEach(shift => {
        let level = 0;
        for (const other of sortedShifts) {
            if (other.id === shift.id) continue;
            if (levels[other.id] === undefined) continue;

            const overlaps = !(shift.endHour <= other.startHour || shift.startHour >= other.endHour);
            if (overlaps && levels[other.id] >= level) {
                level = levels[other.id] + 1;
            }
        }
        levels[shift.id] = level;
    });

    return levels;
}

// ガントチャート本体の生成
function renderGanttBody() {
    const ganttBody = document.getElementById('ganttBody');
    ganttBody.innerHTML = '';

    for (let i = 0; i < 7; i++) {
        const date = new Date(state.currentWeekStart);
        date.setDate(date.getDate() + i);

        const row = document.createElement('div');
        row.className = 'gantt-row';
        row.dataset.date = formatDate(date);

        const { day, dayOfWeek } = getMonthDay(date);
        const dayName = getDayName(dayOfWeek);

        let dayClass = 'date-day';
        if (dayOfWeek === 0) dayClass += ' sunday';
        if (dayOfWeek === 6) dayClass += ' saturday';

        const dateLabel = document.createElement('div');
        dateLabel.className = 'gantt-date-label';
        dateLabel.innerHTML = `
            <span class="date-number">${day}</span>
            <span class="${dayClass}">${dayName}</span>
        `;
        row.appendChild(dateLabel);

        const timeline = document.createElement('div');
        timeline.className = 'gantt-timeline';

        for (let hour = 0; hour < 24; hour++) {
            const hourCell = document.createElement('div');
            hourCell.className = 'hour-cell';
            hourCell.dataset.hour = hour;
            timeline.appendChild(hourCell);
        }

        const dateStr = formatDate(date);
        const dayShifts = state.shifts.filter(s => s.date === dateStr);

        // 夜勤シフト（前日から跨ぎ）を取得
        const prevDate = new Date(date);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevDateStr = formatDate(prevDate);
        const overnightFromPrev = state.shifts
            .filter(s => s.date === prevDateStr && s.overnight)
            .map(s => ({
                ...s,
                id: `overnight-${s.id}`,
                date: dateStr,
                startHour: 0,
                endHour: s.endHour,
                isOvernightContinuation: true
            }));

        const fixedShiftsForDay = state.fixedShifts
            .filter(fs => fs.dayOfWeek === dayOfWeek)
            .map(fs => ({
                ...fs,
                id: `fixed-${fs.id}-${dateStr}`,
                date: dateStr,
                isFixed: true
            }));

        // 夜勤固定シフト（前日から跨ぎ）
        const prevDayOfWeek = (dayOfWeek + 6) % 7;
        const overnightFixedFromPrev = state.fixedShifts
            .filter(fs => fs.dayOfWeek === prevDayOfWeek && fs.overnight)
            .map(fs => ({
                ...fs,
                id: `fixed-overnight-${fs.id}-${dateStr}`,
                date: dateStr,
                startHour: 0,
                endHour: fs.endHour,
                isFixed: true,
                isOvernightContinuation: true
            }));

        const allShifts = [...dayShifts, ...overnightFromPrev, ...fixedShiftsForDay, ...overnightFixedFromPrev];

        const levels = calculateShiftLevels(allShifts);
        const maxLevel = Math.max(0, ...Object.values(levels));

        const baseHeight = 80;
        const heightPerLevel = 28;
        timeline.style.minHeight = `${baseHeight + maxLevel * heightPerLevel}px`;

        allShifts.forEach(shift => {
            const bar = createShiftBar(shift, levels[shift.id], maxLevel);
            timeline.appendChild(bar);
        });

        const approvedLeaves = state.leaveRequests.filter(l =>
            l.status === 'approved' &&
            dateStr >= l.startDate && dateStr <= l.endDate
        );

        approvedLeaves.forEach((leave, idx) => {
            const leaveBar = document.createElement('div');
            leaveBar.className = 'leave-bar';
            leaveBar.style.top = `${baseHeight + (maxLevel + 1 + idx) * heightPerLevel}px`;
            leaveBar.style.height = `${heightPerLevel - 4}px`;
            leaveBar.textContent = `🏖️ ${leave.name} 有給`;
            timeline.appendChild(leaveBar);
            timeline.style.minHeight = `${baseHeight + (maxLevel + 2 + idx) * heightPerLevel}px`;
        });

        row.appendChild(timeline);
        ganttBody.appendChild(row);
    }
}

// シフトバーの作成
function createShiftBar(shift, level, maxLevel) {
    const bar = document.createElement('div');
    let className = 'shift-bar';
    if (shift.isFixed) className += ' fixed';
    if (shift.overnight && !shift.isOvernightContinuation) className += ' overnight';
    bar.className = className;
    bar.dataset.id = shift.id;

    const cellWidth = 50;
    let startHour = shift.startHour;
    let endHour = shift.endHour;

    // 夜勤の場合、当日分は開始から24時まで表示
    if (shift.overnight && !shift.isOvernightContinuation) {
        endHour = 24;
    }

    const left = startHour * cellWidth;
    const width = (endHour - startHour) * cellWidth;

    const baseTop = 8;
    const barHeight = 24;
    const gapBetweenBars = 4;
    const top = baseTop + level * (barHeight + gapBetweenBars);

    bar.style.left = `${left}px`;
    bar.style.width = `${width}px`;
    bar.style.top = `${top}px`;
    bar.style.height = `${barHeight}px`;
    bar.style.background = `linear-gradient(135deg, ${shift.color}, ${adjustColor(shift.color, -20)})`;

    let icons = '';
    if (shift.isFixed) icons += '<span class="fixed-icon">🔁</span>';
    if (shift.overnight && !shift.isOvernightContinuation) icons += '<span class="overnight-icon">🌙</span>';
    if (shift.isOvernightContinuation) icons += '<span class="overnight-icon">→</span>';

    // 時間表示
    let timeDisplay = '';
    if (shift.overnight && !shift.isOvernightContinuation) {
        timeDisplay = `${shift.startHour}:00-翌${shift.endHour}:00`;
    } else if (shift.isOvernightContinuation) {
        timeDisplay = `〜${shift.endHour}:00`;
    } else {
        timeDisplay = `${shift.startHour}:00-${shift.endHour}:00`;
    }

    bar.innerHTML = `
        ${icons}
        <span class="shift-name">${shift.name}</span>
        <span class="shift-time">${timeDisplay}</span>
        <button class="delete-btn" title="削除">×</button>
    `;

    // シフトをクリックで編集
    bar.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) return;
        if (shift.isFixed || shift.isOvernightContinuation) return;
        openEditShiftModal(shift);
    });

    bar.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (shift.isFixed) {
            const originalId = shift.id.split('-')[1];
            deleteFixedShift(originalId);
        } else if (!shift.isOvernightContinuation) {
            deleteShift(shift.id);
        }
    });

    return bar;
}

// シフト編集モーダルを開く
function openEditShiftModal(shift) {
    state.editingShiftId = shift.id;

    document.getElementById('shiftModalTitle').textContent = 'シフト編集';
    document.getElementById('shiftSubmitBtn').textContent = '更新';
    document.getElementById('editShiftId').value = shift.id;
    document.getElementById('shiftDate').value = shift.date;
    document.getElementById('shiftName').value = shift.name;
    document.getElementById('shiftStart').value = shift.startHour;
    document.getElementById('shiftEnd').value = shift.endHour;
    document.getElementById('overnightShift').checked = shift.overnight || false;
    document.getElementById('fixedShift').checked = false;

    // 色を選択
    const colorOptions = document.querySelectorAll('.color-option');
    colorOptions.forEach(opt => {
        opt.classList.remove('selected');
        if (opt.dataset.color === shift.color) {
            opt.classList.add('selected');
        }
    });
    state.selectedColor = shift.color;

    openModal(document.getElementById('modalOverlay'));
}

// 色の調整
function adjustColor(hex, amount) {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
    const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
    return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}

// 凡例の更新
function renderLegend() {
    const legendItems = document.getElementById('legendItems');
    const nameColors = getNameColors();

    if (Object.keys(nameColors).length === 0) {
        legendItems.innerHTML = '<span style="color: var(--text-muted);">シフトを追加すると担当者が表示されます</span>';
        return;
    }

    legendItems.innerHTML = '';
    Object.entries(nameColors).forEach(([name, color]) => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <span class="legend-color" style="background: ${color};"></span>
            <span>${name}</span>
        `;
        legendItems.appendChild(item);
    });
}

// 期間表示の更新
function updatePeriodDisplay() {
    const periodEl = document.getElementById('currentPeriod');
    const start = new Date(state.currentWeekStart);
    const end = new Date(state.currentWeekStart);
    end.setDate(end.getDate() + 6);

    const startMonth = start.getMonth() + 1;
    const startDay = start.getDate();
    const endMonth = end.getMonth() + 1;
    const endDay = end.getDate();

    if (startMonth === endMonth) {
        periodEl.textContent = `${start.getFullYear()}年${startMonth}月${startDay}日 〜 ${endDay}日`;
    } else {
        periodEl.textContent = `${start.getFullYear()}年${startMonth}月${startDay}日 〜 ${endMonth}月${endDay}日`;
    }
}

// メッセージバー更新
function updateMessageBar() {
    const unreadCount = state.messages.filter(m => !m.read).length +
        state.swapRequests.filter(r => r.status === 'pending').length;
    const messageBar = document.getElementById('messageBar');
    const messageCount = document.getElementById('messageCount');

    if (unreadCount > 0) {
        messageBar.style.display = 'flex';
        messageCount.textContent = unreadCount;
    } else {
        messageBar.style.display = 'none';
    }
}

// シフトの追加
function addShift(shiftData) {
    const shift = {
        id: Date.now().toString(),
        ...shiftData
    };
    state.shifts.push(shift);
    saveData();
    render();
}

// シフトの更新
function updateShift(id, shiftData) {
    const index = state.shifts.findIndex(s => s.id === id);
    if (index !== -1) {
        state.shifts[index] = { ...state.shifts[index], ...shiftData };
        saveData();
        render();
    }
}

// 固定シフトの追加
function addFixedShift(shiftData) {
    const fixedShift = {
        id: Date.now().toString(),
        dayOfWeek: getDayOfWeek(shiftData.date),
        ...shiftData
    };
    delete fixedShift.date;
    state.fixedShifts.push(fixedShift);
    saveData();
    render();
}

// シフトの削除
function deleteShift(id) {
    state.shifts = state.shifts.filter(s => s.id !== id);
    saveData();
    render();
}

// 固定シフトの削除
function deleteFixedShift(id) {
    state.fixedShifts = state.fixedShifts.filter(s => s.id !== id);
    saveData();
    render();
}

// シフト変更申請の追加
function addChangeRequest(requestData) {
    const request = {
        id: Date.now().toString(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        ...requestData
    };
    state.changeRequests.push(request);
    saveData();
    renderAdminPanel();
}

// 有給申請の追加
function addLeaveRequest(requestData) {
    const request = {
        id: Date.now().toString(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        ...requestData
    };
    state.leaveRequests.push(request);
    saveData();
    renderAdminPanel();
}

// シフト交代依頼の追加
function addSwapRequest(requestData) {
    const request = {
        id: Date.now().toString(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        ...requestData
    };
    state.swapRequests.push(request);
    saveData();
    updateMessageBar();
}

// 従業員の追加
function addEmployee(employeeData) {
    const employee = {
        id: Date.now().toString(),
        ...employeeData
    };
    state.employees.push(employee);
    saveData();
    updateEmployeeSelects();
    renderAdminPanel();
}

// 従業員の削除
function deleteEmployee(id) {
    state.employees = state.employees.filter(e => e.id !== id);
    saveData();
    updateEmployeeSelects();
    renderAdminPanel();
}

// 全員へメッセージ送信
function sendBroadcast(title, content) {
    state.employees.forEach(emp => {
        state.messages.push({
            id: Date.now().toString() + emp.id,
            to: emp.name,
            from: '管理者',
            title: title,
            content: content,
            createdAt: new Date().toISOString(),
            read: false
        });
    });
    saveData();
    updateMessageBar();
}

// 申請の承認
function approveRequest(type, id) {
    if (type === 'change') {
        const request = state.changeRequests.find(r => r.id === id);
        if (request) {
            request.status = 'approved';
            const shift = state.shifts.find(s => s.id === request.originalShiftId);
            if (shift) {
                shift.date = request.newDate;
                shift.startHour = request.newStartHour;
                shift.endHour = request.newEndHour;
            }
        }
    } else if (type === 'leave') {
        const request = state.leaveRequests.find(r => r.id === id);
        if (request) request.status = 'approved';
    } else if (type === 'swap') {
        const request = state.swapRequests.find(r => r.id === id);
        if (request) {
            request.status = 'approved';
            // シフトの担当者を交代
            const shift = state.shifts.find(s => s.id === request.shiftId);
            if (shift) {
                shift.name = request.targetEmployee;
            }
        }
    }
    saveData();
    render();
    renderAdminPanel();
    updateMessageBar();
}

// 申請の却下
function rejectRequest(type, id) {
    if (type === 'change') {
        const request = state.changeRequests.find(r => r.id === id);
        if (request) request.status = 'rejected';
    } else if (type === 'leave') {
        const request = state.leaveRequests.find(r => r.id === id);
        if (request) request.status = 'rejected';
    } else if (type === 'swap') {
        const request = state.swapRequests.find(r => r.id === id);
        if (request) request.status = 'rejected';
    }
    saveData();
    renderAdminPanel();
    updateMessageBar();
}

// ローカルストレージに保存
function saveData() {
    localStorage.setItem('shifts', JSON.stringify(state.shifts));
    localStorage.setItem('fixedShifts', JSON.stringify(state.fixedShifts));
    localStorage.setItem('changeRequests', JSON.stringify(state.changeRequests));
    localStorage.setItem('leaveRequests', JSON.stringify(state.leaveRequests));
    localStorage.setItem('employees', JSON.stringify(state.employees));
    localStorage.setItem('messages', JSON.stringify(state.messages));
    localStorage.setItem('swapRequests', JSON.stringify(state.swapRequests));
}

// 前週へ
function goToPrevWeek() {
    state.currentWeekStart.setDate(state.currentWeekStart.getDate() - 7);
    render();
}

// 次週へ
function goToNextWeek() {
    state.currentWeekStart.setDate(state.currentWeekStart.getDate() + 7);
    render();
}

// 暗証番号認証モーダル
function showPinModal() {
    document.getElementById('adminPin').value = '';
    document.getElementById('pinError').style.display = 'none';
    openModal(document.getElementById('pinModalOverlay'));
}

function verifyPin(pin) {
    return pin === CONFIG.ADMIN_PIN;
}

function switchToAdmin() {
    state.isAdmin = true;
    const roleBtn = document.getElementById('roleToggle');
    const roleText = document.getElementById('roleText');
    document.getElementById('adminPanel').style.display = 'block';
    roleBtn.classList.add('admin');
    roleText.textContent = '管理者';
    roleBtn.querySelector('.role-icon').textContent = '👑';
    renderAdminPanel();
}

function switchToStaff() {
    state.isAdmin = false;
    const roleBtn = document.getElementById('roleToggle');
    const roleText = document.getElementById('roleText');
    document.getElementById('adminPanel').style.display = 'none';
    roleBtn.classList.remove('admin');
    roleText.textContent = 'スタッフ';
    roleBtn.querySelector('.role-icon').textContent = '👤';
}

function toggleRole() {
    if (state.isAdmin) {
        switchToStaff();
    } else {
        showPinModal();
    }
}

// 管理者パネルの描画
function renderAdminPanel() {
    const adminContent = document.getElementById('adminContent');
    adminContent.innerHTML = '';

    if (state.activeAdminTab === 'shiftChanges') {
        const requests = state.changeRequests.filter(r => r.status === 'pending');
        if (requests.length === 0) {
            adminContent.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">承認待ちのシフト変更申請はありません</p>';
            return;
        }
        requests.forEach(request => {
            const originalShift = state.shifts.find(s => s.id === request.originalShiftId);
            const card = document.createElement('div');
            card.className = 'request-card';
            card.innerHTML = `
                <div class="request-info">
                    <h4>${originalShift?.name || '不明'} - シフト変更</h4>
                    <p>変更前: ${originalShift?.date || '?'} ${originalShift?.startHour || '?'}:00-${originalShift?.endHour || '?'}:00</p>
                    <p>変更後: ${request.newDate} ${request.newStartHour}:00-${request.newEndHour}:00</p>
                    <p>理由: ${request.reason}</p>
                </div>
                <div class="request-actions">
                    <button class="btn btn-success btn-sm" onclick="approveRequest('change', '${request.id}')">承認</button>
                    <button class="btn btn-danger btn-sm" onclick="rejectRequest('change', '${request.id}')">却下</button>
                </div>
            `;
            adminContent.appendChild(card);
        });
    } else if (state.activeAdminTab === 'leaveRequests') {
        const requests = state.leaveRequests.filter(r => r.status === 'pending');
        if (requests.length === 0) {
            adminContent.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">承認待ちの有給申請はありません</p>';
            return;
        }
        requests.forEach(request => {
            const card = document.createElement('div');
            card.className = 'request-card';
            card.innerHTML = `
                <div class="request-info">
                    <h4>${request.name} - 有給申請</h4>
                    <p>期間: ${request.startDate} 〜 ${request.endDate}</p>
                    <p>理由: ${request.reason}</p>
                </div>
                <div class="request-actions">
                    <button class="btn btn-success btn-sm" onclick="approveRequest('leave', '${request.id}')">承認</button>
                    <button class="btn btn-danger btn-sm" onclick="rejectRequest('leave', '${request.id}')">却下</button>
                </div>
            `;
            adminContent.appendChild(card);
        });
    } else if (state.activeAdminTab === 'employees') {
        adminContent.innerHTML = `
            <div style="margin-bottom: 16px;">
                <button class="btn btn-primary btn-sm" onclick="openModal(document.getElementById('employeeModalOverlay'))">
                    + 従業員追加
                </button>
            </div>
            <div class="employee-list" id="employeeList"></div>
        `;
        const employeeList = document.getElementById('employeeList');
        state.employees.forEach(emp => {
            const card = document.createElement('div');
            card.className = 'employee-card';
            card.innerHTML = `
                <div class="employee-info">
                    <div class="employee-avatar">${emp.name.charAt(0)}</div>
                    <div>
                        <div class="employee-name">${emp.name}</div>
                        <div class="employee-role">${emp.role === 'leader' ? 'リーダー' : 'スタッフ'}</div>
                    </div>
                </div>
                <button class="btn btn-danger btn-sm" onclick="deleteEmployee('${emp.id}')">削除</button>
            `;
            employeeList.appendChild(card);
        });
    } else if (state.activeAdminTab === 'broadcast') {
        adminContent.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <p style="margin-bottom: 16px; color: var(--text-secondary);">全従業員にメッセージを送信します</p>
                <button class="btn btn-primary" onclick="openModal(document.getElementById('broadcastModalOverlay'))">
                    📢 メッセージを作成
                </button>
            </div>
        `;
    }
}

// メッセージ一覧の表示
function renderMessages() {
    const messagesContent = document.getElementById('messagesContent');
    const allMessages = [
        ...state.messages.map(m => ({ ...m, type: 'message' })),
        ...state.swapRequests.filter(r => r.status === 'pending').map(r => ({ ...r, type: 'swap' }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (allMessages.length === 0) {
        messagesContent.innerHTML = '<p style="color: var(--text-muted); text-align: center;">メッセージはありません</p>';
        return;
    }

    messagesContent.innerHTML = '';
    allMessages.forEach(msg => {
        const card = document.createElement('div');
        card.className = 'message-card' + (!msg.read ? ' unread' : '');

        if (msg.type === 'message') {
            card.innerHTML = `
                <div class="message-header">
                    <span class="message-from">${msg.from}</span>
                    <span class="message-date">${formatDateTime(msg.createdAt)}</span>
                </div>
                <div class="message-content">
                    <strong>${msg.title}</strong><br>
                    ${msg.content}
                </div>
            `;
            card.addEventListener('click', () => {
                msg.read = true;
                saveData();
                updateMessageBar();
                renderMessages();
            });
        } else if (msg.type === 'swap') {
            const shift = state.shifts.find(s => s.id === msg.shiftId);
            card.innerHTML = `
                <div class="message-header">
                    <span class="message-from">🤝 シフト交代依頼</span>
                    <span class="message-date">${formatDateTime(msg.createdAt)}</span>
                </div>
                <div class="message-content">
                    <strong>${msg.fromEmployee}</strong>さんからの依頼<br>
                    シフト: ${shift?.date || '?'} ${shift?.startHour || '?'}:00-${shift?.endHour || '?'}:00<br>
                    ${msg.message}
                </div>
                <div class="message-actions">
                    <button class="btn btn-success btn-sm" onclick="approveRequest('swap', '${msg.id}')">交代する</button>
                    <button class="btn btn-danger btn-sm" onclick="rejectRequest('swap', '${msg.id}')">お断り</button>
                </div>
            `;
        }
        messagesContent.appendChild(card);
    });
}

// 全体のレンダリング
function render() {
    renderTimeHeader();
    renderGanttBody();
    renderLegend();
    updatePeriodDisplay();
    updateMessageBar();
}

// モーダル関連
function openModal(overlay) {
    overlay.classList.add('active');
}

function closeModal(overlay) {
    overlay.classList.remove('active');
}

function openChangeModal() {
    const select = document.getElementById('changeShiftSelect');
    select.innerHTML = '';

    if (state.shifts.length === 0) {
        alert('変更するシフトがありません');
        return;
    }

    state.shifts.forEach(shift => {
        const option = document.createElement('option');
        option.value = shift.id;
        option.textContent = `${shift.name} - ${shift.date} ${shift.startHour}:00-${shift.endHour}:00`;
        select.appendChild(option);
    });

    const firstShift = state.shifts[0];
    document.getElementById('changeDate').value = firstShift.date;
    document.getElementById('changeStart').value = firstShift.startHour;
    document.getElementById('changeEnd').value = firstShift.endHour;

    openModal(document.getElementById('changeModalOverlay'));
}

function openSwapModal() {
    const select = document.getElementById('swapShiftSelect');
    select.innerHTML = '';

    if (state.shifts.length === 0) {
        alert('交代するシフトがありません');
        return;
    }

    state.shifts.forEach(shift => {
        const option = document.createElement('option');
        option.value = shift.id;
        option.textContent = `${shift.name} - ${shift.date} ${shift.startHour}:00-${shift.endHour}:00`;
        select.appendChild(option);
    });

    openModal(document.getElementById('swapModalOverlay'));
}

// 時刻選択肢の生成
function initTimeSelects() {
    const selects = [
        { id: 'shiftStart', max: 23 },
        { id: 'shiftEnd', min: 1, max: 24 },
        { id: 'changeStart', max: 23 },
        { id: 'changeEnd', min: 1, max: 24 }
    ];

    selects.forEach(({ id, min = 0, max }) => {
        const select = document.getElementById(id);
        if (!select) return;

        for (let i = min; i <= max; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${i}:00`;
            select.appendChild(option);
        }
    });

    document.getElementById('shiftStart').value = 9;
    document.getElementById('shiftEnd').value = 17;
    document.getElementById('changeStart').value = 9;
    document.getElementById('changeEnd').value = 17;
}

// イベントリスナーの設定
function initEventListeners() {
    document.getElementById('prevWeek').addEventListener('click', goToPrevWeek);
    document.getElementById('nextWeek').addEventListener('click', goToNextWeek);
    document.getElementById('roleToggle').addEventListener('click', toggleRole);

    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.activeAdminTab = tab.dataset.tab;
            renderAdminPanel();
        });
    });

    // シフト追加モーダル
    document.getElementById('addShiftBtn').addEventListener('click', () => {
        state.editingShiftId = null;
        document.getElementById('shiftModalTitle').textContent = 'シフト追加';
        document.getElementById('shiftSubmitBtn').textContent = '追加';
        document.getElementById('editShiftId').value = '';
        document.getElementById('shiftDate').value = formatDate(new Date());
        document.getElementById('shiftName').value = '';
        document.getElementById('overnightShift').checked = false;
        document.getElementById('fixedShift').checked = false;
        const colorOptions = document.querySelectorAll('.color-option');
        colorOptions.forEach(opt => opt.classList.remove('selected'));
        colorOptions[0].classList.add('selected');
        state.selectedColor = '#6366f1';
        openModal(document.getElementById('modalOverlay'));
    });

    document.getElementById('modalClose').addEventListener('click', () => closeModal(document.getElementById('modalOverlay')));
    document.getElementById('cancelBtn').addEventListener('click', () => closeModal(document.getElementById('modalOverlay')));
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalOverlay') closeModal(document.getElementById('modalOverlay'));
    });

    // シフト変更申請モーダル
    document.getElementById('requestChangeBtn').addEventListener('click', openChangeModal);
    document.getElementById('changeModalClose').addEventListener('click', () => closeModal(document.getElementById('changeModalOverlay')));
    document.getElementById('changeCancelBtn').addEventListener('click', () => closeModal(document.getElementById('changeModalOverlay')));
    document.getElementById('changeModalOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'changeModalOverlay') closeModal(document.getElementById('changeModalOverlay'));
    });

    document.getElementById('changeShiftSelect').addEventListener('change', (e) => {
        const shift = state.shifts.find(s => s.id === e.target.value);
        if (shift) {
            document.getElementById('changeDate').value = shift.date;
            document.getElementById('changeStart').value = shift.startHour;
            document.getElementById('changeEnd').value = shift.endHour;
        }
    });

    // シフト交代依頼モーダル
    document.getElementById('shiftSwapBtn').addEventListener('click', openSwapModal);
    document.getElementById('swapModalClose').addEventListener('click', () => closeModal(document.getElementById('swapModalOverlay')));
    document.getElementById('swapCancelBtn').addEventListener('click', () => closeModal(document.getElementById('swapModalOverlay')));
    document.getElementById('swapModalOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'swapModalOverlay') closeModal(document.getElementById('swapModalOverlay'));
    });

    // 有給申請モーダル
    document.getElementById('requestLeaveBtn').addEventListener('click', () => {
        document.getElementById('leaveStartDate').value = formatDate(new Date());
        document.getElementById('leaveEndDate').value = formatDate(new Date());
        openModal(document.getElementById('leaveModalOverlay'));
    });
    document.getElementById('leaveModalClose').addEventListener('click', () => closeModal(document.getElementById('leaveModalOverlay')));
    document.getElementById('leaveCancelBtn').addEventListener('click', () => closeModal(document.getElementById('leaveModalOverlay')));
    document.getElementById('leaveModalOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'leaveModalOverlay') closeModal(document.getElementById('leaveModalOverlay'));
    });

    // 暗証番号モーダル
    document.getElementById('pinModalClose').addEventListener('click', () => closeModal(document.getElementById('pinModalOverlay')));
    document.getElementById('pinCancelBtn').addEventListener('click', () => closeModal(document.getElementById('pinModalOverlay')));
    document.getElementById('pinModalOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'pinModalOverlay') closeModal(document.getElementById('pinModalOverlay'));
    });

    document.getElementById('pinForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const pin = document.getElementById('adminPin').value;
        if (verifyPin(pin)) {
            closeModal(document.getElementById('pinModalOverlay'));
            switchToAdmin();
        } else {
            document.getElementById('pinError').style.display = 'block';
            document.getElementById('adminPin').value = '';
        }
    });

    // メッセージモーダル
    document.getElementById('viewMessagesBtn').addEventListener('click', () => {
        renderMessages();
        openModal(document.getElementById('messagesModalOverlay'));
    });
    document.getElementById('messagesModalClose').addEventListener('click', () => closeModal(document.getElementById('messagesModalOverlay')));
    document.getElementById('messagesModalOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'messagesModalOverlay') closeModal(document.getElementById('messagesModalOverlay'));
    });

    // 従業員追加モーダル
    document.getElementById('employeeModalClose').addEventListener('click', () => closeModal(document.getElementById('employeeModalOverlay')));
    document.getElementById('employeeCancelBtn').addEventListener('click', () => closeModal(document.getElementById('employeeModalOverlay')));
    document.getElementById('employeeModalOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'employeeModalOverlay') closeModal(document.getElementById('employeeModalOverlay'));
    });

    document.getElementById('employeeForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('employeeName').value.trim();
        const role = document.getElementById('employeeRole').value;
        addEmployee({ name, role });
        closeModal(document.getElementById('employeeModalOverlay'));
        document.getElementById('employeeForm').reset();
        alert('従業員を追加しました');
    });

    // 全員へ通知モーダル
    document.getElementById('broadcastModalClose').addEventListener('click', () => closeModal(document.getElementById('broadcastModalOverlay')));
    document.getElementById('broadcastCancelBtn').addEventListener('click', () => closeModal(document.getElementById('broadcastModalOverlay')));
    document.getElementById('broadcastModalOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'broadcastModalOverlay') closeModal(document.getElementById('broadcastModalOverlay'));
    });

    document.getElementById('broadcastForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const title = document.getElementById('broadcastTitle').value.trim();
        const message = document.getElementById('broadcastMessage').value.trim();
        sendBroadcast(title, message);
        closeModal(document.getElementById('broadcastModalOverlay'));
        document.getElementById('broadcastForm').reset();
        alert('全従業員にメッセージを送信しました');
    });

    // 色選択
    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            state.selectedColor = option.dataset.color;
        });
    });

    // シフト追加/編集フォーム
    document.getElementById('shiftForm').addEventListener('submit', (e) => {
        e.preventDefault();

        const editId = document.getElementById('editShiftId').value;
        const date = document.getElementById('shiftDate').value;
        const name = document.getElementById('shiftName').value;
        const startHour = parseInt(document.getElementById('shiftStart').value);
        const endHour = parseInt(document.getElementById('shiftEnd').value);
        const color = state.selectedColor;
        const isFixed = document.getElementById('fixedShift').checked;
        const overnight = document.getElementById('overnightShift').checked;

        // 夜勤の場合は終了時刻が開始時刻より前でもOK
        if (!overnight && startHour >= endHour) {
            alert('終了時刻は開始時刻より後にしてください');
            return;
        }

        if (overnight && startHour <= endHour) {
            alert('夜勤の場合、終了時刻は翌日の時刻（開始より小さい値）にしてください');
            return;
        }

        const shiftData = { date, name, startHour, endHour, color, overnight };

        if (editId) {
            updateShift(editId, shiftData);
        } else if (isFixed) {
            addFixedShift(shiftData);
        } else {
            addShift(shiftData);
        }

        closeModal(document.getElementById('modalOverlay'));
        document.getElementById('shiftForm').reset();
    });

    // シフト変更申請フォーム
    document.getElementById('changeForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const originalShiftId = document.getElementById('changeShiftSelect').value;
        const newDate = document.getElementById('changeDate').value;
        const newStartHour = parseInt(document.getElementById('changeStart').value);
        const newEndHour = parseInt(document.getElementById('changeEnd').value);
        const reason = document.getElementById('changeReason').value.trim();

        if (newStartHour >= newEndHour) {
            alert('終了時刻は開始時刻より後にしてください');
            return;
        }

        addChangeRequest({ originalShiftId, newDate, newStartHour, newEndHour, reason });
        closeModal(document.getElementById('changeModalOverlay'));
        document.getElementById('changeForm').reset();
        alert('シフト変更申請を送信しました');
    });

    // シフト交代依頼フォーム
    document.getElementById('swapForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const shiftId = document.getElementById('swapShiftSelect').value;
        const shift = state.shifts.find(s => s.id === shiftId);
        const targetEmployee = document.getElementById('swapTargetEmployee').value;
        const message = document.getElementById('swapMessage').value.trim();

        addSwapRequest({
            shiftId,
            fromEmployee: shift.name,
            targetEmployee,
            message
        });

        closeModal(document.getElementById('swapModalOverlay'));
        document.getElementById('swapForm').reset();
        alert('シフト交代依頼を送信しました');
    });

    // 有給申請フォーム
    document.getElementById('leaveForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('leaveName').value;
        const startDate = document.getElementById('leaveStartDate').value;
        const endDate = document.getElementById('leaveEndDate').value;
        const reason = document.getElementById('leaveReason').value.trim();

        if (startDate > endDate) {
            alert('終了日は開始日以降にしてください');
            return;
        }

        addLeaveRequest({ name, startDate, endDate, reason });
        closeModal(document.getElementById('leaveModalOverlay'));
        document.getElementById('leaveForm').reset();
        alert('有給申請を送信しました');
    });

    // キーボードショートカット
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay').forEach(m => closeModal(m));
        }
    });
}

// 初期化
function init() {
    initTimeSelects();
    updateEmployeeSelects();
    initEventListeners();
    render();
}

document.addEventListener('DOMContentLoaded', init);
