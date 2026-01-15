// ========================================
// シフトアプリ - メインJavaScript
// ========================================

// 状態管理
const state = {
    currentWeekStart: getWeekStart(new Date()),
    shifts: JSON.parse(localStorage.getItem('shifts') || '[]'),
    selectedColor: '#6366f1'
};

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

// 担当者ごとの色マップを生成
function getNameColors() {
    const colorMap = {};
    state.shifts.forEach(shift => {
        if (!colorMap[shift.name]) {
            colorMap[shift.name] = shift.color;
        }
    });
    return colorMap;
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
        
        // 日付ラベル
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
        
        // タイムライン
        const timeline = document.createElement('div');
        timeline.className = 'gantt-timeline';
        
        // 時間セル
        for (let hour = 0; hour < 24; hour++) {
            const hourCell = document.createElement('div');
            hourCell.className = 'hour-cell';
            hourCell.dataset.hour = hour;
            timeline.appendChild(hourCell);
        }
        
        // この日のシフトを描画
        const dateStr = formatDate(date);
        const dayShifts = state.shifts.filter(s => s.date === dateStr);
        
        dayShifts.forEach(shift => {
            const bar = createShiftBar(shift, timeline);
            timeline.appendChild(bar);
        });
        
        row.appendChild(timeline);
        ganttBody.appendChild(row);
    }
}

// シフトバーの作成
function createShiftBar(shift, timeline) {
    const bar = document.createElement('div');
    bar.className = 'shift-bar';
    bar.dataset.id = shift.id;
    
    const cellWidth = 50; // min-width of hour-cell
    const left = shift.startHour * cellWidth;
    const width = (shift.endHour - shift.startHour) * cellWidth;
    
    bar.style.left = `${left}px`;
    bar.style.width = `${width}px`;
    bar.style.background = `linear-gradient(135deg, ${shift.color}, ${adjustColor(shift.color, -20)})`;
    
    bar.innerHTML = `
        <span class="shift-name">${shift.name}</span>
        <span class="shift-time">${shift.startHour}:00-${shift.endHour}:00</span>
        <button class="delete-btn" title="削除">×</button>
    `;
    
    // 削除ボタンのイベント
    bar.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteShift(shift.id);
    });
    
    return bar;
}

// 色の調整（明るく/暗く）
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

// シフトの追加
function addShift(shiftData) {
    const shift = {
        id: Date.now().toString(),
        ...shiftData
    };
    
    state.shifts.push(shift);
    saveShifts();
    render();
}

// シフトの削除
function deleteShift(id) {
    state.shifts = state.shifts.filter(s => s.id !== id);
    saveShifts();
    render();
}

// ローカルストレージに保存
function saveShifts() {
    localStorage.setItem('shifts', JSON.stringify(state.shifts));
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

// 全体のレンダリング
function render() {
    renderTimeHeader();
    renderGanttBody();
    renderLegend();
    updatePeriodDisplay();
}

// モーダル関連
const modalOverlay = document.getElementById('modalOverlay');
const shiftForm = document.getElementById('shiftForm');
const addShiftBtn = document.getElementById('addShiftBtn');
const modalClose = document.getElementById('modalClose');
const cancelBtn = document.getElementById('cancelBtn');
const colorOptions = document.querySelectorAll('.color-option');

function openModal() {
    modalOverlay.classList.add('active');
    
    // 今日の日付をデフォルト設定
    document.getElementById('shiftDate').value = formatDate(new Date());
    
    // 初期色を選択状態に
    colorOptions.forEach(opt => opt.classList.remove('selected'));
    colorOptions[0].classList.add('selected');
    state.selectedColor = '#6366f1';
}

function closeModal() {
    modalOverlay.classList.remove('active');
    shiftForm.reset();
}

// 時刻選択肢の生成
function initTimeSelects() {
    const startSelect = document.getElementById('shiftStart');
    const endSelect = document.getElementById('shiftEnd');
    
    for (let i = 0; i <= 23; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `${i}:00`;
        startSelect.appendChild(option);
    }
    
    for (let i = 1; i <= 24; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `${i}:00`;
        endSelect.appendChild(option);
    }
    
    // デフォルト値
    startSelect.value = 9;
    endSelect.value = 17;
}

// イベントリスナーの設定
function initEventListeners() {
    // ナビゲーション
    document.getElementById('prevWeek').addEventListener('click', goToPrevWeek);
    document.getElementById('nextWeek').addEventListener('click', goToNextWeek);
    
    // モーダル
    addShiftBtn.addEventListener('click', openModal);
    modalClose.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    
    // 色選択
    colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            colorOptions.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            state.selectedColor = option.dataset.color;
            document.getElementById('shiftColor').value = option.dataset.color;
        });
    });
    
    // フォーム送信
    shiftForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const date = document.getElementById('shiftDate').value;
        const name = document.getElementById('shiftName').value.trim();
        const startHour = parseInt(document.getElementById('shiftStart').value);
        const endHour = parseInt(document.getElementById('shiftEnd').value);
        const color = state.selectedColor;
        
        if (startHour >= endHour) {
            alert('終了時刻は開始時刻より後にしてください');
            return;
        }
        
        addShift({ date, name, startHour, endHour, color });
        closeModal();
    });
    
    // キーボードショートカット
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

// 初期化
function init() {
    initTimeSelects();
    initEventListeners();
    render();
}

// DOMContentLoaded
document.addEventListener('DOMContentLoaded', init);
