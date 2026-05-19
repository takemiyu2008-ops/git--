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
// ==========================================
// 認証機能コード（従業員番号対応版）
// ==========================================

// Firebase Auth の初期化（firebase.initializeApp の後に追加）
const auth = firebase.auth();

// セッション永続性をSESSIONに設定（タブ/ブラウザを閉じたらログアウト）
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);

// 現在のユーザー情報を保持
let currentUser = null;

// ログイン後に自動で管理者モードで開始する従業員番号のリスト
const AUTO_ADMIN_STAFF_IDS = ['392'];

// 従業員番号をメールアドレスに変換
function staffIdToEmail(staffId) {
    return staffId + '@staff.local';
}

// パスワードを6文字以上に変換
function convertPassword(password) {
    return password + 'pw';
}

// 承認状態リスナーの参照を保持
let pendingStatusListener = null;

// データリスナーが設定済みかどうか
let dataListenersAttached = false;

// 全画面を非表示にするヘルパー
function hideAllScreens() {
    document.getElementById('authContainer').classList.remove('show');
    document.getElementById('pendingContainer').classList.remove('show');
    document.getElementById('appContainer').classList.add('hidden');
    document.getElementById('logoutBtnContainer').style.display = 'none';
}

// 承認待ち画面を表示
function showPendingScreen(status) {
    hideAllScreens();
    const container = document.getElementById('pendingContainer');
    const box = document.getElementById('pendingBox');
    const title = document.getElementById('pendingTitle');
    const message = document.getElementById('pendingMessage');

    if (status === 'rejected') {
        box.classList.add('rejected');
        title.textContent = '登録が却下されました';
        message.textContent = '管理者により登録が却下されました。詳細は管理者にお問い合わせください。';
    } else {
        box.classList.remove('rejected');
        title.textContent = '承認待ち';
        message.innerHTML = 'アカウント登録が完了しました。<br>管理者の承認をお待ちください。<br>承認されると自動的にアプリが利用可能になります。';
    }
    container.classList.add('show');
}

// 認証状態の監視
auth.onAuthStateChanged((user) => {
    // 前回のリスナーを解除
    if (pendingStatusListener) {
        pendingStatusListener();
        pendingStatusListener = null;
    }

    if (user) {
        // ログイン済み
        currentUser = user;
        console.log('ログイン済み:', user.email);

        // ユーザーの承認状態を確認
        const userRef = database.ref('users/' + user.uid);
        userRef.once('value', (snapshot) => {
            if (!snapshot.exists()) {
                // 新規ユーザーの場合、データベースに登録（フォールバック）
                const staffId = user.email.split('@')[0];
                userRef.set({
                    staffId: staffId,
                    displayName: user.displayName || '従業員' + staffId,
                    createdAt: new Date().toISOString(),
                    status: 'pending'
                });
                showPendingScreen('pending');
                // リアルタイムで承認状態を監視
                pendingStatusListener = userRef.child('status').on('value', (snap) => {
                    const newStatus = snap.val();
                    if (newStatus === 'approved') {
                        pendingStatusListener = null;
                        userRef.child('status').off('value');
                        location.reload();
                    } else if (newStatus === 'rejected') {
                        showPendingScreen('rejected');
                    }
                });
                return;
            }

            const userData = snapshot.val();
            const status = userData.status || 'approved'; // 既存ユーザーはapproved扱い

            if (status === 'approved') {
                // 承認済み → アプリ表示
                hideAllScreens();
                document.getElementById('appContainer').classList.remove('hidden');
                document.getElementById('logoutBtnContainer').style.display = 'block';

                // ログイン後にデータリスナーを再セットアップして描画
                if (dataListenersAttached) {
                    // 既存リスナーを解除してから再設定
                    detachDataListeners();
                }
                loadData();
                render();

                if (typeof initApp === 'function') {
                    initApp();
                }

                // 特定の従業員番号は自動で管理者モードで開始（PIN入力不要）
                const loginStaffId = userData.staffId || user.email.split('@')[0];
                if (AUTO_ADMIN_STAFF_IDS.includes(loginStaffId) && typeof switchToAdmin === 'function') {
                    switchToAdmin();
                }
            } else if (status === 'pending') {
                // 承認待ち → 待機画面
                showPendingScreen('pending');
                // リアルタイムで承認状態を監視
                pendingStatusListener = userRef.child('status').on('value', (snap) => {
                    const newStatus = snap.val();
                    if (newStatus === 'approved') {
                        pendingStatusListener = null;
                        userRef.child('status').off('value');
                        location.reload();
                    } else if (newStatus === 'rejected') {
                        showPendingScreen('rejected');
                    }
                });
            } else if (status === 'rejected') {
                // 却下 → 却下画面
                showPendingScreen('rejected');
            }
        });

    } else {
        // 未ログイン
        currentUser = null;
        clearAutoLogoutTimer();
        console.log('未ログイン');

        hideAllScreens();
        document.getElementById('authContainer').classList.add('show');

        // ブラウザ自動入力対策：ログイン画面を出すたびにパスワード欄をクリア
        const loginPwEl = document.getElementById('loginPassword');
        const registerPwEl = document.getElementById('registerPassword');
        if (loginPwEl) loginPwEl.value = '';
        if (registerPwEl) registerPwEl.value = '';
    }
});

// ==========================================
// 自動ログアウト（バックグラウンド経過時間ベース）
// ==========================================
const AUTO_LOGOUT_MS = 5 * 60 * 1000; // 5分以上アプリを離れたらログアウト
let autoLogoutTimerId = null;
let hiddenAt = null;

function clearAutoLogoutTimer() {
    if (autoLogoutTimerId) {
        clearTimeout(autoLogoutTimerId);
        autoLogoutTimerId = null;
    }
    hiddenAt = null;
}

function handleVisibilityChange() {
    // 未ログイン時は何もしない
    if (!currentUser) {
        clearAutoLogoutTimer();
        return;
    }
    if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        if (autoLogoutTimerId) clearTimeout(autoLogoutTimerId);
        // フォアグラウンドで動き続けるブラウザ向けのフォールバック
        autoLogoutTimerId = setTimeout(() => {
            console.log('自動ログアウト（バックグラウンド経過タイマー）');
            auth.signOut();
        }, AUTO_LOGOUT_MS);
    } else if (document.visibilityState === 'visible') {
        // 復帰時は実時刻で経過チェック（モバイルでタイマーが停止していてもOK）
        const elapsed = hiddenAt ? Date.now() - hiddenAt : 0;
        clearAutoLogoutTimer();
        if (elapsed >= AUTO_LOGOUT_MS) {
            console.log('自動ログアウト（復帰時に経過時間オーバー）:', Math.round(elapsed / 1000), '秒');
            auth.signOut();
        }
    }
}

document.addEventListener('visibilitychange', handleVisibilityChange);
// iOS/Android向け：pagehide でも経過開始の起点を取る
window.addEventListener('pagehide', () => {
    if (currentUser && !hiddenAt) {
        hiddenAt = Date.now();
    }
});

// エラーメッセージを表示
function showAuthError(message) {
    const errorEl = document.getElementById('authError');
    errorEl.textContent = message;
    errorEl.classList.add('show');
    setTimeout(() => {
        errorEl.classList.remove('show');
    }, 5000);
}

// ログイン/登録モードの切り替え
let isLoginMode = true;

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const toggleAuthMode = document.getElementById('toggleAuthMode');
    const toggleText = document.getElementById('toggleText');
    const authSubtitle = document.getElementById('authSubtitle');
    const logoutBtn = document.getElementById('logoutBtn');
    
    // 従業員番号の入力制限（3桁の数字のみ）
    const staffIdInputs = document.querySelectorAll('.staff-id-input');
    staffIdInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            // 数字のみ許可
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
            // 3桁まで
            if (e.target.value.length > 3) {
                e.target.value = e.target.value.slice(0, 3);
            }
        });
    });
    
    // パスワードの入力制限（4桁の数字のみ）
    const passwordInputs = document.querySelectorAll('.password-input');
    passwordInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            // 数字のみ許可
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
            // 4桁まで
            if (e.target.value.length > 4) {
                e.target.value = e.target.value.slice(0, 4);
            }
        });
    });
    
    // ログイン/登録の切り替え
    toggleAuthMode.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        
        if (isLoginMode) {
            loginForm.style.display = 'flex';
            registerForm.style.display = 'none';
            authSubtitle.textContent = 'ログインしてください';
            toggleText.textContent = 'まだ登録していない方は';
            toggleAuthMode.textContent = '新規登録';
        } else {
            loginForm.style.display = 'none';
            registerForm.style.display = 'flex';
            authSubtitle.textContent = '新規アカウント作成';
            toggleText.textContent = 'すでに登録済みの方は';
            toggleAuthMode.textContent = 'ログイン';
        }
        
        // エラーメッセージをクリア
        document.getElementById('authError').classList.remove('show');
    });
    
    // ログイン処理
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const staffId = document.getElementById('loginStaffId').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        
        // 入力チェック
        if (staffId.length !== 3) {
            showAuthError('従業員番号は3桁で入力してください');
            return;
        }
        if (password.length !== 4) {
            showAuthError('パスワードは4桁で入力してください');
            return;
        }
        
        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'ログイン中...';
            
            const email = staffIdToEmail(staffId);
            const fullPassword = convertPassword(password);
            
            await auth.signInWithEmailAndPassword(email, fullPassword);
            // ログイン成功（onAuthStateChangedで処理される）
            
        } catch (error) {
            console.error('ログインエラー:', error);
            let errorMessage = 'ログインに失敗しました';
            
            switch (error.code) {
                case 'auth/user-not-found':
                    errorMessage = '従業員番号またはパスワードが間違っています';
                    break;
                case 'auth/wrong-password':
                    errorMessage = '従業員番号またはパスワードが間違っています';
                    break;
                case 'auth/invalid-credential':
                    errorMessage = '従業員番号またはパスワードが間違っています';
                    break;
                case 'auth/network-request-failed':
                    errorMessage = 'ネットワークエラーが発生しました';
                    break;
                case 'auth/too-many-requests':
                    errorMessage = 'ログイン試行回数が多すぎます。しばらく待ってから再度お試しください';
                    break;
            }
            
            showAuthError(errorMessage);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'ログイン';
        }
    });
    
    // 新規登録処理
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('registerName').value.trim();
        const staffId = document.getElementById('registerStaffId').value.trim();
        const password = document.getElementById('registerPassword').value.trim();
        const submitBtn = registerForm.querySelector('button[type="submit"]');
        
        // 入力チェック
        if (!name) {
            showAuthError('名前を入力してください');
            return;
        }
        if (staffId.length !== 3) {
            showAuthError('従業員番号は3桁で入力してください');
            return;
        }
        if (password.length !== 4) {
            showAuthError('パスワードは4桁で入力してください');
            return;
        }
        
        try {
            submitBtn.disabled = true;
            submitBtn.textContent = '登録中...';
            
            const email = staffIdToEmail(staffId);
            const fullPassword = convertPassword(password);
            
            const userCredential = await auth.createUserWithEmailAndPassword(email, fullPassword);
            
            // 表示名を設定
            await userCredential.user.updateProfile({
                displayName: name
            });
            
            // データベースにユーザー情報を保存（承認待ち状態で登録）
            await database.ref('users/' + userCredential.user.uid).set({
                staffId: staffId,
                displayName: name,
                createdAt: new Date().toISOString(),
                status: 'pending'
            });
            
            // 登録成功（onAuthStateChangedで処理される）
            
        } catch (error) {
            console.error('登録エラー:', error);
            let errorMessage = 'アカウント登録に失敗しました';
            
            switch (error.code) {
                case 'auth/email-already-in-use':
                    errorMessage = 'この従業員番号は既に使用されています';
                    break;
                case 'auth/operation-not-allowed':
                    errorMessage = 'メール/パスワード認証が有効になっていません';
                    break;
                case 'auth/network-request-failed':
                    errorMessage = 'ネットワークエラーが発生しました';
                    break;
            }
            
            showAuthError(errorMessage);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '新規登録';
        }
    });
    
    // ログアウト処理
    logoutBtn.addEventListener('click', async () => {
        if (confirm('ログアウトしますか？')) {
            try {
                await auth.signOut();
                // ログアウト成功（onAuthStateChangedで処理される）
            } catch (error) {
                console.error('ログアウトエラー:', error);
                alert('ログアウトに失敗しました');
            }
        }
    });
});

// 既存のコードとの統合用：initApp関数を作成（必要に応じて既存の初期化コードを移動）
// function initApp() {
//     // 既存の初期化処理をここに移動
// }



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
    shiftOverrides: [], // 固定シフトの単日上書き
    changeRequests: [],
    leaveRequests: [],
    holidayRequests: [],
    employees: [],
    messages: [],
    swapRequests: [],
    dailyEvents: [],
    nonDailyAdvice: [], // 非デイリー発注アドバイス
    trendReports: [], // コンビニ3社 新商品ヒット予測レポート
    newProductReports: [], // 週次インテリジェンス（マクロ環境）
    productResearchReports: [], // 新規商品調査レポート
    productResearchFilter: 'all', // 新規商品調査レポートのカテゴリフィルター
    weatherData: {}, // 日付別の天気データ
    selectedColor: '#6366f1',
    isAdmin: false,
    activeAdminTab: 'shiftChanges',
    editingShiftId: null,
    isConnected: false,
    zoomLevel: 100,
    currentPopoverShift: null,
    eventTypeFilter: 'all', // 店舗スケジュールのタイプフィルター
    nonDailyFilter: 'all', // 非デイリーアドバイスのカテゴリフィルター
    dailyChecklist: {}, // カテゴリ別日次チェックリスト
    categoryMemos: [], // カテゴリ別メモ
    selectedAdvisorCategory: null, // 選択中のアドバイザーカテゴリ
    productCategories: [], // 商品分類データ（PMA/情報分類/小分類）
    selectedPmaId: null, // 選択中のPMA ID
    usageStats: [], // 利用統計データ
    specialEvents: [] // 臨時シフト用イベント日
};

// 利用統計の機能カテゴリ定義
const USAGE_FEATURES = {
    // アプリ閲覧
    'app_view': { name: 'アプリ閲覧', category: 'アクセス', icon: '👁️' },
    // シフト関連
    'view_shift': { name: 'シフト表閲覧', category: 'シフト管理', icon: '📅' },
    'add_shift': { name: 'シフト追加', category: 'シフト管理', icon: '➕' },
    'edit_shift': { name: 'シフト編集', category: 'シフト管理', icon: '✏️' },
    'delete_shift': { name: 'シフト削除', category: 'シフト管理', icon: '🗑️' },
    'request_change': { name: 'シフト変更申請', category: 'シフト管理', icon: '🔄' },
    'request_swap': { name: 'シフト交代依頼', category: 'シフト管理', icon: '🤝' },
    'request_leave': { name: '有給申請', category: 'シフト管理', icon: '🏖️' },
    'request_holiday': { name: '休日申請', category: 'シフト管理', icon: '🏠' },
    'create_halfday': { name: '半休作成', category: 'シフト管理', icon: '🌅' },
    'add_special_event': { name: '臨時シフトイベント追加', category: 'シフト管理', icon: '⚡' },
    // 発注・スケジュール管理
    'view_order_advice': { name: '発注アドバイス閲覧', category: '発注・スケジュール管理', icon: '📦' },
    'submit_order_feedback': { name: '発注フィードバック送信', category: '発注・スケジュール管理', icon: '📝' },
    'view_daily_checklist': { name: '日次チェックリスト確認', category: '発注・スケジュール管理', icon: '✅' },
    'update_daily_checklist': { name: '日次チェックリスト更新', category: '発注・スケジュール管理', icon: '☑️' },
    // 非デイリー発注参考情報
    'view_non_daily': { name: '非デイリー参考情報閲覧', category: '非デイリー発注参考情報', icon: '📈' },
    'add_non_daily': { name: '非デイリー参考情報追加', category: '非デイリー発注参考情報', icon: '➕' },
    'edit_non_daily': { name: '非デイリー参考情報編集', category: '非デイリー発注参考情報', icon: '✏️' },
    'delete_non_daily': { name: '非デイリー参考情報削除', category: '非デイリー発注参考情報', icon: '🗑️' },
    // 店舗スケジュール
    'view_daily_events': { name: '店舗スケジュール閲覧', category: '店舗スケジュール', icon: '📅' },
    'add_daily_event': { name: '店舗スケジュール追加', category: '店舗スケジュール', icon: '➕' },
    'edit_daily_event': { name: '店舗スケジュール編集', category: '店舗スケジュール', icon: '✏️' },
    'delete_daily_event': { name: '店舗スケジュール削除', category: '店舗スケジュール', icon: '🗑️' },
    // レポート
    'view_trend_report': { name: 'トレンドレポート閲覧', category: 'レポート', icon: '📊' },
    'add_trend_report': { name: 'トレンドレポート追加', category: 'レポート', icon: '➕' },
    'edit_trend_report': { name: 'トレンドレポート編集', category: 'レポート', icon: '✏️' },
    'delete_trend_report': { name: 'トレンドレポート削除', category: 'レポート', icon: '🗑️' },
    'view_new_product': { name: '週次インテリジェンス（マクロ環境）閲覧', category: 'レポート', icon: '🆕' },
    'add_new_product': { name: '週次インテリジェンス（マクロ環境）追加', category: 'レポート', icon: '➕' },
    'edit_new_product': { name: '週次インテリジェンス（マクロ環境）編集', category: 'レポート', icon: '✏️' },
    'delete_new_product': { name: '週次インテリジェンス（マクロ環境）削除', category: 'レポート', icon: '🗑️' },
    // メッセージ
    'view_messages': { name: 'メッセージ確認', category: 'コミュニケーション', icon: '📩' },
    'send_broadcast': { name: '全員へ通知送信', category: 'コミュニケーション', icon: '📢' },
    // 管理者機能
    'admin_approve': { name: '申請承認', category: '管理者', icon: '✅' },
    'admin_reject': { name: '申請却下', category: '管理者', icon: '❌' },
    'admin_cancel_leave': { name: '有給承認取り消し', category: '管理者', icon: '↩️' },
    'manage_employees': { name: '従業員管理', category: '管理者', icon: '👥' },
    'view_feedback_stats': { name: 'フィードバック集計閲覧', category: '管理者', icon: '📊' },
    'manage_product_categories': { name: '商品分類管理', category: '管理者', icon: '📂' },
    // その他
    'export_pdf': { name: 'PDF出力', category: 'その他', icon: '📄' },
    'print_shift': { name: 'シフト表印刷', category: 'その他', icon: '🖨️' }
};

// Obsidian Calloutの種類定義
const CALLOUT_TYPES = {
    note:     { icon: '✏️', color: '#448aff' },
    tip:      { icon: '💡', color: '#00bfa5' },
    hint:     { icon: '💡', color: '#00bfa5' },
    important:{ icon: '🔥', color: '#ff5252' },
    warning:  { icon: '⚠️', color: '#ff9100' },
    caution:  { icon: '⚠️', color: '#ff9100' },
    danger:   { icon: '⚡', color: '#ff1744' },
    error:    { icon: '❌', color: '#ff1744' },
    info:     { icon: 'ℹ️', color: '#448aff' },
    success:  { icon: '✅', color: '#00c853' },
    check:    { icon: '✅', color: '#00c853' },
    done:     { icon: '✅', color: '#00c853' },
    question: { icon: '❓', color: '#ffab00' },
    faq:      { icon: '❓', color: '#ffab00' },
    help:     { icon: '❓', color: '#ffab00' },
    quote:    { icon: '💬', color: '#9e9e9e' },
    cite:     { icon: '💬', color: '#9e9e9e' },
    example:  { icon: '📋', color: '#7c4dff' },
    abstract: { icon: '📄', color: '#00b0ff' },
    summary:  { icon: '📄', color: '#00b0ff' },
    tldr:     { icon: '📄', color: '#00b0ff' },
    bug:      { icon: '🐛', color: '#ff1744' },
    todo:     { icon: '☑️', color: '#448aff' },
};

// Obsidian記法の前処理（==ハイライト== と コールアウト）
function preprocessObsidian(text) {
    // ==ハイライト== → <mark>ハイライト</mark>
    text = text.replace(/==(.*?)==/g, '<mark>$1</mark>');

    // Obsidian Callout: > [!type] Title の変換
    text = text.replace(
        /^(>\s*)\[!(\w+)\]([+-]?)[ \t]*(.*)?$/gm,
        (match, prefix, type, foldable, title) => {
            const t = type.toLowerCase();
            const callout = CALLOUT_TYPES[t] || CALLOUT_TYPES.note;
            const displayTitle = title || type.charAt(0).toUpperCase() + type.slice(1);
            return `${prefix}<div class="obsidian-callout callout-${t}" style="--callout-color:${callout.color}"><div class="callout-title"><span class="callout-icon">${callout.icon}</span> ${displayTitle}</div><div class="callout-content">`;
        }
    );

    // コールアウト内の後続行 ("> " で始まる行) を処理し、
    // コールアウトでない行が来たらブロックを閉じる
    const lines = text.split('\n');
    const result = [];
    let inCallout = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes('<div class="obsidian-callout')) {
            if (inCallout) {
                result.push('</div></div>\n');
            }
            inCallout = true;
            // callout開始行から "> " プレフィックスを除去
            result.push(line.replace(/^>\s*/, ''));
        } else if (inCallout && /^>\s?/.test(line)) {
            // コールアウト内の継続行
            result.push(line.replace(/^>\s?/, ''));
        } else {
            if (inCallout) {
                result.push('</div></div>\n');
                inCallout = false;
            }
            result.push(line);
        }
    }

    if (inCallout) {
        result.push('</div></div>\n');
    }

    return result.join('\n');
}

// SVGブロック抽出（marked.jsがSVGを破壊するのを防止）
function extractSvgBlocks(text) {
    const svgBlocks = [];
    const processed = text.replace(/<svg[\s\S]*?<\/svg>/gi, (match) => {
        svgBlocks.push(match);
        return `<div data-svg-placeholder="${svgBlocks.length - 1}"></div>`;
    });
    return { text: processed, svgBlocks };
}

// SVGブロック復元
function restoreSvgBlocks(html, svgBlocks) {
    return html.replace(/<div data-svg-placeholder="(\d+)"><\/div>/g, (match, index) => {
        const idx = parseInt(index);
        if (idx < svgBlocks.length) {
            return `<div class="infographic-svg-container">${svgBlocks[idx]}</div>`;
        }
        return match;
    });
}

// Markdownレンダリングヘルパー関数
function renderMarkdown(text) {
    if (!text) return '';
    if (typeof marked !== 'undefined') {
        const { text: cleanText, svgBlocks } = extractSvgBlocks(text);
        const html = marked.parse(preprocessObsidian(cleanText));
        return svgBlocks.length > 0 ? restoreSvgBlocks(html, svgBlocks) : html;
    }
    return text.replace(/\n/g, '<br>');
}

// Markdownプレビュー切替関数
function toggleMarkdownPreview(formGroup, mode) {
    const textarea = formGroup.querySelector('textarea');
    let preview = formGroup.querySelector('.markdown-preview');
    const tabs = formGroup.querySelector('.preview-tabs');

    if (!preview) {
        preview = document.createElement('div');
        preview.className = 'markdown-preview report-content';
        preview.style.display = 'none';
        textarea.parentNode.insertBefore(preview, textarea.nextSibling);
    }

    tabs.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));

    if (mode === 'preview') {
        textarea.style.display = 'none';
        preview.style.display = 'block';
        preview.innerHTML = renderMarkdown(textarea.value);
        tabs.querySelector('[data-mode="preview"]').classList.add('active');
    } else {
        textarea.style.display = '';
        preview.style.display = 'none';
        tabs.querySelector('[data-mode="edit"]').classList.add('active');
    }
}

// 利用統計を記録する関数
function trackUsage(featureId, targetName = null) {
    const feature = USAGE_FEATURES[featureId];
    if (!feature) return;

    // ログインユーザー情報を自動取得
    const user = currentUser;
    const userEmail = user ? user.email : null;
    const userDisplayName = user ? (user.displayName || userEmail?.split('@')[0] || '不明') : '未ログイン';

    const stat = {
        id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
        featureId: featureId,
        featureName: feature.name,
        category: feature.category,
        userName: userDisplayName,
        userId: user ? user.uid : null,
        userEmail: userEmail || null,
        targetName: targetName || null,
        timestamp: new Date().toISOString(),
        date: formatDate(new Date())
    };

    // Firebaseに保存
    database.ref('usageStats/' + stat.id).set(stat);
}

// 店舗の位置情報（千葉県千葉市）
const STORE_LOCATION = {
    latitude: 35.6074,
    longitude: 140.1065,
    name: '千葉市'
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
// 週の開始日を取得（月曜日始まり）
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    // 月曜日を0として計算（日曜日は6になる）
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    return d;
}
// 日付をローカルタイムゾーンでフォーマット（YYYY-MM-DD形式）
function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
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

// データリスナーで監視しているrefキー一覧
const dataRefKeys = ['shifts', 'fixedShifts', 'shiftOverrides', 'changeRequests', 'leaveRequests', 'holidayRequests', 'employees', 'messages', 'swapRequests', 'dailyEvents', 'nonDailyAdvice', 'trendReports', 'categoryMemos', 'productCategories', 'newProductReports', 'specialEvents', 'productResearchReports'];

// Firebase データリスナーを解除
function detachDataListeners() {
    dataRefKeys.forEach(key => {
        database.ref(key).off('value');
    });
    database.ref('dailyChecklist').off('value');
    database.ref('usageStats').off('value');
    dataListenersAttached = false;
}

// Firebase からデータを読み込み
function loadData() {
    const refs = dataRefKeys;
    dataListenersAttached = true;
    refs.forEach(key => {
        database.ref(key).on('value', snap => {
            const data = snap.val();
            state[key] = data ? Object.values(data) : [];
            if (key === 'employees') updateEmployeeSelects();
            if (key === 'nonDailyAdvice') renderNonDailyAdvisor();
            if (key === 'newProductReports') renderNewProductReport();
            if (key === 'trendReports') renderTrendReports();
            if (key === 'productResearchReports') renderProductResearch();
            render();
            if (state.isAdmin) renderAdminPanel();
            updateMessageBar();
        });
    });
    // dailyChecklistはオブジェクト形式で管理
    database.ref('dailyChecklist').on('value', snap => {
        state.dailyChecklist = snap.val() || {};
    });
    // 利用統計（管理者用）
    database.ref('usageStats').on('value', snap => {
        const data = snap.val();
        state.usageStats = data ? Object.values(data) : [];
        if (state.isAdmin && state.activeAdminTab === 'usageStats') {
            renderAdminPanel();
        }
    });
}

// Firebase にデータを保存
function saveToFirebase(key, data) {
    const ref = database.ref(key);
    ref.set(data.reduce((acc, item) => { acc[item.id] = item; return acc; }, {}));
}

// 従業員セレクト更新
function updateEmployeeSelects() {
    ['shiftName', 'leaveName', 'holidayName', 'holidaySwapPartner', 'swapTargetEmployee', 'changeApplicant', 'swapApplicant'].forEach(id => {
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

// シフトレベル計算（重なるシフトを縦に並べる）
function calculateShiftLevels(shifts) {
    const levels = {};

    // 各シフトの表示用終了時間を計算（夜勤は開始日は24時まで表示）
    const getDisplayEndHour = (s) => {
        if (s.overnight && !s.isOvernightContinuation) {
            return 24; // 夜勤シフトの開始日は24時（0時）まで
        }
        return s.endHour;
    };

    // 開始時間でソート、同じ場合はIDでソート（安定したソートのため）
    const sorted = [...shifts].sort((a, b) => {
        if (a.startHour !== b.startHour) return a.startHour - b.startHour;
        return String(a.id).localeCompare(String(b.id));
    });

    // デバッグ用ログ
    console.log('Calculating levels for shifts:', sorted.map(s => ({
        id: s.id,
        name: s.name,
        start: s.startHour,
        end: s.endHour,
        displayEnd: getDisplayEndHour(s),
        overnight: s.overnight
    })));

    sorted.forEach(s => {
        let lvl = 0;
        const sStart = s.startHour;
        const sEnd = getDisplayEndHour(s);

        for (const o of sorted) {
            if (o.id === s.id || levels[o.id] === undefined) continue;
            const oStart = o.startHour;
            const oEnd = getDisplayEndHour(o);

            // 時間帯が重なるかチェック（開始=終了の場合も重なりとみなす）
            const overlaps = !(sEnd < oStart || sStart > oEnd);
            if (overlaps && levels[o.id] >= lvl) {
                lvl = levels[o.id] + 1;
            }
        }
        levels[s.id] = lvl;
    });

    console.log('Calculated levels:', levels);
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

        // 祝日判定を先に行う
        const holidayName = getJapaneseHoliday(date);

        let dayClass = 'date-day';
        if (dayOfWeek === 0 || holidayName) dayClass += ' sunday'; // 祝日も赤色に
        else if (dayOfWeek === 6) dayClass += ' saturday';

        const label = document.createElement('div');
        label.className = 'gantt-date-label';
        if (holidayName) label.classList.add('is-holiday');

        // 基本の日付表示
        let labelHTML = `<span class="date-number${holidayName ? ' holiday' : ''}">${day}</span><span class="${dayClass}">${getDayName(dayOfWeek)}</span>`;

        // 天気予報を追加
        const weather = state.weatherData[dateStr];
        if (weather) {
            const weatherInfo = getWeatherInfo(weather.weatherCode);

            // 昨年比較用の差分計算
            let lastYearHtml = '';
            if (weather.lastYearTempMax !== null && weather.lastYearTempMin !== null) {
                const diffMax = weather.tempMax - weather.lastYearTempMax;
                const diffSign = diffMax >= 0 ? '+' : '';
                const diffClass = diffMax >= 0 ? 'temp-diff-plus' : 'temp-diff-minus';
                lastYearHtml = `<div class="weather-last-year">昨年 <span class="temp-max">${weather.lastYearTempMax}°</span>/<span class="temp-min">${weather.lastYearTempMin}°</span> <span class="${diffClass}">(${diffSign}${diffMax}°)</span></div>`;
            }

            labelHTML += `<div class="weather-info" title="${weatherInfo.desc}">
                <span class="weather-icon">${weatherInfo.icon}</span>
                <span class="weather-temp"><span class="temp-max">${weather.tempMax}°</span>/<span class="temp-min">${weather.tempMin}°</span></span>
            </div>${lastYearHtml}`;
        }

        // 祝日表示を追加（holidayNameは上で既に取得済み）
        if (holidayName) {
            labelHTML += `<div class="holiday-mark" title="${holidayName}">🎌 ${holidayName}</div>`;
        }

        // 給料日・年金支給日マークを追加
        const payDayInfo = getPayDayInfo(date);
        if (payDayInfo.length > 0) {
            labelHTML += `<div class="payday-marks">${payDayInfo.map(p => 
                `<span class="payday-mark ${p.type}" title="${p.label}">${p.icon} ${p.shortLabel}</span>`
            ).join('')}</div>`;
        }

        // 臨時シフト（特別イベント日）表示
        const specialEventForDay = getSpecialEvent(dateStr);
        if (specialEventForDay) {
            labelHTML += `<div class="special-event-mark" title="${specialEventForDay.eventName || 'イベント'}">⚡ ${specialEventForDay.eventName || '臨時シフト'}</div>`;
            label.classList.add('is-special-event');
        }

        // この日のイベントを取得（期間内にある日付を含むイベント）
        const dayEvents = state.dailyEvents.filter(e => {
            const startDate = e.startDate || e.date; // 後方互換性
            const endDate = e.endDate || e.date;
            return dateStr >= startDate && dateStr <= endDate;
        });
        if (dayEvents.length > 0) {
            const eventIcons = getEventTypeIcons();
            let iconsHTML = '<div class="event-icons">';
            dayEvents.forEach(e => {
                const icon = eventIcons[e.type] || eventIcons.other;
                iconsHTML += `<span class="event-icon ${e.type}" data-date="${dateStr}" title="${e.title}">${icon}</span>`;
            });
            iconsHTML += '</div>';
            labelHTML += iconsHTML;
        }

        label.innerHTML = labelHTML;

        // イベントアイコンにクリックイベントを追加
        label.querySelectorAll('.event-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                showEventPopover(dateStr, e);
            });
            icon.addEventListener('touchend', (e) => {
                e.stopPropagation();
                e.preventDefault();
                showEventPopover(dateStr, e);
            }, { passive: false });
        });

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

        // 有給による上書きシフトのIDを取得
        const leaveOverrideFixedIds = state.shifts
            .filter(s => s.date === dateStr && s.isLeaveOverride && s.fixedShiftOverride)
            .map(s => s.fixedShiftOverride);

        // この日の単日上書きデータを取得
        const dayOverrides = state.shiftOverrides.filter(o => o.date === dateStr);

        // 臨時シフト：イベント日は固定シフトを停止
        const specialEvent = getSpecialEvent(dateStr);
        const isSpecialDay = specialEvent && specialEvent.suppressFixed !== false;
        // 固定シフト（ただし、同じ日・同じ時間帯に通常シフトがある場合は除外、有給上書きも除外）
        const fixed = state.fixedShifts.filter(f => {
            // 曜日チェック
            // イベント日は固定シフトを停止
            if (isSpecialDay) return false;
            if (f.dayOfWeek !== dayOfWeek) return false;
            // 有効期間チェック
            if (f.startDate && dateStr < f.startDate) return false;
            if (f.endDate && dateStr > f.endDate) return false;
            return true;
        }).map(f => {
            // 単日上書きがあるか確認
            const override = dayOverrides.find(o => o.fixedShiftId === f.id);
            if (override) {
                // 休日上書きの場合は休日バーとして表示
                if (override.isDayOff) {
                    return {
                        ...f,
                        id: `fx-${f.id}-${dateStr}`,
                        date: dateStr,
                        isFixed: true,
                        hasOverride: true,
                        isDayOff: true,
                        overrideId: override.id
                    };
                }
                // 上書きデータを適用
                return {
                    ...f,
                    ...override,
                    id: `fx-${f.id}-${dateStr}`,
                    date: dateStr,
                    isFixed: true,
                    hasOverride: true,
                    overrideId: override.id
                };
            }
            return {
                ...f, id: `fx-${f.id}-${dateStr}`, date: dateStr, isFixed: true
            };
        }).filter(f => {
            // 有給による上書きがある場合は除外
            if (leaveOverrideFixedIds.includes(f.id.replace(`fx-`, '').replace(`-${dateStr}`, ''))) {
                return false;
            }
            // 元のIDを取得（fx-xxx-dateStr形式から）
            const originalId = f.id.split('-')[1];
            if (leaveOverrideFixedIds.includes(originalId)) {
                return false;
            }
            // 同じ日・同じ固定シフトから交代された通常シフトがあるか確認
            return !dayShifts.some(s =>
                s.swapHistory &&
                s.startHour === f.startHour &&
                s.endHour === f.endHour &&
                s.swapHistory.previousName === f.name
            );
        });

        const prevDow = (dayOfWeek + 6) % 7;
        // 有給による上書きを夜勤継続分にも適用
        const leaveOverrideFixedIdsForOvernight = state.shifts
            .filter(s => s.date === prevStr && s.isLeaveOverride && s.fixedShiftOverride)
            .map(s => s.fixedShiftOverride);

        // 前日の単日上書きデータを取得
        const prevDayOverrides = state.shiftOverrides.filter(o => o.date === prevStr);
            
        const fixedOvernight = state.fixedShifts.filter(f => {
            // 曜日・夜勤チェック
            // 前日がイベント日の場合は固定夜勤継続も停止
            const prevSpecialEvent = getSpecialEvent(prevStr);
            if (prevSpecialEvent && prevSpecialEvent.suppressFixed !== false) return false;
            if (f.dayOfWeek !== prevDow || !f.overnight) return false;
            // 有効期間チェック（前日の日付でチェック）
            if (f.startDate && prevStr < f.startDate) return false;
            if (f.endDate && prevStr > f.endDate) return false;
            return true;
        }).map(f => {
            // 単日上書きがあるか確認
            const override = prevDayOverrides.find(o => o.fixedShiftId === f.id);
            // 休日上書きの場合は夜勤継続なし
            if (override && override.isDayOff) return null;
            if (override && override.overnight) {
                return {
                    ...f,
                    ...override,
                    id: `fxo-${f.id}-${dateStr}`,
                    date: dateStr,
                    startHour: 0,
                    endHour: override.endHour,
                    isFixed: true,
                    isOvernightContinuation: true,
                    hasOverride: true,
                    overrideId: override.id
                };
            }
            return {
                ...f, id: `fxo-${f.id}-${dateStr}`, date: dateStr, startHour: 0, endHour: f.endHour, isFixed: true, isOvernightContinuation: true
            };
        }).filter(f => {
            if (!f) return false;
            const originalId = f.id.split('-')[1];
            return !leaveOverrideFixedIdsForOvernight.includes(originalId);
        });

        // 通常シフトからhiddenフラグのものを除外
        const visibleDayShifts = dayShifts.filter(s => !s.hidden && !s.isLeaveOverride);
        const visibleOvernight = overnight.filter(s => !s.hidden && !s.isLeaveOverride);

        const all = [...visibleDayShifts, ...visibleOvernight, ...fixed, ...fixedOvernight];

        // 承認済みの休日（全日休み）がある担当者のシフトを除外
        const approvedHolidays = state.holidayRequests.filter(h => {
            if (h.status !== 'approved') return false;
            if (!(dateStr >= h.startDate && dateStr <= h.endDate)) return false;
            if (h.halfDayType) return false; // 半休は除外対象外
            
            // shiftTimesがある場合は、該当日のデータが存在するかチェック（最優先）
            if (h.shiftTimes && Object.keys(h.shiftTimes).length > 0) {
                return !!h.shiftTimes[dateStr];
            }
            // selectedShiftsがある場合は、該当日のシフトが存在するかチェック
            if (h.selectedShifts && h.selectedShifts.length > 0) {
                return h.selectedShifts.some(s => s.date === dateStr);
            }
            // どちらもない場合は従来の期間ベースの除外
            return true;
        });
        const holidayNames = approvedHolidays.map(h => h.name);

        // 承認済みの有給がある担当者のシフトも除外
        const approvedLeaves = state.leaveRequests.filter(l =>
            l.status === 'approved' &&
            dateStr >= l.startDate &&
            dateStr <= l.endDate
        );
        const leaveNames = approvedLeaves.map(l => l.name);

        // 全日休み・有給の担当者のシフトを除外したリスト
        const filteredAll = all.filter(s => !holidayNames.includes(s.name) && !leaveNames.includes(s.name));

        const levels = calculateShiftLevels(filteredAll);
        const maxLvl = Math.max(0, ...Object.values(levels));
        const baseH = 80, perLvl = 28;
        timeline.style.minHeight = `${baseH + maxLvl * perLvl}px`;

        filteredAll.forEach(s => timeline.appendChild(createShiftBar(s, levels[s.id])));

        // 有給
        const leaves = state.leaveRequests.filter(l => l.status === 'approved' && dateStr >= l.startDate && dateStr <= l.endDate);
        let barCount = leaves.length;
        leaves.forEach((l, idx) => {
            const bar = document.createElement('div');
            bar.className = 'leave-bar';
            bar.style.top = `${baseH + (maxLvl + 1 + idx) * perLvl}px`;
            bar.style.height = `${perLvl - 4}px`;
            
            // シフト時間情報がある場合は、その時間に合わせて表示
            let timeText = '';
            if (l.shiftTimes && l.shiftTimes[dateStr]) {
                const shiftTime = l.shiftTimes[dateStr];
                let start = shiftTime.startHour;
                let end = shiftTime.endHour;
                const overnight = shiftTime.overnight;
                
                // 夜勤の場合は24時まで表示（翌日分は翌日に表示）
                if (overnight) end = 24;
                
                const leftPercent = (start / 24) * 100;
                const widthPercent = ((end - start) / 24) * 100;
                bar.style.left = `${leftPercent}%`;
                bar.style.width = `${widthPercent}%`;
                
                if (overnight) {
                    timeText = ` ${formatTime(start)}-翌${formatTime(shiftTime.endHour)}`;
                } else {
                    timeText = ` ${formatTime(start)}-${formatTime(end)}`;
                }
            }
            // シフト時間情報がない場合は全幅で表示（従来の動作）
            
            bar.textContent = `🏖️ ${l.name} 有給${timeText}`;
            bar.dataset.leaveId = l.id;

            // 管理者のみクリック/タップで取り消し可能
            if (state.isAdmin) {
                bar.style.cursor = 'pointer';
                bar.title = 'クリックで有給を取り消し';
                const handleCancelLeave = () => {
                    if (confirm(`${l.name}さんの有給（${l.startDate}${l.startDate !== l.endDate ? `〜${l.endDate}` : ''}）を取り消しますか？\n\n※承認時に削除/上書きされたシフトを元に戻します。`)) {
                        cancelLeaveRequest(l.id);
                    }
                };
                bar.addEventListener('click', handleCancelLeave);
                bar.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCancelLeave();
                }, { passive: false });
            }

            timeline.appendChild(bar);
        });

        // 夜勤の有給の翌日分を表示
        const overnightLeaves = state.leaveRequests.filter(l => {
            if (l.status !== 'approved' || !l.shiftTimes) return false;
            // 前日の日付を取得
            const prevDate = new Date(dateStr);
            prevDate.setDate(prevDate.getDate() - 1);
            const prevDateStr = formatDate(prevDate);
            // 前日のシフトが夜勤で、前日が有給期間内かチェック
            return l.shiftTimes[prevDateStr] && 
                   l.shiftTimes[prevDateStr].overnight &&
                   prevDateStr >= l.startDate && 
                   prevDateStr <= l.endDate;
        });
        
        overnightLeaves.forEach((l, idx) => {
            const prevDate = new Date(dateStr);
            prevDate.setDate(prevDate.getDate() - 1);
            const prevDateStr = formatDate(prevDate);
            const shiftTime = l.shiftTimes[prevDateStr];
            
            const bar = document.createElement('div');
            bar.className = 'leave-bar overnight-continuation';
            bar.style.top = `${baseH + (maxLvl + 1 + barCount + idx) * perLvl}px`;
            bar.style.height = `${perLvl - 4}px`;
            
            // 0時から終了時刻まで表示
            const end = shiftTime.endHour;
            const leftPercent = 0;
            const widthPercent = (end / 24) * 100;
            bar.style.left = `${leftPercent}%`;
            bar.style.width = `${widthPercent}%`;
            
            bar.textContent = `🏖️ ${l.name} 有給 0:00-${formatTime(end)}`;
            bar.dataset.leaveId = l.id;

            // 管理者のみクリック/タップで取り消し可能（夜勤継続分も同じ申請を取り消す）
            if (state.isAdmin) {
                bar.style.cursor = 'pointer';
                bar.title = 'クリックで有給を取り消し';
                const handleCancelLeave = () => {
                    if (confirm(`${l.name}さんの有給（${l.startDate}${l.startDate !== l.endDate ? `〜${l.endDate}` : ''}）を取り消しますか？\n\n※承認時に削除/上書きされたシフトを元に戻します。`)) {
                        cancelLeaveRequest(l.id);
                    }
                };
                bar.addEventListener('click', handleCancelLeave);
                bar.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCancelLeave();
                }, { passive: false });
            }

            timeline.appendChild(bar);
        });
        barCount += overnightLeaves.length;

        // 休日
        const holidays = state.holidayRequests.filter(h => {
            if (h.status !== 'approved') return false;
            if (!(dateStr >= h.startDate && dateStr <= h.endDate)) return false;
            
            // shiftTimesがある場合は、該当日のデータが存在するかチェック（最優先）
            if (h.shiftTimes && Object.keys(h.shiftTimes).length > 0) {
                const hasTime = !!h.shiftTimes[dateStr];
                console.log(`[休日デバッグ] ${h.name} ${dateStr}: shiftTimes存在, 該当日=${hasTime}`, h.shiftTimes);
                return hasTime;
            }
            // selectedShiftsがある場合は、該当日のシフトが存在するかチェック
            if (h.selectedShifts && h.selectedShifts.length > 0) {
                const hasShift = h.selectedShifts.some(s => s.date === dateStr);
                console.log(`[休日デバッグ] ${h.name} ${dateStr}: selectedShifts存在, 該当日=${hasShift}`, h.selectedShifts);
                return hasShift;
            }
            // どちらもない場合は従来の期間ベースの表示
            console.log(`[休日デバッグ] ${h.name} ${dateStr}: shiftTimes/selectedShifts無し、期間ベース表示`);
            return true;
        });
        
        holidays.forEach((h, idx) => {
            const bar = document.createElement('div');

            // 半休タイプに応じてクラスを設定
            if (h.halfDayType === 'morning') {
                bar.className = 'holiday-bar half-day-bar morning';
            } else if (h.halfDayType === 'afternoon') {
                bar.className = 'holiday-bar half-day-bar afternoon';
            } else {
                bar.className = 'holiday-bar';
            }
            bar.dataset.holidayId = h.id;

            // シフト時間情報を取得（優先順位: shiftTimes[日付] > selectedShifts > 直接プロパティ）
            let shiftTimeInfo = null;
            
            // 1. shiftTimes から日付ごとの時間情報を取得
            if (h.shiftTimes && h.shiftTimes[dateStr]) {
                shiftTimeInfo = h.shiftTimes[dateStr];
                console.log(`[休日時間デバッグ] ${h.name} ${dateStr}: shiftTimesから取得`, shiftTimeInfo);
            }
            // 2. selectedShifts から該当日の時間情報を取得
            else if (h.selectedShifts && h.selectedShifts.length > 0) {
                const selectedShift = h.selectedShifts.find(s => s.date === dateStr);
                if (selectedShift) {
                    shiftTimeInfo = {
                        startHour: selectedShift.startHour,
                        endHour: selectedShift.endHour,
                        overnight: selectedShift.overnight || false
                    };
                    console.log(`[休日時間デバッグ] ${h.name} ${dateStr}: selectedShiftsから取得`, shiftTimeInfo);
                }
            }
            // 3. 直接プロパティから取得（従来の形式）
            else if (h.startHour !== undefined && h.endHour !== undefined) {
                shiftTimeInfo = {
                    startHour: h.startHour,
                    endHour: h.endHour,
                    overnight: h.overnight || false
                };
                console.log(`[休日時間デバッグ] ${h.name} ${dateStr}: 直接プロパティから取得`, shiftTimeInfo);
            } else {
                console.log(`[休日時間デバッグ] ${h.name} ${dateStr}: 時間情報なし`, h);
            }

            // シフト時間情報がある場合は、その時間に合わせて表示
            if (shiftTimeInfo) {
                let start = shiftTimeInfo.startHour;
                let end = shiftTimeInfo.endHour;
                // 夜勤の場合は24時まで表示
                if (shiftTimeInfo.overnight) end = 24;

                const leftPercent = (start / 24) * 100;
                const widthPercent = ((end - start) / 24) * 100;
                bar.style.left = `${leftPercent}%`;
                bar.style.width = `${widthPercent}%`;
            }
            // シフト時間情報がない場合は全幅で表示（従来の動作）

            bar.style.top = `${baseH + (maxLvl + 1 + barCount + idx) * perLvl}px`;
            bar.style.height = `${perLvl - 4}px`;

            // 時間表示を追加
            let timeText = '';
            if (shiftTimeInfo) {
                if (shiftTimeInfo.overnight) {
                    timeText = ` ${formatTime(shiftTimeInfo.startHour)}-翌${formatTime(shiftTimeInfo.endHour)}`;
                } else {
                    timeText = ` ${formatTime(shiftTimeInfo.startHour)}-${formatTime(shiftTimeInfo.endHour)}`;
                }
            }

            // 半休タイプに応じたラベル
            let label;
            if (h.halfDayType === 'morning') {
                label = `🌅 ${h.name} 午前半休${timeText}`;
            } else if (h.halfDayType === 'afternoon') {
                label = `🌇 ${h.name} 午後半休${timeText}`;
            } else {
                label = `🏠 ${h.name} 休日${timeText}`;
            }
            bar.textContent = label;

            // クリック/タップで削除
            bar.style.cursor = 'pointer';
            const deleteLabel = h.halfDayType ? '半休' : '休日';
            bar.title = `クリックで${deleteLabel}を取り消し`;

            const handleDeleteHoliday = () => {
                const typeLabel = h.halfDayType === 'morning' ? '午前半休' : (h.halfDayType === 'afternoon' ? '午後半休' : '休日');
                if (confirm(`${h.name}さんの${typeLabel}（${h.startDate}）を取り消しますか？`)) {
                    state.holidayRequests = state.holidayRequests.filter(x => x.id !== h.id);
                    saveToFirebase('holidayRequests', state.holidayRequests);
                    render();
                }
            };

            bar.addEventListener('click', handleDeleteHoliday);
            bar.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDeleteHoliday();
            }, { passive: false });

            timeline.appendChild(bar);
        });
        barCount += holidays.length;
        
        // 夜勤の休日の翌日分を表示
        const overnightHolidays = state.holidayRequests.filter(h => {
            if (h.status !== 'approved') return false;
            // 前日の日付を取得
            const prevDate = new Date(dateStr);
            prevDate.setDate(prevDate.getDate() - 1);
            const prevDateStr = formatDate(prevDate);
            
            // 前日が休日期間内かチェック
            if (!(prevDateStr >= h.startDate && prevDateStr <= h.endDate)) return false;
            
            // 前日のシフト時間情報を取得して夜勤かチェック
            let prevShiftTime = null;
            if (h.shiftTimes && h.shiftTimes[prevDateStr]) {
                prevShiftTime = h.shiftTimes[prevDateStr];
            } else if (h.selectedShifts && h.selectedShifts.length > 0) {
                const selectedShift = h.selectedShifts.find(s => s.date === prevDateStr);
                if (selectedShift) {
                    prevShiftTime = {
                        startHour: selectedShift.startHour,
                        endHour: selectedShift.endHour,
                        overnight: selectedShift.overnight || false
                    };
                }
            } else if (h.startHour !== undefined && h.overnight) {
                prevShiftTime = { startHour: h.startHour, endHour: h.endHour, overnight: h.overnight };
            }
            
            return prevShiftTime && prevShiftTime.overnight;
        });
        
        overnightHolidays.forEach((h, idx) => {
            const prevDate = new Date(dateStr);
            prevDate.setDate(prevDate.getDate() - 1);
            const prevDateStr = formatDate(prevDate);
            
            // 前日のシフト時間情報を取得
            let prevShiftTime = null;
            if (h.shiftTimes && h.shiftTimes[prevDateStr]) {
                prevShiftTime = h.shiftTimes[prevDateStr];
            } else if (h.selectedShifts && h.selectedShifts.length > 0) {
                const selectedShift = h.selectedShifts.find(s => s.date === prevDateStr);
                if (selectedShift) {
                    prevShiftTime = {
                        startHour: selectedShift.startHour,
                        endHour: selectedShift.endHour,
                        overnight: selectedShift.overnight || false
                    };
                }
            } else if (h.startHour !== undefined) {
                prevShiftTime = { startHour: h.startHour, endHour: h.endHour, overnight: h.overnight };
            }
            
            if (!prevShiftTime) return;
            
            const bar = document.createElement('div');
            bar.className = 'holiday-bar overnight-continuation';
            bar.style.top = `${baseH + (maxLvl + 1 + barCount + idx) * perLvl}px`;
            bar.style.height = `${perLvl - 4}px`;
            
            // 0時から終了時刻まで表示
            const end = prevShiftTime.endHour;
            const leftPercent = 0;
            const widthPercent = (end / 24) * 100;
            bar.style.left = `${leftPercent}%`;
            bar.style.width = `${widthPercent}%`;
            
            bar.textContent = `🏠 ${h.name} 休日 0:00-${formatTime(end)}`;
            timeline.appendChild(bar);
        });
        barCount += overnightHolidays.length;

        timeline.style.minHeight = `${baseH + (maxLvl + 1 + barCount) * perLvl}px`;

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

    // 休日上書きの場合は休日バーとして表示
    if (s.isDayOff) {
        bar.className = 'shift-bar day-off-bar';
        bar.dataset.id = s.id;
        // 元のシフト時間帯に合わせて表示
        let start = s.startHour, end = s.endHour;
        if (s.overnight) end = 24;
        const leftPercent = (start / 24) * 100;
        const widthPercent = ((end - start) / 24) * 100;
        bar.style.left = `${leftPercent}%`;
        bar.style.width = `${widthPercent}%`;
        bar.style.top = `${8 + lvl * 28}px`;
        bar.style.height = '24px';
        bar.style.background = 'linear-gradient(135deg, #9ca3af, #6b7280)';
        bar.style.opacity = '0.8';
        bar.innerHTML = `<span class="shift-name">🏖️ ${s.name} 休日</span>`;
        bar.title = 'この日のみ休日（単日変更）';

        // タップ・クリックでポップオーバーを表示（管理者のみ）
        bar.addEventListener('click', (e) => {
            if (!state.isAdmin) return;
            e.stopPropagation();
            showShiftPopover(s, bar, e);
        });
        bar.addEventListener('touchend', (e) => {
            if (!touchMoved && state.isAdmin) {
                e.preventDefault();
                e.stopPropagation();
                showShiftPopover(s, bar, e);
            }
        }, { passive: false });
        bar.addEventListener('touchstart', () => { touchMoved = false; }, { passive: true });
        bar.addEventListener('touchmove', () => { touchMoved = true; }, { passive: true });

        return bar;
    }

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
    // 色が正しく設定されているか確認し、不正な場合はデフォルト色を使用
    const shiftColor = (s.color && s.color.startsWith('#') && s.color.length >= 4) ? s.color : '#6366f1';
    bar.style.background = `linear-gradient(135deg, ${shiftColor}, ${adjustColor(shiftColor, -20)})`;

    let icons = '';
    if (s.changeHistory) icons += '<span class="change-icon" title="シフト変更あり">📝</span>';
    if (s.swapHistory) icons += '<span class="swap-icon" title="シフト交代あり">🤝</span>';
    if (s.hasOverride) icons += '<span class="override-icon" title="この日のみ変更">✏️</span>';
    if (s.isFixed && !s.hasOverride) icons += '<span class="fixed-icon">🔁</span>';
    if (s.overnight && !s.isOvernightContinuation) icons += '<span class="overnight-icon">🌙</span>';
    if (s.isOvernightContinuation) icons += '<span class="overnight-icon">→</span>';
    // 臨時シフト判定（イベント日のシフトにバッジを付ける）
    if (!s.isFixed && s.date && isSpecialEventDate(s.date)) {
        icons += '<span class="temporary-icon" title="臨時シフト">⚡</span>';
        bar.classList.add('temporary-shift');
    }

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

    // 業務内容（タスク）セグメントの描画
    let tasks = s.tasks || [];
    // 固定シフトの場合、元のfixedShiftからタスクを取得
    if (s.isFixed && !tasks.length) {
        const parts = s.id.split('-');
        const originalId = parts[1];
        const original = state.fixedShifts.find(function(f) { return f.id === originalId; });
        if (original && original.tasks && original.tasks.length > 0) {
            tasks = original.tasks;
        }
    }
    // 夜勤継続の場合、元のシフトからタスクを取得
    if (s.isOvernightContinuation && !tasks.length) {
        const origId = s.id.replace('on-', '').replace('fxo-', '');
        const origShift = state.shifts.find(function(x) { return x.id === origId; });
        if (origShift && origShift.tasks && origShift.tasks.length > 0) {
            tasks = origShift.tasks;
        }
    }

    if (tasks.length > 0) {
        bar.classList.add('has-tasks');
        bar.style.height = '28px';
        var shiftDuration = end - start;
        var headerHTML = '<div class="shift-bar-header">' + icons + '<span class="shift-name">' + s.name + '</span><span class="shift-time">' + time + '</span></div>';
        var tasksHTML = '<div class="shift-bar-tasks">';
        var sortedTasks = tasks.slice().sort(function(a, b) { return a.startHour - b.startHour; });
        // 夜勤継続バーの場合、タスク時間を-24して0時基準に調整
        var isOvernightCont = s.isOvernightContinuation;
        sortedTasks.forEach(function(t) {
            var taskStart = t.startHour;
            var taskEnd = t.endHour;
            if (isOvernightCont) {
                taskStart = taskStart >= 24 ? taskStart - 24 : taskStart;
                taskEnd = taskEnd >= 24 ? taskEnd - 24 : taskEnd;
            }
            var tStart = Math.max(taskStart, start);
            var tEnd = Math.min(taskEnd, end);
            if (tStart >= tEnd) return;
            var tLeftPct = ((tStart - start) / shiftDuration) * 100;
            var tWidthPct = ((tEnd - tStart) / shiftDuration) * 100;
            var tColor = t.color || '#10b981';
            tasksHTML += '<div class="task-segment" style="left:' + tLeftPct + '%;width:' + tWidthPct + '%;background:' + tColor + ';" title="' + t.name + ' (' + formatTaskTime(t.startHour) + '～' + formatTaskTime(t.endHour) + ')"><span class="task-segment-name">' + t.name + '</span></div>';
        });
        tasksHTML += '</div>';
        bar.innerHTML = headerHTML + tasksHTML;
    } else {
        bar.innerHTML = icons + '<span class="shift-name">' + s.name + '</span><span class="shift-time">' + time + '</span>';
    }

    // タッチ位置を保存するための変数
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    // クリックイベント（デスクトップ用）
    bar.addEventListener('click', e => {
        // シフト変更操作は管理者のみ
        if (!state.isAdmin) return;
        if (confirm('シフト内容を変更しますか？')) {
            showShiftPopover(s, e, bar);
        }
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

        // シフト変更操作は管理者のみ
        if (!state.isAdmin) return;

        e.preventDefault();
        e.stopPropagation();

        if (confirm('シフト内容を変更しますか？')) {
            showShiftPopover(s, {
                clientX: touchStartX,
                clientY: touchStartY,
                target: bar
            }, bar);
        }
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
            displayShift = { ...original, date: s.date, isFixed: true, hasOverride: s.hasOverride, overrideId: s.overrideId, isDayOff: s.isDayOff };
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
    if (s.isDayOff) {
        timeStr = '🏖️ この日は休日';
    } else if (displayShift.overnight && !s.isOvernightContinuation) {
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

    // 単日変更表示
    const overrideRow = document.getElementById('popoverOverrideRow');
    if (overrideRow) {
        overrideRow.style.display = s.hasOverride ? 'flex' : 'none';
        const overrideBadge = overrideRow.querySelector('.override-badge');
        if (overrideBadge) {
            overrideBadge.textContent = s.isDayOff ? '🏖️ この日のみ休日' : '📝 この日のみ変更済み';
        }
    }

    // 「この日のみ変更」ボタンの表示制御（固定シフトの場合のみ表示）
    const overrideBtn = document.getElementById('popoverOverrideBtn');
    if (overrideBtn) {
        overrideBtn.style.display = s.isFixed ? 'inline-block' : 'none';
        // すでに上書きがある場合はボタンテキストを変更
        if (s.hasOverride) {
            overrideBtn.textContent = '📝 単日変更を編集';
        } else {
            overrideBtn.textContent = '📝 この日のみ変更';
        }
    }

    // 「有給」ボタン行の表示制御（管理者のみ。休日上書き表示中は不可）
    const paidLeaveRow = document.getElementById('popoverPaidLeaveRow');
    if (paidLeaveRow) {
        paidLeaveRow.style.display = (state.isAdmin && !s.isDayOff) ? 'flex' : 'none';
    }

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
    // 色が正しくない場合はデフォルト色を使用
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#') || hex.length < 4) {
        hex = '#6366f1';
    }
    try {
        const n = parseInt(hex.slice(1), 16);
        if (isNaN(n)) return '#6366f1';
        const r = Math.min(255, Math.max(0, (n >> 16) + amt));
        const g = Math.min(255, Math.max(0, ((n >> 8) & 0xFF) + amt));
        const b = Math.min(255, Math.max(0, (n & 0xFF) + amt));
        return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
    } catch (e) {
        return '#6366f1';
    }
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
// 現在の役割で見えるべきメッセージか判定
// 管理者宛（to === '管理者'）のメッセージはスタッフモードでは非表示
function isMessageVisibleInCurrentRole(m) {
    if (m.to === '管理者' && !state.isAdmin) return false;
    return true;
}

function updateMessageBar() {
    const unreadCount = state.messages.filter(m => !m.read && isMessageVisibleInCurrentRole(m)).length;
    const swapCount = state.swapRequests.filter(r => r.status === 'pending').length;
    const cnt = unreadCount + swapCount;
    const bar = document.getElementById('messageBar'), num = document.getElementById('messageCount');
    if (cnt > 0) { bar.style.display = 'flex'; num.textContent = cnt; }
    else bar.style.display = 'none';
}

// CRUD操作
function addShift(d) { const s = { id: Date.now().toString(), ...d }; state.shifts.push(s); saveToFirebase('shifts', state.shifts); trackUsage('add_shift', d.name); }

// ========================================
// シフト内タスク（業務内容）管理
// ========================================
let currentTaskShiftId = null;
let currentTaskShiftType = null;
let selectedTaskColor = '#10b981';
let editingTaskId = null;

function getShiftForTask(shiftId) {
    let shift = state.shifts.find(s => s.id === shiftId);
    if (shift) return { shift, type: 'normal' };
    shift = state.fixedShifts.find(s => s.id === shiftId);
    if (shift) return { shift, type: 'fixed' };
    return null;
}

function getActualShiftId(popoverShift) {
    if (popoverShift.isFixed) {
        const parts = popoverShift.id.split('-');
        return { id: parts[1], type: 'fixed', date: popoverShift.date };
    } else if (popoverShift.isOvernightContinuation) {
        const originalId = popoverShift.id.replace('on-', '');
        return { id: originalId, type: 'normal', date: popoverShift.date };
    }
    return { id: popoverShift.id, type: 'normal', date: popoverShift.date };
}

function addTaskToShift(shiftId, shiftType, task) {
    const arr = shiftType === 'fixed' ? state.fixedShifts : state.shifts;
    const idx = arr.findIndex(s => s.id === shiftId);
    if (idx < 0) return;
    if (!arr[idx].tasks) arr[idx].tasks = [];
    task.id = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 5);
    arr[idx].tasks.push(task);
    saveToFirebase(shiftType === 'fixed' ? 'fixedShifts' : 'shifts', arr);
    render();
}

function updateTaskInShift(shiftId, shiftType, taskId, updates) {
    const arr = shiftType === 'fixed' ? state.fixedShifts : state.shifts;
    const idx = arr.findIndex(s => s.id === shiftId);
    if (idx < 0) return;
    if (!arr[idx].tasks) return;
    const tIdx = arr[idx].tasks.findIndex(t => t.id === taskId);
    if (tIdx < 0) return;
    arr[idx].tasks[tIdx] = { ...arr[idx].tasks[tIdx], ...updates };
    saveToFirebase(shiftType === 'fixed' ? 'fixedShifts' : 'shifts', arr);
    render();
}

function deleteTaskFromShift(shiftId, shiftType, taskId) {
    const arr = shiftType === 'fixed' ? state.fixedShifts : state.shifts;
    const idx = arr.findIndex(s => s.id === shiftId);
    if (idx < 0) return;
    if (!arr[idx].tasks) return;
    arr[idx].tasks = arr[idx].tasks.filter(t => t.id !== taskId);
    saveToFirebase(shiftType === 'fixed' ? 'fixedShifts' : 'shifts', arr);
    render();
}

function openTaskModal(popoverShift) {
    const actual = getActualShiftId(popoverShift);
    currentTaskShiftId = actual.id;
    currentTaskShiftType = actual.type;
    editingTaskId = null;
    selectedTaskColor = '#10b981';

    const result = getShiftForTask(actual.id);
    if (!result) { alert('シフトが見つかりません'); return; }
    const shift = result.shift;

    const infoEl = document.getElementById('taskShiftInfoText');
    const timeStr = shift.overnight ?
        formatTime(shift.startHour) + '～翌' + formatTime(shift.endHour) :
        formatTime(shift.startHour) + '～' + formatTime(shift.endHour);
    infoEl.textContent = shift.name + ' | ' + timeStr;

    populateTaskTimeSelects(shift.startHour, shift.overnight ? 24 + shift.endHour : shift.endHour);

    document.querySelectorAll('#taskColorPicker .task-color-option').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.color === selectedTaskColor);
    });

    document.getElementById('taskName').value = '';
    document.getElementById('addTaskBtn').textContent = '追加';

    renderTaskList();
    openModal(document.getElementById('taskModalOverlay'));
}

function populateTaskTimeSelects(shiftStart, shiftEnd) {
    var startSel = document.getElementById('taskStartHour');
    var endSel = document.getElementById('taskEndHour');
    startSel.innerHTML = '';
    endSel.innerHTML = '';

    // シフト時間に縛られず、0:00～翌12:00までの全時間帯を選択可能にする
    var rangeStart = 0;
    var rangeEnd = 36; // 翌12:00まで

    var defaultStartIdx = -1;
    var defaultEndIdx = -1;
    var startCount = 0;
    var endCount = 0;

    for (var h = rangeStart; h <= rangeEnd; h += 0.5) {
        var displayH = h >= 24 ? h - 24 : h;
        var prefix = h >= 24 ? '翌' : '';
        var hh = Math.floor(displayH);
        var mm = (displayH % 1 === 0.5) ? '30' : '00';
        var label = prefix + hh + ':' + mm;

        if (h < rangeEnd) {
            var opt1 = document.createElement('option');
            opt1.value = h;
            opt1.textContent = label;
            startSel.appendChild(opt1);
            if (h === shiftStart) defaultStartIdx = startCount;
            startCount++;
        }
        if (h > rangeStart) {
            var opt2 = document.createElement('option');
            opt2.value = h;
            opt2.textContent = label;
            endSel.appendChild(opt2);
            if (h === shiftEnd) defaultEndIdx = endCount;
            endCount++;
        }
    }

    // デフォルト選択：シフト開始時間を初期値にする
    if (defaultStartIdx >= 0) {
        startSel.selectedIndex = defaultStartIdx;
    }
    // デフォルト選択：シフト開始＋1.5時間 or シフト終了時間
    if (defaultEndIdx >= 0) {
        endSel.selectedIndex = Math.min(defaultEndIdx, endSel.options.length - 1);
    } else if (endSel.options.length > 0) {
        // シフト開始から3つ先（1.5時間後）をデフォルトに
        var targetEndIdx = (defaultStartIdx >= 0 ? defaultStartIdx + 3 : 2);
        endSel.selectedIndex = Math.min(targetEndIdx, endSel.options.length - 1);
    }
}

function renderTaskList() {
    var listEl = document.getElementById('taskList');
    var result = getShiftForTask(currentTaskShiftId);
    if (!result) { listEl.innerHTML = ''; return; }

    var tasks = result.shift.tasks || [];
    if (tasks.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px;font-size:0.9rem;">まだ業務内容が登録されていません</div>';
        return;
    }

    var sorted = tasks.slice().sort(function(a, b) { return a.startHour - b.startHour; });

    listEl.innerHTML = sorted.map(function(t) {
        var startStr = formatTaskTime(t.startHour);
        var endStr = formatTaskTime(t.endHour);
        return '<div class="task-list-item" style="border-left-color:' + (t.color || '#10b981') + ';">' +
            '<div class="task-item-info">' +
            '<div class="task-item-name">' + escapeHtmlTask(t.name) + '</div>' +
            '<div class="task-item-time">' + startStr + ' ～ ' + endStr + '</div>' +
            '</div>' +
            '<div class="task-item-actions">' +
            '<button class="task-edit-btn" onclick="startEditTask(\'' + t.id + '\')">✏️</button>' +
            '<button class="task-delete-btn" onclick="confirmDeleteTask(\'' + t.id + '\')">🗑️</button>' +
            '</div></div>';
    }).join('');
}

function formatTaskTime(h) {
    var displayH = h >= 24 ? h - 24 : h;
    var prefix = h >= 24 ? '翌' : '';
    var hh = Math.floor(displayH);
    var mm = (displayH % 1 === 0.5) ? '30' : '00';
    return prefix + hh + ':' + mm;
}

function escapeHtmlTask(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function startEditTask(taskId) {
    var result = getShiftForTask(currentTaskShiftId);
    if (!result) return;
    var task = (result.shift.tasks || []).find(function(t) { return t.id === taskId; });
    if (!task) return;

    editingTaskId = taskId;
    document.getElementById('taskName').value = task.name;
    document.getElementById('taskStartHour').value = task.startHour;
    document.getElementById('taskEndHour').value = task.endHour;
    selectedTaskColor = task.color || '#10b981';

    document.querySelectorAll('#taskColorPicker .task-color-option').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.color === selectedTaskColor);
    });
    document.getElementById('addTaskBtn').textContent = '更新';
}

function confirmDeleteTask(taskId) {
    if (confirm('この業務を削除しますか？')) {
        deleteTaskFromShift(currentTaskShiftId, currentTaskShiftType, taskId);
        renderTaskList();
    }
}

function handleAddOrUpdateTask() {
    var name = document.getElementById('taskName').value.trim();
    var startHour = parseFloat(document.getElementById('taskStartHour').value);
    var endHour = parseFloat(document.getElementById('taskEndHour').value);

    if (!name) { alert('業務名を入力してください'); return; }
    if (startHour >= endHour) { alert('終了時刻は開始時刻より後にしてください'); return; }

    var taskData = { name: name, startHour: startHour, endHour: endHour, color: selectedTaskColor };

    if (editingTaskId) {
        updateTaskInShift(currentTaskShiftId, currentTaskShiftType, editingTaskId, taskData);
        editingTaskId = null;
        document.getElementById('addTaskBtn').textContent = '追加';
    } else {
        addTaskToShift(currentTaskShiftId, currentTaskShiftType, taskData);
    }

    document.getElementById('taskName').value = '';
    renderTaskList();
}
function updateShift(id, d) { const i = state.shifts.findIndex(s => s.id === id); if (i >= 0) { state.shifts[i] = { ...state.shifts[i], ...d }; saveToFirebase('shifts', state.shifts); trackUsage('edit_shift', d.name || state.shifts[i]?.name); } }
function addFixedShift(d) { 
    const s = { 
        id: Date.now().toString(), 
        dayOfWeek: getDayOfWeek(d.date), 
        name: d.name,
        startHour: d.startHour,
        endHour: d.endHour,
        color: d.color,
        overnight: d.overnight,
        startDate: d.fixedStartDate || null,
        endDate: d.fixedEndDate || null,
        createdAt: new Date().toISOString()
    }; 
    state.fixedShifts.push(s); 
    saveToFirebase('fixedShifts', state.fixedShifts); 
    trackUsage('add_shift', d.name); 
}
function deleteShift(id) { const shift = state.shifts.find(s => s.id === id); state.shifts = state.shifts.filter(s => s.id !== id); saveToFirebase('shifts', state.shifts); trackUsage('delete_shift', shift?.name); }
function deleteFixedShift(id) { const shift = state.fixedShifts.find(s => s.id === id); state.fixedShifts = state.fixedShifts.filter(s => s.id !== id); saveToFirebase('fixedShifts', state.fixedShifts); trackUsage('delete_shift', shift?.name); }
function updateFixedShift(id, d) {
    const i = state.fixedShifts.findIndex(s => s.id === id);
    if (i >= 0) {
        const updated = { 
            ...state.fixedShifts[i], 
            name: d.name,
            startHour: d.startHour,
            endHour: d.endHour,
            color: d.color,
            overnight: d.overnight,
            dayOfWeek: getDayOfWeek(d.date),
            updatedAt: new Date().toISOString()
        };
        // 有効期間が指定されている場合のみ更新
        if (d.fixedStartDate !== undefined) updated.startDate = d.fixedStartDate;
        if (d.fixedEndDate !== undefined) updated.endDate = d.fixedEndDate;
        state.fixedShifts[i] = updated;
        saveToFirebase('fixedShifts', state.fixedShifts);
        trackUsage('edit_shift', d.name);
    }
}

// 単日上書き CRUD操作
function addShiftOverride(d) {
    const override = { id: Date.now().toString(), createdAt: new Date().toISOString(), ...d };
    state.shiftOverrides.push(override);
    saveToFirebase('shiftOverrides', state.shiftOverrides);
}

function updateShiftOverride(id, d) {
    const i = state.shiftOverrides.findIndex(o => o.id === id);
    if (i >= 0) {
        state.shiftOverrides[i] = { ...state.shiftOverrides[i], ...d, updatedAt: new Date().toISOString() };
        saveToFirebase('shiftOverrides', state.shiftOverrides);
    }
}

function deleteShiftOverride(id) {
    state.shiftOverrides = state.shiftOverrides.filter(o => o.id !== id);
    saveToFirebase('shiftOverrides', state.shiftOverrides);
}
function addChangeRequest(d) {
    const r = { id: Date.now().toString(), status: 'pending', createdAt: new Date().toISOString(), ...d };
    state.changeRequests.push(r);
    saveToFirebase('changeRequests', state.changeRequests);
    trackUsage('request_change', d.applicant);

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

// 有給申請（互換性維持用の単一関数）
function addLeaveRequest(d) { 
    const r = { id: Date.now().toString(), status: 'pending', createdAt: new Date().toISOString(), ...d }; 
    state.leaveRequests.push(r); 
    saveToFirebase('leaveRequests', state.leaveRequests); 
    trackUsage('request_leave', d.name); 
}

// 複数シフトの有給申請
function addLeaveRequestMultiple(name, selectedShifts) {
    const shiftsInfo = selectedShifts.map(s => ({
        date: s.date,
        startHour: s.startHour,
        endHour: s.endHour,
        overnight: s.overnight || false,
        isFixed: s.isFixed || false,
        fixedShiftId: s.fixedShiftId || null
    }));
    
    // 日付でソート
    shiftsInfo.sort((a, b) => a.date.localeCompare(b.date));
    
    // 開始日と終了日を取得
    const startDate = shiftsInfo[0].date;
    const endDate = shiftsInfo[shiftsInfo.length - 1].date;
    
    const r = {
        id: Date.now().toString(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        name: name,
        startDate: startDate,
        endDate: endDate,
        selectedShifts: shiftsInfo,
        reason: '有給休暇'
    };
    
    state.leaveRequests.push(r);
    saveToFirebase('leaveRequests', state.leaveRequests);
    trackUsage('request_leave', name);
    
    // 管理者に通知
    const title = '🏖️ 有給申請';
    const shiftDates = shiftsInfo.map(s => {
        const d = new Date(s.date);
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        return `${d.getMonth() + 1}/${d.getDate()}（${dayNames[d.getDay()]}）${formatTime(s.startHour)}-${formatTime(s.endHour)}`;
    }).join('\n');
    const content = `${name}さんから有給申請がありました。\n\n【申請シフト】\n${shiftDates}`;
    state.messages.push({ id: Date.now().toString() + '_admin', to: '管理者', from: name, title, content, createdAt: new Date().toISOString(), read: false });
    saveToFirebase('messages', state.messages);
}

// 複数シフトの休日申請
function addHolidayRequestMultiple(name, selectedShifts, options) {
    const shiftsInfo = selectedShifts.map(s => ({
        date: s.date,
        startHour: options.customStartTime ? parseFloat(options.customStartTime) : s.startHour,
        endHour: options.customEndTime ? parseFloat(options.customEndTime) : s.endHour,
        originalStartHour: s.startHour,
        originalEndHour: s.endHour,
        overnight: s.overnight || false,
        isFixed: s.isFixed || false,
        fixedShiftId: s.fixedShiftId || null
    }));
    
    // 日付でソート
    shiftsInfo.sort((a, b) => a.date.localeCompare(b.date));
    
    // 開始日と終了日を取得
    const startDate = shiftsInfo[0].date;
    const endDate = shiftsInfo[shiftsInfo.length - 1].date;
    
    const r = {
        id: Date.now().toString(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        name: name,
        startDate: startDate,
        endDate: endDate,
        selectedShifts: shiftsInfo,
        swapRequested: options.swapRequested,
        swapPartner: options.swapPartner,
        reason: options.reason,
        hasCustomTime: !!(options.customStartTime || options.customEndTime)
    };
    
    state.holidayRequests.push(r);
    saveToFirebase('holidayRequests', state.holidayRequests);
    trackUsage('request_holiday', name);
    
    // 管理者に通知
    const title = '🏠 休日申請';
    const shiftDates = shiftsInfo.map(s => {
        const d = new Date(s.date);
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        return `${d.getMonth() + 1}/${d.getDate()}（${dayNames[d.getDay()]}）${formatTime(s.startHour)}-${formatTime(s.endHour)}`;
    }).join('\n');
    let content = `${name}さんから休日申請がありました。\n\n【申請シフト】\n${shiftDates}\n\n理由: ${options.reason}`;
    if (options.swapRequested && options.swapPartner) {
        content += `\nシフト交代: ${options.swapPartner}さんと交代`;
    }
    state.messages.push({ id: Date.now().toString() + '_admin', to: '管理者', from: name, title, content, createdAt: new Date().toISOString(), read: false });
    saveToFirebase('messages', state.messages);
}

// 有給申請用のシフトリストを更新
function updateLeaveShiftList() {
    const name = document.getElementById('leaveName').value;
    const container = document.getElementById('leaveShiftList');
    
    if (!name) {
        container.innerHTML = '<p class="no-shift-message">申請者を選択してください</p>';
        return;
    }
    
    const shifts = getEmployeeShiftsForPeriod(name, 4); // 4週間分
    
    if (shifts.length === 0) {
        container.innerHTML = '<p class="no-shift-message">該当するシフトがありません</p>';
        return;
    }
    
    container.innerHTML = shifts.map(s => {
        const d = new Date(s.date);
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        const dayColor = d.getDay() === 0 ? '#ef4444' : (d.getDay() === 6 ? '#3b82f6' : '#f8fafc');
        const badges = [];
        if (s.isFixed) badges.push('<span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; background: #f59e0b; color: white; flex-shrink: 0; margin-left: auto;">固定</span>');
        if (s.overnight) badges.push('<span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; background: #6366f1; color: white; flex-shrink: 0; margin-left: auto;">夜勤</span>');
        
        const shiftInfo = JSON.stringify(s).replace(/"/g, '&quot;');
        const dateText = `${d.getMonth() + 1}/${d.getDate()}（${dayNames[d.getDay()]}）`;
        const timeText = `${formatTime(s.startHour)} 〜 ${formatTime(s.endHour)}${s.overnight ? ' （翌日）' : ''}`;
        
        return `
            <div class="shift-selection-item" data-shift-info="${shiftInfo}" onclick="toggleShiftSelection(this)" style="display: flex; align-items: center; gap: 12px; padding: 12px; margin-bottom: 8px; background: #1e293b; border-radius: 6px; border: 1px solid rgba(148, 163, 184, 0.2); cursor: pointer; width: 100%; box-sizing: border-box;">
                <input type="checkbox" class="shift-selection-checkbox" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; flex-shrink: 0; padding: 0; margin: 0; cursor: pointer;">
                <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;">
                    <span style="font-weight: 600; font-size: 0.95rem; color: ${dayColor}; display: block;">${dateText}</span>
                    <span style="font-size: 0.9rem; color: #94a3b8; display: block;">${timeText}</span>
                </div>
                ${badges.join('')}
            </div>
        `;
    }).join('');
}

// 休日申請用のシフトリストを更新
function updateHolidayShiftList() {
    const name = document.getElementById('holidayName').value;
    const container = document.getElementById('holidayShiftList');
    const timeRangeGroup = document.getElementById('holidayTimeRangeGroup');
    
    if (!name) {
        container.innerHTML = '<p class="no-shift-message">申請者を選択してください</p>';
        timeRangeGroup.style.display = 'none';
        return;
    }
    
    const shifts = getEmployeeShiftsForPeriod(name, 4); // 4週間分
    
    if (shifts.length === 0) {
        container.innerHTML = '<p class="no-shift-message">該当するシフトがありません</p>';
        timeRangeGroup.style.display = 'none';
        return;
    }
    
    container.innerHTML = shifts.map(s => {
        const d = new Date(s.date);
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        const dayColor = d.getDay() === 0 ? '#ef4444' : (d.getDay() === 6 ? '#3b82f6' : '#f8fafc');
        const badges = [];
        if (s.isFixed) badges.push('<span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; background: #f59e0b; color: white; flex-shrink: 0; margin-left: auto;">固定</span>');
        if (s.overnight) badges.push('<span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; background: #6366f1; color: white; flex-shrink: 0; margin-left: auto;">夜勤</span>');
        
        const shiftInfo = JSON.stringify(s).replace(/"/g, '&quot;');
        const dateText = `${d.getMonth() + 1}/${d.getDate()}（${dayNames[d.getDay()]}）`;
        const timeText = `${formatTime(s.startHour)} 〜 ${formatTime(s.endHour)}${s.overnight ? ' （翌日）' : ''}`;
        
        return `
            <div class="shift-selection-item" data-shift-info="${shiftInfo}" onclick="toggleShiftSelection(this, 'holiday')" style="display: flex; align-items: center; gap: 12px; padding: 12px; margin-bottom: 8px; background: #1e293b; border-radius: 6px; border: 1px solid rgba(148, 163, 184, 0.2); cursor: pointer; width: 100%; box-sizing: border-box;">
                <input type="checkbox" class="shift-selection-checkbox" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; flex-shrink: 0; padding: 0; margin: 0; cursor: pointer;">
                <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;">
                    <span style="font-weight: 600; font-size: 0.95rem; color: ${dayColor}; display: block;">${dateText}</span>
                    <span style="font-size: 0.9rem; color: #94a3b8; display: block;">${timeText}</span>
                </div>
                ${badges.join('')}
            </div>
        `;
    }).join('');
    
    // 時間帯選択を表示
    timeRangeGroup.style.display = 'block';
    updateHolidayTimeOptions();
}

// シフト選択の切り替え
function toggleShiftSelection(element, type) {
    const checkbox = element.querySelector('.shift-selection-checkbox');
    checkbox.checked = !checkbox.checked;
    element.classList.toggle('selected', checkbox.checked);
    
    // 休日申請の場合、時間選択を更新
    if (type === 'holiday') {
        updateHolidayTimeOptions();
    }
}

// 休日申請の時間選択オプションを更新
function updateHolidayTimeOptions() {
    const startSelect = document.getElementById('holidayStartTime');
    const endSelect = document.getElementById('holidayEndTime');
    
    // 選択されたシフトを取得
    const selectedItems = document.querySelectorAll('#holidayShiftList .shift-selection-checkbox:checked');
    
    if (selectedItems.length === 0) {
        startSelect.innerHTML = '<option value="">シフト開始時刻</option>';
        endSelect.innerHTML = '<option value="">シフト終了時刻</option>';
        return;
    }
    
    // 最初に選択されたシフトを基準にする
    const firstItem = selectedItems[0].closest('.shift-selection-item');
    const shiftData = JSON.parse(firstItem.dataset.shiftInfo);
    
    // 開始時刻の選択肢を生成
    startSelect.innerHTML = '<option value="">シフト開始時刻</option>';
    for (let h = shiftData.startHour; h < shiftData.endHour; h += 0.5) {
        startSelect.innerHTML += `<option value="${h}">${formatTime(h)}</option>`;
    }
    
    // 終了時刻の選択肢を生成
    endSelect.innerHTML = '<option value="">シフト終了時刻</option>';
    for (let h = shiftData.startHour + 0.5; h <= shiftData.endHour; h += 0.5) {
        endSelect.innerHTML += `<option value="${h}">${formatTime(h)}</option>`;
    }
}

// 従業員のシフトを期間分取得
function getEmployeeShiftsForPeriod(employeeName, weeks) {
    const shifts = [];
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + (weeks * 7));
    
    // 通常シフトを収集
    state.shifts.forEach(s => {
        if (s.name === employeeName && !s.hidden && !s.isLeaveOverride) {
            const shiftDate = new Date(s.date);
            if (shiftDate >= today && shiftDate <= endDate) {
                shifts.push({
                    date: s.date,
                    startHour: s.startHour,
                    endHour: s.endHour,
                    overnight: s.overnight || false,
                    isFixed: false,
                    shiftId: s.id
                });
            }
        }
    });
    
    // 固定シフトを収集（今日から指定週間分）
    const currentDate = new Date(today);
    while (currentDate <= endDate) {
        const dateStr = formatDate(currentDate);
        const dayOfWeek = currentDate.getDay();
        
        // この日に既に通常シフトがあるか確認
        const hasNormalShift = shifts.some(s => s.date === dateStr);
        
        if (!hasNormalShift) {
            // 臨時シフト日は固定シフトをスキップ
            const isSpecialDay = isSpecialEventDate(dateStr);
            if (isSpecialDay) { currentDate.setDate(currentDate.getDate() + 1); continue; }
            // 固定シフトを探す
            state.fixedShifts.forEach(f => {
                if (f.name === employeeName && f.dayOfWeek === dayOfWeek) {
                    // 有給や休日で上書きされていないか確認
                    const isOverridden = state.shifts.some(s => 
                        s.date === dateStr && 
                        s.fixedShiftOverride === f.id && 
                        (s.isLeaveOverride || s.hidden)
                    );
                    
                    if (!isOverridden) {
                        // 単日上書きがあるか確認
                        const override = state.shiftOverrides.find(o => o.fixedShiftId === f.id && o.date === dateStr);

                        // 休日上書きの場合は休日として追加
                        if (override && override.isDayOff) {
                            shifts.push({
                                date: dateStr,
                                startHour: f.startHour,
                                endHour: f.endHour,
                                overnight: f.overnight || false,
                                isFixed: true,
                                fixedShiftId: f.id,
                                isDayOff: true
                            });
                            return;
                        }

                        shifts.push({
                            date: dateStr,
                            startHour: override ? override.startHour : f.startHour,
                            endHour: override ? override.endHour : f.endHour,
                            overnight: override ? (override.overnight || false) : (f.overnight || false),
                            isFixed: true,
                            fixedShiftId: f.id
                        });
                    }
                }
            });
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // 日付でソート
    shifts.sort((a, b) => a.date.localeCompare(b.date));
    
    return shifts;
}

function addSwapRequest(d) {
    const r = { id: Date.now().toString(), status: 'pending', createdAt: new Date().toISOString(), ...d };
    state.swapRequests.push(r);
    saveToFirebase('swapRequests', state.swapRequests);
    trackUsage('request_swap', d.applicant);

    // シフト情報を取得（固定シフトの場合も対応）
    let shiftInfo = null;
    if (d.shiftId && d.shiftId.startsWith('fx-')) {
        // 固定シフトの場合: fx-{originalId}-{dateStr} 形式
        const parts = d.shiftId.split('-');
        const originalId = parts[1];
        const dateStr = parts.slice(2).join('-');
        const fixed = state.fixedShifts.find(f => f.id === originalId);
        if (fixed) {
            shiftInfo = { date: dateStr, startHour: fixed.startHour, endHour: fixed.endHour, name: fixed.name };
        }
    } else {
        const shift = state.shifts.find(s => s.id === d.shiftId);
        if (shift) {
            shiftInfo = { date: shift.date, startHour: shift.startHour, endHour: shift.endHour, name: shift.name };
        }
    }

    // 交代相手にメッセージを送信（管理者は管理者パネルで確認できるため通知しない）
    if (shiftInfo) {
        const title = '🤝 シフト交代依頼';
        const timeDisplay = `${formatTime(shiftInfo.startHour)}-${formatTime(shiftInfo.endHour)}`;
        const content = `${d.applicant}さんから${d.targetEmployee}さんへシフト交代依頼がありました。\nシフト: ${shiftInfo.date} ${timeDisplay}\n現在の担当: ${shiftInfo.name}\n交代先: ${d.targetEmployee}\nメッセージ: ${d.message}`;

        // 交代相手に通知
        state.messages.push({ id: Date.now().toString() + '_target', to: d.targetEmployee, from: d.applicant, title, content, createdAt: new Date().toISOString(), read: false });

        saveToFirebase('messages', state.messages);
    }
}
function addEmployee(d) { const e = { id: Date.now().toString(), ...d }; state.employees.push(e); saveToFirebase('employees', state.employees); }
function deleteEmployee(id) { state.employees = state.employees.filter(e => e.id !== id); saveToFirebase('employees', state.employees); }
function updateEmployee(id, d) {
    const i = state.employees.findIndex(e => e.id === id);
    if (i >= 0) {
        state.employees[i] = { ...state.employees[i], ...d };
        saveToFirebase('employees', state.employees);
    }
}

// ====== 臨時シフト（特別イベント）管理 ======
function addSpecialEvent(d) {
    const e = { id: Date.now().toString(), createdAt: new Date().toISOString(), ...d };
    state.specialEvents.push(e);
    saveToFirebase('specialEvents', state.specialEvents);
    trackUsage('add_special_event', d.name || '管理者');
}

function updateSpecialEvent(id, d) {
    const i = state.specialEvents.findIndex(e => e.id === id);
    if (i >= 0) {
        state.specialEvents[i] = { ...state.specialEvents[i], ...d };
        saveToFirebase('specialEvents', state.specialEvents);
    }
}

function deleteSpecialEvent(id) {
    state.specialEvents = state.specialEvents.filter(e => e.id !== id);
    saveToFirebase('specialEvents', state.specialEvents);
}

// 指定日がイベント日かチェック
function isSpecialEventDate(dateStr) {
    return state.specialEvents.some(e => e.date === dateStr);
}

// 指定日のイベント情報を取得
function getSpecialEvent(dateStr) {
    return state.specialEvents.find(e => e.date === dateStr);
}

// 臨時シフト管理画面をレンダリング
function renderSpecialEventManagement(container) {
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    
    // イベントを日付でソート
    const sortedEvents = [...state.specialEvents].sort((a, b) => a.date.localeCompare(b.date));
    const today = formatDate(new Date());
    const upcomingEvents = sortedEvents.filter(e => e.date >= today);
    const pastEvents = sortedEvents.filter(e => e.date < today);
    
    let html = `
        <div style="padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #f8fafc;">⚡ 臨時シフト管理</h3>
                <button class="btn btn-primary btn-sm" onclick="openSpecialEventModal()">＋ イベント日を追加</button>
            </div>
            <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 16px;">
                イベント日を登録すると、その日の固定シフトが自動停止され、臨時シフトのみが表示されます。<br>
                臨時シフトは通常の「シフト追加」から登録してください（自動的に臨時マークが付きます）。
            </p>
    `;
    
    // 今後のイベント
    html += `<h4 style="color: #f59e0b; margin-bottom: 8px;">📅 今後のイベント (${upcomingEvents.length}件)</h4>`;
    if (upcomingEvents.length === 0) {
        html += `<p style="color: #64748b; padding: 12px; text-align: center;">予定されているイベントはありません</p>`;
    } else {
        upcomingEvents.forEach(e => {
            const d = new Date(e.date);
            const dayColor = d.getDay() === 0 ? '#ef4444' : (d.getDay() === 6 ? '#3b82f6' : '#f8fafc');
            const dateDisplay = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${dayNames[d.getDay()]}）`;
            
            // この日のシフト数をカウント
            const dayShiftCount = state.shifts.filter(s => s.date === e.date && !s.hidden && !s.isLeaveOverride).length;
            
            html += `
                <div style="background: #1e293b; border: 1px solid #f59e0b40; border-radius: 8px; padding: 14px; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                <span style="font-size: 1.2rem;">⚡</span>
                                <span style="font-weight: 700; font-size: 1rem; color: ${dayColor};">${dateDisplay}</span>
                            </div>
                            <div style="font-weight: 600; color: #f8fafc; font-size: 0.95rem; margin-bottom: 4px;">${e.eventName || 'イベント'}</div>
                            ${e.description ? `<div style="color: #94a3b8; font-size: 0.85rem;">${e.description}</div>` : ''}
                            <div style="margin-top: 6px; display: flex; gap: 8px; align-items: center;">
                                <span style="font-size: 0.8rem; padding: 2px 8px; border-radius: 10px; background: ${e.suppressFixed !== false ? '#dc262640' : '#22c55e40'}; color: ${e.suppressFixed !== false ? '#f87171' : '#4ade80'};">
                                    固定シフト: ${e.suppressFixed !== false ? '停止' : '有効'}
                                </span>
                                <span style="font-size: 0.8rem; color: #64748b;">臨時シフト: ${dayShiftCount}件</span>
                            </div>
                        </div>
                        <div style="display: flex; gap: 6px;">
                            <button class="btn btn-sm" style="background: #334155; color: #94a3b8; border: 1px solid #475569; padding: 4px 10px; font-size: 0.8rem;" onclick="openEditSpecialEventModal('${e.id}')">編集</button>
                            <button class="btn btn-sm" style="background: #7f1d1d40; color: #f87171; border: 1px solid #7f1d1d; padding: 4px 10px; font-size: 0.8rem;" onclick="if(confirm('このイベントを削除しますか？\\n※臨時シフトは削除されません')){deleteSpecialEvent('${e.id}')}">削除</button>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    // 過去のイベント
    if (pastEvents.length > 0) {
        html += `<h4 style="color: #64748b; margin-top: 16px; margin-bottom: 8px;">📋 過去のイベント (${pastEvents.length}件)</h4>`;
        pastEvents.slice(-5).reverse().forEach(e => {
            const d = new Date(e.date);
            const dateDisplay = `${d.getMonth() + 1}/${d.getDate()}（${dayNames[d.getDay()]}）`;
            html += `
                <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 10px 14px; margin-bottom: 6px; opacity: 0.7;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <span style="color: #64748b;">${dateDisplay}</span>
                            <span style="color: #94a3b8; margin-left: 8px;">${e.eventName || 'イベント'}</span>
                        </div>
                        <button class="btn btn-sm" style="background: transparent; color: #64748b; border: 1px solid #334155; padding: 2px 8px; font-size: 0.75rem;" onclick="if(confirm('削除しますか？')){deleteSpecialEvent('${e.id}')}">削除</button>
                    </div>
                </div>
            `;
        });
    }
    
    html += `</div>`;
    container.innerHTML = html;
}

// 臨時イベント追加モーダルを開く
function openSpecialEventModal() {
    document.getElementById('specialEventModalTitle').textContent = '⚡ イベント日を追加';
    document.getElementById('specialEventSubmitBtn').textContent = '追加';
    document.getElementById('editSpecialEventId').value = '';
    document.getElementById('specialEventDate').value = formatDate(new Date());
    document.getElementById('specialEventName').value = '';
    document.getElementById('specialEventDescription').value = '';
    document.getElementById('suppressFixedShifts').checked = true;
    openModal(document.getElementById('specialEventModalOverlay'));
}

// 臨時イベント編集モーダルを開く
function openEditSpecialEventModal(id) {
    const e = state.specialEvents.find(x => x.id === id);
    if (!e) return;
    document.getElementById('specialEventModalTitle').textContent = '⚡ イベント日を編集';
    document.getElementById('specialEventSubmitBtn').textContent = '更新';
    document.getElementById('editSpecialEventId').value = id;
    document.getElementById('specialEventDate').value = e.date;
    document.getElementById('specialEventName').value = e.eventName || '';
    document.getElementById('specialEventDescription').value = e.description || '';
    document.getElementById('suppressFixedShifts').checked = e.suppressFixed !== false;
    openModal(document.getElementById('specialEventModalOverlay'));
}

// 従業員編集モーダルを開く
function openEditEmployeeModal(id) {
    const emp = state.employees.find(e => e.id === id);
    if (!emp) return;

    // モーダルタイトルとボタンテキストを変更
    document.getElementById('employeeModalTitle').textContent = '👤 従業員編集';
    document.getElementById('employeeSubmitBtn').textContent = '更新';
    document.getElementById('editEmployeeId').value = id;

    // フォームに現在の値をセット
    document.getElementById('employeeName').value = emp.name || '';
    document.getElementById('employeeRole').value = emp.role || 'staff';
    document.getElementById('employeeShiftTime').value = emp.shiftTime || 'day';

    // 発注担当分類のチェックボックスをリセットして現在の値をセット
    document.querySelectorAll('input[name="orderCategory"]').forEach(cb => {
        cb.checked = emp.orderCategories && emp.orderCategories.includes(cb.value);
    });

    // モーダルを開く
    openModal(document.getElementById('employeeModalOverlay'));
}

// 従業員追加モーダルを開く（リセット用）
function openAddEmployeeModal() {
    // モーダルタイトルとボタンテキストをリセット
    document.getElementById('employeeModalTitle').textContent = '👤 従業員追加';
    document.getElementById('employeeSubmitBtn').textContent = '追加';
    document.getElementById('editEmployeeId').value = '';

    // フォームをリセット
    document.getElementById('employeeName').value = '';
    document.getElementById('employeeRole').value = 'staff';
    document.getElementById('employeeShiftTime').value = 'day';

    // 発注担当分類のチェックボックスをリセット
    document.querySelectorAll('input[name="orderCategory"]').forEach(cb => {
        cb.checked = false;
    });

    // モーダルを開く
    openModal(document.getElementById('employeeModalOverlay'));
}

function addHolidayRequest(d) {
    const r = { id: Date.now().toString(), status: 'pending', createdAt: new Date().toISOString(), ...d };
    state.holidayRequests.push(r);
    saveToFirebase('holidayRequests', state.holidayRequests);
    trackUsage('request_holiday', d.name);

    // 管理者に通知
    const title = '🏠 休日申請';
    let content = `${d.name}さんから休日申請がありました。\n期間: ${d.startDate} 〜 ${d.endDate}\n理由: ${d.reason}`;
    if (d.swapRequested && d.swapPartner) {
        content += `\nシフト交代: ${d.swapPartner}さんと交代`;
    }
    state.messages.push({ id: Date.now().toString() + '_admin', to: '管理者', from: d.name, title, content, createdAt: new Date().toISOString(), read: false });
    saveToFirebase('messages', state.messages);
}

// 半休を作成する関数
function createHalfDayOff(s, halfDayType) {
    // シフトの担当者名と日付を取得
    let name, date, startHour, endHour, overnight;

    if (s.isFixed) {
        const parts = s.id.split('-');
        const originalId = parts[1];
        const fixed = state.fixedShifts.find(f => f.id === originalId);
        if (fixed) {
            name = fixed.name;
            date = s.date;
            startHour = fixed.startHour;
            endHour = fixed.endHour;
            overnight = fixed.overnight || false;
        }
    } else if (s.isOvernightContinuation && s.id.startsWith('on-')) {
        const originalId = s.id.replace('on-', '');
        const original = state.shifts.find(x => x.id === originalId);
        if (original) {
            name = original.name;
            date = original.date;
            startHour = original.startHour;
            endHour = original.endHour;
            overnight = original.overnight || false;
        }
    } else {
        name = s.name;
        date = s.date;
        startHour = s.startHour;
        endHour = s.endHour;
        overnight = s.overnight || false;
    }

    if (!name || !date) {
        alert('シフト情報の取得に失敗しました。');
        return;
    }

    // 半休の時間を計算（12時を境界とする）
    let halfStartHour, halfEndHour;
    if (halfDayType === 'morning') {
        // 午前半休: シフト開始〜12:00 を休みにする
        halfStartHour = Math.min(startHour, 12);
        halfEndHour = 12;
    } else {
        // 午後半休: 12:00〜シフト終了 を休みにする
        halfStartHour = 12;
        halfEndHour = Math.max(endHour, 12);
        // 夜勤で翌日にまたがる場合
        if (overnight) {
            halfEndHour = 24;
        }
    }

    // 承認済みの半休リクエストを作成
    const holidayRequest = {
        id: Date.now().toString(),
        name: name,
        startDate: date,
        endDate: date,
        startHour: halfStartHour,
        endHour: halfEndHour,
        overnight: false,
        halfDayType: halfDayType,  // 'morning' or 'afternoon'
        reason: halfDayType === 'morning' ? '午前半休' : '午後半休',
        swapRequested: false,
        swapPartner: null,
        status: 'approved',
        createdAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        processedBy: '管理者（即時承認）'
    };
    state.holidayRequests.push(holidayRequest);
    saveToFirebase('holidayRequests', state.holidayRequests);
    trackUsage('create_halfday', name);

    // シフトは削除せず、半休バーを表示する（シフトは残したまま）
    // 必要に応じてシフトを削除する場合はここに追加

    const typeText = halfDayType === 'morning' ? '午前半休' : '午後半休';
    alert(`${typeText}に変更しました。`);
    render();
}
function sendBroadcast(title, content) {
    trackUsage('send_broadcast', '管理者');
    state.employees.forEach(e => {
        state.messages.push({ id: Date.now().toString() + e.id, to: e.name, from: '管理者', title, content, createdAt: new Date().toISOString(), read: false });
    });
    saveToFirebase('messages', state.messages);
}

// 承認・却下
function approveRequest(type, id) {
    const processedAt = new Date().toISOString();
    const processedBy = '管理者'; // 現在は管理者のみが承認可能
    trackUsage('admin_approve', '管理者');

    if (type === 'change') {
        const r = state.changeRequests.find(x => x.id === id);
        if (r) {
            r.status = 'approved';
            r.approvedAt = processedAt;
            r.processedBy = processedBy;
            const s = state.shifts.find(x => x.id === r.originalShiftId);
            if (s) {
                // 変更前の情報を保存
                s.changeHistory = {
                    previousDate: s.date,
                    previousStartHour: s.startHour,
                    previousEndHour: s.endHour,
                    changedAt: processedAt,
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
        if (r) {
            r.status = 'approved';
            r.approvedAt = processedAt;
            r.processedBy = processedBy;
            // 取り消し時の復元用バックアップ
            r.deletedShifts = [];
            r.addedOverrideShiftIds = [];

            console.log('有給承認処理:', { name: r.name, startDate: r.startDate, endDate: r.endDate, selectedShifts: r.selectedShifts });

            // 選択シフト形式かどうかで処理を分岐
            if (r.selectedShifts && r.selectedShifts.length > 0) {
                // 新形式：選択されたシフトのみを処理
                r.shiftTimes = {};

                r.selectedShifts.forEach(shiftInfo => {
                    const dateStr = shiftInfo.date;

                    // シフト時間情報を保存（ガントチャート表示用）
                    r.shiftTimes[dateStr] = {
                        startHour: shiftInfo.startHour,
                        endHour: shiftInfo.endHour,
                        overnight: shiftInfo.overnight || false
                    };

                    if (shiftInfo.isFixed && shiftInfo.fixedShiftId) {
                        // 固定シフトの場合：上書きシフトを追加
                        const existingOverride = state.shifts.find(s =>
                            s.date === dateStr &&
                            s.fixedShiftOverride === shiftInfo.fixedShiftId
                        );

                        if (!existingOverride) {
                            const fixed = state.fixedShifts.find(f => f.id === shiftInfo.fixedShiftId);
                            if (fixed) {
                                const overrideId = 'leave-override-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                                state.shifts.push({
                                    id: overrideId,
                                    date: dateStr,
                                    name: r.name,
                                    startHour: fixed.startHour,
                                    endHour: fixed.endHour,
                                    color: fixed.color,
                                    fixedShiftOverride: shiftInfo.fixedShiftId,
                                    isLeaveOverride: true,
                                    hidden: true
                                });
                                r.addedOverrideShiftIds.push(overrideId);
                                console.log('固定シフト上書き追加:', dateStr);
                            }
                        }
                    } else {
                        // 通常シフトの場合：該当シフトを削除（取り消し用にバックアップ）
                        state.shifts = state.shifts.filter(s => {
                            const isTarget = s.date === dateStr && s.name === r.name;
                            if (isTarget) {
                                console.log('削除対象シフト:', s);
                                r.deletedShifts.push({ ...s });
                            }
                            return !isTarget;
                        });
                    }
                });
            } else {
                // 従来形式：期間内の全シフトを処理
                const startDate = new Date(r.startDate);
                const endDate = new Date(r.endDate);

                // 各日のシフト時間情報を保存（ガントチャート表示用）
                r.shiftTimes = {};
                const currentDateForShift = new Date(startDate);
                while (currentDateForShift <= endDate) {
                    const dateStr = formatDate(currentDateForShift);
                    const dayOfWeek = currentDateForShift.getDay();

                    // その日の通常シフトを探す
                    const normalShift = state.shifts.find(s => s.date === dateStr && s.name === r.name);
                    if (normalShift) {
                        r.shiftTimes[dateStr] = {
                            startHour: normalShift.startHour,
                            endHour: normalShift.endHour,
                            overnight: normalShift.overnight || false
                        };
                    } else {
                        // 固定シフトを探す
                        const fixedShift = state.fixedShifts.find(f => f.name === r.name && f.dayOfWeek === dayOfWeek);
                        if (fixedShift) {
                            r.shiftTimes[dateStr] = {
                                startHour: fixedShift.startHour,
                                endHour: fixedShift.endHour,
                                overnight: fixedShift.overnight || false
                            };
                        }
                    }
                    currentDateForShift.setDate(currentDateForShift.getDate() + 1);
                }

                // 通常シフトから該当者・該当期間のシフトを削除（取り消し用にバックアップ）
                const beforeCount = state.shifts.length;
                state.shifts = state.shifts.filter(s => {
                    const shiftDate = new Date(s.date);
                    const isInRange = shiftDate >= startDate && shiftDate <= endDate;
                    const isSamePerson = s.name === r.name;
                    if (isInRange && isSamePerson) {
                        console.log('削除対象シフト:', s);
                        r.deletedShifts.push({ ...s });
                    }
                    return !(isInRange && isSamePerson);
                });
                console.log('通常シフト削除:', beforeCount, '->', state.shifts.length);

                // 固定シフトの場合：該当日に「削除」マークのシフトを追加して上書き
                const fixedShiftsToOverride = state.fixedShifts.filter(f => f.name === r.name);
                console.log('固定シフト対象:', fixedShiftsToOverride);

                if (fixedShiftsToOverride.length > 0) {
                    const currentDate = new Date(startDate);
                    while (currentDate <= endDate) {
                        const dateStr = formatDate(currentDate);
                        const dayOfWeek = currentDate.getDay();

                        fixedShiftsToOverride.forEach(fixed => {
                            if (fixed.dayOfWeek === dayOfWeek) {
                                const existingOverride = state.shifts.find(s =>
                                    s.date === dateStr &&
                                    s.fixedShiftOverride === fixed.id
                                );

                                if (!existingOverride) {
                                    const overrideId = 'leave-override-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                                    state.shifts.push({
                                        id: overrideId,
                                        date: dateStr,
                                        name: r.name,
                                        startHour: fixed.startHour,
                                        endHour: fixed.endHour,
                                        color: fixed.color,
                                        fixedShiftOverride: fixed.id,
                                        isLeaveOverride: true,
                                        hidden: true
                                    });
                                    r.addedOverrideShiftIds.push(overrideId);
                                    console.log('固定シフト上書き追加:', dateStr, fixed.name);
                                }
                            }
                        });

                        currentDate.setDate(currentDate.getDate() + 1);
                    }
                }
            }

            saveToFirebase('shifts', state.shifts);
            saveToFirebase('leaveRequests', state.leaveRequests);
        }
    } else if (type === 'swap') {
        const r = state.swapRequests.find(x => x.id === id);
        if (r) {
            r.status = 'approved';
            r.approvedAt = processedAt;
            r.processedBy = processedBy;

            // シフト情報を取得して更新（固定シフトの場合も対応）
            let updated = false;

            if (r.shiftId && r.shiftId.startsWith('fx-')) {
                // 固定シフトの場合: fx-{originalId}-{dateStr} 形式
                // 新しい通常シフトを作成して担当者を変更
                const parts = r.shiftId.split('-');
                const originalId = parts[1];
                const dateStr = parts.slice(2).join('-');
                const fixed = state.fixedShifts.find(f => f.id === originalId);
                if (fixed) {
                    // 固定シフトを元に新しい通常シフトを作成
                    const newShift = {
                        id: Date.now().toString(),
                        date: dateStr,
                        name: r.targetEmployee,
                        startHour: fixed.startHour,
                        endHour: fixed.endHour,
                        color: fixed.color,
                        overnight: fixed.overnight || false,
                        swapHistory: {
                            previousName: fixed.name,
                            newName: r.targetEmployee,
                            swappedAt: processedAt,
                            message: r.message
                        }
                    };
                    state.shifts.push(newShift);
                    updated = true;
                }
            } else if (r.shiftId) {
                // 通常シフトの場合
                const s = state.shifts.find(x => x.id === r.shiftId);
                if (s) {
                    // 交代前の情報を保存
                    s.swapHistory = {
                        previousName: s.name,
                        newName: r.targetEmployee,
                        swappedAt: processedAt,
                        message: r.message
                    };
                    // 新しい担当者に更新
                    s.name = r.targetEmployee;
                    updated = true;
                }
            }
            saveToFirebase('shifts', state.shifts);
            saveToFirebase('swapRequests', state.swapRequests);

            if (updated) {
                alert('シフト交代を承認しました。\\n' + r.fromEmployee + ' → ' + r.targetEmployee + '\\nシフト表が更新されました。');
            } else {
                alert('承認しましたが、シフト表の更新に失敗しました。\\nshiftId: ' + (r.shiftId || '未設定'));
            }
        }
    } else if (type === 'holiday') {
        const r = state.holidayRequests.find(x => x.id === id);
        if (r) {
            r.status = 'approved';
            r.approvedAt = processedAt;
            r.processedBy = processedBy;
            
            // 選択シフト形式の場合、shiftTimes情報を作成
            if (r.selectedShifts && r.selectedShifts.length > 0) {
                r.shiftTimes = {};
                r.selectedShifts.forEach(shiftInfo => {
                    r.shiftTimes[shiftInfo.date] = {
                        startHour: shiftInfo.startHour,
                        endHour: shiftInfo.endHour,
                        overnight: shiftInfo.overnight || false
                    };
                });
            }
            
            saveToFirebase('holidayRequests', state.holidayRequests);
            alert('休日申請を承認しました。');
        }
    }
    render(); renderAdminPanel(); updateMessageBar();
}
// 承認済み有給の取り消し（管理者のみ）
function cancelLeaveRequest(id) {
    if (!state.isAdmin) {
        alert('有給の取り消しは管理者のみ可能です。');
        return;
    }
    const r = state.leaveRequests.find(x => x.id === id);
    if (!r || r.status !== 'approved') {
        alert('対象の有給申請が見つからないか、承認済みではありません。');
        return;
    }
    trackUsage('admin_cancel_leave', '管理者');

    // 1. 承認時に追加した有給上書きシフトを削除
    if (Array.isArray(r.addedOverrideShiftIds) && r.addedOverrideShiftIds.length > 0) {
        const removeIds = new Set(r.addedOverrideShiftIds);
        state.shifts = state.shifts.filter(s => !removeIds.has(s.id));
    } else {
        // 旧データ用フォールバック：name と期間で leave-override を掃除
        state.shifts = state.shifts.filter(s => {
            if (!s.isLeaveOverride || s.name !== r.name) return true;
            return !(s.date >= r.startDate && s.date <= r.endDate);
        });
    }

    let restoredCount = 0;
    let bestEffortCount = 0;

    // 2. 承認時に削除した通常シフトを復元（新データ：完全復元）
    if (Array.isArray(r.deletedShifts) && r.deletedShifts.length > 0) {
        r.deletedShifts.forEach(s => {
            if (!state.shifts.some(x => x.id === s.id)) {
                state.shifts.push({ ...s });
                restoredCount++;
            }
        });
    } else if (r.shiftTimes && Object.keys(r.shiftTimes).length > 0) {
        // 旧データ用ベストエフォート復元：shiftTimes から通常シフトのみ再構築
        // 固定シフトは override 削除で自然に復活するため再構築不要
        const personColor = [...state.shifts, ...state.fixedShifts]
            .find(s => s.name === r.name && s.color)?.color || null;

        Object.entries(r.shiftTimes).forEach(([dateStr, t]) => {
            const dayOfWeek = new Date(dateStr).getDay();

            // その曜日に固定シフトが存在し、かつ時刻が一致 → 固定シフト由来と判定（再構築不要）
            const matchingFixed = state.fixedShifts.find(f =>
                f.name === r.name &&
                f.dayOfWeek === dayOfWeek &&
                f.startHour === t.startHour &&
                f.endHour === t.endHour
            );
            if (matchingFixed) return;

            // 既に同じ日・人・時刻のシフトがあるならスキップ（重複防止）
            const exists = state.shifts.some(s =>
                s.date === dateStr &&
                s.name === r.name &&
                s.startHour === t.startHour &&
                s.endHour === t.endHour &&
                !s.isLeaveOverride
            );
            if (exists) return;

            // 通常シフトとして再構築
            const newShift = {
                id: 'leave-cancel-restore-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                date: dateStr,
                name: r.name,
                startHour: t.startHour,
                endHour: t.endHour,
                overnight: !!t.overnight,
                restoredFromLeaveCancel: true
            };
            if (personColor) newShift.color = personColor;
            state.shifts.push(newShift);
            bestEffortCount++;
        });
    }

    // 3. 有給申請レコードを削除
    state.leaveRequests = state.leaveRequests.filter(x => x.id !== id);

    saveToFirebase('shifts', state.shifts);
    saveToFirebase('leaveRequests', state.leaveRequests);

    render();
    renderAdminPanel();
    updateMessageBar();

    if (bestEffortCount > 0) {
        alert(`有給を取り消しました。\n旧データのため ${bestEffortCount} 件の通常シフトをベストエフォートで復元しました（色やメモなど一部情報は失われている場合があります）。`);
    }
}

function rejectRequest(type, id) {
    const processedAt = new Date().toISOString();
    const processedBy = '管理者';
    trackUsage('admin_reject', '管理者');

    let arr, refName;
    if (type === 'change') {
        arr = state.changeRequests;
        refName = 'changeRequests';
    } else if (type === 'leave') {
        arr = state.leaveRequests;
        refName = 'leaveRequests';
    } else if (type === 'holiday') {
        arr = state.holidayRequests;
        refName = 'holidayRequests';
    } else {
        arr = state.swapRequests;
        refName = 'swapRequests';
    }
    const r = arr.find(x => x.id === id);
    if (r) {
        r.status = 'rejected';
        r.rejectedAt = processedAt;
        r.processedBy = processedBy;
        saveToFirebase(refName, arr);
    }
    renderAdminPanel(); updateMessageBar();
}

// ナビ
function goToPrevWeek() { state.currentWeekStart.setDate(state.currentWeekStart.getDate() - 7); render(); fetchWeatherData(); }
function goToNextWeek() { state.currentWeekStart.setDate(state.currentWeekStart.getDate() + 7); render(); fetchWeatherData(); }

// 認証
function showPinModal() { document.getElementById('adminPin').value = ''; document.getElementById('pinError').style.display = 'none'; openModal(document.getElementById('pinModalOverlay')); }
function verifyPin(p) { return p === CONFIG.ADMIN_PIN; }
function switchToAdmin() { state.isAdmin = true; document.getElementById('roleToggle').classList.add('admin'); document.getElementById('roleText').textContent = '管理者'; document.querySelector('.role-icon').textContent = '👑'; document.getElementById('adminPanel').style.display = 'block'; renderAdminPanel(); updateMessageBar(); }
function switchToStaff() { state.isAdmin = false; document.getElementById('roleToggle').classList.remove('admin'); document.getElementById('roleText').textContent = 'スタッフ'; document.querySelector('.role-icon').textContent = '👤'; document.getElementById('adminPanel').style.display = 'none'; updateMessageBar(); }
function toggleRole() { state.isAdmin ? switchToStaff() : showPinModal(); }

// 管理者タブの通知バッジ更新
// ユーザー承認
function approveUser(uid) {
    if (!confirm('このユーザーを承認しますか？')) return;
    database.ref('users/' + uid).update({ status: 'approved' }).then(() => {
        alert('ユーザーを承認しました');
        renderAdminPanel();
    }).catch(err => {
        console.error('承認エラー:', err);
        alert('承認に失敗しました');
    });
}

// ユーザー却下
function rejectUser(uid) {
    if (!confirm('このユーザーの登録を却下しますか？')) return;
    database.ref('users/' + uid).update({ status: 'rejected' }).then(() => {
        alert('ユーザーを却下しました');
        renderAdminPanel();
    }).catch(err => {
        console.error('却下エラー:', err);
        alert('却下に失敗しました');
    });
}

function updateAdminBadges() {
    const changeCount = state.changeRequests.filter(r => r.status === 'pending').length;
    const swapCount = state.swapRequests.filter(r => r.status === 'pending').length;
    const leaveCount = state.leaveRequests.filter(r => r.status === 'pending').length;
    const holidayCount = state.holidayRequests.filter(r => r.status === 'pending').length;

    // 同期的にバッジを更新（state から取得できるもの）
    const badgeCounts = {
        shiftChanges: changeCount,
        shiftSwaps: swapCount,
        leaveRequests: leaveCount,
        holidayRequests: holidayCount
    };

    document.querySelectorAll('.admin-tab').forEach(tab => {
        const tabName = tab.dataset.tab;
        // userApproval は非同期で別途更新するのでここではスキップ
        if (tabName === 'userApproval') return;

        const existingBadge = tab.querySelector('.tab-badge');
        if (existingBadge) existingBadge.remove();

        const count = badgeCounts[tabName] || 0;
        if (count > 0) {
            const badge = document.createElement('span');
            badge.className = 'tab-badge';
            badge.textContent = count;
            tab.appendChild(badge);
        }
    });

    // トリガーボタンの合計バッジ（承認待ちユーザー分は除いた小計を一旦反映）
    updateAdminMenuTriggerBadge(changeCount + swapCount + leaveCount + holidayCount);

    // 承認待ちユーザー数を非同期で取得してバッジ更新
    database.ref('users').orderByChild('status').equalTo('pending').once('value')
        .then((snapshot) => {
            const userApprovalCount = snapshot.numChildren();
            const tab = document.querySelector('.admin-tab[data-tab="userApproval"]');
            if (!tab) return;

            const existingBadge = tab.querySelector('.tab-badge');
            if (existingBadge) existingBadge.remove();

            if (userApprovalCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'tab-badge';
                badge.textContent = userApprovalCount;
                tab.appendChild(badge);
            }

            // トリガーボタンの合計バッジを最終確定
            updateAdminMenuTriggerBadge(changeCount + swapCount + leaveCount + holidayCount + userApprovalCount);
        })
        .catch((error) => {
            console.error('承認待ちユーザー数取得エラー:', error);
        });
}

// 管理者メニュー ポップアップの開閉
function openAdminMenuModal() {
    const overlay = document.getElementById('adminMenuModalOverlay');
    const trigger = document.getElementById('adminMenuTrigger');
    if (!overlay) return;
    overlay.classList.add('active');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
}

function closeAdminMenuModal() {
    const overlay = document.getElementById('adminMenuModalOverlay');
    const trigger = document.getElementById('adminMenuTrigger');
    if (!overlay) return;
    overlay.classList.remove('active');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

// トリガーボタンに「現在表示中のタブ名」を表示
function updateAdminMenuTriggerLabel() {
    const currentEl = document.getElementById('adminMenuCurrent');
    if (!currentEl) return;
    const activeTab = document.querySelector('.admin-tab[data-tab="' + state.activeAdminTab + '"]');
    if (!activeTab) return;
    // バッジ要素のテキストは除いてラベルを抽出
    const clone = activeTab.cloneNode(true);
    clone.querySelectorAll('.tab-badge').forEach(b => b.remove());
    currentEl.textContent = clone.textContent.trim();
}

// トリガーボタンの合計バッジを更新
function updateAdminMenuTriggerBadge(total) {
    const badge = document.getElementById('adminMenuTriggerBadge');
    if (!badge) return;
    if (total > 0) {
        badge.textContent = total;
        badge.style.display = '';
    } else {
        badge.style.display = 'none';
    }
}

// 固定シフト管理画面をレンダリング
function renderFixedShiftManagement(container) {
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    
    // 固定シフトを曜日でグループ化
    const groupedByDay = {};
    for (let i = 0; i < 7; i++) {
        groupedByDay[i] = state.fixedShifts.filter(f => f.dayOfWeek === i);
    }
    
    // 有効/無効を判定する関数
    const isActive = (f) => {
        const today = formatDate(new Date());
        if (f.startDate && today < f.startDate) return false;
        if (f.endDate && today > f.endDate) return false;
        return true;
    };
    
    // 統計情報
    const totalFixed = state.fixedShifts.length;
    const activeFixed = state.fixedShifts.filter(isActive).length;
    const expiredFixed = state.fixedShifts.filter(f => f.endDate && formatDate(new Date()) > f.endDate).length;
    
    let html = `
        <div class="fixed-shift-management">
            <div class="fixed-shift-summary">
                <div class="summary-item">
                    <span class="summary-label">総固定シフト数</span>
                    <span class="summary-value">${totalFixed}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">有効</span>
                    <span class="summary-value active">${activeFixed}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">期限切れ</span>
                    <span class="summary-value expired">${expiredFixed}</span>
                </div>
            </div>
            
            <div class="fixed-shift-list">
    `;
    
    // 月曜日から始めて曜日ごとに表示
    const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // 月火水木金土日
    
    dayOrder.forEach(dayIndex => {
        const shifts = groupedByDay[dayIndex];
        const dayName = dayNames[dayIndex];
        const dayClass = dayIndex === 0 ? 'sunday' : dayIndex === 6 ? 'saturday' : '';
        
        html += `
            <div class="fixed-shift-day-group">
                <h4 class="day-header ${dayClass}">${dayName}曜日 (${shifts.length}件)</h4>
        `;
        
        if (shifts.length === 0) {
            html += `<p class="no-shifts">固定シフトなし</p>`;
        } else {
            shifts.forEach(f => {
                const active = isActive(f);
                const statusClass = active ? 'active' : 'inactive';
                const statusText = active ? '有効' : (f.endDate && formatDate(new Date()) > f.endDate ? '期限切れ' : '開始前');
                
                const startDateStr = f.startDate ? f.startDate : '指定なし';
                const endDateStr = f.endDate ? f.endDate : '無期限';
                
                html += `
                    <div class="fixed-shift-card ${statusClass}">
                        <div class="fixed-shift-color" style="background-color: ${f.color || '#6366f1'}"></div>
                        <div class="fixed-shift-info">
                            <div class="fixed-shift-name">${f.name}</div>
                            <div class="fixed-shift-time">
                                ${formatTime(f.startHour)} - ${formatTime(f.endHour)}
                                ${f.overnight ? '<span class="overnight-badge">🌙夜勤</span>' : ''}
                            </div>
                            <div class="fixed-shift-period">
                                <span class="period-label">有効期間:</span>
                                <span class="period-value">${startDateStr} ～ ${endDateStr}</span>
                            </div>
                        </div>
                        <div class="fixed-shift-status ${statusClass}">${statusText}</div>
                        <div class="fixed-shift-actions">
                            <button class="btn btn-secondary btn-sm" onclick="openEditFixedShiftModal('${f.id}')">✏️ 編集</button>
                            <button class="btn btn-danger btn-sm" onclick="confirmDeleteFixedShift('${f.id}')">🗑️ 削除</button>
                        </div>
                    </div>
                `;
            });
        }
        
        html += `</div>`;
    });
    
    html += `
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

// 固定シフト編集モーダルを開く
function openEditFixedShiftModal(id) {
    const f = state.fixedShifts.find(s => s.id === id);
    if (!f) return;
    
    // 曜日から日付を逆算（今週の該当曜日）
    const today = new Date();
    const currentDow = today.getDay();
    const diff = f.dayOfWeek - currentDow;
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + diff);
    
    document.getElementById('shiftModalTitle').textContent = '固定シフト編集';
    document.getElementById('shiftSubmitBtn').textContent = '更新';
    document.getElementById('editShiftId').value = id;
    document.getElementById('shiftDate').value = formatDate(targetDate);
    updateShiftDateDay();
    document.getElementById('shiftName').value = f.name;
    document.getElementById('shiftStart').value = f.startHour;
    document.getElementById('shiftEnd').value = f.endHour;
    document.getElementById('overnightShift').checked = f.overnight || false;
    document.getElementById('fixedShift').checked = true;
    document.getElementById('fixedShift').disabled = true; // 固定シフト編集時はチェックを外せないように
    
    // 有効期間を設定
    document.getElementById('fixedShiftPeriod').style.display = 'block';
    document.getElementById('fixedStartDate').value = f.startDate || '';
    document.getElementById('fixedEndDate').value = f.endDate || '';
    document.getElementById('fixedNoEndDate').checked = !f.endDate;
    document.getElementById('fixedEndDate').disabled = !f.endDate;
    
    // 色を設定
    state.selectedColor = f.color || '#6366f1';
    document.querySelectorAll('.color-option').forEach(o => {
        o.classList.toggle('selected', o.dataset.color === state.selectedColor);
    });
    
    openModal(document.getElementById('modalOverlay'));
}

// 固定シフト削除確認
function confirmDeleteFixedShift(id) {
    const f = state.fixedShifts.find(s => s.id === id);
    if (!f) return;
    
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    if (confirm(`${f.name}さんの${dayNames[f.dayOfWeek]}曜日の固定シフトを削除しますか？\n\n※この操作は取り消せません。`)) {
        deleteFixedShift(id);
        renderAdminPanel();
    }
}

// 管理者パネル
function renderAdminPanel() {
    updateAdminBadges();
    const c = document.getElementById('adminContent');
    c.innerHTML = '';
    
    // トレンドレポートタブの場合はmax-heightを解除
    if (state.activeAdminTab === 'trendReports' || state.activeAdminTab === 'newProductReport' || state.activeAdminTab === 'productResearch') {
        c.classList.add('trend-reports-content');
    } else {
        c.classList.remove('trend-reports-content');
    }
    
    if (state.activeAdminTab === 'userApproval') {
        c.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">読み込み中...</p>';
        database.ref('users').orderByChild('status').equalTo('pending').once('value')
            .then((snapshot) => {
                c.innerHTML = '';
                const pendingUsers = [];
                snapshot.forEach(child => {
                    pendingUsers.push({ uid: child.key, ...child.val() });
                });
                if (!pendingUsers.length) {
                    c.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">承認待ちユーザーなし</p>';
                    return;
                }
                pendingUsers.forEach(u => {
                    const card = document.createElement('div');
                    card.className = 'request-card';
                    const createdAt = u.createdAt ? new Date(u.createdAt).toLocaleString('ja-JP') : '不明';
                    card.innerHTML = `<div class="request-info"><h4>👤 ユーザー登録申請</h4><p>名前: ${u.displayName || '不明'}</p><p>従業員番号: ${u.staffId || '不明'}</p><p>登録日時: ${createdAt}</p></div><div class="request-actions"><button class="btn btn-success btn-sm" onclick="approveUser('${u.uid}')">承認</button><button class="btn btn-danger btn-sm" onclick="rejectUser('${u.uid}')">却下</button></div>`;
                    c.appendChild(card);
                });
            })
            .catch((error) => {
                console.error('ユーザー承認データ取得エラー:', error);
                c.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">データの取得に失敗しました。<br><small>Firebaseのセキュリティルールを確認してください。</small></p>';
            });
    } else if (state.activeAdminTab === 'shiftChanges') {
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
            // シフト情報を取得（固定シフトの場合も対応）
            let shiftInfo = null;
            if (r.shiftId && r.shiftId.startsWith('fx-')) {
                const parts = r.shiftId.split('-');
                const originalId = parts[1];
                const dateStr = parts.slice(2).join('-');
                const fixed = state.fixedShifts.find(f => f.id === originalId);
                if (fixed) {
                    shiftInfo = { date: dateStr, startHour: fixed.startHour, endHour: fixed.endHour };
                }
            } else {
                const s = state.shifts.find(x => x.id === r.shiftId);
                if (s) {
                    shiftInfo = { date: s.date, startHour: s.startHour, endHour: s.endHour };
                }
            }
            const dateDisplay = shiftInfo?.date || '?';
            const timeDisplay = shiftInfo ? `${formatTime(shiftInfo.startHour)}-${formatTime(shiftInfo.endHour)}` : '?:00-?:00';
            const card = document.createElement('div'); card.className = 'request-card';
            card.innerHTML = `<div class="request-info"><h4>🤝 シフト交換依頼</h4><p>申請者: ${r.applicant || '不明'}</p><p>シフト: ${dateDisplay} ${timeDisplay}</p><p>現在の担当: ${r.fromEmployee} → 交代先: ${r.targetEmployee}</p><p>メッセージ: ${r.message}</p></div><div class="request-actions"><button class="btn btn-success btn-sm" onclick="approveRequest('swap','${r.id}')">承認</button><button class="btn btn-danger btn-sm" onclick="rejectRequest('swap','${r.id}')">却下</button></div>`;
            c.appendChild(card);
        });
    } else if (state.activeAdminTab === 'leaveRequests') {
        const reqs = state.leaveRequests.filter(r => r.status === 'pending');
        if (!reqs.length) { c.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">承認待ちなし</p>'; return; }
        reqs.forEach(r => {
            const card = document.createElement('div'); card.className = 'request-card';
            
            // 選択されたシフト情報を表示
            let shiftsHtml = '';
            if (r.selectedShifts && r.selectedShifts.length > 0) {
                const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
                shiftsHtml = '<div class="selected-shifts-list">' + 
                    r.selectedShifts.map(s => {
                        const d = new Date(s.date);
                        const badges = [];
                        if (s.isFixed) badges.push('<span class="shift-badge fixed">固定</span>');
                        if (s.overnight) badges.push('<span class="shift-badge overnight">夜勤</span>');
                        return `<div class="shift-item">${d.getMonth() + 1}/${d.getDate()}（${dayNames[d.getDay()]}）${formatTime(s.startHour)}-${formatTime(s.endHour)} ${badges.join('')}</div>`;
                    }).join('') + 
                '</div>';
            } else {
                // 従来の開始日〜終了日形式
                shiftsHtml = `<p>期間: ${r.startDate} 〜 ${r.endDate}</p>`;
            }
            
            card.innerHTML = `<div class="request-info"><h4>🏖️ ${r.name} - 有給申請</h4>${shiftsHtml}<p>理由: ${r.reason || '有給休暇'}</p></div><div class="request-actions"><button class="btn btn-success btn-sm" onclick="approveRequest('leave','${r.id}')">承認</button><button class="btn btn-danger btn-sm" onclick="rejectRequest('leave','${r.id}')">却下</button></div>`;
            c.appendChild(card);
        });
    } else if (state.activeAdminTab === 'holidayRequests') {
        const reqs = state.holidayRequests.filter(r => r.status === 'pending');
        if (!reqs.length) { c.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">承認待ちなし</p>'; return; }
        reqs.forEach(r => {
            const card = document.createElement('div'); card.className = 'request-card';
            
            // 選択されたシフト情報を表示
            let shiftsHtml = '';
            if (r.selectedShifts && r.selectedShifts.length > 0) {
                const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
                shiftsHtml = '<div class="selected-shifts-list">' + 
                    r.selectedShifts.map(s => {
                        const d = new Date(s.date);
                        const badges = [];
                        if (s.isFixed) badges.push('<span class="shift-badge fixed">固定</span>');
                        if (s.overnight) badges.push('<span class="shift-badge overnight">夜勤</span>');
                        const timeDisplay = s.originalStartHour !== undefined && (s.startHour !== s.originalStartHour || s.endHour !== s.originalEndHour) 
                            ? `${formatTime(s.startHour)}-${formatTime(s.endHour)} <span class="custom-time">(元: ${formatTime(s.originalStartHour)}-${formatTime(s.originalEndHour)})</span>`
                            : `${formatTime(s.startHour)}-${formatTime(s.endHour)}`;
                        return `<div class="shift-item">${d.getMonth() + 1}/${d.getDate()}（${dayNames[d.getDay()]}）${timeDisplay} ${badges.join('')}</div>`;
                    }).join('') + 
                '</div>';
            } else {
                // 従来の開始日〜終了日形式
                shiftsHtml = `<p>期間: ${r.startDate} 〜 ${r.endDate}</p>`;
            }
            
            let swapInfo = r.swapRequested && r.swapPartner ? `<p>シフト交代: ${r.swapPartner}さんと交代</p>` : '<p>シフト交代: なし</p>';
            card.innerHTML = `<div class="request-info"><h4>🏠 ${r.name} - 休日申請</h4>${shiftsHtml}${swapInfo}<p>理由: ${r.reason}</p></div><div class="request-actions"><button class="btn btn-success btn-sm" onclick="approveRequest('holiday','${r.id}')">承認</button><button class="btn btn-danger btn-sm" onclick="rejectRequest('holiday','${r.id}')">却下</button></div>`;
            c.appendChild(card);
        });
    } else if (state.activeAdminTab === 'specialEvents') {
        // 臨時シフト管理
        renderSpecialEventManagement(c);
    } else if (state.activeAdminTab === 'fixedShiftManage') {
        // 固定シフト管理
        renderFixedShiftManagement(c);
    } else if (state.activeAdminTab === 'employees') {
        c.innerHTML = `<div style="margin-bottom:16px"><button class="btn btn-primary btn-sm" onclick="openAddEmployeeModal()">+ 従業員追加</button></div><div class="employee-list" id="employeeList"></div>`;
        const list = document.getElementById('employeeList');
        const roleNames = { staff: 'スタッフ', shiftLeader: 'シフトリーダー', employee: '社員', manager: 'マネージャー', leader: 'リーダー' };
        const shiftNames = { day: '日勤', evening: '夕勤', night: '夜勤' };
        state.employees.forEach(e => {
            const card = document.createElement('div'); card.className = 'employee-card';
            const roleName = roleNames[e.role] || e.role;
            const shiftName = shiftNames[e.shiftTime] || '';

            // 発注担当分類タグを生成
            let orderCategoriesHtml = '';
            if (e.orderCategories && e.orderCategories.length > 0) {
                orderCategoriesHtml = `<div class="order-categories-display">${e.orderCategories.map(cat => `<span class="order-category-tag">${cat}</span>`).join('')}</div>`;
            }

            card.innerHTML = `<div class="employee-info"><div class="employee-avatar">${e.name.charAt(0)}</div><div><div class="employee-name">${e.name}</div><div class="employee-role">${roleName}${shiftName ? ' / ' + shiftName : ''}</div>${orderCategoriesHtml}</div></div><div class="employee-actions"><button class="btn btn-secondary btn-sm" onclick="openEditEmployeeModal('${e.id}')">✏️ 編集</button><button class="btn btn-danger btn-sm" onclick="deleteEmployee('${e.id}')">削除</button></div>`;
            list.appendChild(card);
        });
    } else if (state.activeAdminTab === 'broadcast') {
        c.innerHTML = `<div style="text-align:center;padding:20px"><p style="margin-bottom:16px;color:var(--text-secondary)">全従業員にメッセージを送信</p><button class="btn btn-primary" onclick="openModal(document.getElementById('broadcastModalOverlay'))">📢 メッセージ作成</button></div>`;
    } else if (state.activeAdminTab === 'settings') {
        c.innerHTML = `<div style="text-align:center;padding:20px"><p style="margin-bottom:16px;color:var(--text-secondary)">管理者設定</p><button class="btn btn-primary" onclick="openModal(document.getElementById('changePinModalOverlay'))">🔑 暗証番号を変更</button></div>`;
    } else if (state.activeAdminTab === 'dailyEvents') {
        // 店舗スケジュール管理
        const icons = getEventTypeIcons();
        const typeNames = { sale: 'セール', notice: '連絡事項', training: '研修', inventory: '棚卸', delivery: '特発納品', other: 'その他' };

        // 現在のフィルター状態を取得（初期値は'all'）
        const currentFilter = state.eventTypeFilter || 'all';

        c.innerHTML = `
            <div class="daily-events-header">
                <h3>📅 店舗スケジュール管理</h3>
                <button class="btn btn-primary btn-sm" onclick="openEventModal()">+ イベント追加</button>
            </div>
            <div class="filter-tabs" id="eventFilterTabs">
                <button class="filter-tab ${currentFilter === 'all' ? 'active' : ''}" data-filter="all" onclick="filterEventsByType('all')">すべて</button>
                ${Object.entries(typeNames).map(([key, name]) =>
            `<button class="filter-tab ${currentFilter === key ? 'active' : ''}" data-filter="${key}" onclick="filterEventsByType('${key}')">${icons[key]} ${name}</button>`
        ).join('')}
            </div>
            <div class="daily-events-list" id="dailyEventsList"></div>
        `;

        const list = document.getElementById('dailyEventsList');

        // フィルタリングして開始日順にソート
        let filteredEvents = [...state.dailyEvents];
        if (currentFilter !== 'all') {
            filteredEvents = filteredEvents.filter(e => e.type === currentFilter);
        }
        const sortedEvents = filteredEvents.sort((a, b) => {
            const aDate = a.startDate || a.date;
            const bDate = b.startDate || b.date;
            return new Date(aDate) - new Date(bDate);
        });

        if (sortedEvents.length === 0) {
            list.innerHTML = '<p class="no-events-message">登録されているイベントはありません</p>';
        } else {
            sortedEvents.forEach(e => {
                const icon = icons[e.type] || icons.other;
                const typeName = typeNames[e.type] || 'その他';
                const startDate = e.startDate || e.date;
                const endDate = e.endDate || e.date;
                const startObj = new Date(startDate);
                const endObj = new Date(endDate);
                const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

                // 期間表示（同じ日なら1日のみ、違う日なら期間表示）
                let dateDisplay;
                if (startDate === endDate) {
                    dateDisplay = `${startObj.getMonth() + 1}/${startObj.getDate()}（${dayNames[startObj.getDay()]}）`;
                } else {
                    dateDisplay = `${startObj.getMonth() + 1}/${startObj.getDate()} 〜 ${endObj.getMonth() + 1}/${endObj.getDate()}`;
                }

                const card = document.createElement('div');
                card.className = 'daily-event-card';
                card.innerHTML = `
                    <div class="event-info">
                        <div class="event-header">
                            <span class="event-date">${dateDisplay}</span>
                            <span class="event-type-icon">${icon}</span>
                            <span class="event-title">${e.title}</span>
                        </div>
                        ${e.description ? `<div class="event-description">${e.description}</div>` : ''}
                    </div>
                    <div class="event-actions">
                        <button class="btn btn-secondary btn-sm" onclick="openEditEventModal('${e.id}')">✏️ 編集</button>
                        <button class="btn btn-danger btn-sm" onclick="confirmDeleteEvent('${e.id}')">🗑️ 削除</button>
                    </div>
                `;
                list.appendChild(card);
            });
        }
    } else if (state.activeAdminTab === 'nonDailyAdvice') {
        // 非デイリーアドバイス管理
        renderNonDailyAdminPanel(c);
    } else if (state.activeAdminTab === 'feedbackStats') {
        // フィードバック集計
        renderFeedbackStats(c);
    } else if (state.activeAdminTab === 'productCategories') {
        // 商品分類管理
        renderProductCategoriesPanel(c);
    } else if (state.activeAdminTab === 'trendReports') {
        // コンビニ3社 新商品ヒット予測レポート管理
        renderTrendReportsAdmin(c);
    } else if (state.activeAdminTab === 'newProductReport') {
        // 週次インテリジェンス（マクロ環境）管理
        renderNewProductReportAdmin(c);
    } else if (state.activeAdminTab === 'productResearch') {
        // 新規商品調査レポート管理
        renderProductResearchAdmin(c);
    } else if (state.activeAdminTab === 'usageStats') {
        // 利用統計
        renderUsageStats(c);
    } else if (state.activeAdminTab === 'history') {
        renderRequestHistory(c);
    }
}

// 履歴表示関数
function renderRequestHistory(container) {
    // 処理済みの申請を全て取得
    const changeHistory = state.changeRequests.filter(r => r.status === 'approved' || r.status === 'rejected');
    const swapHistory = state.swapRequests.filter(r => r.status === 'approved' || r.status === 'rejected');
    const leaveHistory = state.leaveRequests.filter(r => r.status === 'approved' || r.status === 'rejected');
    const holidayHistory = state.holidayRequests.filter(r => r.status === 'approved' || r.status === 'rejected');

    // 全ての履歴を一つの配列にまとめ、処理日時で降順ソート
    const allHistory = [
        ...changeHistory.map(r => ({ ...r, type: 'change', processedAt: r.approvedAt || r.rejectedAt || r.createdAt })),
        ...swapHistory.map(r => ({ ...r, type: 'swap', processedAt: r.approvedAt || r.rejectedAt || r.createdAt })),
        ...leaveHistory.map(r => ({ ...r, type: 'leave', processedAt: r.approvedAt || r.rejectedAt || r.createdAt })),
        ...holidayHistory.map(r => ({ ...r, type: 'holiday', processedAt: r.approvedAt || r.rejectedAt || r.createdAt }))
    ].sort((a, b) => new Date(b.processedAt) - new Date(a.processedAt));

    if (!allHistory.length) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">処理済みの申請履歴はありません</p>';
        return;
    }

    // フィルタボタンを追加
    container.innerHTML = `
        <div class="history-filters" style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-sm history-filter-btn active" data-filter="all">すべて (${allHistory.length})</button>
            <button class="btn btn-sm history-filter-btn" data-filter="change">シフト変更 (${changeHistory.length})</button>
            <button class="btn btn-sm history-filter-btn" data-filter="swap">シフト交代 (${swapHistory.length})</button>
            <button class="btn btn-sm history-filter-btn" data-filter="leave">有給申請 (${leaveHistory.length})</button>
            <button class="btn btn-sm history-filter-btn" data-filter="holiday">休日申請 (${holidayHistory.length})</button>
        </div>
        <div id="historyList"></div>
    `;

    const listEl = document.getElementById('historyList');

    // フィルタボタンのイベント
    container.querySelectorAll('.history-filter-btn').forEach(btn => {
        btn.onclick = () => {
            container.querySelectorAll('.history-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderHistoryItems(listEl, allHistory, btn.dataset.filter);
        };
    });

    // 初期表示
    renderHistoryItems(listEl, allHistory, 'all');
}

// 履歴アイテムのレンダリング
function renderHistoryItems(container, allHistory, filter) {
    const filtered = filter === 'all' ? allHistory : allHistory.filter(h => h.type === filter);

    if (!filtered.length) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">該当する履歴はありません</p>';
        return;
    }

    container.innerHTML = '';

    filtered.forEach(h => {
        const card = document.createElement('div');
        card.className = `request-card history-card ${h.status}`;

        // ステータスバッジ
        const statusBadge = h.status === 'approved'
            ? '<span class="status-badge approved">✅ 承認済み</span>'
            : '<span class="status-badge rejected">❌ 却下</span>';

        // 処理日時
        const processedAtStr = h.approvedAt || h.rejectedAt
            ? formatDateTime(h.approvedAt || h.rejectedAt)
            : '不明';

        // 申請日時
        const createdAtStr = h.createdAt ? formatDateTime(h.createdAt) : '不明';

        // 処理者
        const processedByStr = h.processedBy || '管理者';

        let content = '';

        if (h.type === 'change') {
            content = `
                <div class="request-info">
                    <h4>🔄 シフト変更申請 ${statusBadge}</h4>
                    <p><strong>申請者:</strong> ${h.applicant || '不明'}</p>
                    <p><strong>変更後:</strong> ${h.newDate} ${h.newStartHour}:00-${h.newEndHour}:00</p>
                    <p><strong>理由:</strong> ${h.reason}</p>
                    <div class="history-meta">
                        <p>📅 申請日時: ${createdAtStr}</p>
                        <p>✍️ 処理日時: ${processedAtStr}</p>
                        <p>👤 処理者: ${processedByStr}</p>
                    </div>
                </div>
            `;
        } else if (h.type === 'swap') {
            content = `
                <div class="request-info">
                    <h4>🤝 シフト交代依頼 ${statusBadge}</h4>
                    <p><strong>申請者:</strong> ${h.applicant || '不明'}</p>
                    <p><strong>交代:</strong> ${h.fromEmployee} → ${h.targetEmployee}</p>
                    <p><strong>メッセージ:</strong> ${h.message}</p>
                    <div class="history-meta">
                        <p>📅 申請日時: ${createdAtStr}</p>
                        <p>✍️ 処理日時: ${processedAtStr}</p>
                        <p>👤 処理者: ${processedByStr}</p>
                    </div>
                </div>
            `;
        } else if (h.type === 'leave') {
            content = `
                <div class="request-info">
                    <h4>🏖️ 有給申請 ${statusBadge}</h4>
                    <p><strong>申請者:</strong> ${h.name || '不明'}</p>
                    <p><strong>期間:</strong> ${h.startDate} 〜 ${h.endDate}</p>
                    <p><strong>理由:</strong> ${h.reason}</p>
                    <div class="history-meta">
                        <p>📅 申請日時: ${createdAtStr}</p>
                        <p>✍️ 処理日時: ${processedAtStr}</p>
                        <p>👤 処理者: ${processedByStr}</p>
                    </div>
                </div>
            `;
        } else if (h.type === 'holiday') {
            let swapInfo = h.swapRequested && h.swapPartner ? `<p><strong>シフト交代:</strong> ${h.swapPartner}さんと交代</p>` : '';
            content = `
                <div class="request-info">
                    <h4>🏠 休日申請 ${statusBadge}</h4>
                    <p><strong>申請者:</strong> ${h.name || '不明'}</p>
                    <p><strong>期間:</strong> ${h.startDate} 〜 ${h.endDate}</p>
                    ${swapInfo}
                    <p><strong>理由:</strong> ${h.reason}</p>
                    <div class="history-meta">
                        <p>📅 申請日時: ${createdAtStr}</p>
                        <p>✍️ 処理日時: ${processedAtStr}</p>
                        <p>👤 処理者: ${processedByStr}</p>
                    </div>
                </div>
            `;
        }

        card.innerHTML = content;
        container.appendChild(card);
    });
}

// メッセージ表示
function renderMessages() {
    const c = document.getElementById('messagesContent');
    // 現在の役割で見えるメッセージのみ表示（管理者宛はスタッフモードでは非表示）
    const visibleMessages = state.messages.filter(isMessageVisibleInCurrentRole);
    const all = [...visibleMessages.map(m => ({ ...m, type: 'message' })), ...state.swapRequests.filter(r => r.status === 'pending').map(r => ({ ...r, type: 'swap' }))].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!all.length) { c.innerHTML = '<p style="color:var(--text-muted);text-align:center">メッセージなし</p>'; return; }

    // ヘッダーに全削除ボタンを追加
    c.innerHTML = '<div style="text-align:right;margin-bottom:12px;"><button class="btn btn-danger btn-sm" onclick="clearAllMessages()">🗑️ 全てのメッセージを削除</button></div>';

    all.forEach(m => {
        const card = document.createElement('div'); card.className = 'message-card' + (!m.read ? ' unread' : '');
        if (m.type === 'message') {
            card.innerHTML = `<div class="message-header"><span class="message-from">${m.from}</span><span class="message-date">${formatDateTime(m.createdAt)}</span></div><div class="message-content"><strong>${m.title}</strong><br>${m.content}</div><div class="message-actions"><button class="btn btn-danger btn-sm" onclick="deleteMessage('${m.id}')">削除</button></div>`;
            card.onclick = (e) => { if (e.target.tagName !== 'BUTTON') { m.read = true; saveToFirebase('messages', state.messages); updateMessageBar(); renderMessages(); } };
        } else {
            // シフト情報を取得（固定シフトの場合も対応）
            let shiftInfo = null;
            if (m.shiftId && m.shiftId.startsWith('fx-')) {
                // 固定シフトの場合: fx-{originalId}-{dateStr} 形式
                const parts = m.shiftId.split('-');
                const originalId = parts[1];
                const dateStr = parts.slice(2).join('-');
                const fixed = state.fixedShifts.find(f => f.id === originalId);
                if (fixed) {
                    shiftInfo = { date: dateStr, startHour: fixed.startHour, endHour: fixed.endHour };
                }
            } else {
                const s = state.shifts.find(x => x.id === m.shiftId);
                if (s) {
                    shiftInfo = { date: s.date, startHour: s.startHour, endHour: s.endHour };
                }
            }
            const dateDisplay = shiftInfo?.date || '?';
            const timeDisplay = shiftInfo ? `${formatTime(shiftInfo.startHour)}-${formatTime(shiftInfo.endHour)}` : '?:00-?:00';
            card.innerHTML = `<div class="message-header"><span class="message-from">🤝 シフト交代依頼</span><span class="message-date">${formatDateTime(m.createdAt)}</span></div><div class="message-content"><strong>${m.fromEmployee}</strong>さんから、<strong>${m.targetEmployee}</strong>さんへの依頼<br>シフト: ${dateDisplay} ${timeDisplay}<br>${m.message}</div><div class="message-actions"><button class="btn btn-success btn-sm" onclick="approveRequest('swap','${m.id}')">交代する</button><button class="btn btn-danger btn-sm" onclick="rejectRequest('swap','${m.id}')">お断り</button></div>`;
        }
        c.appendChild(card);
    });
}

// メッセージ削除
function deleteMessage(id) {
    state.messages = state.messages.filter(m => m.id !== id);
    saveToFirebase('messages', state.messages);
    updateMessageBar();
    renderMessages();
}

// 全メッセージ削除
function clearAllMessages() {
    if (confirm('全てのメッセージを削除しますか？')) {
        state.messages = [];
        saveToFirebase('messages', state.messages);
        updateMessageBar();
        renderMessages();
        alert('全てのメッセージを削除しました。');
    }
}

function render() { renderTimeHeader(); renderGanttBody(); renderLegend(); updatePeriodDisplay(); updateMessageBar(); renderScheduleList(); }

// モーダル操作
function openModal(o) { o.classList.add('active'); }
function closeModal(o) { 
    o.classList.remove('active'); 
    // シフトモーダルを閉じる時に固定シフト関連をリセット
    if (o.id === 'modalOverlay') {
        document.getElementById('fixedShift').disabled = false;
        document.getElementById('fixedShiftPeriod').style.display = 'none';
    }
}

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
    
    // 固定シフトの場合は有効期間セクションを表示し、値を設定
    const fixedShiftPeriod = document.getElementById('fixedShiftPeriod');
    if (s.isFixed) {
        fixedShiftPeriod.style.display = 'block';
        document.getElementById('fixedShift').disabled = true; // 固定シフト編集時はチェックを外せない
        document.getElementById('fixedStartDate').value = actualShift.startDate || '';
        if (actualShift.endDate) {
            document.getElementById('fixedNoEndDate').checked = false;
            document.getElementById('fixedEndDate').value = actualShift.endDate;
            document.getElementById('fixedEndDate').disabled = false;
        } else {
            document.getElementById('fixedNoEndDate').checked = true;
            document.getElementById('fixedEndDate').value = '';
            document.getElementById('fixedEndDate').disabled = true;
        }
    } else {
        fixedShiftPeriod.style.display = 'none';
        document.getElementById('fixedShift').disabled = false; // 通常シフト編集時は固定シフトに変換可能
        document.getElementById('fixedStartDate').value = actualShift.date || s.date;
        document.getElementById('fixedNoEndDate').checked = true;
        document.getElementById('fixedEndDate').value = '';
        document.getElementById('fixedEndDate').disabled = true;
    }
    
    document.querySelectorAll('.color-option').forEach(o => { o.classList.toggle('selected', o.dataset.color === actualShift.color); });
    state.selectedColor = actualShift.color;
    openModal(document.getElementById('modalOverlay'));
}

function openChangeModal() {
    const sel = document.getElementById('changeShiftSelect');
    sel.innerHTML = '<option value="">先に申請者を選択してください</option>';

    // 申請者を選択時にシフトをフィルタリング
    document.getElementById('changeApplicant').value = '';

    document.getElementById('changeDate').value = formatDate(new Date());
    document.getElementById('changeStart').value = 9;
    document.getElementById('changeEnd').value = 17;
    openModal(document.getElementById('changeModalOverlay'));
}

// 申請者に該当するシフトのみをドロップダウンに表示
function updateChangeShiftOptions(applicantName) {
    const sel = document.getElementById('changeShiftSelect');
    sel.innerHTML = '<option value="">選択してください</option>';

    if (!applicantName) {
        sel.innerHTML = '<option value="">先に申請者を選択してください</option>';
        return;
    }

    // 通常シフトを追加（申請者のみ）
    state.shifts.filter(s => s.name === applicantName).forEach(s => {
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = `${s.date} ${formatTime(s.startHour)}-${formatTime(s.endHour)}`;
        sel.appendChild(o);
    });

    // 現在の週の固定シフトも追加（申請者のみ）
    for (let i = 0; i < 7; i++) {
        const d = new Date(state.currentWeekStart);
        d.setDate(d.getDate() + i);
        const dateStr = formatDate(d);
        const dayOfWeek = d.getDay();
        state.fixedShifts.filter(f => f.dayOfWeek === dayOfWeek && f.name === applicantName).forEach(f => {
            const virtualId = `fx-${f.id}-${dateStr}`;
            const o = document.createElement('option');
            o.value = virtualId;
            o.textContent = `${dateStr} ${formatTime(f.startHour)}-${formatTime(f.endHour)} [固定]`;
            sel.appendChild(o);
        });
    }
}

function openSwapModal() {
    const sel = document.getElementById('swapShiftSelect');
    sel.innerHTML = '<option value="">先に申請者を選択してください</option>';

    // 申請者を選択時にシフトをフィルタリング
    document.getElementById('swapApplicant').value = '';

    openModal(document.getElementById('swapModalOverlay'));
}

// 申請者に該当するシフトのみをドロップダウンに表示（交代依頼用）
function updateSwapShiftOptions(applicantName) {
    const sel = document.getElementById('swapShiftSelect');
    sel.innerHTML = '<option value="">選択してください</option>';

    if (!applicantName) {
        sel.innerHTML = '<option value="">先に申請者を選択してください</option>';
        return;
    }

    // 通常シフトを追加（申請者のみ）
    state.shifts.filter(s => s.name === applicantName).forEach(s => {
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = `${s.date} ${formatTime(s.startHour)}-${formatTime(s.endHour)}`;
        sel.appendChild(o);
    });

    // 現在の週の固定シフトも追加（申請者のみ）
    for (let i = 0; i < 7; i++) {
        const d = new Date(state.currentWeekStart);
        d.setDate(d.getDate() + i);
        const dateStr = formatDate(d);
        const dayOfWeek = d.getDay();
        state.fixedShifts.filter(f => f.dayOfWeek === dayOfWeek && f.name === applicantName).forEach(f => {
            const virtualId = `fx-${f.id}-${dateStr}`;
            const o = document.createElement('option');
            o.value = virtualId;
            o.textContent = `${dateStr} ${formatTime(f.startHour)}-${formatTime(f.endHour)} [固定]`;
            sel.appendChild(o);
        });
    }
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
    document.querySelectorAll('.admin-tab').forEach(t => t.onclick = () => { document.querySelectorAll('.admin-tab').forEach(x => x.classList.remove('active')); t.classList.add('active'); state.activeAdminTab = t.dataset.tab; updateAdminMenuTriggerLabel(); closeAdminMenuModal(); renderAdminPanel(); });

    // 管理者メニュー（ポップアップ）開閉
    const adminMenuTrigger = document.getElementById('adminMenuTrigger');
    const adminMenuModalOverlay = document.getElementById('adminMenuModalOverlay');
    const adminMenuModalClose = document.getElementById('adminMenuModalClose');
    if (adminMenuTrigger) adminMenuTrigger.onclick = openAdminMenuModal;
    if (adminMenuModalClose) adminMenuModalClose.onclick = closeAdminMenuModal;
    if (adminMenuModalOverlay) adminMenuModalOverlay.onclick = (e) => { if (e.target === adminMenuModalOverlay) closeAdminMenuModal(); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && adminMenuModalOverlay && adminMenuModalOverlay.classList.contains('active')) closeAdminMenuModal(); });
    updateAdminMenuTriggerLabel();

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
        document.getElementById('fixedShiftPeriod').style.display = 'none';
        document.getElementById('fixedStartDate').value = '';
        document.getElementById('fixedEndDate').value = '';
        document.getElementById('fixedNoEndDate').checked = true;
        document.getElementById('fixedEndDate').disabled = true;
        document.querySelectorAll('.color-option').forEach((o, i) => o.classList.toggle('selected', i === 0));
        state.selectedColor = '#6366f1';
        openModal(document.getElementById('modalOverlay'));
    };

    // 固定シフトチェックボックスのトグル
    document.getElementById('fixedShift').onchange = (e) => {
        const periodDiv = document.getElementById('fixedShiftPeriod');
        periodDiv.style.display = e.target.checked ? 'block' : 'none';
        if (e.target.checked) {
            // 開始日のデフォルトを選択された日付に
            const shiftDate = document.getElementById('shiftDate').value;
            if (shiftDate && !document.getElementById('fixedStartDate').value) {
                document.getElementById('fixedStartDate').value = shiftDate;
            }
        }
    };

    // 終了日なしチェックボックスのトグル
    document.getElementById('fixedNoEndDate').onchange = (e) => {
        const endDateInput = document.getElementById('fixedEndDate');
        endDateInput.disabled = e.target.checked;
        if (e.target.checked) {
            endDateInput.value = '';
        }
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
    document.getElementById('changeShiftSelect').onchange = e => {
        const sid = e.target.value;
        let shiftData = null;

        if (sid.startsWith('fx-')) {
            // 固定シフトの場合: fx-{originalId}-{dateStr} 形式
            const parts = sid.split('-');
            const originalId = parts[1];
            const dateStr = parts.slice(2).join('-'); // 日付部分を結合
            const fixed = state.fixedShifts.find(f => f.id === originalId);
            if (fixed) {
                shiftData = { date: dateStr, startHour: fixed.startHour, endHour: fixed.endHour };
            }
        } else {
            const s = state.shifts.find(x => x.id === sid);
            if (s) {
                shiftData = { date: s.date, startHour: s.startHour, endHour: s.endHour };
            }
        }

        if (shiftData) {
            document.getElementById('changeDate').value = shiftData.date;
            document.getElementById('changeStart').value = shiftData.startHour;
            document.getElementById('changeEnd').value = shiftData.endHour;
        }
    };

    // 申請者選択時にシフトドロップダウンを更新
    document.getElementById('changeApplicant').onchange = e => {
        updateChangeShiftOptions(e.target.value);
    };

    document.getElementById('shiftSwapBtn').onclick = openSwapModal;
    document.getElementById('swapModalClose').onclick = () => closeModal(document.getElementById('swapModalOverlay'));
    document.getElementById('swapCancelBtn').onclick = () => closeModal(document.getElementById('swapModalOverlay'));
    document.getElementById('swapModalOverlay').onclick = e => { if (e.target.id === 'swapModalOverlay') closeModal(document.getElementById('swapModalOverlay')); };

    // 申請者選択時にシフトドロップダウンを更新（交代依頼用）
    document.getElementById('swapApplicant').onchange = e => {
        updateSwapShiftOptions(e.target.value);
    };

    document.getElementById('requestLeaveBtn').onclick = () => { 
        document.getElementById('leaveName').value = '';
        document.getElementById('leaveShiftList').innerHTML = '<p class="no-shift-message">申請者を選択してください</p>';
        openModal(document.getElementById('leaveModalOverlay')); 
    };
    document.getElementById('leaveModalClose').onclick = () => closeModal(document.getElementById('leaveModalOverlay'));
    document.getElementById('leaveCancelBtn').onclick = () => closeModal(document.getElementById('leaveModalOverlay'));
    document.getElementById('leaveModalOverlay').onclick = e => { if (e.target.id === 'leaveModalOverlay') closeModal(document.getElementById('leaveModalOverlay')); };

    // 休日申請モーダル
    document.getElementById('requestHolidayBtn').onclick = () => {
        document.getElementById('holidayName').value = '';
        document.getElementById('holidayShiftList').innerHTML = '<p class="no-shift-message">申請者を選択してください</p>';
        document.getElementById('holidayTimeRangeGroup').style.display = 'none';
        document.getElementById('holidaySwapPartnerGroup').style.display = 'none';
        document.querySelectorAll('input[name="holidaySwapRequested"]').forEach(r => {
            if (r.value === 'no') r.checked = true;
        });
        openModal(document.getElementById('holidayModalOverlay'));
    };
    document.getElementById('holidayModalClose').onclick = () => closeModal(document.getElementById('holidayModalOverlay'));
    document.getElementById('holidayCancelBtn').onclick = () => closeModal(document.getElementById('holidayModalOverlay'));
    document.getElementById('holidayModalOverlay').onclick = e => { if (e.target.id === 'holidayModalOverlay') closeModal(document.getElementById('holidayModalOverlay')); };

    // シフト交代の有無でフィールドの表示切り替え
    document.querySelectorAll('input[name="holidaySwapRequested"]').forEach(radio => {
        radio.onchange = () => {
            const isYes = document.querySelector('input[name="holidaySwapRequested"]:checked').value === 'yes';
            document.getElementById('holidaySwapPartnerGroup').style.display = isYes ? 'block' : 'none';
        };
    });


    document.getElementById('pinModalClose').onclick = () => closeModal(document.getElementById('pinModalOverlay'));
    document.getElementById('pinCancelBtn').onclick = () => closeModal(document.getElementById('pinModalOverlay'));
    document.getElementById('pinModalOverlay').onclick = e => { if (e.target.id === 'pinModalOverlay') closeModal(document.getElementById('pinModalOverlay')); };
    document.getElementById('pinForm').onsubmit = e => { e.preventDefault(); if (verifyPin(document.getElementById('adminPin').value)) { closeModal(document.getElementById('pinModalOverlay')); switchToAdmin(); } else { document.getElementById('pinError').style.display = 'block'; document.getElementById('adminPin').value = ''; } };

    document.getElementById('viewMessagesBtn').onclick = () => { trackUsage('view_messages', '匿名'); renderMessages(); openModal(document.getElementById('messagesModalOverlay')); };
    document.getElementById('messagesModalClose').onclick = () => closeModal(document.getElementById('messagesModalOverlay'));
    document.getElementById('messagesModalOverlay').onclick = e => { if (e.target.id === 'messagesModalOverlay') closeModal(document.getElementById('messagesModalOverlay')); };

    document.getElementById('employeeModalClose').onclick = () => closeModal(document.getElementById('employeeModalOverlay'));
    document.getElementById('employeeCancelBtn').onclick = () => closeModal(document.getElementById('employeeModalOverlay'));
    document.getElementById('employeeModalOverlay').onclick = e => { if (e.target.id === 'employeeModalOverlay') closeModal(document.getElementById('employeeModalOverlay')); };
    document.getElementById('employeeForm').onsubmit = e => {
        e.preventDefault();

        // 発注担当分類を取得
        const orderCategories = [];
        document.querySelectorAll('input[name="orderCategory"]:checked').forEach(cb => {
            orderCategories.push(cb.value);
        });

        const employeeData = {
            name: document.getElementById('employeeName').value.trim(),
            role: document.getElementById('employeeRole').value,
            shiftTime: document.getElementById('employeeShiftTime').value,
            orderCategories: orderCategories
        };

        const editId = document.getElementById('editEmployeeId').value;
        if (editId) {
            // 編集モード
            updateEmployee(editId, employeeData);
            alert('従業員情報を更新しました');
        } else {
            // 追加モード
            addEmployee(employeeData);
            alert('従業員を追加しました');
        }

        closeModal(document.getElementById('employeeModalOverlay'));
        document.getElementById('employeeForm').reset();
        document.getElementById('editEmployeeId').value = '';
    };

    // 臨時シフト（特別イベント）モーダルのイベントリスナー
    document.getElementById('specialEventModalClose').onclick = () => closeModal(document.getElementById('specialEventModalOverlay'));
    document.getElementById('specialEventCancelBtn').onclick = () => closeModal(document.getElementById('specialEventModalOverlay'));
    document.getElementById('specialEventModalOverlay').onclick = e => { if (e.target.id === 'specialEventModalOverlay') closeModal(document.getElementById('specialEventModalOverlay')); };
    document.getElementById('specialEventForm').onsubmit = e => {
        e.preventDefault();
        const id = document.getElementById('editSpecialEventId').value;
        const d = {
            date: document.getElementById('specialEventDate').value,
            eventName: document.getElementById('specialEventName').value.trim(),
            description: document.getElementById('specialEventDescription').value.trim(),
            suppressFixed: document.getElementById('suppressFixedShifts').checked
        };
        if (!d.date || !d.eventName) { alert('日付とイベント名を入力してください'); return; }
        
        // 重複チェック（編集時は自身を除外）
        const duplicate = state.specialEvents.find(x => x.date === d.date && x.id !== id);
        if (duplicate) { alert('この日付には既にイベントが登録されています'); return; }
        
        if (id) {
            updateSpecialEvent(id, d);
            alert('イベントを更新しました');
        } else {
            addSpecialEvent(d);
            alert('イベント日を追加しました。\nこの日のシフトは「シフト追加」から個別に登録してください。');
        }
        closeModal(document.getElementById('specialEventModalOverlay'));
        document.getElementById('specialEventForm').reset();
    };

    // ========================================
    // タスクモーダルのイベントハンドラー
    // ========================================
    document.getElementById('taskModalClose').onclick = () => closeModal(document.getElementById('taskModalOverlay'));
    document.getElementById('taskModalCancelBtn').onclick = () => closeModal(document.getElementById('taskModalOverlay'));
    document.getElementById('taskModalOverlay').onclick = e => { if (e.target.id === 'taskModalOverlay') closeModal(document.getElementById('taskModalOverlay')); };
    
    document.getElementById('addTaskBtn').onclick = () => handleAddOrUpdateTask();
    
    // タスクカラー選択
    document.querySelectorAll('#taskColorPicker .task-color-option').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            selectedTaskColor = btn.dataset.color;
            document.querySelectorAll('#taskColorPicker .task-color-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        };
    });

    document.getElementById('broadcastModalClose').onclick = () => closeModal(document.getElementById('broadcastModalOverlay'));
    document.getElementById('broadcastCancelBtn').onclick = () => closeModal(document.getElementById('broadcastModalOverlay'));
    document.getElementById('broadcastModalOverlay').onclick = e => { if (e.target.id === 'broadcastModalOverlay') closeModal(document.getElementById('broadcastModalOverlay')); };
    document.getElementById('broadcastForm').onsubmit = e => { e.preventDefault(); sendBroadcast(document.getElementById('broadcastTitle').value.trim(), document.getElementById('broadcastMessage').value.trim()); closeModal(document.getElementById('broadcastModalOverlay')); document.getElementById('broadcastForm').reset(); alert('全従業員にメッセージを送信しました'); };

    document.querySelectorAll('.color-option').forEach(o => o.onclick = (e) => { 
        e.preventDefault();
        e.stopPropagation();
        const color = o.dataset.color;
        // 色が正しく取得できた場合のみ処理
        if (color && color.startsWith('#')) {
            document.querySelectorAll('.color-option').forEach(x => x.classList.remove('selected')); 
            o.classList.add('selected'); 
            state.selectedColor = color;
        }
    });

    document.getElementById('shiftForm').onsubmit = e => {
        e.preventDefault();
        const id = document.getElementById('editShiftId').value;
        const isFixedChecked = document.getElementById('fixedShift').checked;
        // 色のバリデーション - 正しくない場合はデフォルト色を使用
        const validColor = (state.selectedColor && state.selectedColor.startsWith('#') && state.selectedColor.length >= 4) ? state.selectedColor : '#6366f1';
        const d = { date: document.getElementById('shiftDate').value, name: document.getElementById('shiftName').value, startHour: +document.getElementById('shiftStart').value, endHour: +document.getElementById('shiftEnd').value, color: validColor, overnight: document.getElementById('overnightShift').checked };
        if (!d.overnight && d.startHour >= d.endHour) { alert('終了時刻は開始時刻より後に'); return; }
        if (d.overnight && d.startHour <= d.endHour) { alert('夜勤は終了時刻を翌日の時刻に'); return; }

        // 固定シフトの場合、有効期間を追加
        if (isFixedChecked) {
            const fixedStartDate = document.getElementById('fixedStartDate').value;
            const fixedNoEndDate = document.getElementById('fixedNoEndDate').checked;
            const fixedEndDate = document.getElementById('fixedEndDate').value;
            
            d.fixedStartDate = fixedStartDate || null;
            d.fixedEndDate = fixedNoEndDate ? null : (fixedEndDate || null);
        }

        if (id) {
            // 編集の場合：固定シフトか通常シフトかを判定
            const isCurrentlyFixedShift = state.fixedShifts.some(s => s.id === id);
            const isCurrentlyNormalShift = state.shifts.some(s => s.id === id);
            
            if (isCurrentlyFixedShift) {
                // 固定シフトの編集時も有効期間を取得
                const fixedStartDate = document.getElementById('fixedStartDate').value;
                const fixedNoEndDate = document.getElementById('fixedNoEndDate').checked;
                const fixedEndDate = document.getElementById('fixedEndDate').value;
                d.fixedStartDate = fixedStartDate || null;
                d.fixedEndDate = fixedNoEndDate ? null : (fixedEndDate || null);
                updateFixedShift(id, d);
            } else if (isCurrentlyNormalShift && isFixedChecked) {
                // 通常シフトを固定シフトに変換する場合
                // 1. 通常シフトを削除
                deleteShift(id);
                // 2. 固定シフトとして新規追加
                addFixedShift(d);
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
        // 有効期間セクションを非表示に戻す
        document.getElementById('fixedShiftPeriod').style.display = 'none';
        document.getElementById('fixedNoEndDate').checked = true;
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

        // 固定シフトの場合はIDから元のシフト情報を取得
        let shiftName;
        if (sid.startsWith('fx-')) {
            const parts = sid.split('-');
            const originalId = parts[1];
            const fixed = state.fixedShifts.find(f => f.id === originalId);
            shiftName = fixed ? fixed.name : '不明';
        } else {
            const s = state.shifts.find(x => x.id === sid);
            shiftName = s ? s.name : '不明';
        }

        addSwapRequest({ applicant, shiftId: sid, fromEmployee: shiftName, targetEmployee: document.getElementById('swapTargetEmployee').value, message: document.getElementById('swapMessage').value.trim() });
        closeModal(document.getElementById('swapModalOverlay'));
        document.getElementById('swapForm').reset();
        alert('シフト交代依頼を送信しました');
    };

    document.getElementById('leaveForm').onsubmit = e => {
        e.preventDefault();
        const name = document.getElementById('leaveName').value;
        
        // 選択されたシフトを取得
        const selectedShifts = [];
        document.querySelectorAll('#leaveShiftList .shift-selection-checkbox:checked').forEach(cb => {
            const item = cb.closest('.shift-selection-item');
            const shiftData = JSON.parse(item.dataset.shiftInfo);
            selectedShifts.push(shiftData);
        });
        
        if (selectedShifts.length === 0) {
            alert('有給を取得したいシフトを1つ以上選択してください');
            return;
        }
        
        // 複数シフトの有給申請を作成
        addLeaveRequestMultiple(name, selectedShifts);
        closeModal(document.getElementById('leaveModalOverlay'));
        document.getElementById('leaveForm').reset();
        document.getElementById('leaveShiftList').innerHTML = '<p class="no-shift-message">申請者を選択してください</p>';
        alert('有給申請を送信しました');
    };

    document.getElementById('holidayForm').onsubmit = e => {
        e.preventDefault();
        const name = document.getElementById('holidayName').value;
        const swapRequested = document.querySelector('input[name="holidaySwapRequested"]:checked').value === 'yes';
        
        // 選択されたシフトを取得
        const selectedShifts = [];
        document.querySelectorAll('#holidayShiftList .shift-selection-checkbox:checked').forEach(cb => {
            const item = cb.closest('.shift-selection-item');
            const shiftData = JSON.parse(item.dataset.shiftInfo);
            selectedShifts.push(shiftData);
        });
        
        if (selectedShifts.length === 0) {
            alert('休日を申請したいシフトを1つ以上選択してください');
            return;
        }
        
        // 時間帯指定の取得
        const customStartTime = document.getElementById('holidayStartTime').value;
        const customEndTime = document.getElementById('holidayEndTime').value;
        
        if (swapRequested && !document.getElementById('holidaySwapPartner').value) { 
            alert('シフト交代相手を選択してください'); 
            return; 
        }
        
        // 複数シフトの休日申請を作成
        addHolidayRequestMultiple(name, selectedShifts, {
            swapRequested: swapRequested,
            swapPartner: swapRequested ? document.getElementById('holidaySwapPartner').value : null,
            reason: document.getElementById('holidayReason').value.trim(),
            customStartTime: customStartTime || null,
            customEndTime: customEndTime || null
        });
        closeModal(document.getElementById('holidayModalOverlay'));
        document.getElementById('holidayForm').reset();
        document.getElementById('holidayShiftList').innerHTML = '<p class="no-shift-message">申請者を選択してください</p>';
        document.getElementById('holidayTimeRangeGroup').style.display = 'none';
        alert('休日申請を送信しました');
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
    trackUsage('export_pdf', state.isAdmin ? '管理者' : '匿名');
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
            orientation: 'portrait'
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
    trackUsage('print_shift', state.isAdmin ? '管理者' : '匿名');
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
// 単日上書き（この日のみ変更）機能
// ========================================
function openShiftOverrideModal(shift) {
    // 固定シフトのIDを取得
    const parts = shift.id.split('-');
    const fixedShiftId = parts[1];
    const dateStr = shift.date;
    
    // 元の固定シフトを取得
    const fixedShift = state.fixedShifts.find(f => f.id === fixedShiftId);
    if (!fixedShift) return;
    
    // 既存の上書きがあるか確認
    const existingOverride = state.shiftOverrides.find(o => 
        o.fixedShiftId === fixedShiftId && o.date === dateStr
    );
    
    const currentStartHour = existingOverride ? existingOverride.startHour : fixedShift.startHour;
    const currentEndHour = existingOverride ? existingOverride.endHour : fixedShift.endHour;
    const currentOvernight = existingOverride ? existingOverride.overnight : (fixedShift.overnight || false);
    const currentIsDayOff = existingOverride ? (existingOverride.isDayOff || false) : false;
    
    // モーダル作成
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay category-modal-overlay active';
    overlay.id = 'overrideModalOverlay';
    
    const hourOptions = Array.from({ length: 48 }, (_, i) => {
        const v = i * 0.5;
        return `<option value="${v}" ${v === currentStartHour ? 'selected' : ''}>${formatTime(v)}</option>`;
    }).join('');

    const hourOptionsEnd = Array.from({ length: 48 }, (_, i) => {
        const v = i * 0.5;
        return `<option value="${v}" ${v === currentEndHour ? 'selected' : ''}>${formatTime(v)}</option>`;
    }).join('');
    
    overlay.innerHTML = `
        <div class="modal category-modal" style="max-width: 400px;">
            <div class="modal-header">
                <h2 class="modal-title">📝 この日のみ変更</h2>
                <button class="modal-close" onclick="closeOverrideModal()">×</button>
            </div>
            <div class="modal-body">
                <div class="override-info" style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                    <p style="margin: 0 0 8px 0; font-weight: 600;">📅 ${dateStr} のみの変更</p>
                    <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">
                        元の固定シフト: ${fixedShift.name} ${formatTime(fixedShift.startHour)}〜${formatTime(fixedShift.endHour)}
                    </p>
                </div>
                
                <div class="form-group checkbox-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="overrideDayOff" ${currentIsDayOff ? 'checked' : ''} onchange="toggleOverrideDayOff()">
                        <span>🏖️ この日を休日にする</span>
                    </label>
                </div>

                <div id="overrideTimeFields" style="${currentIsDayOff ? 'display:none;' : ''}">
                    <div class="form-group">
                        <label>開始時刻</label>
                        <select id="overrideStartHour" class="form-control">
                            ${hourOptions}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>終了時刻</label>
                        <select id="overrideEndHour" class="form-control">
                            ${hourOptionsEnd}
                        </select>
                    </div>

                    <div class="form-group checkbox-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="overrideOvernight" ${currentOvernight ? 'checked' : ''}>
                            <span>🌙 夜勤（翌日に跨ぐ）</span>
                        </label>
                    </div>
                </div>
                
                ${existingOverride ? `
                <div class="form-group" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color);">
                    <button type="button" class="btn btn-outline-danger btn-sm" onclick="deleteOverrideAndClose('${existingOverride.id}')" style="width: 100%;">
                        🗑️ 単日変更を削除（元のシフトに戻す）
                    </button>
                </div>
                ` : ''}
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeOverrideModal()">キャンセル</button>
                <button type="button" class="btn btn-primary" onclick="saveShiftOverride('${fixedShiftId}', '${dateStr}', ${existingOverride ? `'${existingOverride.id}'` : 'null'})">
                    ${existingOverride ? '更新' : '変更を保存'}
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

function toggleOverrideDayOff() {
    const isDayOff = document.getElementById('overrideDayOff').checked;
    const timeFields = document.getElementById('overrideTimeFields');
    if (timeFields) {
        timeFields.style.display = isDayOff ? 'none' : '';
    }
}

function closeOverrideModal() {
    const overlay = document.getElementById('overrideModalOverlay');
    if (overlay) {
        overlay.remove();
    }
}

function saveShiftOverride(fixedShiftId, dateStr, existingOverrideId) {
    const isDayOff = document.getElementById('overrideDayOff').checked;
    const startHour = parseFloat(document.getElementById('overrideStartHour').value);
    const endHour = parseFloat(document.getElementById('overrideEndHour').value);
    const overnight = document.getElementById('overrideOvernight').checked;

    const overrideData = {
        fixedShiftId,
        date: dateStr,
        startHour,
        endHour,
        overnight,
        isDayOff
    };
    
    if (existingOverrideId) {
        updateShiftOverride(existingOverrideId, overrideData);
    } else {
        addShiftOverride(overrideData);
    }
    
    closeOverrideModal();
    render();
}

function deleteOverrideAndClose(overrideId) {
    if (confirm('単日変更を削除しますか？\n元の固定シフトの時間に戻ります。')) {
        deleteShiftOverride(overrideId);
        closeOverrideModal();
        render();
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
                        // 固定シフトの場合
                        const parts = s.id.split('-');
                        deleteFixedShift(parts[1]);
                    } else if (s.isOvernightContinuation && s.id.startsWith('on-')) {
                        // 夜勤継続シフトの場合、元のシフトを削除
                        const originalId = s.id.replace('on-', '');
                        deleteShift(originalId);
                    } else {
                        // 通常シフトの場合
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

    // 業務内容ボタン
    const taskBtn = document.getElementById('popoverTaskBtn');
    const handleTask = () => {
        if (state.currentPopoverShift) {
            const shift = state.currentPopoverShift;
            closeShiftPopover();
            setTimeout(() => {
                openTaskModal(shift);
            }, 100);
        }
    };
    if (taskBtn) {
        taskBtn.onclick = handleTask;
        taskBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleTask();
        }, { passive: false });
    }

    // 休みボタン
    const dayOffBtn = document.getElementById('popoverDayOffBtn');
    const handleDayOff = () => {
        if (state.currentPopoverShift) {
            const s = state.currentPopoverShift;
            closeShiftPopover();
            setTimeout(() => {
                if (confirm('このシフトを休みにしますか？\nシフトが削除され、休日バーが表示されます。')) {
                    // シフトの担当者名と日付を取得
                    let name, date;
                    if (s.isFixed) {
                        const parts = s.id.split('-');
                        const originalId = parts[1];
                        const fixed = state.fixedShifts.find(f => f.id === originalId);
                        if (fixed) {
                            name = fixed.name;
                            date = s.date;
                        }
                    } else if (s.isOvernightContinuation && s.id.startsWith('on-')) {
                        const originalId = s.id.replace('on-', '');
                        const original = state.shifts.find(x => x.id === originalId);
                        if (original) {
                            name = original.name;
                            date = original.date;
                        }
                    } else {
                        name = s.name;
                        date = s.date;
                    }

                    if (name && date) {
                        // シフトの時間情報も取得
                        let startHour, endHour, overnight;
                        if (s.isFixed) {
                            const parts = s.id.split('-');
                            const originalId = parts[1];
                            const fixed = state.fixedShifts.find(f => f.id === originalId);
                            if (fixed) {
                                startHour = fixed.startHour;
                                endHour = fixed.endHour;
                                overnight = fixed.overnight || false;
                            }
                        } else if (s.isOvernightContinuation && s.id.startsWith('on-')) {
                            const originalId = s.id.replace('on-', '');
                            const original = state.shifts.find(x => x.id === originalId);
                            if (original) {
                                startHour = original.startHour;
                                endHour = original.endHour;
                                overnight = original.overnight || false;
                            }
                        } else {
                            startHour = s.startHour;
                            endHour = s.endHour;
                            overnight = s.overnight || false;
                        }

                        // 承認済みの休日リクエストを直接追加（管理者による即時承認）
                        const holidayRequest = {
                            id: Date.now().toString(),
                            name: name,
                            startDate: date,
                            endDate: date,
                            startHour: startHour,
                            endHour: endHour,
                            overnight: overnight,
                            reason: '突発的な休み',
                            swapRequested: false,
                            swapPartner: null,
                            status: 'approved',
                            createdAt: new Date().toISOString(),
                            approvedAt: new Date().toISOString(),
                            processedBy: '管理者（即時承認）'
                        };
                        state.holidayRequests.push(holidayRequest);
                        saveToFirebase('holidayRequests', state.holidayRequests);

                        // シフトを削除
                        if (s.isFixed) {
                            // 固定シフトの場合は削除しない（休日バーだけ表示）
                            // 必要に応じて固定シフトを削除する場合はコメントアウトを解除
                            // const parts = s.id.split('-');
                            // deleteFixedShift(parts[1]);
                        } else if (s.isOvernightContinuation && s.id.startsWith('on-')) {
                            const originalId = s.id.replace('on-', '');
                            deleteShift(originalId);
                        } else {
                            deleteShift(s.id);
                        }

                        alert('休みに変更しました。');
                        render();
                    }
                }
            }, 100);
        }
    };


    if (dayOffBtn) {
        dayOffBtn.onclick = handleDayOff;
        dayOffBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDayOff();
        }, { passive: false });
    }

    // 有給ボタン（管理者のみ）
    const paidLeaveBtn = document.getElementById('popoverPaidLeaveBtn');
    const handlePaidLeave = () => {
        if (!state.isAdmin) return;
        if (!state.currentPopoverShift) return;

        const s = state.currentPopoverShift;
        closeShiftPopover();
        setTimeout(() => {
            if (!confirm('このシフトを有給にしますか？\nシフトが削除され、有給バーが表示されます。')) return;

            // シフトの担当者名・日付・時刻を取得
            let name, date, startHour, endHour, overnight, isFixed = false, fixedShiftId = null;
            if (s.isFixed) {
                const parts = s.id.split('-');
                const originalId = parts[1];
                const fixed = state.fixedShifts.find(f => f.id === originalId);
                if (fixed) {
                    name = fixed.name;
                    date = s.date;
                    startHour = fixed.startHour;
                    endHour = fixed.endHour;
                    overnight = fixed.overnight || false;
                    isFixed = true;
                    fixedShiftId = fixed.id;
                }
            } else if (s.isOvernightContinuation && s.id.startsWith('on-')) {
                const originalId = s.id.replace('on-', '');
                const original = state.shifts.find(x => x.id === originalId);
                if (original) {
                    name = original.name;
                    date = original.date;
                    startHour = original.startHour;
                    endHour = original.endHour;
                    overnight = original.overnight || false;
                }
            } else {
                name = s.name;
                date = s.date;
                startHour = s.startHour;
                endHour = s.endHour;
                overnight = s.overnight || false;
            }

            if (!name || !date) {
                alert('シフト情報の取得に失敗しました。');
                return;
            }

            // pendingで有給申請を作成し、既存の承認処理で即承認
            // → シフト削除/上書き/バックアップが全て自動で揃う
            const selectedShift = {
                date: date,
                startHour: startHour,
                endHour: endHour,
                overnight: overnight
            };
            if (isFixed) {
                selectedShift.isFixed = true;
                selectedShift.fixedShiftId = fixedShiftId;
            }

            const leaveRequest = {
                id: Date.now().toString(),
                name: name,
                startDate: date,
                endDate: date,
                selectedShifts: [selectedShift],
                reason: '有給休暇（管理者即時承認）',
                status: 'pending',
                createdAt: new Date().toISOString()
            };
            state.leaveRequests.push(leaveRequest);
            // approveRequest が再度 saveToFirebase('leaveRequests', ...) を実行するので
            // ここでの保存は省略可能（次行でまとめて保存される）

            approveRequest('leave', leaveRequest.id);
            alert('有給に変更しました。');
        }, 100);
    };

    if (paidLeaveBtn) {
        paidLeaveBtn.onclick = handlePaidLeave;
        paidLeaveBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handlePaidLeave();
        }, { passive: false });
    }

    // 午前半休ボタン
    const morningHalfDayBtn = document.getElementById('popoverMorningHalfDayBtn');
    const handleMorningHalfDay = () => {
        if (state.currentPopoverShift) {
            const s = state.currentPopoverShift;
            closeShiftPopover();
            setTimeout(() => {
                if (confirm('このシフトを午前半休にしますか？\n午前中（〜12:00）が休みになります。')) {
                    createHalfDayOff(s, 'morning');
                }
            }, 100);
        }
    };

    if (morningHalfDayBtn) {
        morningHalfDayBtn.onclick = handleMorningHalfDay;
        morningHalfDayBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleMorningHalfDay();
        }, { passive: false });
    }

    // 午後半休ボタン
    const afternoonHalfDayBtn = document.getElementById('popoverAfternoonHalfDayBtn');
    const handleAfternoonHalfDay = () => {
        if (state.currentPopoverShift) {
            const s = state.currentPopoverShift;
            closeShiftPopover();
            setTimeout(() => {
                if (confirm('このシフトを午後半休にしますか？\n午後（12:00〜）が休みになります。')) {
                    createHalfDayOff(s, 'afternoon');
                }
            }, 100);
        }
    };

    if (afternoonHalfDayBtn) {
        afternoonHalfDayBtn.onclick = handleAfternoonHalfDay;
        afternoonHalfDayBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleAfternoonHalfDay();
        }, { passive: false });
    }

    // 「この日のみ変更」ボタン
    const overrideBtn = document.getElementById('popoverOverrideBtn');
    const handleOverride = () => {
        if (state.currentPopoverShift && state.currentPopoverShift.isFixed) {
            const s = state.currentPopoverShift;
            closeShiftPopover();
            setTimeout(() => {
                openShiftOverrideModal(s);
            }, 100);
        }
    };

    if (overrideBtn) {
        overrideBtn.onclick = handleOverride;
        overrideBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleOverride();
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
    // アプリ閲覧をトラッキング
    trackUsage('app_view', '匿名');
    
    initTimeSelects();
    initEventListeners();
    initZoomControls();
    initPdfExport();
    initPopoverEvents();
    initEventModal();
    initAdvisorGroupToggle(); // グループトグルを初期化
    initReportsGroupToggle(); // レポートグループのトグルを初期化
    initTrendReportToggle(); // コンビニ3社 新商品ヒット予測レポートのトグルを初期化
    initNewProductToggle(); // 週次インテリジェンス（マクロ環境）のトグルを初期化
    initProductResearchToggle(); // 新規商品調査レポートのトグルを初期化
    loadData();
    render();

    // 天気データを取得
    fetchWeatherData();

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

// ========================================
// イベント（店舗スケジュール）関連の関数
// ========================================

// イベントタイプとアイコンのマッピング
function getEventTypeIcons() {
    return {
        sale: '🏷️',
        notice: '📢',
        training: '📚',
        inventory: '📦',
        delivery: '🚚',
        other: '📌'
    };
}

// イベントタイプ名を取得
function getEventTypeName(type) {
    const names = {
        sale: 'セール',
        notice: '連絡事項',
        training: '研修',
        inventory: '棚卸',
        delivery: '特発納品',
        other: 'その他'
    };
    return names[type] || 'その他';
}

// イベント追加
function addDailyEvent(data) {
    const event = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        ...data
    };
    state.dailyEvents.push(event);
    saveToFirebase('dailyEvents', state.dailyEvents);
    trackUsage('add_daily_event', '管理者');
}

// イベント更新
function updateDailyEvent(id, data) {
    const index = state.dailyEvents.findIndex(e => e.id === id);
    if (index >= 0) {
        state.dailyEvents[index] = { ...state.dailyEvents[index], ...data };
        saveToFirebase('dailyEvents', state.dailyEvents);
        trackUsage('edit_daily_event', '管理者');
    }
}

// イベント削除
function deleteDailyEvent(id) {
    state.dailyEvents = state.dailyEvents.filter(e => e.id !== id);
    saveToFirebase('dailyEvents', state.dailyEvents);
}

// イベント詳細ポップオーバーを表示
function showEventPopover(dateStr, event) {
    const popover = document.getElementById('eventPopover');
    const body = document.getElementById('eventPopoverBody');

    // 期間内にある日付を含むイベントを取得
    const dayEvents = state.dailyEvents.filter(e => {
        const startDate = e.startDate || e.date; // 後方互換性
        const endDate = e.endDate || e.date;
        return dateStr >= startDate && dateStr <= endDate;
    });
    if (dayEvents.length === 0) return;

    // 日付を表示用にフォーマット
    const dateObj = new Date(dateStr);
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dateDisplay = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日（${dayNames[dateObj.getDay()]}）`;

    document.getElementById('eventPopoverTitle').textContent = `📅 ${dateDisplay}`;

    const icons = getEventTypeIcons();

    // イベント一覧を生成
    let html = '';
    dayEvents.forEach(e => {
        const icon = icons[e.type] || icons.other;
        html += `
            <div class="event-list-item">
                <div class="event-item-header">
                    <span class="event-item-icon">${icon}</span>
                    <span class="event-item-title">${e.title}</span>
                </div>
                ${e.description ? `<div class="event-item-description">${e.description.replace(/\n/g, '<br>')}</div>` : ''}
                ${state.isAdmin ? `
                <div class="event-item-actions">
                    <button class="btn btn-sm btn-secondary" onclick="openEditEventModal('${e.id}')">✏️ 編集</button>
                    <button class="btn btn-sm btn-danger" onclick="confirmDeleteEvent('${e.id}')">🗑️ 削除</button>
                </div>` : ''}
            </div>
        `;
    });

    body.innerHTML = html;

    // ポップオーバーの位置を計算
    const popoverWidth = 320;
    const popoverHeight = 250;
    let left, top;

    if (event.target) {
        const rect = event.target.getBoundingClientRect();
        left = rect.right + 10;
        top = rect.top;

        // 右にはみ出す場合は左に配置
        if (left + popoverWidth > window.innerWidth - 10) {
            left = rect.left - popoverWidth - 10;
        }
    } else if (event.clientX !== undefined) {
        left = event.clientX;
        top = event.clientY;
    } else {
        left = (window.innerWidth - popoverWidth) / 2;
        top = (window.innerHeight - popoverHeight) / 2;
    }

    // はみ出し調整
    if (left < 10) left = 10;
    if (left + popoverWidth > window.innerWidth - 10) {
        left = window.innerWidth - popoverWidth - 10;
    }
    if (top < 10) top = 10;
    if (top + popoverHeight > window.innerHeight - 10) {
        top = window.innerHeight - popoverHeight - 10;
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.classList.add('show');
}

// イベントポップオーバーを閉じる
function closeEventPopover() {
    const popover = document.getElementById('eventPopover');
    popover.classList.remove('show');
}

// イベント削除確認
function confirmDeleteEvent(id) {
    const event = state.dailyEvents.find(e => e.id === id);
    if (event && confirm(`「${event.title}」を削除しますか？`)) {
        trackUsage('delete_daily_event', '管理者');
        deleteDailyEvent(id);
        closeEventPopover();
        render();
        if (state.isAdmin) renderAdminPanel();
    }
}

// イベント追加モーダルを開く
function openEventModal(date = null) {
    const overlay = document.getElementById('eventModalOverlay');
    const today = formatDate(new Date());
    document.getElementById('eventModalTitle').textContent = '📅 イベント追加';
    document.getElementById('editEventId').value = '';
    document.getElementById('eventStartDate').value = date || today;
    document.getElementById('eventEndDate').value = date || today;
    document.getElementById('eventType').value = 'notice';
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventDescription').value = '';
    document.getElementById('eventSubmitBtn').textContent = '追加';
    overlay.classList.add('active');
}

// イベント編集モーダルを開く
function openEditEventModal(id) {
    closeEventPopover();
    const event = state.dailyEvents.find(e => e.id === id);
    if (!event) return;

    const overlay = document.getElementById('eventModalOverlay');
    document.getElementById('eventModalTitle').textContent = '📅 イベント編集';
    document.getElementById('editEventId').value = id;
    // 後方互換性: 旧データはdateのみの場合
    document.getElementById('eventStartDate').value = event.startDate || event.date;
    document.getElementById('eventEndDate').value = event.endDate || event.date;
    document.getElementById('eventType').value = event.type;
    document.getElementById('eventTitle').value = event.title;
    document.getElementById('eventDescription').value = event.description || '';
    document.getElementById('eventSubmitBtn').textContent = '保存';
    overlay.classList.add('active');
}

// イベントモーダルを閉じる
function closeEventModal() {
    document.getElementById('eventModalOverlay').classList.remove('active');
}

// イベントモーダルの初期化
function initEventModal() {
    const overlay = document.getElementById('eventModalOverlay');
    const closeBtn = document.getElementById('eventModalClose');
    const cancelBtn = document.getElementById('eventCancelBtn');
    const form = document.getElementById('eventForm');

    if (closeBtn) closeBtn.addEventListener('click', closeEventModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeEventModal);
    if (overlay) overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeEventModal();
    });

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('editEventId').value;
            const data = {
                startDate: document.getElementById('eventStartDate').value,
                endDate: document.getElementById('eventEndDate').value,
                type: document.getElementById('eventType').value,
                title: document.getElementById('eventTitle').value,
                description: document.getElementById('eventDescription').value
            };

            if (id) {
                updateDailyEvent(id, data);
            } else {
                addDailyEvent(data);
            }

            closeEventModal();
            render();
            if (state.isAdmin) renderAdminPanel();
        });
    }

    // イベントポップオーバーの閉じるボタン
    const popoverClose = document.getElementById('eventPopoverClose');
    if (popoverClose) {
        popoverClose.addEventListener('click', closeEventPopover);
    }

    // ポップオーバー外クリックで閉じる
    document.addEventListener('click', (e) => {
        const popover = document.getElementById('eventPopover');
        if (popover && popover.classList.contains('show')) {
            if (!popover.contains(e.target) && !e.target.closest('.event-icon')) {
                closeEventPopover();
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', init);

// ========================================
// 日本の祝日関連の関数
// ========================================

// 日本の祝日を取得（2024年〜2030年対応）
function getJapaneseHoliday(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const dateStr = `${month}/${day}`;
    
    // 固定祝日
    const fixedHolidays = {
        '1/1': '元日',
        '2/11': '建国記念の日',
        '2/23': '天皇誕生日',
        '4/29': '昭和の日',
        '5/3': '憲法記念日',
        '5/4': 'みどりの日',
        '5/5': 'こどもの日',
        '8/11': '山の日',
        '11/3': '文化の日',
        '11/23': '勤労感謝の日'
    };
    
    // 固定祝日チェック
    if (fixedHolidays[dateStr]) {
        return fixedHolidays[dateStr];
    }
    
    // ハッピーマンデー（第n月曜日）
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 1) { // 月曜日のみチェック
        const weekNum = Math.ceil(day / 7);
        
        // 成人の日（1月第2月曜）
        if (month === 1 && weekNum === 2) return '成人の日';
        // 海の日（7月第3月曜）
        if (month === 7 && weekNum === 3) return '海の日';
        // 敬老の日（9月第3月曜）
        if (month === 9 && weekNum === 3) return '敬老の日';
        // スポーツの日（10月第2月曜）
        if (month === 10 && weekNum === 2) return 'スポーツの日';
    }
    
    // 春分の日（3月20日または21日）
    if (month === 3) {
        const vernalEquinox = calcVernalEquinox(year);
        if (day === vernalEquinox) return '春分の日';
    }
    
    // 秋分の日（9月22日または23日）
    if (month === 9) {
        const autumnalEquinox = calcAutumnalEquinox(year);
        if (day === autumnalEquinox) return '秋分の日';
    }
    
    // 振替休日チェック（祝日が日曜の場合、翌日が休み）
    if (dayOfWeek === 1) { // 月曜日
        const yesterday = new Date(d);
        yesterday.setDate(day - 1);
        const yesterdayHoliday = getHolidayName(yesterday);
        if (yesterdayHoliday) {
            return '振替休日';
        }
    }
    
    // 国民の休日（祝日に挟まれた平日）
    if (month === 9) {
        // 敬老の日と秋分の日に挟まれる場合
        const keirouDay = getHappyMonday(year, 9, 3); // 9月第3月曜
        const autumnalEquinox = calcAutumnalEquinox(year);
        if (day > keirouDay && day < autumnalEquinox && autumnalEquinox - keirouDay === 2) {
            return '国民の休日';
        }
    }
    
    return null;
}

// 祝日名を取得（振替休日判定用のヘルパー）
function getHolidayName(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const dateStr = `${month}/${day}`;
    
    const fixedHolidays = {
        '1/1': '元日',
        '2/11': '建国記念の日',
        '2/23': '天皇誕生日',
        '4/29': '昭和の日',
        '5/3': '憲法記念日',
        '5/4': 'みどりの日',
        '5/5': 'こどもの日',
        '8/11': '山の日',
        '11/3': '文化の日',
        '11/23': '勤労感謝の日'
    };
    
    if (fixedHolidays[dateStr]) return fixedHolidays[dateStr];
    
    // ハッピーマンデー
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 1) {
        const weekNum = Math.ceil(day / 7);
        if (month === 1 && weekNum === 2) return '成人の日';
        if (month === 7 && weekNum === 3) return '海の日';
        if (month === 9 && weekNum === 3) return '敬老の日';
        if (month === 10 && weekNum === 2) return 'スポーツの日';
    }
    
    // 春分・秋分
    if (month === 3 && day === calcVernalEquinox(year)) return '春分の日';
    if (month === 9 && day === calcAutumnalEquinox(year)) return '秋分の日';
    
    return null;
}

// ハッピーマンデーの日付を計算
function getHappyMonday(year, month, weekNum) {
    const firstDay = new Date(year, month - 1, 1);
    const firstMonday = firstDay.getDay() <= 1 
        ? 1 + (1 - firstDay.getDay())
        : 1 + (8 - firstDay.getDay());
    return firstMonday + (weekNum - 1) * 7;
}

// 春分の日を計算（簡易版：2000年〜2099年対応）
function calcVernalEquinox(year) {
    if (year >= 2000 && year <= 2099) {
        return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
    }
    return 21; // デフォルト
}

// 秋分の日を計算（簡易版：2000年〜2099年対応）
function calcAutumnalEquinox(year) {
    if (year >= 2000 && year <= 2099) {
        return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
    }
    return 23; // デフォルト
}

// 祝日かどうかを判定（外部から呼び出し可能）
function isJapaneseHoliday(date) {
    return getJapaneseHoliday(date) !== null;
}

// ========================================
// 給料日・年金支給日関連の関数
// ========================================

// 給料日設定（デフォルト値）
const PAYDAY_SETTINGS = {
    salaryDays: [25], // 給料日（複数設定可能）
    pensionEnabled: true // 年金支給日を表示するか
};

// 給料日・年金支給日の情報を取得
function getPayDayInfo(date) {
    const result = [];
    const d = new Date(date);
    const day = d.getDate();
    const month = d.getMonth() + 1; // 1-12
    const dayOfWeek = d.getDay(); // 0=日, 6=土
    
    // 給料日チェック
    PAYDAY_SETTINGS.salaryDays.forEach(salaryDay => {
        if (isPayDay(d, salaryDay)) {
            result.push({
                type: 'salary',
                icon: '💰',
                label: '給料日',
                shortLabel: '給料日'
            });
        }
    });
    
    // 年金支給日チェック（偶数月の15日、土日祝の場合は直前の平日）
    if (PAYDAY_SETTINGS.pensionEnabled && isPensionDay(d)) {
        result.push({
            type: 'pension',
            icon: '👴',
            label: '年金支給日',
            shortLabel: '年金'
        });
    }
    
    return result;
}

// 給料日かどうかを判定（土日の場合は直前の平日）
function isPayDay(date, salaryDay) {
    const d = new Date(date);
    const day = d.getDate();
    const year = d.getFullYear();
    const month = d.getMonth();
    
    // その月の給料日を計算
    let payDate = new Date(year, month, salaryDay);
    
    // 給料日が存在しない場合（例：2月30日）は月末に調整
    if (payDate.getMonth() !== month) {
        payDate = new Date(year, month + 1, 0); // 月末日
    }
    
    // 土日の場合は直前の平日に調整
    while (payDate.getDay() === 0 || payDate.getDay() === 6) {
        payDate.setDate(payDate.getDate() - 1);
    }
    
    return d.getDate() === payDate.getDate() && 
           d.getMonth() === payDate.getMonth() && 
           d.getFullYear() === payDate.getFullYear();
}

// 年金支給日かどうかを判定（偶数月の15日、土日の場合は直前の平日）
function isPensionDay(date) {
    const d = new Date(date);
    const month = d.getMonth() + 1; // 1-12
    
    // 偶数月のみ
    if (month % 2 !== 0) return false;
    
    const year = d.getFullYear();
    
    // その月の15日を取得
    let pensionDate = new Date(year, d.getMonth(), 15);
    
    // 土日の場合は直前の平日に調整
    while (pensionDate.getDay() === 0 || pensionDate.getDay() === 6) {
        pensionDate.setDate(pensionDate.getDate() - 1);
    }
    
    return d.getDate() === pensionDate.getDate() && 
           d.getMonth() === pensionDate.getMonth() && 
           d.getFullYear() === pensionDate.getFullYear();
}

// ========================================
// 天気予報関連の関数
// ========================================

// 天気コードからアイコンと説明を取得
function getWeatherInfo(weatherCode) {
    const weatherMap = {
        0: { icon: '☀️', desc: '快晴' },
        1: { icon: '🌤️', desc: '晴れ' },
        2: { icon: '⛅', desc: '曇りがち' },
        3: { icon: '☁️', desc: '曇り' },
        45: { icon: '🌫️', desc: '霧' },
        48: { icon: '🌫️', desc: '着氷霧' },
        51: { icon: '🌧️', desc: '弱い霧雨' },
        53: { icon: '🌧️', desc: '霧雨' },
        55: { icon: '🌧️', desc: '強い霧雨' },
        56: { icon: '🌧️', desc: '着氷霧雨' },
        57: { icon: '🌧️', desc: '強い着氷霧雨' },
        61: { icon: '🌧️', desc: '弱い雨' },
        63: { icon: '🌧️', desc: '雨' },
        65: { icon: '🌧️', desc: '強い雨' },
        66: { icon: '🌧️', desc: '着氷性の雨' },
        67: { icon: '🌧️', desc: '強い着氷性の雨' },
        71: { icon: '❄️', desc: '弱い雪' },
        73: { icon: '❄️', desc: '雪' },
        75: { icon: '❄️', desc: '強い雪' },
        77: { icon: '🌨️', desc: '霧雪' },
        80: { icon: '🌦️', desc: 'にわか雨' },
        81: { icon: '🌧️', desc: '強いにわか雨' },
        82: { icon: '⛈️', desc: '激しいにわか雨' },
        85: { icon: '🌨️', desc: 'にわか雪' },
        86: { icon: '❄️', desc: '強いにわか雪' },
        95: { icon: '⛈️', desc: '雷雨' },
        96: { icon: '⛈️', desc: '雷雨（雹）' },
        99: { icon: '⛈️', desc: '激しい雷雨（雹）' }
    };
    return weatherMap[weatherCode] || { icon: '❓', desc: '不明' };
}

// 週間天気予報を取得（今年＋昨年比較）
async function fetchWeatherData() {
    try {
        // 表示している週の日付範囲を計算
        const startDate = formatDate(state.currentWeekStart);
        const endDate = new Date(state.currentWeekStart);
        endDate.setDate(endDate.getDate() + 6);
        const endDateStr = formatDate(endDate);

        // 昨年の同じ期間を計算
        const lastYearStart = new Date(state.currentWeekStart);
        lastYearStart.setFullYear(lastYearStart.getFullYear() - 1);
        const lastYearEnd = new Date(endDate);
        lastYearEnd.setFullYear(lastYearEnd.getFullYear() - 1);
        const lastYearStartStr = formatDate(lastYearStart);
        const lastYearEndStr = formatDate(lastYearEnd);

        // 今年の天気予報を取得
        const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${STORE_LOCATION.latitude}&longitude=${STORE_LOCATION.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia/Tokyo&start_date=${startDate}&end_date=${endDateStr}`;

        // 昨年の過去データを取得（Open-Meteo Archive API）
        const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${STORE_LOCATION.latitude}&longitude=${STORE_LOCATION.longitude}&daily=temperature_2m_max,temperature_2m_min&timezone=Asia/Tokyo&start_date=${lastYearStartStr}&end_date=${lastYearEndStr}`;

        // 両方のAPIを並列で呼び出し
        const [forecastRes, archiveRes] = await Promise.all([
            fetch(forecastUrl),
            fetch(archiveUrl)
        ]);

        if (!forecastRes.ok) throw new Error('天気データの取得に失敗しました');

        const forecastData = await forecastRes.json();

        // 昨年データを日付マップに整理
        const lastYearData = {};
        if (archiveRes.ok) {
            const archiveData = await archiveRes.json();
            if (archiveData.daily && archiveData.daily.time) {
                archiveData.daily.time.forEach((date, index) => {
                    lastYearData[date] = {
                        tempMax: Math.round(archiveData.daily.temperature_2m_max[index]),
                        tempMin: Math.round(archiveData.daily.temperature_2m_min[index])
                    };
                });
            }
        }

        // 日付別に天気データを整理
        state.weatherData = {};
        if (forecastData.daily && forecastData.daily.time) {
            forecastData.daily.time.forEach((date, index) => {
                // 今年の日付から昨年の対応日付を計算
                const currentDate = new Date(date);
                const lastYearDate = new Date(currentDate);
                lastYearDate.setFullYear(lastYearDate.getFullYear() - 1);
                const lastYearDateStr = formatDate(lastYearDate);

                const lastYear = lastYearData[lastYearDateStr];

                state.weatherData[date] = {
                    weatherCode: forecastData.daily.weather_code[index],
                    tempMax: Math.round(forecastData.daily.temperature_2m_max[index]),
                    tempMin: Math.round(forecastData.daily.temperature_2m_min[index]),
                    // 昨年データ
                    lastYearTempMax: lastYear ? lastYear.tempMax : null,
                    lastYearTempMin: lastYear ? lastYear.tempMin : null
                };
            });
        }

        // 天気データが更新されたら再描画
        render();
        // 拡張版発注アドバイザーを更新
        renderOrderAdvisorExtended();
        console.log('天気データを取得しました:', state.weatherData);
    } catch (error) {
        console.error('天気データ取得エラー:', error);
    }
}

// ========================================
// 発注アドバイザー機能（拡張版）
// ========================================

// 8カテゴリの定義（サブカテゴリ付き）
const ORDER_CATEGORIES = [
    {
        id: 'rice', name: '米飯', icon: '🍙', stable: true,
        subcategories: [
            { id: 'bento', name: '弁当', tempEffect: 'slight_warm' },
            { id: 'onigiri', name: 'おにぎり', tempEffect: 'neutral' },
            { id: 'sushi', name: '寿司類', tempEffect: 'neutral' }
        ]
    },
    {
        id: 'bread', name: '調理パン', icon: '🥐',
        subcategories: [
            { id: 'savory_warm', name: '惣菜パン（温）', tempEffect: 'warm' },
            { id: 'sandwich_cold', name: 'サンド類（冷）', tempEffect: 'cold' },
            { id: 'sweet_bread', name: '菓子パン', tempEffect: 'neutral' }
        ]
    },
    {
        id: 'noodles', name: '麺類その他', icon: '🍜', highImpact: true,
        subcategories: [
            { id: 'ramen', name: 'ラーメン（温）', tempEffect: 'hot_strong' },
            { id: 'udon_soba', name: 'うどん・そば（温）', tempEffect: 'hot_strong' },
            { id: 'cup_noodle', name: 'カップ麺', tempEffect: 'warm' },
            { id: 'cold_noodle', name: '冷やし麺', tempEffect: 'cold_strong' }
        ]
    },
    {
        id: 'dessert', name: 'デザート', icon: '🍰',
        subcategories: [
            { id: 'ice', name: 'アイス', tempEffect: 'cold_strong' },
            { id: 'jelly', name: 'ゼリー・プリン', tempEffect: 'cold' },
            { id: 'cream_puff', name: 'シュークリーム系', tempEffect: 'slight_cold' }
        ]
    },
    {
        id: 'pastry', name: 'ペストリー', icon: '🥧', stable: true,
        subcategories: [
            { id: 'baked', name: '焼き菓子', tempEffect: 'neutral' },
            { id: 'donut', name: 'ドーナツ', tempEffect: 'neutral' },
            { id: 'tart', name: 'タルト', tempEffect: 'neutral' }
        ]
    },
    {
        id: 'salad', name: 'サラダ・惣菜', icon: '🥗',
        subcategories: [
            { id: 'salad', name: 'サラダ', tempEffect: 'cold' },
            { id: 'hot_deli', name: '温惣菜（グラタン等）', tempEffect: 'hot_strong' },
            { id: 'chilled_deli', name: 'チルド惣菜', tempEffect: 'slight_cold' }
        ]
    },
    {
        id: 'delica', name: '7Pデリカ', icon: '🍱',
        subcategories: [
            { id: 'oden', name: 'おでん', tempEffect: 'hot_max' },
            { id: 'nikuman', name: '中華まん', tempEffect: 'hot_max' },
            { id: 'fryer', name: 'フライヤー商品', tempEffect: 'warm' }
        ]
    },
    {
        id: 'milk', name: '牛乳乳飲料', icon: '🥛', stable: true,
        subcategories: [
            { id: 'milk', name: '牛乳', tempEffect: 'neutral' },
            { id: 'yogurt', name: 'ヨーグルト', tempEffect: 'neutral' },
            { id: 'coffee', name: 'コーヒー飲料', tempEffect: 'neutral' }
        ]
    }
];

// 旧カテゴリ（互換性のため保持）
const PRODUCT_CATEGORIES = [
    { id: 'onigiri', name: 'おにぎり', icon: '🍙' },
    { id: 'bento', name: '弁当', icon: '🍱' },
    { id: 'sandwich', name: 'サンドイッチ', icon: '🥪' },
    { id: 'cold_noodle', name: '調理麺(冷)', icon: '🍜' },
    { id: 'hot_noodle', name: '調理麺(温)', icon: '🍲' },
    { id: 'gratin', name: 'グラタン・ドリア', icon: '🧀' },
    { id: 'spaghetti', name: 'スパゲティ', icon: '🍝' },
    { id: 'salad', name: 'サラダ', icon: '🥗' },
    { id: 'sozai', name: '惣菜', icon: '🍳' },
    { id: 'pastry', name: 'ペストリー', icon: '🥐' },
    { id: 'dessert', name: 'デザート', icon: '🍰' }
];

// 気温帯の判定
function getTemperatureZone(temp) {
    if (temp <= 0) return { zone: 'extreme_cold', label: '極寒', effect: 'hot_max', color: '#3b82f6' };
    if (temp <= 5) return { zone: 'severe_cold', label: '厳寒', effect: 'hot_high', color: '#60a5fa' };
    if (temp <= 10) return { zone: 'cold', label: '寒い', effect: 'hot_mid', color: '#93c5fd' };
    if (temp <= 15) return { zone: 'cool', label: '涼しい', effect: 'slight_hot', color: '#a5b4fc' };
    if (temp <= 20) return { zone: 'comfortable', label: '快適', effect: 'neutral', color: '#c4b5fd' };
    if (temp <= 25) return { zone: 'warm', label: '暖かい', effect: 'slight_cold', color: '#fcd34d' };
    if (temp <= 30) return { zone: 'hot', label: '暑い', effect: 'cold_mid', color: '#fb923c' };
    return { zone: 'extreme_hot', label: '猛暑', effect: 'cold_max', color: '#ef4444' };
}

// tempEffectに基づいて推奨値（%）を計算
function calculateTempEffectPercentage(tempEffect, tempZone) {
    const effectMatrix = {
        // 温かい商品への影響
        hot_max: { extreme_cold: 35, severe_cold: 30, cold: 25, cool: 15, comfortable: 0, warm: -10, hot: -20, extreme_hot: -30 },
        hot_strong: { extreme_cold: 30, severe_cold: 25, cold: 20, cool: 10, comfortable: 0, warm: -15, hot: -25, extreme_hot: -35 },
        warm: { extreme_cold: 15, severe_cold: 12, cold: 10, cool: 5, comfortable: 0, warm: -5, hot: -10, extreme_hot: -15 },
        slight_warm: { extreme_cold: 10, severe_cold: 8, cold: 5, cool: 3, comfortable: 0, warm: -3, hot: -5, extreme_hot: -8 },
        // 中立
        neutral: { extreme_cold: 0, severe_cold: 0, cold: 0, cool: 0, comfortable: 0, warm: 0, hot: 0, extreme_hot: 0 },
        // 冷たい商品への影響
        slight_cold: { extreme_cold: -8, severe_cold: -5, cold: -3, cool: 0, comfortable: 0, warm: 3, hot: 5, extreme_hot: 8 },
        cold: { extreme_cold: -15, severe_cold: -12, cold: -10, cool: -5, comfortable: 0, warm: 5, hot: 10, extreme_hot: 15 },
        cold_strong: { extreme_cold: -40, severe_cold: -35, cold: -25, cool: -15, comfortable: 0, warm: 10, hot: 20, extreme_hot: 30 }
    };

    return effectMatrix[tempEffect]?.[tempZone.zone] || 0;
}

// カテゴリ別アドバイス計算
function calculateCategoryAdvice(category, weatherData, dayOfWeek) {
    if (!weatherData) return null;

    const { tempMax, tempMin, lastYearTempMax } = weatherData;
    const avgTemp = (tempMax + tempMin) / 2;
    const tempZone = getTemperatureZone(avgTemp);

    // 昨年比を計算
    const lastYearDiff = lastYearTempMax !== null ? tempMax - lastYearTempMax : null;

    // サブカテゴリ別の推奨値を計算
    const subcategoryAdvice = category.subcategories.map(sub => {
        let percentage = calculateTempEffectPercentage(sub.tempEffect, tempZone);

        // 昨年比による調整（±5°C以上の差がある場合）
        if (lastYearDiff !== null && Math.abs(lastYearDiff) >= 5) {
            const isHotProduct = ['hot_max', 'hot_strong', 'warm', 'slight_warm'].includes(sub.tempEffect);
            const isColdProduct = ['cold_strong', 'cold', 'slight_cold'].includes(sub.tempEffect);

            if (lastYearDiff < 0 && isHotProduct) {
                percentage += Math.min(10, Math.abs(lastYearDiff));
            } else if (lastYearDiff > 0 && isColdProduct) {
                percentage += Math.min(10, lastYearDiff);
            }
        }

        return {
            ...sub,
            percentage: Math.round(percentage)
        };
    });

    // カテゴリ全体の推奨値（サブカテゴリの平均）
    const avgPercentage = Math.round(
        subcategoryAdvice.reduce((sum, sub) => sum + sub.percentage, 0) / subcategoryAdvice.length
    );

    return {
        ...category,
        percentage: avgPercentage,
        subcategoryAdvice,
        tempZone
    };
}

// 全カテゴリのアドバイス生成
function generateAllCategoryAdvice(weatherData) {
    if (!weatherData) return null;

    const today = new Date();
    const dayOfWeek = today.getDay();
    const dayNames = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

    const { weatherCode, tempMax, tempMin, lastYearTempMax, lastYearTempMin } = weatherData;
    const avgTemp = (tempMax + tempMin) / 2;
    const tempZone = getTemperatureZone(avgTemp);
    const weatherInfo = getWeatherInfo(weatherCode);
    const lastYearDiff = lastYearTempMax !== null ? tempMax - lastYearTempMax : null;

    const categories = ORDER_CATEGORIES.map(cat =>
        calculateCategoryAdvice(cat, weatherData, dayOfWeek)
    );

    return {
        weather: weatherInfo,
        tempMax,
        tempMin,
        avgTemp,
        tempZone,
        lastYearDiff,
        dayOfWeek,
        dayName: dayNames[dayOfWeek],
        categories
    };
}

// 日次チェックリスト保存
function saveDailyChecklist(categoryId, date, data) {
    const key = `${date}-${categoryId}`;
    const checklistData = {
        id: key,
        date,
        categoryId,
        ...data,
        updatedAt: new Date().toISOString()
    };

    database.ref(`dailyChecklist/${key}`).set(checklistData);
    state.dailyChecklist[key] = checklistData;
}

// カテゴリメモ保存
function saveCategoryMemo(categoryId, date, content, tags = []) {
    const id = Date.now().toString();
    const memoData = {
        id,
        date,
        categoryId,
        content,
        tags,
        createdAt: new Date().toISOString()
    };

    state.categoryMemos.push(memoData);
    saveToFirebase('categoryMemos', state.categoryMemos);
}

// 蓄積データからの傾向計算
function calculateTrends(categoryId, days = 7) {
    const today = new Date();
    const trends = {
        avgWaste: null,
        avgShortage: null,
        avgSales: null,
        memoCount: 0,
        commonTags: []
    };

    const wasteScores = [];
    const shortageScores = [];
    const salesScores = [];
    const tagCounts = {};

    for (let i = 0; i < days; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = formatDate(date);
        const key = `${dateStr}-${categoryId}`;

        const checklist = state.dailyChecklist[key];
        if (checklist) {
            const wasteScore = { high: 3, normal: 2, low: 1 }[checklist.waste] || 2;
            const shortageScore = { yes: 3, few: 2, none: 1 }[checklist.shortage] || 1;
            const salesScore = { good: 3, normal: 2, poor: 1 }[checklist.sales] || 2;

            wasteScores.push(wasteScore);
            shortageScores.push(shortageScore);
            salesScores.push(salesScore);
        }
    }

    // メモとタグの集計
    state.categoryMemos
        .filter(m => m.categoryId === categoryId)
        .forEach(m => {
            trends.memoCount++;
            m.tags?.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        });

    if (wasteScores.length > 0) {
        trends.avgWaste = wasteScores.reduce((a, b) => a + b, 0) / wasteScores.length;
        trends.avgShortage = shortageScores.reduce((a, b) => a + b, 0) / shortageScores.length;
        trends.avgSales = salesScores.reduce((a, b) => a + b, 0) / salesScores.length;
    }

    // よく使われるタグ上位3つ
    trends.commonTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tag]) => tag);

    return trends;
}

// 天気・気温に基づく発注アドバイスを生成
function generateOrderAdvice(weatherData) {
    if (!weatherData) return null;

    const { weatherCode, tempMax, tempMin, lastYearTempMax, lastYearTempMin } = weatherData;
    const avgTemp = (tempMax + tempMin) / 2;
    const weatherInfo = getWeatherInfo(weatherCode);

    // 天気の状態を判定
    const isRainy = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(weatherCode);
    const isSnowy = [71, 73, 75, 77, 85, 86].includes(weatherCode);
    const isSunny = [0, 1].includes(weatherCode);
    const isCloudy = [2, 3].includes(weatherCode);

    // 昨年との気温差
    const tempDiff = lastYearTempMax !== null ? tempMax - lastYearTempMax : null;

    // 各カテゴリのアドバイスを生成
    const advice = PRODUCT_CATEGORIES.map(category => {
        let trend = 0; // -2〜+2 の範囲
        let reasons = [];

        // 気温による影響
        if (avgTemp >= 28) {
            // 猛暑日
            switch (category.id) {
                case 'cold_noodle':
                    trend += 2;
                    reasons.push('猛暑で冷たい麺類の需要増');
                    break;
                case 'salad':
                    trend += 2;
                    reasons.push('暑さでさっぱり需要増');
                    break;
                case 'dessert':
                    trend += 2;
                    reasons.push('冷たいデザート需要増');
                    break;
                case 'hot_noodle':
                    trend -= 2;
                    reasons.push('暑さで温かい麺類の需要減');
                    break;
                case 'gratin':
                    trend -= 2;
                    reasons.push('暑さで温かい料理の需要減');
                    break;
                case 'spaghetti':
                    trend -= 1;
                    reasons.push('暑さで温かい料理の需要やや減');
                    break;
            }
        } else if (avgTemp >= 25) {
            // 夏日
            switch (category.id) {
                case 'cold_noodle':
                    trend += 1;
                    reasons.push('暑さで冷たい麺類の需要増');
                    break;
                case 'salad':
                    trend += 1;
                    reasons.push('暑さでさっぱり需要増');
                    break;
                case 'dessert':
                    trend += 1;
                    reasons.push('冷たいデザート需要増');
                    break;
                case 'hot_noodle':
                    trend -= 1;
                    reasons.push('暑さで温かい麺類の需要減');
                    break;
                case 'gratin':
                    trend -= 1;
                    reasons.push('暑さで温かい料理の需要減');
                    break;
            }
        } else if (avgTemp <= 5) {
            // 厳冬
            switch (category.id) {
                case 'hot_noodle':
                    trend += 2;
                    reasons.push('寒さで温かい麺類の需要増');
                    break;
                case 'gratin':
                    trend += 2;
                    reasons.push('寒さで温かい料理の需要増');
                    break;
                case 'sozai':
                    trend += 1;
                    reasons.push('温かい惣菜の需要増');
                    break;
                case 'cold_noodle':
                    trend -= 2;
                    reasons.push('寒さで冷たい麺類の需要減');
                    break;
                case 'salad':
                    trend -= 1;
                    reasons.push('寒さで冷たい食品の需要減');
                    break;
            }
        } else if (avgTemp <= 10) {
            // 寒い日
            switch (category.id) {
                case 'hot_noodle':
                    trend += 1;
                    reasons.push('寒さで温かい麺類の需要増');
                    break;
                case 'gratin':
                    trend += 1;
                    reasons.push('寒さで温かい料理の需要増');
                    break;
                case 'cold_noodle':
                    trend -= 1;
                    reasons.push('寒さで冷たい麺類の需要減');
                    break;
            }
        }

        // 天気による影響
        if (isRainy) {
            switch (category.id) {
                case 'bento':
                    trend += 1;
                    reasons.push('雨天で自宅需要増');
                    break;
                case 'sozai':
                    trend += 1;
                    reasons.push('雨天で巣ごもり需要増');
                    break;
                case 'sandwich':
                    trend -= 1;
                    reasons.push('雨天で外出減少');
                    break;
            }
        } else if (isSnowy) {
            // 雪の日は全体的に来店減少
            if (!['bento', 'sozai', 'hot_noodle', 'gratin'].includes(category.id)) {
                trend -= 1;
                reasons.push('雪天で来店減少');
            }
        } else if (isSunny) {
            switch (category.id) {
                case 'sandwich':
                    trend += 1;
                    reasons.push('行楽需要増');
                    break;
                case 'onigiri':
                    trend += 1;
                    reasons.push('外出・行楽需要増');
                    break;
            }
        }

        // 曜日による影響（週末は行楽需要）
        const today = new Date();
        const dayOfWeek = today.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            if (['onigiri', 'sandwich', 'bento'].includes(category.id) && isSunny) {
                trend += 1;
                if (!reasons.some(r => r.includes('行楽'))) {
                    reasons.push('週末行楽需要');
                }
            }
        }

        // 昨年比較による調整
        if (tempDiff !== null && Math.abs(tempDiff) >= 5) {
            if (tempDiff > 0) {
                // 昨年より暑い
                if (['cold_noodle', 'salad', 'dessert'].includes(category.id)) {
                    trend += 1;
                    reasons.push(`昨年より${tempDiff}°C高い`);
                }
            } else {
                // 昨年より寒い
                if (['hot_noodle', 'gratin', 'sozai'].includes(category.id)) {
                    trend += 1;
                    reasons.push(`昨年より${Math.abs(tempDiff)}°C低い`);
                }
            }
        }

        // trendを-2〜+2に制限
        trend = Math.max(-2, Math.min(2, trend));

        return {
            ...category,
            trend,
            reasons: reasons.length > 0 ? reasons : ['通常通り']
        };
    });

    // 注意事項を生成
    const notes = [];
    if (isSnowy) {
        notes.push('雪天のため来店客数の大幅減少が予想されます。廃棄リスクを考慮し、発注量を控えめに。');
    }
    if (isRainy) {
        notes.push('雨天のため来店客数がやや減少する可能性があります。');
    }
    if (tempDiff !== null && tempDiff >= 5) {
        notes.push(`昨年同期より${tempDiff}°C高いため、季節を先取りした商品構成を検討。`);
    }
    if (tempDiff !== null && tempDiff <= -5) {
        notes.push(`昨年同期より${Math.abs(tempDiff)}°C低いため、季節商品の切り替えを遅らせることを検討。`);
    }

    return {
        weather: weatherInfo,
        tempMax,
        tempMin,
        tempDiff,
        categories: advice,
        notes
    };
}

// 発注アドバイザーを描画
function renderOrderAdvisor() {
    const container = document.getElementById('orderAdvisor');
    const content = document.getElementById('advisorContent');
    if (!container || !content) return;

    // 今日の天気データを取得
    const today = formatDate(new Date());
    const todayWeather = state.weatherData[today];

    if (!todayWeather) {
        container.style.display = 'none';
        return;
    }

    const advice = generateOrderAdvice(todayWeather);
    if (!advice) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    // 天気サマリー
    let html = `
        <div class="advisor-weather-summary">
            <div class="weather-summary-item">
                <span class="weather-summary-label">天気:</span>
                <span class="weather-summary-value">${advice.weather.icon} ${advice.weather.desc}</span>
            </div>
            <div class="weather-summary-item">
                <span class="weather-summary-label">気温:</span>
                <span class="weather-summary-value">
                    <span style="color: #ef4444;">${advice.tempMax}°</span>/<span style="color: #60a5fa;">${advice.tempMin}°</span>
                </span>
            </div>
            ${advice.tempDiff !== null ? `
            <div class="weather-summary-item">
                <span class="weather-summary-label">昨年比:</span>
                <span class="weather-summary-value ${advice.tempDiff > 0 ? 'temp-diff-plus' : 'temp-diff-minus'}">
                    ${advice.tempDiff > 0 ? '+' : ''}${advice.tempDiff}°C
                </span>
            </div>
            ` : ''}
        </div>
    `;

    // カテゴリカード
    html += '<div class="advisor-grid">';
    advice.categories.forEach(cat => {
        const trendClass = cat.trend > 0 ? 'increase' : (cat.trend < 0 ? 'decrease' : '');
        const trendArrow = cat.trend > 0 ? '↑' : (cat.trend < 0 ? '↓' : '→');
        const trendText = cat.trend > 0 ? '増加' : (cat.trend < 0 ? '減少' : '通常');
        const trendColorClass = cat.trend > 0 ? 'up' : (cat.trend < 0 ? 'down' : 'neutral');

        html += `
            <div class="advisor-card ${trendClass}" title="${cat.reasons.join('、')}">
                <span class="advisor-card-icon">${cat.icon}</span>
                <span class="advisor-card-name">${cat.name}</span>
                <span class="advisor-card-trend ${trendColorClass}">
                    ${trendArrow} ${trendText}
                </span>
                <span class="advisor-card-reason">${cat.reasons[0] || ''}</span>
            </div>
        `;
    });
    html += '</div>';

    // 注意事項
    if (advice.notes.length > 0) {
        html += `
            <div class="advisor-notes">
                <div class="advisor-notes-title">
                    <span>⚠️</span>
                    <span>注意事項</span>
                </div>
                <ul class="advisor-notes-list">
                    ${advice.notes.map(note => `<li>${note}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    content.innerHTML = html;

    // トグル機能の初期化
    initAdvisorToggle();
}

// アドバイザーのトグル機能を初期化
function initAdvisorToggle() {
    const header = document.querySelector('.advisor-header');
    const toggle = document.getElementById('advisorToggle');
    const content = document.getElementById('advisorContent');

    if (header && toggle && content) {
        header.onclick = () => {
            toggle.classList.toggle('collapsed');
            content.classList.toggle('collapsed');
        };
    }

    // グループトグルの初期化
    initAdvisorGroupToggle();
    initReportsGroupToggle();
}

// 発注・スケジュール情報グループのトグル
function initAdvisorGroupToggle() {
    const groupHeader = document.getElementById('advisorGroupHeader');
    const groupToggle = document.getElementById('advisorGroupToggle');
    const groupContent = document.getElementById('advisorGroupContent');

    if (groupHeader && groupToggle && groupContent) {
        groupHeader.onclick = () => {
            groupToggle.classList.toggle('collapsed');
            groupContent.classList.toggle('collapsed');
        };
    }
    
    // 印刷画面グループのトグルも初期化
    initPrintGroupToggle();
}

// 印刷画面グループのトグル
function initPrintGroupToggle() {
    const groupHeader = document.getElementById('printGroupHeader');
    const groupToggle = document.getElementById('printGroupToggle');
    const groupContent = document.getElementById('printGroupContent');

    if (groupHeader && groupToggle && groupContent) {
        groupHeader.onclick = () => {
            groupToggle.classList.toggle('collapsed');
            groupContent.classList.toggle('collapsed');
        };
    }
}

// レポートグループのトグル
function initReportsGroupToggle() {
    const header = document.getElementById('reportsGroupHeader');
    const toggle = document.getElementById('reportsGroupToggle');
    const content = document.getElementById('reportsGroupContent');

    console.log('initReportsGroupToggle called:', { header, toggle, content });

    if (header && toggle && content) {
        // 既存のイベントリスナーを削除するためにcloneで置き換え
        const newHeader = header.cloneNode(true);
        header.parentNode.replaceChild(newHeader, header);
        
        // 新しいヘッダーに対してイベントを設定
        newHeader.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Reports header clicked');
            
            const currentToggle = document.getElementById('reportsGroupToggle');
            const currentContent = document.getElementById('reportsGroupContent');
            
            if (currentContent.classList.contains('collapsed')) {
                currentContent.classList.remove('collapsed');
                currentToggle.textContent = '▲';
                currentToggle.classList.remove('collapsed');
            } else {
                currentContent.classList.add('collapsed');
                currentToggle.textContent = '▼';
                currentToggle.classList.add('collapsed');
            }
        });
        
        // タッチイベントも追加
        newHeader.addEventListener('touchend', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const currentToggle = document.getElementById('reportsGroupToggle');
            const currentContent = document.getElementById('reportsGroupContent');
            
            if (currentContent.classList.contains('collapsed')) {
                currentContent.classList.remove('collapsed');
                currentToggle.textContent = '▲';
                currentToggle.classList.remove('collapsed');
            } else {
                currentContent.classList.add('collapsed');
                currentToggle.textContent = '▼';
                currentToggle.classList.add('collapsed');
            }
        }, { passive: false });
    }
}

// 拡張版発注アドバイザーを描画
function renderOrderAdvisorExtended() {
    const container = document.getElementById('orderAdvisor');
    const content = document.getElementById('advisorContent');
    if (!container || !content) return;

    // 今日の天気データを取得
    const today = formatDate(new Date());
    const todayWeather = state.weatherData[today];

    if (!todayWeather) {
        container.style.display = 'none';
        return;
    }

    const advice = generateAllCategoryAdvice(todayWeather);
    if (!advice) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    // 天気・購買行動パネル
    let html = `
        <div class="advisor-extended">
            <div class="advisor-top-panel">
                <div class="advisor-weather-panel">
                    <div class="weather-main">
                        <span class="weather-icon-large">${advice.weather.icon}</span>
                        <div class="weather-details">
                            <span class="weather-desc">${advice.weather.desc}</span>
                            <span class="weather-temps">
                                <span class="temp-high">${advice.tempMax}°</span> / 
                                <span class="temp-low">${advice.tempMin}°</span>
                            </span>
                            ${advice.lastYearDiff !== null ? `
                            <span class="weather-diff ${advice.lastYearDiff >= 0 ? 'plus' : 'minus'}">
                                昨年比${advice.lastYearDiff >= 0 ? '+' : ''}${advice.lastYearDiff}°C
                            </span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="advisor-behavior-panel">
                    <div class="behavior-title">🧠 購買行動への影響分析</div>
                    <div class="behavior-items">
                        <div class="behavior-item">
                            <span class="behavior-label">気温帯の影響:</span>
                            <span class="behavior-value" style="color: ${advice.tempZone.color}">${advice.avgTemp.toFixed(0)}°C（${advice.tempZone.label}）</span>
                        </div>
                        ${advice.lastYearDiff !== null ? `
                        <div class="behavior-item">
                            <span class="behavior-label">昨年比の影響:</span>
                            <span class="behavior-value ${advice.lastYearDiff >= 0 ? 'plus' : 'minus'}">${advice.lastYearDiff >= 0 ? '+' : ''}${advice.lastYearDiff}°C</span>
                        </div>` : ''}
                        <div class="behavior-item">
                            <span class="behavior-label">曜日の影響:</span>
                            <span class="behavior-value">${advice.dayName}</span>
                        </div>
                    </div>
                </div>
            </div>
    `;

    // カテゴリチップ
    html += '<div class="category-chips">';
    advice.categories.forEach(cat => {
        const percentClass = cat.percentage > 0 ? 'positive' : (cat.percentage < 0 ? 'negative' : 'neutral');
        const percentSign = cat.percentage > 0 ? '+' : '';
        const isSelected = state.selectedAdvisorCategory === cat.id;

        html += `
            <button class="category-chip ${percentClass} ${isSelected ? 'selected' : ''}" 
                    data-category-id="${cat.id}"
                    onclick="selectAdvisorCategory('${cat.id}')">
                <span class="chip-icon">${cat.icon}</span>
                <span class="chip-name">${cat.name}</span>
                <span class="chip-percent">${percentSign}${cat.percentage}%</span>
            </button>
        `;
    });
    html += '</div>';

    // 選択中カテゴリの詳細パネル
    const selectedCat = advice.categories.find(c => c.id === state.selectedAdvisorCategory);
    if (selectedCat) {
        const percentSign = selectedCat.percentage > 0 ? '+' : '';
        const percentClass = selectedCat.percentage > 0 ? 'positive' : (selectedCat.percentage < 0 ? 'negative' : 'neutral');

        html += `
            <div class="category-detail-panel">
                <div class="detail-header">
                    <span class="detail-icon">${selectedCat.icon}</span>
                    <span class="detail-name">${selectedCat.name}</span>
                    <span class="detail-percent ${percentClass}">${percentSign}${selectedCat.percentage}%</span>
                </div>
                <div class="detail-subcategories">
                    <div class="subcategory-title">サブカテゴリ:</div>
                    <div class="subcategory-list">
        `;

        selectedCat.subcategoryAdvice.forEach(sub => {
            const subPercentSign = sub.percentage > 0 ? '+' : '';
            const subPercentClass = sub.percentage > 0 ? 'positive' : (sub.percentage < 0 ? 'negative' : 'neutral');
            html += `
                <div class="subcategory-item">
                    <span class="subcategory-name">・${sub.name}</span>
                    <span class="subcategory-percent ${subPercentClass}">${subPercentSign}${sub.percentage}%</span>
                </div>
            `;
        });

        html += `
                    </div>
                </div>
        `;

        // 日次チェック
        const checklistKey = `${today}-${selectedCat.id}`;
        const existingChecklist = state.dailyChecklist[checklistKey] || {};

        html += `
                <div class="daily-checklist">
                    <div class="checklist-title">✅ 今日の振り返りチェック</div>
                    <div class="checklist-row">
                        <span class="checklist-label">廃棄量:</span>
                        <div class="checklist-options">
                            <button class="checklist-btn ${existingChecklist.waste === 'high' ? 'selected' : ''}" 
                                    onclick="updateChecklist('${selectedCat.id}', 'waste', 'high')">多い</button>
                            <button class="checklist-btn ${existingChecklist.waste === 'normal' ? 'selected' : ''}" 
                                    onclick="updateChecklist('${selectedCat.id}', 'waste', 'normal')">普通</button>
                            <button class="checklist-btn ${existingChecklist.waste === 'low' ? 'selected' : ''}" 
                                    onclick="updateChecklist('${selectedCat.id}', 'waste', 'low')">少ない</button>
                        </div>
                    </div>
                    <div class="checklist-row">
                        <span class="checklist-label">欠品:</span>
                        <div class="checklist-options">
                            <button class="checklist-btn ${existingChecklist.shortage === 'yes' ? 'selected' : ''}" 
                                    onclick="updateChecklist('${selectedCat.id}', 'shortage', 'yes')">あった</button>
                            <button class="checklist-btn ${existingChecklist.shortage === 'few' ? 'selected' : ''}" 
                                    onclick="updateChecklist('${selectedCat.id}', 'shortage', 'few')">少し</button>
                            <button class="checklist-btn ${existingChecklist.shortage === 'none' ? 'selected' : ''}" 
                                    onclick="updateChecklist('${selectedCat.id}', 'shortage', 'none')">なし</button>
                        </div>
                    </div>
                    <div class="checklist-row">
                        <span class="checklist-label">売れ行き:</span>
                        <div class="checklist-options">
                            <button class="checklist-btn ${existingChecklist.sales === 'good' ? 'selected' : ''}" 
                                    onclick="updateChecklist('${selectedCat.id}', 'sales', 'good')">好調</button>
                            <button class="checklist-btn ${existingChecklist.sales === 'normal' ? 'selected' : ''}" 
                                    onclick="updateChecklist('${selectedCat.id}', 'sales', 'normal')">普通</button>
                            <button class="checklist-btn ${existingChecklist.sales === 'poor' ? 'selected' : ''}" 
                                    onclick="updateChecklist('${selectedCat.id}', 'sales', 'poor')">不調</button>
                        </div>
                    </div>
                </div>
        `;

        // メモ入力
        html += `
                <div class="category-memo">
                    <div class="memo-title">📝 メモ</div>
                    <div class="memo-input-row">
                        <input type="text" id="categoryMemoInput" class="memo-input" 
                               placeholder="気づいたことをメモ..." />
                        <button class="memo-save-btn" onclick="saveCurrentMemo('${selectedCat.id}')">保存</button>
                    </div>
                    <div class="quick-tags">
                        <span class="quick-tag-label">クイックタグ:</span>
        `;

        // カテゴリに応じたクイックタグ
        const quickTags = getQuickTagsForCategory(selectedCat.id);
        quickTags.forEach(tag => {
            html += `<button class="quick-tag" onclick="addQuickTag('${selectedCat.id}', '${tag}')">${tag}</button>`;
        });

        html += `
                    </div>
                </div>
            </div>
        `;
    }

    html += '</div>';
    content.innerHTML = html;

    // トグル機能の初期化
    initAdvisorToggle();
}

// カテゴリ選択
function selectAdvisorCategory(categoryId) {
    state.selectedAdvisorCategory = state.selectedAdvisorCategory === categoryId ? null : categoryId;
    renderOrderAdvisorExtended();
}

// チェックリスト更新
function updateChecklist(categoryId, field, value) {
    const today = formatDate(new Date());
    const key = `${today}-${categoryId}`;
    const existing = state.dailyChecklist[key] || {};

    saveDailyChecklist(categoryId, today, {
        ...existing,
        [field]: value
    });

    renderOrderAdvisorExtended();
}

// 現在のメモを保存
function saveCurrentMemo(categoryId) {
    const input = document.getElementById('categoryMemoInput');
    if (!input || !input.value.trim()) return;

    const today = formatDate(new Date());
    saveCategoryMemo(categoryId, today, input.value.trim());
    input.value = '';

    alert('メモを保存しました');
}

// クイックタグを追加
function addQuickTag(categoryId, tag) {
    const today = formatDate(new Date());
    saveCategoryMemo(categoryId, today, tag, [tag]);
    alert(`"${tag}" を保存しました`);
}

// カテゴリ別クイックタグ取得
function getQuickTagsForCategory(categoryId) {
    const tagMap = {
        rice: ['弁当好調', '弁当廃棄多', 'おにぎり欠品'],
        bread: ['サンド好調', '惣菜パン人気', 'パン全体廃棄'],
        noodles: ['ラーメン絶好調', '冷やし麺廃棄', 'カップ麺欠品'],
        dessert: ['アイス好調', 'デザート廃棄', 'プリン欠品'],
        pastry: ['ドーナツ人気', '焼き菓子廃棄', 'タルト好調'],
        salad: ['サラダ好調', 'グラタン人気', '惣菜廃棄'],
        delica: ['おでん絶好調', '中華まん人気', 'フライヤー欠品'],
        milk: ['牛乳安定', 'コーヒー人気', 'ヨーグルト廃棄']
    };
    return tagMap[categoryId] || ['好調', '廃棄', '欠品'];
}

// ========================================
// 非デイリー発注アドバイザー機能
// ========================================

// 非デイリー商品カテゴリ
const NON_DAILY_CATEGORIES = {
    snacks: { name: 'お菓子', icon: '🍪' },
    drinks: { name: 'ドリンク', icon: '🥤' },
    ice: { name: 'アイス', icon: '🍦' },
    misc: { name: '雑貨', icon: '🧴' },
    processed: { name: '加工食品', icon: '🥫' },
    character: { name: '流行しているキャラクター', icon: '⭐' }
};

// 非デイリーアドバイザーを描画
function renderNonDailyAdvisor() {
    const container = document.getElementById('nonDailyAdvisor');
    const content = document.getElementById('nonDailyContent');
    if (!container || !content) return;

    // 管理者の場合はデータがなくても表示（追加できるように）
    if (state.nonDailyAdvice.length === 0 && !state.isAdmin) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    // 現在のフィルター状態を取得
    const currentFilter = state.nonDailyFilter || 'all';

    // フィルタリング
    let filteredAdvice = [...state.nonDailyAdvice];
    if (currentFilter !== 'all') {
        filteredAdvice = filteredAdvice.filter(a => a.category === currentFilter);
    }

    // 更新日時順にソート
    const sortedAdvice = filteredAdvice.sort((a, b) =>
        new Date(b.updatedAt) - new Date(a.updatedAt)
    );

    // フィルタータブを構築
    let html = `
        <div class="filter-tabs non-daily-filter-tabs">
            <button class="filter-tab ${currentFilter === 'all' ? 'active' : ''}" onclick="filterNonDailyByCategory('all')">すべて</button>
            ${Object.entries(NON_DAILY_CATEGORIES).map(([key, cat]) =>
        `<button class="filter-tab ${currentFilter === key ? 'active' : ''}" onclick="filterNonDailyByCategory('${key}')">${cat.icon} ${cat.name}</button>`
    ).join('')}
        </div>
    `;

    // 管理者向けに追加ボタンを表示
    if (state.isAdmin) {
        const selectedCategory = currentFilter !== 'all' ? currentFilter : '';
        html += `
            <div class="non-daily-admin-actions">
                <button class="btn btn-primary btn-sm" onclick="openNonDailyAdviceFormWithCategory('${selectedCategory}')">+ 新規追加</button>
            </div>
        `;
    }

    html += '<div class="non-daily-advice-grid">';

    if (sortedAdvice.length === 0) {
        html += '<p class="no-advice-message">該当するアドバイスはありません</p>';
    } else {
        sortedAdvice.forEach(advice => {
            const category = NON_DAILY_CATEGORIES[advice.category] || NON_DAILY_CATEGORIES.character;
            const updatedDate = new Date(advice.updatedAt);
            const dateStr = `${updatedDate.getMonth() + 1}/${updatedDate.getDate()}`;

            html += `
                <div class="non-daily-advice-card" data-category="${advice.category}">
                    <span class="advice-card-icon">${category.icon}</span>
                    <div class="advice-card-body">
                        <div class="advice-card-title">${advice.title}</div>
                        <div class="advice-card-content">${advice.content.replace(/\n/g, '<br>')}</div>
                        <div class="advice-card-meta">
                            <span class="advice-card-category">${category.name}</span>
                            ${advice.source ? `<span class="advice-card-source">📱 ${advice.source}</span>` : ''}
                            <span class="advice-card-date">🕐 ${dateStr}</span>
                        </div>
                        ${state.isAdmin ? `
                        <div class="advice-card-actions">
                            <button class="btn btn-sm btn-secondary" onclick="openNonDailyAdviceForm('${advice.id}')">✏️ 編集</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteNonDailyAdvice('${advice.id}')">🗑️ 削除</button>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });
    }

    html += '</div>';
    content.innerHTML = html;

    // トグル機能の初期化
    initNonDailyToggle();
}

// 非デイリーアドバイザーのトグル機能を初期化
function initNonDailyToggle() {
    const container = document.getElementById('nonDailyAdvisor');
    if (!container) return;

    const header = container.querySelector('.advisor-header');
    const toggle = document.getElementById('nonDailyToggle');
    const content = document.getElementById('nonDailyContent');

    if (header && toggle && content) {
        header.onclick = () => {
            toggle.classList.toggle('collapsed');
            content.classList.toggle('collapsed');
        };
    }
}

// ========================================
// 週次インテリジェンス（マクロ環境）
// ========================================

// 管理者用 週次インテリジェンス（マクロ環境）管理画面
// コンビニ3社 新商品ヒット予測レポート管理画面
function renderTrendReportsAdmin(container) {
    const reports = state.trendReports || [];
    
    // 更新日時順にソート（新しい順）
    const sortedReports = [...reports].sort((a, b) => 
        new Date(b.updatedAt || b.createdAt || b.uploadedAt) - new Date(a.updatedAt || a.createdAt || a.uploadedAt)
    );

    let html = `
        <div class="new-product-admin-container">
            <div class="new-product-admin-header">
                <h3>📊 コンビニ3社 新商品ヒット予測レポート管理</h3>
                <p class="header-description">コンビニ3社 新商品ヒット予測レポートを登録・管理します。登録した内容は「発注・スケジュール情報」→「レポート」に表示されます。</p>
                <button class="btn btn-primary" onclick="openAddTrendReportModal()">+ コンビニ3社 新商品ヒット予測レポート追加</button>
            </div>
            
            <div class="new-product-admin-list">
    `;

    if (sortedReports.length === 0) {
        html += '<p class="no-data-message">コンビニ3社 新商品ヒット予測レポートがまだ登録されていません。<br>「+ コンビニ3社 新商品ヒット予測レポート追加」ボタンから追加してください。</p>';
    } else {
        sortedReports.forEach(report => {
            const createdDate = new Date(report.createdAt || report.uploadedAt);
            const dateStr = `${createdDate.getFullYear()}/${createdDate.getMonth() + 1}/${createdDate.getDate()}`;
            const updatedDate = report.updatedAt ? new Date(report.updatedAt) : null;
            const updatedStr = updatedDate ? `${updatedDate.getFullYear()}/${updatedDate.getMonth() + 1}/${updatedDate.getDate()}` : null;
            
            // 古い形式（ファイルアップロード）か新しい形式（記述式）かを判定
            const isOldFormat = report.fileData && !report.content;
            
            html += `
                <div class="new-product-admin-card">
                    <div class="admin-card-header">
                        <div class="admin-card-title">${report.title}</div>
                        <div class="admin-card-meta">
                            <span>📅 作成: ${dateStr}</span>
                            ${updatedStr && updatedStr !== dateStr ? `<span>✏️ 更新: ${updatedStr}</span>` : ''}
                            ${isOldFormat ? '<span style="color:#f59e0b;">⚠️ 旧形式</span>' : ''}
                        </div>
                    </div>
                    <div class="admin-card-content">
                        ${isOldFormat 
                            ? `<p style="color:var(--text-muted);">このレポートはファイル形式です。記述式に変更するには削除して新規作成してください。<br>ファイル: ${report.fileName || '不明'} (${formatFileSize(report.fileSize) || '不明'})</p>`
                            : renderMarkdown(report.content)
                        }
                    </div>
                    <div class="admin-card-actions">
                        ${!isOldFormat ? `<button class="btn btn-sm btn-secondary" onclick="openEditTrendReportModal('${report.id}')">✏️ 編集</button>` : ''}
                        <button class="btn btn-sm btn-danger" onclick="deleteTrendReport('${report.id}')">🗑️ 削除</button>
                    </div>
                </div>
            `;
        });
    }

    html += `
            </div>
        </div>
    `;

    container.innerHTML = html;
}

function renderNewProductReportAdmin(container) {
    const reports = state.newProductReports || [];
    
    // 更新日時順にソート（新しい順）
    const sortedReports = [...reports].sort((a, b) => 
        new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );

    let html = `
        <div class="new-product-admin-container">
            <div class="new-product-admin-header">
                <h3>🆕 週次インテリジェンス（マクロ環境）管理</h3>
                <p class="header-description">新商品の情報を登録・管理します。登録した内容は「発注・スケジュール情報」に表示されます。</p>
                <button class="btn btn-primary" onclick="openAddNewProductReportModal()">+ 週次インテリジェンス（マクロ環境）追加</button>
            </div>
            
            <div class="new-product-admin-list">
    `;

    if (sortedReports.length === 0) {
        html += '<p class="no-data-message">週次インテリジェンス（マクロ環境）がまだ登録されていません。<br>「+ 週次インテリジェンス（マクロ環境）追加」ボタンから追加してください。</p>';
    } else {
        sortedReports.forEach(report => {
            const createdDate = new Date(report.createdAt);
            const dateStr = `${createdDate.getFullYear()}/${createdDate.getMonth() + 1}/${createdDate.getDate()}`;
            const updatedDate = report.updatedAt ? new Date(report.updatedAt) : null;
            const updatedStr = updatedDate ? `${updatedDate.getFullYear()}/${updatedDate.getMonth() + 1}/${updatedDate.getDate()}` : null;
            
            html += `
                <div class="new-product-admin-card">
                    <div class="admin-card-header">
                        <div class="admin-card-title">${report.title}</div>
                        <div class="admin-card-meta">
                            <span>📅 作成: ${dateStr}</span>
                            ${updatedStr && updatedStr !== dateStr ? `<span>✏️ 更新: ${updatedStr}</span>` : ''}
                        </div>
                    </div>
                    <div class="admin-card-content">${renderMarkdown(report.content)}</div>
                    <div class="admin-card-actions">
                        <button class="btn btn-sm btn-secondary" onclick="openEditNewProductReportModal('${report.id}')">✏️ 編集</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteNewProductReport('${report.id}')">🗑️ 削除</button>
                    </div>
                </div>
            `;
        });
    }

    html += `
            </div>
        </div>
    `;

    container.innerHTML = html;
}

// 週次インテリジェンス（マクロ環境）を描画（フロント表示用）
function renderNewProductReport() {
    const container = document.getElementById('newProductReportSection');
    const content = document.getElementById('newProductContent');
    if (!container || !content) return;

    const reports = state.newProductReports || [];
    
    // 更新日時順にソート（新しい順）
    const sortedReports = [...reports].sort((a, b) => 
        new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );

    let html = '';

    if (sortedReports.length === 0) {
        html += '<p class="no-report-message">週次インテリジェンス（マクロ環境）はまだありません。</p>';
    } else {
        html += '<div class="new-product-reports-list">';
        sortedReports.forEach(report => {
            const createdDate = new Date(report.createdAt);
            const dateStr = `${createdDate.getFullYear()}/${createdDate.getMonth() + 1}/${createdDate.getDate()}`;
            
            html += `
                <div class="new-product-report-card">
                    <div class="report-header">
                        <span class="report-title">${report.title}</span>
                        <span class="report-date">📅 ${dateStr}</span>
                    </div>
                    <div class="report-content">${renderMarkdown(report.content)}</div>
                    ${state.isAdmin ? `
                        <div class="report-actions">
                            <button class="btn btn-sm btn-secondary" onclick="openEditNewProductReportModal('${report.id}')">✏️ 編集</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteNewProductReport('${report.id}')">🗑️ 削除</button>
                        </div>
                    ` : ''}
                </div>
            `;
        });
        html += '</div>';
    }

    content.innerHTML = html;

    // トグル機能の初期化
    initNewProductToggle();
}

// 週次インテリジェンス（マクロ環境）のトグル機能を初期化
function initNewProductToggle() {
    const container = document.getElementById('newProductReportSection');
    if (!container) return;

    const header = container.querySelector('.advisor-header');
    const toggle = document.getElementById('newProductToggle');
    const content = document.getElementById('newProductContent');

    if (header && toggle && content) {
        header.onclick = (e) => {
            e.stopPropagation();
            toggle.classList.toggle('collapsed');
            content.classList.toggle('collapsed');
            toggle.textContent = content.classList.contains('collapsed') ? '▼' : '▲';
        };
    }
}

// 週次インテリジェンス（マクロ環境）追加モーダルを開く
function openAddNewProductReportModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay category-modal-overlay active';
    modal.innerHTML = `
        <div class="modal category-modal" style="max-width: 600px;">
            <div class="modal-header">
                <h2 class="modal-title">🆕 週次インテリジェンス（マクロ環境）追加</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <form class="modal-body" onsubmit="submitNewProductReport(event, this)">
                <div class="form-group">
                    <label>タイトル <span class="required">*</span></label>
                    <input type="text" name="title" placeholder="例: 2026年1月 新商品情報" required>
                </div>
                <div class="form-group markdown-form-group">
                    <label>内容 <span class="required">*</span></label>
                    <div class="preview-tabs">
                        <button type="button" class="preview-tab active" data-mode="edit" onclick="toggleMarkdownPreview(this.closest('.markdown-form-group'), 'edit')">✏️ 編集</button>
                        <button type="button" class="preview-tab" data-mode="preview" onclick="toggleMarkdownPreview(this.closest('.markdown-form-group'), 'preview')">👁️ プレビュー</button>
                    </div>
                    <textarea name="content" rows="10" placeholder="新商品の情報を入力してください（Markdown対応）..." required></textarea>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">キャンセル</button>
                    <button type="submit" class="btn btn-primary">保存</button>
                </div>
            </form>
        </div>
    `;

    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
}

// 週次インテリジェンス（マクロ環境）編集モーダルを開く
function openEditNewProductReportModal(reportId) {
    const report = state.newProductReports.find(r => r.id === reportId);
    if (!report) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay category-modal-overlay active';
    modal.innerHTML = `
        <div class="modal category-modal" style="max-width: 600px;">
            <div class="modal-header">
                <h2 class="modal-title">🆕 週次インテリジェンス（マクロ環境）編集</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <form class="modal-body" onsubmit="submitNewProductReport(event, this, '${reportId}')">
                <div class="form-group">
                    <label>タイトル <span class="required">*</span></label>
                    <input type="text" name="title" value="${report.title}" required>
                </div>
                <div class="form-group markdown-form-group">
                    <label>内容 <span class="required">*</span></label>
                    <div class="preview-tabs">
                        <button type="button" class="preview-tab active" data-mode="edit" onclick="toggleMarkdownPreview(this.closest('.markdown-form-group'), 'edit')">✏️ 編集</button>
                        <button type="button" class="preview-tab" data-mode="preview" onclick="toggleMarkdownPreview(this.closest('.markdown-form-group'), 'preview')">👁️ プレビュー</button>
                    </div>
                    <textarea name="content" rows="10" required>${report.content}</textarea>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">キャンセル</button>
                    <button type="submit" class="btn btn-primary">保存</button>
                </div>
            </form>
        </div>
    `;

    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
}

// 週次インテリジェンス（マクロ環境）送信
function submitNewProductReport(event, form, reportId = null) {
    event.preventDefault();
    const formData = new FormData(form);
    const title = formData.get('title');
    const content = formData.get('content');
    
    if (reportId) {
        // 編集
        const report = state.newProductReports.find(r => r.id === reportId);
        if (report) {
            report.title = title;
            report.content = content;
            report.updatedAt = new Date().toISOString();
        }
        trackUsage('edit_new_product', '管理者');
    } else {
        // 新規追加
        const newReport = {
            id: 'report-' + Date.now(),
            title,
            content,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        state.newProductReports.push(newReport);
        trackUsage('add_new_product', '管理者');
    }
    
    saveToFirebase('newProductReports', state.newProductReports);
    form.closest('.modal-overlay').remove();
    renderNewProductReport();
}

// 週次インテリジェンス（マクロ環境）削除
function deleteNewProductReport(reportId) {
    if (!confirm('このレポートを削除しますか？')) return;
    
    state.newProductReports = state.newProductReports.filter(r => r.id !== reportId);
    saveToFirebase('newProductReports', state.newProductReports);
    trackUsage('delete_new_product', '管理者');
    renderNewProductReport();
}

// ========================================
// 新規商品調査レポート
// ========================================

// 新規商品調査レポートのカテゴリ定義
const PRODUCT_RESEARCH_CATEGORIES = [
    { id: 'rice_bento', name: '米飯・弁当・おにぎり', icon: '🍙' },
    { id: 'sandwich_bread', name: 'サンドイッチ・調理パン', icon: '🥪' },
    { id: 'daily_deli', name: 'デイリー惣菜・デリカ', icon: '🍳' },
    { id: 'daily_sweets', name: 'デイリースイーツ', icon: '🍰' },
    { id: 'yogurt_dairy', name: 'ヨーグルト・乳製品・チルド飲料', icon: '🥛' },
    { id: 'ice_frozen', name: 'アイス・フローズン', icon: '🍨' },
    { id: 'alcohol', name: 'アルコール', icon: '🍺' },
    { id: 'soft_drink', name: 'ソフトドリンク', icon: '🥤' },
    { id: 'cup_noodle', name: 'カップ麺・即席食品', icon: '🍜' },
    { id: 'snack', name: '菓子・スナック', icon: '🍫' },
    { id: 'processed_food', name: '加工食品・調味料', icon: '🫙' },
    { id: 'daily_goods', name: '日用品・雑貨・季節品', icon: '🧴' },
    { id: 'special_order', name: '特別発注品', icon: '⭐' }
];

// 新規商品調査レポート管理画面
function renderProductResearchAdmin(container) {
    const reports = state.productResearchReports || [];

    const sortedReports = [...reports].sort((a, b) =>
        new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );

    let html = `
        <div class="new-product-admin-container">
            <div class="new-product-admin-header">
                <h3>🔍 新規商品調査レポート管理</h3>
                <p class="header-description">新規商品の調査レポートを登録・管理します。登録した内容は「レポート」セクションに表示されます。</p>
                <button class="btn btn-primary" onclick="openAddProductResearchModal()">+ 新規商品調査レポート追加</button>
            </div>

            <div class="new-product-admin-list">
    `;

    if (sortedReports.length === 0) {
        html += '<p class="no-data-message">新規商品調査レポートがまだ登録されていません。<br>「+ 新規商品調査レポート追加」ボタンから追加してください。</p>';
    } else {
        sortedReports.forEach(report => {
            const createdDate = new Date(report.createdAt);
            const dateStr = `${createdDate.getFullYear()}/${createdDate.getMonth() + 1}/${createdDate.getDate()}`;
            const updatedDate = report.updatedAt ? new Date(report.updatedAt) : null;
            const updatedStr = updatedDate ? `${updatedDate.getFullYear()}/${updatedDate.getMonth() + 1}/${updatedDate.getDate()}` : null;

            html += `
                <div class="new-product-admin-card">
                    <div class="admin-card-header">
                        <div class="admin-card-title">${report.title}</div>
                        <div class="admin-card-meta">
                            <span>📅 作成: ${dateStr}</span>
                            ${updatedStr && updatedStr !== dateStr ? `<span>✏️ 更新: ${updatedStr}</span>` : ''}
                        </div>
                    </div>
                    ${(() => {
                        const cats = report.categories ? (Array.isArray(report.categories) ? report.categories : Object.values(report.categories)) : [];
                        if (cats.length > 0) {
                            return `<div class="research-category-tags" style="margin: 8px 16px;">
                                ${cats.map(catId => {
                                    const cat = PRODUCT_RESEARCH_CATEGORIES.find(c => c.id === catId);
                                    return cat ? `<span class="research-category-tag">${cat.icon} ${cat.name}</span>` : '';
                                }).join('')}
                            </div>`;
                        }
                        return `<div class="research-category-tags" style="margin: 8px 16px;">
                            <span class="research-category-tag" style="background: rgba(156,163,175,0.2); color: var(--text-secondary);">⚠️ カテゴリ未設定</span>
                            <button class="btn btn-sm" style="font-size: 0.7rem; padding: 2px 8px; margin-left: 4px;" onclick="openEditProductResearchModal('${report.id}')">設定する</button>
                        </div>`;
                    })()}
                    <div class="admin-card-content">${renderMarkdown(report.content)}</div>
                    <div class="admin-card-actions">
                        <button class="btn btn-sm btn-secondary" onclick="openEditProductResearchModal('${report.id}')">✏️ 編集</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteProductResearch('${report.id}')">🗑️ 削除</button>
                    </div>
                </div>
            `;
        });
    }

    html += `
            </div>
        </div>
    `;

    container.innerHTML = html;
}

// 新規商品調査レポートを描画（フロント表示用）
function renderProductResearch() {
    const container = document.getElementById('productResearchSection');
    const content = document.getElementById('productResearchContent');
    if (!container || !content) return;

    const reports = state.productResearchReports || [];

    const sortedReports = [...reports].sort((a, b) =>
        new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );

    const filteredReports = sortedReports;

    let html = '';

    // レポート件数表示（複数レポートがある場合）
    if (sortedReports.length > 1) {
        html += `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 12px;">📊 ${sortedReports.length}件のレポート</div>`;
    }

    if (filteredReports.length === 0) {
        if (sortedReports.length === 0) {
            html += '<p class="no-report-message">新規商品調査レポートはまだありません。</p>';
        } else {
            html += '<p class="no-report-message">このカテゴリーのレポートはありません。</p>';
        }
    } else {
        html += '<div class="product-research-reports-list">';
        filteredReports.forEach((report, reportIdx) => {
            const createdDate = new Date(report.createdAt);
            const dateStr = `${createdDate.getFullYear()}/${createdDate.getMonth() + 1}/${createdDate.getDate()}`;

            // Markdownコンテンツから### 見出しでセクション分割
            const renderedContent = renderMarkdown(report.content);
            const sections = extractReportSections(report.content);
            const reportId = `report-${reportIdx}`;

            // 商品名リストを抽出（H4見出し）
            const productNames = extractProductNames(report.content);

            // セクションフィルターUI（H3見出しが2つ以上ある場合のみ表示）
            let sectionFilterHtml = '';
            if (sections.length >= 2 || productNames.length > 0) {
                sectionFilterHtml = `
                    <div class="report-section-filter" id="${reportId}-filter">
                        ${sections.length >= 2 ? `
                            <button class="section-chip active" onclick="filterReportSection('${reportId}', 'all', this)">📋 全体</button>
                            ${sections.map((sec, i) => `<button class="section-chip" onclick="filterReportSection('${reportId}', '${i}', this)">${sec.title}</button>`).join('')}
                        ` : ''}
                    </div>
                    ${productNames.length > 0 ? `
                        <div class="report-product-search" id="${reportId}-search">
                            <div class="product-search-input-wrap">
                                <span class="product-search-icon">🔍</span>
                                <input type="text" class="product-search-input" placeholder="商品名で検索..." oninput="searchProductInReport('${reportId}', this.value)" id="${reportId}-search-input">
                                <button class="product-search-clear" onclick="clearProductSearch('${reportId}')" style="display:none;" id="${reportId}-search-clear">✕</button>
                            </div>
                            <div class="product-search-results" id="${reportId}-search-results" style="display:none;"></div>
                        </div>
                    ` : ''}
                `;
            }

            // セクション分割されたHTMLを生成
            let sectionContentHtml;
            if (sections.length >= 2) {
                sectionContentHtml = buildSectionedReportHtml(report.content, sections, reportId);
            } else {
                sectionContentHtml = renderedContent;
            }

            html += `
                <div class="product-research-card" id="${reportId}">
                    <div class="report-header">
                        <span class="report-title">${report.title}</span>
                        <span class="report-date">📅 ${dateStr}</span>
                    </div>
                    ${sectionFilterHtml}
                    <div class="report-content">${sectionContentHtml}</div>
                    ${state.isAdmin ? `
                        <div class="report-actions">
                            <button class="btn btn-sm btn-secondary" onclick="openEditProductResearchModal('${report.id}')">✏️ 編集</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteProductResearch('${report.id}')">🗑️ 削除</button>
                        </div>
                    ` : ''}
                </div>
            `;
        });
        html += '</div>';
    }

    content.innerHTML = html;

    initProductResearchToggle();
}

// レポートのMarkdownコンテンツから### 見出しセクションを抽出
function extractReportSections(markdownContent) {
    const lines = markdownContent.split('\n');
    const sections = [];
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^### (.+)/);
        if (match) {
            sections.push({ title: match[1].trim(), lineIndex: i });
        }
    }
    return sections;
}

// セクション分割されたHTMLを生成
function buildSectionedReportHtml(markdownContent, sections, reportId) {
    const lines = markdownContent.split('\n');

    // セクション前のコンテンツ（概要サマリーなど）
    const preContent = lines.slice(0, sections[0].lineIndex).join('\n');
    let html = `<div class="report-section-block" data-report="${reportId}" data-section="pre">${renderMarkdown(preContent)}</div>`;

    // 各セクション
    sections.forEach((sec, i) => {
        const startLine = sec.lineIndex;
        const endLine = i + 1 < sections.length ? sections[i + 1].lineIndex : lines.length;
        const sectionContent = lines.slice(startLine, endLine).join('\n');
        html += `<div class="report-section-block" data-report="${reportId}" data-section="${i}">${renderMarkdown(sectionContent)}</div>`;
    });

    return html;
}

// レポート内セクションフィルター
function filterReportSection(reportId, sectionId, btn) {
    // ボタンのアクティブ状態を更新
    const filterContainer = document.getElementById(`${reportId}-filter`);
    if (filterContainer) {
        filterContainer.querySelectorAll('.section-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    // セクションの表示/非表示を切り替え
    const blocks = document.querySelectorAll(`.report-section-block[data-report="${reportId}"]`);
    blocks.forEach(block => {
        if (sectionId === 'all') {
            block.style.display = '';
        } else {
            const blockSection = block.dataset.section;
            // 「pre」（概要部分）は常に表示、選択セクションのみ表示
            block.style.display = (blockSection === 'pre' || blockSection === sectionId) ? '' : 'none';
        }
    });

    // スクロール位置を調整（選択したセクションの先頭へ）
    if (sectionId !== 'all') {
        const targetBlock = document.querySelector(`.report-section-block[data-report="${reportId}"][data-section="${sectionId}"]`);
        if (targetBlock) {
            targetBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

// レポートのMarkdownコンテンツから#### 見出し（商品名）を抽出
function extractProductNames(markdownContent) {
    const lines = markdownContent.split('\n');
    const products = [];
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^#### (.+)/);
        if (match) {
            products.push(match[1].trim());
        }
    }
    return products;
}

// 商品名検索
function searchProductInReport(reportId, query) {
    const resultsContainer = document.getElementById(`${reportId}-search-results`);
    const clearBtn = document.getElementById(`${reportId}-search-clear`);
    if (!resultsContainer || !clearBtn) return;

    clearBtn.style.display = query ? '' : 'none';

    if (!query || query.length < 1) {
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
        // ハイライトを消す
        removeProductHighlights(reportId);
        return;
    }

    // レポート内のH4要素から検索
    const reportCard = document.getElementById(reportId);
    if (!reportCard) return;
    const h4Elements = reportCard.querySelectorAll('.report-content h4');
    const matches = [];

    h4Elements.forEach(h4 => {
        const text = h4.textContent;
        if (text.toLowerCase().includes(query.toLowerCase())) {
            matches.push({ text, element: h4 });
        }
    });

    if (matches.length === 0) {
        resultsContainer.style.display = 'block';
        resultsContainer.innerHTML = '<div class="product-search-no-result">該当する商品が見つかりません</div>';
    } else {
        resultsContainer.style.display = 'block';
        resultsContainer.innerHTML = matches.map((m, i) =>
            `<button class="product-search-result-item" onclick="jumpToProduct('${reportId}', ${i}, '${query.replace(/'/g, "\\'")}')">📦 ${m.text}</button>`
        ).join('');
    }
}

// 商品へジャンプ
function jumpToProduct(reportId, matchIndex, query) {
    const reportCard = document.getElementById(reportId);
    if (!reportCard) return;

    const h4Elements = reportCard.querySelectorAll('.report-content h4');
    const matches = [];
    h4Elements.forEach(h4 => {
        if (h4.textContent.toLowerCase().includes(query.toLowerCase())) {
            matches.push(h4);
        }
    });

    if (matchIndex >= matches.length) return;
    const target = matches[matchIndex];

    // まず全セクションを表示に戻す
    const blocks = document.querySelectorAll(`.report-section-block[data-report="${reportId}"]`);
    blocks.forEach(block => block.style.display = '');
    // セクションチップの「全体」をアクティブに
    const filterContainer = document.getElementById(`${reportId}-filter`);
    if (filterContainer) {
        filterContainer.querySelectorAll('.section-chip').forEach(b => b.classList.remove('active'));
        const allBtn = filterContainer.querySelector('.section-chip');
        if (allBtn) allBtn.classList.add('active');
    }

    // 前回のハイライトを消す
    removeProductHighlights(reportId);

    // ハイライトを付ける
    target.classList.add('product-highlight');
    // 親のセクションブロックもハイライト
    const parentBlock = target.closest('.report-section-block');
    if (parentBlock) parentBlock.classList.add('product-section-highlight');

    // スクロール
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // 検索結果を閉じる
    const resultsContainer = document.getElementById(`${reportId}-search-results`);
    if (resultsContainer) resultsContainer.style.display = 'none';

    // 3秒後にハイライトを消す
    setTimeout(() => removeProductHighlights(reportId), 3000);
}

// ハイライト解除
function removeProductHighlights(reportId) {
    const reportCard = document.getElementById(reportId);
    if (!reportCard) return;
    reportCard.querySelectorAll('.product-highlight').forEach(el => el.classList.remove('product-highlight'));
    reportCard.querySelectorAll('.product-section-highlight').forEach(el => el.classList.remove('product-section-highlight'));
}

// 検索クリア
function clearProductSearch(reportId) {
    const input = document.getElementById(`${reportId}-search-input`);
    if (input) input.value = '';
    searchProductInReport(reportId, '');
}

// 新規商品調査レポートをカテゴリでフィルタリング
function filterProductResearch(categoryId) {
    state.productResearchFilter = categoryId;
    renderProductResearch();
}

// 新規商品調査レポートのトグル機能を初期化
function initProductResearchToggle() {
    const container = document.getElementById('productResearchSection');
    if (!container) return;

    const header = container.querySelector('.advisor-header');
    const toggle = document.getElementById('productResearchToggle');
    const content = document.getElementById('productResearchContent');

    if (header && toggle && content) {
        header.onclick = (e) => {
            e.stopPropagation();
            toggle.classList.toggle('collapsed');
            content.classList.toggle('collapsed');
            toggle.textContent = content.classList.contains('collapsed') ? '▼' : '▲';
        };
    }
}

// 新規商品調査レポート追加モーダルを開く
function openAddProductResearchModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay category-modal-overlay active';
    modal.innerHTML = `
        <div class="modal category-modal" style="max-width: 600px;">
            <div class="modal-header">
                <h2 class="modal-title">🔍 新規商品調査レポート追加</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <form class="modal-body" onsubmit="submitProductResearch(event, this)">
                <div class="form-group">
                    <label>タイトル <span class="required">*</span></label>
                    <input type="text" name="title" placeholder="例: 2026年3月 新規商品調査レポート" required>
                </div>
                <div class="form-group">
                    <label>カテゴリー <span class="required">*</span></label>
                    <div class="product-research-category-checkboxes">
                        ${PRODUCT_RESEARCH_CATEGORIES.map(cat => `
                            <label class="category-checkbox-label">
                                <input type="checkbox" name="categories" value="${cat.id}">
                                <span>${cat.icon} ${cat.name}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div class="form-group markdown-form-group">
                    <label>内容 <span class="required">*</span></label>
                    <div class="preview-tabs">
                        <button type="button" class="preview-tab active" data-mode="edit" onclick="toggleMarkdownPreview(this.closest('.markdown-form-group'), 'edit')">✏️ 編集</button>
                        <button type="button" class="preview-tab" data-mode="preview" onclick="toggleMarkdownPreview(this.closest('.markdown-form-group'), 'preview')">👁️ プレビュー</button>
                    </div>
                    <textarea name="content" rows="10" placeholder="新規商品の調査内容を入力してください（Markdown対応）..." required></textarea>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">キャンセル</button>
                    <button type="submit" class="btn btn-primary">保存</button>
                </div>
            </form>
        </div>
    `;

    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
}

// 新規商品調査レポート編集モーダルを開く
function openEditProductResearchModal(reportId) {
    const report = state.productResearchReports.find(r => r.id === reportId);
    if (!report) return;

    const reportCategories = report.categories || [];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay category-modal-overlay active';
    modal.innerHTML = `
        <div class="modal category-modal" style="max-width: 600px;">
            <div class="modal-header">
                <h2 class="modal-title">🔍 新規商品調査レポート編集</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <form class="modal-body" onsubmit="submitProductResearch(event, this, '${reportId}')">
                <div class="form-group">
                    <label>タイトル <span class="required">*</span></label>
                    <input type="text" name="title" value="${report.title}" required>
                </div>
                <div class="form-group">
                    <label>カテゴリー <span class="required">*</span></label>
                    <div class="product-research-category-checkboxes">
                        ${PRODUCT_RESEARCH_CATEGORIES.map(cat => `
                            <label class="category-checkbox-label">
                                <input type="checkbox" name="categories" value="${cat.id}" ${reportCategories.includes(cat.id) ? 'checked' : ''}>
                                <span>${cat.icon} ${cat.name}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div class="form-group markdown-form-group">
                    <label>内容 <span class="required">*</span></label>
                    <div class="preview-tabs">
                        <button type="button" class="preview-tab active" data-mode="edit" onclick="toggleMarkdownPreview(this.closest('.markdown-form-group'), 'edit')">✏️ 編集</button>
                        <button type="button" class="preview-tab" data-mode="preview" onclick="toggleMarkdownPreview(this.closest('.markdown-form-group'), 'preview')">👁️ プレビュー</button>
                    </div>
                    <textarea name="content" rows="10" required>${report.content}</textarea>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">キャンセル</button>
                    <button type="submit" class="btn btn-primary">保存</button>
                </div>
            </form>
        </div>
    `;

    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
}

// 新規商品調査レポート送信
function submitProductResearch(event, form, reportId = null) {
    event.preventDefault();
    const formData = new FormData(form);
    const title = formData.get('title');
    const content = formData.get('content');
    const categories = formData.getAll('categories');

    if (reportId) {
        const report = state.productResearchReports.find(r => r.id === reportId);
        if (report) {
            report.title = title;
            report.content = content;
            report.categories = categories;
            report.updatedAt = new Date().toISOString();
        }
        trackUsage('edit_product_research', '管理者');
    } else {
        const newReport = {
            id: 'research-' + Date.now(),
            title,
            content,
            categories,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        state.productResearchReports.push(newReport);
        trackUsage('add_product_research', '管理者');
    }

    saveToFirebase('productResearchReports', state.productResearchReports);
    form.closest('.modal-overlay').remove();
    renderProductResearch();
}

// 新規商品調査レポート削除
function deleteProductResearch(reportId) {
    if (!confirm('このレポートを削除しますか？')) return;

    state.productResearchReports = state.productResearchReports.filter(r => r.id !== reportId);
    saveToFirebase('productResearchReports', state.productResearchReports);
    trackUsage('delete_product_research', '管理者');
    renderProductResearch();
}

// ========================================
// 店舗スケジュール一覧
// ========================================

// 店舗スケジュール一覧を描画
function renderScheduleList() {
    const container = document.getElementById('scheduleListSection');
    const content = document.getElementById('scheduleListContent');
    if (!container || !content) return;

    // 現在表示中の週の日付範囲を取得
    const startDate = formatDate(state.currentWeekStart);
    const endDate = new Date(state.currentWeekStart);
    endDate.setDate(endDate.getDate() + 6);
    const endDateStr = formatDate(endDate);

    // 今週のイベントをフィルタリング
    const weekEvents = state.dailyEvents.filter(event => {
        const eventStart = event.startDate || event.date;
        const eventEnd = event.endDate || event.date;
        // イベント期間が今週の範囲と重なるかをチェック
        return eventEnd >= startDate && eventStart <= endDateStr;
    });

    // イベントがなければ非表示
    if (weekEvents.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    // イベントを開始日でソート
    weekEvents.sort((a, b) => {
        const dateA = a.startDate || a.date;
        const dateB = b.startDate || b.date;
        return dateA.localeCompare(dateB);
    });

    const icons = getEventTypeIcons();
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

    let html = '<div class="schedule-list-grid">';

    weekEvents.forEach(event => {
        const icon = icons[event.type] || icons.other;
        const typeName = getEventTypeName(event.type);

        // 日付表示を作成
        const startDateObj = new Date(event.startDate || event.date);
        const endDateObj = new Date(event.endDate || event.date);

        let dateDisplay;
        if ((event.startDate || event.date) === (event.endDate || event.date)) {
            // 1日のみ
            dateDisplay = `${startDateObj.getMonth() + 1}/${startDateObj.getDate()}（${dayNames[startDateObj.getDay()]}）`;
        } else {
            // 期間
            dateDisplay = `${startDateObj.getMonth() + 1}/${startDateObj.getDate()}（${dayNames[startDateObj.getDay()]}）〜 ${endDateObj.getMonth() + 1}/${endDateObj.getDate()}（${dayNames[endDateObj.getDay()]}）`;
        }

        html += `
            <div class="schedule-list-item" data-type="${event.type}">
                <div class="schedule-item-icon">${icon}</div>
                <div class="schedule-item-body">
                    <div class="schedule-item-date">${dateDisplay}</div>
                    <div class="schedule-item-title">
                        ${event.title}
                        <span class="schedule-item-type">${typeName}</span>
                    </div>
                    ${event.description ? `<div class="schedule-item-description">${event.description.replace(/\n/g, '<br>')}</div>` : ''}
                </div>
            </div>
        `;
    });

    html += '</div>';
    content.innerHTML = html;

    // トグル機能の初期化
    initScheduleToggle();
}

// 店舗スケジュール一覧のトグル機能を初期化
function initScheduleToggle() {
    const container = document.getElementById('scheduleListSection');
    if (!container) return;

    const header = container.querySelector('.advisor-header');
    const toggle = document.getElementById('scheduleToggle');
    const content = document.getElementById('scheduleListContent');

    if (header && toggle && content) {
        header.onclick = () => {
            toggle.classList.toggle('collapsed');
            content.classList.toggle('collapsed');
        };
    }
}

// 非デイリーアドバイスを追加
function addNonDailyAdvice(data) {
    const advice = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...data
    };
    state.nonDailyAdvice.push(advice);
    saveToFirebase('nonDailyAdvice', state.nonDailyAdvice);
    trackUsage('add_non_daily', '管理者');
}

// 非デイリーアドバイスを更新
function updateNonDailyAdvice(id, data) {
    const index = state.nonDailyAdvice.findIndex(a => a.id === id);
    if (index >= 0) {
        state.nonDailyAdvice[index] = {
            ...state.nonDailyAdvice[index],
            ...data,
            updatedAt: new Date().toISOString()
        };
        saveToFirebase('nonDailyAdvice', state.nonDailyAdvice);
        trackUsage('edit_non_daily', '管理者');
    }
}

// 非デイリーアドバイスを削除
function deleteNonDailyAdvice(id) {
    if (confirm('このアドバイスを削除しますか？')) {
        state.nonDailyAdvice = state.nonDailyAdvice.filter(a => a.id !== id);
        
        // Firebaseに保存（空の場合はnullで明示的にクリア）
        if (state.nonDailyAdvice.length === 0) {
            database.ref('nonDailyAdvice').set(null);
        } else {
            saveToFirebase('nonDailyAdvice', state.nonDailyAdvice);
        }
        
        trackUsage('delete_non_daily', '管理者');
        
        // 一般ユーザー向け画面を更新
        renderNonDailyAdvisor();
        
        // 管理者パネルを確実に更新
        if (state.isAdmin && state.activeAdminTab === 'nonDailyAdvice') {
            const container = document.getElementById('adminContent');
            if (container) {
                renderNonDailyAdminPanel(container);
            }
        }
    }
}

// 非デイリーアドバイス編集（プロンプト使用）
function editNonDailyAdvice(id) {
    const advice = state.nonDailyAdvice.find(a => a.id === id);
    if (!advice) return;

    const newTitle = prompt('タイトルを入力:', advice.title);
    if (newTitle === null) return;

    const newContent = prompt('内容を入力:', advice.content);
    if (newContent === null) return;

    updateNonDailyAdvice(id, { title: newTitle, content: newContent });
    renderNonDailyAdvisor();
    if (state.isAdmin) renderAdminPanel();
}

// 管理者パネル用: 非デイリーアドバイス一覧を表示
function renderNonDailyAdminPanel(container) {
    let html = `
        <div class="daily-events-header">
            <h3>📈 非デイリー発注参考情報管理</h3>
            <button class="btn btn-primary btn-sm" onclick="openNonDailyAdviceForm()">+ 参考情報追加</button>
        </div>
    `;

    if (state.nonDailyAdvice.length === 0) {
        html += '<p class="no-events-message">アドバイスはありません</p>';
    } else {
        html += '<div class="daily-events-list">';
        const sorted = [...state.nonDailyAdvice].sort((a, b) =>
            new Date(b.updatedAt) - new Date(a.updatedAt)
        );
        sorted.forEach(advice => {
            const category = NON_DAILY_CATEGORIES[advice.category] || NON_DAILY_CATEGORIES.other;
            const updatedDate = new Date(advice.updatedAt);
            const dateStr = `${updatedDate.getFullYear()}/${updatedDate.getMonth() + 1}/${updatedDate.getDate()}`;
            html += `
                <div class="daily-event-card">
                    <div class="event-info">
                        <div class="event-header">
                            <span class="event-type-icon">${category.icon}</span>
                            <span class="event-title">${advice.title}</span>
                            <span class="event-date">${dateStr}</span>
                        </div>
                        <div class="event-description">${advice.content.substring(0, 100)}${advice.content.length > 100 ? '...' : ''}</div>
                        ${advice.source ? `<p style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">情報源: ${advice.source}</p>` : ''}
                    </div>
                    <div class="event-actions">
                        <button class="btn btn-sm btn-secondary" onclick="openNonDailyAdviceForm('${advice.id}')">編集</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteNonDailyAdvice('${advice.id}')">削除</button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }

    container.innerHTML = html;
}

// 非デイリーアドバイス入力フォームを開く
function openNonDailyAdviceForm(editId = null, defaultCategory = '') {
    const advice = editId ? state.nonDailyAdvice.find(a => a.id === editId) : null;
    const isEdit = !!advice;

    const categoryOptions = Object.entries(NON_DAILY_CATEGORIES)
        .map(([key, val]) => `<option value="${key}" ${advice?.category === key || (!advice && defaultCategory === key) ? 'selected' : ''}>${val.icon} ${val.name}</option>`)
        .join('');

    const formHtml = `
        <div class="modal-overlay active" id="nonDailyFormOverlay" onclick="if(event.target===this)closeNonDailyAdviceForm()">
            <div class="modal modal-lg">
                <div class="modal-header">
                    <h2 class="modal-title">📈 ${isEdit ? '参考情報編集' : '参考情報追加'}</h2>
                    <button class="modal-close" onclick="closeNonDailyAdviceForm()">×</button>
                </div>
                <form id="nonDailyAdviceForm" class="modal-body" onsubmit="submitNonDailyAdviceForm(event, '${editId || ''}')">
                    <div class="form-group">
                        <label for="ndCategory">カテゴリ</label>
                        <select id="ndCategory" required>${categoryOptions}</select>
                    </div>
                    <div class="form-group">
                        <label for="ndTitle">タイトル</label>
                        <input type="text" id="ndTitle" placeholder="例：話題のポテトチップス新商品" value="${advice?.title || ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="ndContent">内容</label>
                        <textarea id="ndContent" class="non-daily-content-textarea" placeholder="例：SNSで話題のXX味が人気。売り場での目立つ陳列を推奨。" rows="10" required>${advice?.content || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label for="ndSource">情報源（任意）</label>
                        <input type="text" id="ndSource" placeholder="例：ChatGPT / X / Instagram" value="${advice?.source || ''}">
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeNonDailyAdviceForm()">キャンセル</button>
                        <button type="submit" class="btn btn-primary">${isEdit ? '保存' : '追加'}</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // フォームを追加
    const div = document.createElement('div');
    div.id = 'nonDailyFormContainer';
    div.innerHTML = formHtml;
    document.body.appendChild(div);
}

// カテゴリを指定して非デイリーアドバイスフォームを開く
function openNonDailyAdviceFormWithCategory(category) {
    openNonDailyAdviceForm(null, category);
}

// 非デイリーアドバイスフォームを閉じる
function closeNonDailyAdviceForm() {
    const container = document.getElementById('nonDailyFormContainer');
    if (container) container.remove();
}

// 非デイリーアドバイスフォームを送信
function submitNonDailyAdviceForm(event, editId) {
    event.preventDefault();

    const data = {
        category: document.getElementById('ndCategory').value,
        title: document.getElementById('ndTitle').value,
        content: document.getElementById('ndContent').value,
        source: document.getElementById('ndSource').value || null
    };

    if (editId) {
        updateNonDailyAdvice(editId, data);
    } else {
        addNonDailyAdvice(data);
    }

    closeNonDailyAdviceForm();
    renderNonDailyAdvisor();
    if (state.isAdmin) renderAdminPanel();
}

// イベントタイプでフィルタリング
function filterEventsByType(type) {
    state.eventTypeFilter = type;
    renderAdminPanel();
}

// 非デイリーアドバイスをカテゴリでフィルタリング
function filterNonDailyByCategory(category) {
    state.nonDailyFilter = category;
    renderNonDailyAdvisor();
}

// ========================================
// コンビニ3社 新商品ヒット予測レポート機能
// ========================================

// コンビニ3社 新商品ヒット予測レポートを描画
function renderTrendReports() {
    const section = document.getElementById('trendReportSection');
    const content = document.getElementById('trendReportContent');
    if (!section || !content) return;

    // 常にセクションを表示
    section.style.display = 'block';

    const reports = state.trendReports || [];
    
    // 更新日時順にソート（新しい順）
    const sortedReports = [...reports].sort((a, b) => 
        new Date(b.updatedAt || b.createdAt || b.uploadedAt) - new Date(a.updatedAt || a.createdAt || a.uploadedAt)
    );

    let html = '';

    if (sortedReports.length === 0) {
        html = '<div class="no-reports-message"><p>📭 現在、コンビニ3社 新商品ヒット予測レポートはありません</p></div>';
    } else {
        html = '<div class="trend-reports-list">';
        
        sortedReports.forEach(report => {
            const reportDate = new Date(report.updatedAt || report.createdAt || report.uploadedAt);
            const dateStr = `${reportDate.getFullYear()}/${reportDate.getMonth() + 1}/${reportDate.getDate()}`;
            const isNew = (new Date() - reportDate) < 7 * 24 * 60 * 60 * 1000;
            
            // 旧形式（ファイルアップロード）か新形式（記述式）かを判定
            const isOldFormat = report.fileData && !report.content;
            
            if (isOldFormat) {
                // 旧形式：ダウンロードボタン表示
                html += `
                    <div class="trend-report-item">
                        <div class="trend-report-info">
                            <div class="trend-report-title">
                                ${isNew ? '<span class="new-badge">NEW</span>' : ''}
                                📄 ${report.title}
                            </div>
                            <div class="trend-report-meta">
                                <span class="report-date">📅 ${dateStr}</span>
                                <span class="report-size">${formatFileSize(report.fileSize)}</span>
                            </div>
                        </div>
                        <div class="trend-report-actions">
                            <button class="btn btn-sm btn-primary" onclick="downloadTrendReport('${report.id}')">
                                📥 ダウンロード
                            </button>
                            ${state.isAdmin ? `
                            <button class="btn btn-sm btn-danger" onclick="deleteTrendReport('${report.id}')">
                                🗑️
                            </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            } else {
                // 新形式：記述式表示
                html += `
                    <div class="trend-report-card">
                        <div class="report-header">
                            ${isNew ? '<span class="new-badge">NEW</span>' : ''}
                            <span class="report-title">${report.title}</span>
                            <span class="report-date">📅 ${dateStr}</span>
                        </div>
                        <div class="report-content">${renderMarkdown(report.content)}</div>
                        ${state.isAdmin ? `
                            <div class="report-actions">
                                <button class="btn btn-sm btn-secondary" onclick="openEditTrendReportModal('${report.id}')">✏️ 編集</button>
                                <button class="btn btn-sm btn-danger" onclick="deleteTrendReport('${report.id}')">🗑️ 削除</button>
                            </div>
                        ` : ''}
                    </div>
                `;
            }
        });

        html += '</div>';
    }

    // 管理者のみ追加ボタンを表示
    if (state.isAdmin) {
        html += `
            <div class="trend-report-upload-section">
                <button class="btn btn-primary" onclick="openAddTrendReportModal()">
                    + コンビニ3社 新商品ヒット予測レポート追加
                </button>
            </div>
        `;
    }

    content.innerHTML = html;
    initTrendReportToggle();
}

// トレンドレポートのトグル機能を初期化
function initTrendReportToggle() {
    const section = document.getElementById('trendReportSection');
    if (!section) return;

    const header = section.querySelector('.advisor-header');
    const content = section.querySelector('.advisor-content');
    const toggle = section.querySelector('.advisor-toggle');

    if (header && content && toggle) {
        header.onclick = (e) => {
            e.stopPropagation();
            content.classList.toggle('collapsed');
            toggle.classList.toggle('collapsed');
            toggle.textContent = content.classList.contains('collapsed') ? '▼' : '▲';
        };
    }
}

// ファイルサイズをフォーマット
function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// レポートアップロードモーダルを開く
function openTrendReportUploadModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay category-modal-overlay active';
    overlay.id = 'trendReportUploadOverlay';
    
    overlay.innerHTML = `
        <div class="modal category-modal" style="max-width: 450px;">
            <div class="modal-header">
                <h2 class="modal-title">📤 コンビニ3社 新商品ヒット予測レポートをアップロード</h2>
                <button class="modal-close" onclick="closeTrendReportUploadModal()">×</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>レポートタイトル</label>
                    <input type="text" id="trendReportTitle" class="form-control" 
                           placeholder="例: コンビニ3社 新商品ヒット予測レポート 2026年1月27日号" required>
                </div>
                
                <div class="form-group">
                    <label>ファイルを選択</label>
                    <div class="file-upload-area" id="fileUploadArea">
                        <input type="file" id="trendReportFile" accept=".docx,.doc,.pdf,.xlsx,.xls" 
                               style="display: none;" onchange="handleTrendReportFileSelect(event)">
                        <div class="file-upload-placeholder" onclick="document.getElementById('trendReportFile').click()">
                            <span class="upload-icon">📁</span>
                            <span class="upload-text">クリックしてファイルを選択</span>
                            <span class="upload-hint">対応形式: Word (.docx), PDF, Excel (.xlsx)</span>
                        </div>
                        <div class="file-selected-info" id="fileSelectedInfo" style="display: none;">
                            <span class="file-icon">📄</span>
                            <span class="file-name" id="selectedFileName"></span>
                            <span class="file-size" id="selectedFileSize"></span>
                            <button type="button" class="btn btn-xs btn-secondary" onclick="clearSelectedFile()">✕</button>
                        </div>
                    </div>
                </div>
                
                <div class="upload-progress" id="uploadProgress" style="display: none;">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progressFill"></div>
                    </div>
                    <span class="progress-text" id="progressText">アップロード中...</span>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeTrendReportUploadModal()">キャンセル</button>
                <button type="button" class="btn btn-primary" id="uploadTrendReportBtn" onclick="uploadTrendReport()" disabled>
                    📤 アップロード
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

// アップロードモーダルを閉じる
function closeTrendReportUploadModal() {
    const overlay = document.getElementById('trendReportUploadOverlay');
    if (overlay) overlay.remove();
    state.selectedTrendReportFile = null;
}

// ファイル選択時の処理
function handleTrendReportFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // ファイルサイズチェック (5MB制限)
    if (file.size > 5 * 1024 * 1024) {
        alert('ファイルサイズは5MB以下にしてください。');
        return;
    }
    
    state.selectedTrendReportFile = file;
    
    // UI更新
    document.getElementById('fileUploadArea').querySelector('.file-upload-placeholder').style.display = 'none';
    document.getElementById('fileSelectedInfo').style.display = 'flex';
    document.getElementById('selectedFileName').textContent = file.name;
    document.getElementById('selectedFileSize').textContent = formatFileSize(file.size);
    document.getElementById('uploadTrendReportBtn').disabled = false;
    
    // タイトルが空なら自動設定
    const titleInput = document.getElementById('trendReportTitle');
    if (!titleInput.value) {
        const today = new Date();
        titleInput.value = `コンビニ3社 新商品ヒット予測レポート ${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日号`;
    }
}

// 選択したファイルをクリア
function clearSelectedFile() {
    state.selectedTrendReportFile = null;
    document.getElementById('trendReportFile').value = '';
    document.getElementById('fileUploadArea').querySelector('.file-upload-placeholder').style.display = 'flex';
    document.getElementById('fileSelectedInfo').style.display = 'none';
    document.getElementById('uploadTrendReportBtn').disabled = true;
}

// レポートをアップロード
async function uploadTrendReport() {
    const title = document.getElementById('trendReportTitle').value.trim();
    const file = state.selectedTrendReportFile;
    
    if (!title || !file) {
        alert('タイトルとファイルを入力してください。');
        return;
    }
    
    // プログレス表示
    document.getElementById('uploadProgress').style.display = 'block';
    document.getElementById('uploadTrendReportBtn').disabled = true;
    
    try {
        // ファイルをBase64に変換
        const base64Data = await fileToBase64(file);
        
        const report = {
            id: Date.now().toString(),
            title: title,
            fileName: file.name,
            fileType: file.type || getFileTypeFromName(file.name),
            fileSize: file.size,
            fileData: base64Data,
            uploadedAt: new Date().toISOString(),
            uploadedBy: '管理者'
        };
        
        state.trendReports.push(report);
        
        // 1ヶ月より古いレポートを削除
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        state.trendReports = state.trendReports.filter(r => new Date(r.uploadedAt) >= oneMonthAgo);
        
        saveToFirebase('trendReports', state.trendReports);
        
        document.getElementById('progressFill').style.width = '100%';
        document.getElementById('progressText').textContent = 'アップロード完了！';
        
        setTimeout(() => {
            closeTrendReportUploadModal();
            renderTrendReports();
            alert('レポートをアップロードしました。');
        }, 500);
        
    } catch (error) {
        console.error('Upload error:', error);
        alert('アップロードに失敗しました。ファイルサイズを確認してください。');
        document.getElementById('uploadProgress').style.display = 'none';
        document.getElementById('uploadTrendReportBtn').disabled = false;
    }
}

// ファイルをBase64に変換
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ファイル名から拡張子でタイプを取得
function getFileTypeFromName(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const types = {
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'doc': 'application/msword',
        'pdf': 'application/pdf',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'xls': 'application/vnd.ms-excel'
    };
    return types[ext] || 'application/octet-stream';
}

// レポートをダウンロード
function downloadTrendReport(reportId) {
    const report = state.trendReports.find(r => r.id === reportId);
    if (!report) {
        alert('レポートが見つかりません。');
        return;
    }
    
    try {
        // Base64データからBlobを作成
        const byteCharacters = atob(report.fileData.split(',')[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: report.fileType });
        
        // ダウンロードリンクを作成
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = report.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Download error:', error);
        alert('ダウンロードに失敗しました。');
    }
}

// レポートを削除
function deleteTrendReport(reportId) {
    if (!confirm('このレポートを削除しますか？')) return;
    
    state.trendReports = state.trendReports.filter(r => r.id !== reportId);
    saveToFirebase('trendReports', state.trendReports);
    trackUsage('delete_trend_report', '管理者');
    renderTrendReports();
}

// コンビニ3社 新商品ヒット予測レポート追加モーダル（記述式）
function openAddTrendReportModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay category-modal-overlay active';
    modal.innerHTML = `
        <div class="modal category-modal" style="max-width: 600px;">
            <div class="modal-header">
                <h2 class="modal-title">📊 コンビニ3社 新商品ヒット予測レポート追加</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <form class="modal-body" onsubmit="submitTrendReport(event, this)">
                <div class="form-group">
                    <label>タイトル <span class="required">*</span></label>
                    <input type="text" name="title" placeholder="例: コンビニ3社 新商品ヒット予測レポート 2026年1月27日号" required>
                </div>
                <div class="form-group markdown-form-group">
                    <label>内容 <span class="required">*</span></label>
                    <div class="preview-tabs">
                        <button type="button" class="preview-tab active" data-mode="edit" onclick="toggleMarkdownPreview(this.closest('.markdown-form-group'), 'edit')">✏️ 編集</button>
                        <button type="button" class="preview-tab" data-mode="preview" onclick="toggleMarkdownPreview(this.closest('.markdown-form-group'), 'preview')">👁️ プレビュー</button>
                    </div>
                    <textarea name="content" rows="15" placeholder="トレンド情報を入力してください（Markdown対応）..." required></textarea>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">キャンセル</button>
                    <button type="submit" class="btn btn-primary">保存</button>
                </div>
            </form>
        </div>
    `;

    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
}

// コンビニ3社 新商品ヒット予測レポート編集モーダル（記述式）
function openEditTrendReportModal(reportId) {
    const report = state.trendReports.find(r => r.id === reportId);
    if (!report) return;

    // HTMLエスケープ関数
    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    const modal = document.createElement('div');
    modal.className = 'modal-overlay category-modal-overlay active';
    modal.innerHTML = `
        <div class="modal category-modal" style="max-width: 600px;">
            <div class="modal-header">
                <h2 class="modal-title">📊 コンビニ3社 新商品ヒット予測レポート編集</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <form class="modal-body" onsubmit="submitTrendReport(event, this, '${reportId}')">
                <div class="form-group">
                    <label>タイトル <span class="required">*</span></label>
                    <input type="text" name="title" value="${escapeHtml(report.title)}" required>
                </div>
                <div class="form-group markdown-form-group">
                    <label>内容 <span class="required">*</span></label>
                    <div class="preview-tabs">
                        <button type="button" class="preview-tab active" data-mode="edit" onclick="toggleMarkdownPreview(this.closest('.markdown-form-group'), 'edit')">✏️ 編集</button>
                        <button type="button" class="preview-tab" data-mode="preview" onclick="toggleMarkdownPreview(this.closest('.markdown-form-group'), 'preview')">👁️ プレビュー</button>
                    </div>
                    <textarea name="content" rows="15" required>${escapeHtml(report.content || '')}</textarea>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">キャンセル</button>
                    <button type="submit" class="btn btn-primary">保存</button>
                </div>
            </form>
        </div>
    `;

    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
}

// コンビニ3社 新商品ヒット予測レポート送信（記述式）
function submitTrendReport(event, form, reportId = null) {
    event.preventDefault();
    
    const title = form.title.value.trim();
    const content = form.content.value.trim();
    
    if (!title || !content) {
        alert('タイトルと内容を入力してください。');
        return;
    }
    
    if (reportId) {
        // 編集
        const index = state.trendReports.findIndex(r => r.id === reportId);
        if (index !== -1) {
            state.trendReports[index] = {
                ...state.trendReports[index],
                title,
                content,
                updatedAt: new Date().toISOString()
            };
        }
        trackUsage('edit_trend_report', '管理者');
    } else {
        // 新規追加
        const report = {
            id: Date.now().toString(),
            title,
            content,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        state.trendReports.push(report);
        trackUsage('add_trend_report', '管理者');
    }
    
    saveToFirebase('trendReports', state.trendReports);
    form.closest('.modal-overlay').remove();
    renderTrendReports();
    alert(reportId ? 'レポートを更新しました。' : 'レポートを追加しました。');
}

// ========================================
// 発注アドバイス機能
// ========================================

// 発注担当者データ
const ORDER_STAFF = [
    { id: 1, name: '市原', role: 'マネージャー/日勤', categories: ['tobacco'] },
    { id: 2, name: '篠原', role: '社員/夕勤', categories: ['deli', 'ff', 'drink', 'pastry', 'frozenIce'] },
    { id: 3, name: '橋本', role: '社員/日勤', categories: ['supply', 'noodle', 'goods', 'frozen'] },
    { id: 4, name: '森下', role: 'スタッフ/日勤', categories: ['rice', 'sevenPDeli', 'deliOther', 'milk', 'frozen'] },
    { id: 5, name: '高橋', role: 'スタッフ/日勤', categories: ['bread'] },
    { id: 6, name: '萩', role: 'スタッフ/日勤', categories: ['processed'] },
    { id: 7, name: '小宮山', role: 'スタッフ/夕勤', categories: ['sweetsChoco'] },
    { id: 8, name: '加藤', role: 'スタッフ/日勤', categories: ['dessert', 'sweetsGummy'] },
    { id: 9, name: '中瀬', role: 'スタッフ/夕勤', categories: ['sweetsSnack'] },
];

// 発注カテゴリデータ
const ORDER_ADVICE_CATEGORIES = [
    { id: 'tobacco', name: 'タバコ', icon: '🚬', items: ['タバコ'], color: '#6B7280' },
    { id: 'noodle', name: '麺類その他', icon: '🍜', items: ['カップ麺(温)', '調理麺(冷)', 'スパゲティ', 'グラタンドリア', '焼きそば類'], color: '#EF4444' },
    { id: 'deli', name: 'デリカテッセン（サラダ、惣菜）', icon: '🥗', items: ['サラダ', '惣菜類'], color: '#22C55E' },
    { id: 'ff', name: 'FF（おでん、中華まん）', icon: '🍢', items: ['おでん', '中華まん', 'フランク'], color: '#F97316' },
    { id: 'drink', name: 'ドリンク類', icon: '🥤', items: ['ソフトドリンク', 'お茶', 'コーヒー'], color: '#3B82F6' },
    { id: 'milk', name: '牛乳乳飲料', icon: '🥛', items: ['牛乳', '乳飲料', 'コーヒー牛乳'], color: '#60A5FA' },
    { id: 'supply', name: '消耗品', icon: '🧻', items: ['消耗品'], color: '#9CA3AF' },
    { id: 'rice', name: '米飯', icon: '🍙', items: ['おにぎり', '寿司', '弁当', 'チルド弁当'], color: '#F59E0B' },
    { id: 'sevenPDeli', name: '7Pデリカ', icon: '🍱', items: ['7Pデリカ商品'], color: '#FBBF24' },
    { id: 'deliOther', name: 'デリテッセン（その他）', icon: '🥡', items: ['その他デリカ'], color: '#34D399' },
    { id: 'goods', name: '雑貨類', icon: '🛒', items: ['雑貨'], color: '#8B5CF6' },
    { id: 'frozen', name: 'フローズン（フライヤー、焼成パン）', icon: '🧊', items: ['フライヤー', '焼成パン'], color: '#06B6D4' },
    { id: 'frozenIce', name: 'フローズン（アイス、冷凍食品）', icon: '🍦', items: ['アイス', '冷凍食品'], color: '#0EA5E9' },
    { id: 'pastry', name: 'ペストリー', icon: '🥐', items: ['ドーナツ', 'パイ', 'デニッシュ'], color: '#D97706' },
    { id: 'bread', name: '調理パン', icon: '🥪', items: ['サンドイッチ', 'ロール類', 'ブリトー'], color: '#EAB308' },
    { id: 'processed', name: '加工食品（調味料類、珍味）', icon: '🫙', items: ['調味料', '珍味'], color: '#A855F7' },
    { id: 'sweetsChoco', name: 'お菓子（チョコレート、和菓子類）', icon: '🍫', items: ['チョコレート', '和菓子'], color: '#EC4899' },
    { id: 'dessert', name: 'デザート', icon: '🍰', items: ['チルド用生菓子', 'ヨーグルト', 'ゼリー類'], color: '#F472B6' },
    { id: 'sweetsGummy', name: 'お菓子（グミ、駄菓子、飴類）', icon: '🍬', items: ['グミ', '駄菓子', '飴類'], color: '#FB7185' },
    { id: 'sweetsSnack', name: 'お菓子（ポテトチップス、箱スナック、米菓）', icon: '🍿', items: ['ポテトチップス', '箱スナック', '米菓'], color: '#FDBA74' },
];

// 発注アドバイス用の状態管理を拡張
state.orderAdvice = {
    selectedStaffId: null,
    activeTab: 'advice',
    feedbackData: {},
};

// 発注対象日と締切を計算
function getOrderTargetInfo() {
    const now = new Date();
    const hour = now.getHours();
    const deadline = new Date(now);
    deadline.setHours(11, 0, 0, 0);
    
    let targetDate;
    let isBeforeDeadline;
    
    if (hour < 11) {
        targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + 1);
        isBeforeDeadline = true;
    } else {
        targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + 2);
        isBeforeDeadline = false;
        deadline.setDate(deadline.getDate() + 1);
    }
    
    const timeUntilDeadline = deadline - now;
    const hoursUntil = Math.floor(timeUntilDeadline / (1000 * 60 * 60));
    const minutesUntil = Math.floor((timeUntilDeadline % (1000 * 60 * 60)) / (1000 * 60));
    
    return {
        targetDate,
        targetDateStr: formatDate(targetDate),
        deadline,
        isBeforeDeadline,
        hoursUntil,
        minutesUntil,
        isUrgent: hoursUntil < 1 && isBeforeDeadline
    };
}

// カテゴリ別アドバイス生成
function generateOrderAdvice(categoryId, weather, targetDate) {
    const temp = weather ? (weather.tempMax + weather.tempMin) / 2 : 15;
    const weatherType = weather ? getWeatherInfo(weather.weatherCode).type : 'sunny';
    const dayOfWeek = targetDate.getDay();
    const dayOfMonth = targetDate.getDate();
    
    const advice = {
        categoryId,
        recommendations: [],
        warnings: [],
        confidence: 70,
    };

    switch (categoryId) {
        case 'rice':
            if (temp <= 10) {
                advice.recommendations.push({
                    text: '寒さで温かいご飯需要↑',
                    items: ['幕の内弁当', 'のり弁', '炊き込みご飯おにぎり'],
                    psychology: '体を温めたい欲求',
                });
            }
            if (temp >= 25) {
                advice.recommendations.push({
                    text: '暑さで塩分・さっぱり需要↑',
                    items: ['梅おにぎり', '塩むすび', '冷やし寿司'],
                    psychology: '汗で失った塩分を補いたい',
                });
            }
            if (dayOfWeek === 5 || dayOfWeek === 6) {
                advice.recommendations.push({
                    text: '週末は行楽需要↑',
                    items: ['おにぎりセット', '助六寿司', 'ファミリー弁当'],
                    psychology: 'お出かけ・ピクニック気分',
                });
            }
            if (weatherType === 'rainy') {
                advice.warnings.push({
                    text: '雨天で来客減少見込み',
                    suggestion: '発注控えめに（-15%目安）',
                });
            }
            advice.confidence = 78;
            break;

        case 'noodle':
            if (temp <= 10) {
                advice.recommendations.push({
                    text: '寒さで温かい麺↑↑',
                    items: ['カップうどん', 'カップラーメン', 'グラタン', 'ドリア'],
                    psychology: '体の芯から温まりたい',
                });
                advice.confidence = 85;
            }
            if (temp >= 25) {
                advice.recommendations.push({
                    text: '暑さで冷たい麺↑',
                    items: ['冷やし中華', '冷製パスタ', 'ざるそば'],
                    psychology: 'さっぱり・ひんやり食べたい',
                });
                advice.warnings.push({
                    text: 'カップ麺(温)は需要減',
                    suggestion: '通常より控えめに（-20%目安）',
                });
            }
            break;

        case 'ff':
            if (temp <= 10) {
                advice.recommendations.push({
                    text: '寒さでホットスナック需要↑↑',
                    items: ['肉まん', 'あんまん', 'おでん各種', 'フランク'],
                    psychology: '温かいものを手軽に食べたい',
                });
                advice.confidence = 88;
            }
            if (temp >= 25) {
                advice.warnings.push({
                    text: '暑さでホットスナック需要↓',
                    suggestion: '肉まん・おでん控えめに',
                });
                advice.confidence = 60;
            }
            break;

        case 'deli':
            if (dayOfWeek === 5) {
                advice.recommendations.push({
                    text: '金曜は惣菜需要↑',
                    items: ['唐揚げ', 'ポテトサラダ', 'おつまみ系'],
                    psychology: '仕事帰りに買って帰りたい',
                });
            }
            if (temp >= 25) {
                advice.recommendations.push({
                    text: '暑さでサラダ需要↑',
                    items: ['グリーンサラダ', '春雨サラダ', '冷しゃぶサラダ'],
                    psychology: 'さっぱりしたものが食べたい',
                });
            }
            break;

        case 'dessert':
            if (temp >= 25) {
                advice.recommendations.push({
                    text: '暑さで冷たいデザート↑↑',
                    items: ['ゼリー類', 'プリン', '杏仁豆腐', 'フルーツヨーグルト'],
                    psychology: 'ひんやり甘いもので癒されたい',
                });
                advice.confidence = 88;
            }
            if (dayOfWeek === 5 || dayOfWeek === 6) {
                advice.recommendations.push({
                    text: '週末ご褒美需要↑',
                    items: ['プレミアムスイーツ', '生菓子'],
                    psychology: '頑張った自分へのご褒美',
                });
            }
            break;

        case 'bread':
            if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                advice.recommendations.push({
                    text: '平日朝の需要',
                    items: ['たまごサンド', 'ハムサンド', 'ツナロール'],
                    psychology: '手軽に朝食を済ませたい',
                });
            }
            if (temp <= 10) {
                advice.recommendations.push({
                    text: '寒い日はボリューム系↑',
                    items: ['カツサンド', 'ブリトー（ミート系）'],
                    psychology: 'しっかり食べて温まりたい',
                });
            }
            break;

        case 'milk':
            if (temp <= 10) {
                advice.recommendations.push({
                    text: '寒い日はホット需要↑',
                    items: ['ホットミルク用牛乳', 'ココア原料'],
                    psychology: '温かい飲み物で温まりたい',
                });
            }
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                advice.recommendations.push({
                    text: '週末は家族需要↑',
                    items: ['大容量牛乳', 'ファミリーパック'],
                    psychology: '家族で消費、まとめ買い',
                });
            }
            break;

        case 'drink':
            if (temp >= 25) {
                advice.recommendations.push({
                    text: '暑さで冷たい飲料↑↑',
                    items: ['スポーツドリンク', 'お茶', '炭酸飲料'],
                    psychology: '水分補給・クールダウン',
                });
                advice.confidence = 90;
            }
            if (temp <= 10) {
                advice.recommendations.push({
                    text: '寒さでホット飲料↑',
                    items: ['ホットコーヒー', 'ホットお茶', 'スープ'],
                    psychology: '温かい飲み物で温まりたい',
                });
            }
            break;

        case 'sweetsChoco':
            if (temp <= 15) {
                advice.recommendations.push({
                    text: 'チョコレート需要↑',
                    items: ['板チョコ', 'チョコ菓子'],
                    psychology: '寒い時期はチョコが美味しい',
                });
            }
            if (temp >= 25) {
                advice.warnings.push({
                    text: '暑さでチョコ溶け注意',
                    suggestion: '在庫管理・陳列場所注意',
                });
            }
            break;

        case 'sweetsGummy':
            advice.recommendations.push({
                text: '通年安定需要',
                items: ['人気グミ', '定番駄菓子'],
                psychology: '手軽なおやつ需要',
            });
            if (dayOfWeek === 5 || dayOfWeek === 6) {
                advice.recommendations.push({
                    text: '週末はファミリー需要↑',
                    items: ['大袋グミ', 'バラエティパック'],
                    psychology: '子供のおやつ、まとめ買い',
                });
            }
            break;

        case 'sweetsSnack':
            advice.recommendations.push({
                text: '通年安定需要',
                items: ['定番ポテチ', '人気スナック'],
                psychology: '定番のおやつ需要',
            });
            if (dayOfWeek === 5 || dayOfWeek === 6) {
                advice.recommendations.push({
                    text: '週末パーティー需要↑',
                    items: ['大袋ポテチ', 'パーティーサイズ'],
                    psychology: '集まり・宴会用',
                });
            }
            break;

        case 'frozen':
            if (temp <= 10) {
                advice.recommendations.push({
                    text: '寒さでフライヤー商品↑',
                    items: ['コロッケ', 'から揚げ', 'ポテト'],
                    psychology: '温かい揚げ物で温まりたい',
                });
            }
            advice.recommendations.push({
                text: '焼成パン朝需要',
                items: ['クロワッサン', 'メロンパン'],
                psychology: '焼きたての香りで購買意欲↑',
            });
            break;

        case 'sevenPDeli':
            if (temp <= 10) {
                advice.recommendations.push({
                    text: '寒さでおでん・中華まん↑↑',
                    items: ['おでんセット', '肉まん', 'あんまん'],
                    psychology: '温かいものですぐ温まりたい',
                });
                advice.confidence = 90;
            }
            break;

        case 'tobacco':
            advice.recommendations.push({
                text: '定番銘柄を切らさない',
                items: ['人気銘柄TOP10', '新商品'],
                psychology: '指名買いが多い',
            });
            advice.confidence = 85;
            break;

        case 'supply':
        case 'goods':
        case 'processed':
            advice.recommendations.push({
                text: '通常発注でOK',
                items: [],
                psychology: '',
            });
            break;

        case 'deliOther':
            if (dayOfWeek === 5) {
                advice.recommendations.push({
                    text: '金曜はお惣菜需要↑',
                    items: ['おつまみ系惣菜'],
                    psychology: '週末前の買い足し',
                });
            }
            break;

        default:
            advice.recommendations.push({
                text: '通常発注でOK',
                items: [],
                psychology: '',
            });
            break;
    }

    if (dayOfMonth >= 23 && dayOfMonth <= 27) {
        advice.recommendations.push({
            text: '💰 給料日前後で消費意欲↑',
            items: ['プレミアム商品', '高単価商品'],
            psychology: '財布の紐が緩む',
        });
    }
    if (dayOfMonth >= 26 && dayOfMonth <= 31) {
        advice.warnings.push({
            text: '月末で節約志向',
            suggestion: '高単価商品控えめ、PB商品強化',
        });
    }

    return advice;
}

// 発注アドバイス画面を表示
function showOrderAdviceScreen() {
    // 利用追跡
    const staffName = state.orderAdvice.selectedStaffId ? 
        (state.employees.find(e => e.id === state.orderAdvice.selectedStaffId)?.name || '匿名') : '匿名';
    trackUsage('view_order_advice', staffName);
    
    const mainContent = document.querySelector('.app-container');
    const existingScreen = document.getElementById('orderAdviceScreen');
    if (existingScreen) {
        existingScreen.remove();
    }
    
    const screen = document.createElement('div');
    screen.id = 'orderAdviceScreen';
    screen.className = 'order-advice-screen';
    
    if (!state.orderAdvice.selectedStaffId) {
        screen.innerHTML = renderStaffSelection();
    } else {
        screen.innerHTML = renderAdviceScreen();
    }
    
    mainContent.appendChild(screen);
    startDeadlineTimer();
}

// 担当者選択画面をレンダリング
function renderStaffSelection() {
    let html = `
        <div class="order-advice-header">
            <h2>📦 発注アドバイス</h2>
            <button class="btn btn-secondary" onclick="closeOrderAdviceScreen()">✕ 閉じる</button>
        </div>
        <div class="staff-selection">
            <h3>担当者を選択してください</h3>
            <div class="staff-grid">
    `;
    
    ORDER_STAFF.forEach(staff => {
        const categories = staff.categories.map(catId => {
            const cat = ORDER_ADVICE_CATEGORIES.find(c => c.id === catId);
            return cat ? `<span class="staff-category-tag" style="background:${cat.color}">${cat.icon} ${cat.name}</span>` : '';
        }).join('');
        
        html += `
            <div class="staff-card" onclick="selectOrderStaff(${staff.id})">
                <div class="staff-card-header">
                    <span class="staff-name">${staff.name}</span>
                    <span class="staff-role">${staff.role}</span>
                </div>
                <div class="staff-categories">
                    ${categories}
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
    `;
    
    return html;
}

// 担当者を選択
function selectOrderStaff(staffId) {
    state.orderAdvice.selectedStaffId = staffId;
    showOrderAdviceScreen();
}

// アドバイス画面をレンダリング
function renderAdviceScreen() {
    const staff = ORDER_STAFF.find(s => s.id === state.orderAdvice.selectedStaffId);
    if (!staff) return '';
    
    const orderInfo = getOrderTargetInfo();
    const targetDateStr = orderInfo.targetDateStr;
    const weather = state.weatherData[targetDateStr];
    const targetDate = orderInfo.targetDate;
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    
    let html = `
        <div class="order-advice-header">
            <div class="header-left">
                <h2>📦 発注アドバイス</h2>
                <span class="current-staff">担当: ${staff.name}</span>
            </div>
            <div class="header-right">
                <button class="btn btn-secondary btn-sm" onclick="changeOrderStaff()">👤 担当者切替</button>
                <button class="btn btn-secondary" onclick="closeOrderAdviceScreen()">✕ 閉じる</button>
            </div>
        </div>
        
        <div class="order-info-bar">
            <div class="target-date">
                <span class="label">発注対象日:</span>
                <span class="date">${targetDate.getMonth() + 1}/${targetDate.getDate()}（${dayNames[targetDate.getDay()]}）</span>
                <span class="note">${orderInfo.isBeforeDeadline ? '翌日分' : '翌々日分'}</span>
            </div>
            <div class="deadline ${orderInfo.isUrgent ? 'urgent' : ''}">
                <span class="label">締切まで:</span>
                <span class="time" id="deadlineTimer">${orderInfo.hoursUntil}時間${orderInfo.minutesUntil}分</span>
            </div>
        </div>
    `;
    
    if (weather) {
        const weatherInfo = getWeatherInfo(weather.weatherCode);
        html += `
            <div class="weather-special-card">
                <div class="weather-section">
                    <span class="weather-icon-large">${weatherInfo.icon}</span>
                    <div class="weather-details">
                        <span class="weather-desc">${weatherInfo.desc}</span>
                        <span class="weather-temp">
                            <span class="temp-high">${weather.tempMax}°</span> / 
                            <span class="temp-low">${weather.tempMin}°</span>
                        </span>
                    </div>
                </div>
                <div class="special-day-section">
                    ${renderSpecialDayBadges(targetDate)}
                </div>
            </div>
        `;
    }
    
    html += `
        <div class="advice-tabs">
            <button class="advice-tab ${state.orderAdvice.activeTab === 'advice' ? 'active' : ''}" 
                    onclick="switchAdviceTab('advice')">📋 アドバイス</button>
            <button class="advice-tab ${state.orderAdvice.activeTab === 'feedback' ? 'active' : ''}" 
                    onclick="switchAdviceTab('feedback')">📝 フィードバック</button>
        </div>
    `;
    
    if (state.orderAdvice.activeTab === 'advice') {
        html += renderCategoryAdvice(staff, weather, targetDate);
    } else {
        html += renderFeedbackForm(staff, targetDateStr);
    }
    
    return html;
}

// 特別日バッジをレンダリング
function renderSpecialDayBadges(date) {
    const badges = [];
    const dayOfWeek = date.getDay();
    const dayOfMonth = date.getDate();
    
    if (dayOfWeek === 5) badges.push('<span class="special-badge friday">🎉 金曜日</span>');
    if (dayOfWeek === 6) badges.push('<span class="special-badge weekend">🌟 土曜日</span>');
    if (dayOfWeek === 0) badges.push('<span class="special-badge weekend">🌟 日曜日</span>');
    if (dayOfMonth >= 23 && dayOfMonth <= 27) badges.push('<span class="special-badge payday">💰 給料日前後</span>');
    if (dayOfMonth >= 26) badges.push('<span class="special-badge monthend">📅 月末</span>');
    
    return badges.length > 0 ? badges.join('') : '<span class="no-special">特別な日ではありません</span>';
}

// カテゴリ別アドバイスをレンダリング
function renderCategoryAdvice(staff, weather, targetDate) {
    let html = '<div class="category-advice-list">';
    
    staff.categories.forEach(catId => {
        const category = ORDER_ADVICE_CATEGORIES.find(c => c.id === catId);
        if (!category) return;
        
        const advice = generateOrderAdvice(catId, weather, targetDate);
        
        html += `
            <div class="category-advice-card" style="border-left-color: ${category.color}">
                <div class="card-header">
                    <span class="category-icon" style="background: ${category.color}">${category.icon}</span>
                    <span class="category-name">${category.name}</span>
                    <span class="confidence">信頼度: ${advice.confidence}%</span>
                </div>
        `;
        
        if (advice.recommendations.length > 0) {
            html += '<div class="recommendations">';
            advice.recommendations.forEach(rec => {
                html += `
                    <div class="recommendation-item">
                        <div class="rec-text">📈 ${rec.text}</div>
                        ${rec.psychology ? `<div class="rec-psychology">🧠 ${rec.psychology}</div>` : ''}
                        ${rec.items.length > 0 ? `
                            <div class="rec-items">
                                推奨: ${rec.items.map(item => `<span class="item-tag">${item}</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            });
            html += '</div>';
        }
        
        if (advice.warnings.length > 0) {
            html += '<div class="warnings">';
            advice.warnings.forEach(warn => {
                html += `
                    <div class="warning-item">
                        <div class="warn-text">⚠️ ${warn.text}</div>
                        ${warn.suggestion ? `<div class="warn-suggestion">💡 ${warn.suggestion}</div>` : ''}
                    </div>
                `;
            });
            html += '</div>';
        }
        
        html += '</div>';
    });
    
    html += '</div>';
    return html;
}

// フィードバックフォームをレンダリング
function renderFeedbackForm(staff, targetDateStr) {
    let html = '<div class="feedback-form-container">';
    
    staff.categories.forEach(catId => {
        const category = ORDER_ADVICE_CATEGORIES.find(c => c.id === catId);
        if (!category) return;
        
        const feedbackKey = `${targetDateStr}-${catId}`;
        const existingFeedback = state.orderAdvice.feedbackData[feedbackKey] || {};
        
        html += `
            <div class="feedback-card" style="border-left-color: ${category.color}">
                <div class="card-header">
                    <span class="category-icon" style="background: ${category.color}">${category.icon}</span>
                    <span class="category-name">${category.name}</span>
                </div>
                
                <div class="feedback-fields">
                    <div class="field-group">
                        <label>的中度評価</label>
                        <div class="rating-buttons">
                            <button type="button" class="rating-btn ${existingFeedback.rating === 'excellent' ? 'selected' : ''}" 
                                    onclick="setFeedbackRating('${feedbackKey}', 'excellent')">◎ 的中</button>
                            <button type="button" class="rating-btn ${existingFeedback.rating === 'good' ? 'selected' : ''}" 
                                    onclick="setFeedbackRating('${feedbackKey}', 'good')">○ まあまあ</button>
                            <button type="button" class="rating-btn ${existingFeedback.rating === 'fair' ? 'selected' : ''}" 
                                    onclick="setFeedbackRating('${feedbackKey}', 'fair')">△ 普通</button>
                            <button type="button" class="rating-btn ${existingFeedback.rating === 'poor' ? 'selected' : ''}" 
                                    onclick="setFeedbackRating('${feedbackKey}', 'poor')">× 外れ</button>
                        </div>
                    </div>
                    
                    <div class="field-group">
                        <label>予想以上に売れたもの</label>
                        <input type="text" class="feedback-input" 
                               id="oversold-${feedbackKey}" 
                               value="${existingFeedback.oversold || ''}"
                               placeholder="例：おにぎり、サンドイッチ">
                    </div>
                    
                    <div class="field-group">
                        <label>予想より売れなかったもの</label>
                        <input type="text" class="feedback-input" 
                               id="undersold-${feedbackKey}" 
                               value="${existingFeedback.undersold || ''}"
                               placeholder="例：弁当類、デザート">
                    </div>
                    
                    <div class="field-group">
                        <label>気づいたこと・特記事項</label>
                        <textarea class="feedback-textarea" 
                                  id="notes-${feedbackKey}" 
                                  rows="2"
                                  placeholder="例：雨が予報より早く降り始めた">${existingFeedback.notes || ''}</textarea>
                    </div>
                    
                    <button class="btn btn-primary btn-sm" onclick="submitFeedback('${feedbackKey}', '${catId}', '${targetDateStr}')">
                        💾 保存
                    </button>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

// タブ切り替え
function switchAdviceTab(tab) {
    state.orderAdvice.activeTab = tab;
    showOrderAdviceScreen();
}

// 担当者切替
function changeOrderStaff() {
    state.orderAdvice.selectedStaffId = null;
    showOrderAdviceScreen();
}

// 発注アドバイス画面を閉じる
function closeOrderAdviceScreen() {
    const screen = document.getElementById('orderAdviceScreen');
    if (screen) {
        screen.remove();
    }
    stopDeadlineTimer();
}

// フィードバック評価を設定
function setFeedbackRating(feedbackKey, rating) {
    if (!state.orderAdvice.feedbackData[feedbackKey]) {
        state.orderAdvice.feedbackData[feedbackKey] = {};
    }
    state.orderAdvice.feedbackData[feedbackKey].rating = rating;
    
    const card = document.querySelector(`[onclick="setFeedbackRating('${feedbackKey}', '${rating}')"]`).closest('.feedback-card');
    card.querySelectorAll('.rating-btn').forEach(btn => btn.classList.remove('selected'));
    document.querySelector(`[onclick="setFeedbackRating('${feedbackKey}', '${rating}')"]`).classList.add('selected');
}

// フィードバック送信
function submitFeedback(feedbackKey, categoryId, date) {
    const feedback = {
        id: feedbackKey,
        categoryId,
        date,
        rating: state.orderAdvice.feedbackData[feedbackKey]?.rating || null,
        oversold: document.getElementById(`oversold-${feedbackKey}`)?.value || '',
        undersold: document.getElementById(`undersold-${feedbackKey}`)?.value || '',
        notes: document.getElementById(`notes-${feedbackKey}`)?.value || '',
        submittedAt: new Date().toISOString(),
        submittedBy: ORDER_STAFF.find(s => s.id === state.orderAdvice.selectedStaffId)?.name || '不明'
    };
    
    database.ref(`orderFeedback/${feedbackKey}`).set(feedback);
    state.orderAdvice.feedbackData[feedbackKey] = feedback;
    
    // 入力欄をクリア
    const oversoldInput = document.getElementById(`oversold-${feedbackKey}`);
    const undersoldInput = document.getElementById(`undersold-${feedbackKey}`);
    const notesInput = document.getElementById(`notes-${feedbackKey}`);
    if (oversoldInput) oversoldInput.value = '';
    if (undersoldInput) undersoldInput.value = '';
    if (notesInput) notesInput.value = '';
    
    // 評価ボタンの選択状態もリセット
    const card = document.querySelector(`#oversold-${feedbackKey}`)?.closest('.feedback-card');
    if (card) {
        card.querySelectorAll('.rating-btn').forEach(btn => btn.classList.remove('selected'));
    }
    
    // 状態もリセット
    delete state.orderAdvice.feedbackData[feedbackKey].rating;
    
    alert('フィードバックを保存しました');
}

// 締切タイマー
let deadlineTimerInterval = null;

function startDeadlineTimer() {
    stopDeadlineTimer();
    updateDeadlineTimer();
    deadlineTimerInterval = setInterval(updateDeadlineTimer, 60000);
}

function stopDeadlineTimer() {
    if (deadlineTimerInterval) {
        clearInterval(deadlineTimerInterval);
        deadlineTimerInterval = null;
    }
}

function updateDeadlineTimer() {
    const timerEl = document.getElementById('deadlineTimer');
    if (!timerEl) return;
    
    const orderInfo = getOrderTargetInfo();
    timerEl.textContent = `${orderInfo.hoursUntil}時間${orderInfo.minutesUntil}分`;
    
    const deadlineEl = timerEl.closest('.deadline');
    if (deadlineEl) {
        if (orderInfo.isUrgent) {
            deadlineEl.classList.add('urgent');
        } else {
            deadlineEl.classList.remove('urgent');
        }
    }
}

// ========================================
// 商品分類管理機能
// ========================================

// 商品分類管理パネルをレンダリング
function renderProductCategoriesPanel(container) {
    const categories = state.productCategories || [];
    const selectedPmaId = state.selectedPmaId || null;
    const selectedPma = selectedPmaId ? categories.find(p => p.id === selectedPmaId) : null;
    
    container.innerHTML = `
        <div class="product-categories-container">
            <div class="product-categories-header">
                <h3>📂 商品分類管理</h3>
                <p class="header-description">PMA（大分類）と情報分類を管理します。ここで設定した内容が発注アドバイスに反映されます。</p>
            </div>
            
            <div class="product-categories-layout">
                <!-- 左側: PMA一覧 -->
                <div class="pma-sidebar">
                    <div class="pma-sidebar-header">
                        <span class="sidebar-title">PMA一覧</span>
                        <button class="btn btn-sm btn-primary" onclick="openAddPMAModal()">+ 追加</button>
                    </div>
                    <div class="pma-sidebar-list">
                        ${categories.length === 0 ? 
                            '<p class="no-data-message-small">PMAがありません</p>' : 
                            categories.map(pma => `
                                <div class="pma-sidebar-item ${selectedPmaId === pma.id ? 'active' : ''}" 
                                     onclick="selectPMA('${pma.id}')">
                                    <span class="pma-item-icon">${pma.icon || '📦'}</span>
                                    <span class="pma-item-name">${pma.name}</span>
                                    <span class="pma-item-count">${(pma.infoCategories || []).length}</span>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
                
                <!-- 右側: 選択されたPMAの詳細 -->
                <div class="pma-detail">
                    ${selectedPma ? renderPMADetail(selectedPma) : `
                        <div class="pma-detail-empty">
                            <p>👈 左のPMA一覧から選択してください</p>
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;
}

// PMA選択
function selectPMA(pmaId) {
    state.selectedPmaId = pmaId;
    renderAdminPanel();
}

// PMA詳細をレンダリング
function renderPMADetail(pma) {
    const infoCategories = pma.infoCategories || [];
    
    return `
        <div class="pma-detail-header">
            <div class="pma-detail-title">
                <button class="btn btn-sm btn-secondary" onclick="deselectPMA()" style="margin-right: 12px;">← 戻る</button>
                <span class="pma-detail-icon">${pma.icon || '📦'}</span>
                <span class="pma-detail-name">${pma.name}</span>
            </div>
            <div class="pma-detail-actions">
                <button class="btn btn-sm btn-secondary" onclick="openEditPMAModal('${pma.id}')">✏️ 編集</button>
                <button class="btn btn-sm btn-danger" onclick="confirmDeletePMA('${pma.id}')">🗑️ 削除</button>
            </div>
        </div>
        
        <div class="info-categories-section">
            <div class="info-categories-header">
                <span class="section-label">情報分類</span>
                <button class="btn btn-sm btn-primary" onclick="openAddInfoCategoryModal('${pma.id}')">+ 情報分類追加</button>
            </div>
            
            <div class="info-categories-list">
                ${infoCategories.length === 0 ? 
                    '<p class="no-items-message">情報分類がありません。「+ 情報分類追加」ボタンから追加してください。</p>' :
                    infoCategories.map(info => renderInfoCategoryItem(pma.id, info)).join('')
                }
            </div>
        </div>
    `;
}

// 情報分類アイテムをレンダリング
function renderInfoCategoryItem(pmaId, info) {
    return `
        <div class="info-category-item" data-info-id="${info.id}">
            <div class="info-category-header">
                <span class="info-category-name">${info.name}</span>
                <div class="info-category-actions">
                    <button class="btn btn-xs btn-secondary" onclick="openEditInfoCategoryModal('${pmaId}', '${info.id}')">✏️</button>
                    <button class="btn btn-xs btn-danger" onclick="confirmDeleteInfoCategory('${pmaId}', '${info.id}')">🗑️</button>
                </div>
            </div>
        </div>
    `;
}

// PMA選択解除
function deselectPMA() {
    state.selectedPmaId = null;
    renderAdminPanel();
}

// PMA追加モーダルを開く
function openAddPMAModal() {
    const modal = createCategoryModal({
        title: '📦 PMA（大分類）追加',
        fields: [
            { name: 'name', label: 'PMA名', type: 'text', placeholder: '例: 米飯', required: true },
            { name: 'icon', label: 'アイコン', type: 'text', placeholder: '例: 🍙', maxLength: 2 }
        ],
        onSubmit: (data) => {
            addPMA(data);
        }
    });
    document.body.appendChild(modal);
}

// PMA編集モーダルを開く
function openEditPMAModal(pmaId) {
    const pma = state.productCategories.find(p => p.id === pmaId);
    if (!pma) return;
    
    const modal = createCategoryModal({
        title: '📦 PMA（大分類）編集',
        fields: [
            { name: 'name', label: 'PMA名', type: 'text', value: pma.name, required: true },
            { name: 'icon', label: 'アイコン', type: 'text', value: pma.icon || '', maxLength: 2 }
        ],
        onSubmit: (data) => {
            updatePMA(pmaId, data);
        }
    });
    document.body.appendChild(modal);
}

// 情報分類追加モーダルを開く
function openAddInfoCategoryModal(pmaId) {
    const modal = createCategoryModal({
        title: '📁 情報分類追加',
        fields: [
            { name: 'name', label: '情報分類名', type: 'text', placeholder: '例: おにぎり', required: true }
        ],
        onSubmit: (data) => {
            addInfoCategory(pmaId, data);
        }
    });
    document.body.appendChild(modal);
}

// 情報分類編集モーダルを開く
function openEditInfoCategoryModal(pmaId, infoId) {
    const pma = state.productCategories.find(p => p.id === pmaId);
    const info = pma?.infoCategories?.find(i => i.id === infoId);
    if (!info) return;
    
    const modal = createCategoryModal({
        title: '📁 情報分類編集',
        fields: [
            { name: 'name', label: '情報分類名', type: 'text', value: info.name, required: true }
        ],
        onSubmit: (data) => {
            updateInfoCategory(pmaId, infoId, data);
        }
    });
    document.body.appendChild(modal);
}

// カテゴリモーダルを作成（汎用）
function createCategoryModal({ title, fields, onSubmit }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay category-modal-overlay active';
    
    const fieldsHtml = fields.map(f => `
        <div class="form-group">
            <label for="category-${f.name}">${f.label}${f.required ? ' <span class="required">*</span>' : ''}</label>
            <input type="${f.type}" 
                   id="category-${f.name}" 
                   name="${f.name}"
                   value="${f.value || ''}" 
                   placeholder="${f.placeholder || ''}"
                   ${f.maxLength ? `maxlength="${f.maxLength}"` : ''}
                   ${f.required ? 'required' : ''}>
        </div>
    `).join('');
    
    overlay.innerHTML = `
        <div class="modal category-modal">
            <div class="modal-header">
                <h2 class="modal-title">${title}</h2>
                <button class="modal-close" onclick="closeCategoryModal(this)">×</button>
            </div>
            <form class="modal-body" onsubmit="handleCategoryFormSubmit(event, this)">
                ${fieldsHtml}
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeCategoryModal(this)">キャンセル</button>
                    <button type="submit" class="btn btn-primary">保存</button>
                </div>
            </form>
        </div>
    `;
    
    // onSubmitコールバックを保存
    overlay._onSubmit = onSubmit;
    
    // オーバーレイクリックで閉じる
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    };
    
    return overlay;
}

// カテゴリモーダルを閉じる
function closeCategoryModal(element) {
    const overlay = element.closest('.category-modal-overlay');
    if (overlay) overlay.remove();
}

// カテゴリフォーム送信処理
function handleCategoryFormSubmit(event, form) {
    event.preventDefault();
    const overlay = form.closest('.category-modal-overlay');
    const formData = new FormData(form);
    const data = {};
    formData.forEach((value, key) => {
        data[key] = value;
    });
    
    if (overlay._onSubmit) {
        overlay._onSubmit(data);
    }
    overlay.remove();
}

// PMA追加
function addPMA(data) {
    const newPMA = {
        id: 'pma-' + Date.now(),
        name: data.name,
        icon: data.icon || '📦',
        infoCategories: [],
        createdAt: new Date().toISOString()
    };
    
    state.productCategories.push(newPMA);
    saveToFirebase('productCategories', state.productCategories);
    renderAdminPanel();
}

// PMA更新
function updatePMA(pmaId, data) {
    const pma = state.productCategories.find(p => p.id === pmaId);
    if (!pma) return;
    
    pma.name = data.name;
    pma.icon = data.icon || '📦';
    pma.updatedAt = new Date().toISOString();
    
    saveToFirebase('productCategories', state.productCategories);
    renderAdminPanel();
}

// PMA削除確認
function confirmDeletePMA(pmaId) {
    const pma = state.productCategories.find(p => p.id === pmaId);
    if (!pma) return;
    
    if (confirm(`「${pma.name}」を削除しますか？\n含まれる情報分類・小分類もすべて削除されます。`)) {
        deletePMA(pmaId);
    }
}

// PMA削除
function deletePMA(pmaId) {
    state.productCategories = state.productCategories.filter(p => p.id !== pmaId);
    saveToFirebase('productCategories', state.productCategories);
    renderAdminPanel();
}

// 情報分類追加
function addInfoCategory(pmaId, data) {
    const pma = state.productCategories.find(p => p.id === pmaId);
    if (!pma) return;
    
    if (!pma.infoCategories) pma.infoCategories = [];
    
    pma.infoCategories.push({
        id: 'info-' + Date.now(),
        name: data.name,
        subCategories: [],
        createdAt: new Date().toISOString()
    });
    
    saveToFirebase('productCategories', state.productCategories);
    renderAdminPanel();
}

// 情報分類更新
function updateInfoCategory(pmaId, infoId, data) {
    const pma = state.productCategories.find(p => p.id === pmaId);
    const info = pma?.infoCategories?.find(i => i.id === infoId);
    if (!info) return;
    
    info.name = data.name;
    info.updatedAt = new Date().toISOString();
    
    saveToFirebase('productCategories', state.productCategories);
    renderAdminPanel();
}

// 情報分類削除確認
function confirmDeleteInfoCategory(pmaId, infoId) {
    const pma = state.productCategories.find(p => p.id === pmaId);
    const info = pma?.infoCategories?.find(i => i.id === infoId);
    if (!info) return;
    
    if (confirm(`「${info.name}」を削除しますか？\n含まれる小分類もすべて削除されます。`)) {
        deleteInfoCategory(pmaId, infoId);
    }
}

// 情報分類削除
function deleteInfoCategory(pmaId, infoId) {
    const pma = state.productCategories.find(p => p.id === pmaId);
    if (!pma) return;
    
    pma.infoCategories = pma.infoCategories.filter(i => i.id !== infoId);
    saveToFirebase('productCategories', state.productCategories);
    renderAdminPanel();
}

// フィードバック集計をレンダリング（管理者専用）
function renderFeedbackStats(container) {
    const feedbackData = state.orderAdvice?.feedbackData || {};
    const feedbackList = Object.values(feedbackData);
    
    console.log('renderFeedbackStats called', { feedbackData, feedbackList });
    
    // フィルター状態の初期化
    if (!state.feedbackFilter) {
        state.feedbackFilter = {
            period: 'all',
            staffName: 'all',
            startDate: '',
            endDate: ''
        };
    }
    
    // 担当者リストを作成
    const staffNames = [...new Set(feedbackList.map(f => f.submittedBy).filter(Boolean))].sort();
    
    // フィルターUI
    container.innerHTML = `
        <div class="feedback-stats-container">
            <div class="feedback-stats-header">
                <h3>📊 発注フィードバック集計</h3>
                <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 4px;">
                    登録件数: ${feedbackList.length}件
                </p>
            </div>
            
            <div class="feedback-filters">
                <div class="filter-group">
                    <label>期間:</label>
                    <select id="feedbackPeriodFilter" onchange="updateFeedbackFilter('period', this.value)">
                        <option value="all" ${state.feedbackFilter.period === 'all' ? 'selected' : ''}>すべて</option>
                        <option value="week" ${state.feedbackFilter.period === 'week' ? 'selected' : ''}>直近1週間</option>
                        <option value="month" ${state.feedbackFilter.period === 'month' ? 'selected' : ''}>直近1ヶ月</option>
                        <option value="custom" ${state.feedbackFilter.period === 'custom' ? 'selected' : ''}>期間指定</option>
                    </select>
                </div>
                
                <div class="filter-group custom-date-range" id="customDateRange" style="display: ${state.feedbackFilter.period === 'custom' ? 'flex' : 'none'}">
                    <input type="date" id="feedbackStartDate" value="${state.feedbackFilter.startDate}" onchange="updateFeedbackFilter('startDate', this.value)">
                    <span>〜</span>
                    <input type="date" id="feedbackEndDate" value="${state.feedbackFilter.endDate}" onchange="updateFeedbackFilter('endDate', this.value)">
                </div>
                
                <div class="filter-group">
                    <label>担当者:</label>
                    <select id="feedbackStaffFilter" onchange="updateFeedbackFilter('staffName', this.value)">
                        <option value="all" ${state.feedbackFilter.staffName === 'all' ? 'selected' : ''}>全員</option>
                        ${staffNames.map(name => `<option value="${name}" ${state.feedbackFilter.staffName === name ? 'selected' : ''}>${name}</option>`).join('')}
                    </select>
                </div>
            </div>
            
            <div class="feedback-stats-summary" id="feedbackSummary"></div>
            
            <div class="feedback-stats-tabs">
                <button class="stats-tab active" data-view="byStaff" onclick="switchFeedbackView('byStaff')">👤 担当者別</button>
                <button class="stats-tab" data-view="byDate" onclick="switchFeedbackView('byDate')">📅 日付別</button>
                <button class="stats-tab" data-view="list" onclick="switchFeedbackView('list')">📋 一覧</button>
            </div>
            
            <div class="feedback-stats-content" id="feedbackStatsContent"></div>
        </div>
    `;
    
    // 初期表示
    if (!state.feedbackView) state.feedbackView = 'byStaff';
    renderFeedbackContent(feedbackList);
}

// フィードバックフィルター更新
function updateFeedbackFilter(key, value) {
    state.feedbackFilter[key] = value;
    
    // 期間指定の表示切り替え
    const customRange = document.getElementById('customDateRange');
    if (customRange) {
        customRange.style.display = state.feedbackFilter.period === 'custom' ? 'flex' : 'none';
    }
    
    renderFeedbackContent(Object.values(state.orderAdvice.feedbackData || {}));
}

// フィードバック表示切り替え
function switchFeedbackView(view) {
    state.feedbackView = view;
    
    // タブのアクティブ状態を更新
    document.querySelectorAll('.stats-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === view);
    });
    
    renderFeedbackContent(Object.values(state.orderAdvice.feedbackData || {}));
}

// フィードバック内容をレンダリング
function renderFeedbackContent(feedbackList) {
    // フィルタリング
    let filtered = [...feedbackList];
    
    // 期間フィルター
    if (state.feedbackFilter.period !== 'all') {
        const now = new Date();
        let startDate;
        
        if (state.feedbackFilter.period === 'week') {
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 7);
        } else if (state.feedbackFilter.period === 'month') {
            startDate = new Date(now);
            startDate.setMonth(startDate.getMonth() - 1);
        } else if (state.feedbackFilter.period === 'custom') {
            if (state.feedbackFilter.startDate) {
                startDate = new Date(state.feedbackFilter.startDate);
            }
            if (state.feedbackFilter.endDate) {
                const endDate = new Date(state.feedbackFilter.endDate);
                endDate.setHours(23, 59, 59);
                filtered = filtered.filter(f => new Date(f.submittedAt) <= endDate);
            }
        }
        
        if (startDate) {
            filtered = filtered.filter(f => new Date(f.submittedAt) >= startDate);
        }
    }
    
    // 担当者フィルター
    if (state.feedbackFilter.staffName !== 'all') {
        filtered = filtered.filter(f => f.submittedBy === state.feedbackFilter.staffName);
    }
    
    // サマリー更新
    const summaryEl = document.getElementById('feedbackSummary');
    if (summaryEl) {
        const totalCount = filtered.length;
        const staffCount = new Set(filtered.map(f => f.submittedBy)).size;
        const ratingCounts = {
            excellent: filtered.filter(f => f.rating === 'excellent').length,
            good: filtered.filter(f => f.rating === 'good').length,
            fair: filtered.filter(f => f.rating === 'fair').length,
            poor: filtered.filter(f => f.rating === 'poor').length
        };
        
        summaryEl.innerHTML = `
            <div class="summary-cards">
                <div class="summary-card">
                    <div class="summary-value">${totalCount}</div>
                    <div class="summary-label">総フィードバック数</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${staffCount}</div>
                    <div class="summary-label">担当者数</div>
                </div>
                <div class="summary-card rating-card">
                    <div class="rating-breakdown">
                        <span class="rating-item excellent">◎ ${ratingCounts.excellent}</span>
                        <span class="rating-item good">○ ${ratingCounts.good}</span>
                        <span class="rating-item fair">△ ${ratingCounts.fair}</span>
                        <span class="rating-item poor">× ${ratingCounts.poor}</span>
                    </div>
                    <div class="summary-label">評価内訳</div>
                </div>
            </div>
        `;
    }
    
    // コンテンツ更新
    const contentEl = document.getElementById('feedbackStatsContent');
    if (!contentEl) return;
    
    if (filtered.length === 0) {
        contentEl.innerHTML = '<p class="no-data-message">フィードバックデータがありません</p>';
        return;
    }
    
    if (state.feedbackView === 'byStaff') {
        renderFeedbackByStaff(contentEl, filtered);
    } else if (state.feedbackView === 'byDate') {
        renderFeedbackByDate(contentEl, filtered);
    } else {
        renderFeedbackList(contentEl, filtered);
    }
}

// 担当者別表示
function renderFeedbackByStaff(container, feedbackList) {
    // 担当者ごとにグループ化
    const byStaff = {};
    feedbackList.forEach(f => {
        const name = f.submittedBy || '不明';
        if (!byStaff[name]) {
            byStaff[name] = [];
        }
        byStaff[name].push(f);
    });
    
    // フィードバック数で降順ソート
    const sortedStaff = Object.entries(byStaff).sort((a, b) => b[1].length - a[1].length);
    
    let html = '<div class="staff-stats-list">';
    
    sortedStaff.forEach(([staffName, feedbacks]) => {
        const ratingCounts = {
            excellent: feedbacks.filter(f => f.rating === 'excellent').length,
            good: feedbacks.filter(f => f.rating === 'good').length,
            fair: feedbacks.filter(f => f.rating === 'fair').length,
            poor: feedbacks.filter(f => f.rating === 'poor').length
        };
        
        // 最新のフィードバック日時
        const latestFeedback = feedbacks.sort((a, b) => 
            new Date(b.submittedAt) - new Date(a.submittedAt)
        )[0];
        const latestDate = latestFeedback ? formatDateTime(latestFeedback.submittedAt) : '-';
        
        html += `
            <div class="staff-stat-card">
                <div class="staff-stat-header">
                    <div class="staff-avatar">${staffName.charAt(0)}</div>
                    <div class="staff-info">
                        <div class="staff-name">${staffName}</div>
                        <div class="staff-meta">最終フィードバック: ${latestDate}</div>
                    </div>
                    <div class="staff-count">${feedbacks.length}件</div>
                </div>
                <div class="staff-rating-bars">
                    <div class="rating-bar-row">
                        <span class="rating-label">◎ 的中</span>
                        <div class="rating-bar">
                            <div class="rating-bar-fill excellent" style="width: ${feedbacks.length > 0 ? (ratingCounts.excellent / feedbacks.length * 100) : 0}%"></div>
                        </div>
                        <span class="rating-count">${ratingCounts.excellent}</span>
                    </div>
                    <div class="rating-bar-row">
                        <span class="rating-label">○ まあまあ</span>
                        <div class="rating-bar">
                            <div class="rating-bar-fill good" style="width: ${feedbacks.length > 0 ? (ratingCounts.good / feedbacks.length * 100) : 0}%"></div>
                        </div>
                        <span class="rating-count">${ratingCounts.good}</span>
                    </div>
                    <div class="rating-bar-row">
                        <span class="rating-label">△ 普通</span>
                        <div class="rating-bar">
                            <div class="rating-bar-fill fair" style="width: ${feedbacks.length > 0 ? (ratingCounts.fair / feedbacks.length * 100) : 0}%"></div>
                        </div>
                        <span class="rating-count">${ratingCounts.fair}</span>
                    </div>
                    <div class="rating-bar-row">
                        <span class="rating-label">× 外れ</span>
                        <div class="rating-bar">
                            <div class="rating-bar-fill poor" style="width: ${feedbacks.length > 0 ? (ratingCounts.poor / feedbacks.length * 100) : 0}%"></div>
                        </div>
                        <span class="rating-count">${ratingCounts.poor}</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// 日付別表示
function renderFeedbackByDate(container, feedbackList) {
    // 日付ごとにグループ化（フィードバック送信日）
    const byDate = {};
    feedbackList.forEach(f => {
        const dateStr = f.submittedAt ? f.submittedAt.split('T')[0] : 'unknown';
        if (!byDate[dateStr]) {
            byDate[dateStr] = [];
        }
        byDate[dateStr].push(f);
    });
    
    // 日付で降順ソート
    const sortedDates = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]));
    
    let html = '<div class="date-stats-list">';
    
    sortedDates.forEach(([dateStr, feedbacks]) => {
        const date = new Date(dateStr);
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        const displayDate = `${date.getMonth() + 1}/${date.getDate()}（${dayNames[date.getDay()]}）`;
        
        // 担当者ごとに集計
        const staffCounts = {};
        feedbacks.forEach(f => {
            const name = f.submittedBy || '不明';
            staffCounts[name] = (staffCounts[name] || 0) + 1;
        });
        
        html += `
            <div class="date-stat-card">
                <div class="date-stat-header">
                    <span class="date-display">${displayDate}</span>
                    <span class="date-count">${feedbacks.length}件のフィードバック</span>
                </div>
                <div class="date-staff-list">
                    ${Object.entries(staffCounts).map(([name, count]) => `
                        <span class="staff-chip">${name}: ${count}件</span>
                    `).join('')}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// 一覧表示
function renderFeedbackList(container, feedbackList) {
    // 送信日時で降順ソート
    const sorted = [...feedbackList].sort((a, b) => 
        new Date(b.submittedAt) - new Date(a.submittedAt)
    );
    
    // カテゴリマップを作成
    const categoryMap = {};
    ORDER_ADVICE_CATEGORIES.forEach(cat => {
        categoryMap[cat.id] = cat;
    });
    
    const ratingLabels = {
        excellent: '◎ 的中',
        good: '○ まあまあ',
        fair: '△ 普通',
        poor: '× 外れ'
    };
    
    let html = '<div class="feedback-list-table"><table><thead><tr><th>送信日時</th><th>担当者</th><th>対象日</th><th>カテゴリ</th><th>評価</th><th>詳細</th></tr></thead><tbody>';
    
    sorted.forEach(f => {
        const category = categoryMap[f.categoryId];
        const categoryName = category ? `${category.icon} ${category.name}` : f.categoryId;
        const ratingLabel = ratingLabels[f.rating] || '-';
        const ratingClass = f.rating || '';
        
        const details = [];
        if (f.oversold) details.push(`売れ残り: ${f.oversold}`);
        if (f.undersold) details.push(`欠品: ${f.undersold}`);
        if (f.notes) details.push(`メモ: ${f.notes}`);
        
        html += `
            <tr>
                <td>${formatDateTime(f.submittedAt)}</td>
                <td>${f.submittedBy || '不明'}</td>
                <td>${f.date || '-'}</td>
                <td class="category-cell">${categoryName}</td>
                <td class="rating-cell ${ratingClass}">${ratingLabel}</td>
                <td class="details-cell">${details.length > 0 ? details.join('<br>') : '-'}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// フィードバックデータをFirebaseから読み込み
function loadOrderFeedback() {
    database.ref('orderFeedback').on('value', snap => {
        const data = snap.val();
        if (data) {
            state.orderAdvice.feedbackData = data;
        }
    });
}

// ========================================
// 利用統計機能
// ========================================

// 利用統計の表示関数
function renderUsageStats(container) {
    const stats = state.usageStats || [];
    
    // 期間フィルター用の日付を計算
    const today = new Date();
    const todayStr = formatDate(today);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = formatDate(weekAgo);
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthAgoStr = formatDate(monthAgo);
    
    // 現在のフィルター設定を取得
    const currentPeriod = state.usageStatsPeriod || 'week';
    const currentView = state.usageStatsView || 'byFeature';
    
    // 期間でフィルター
    let filtered = stats;
    if (currentPeriod === 'today') {
        filtered = stats.filter(s => s.date === todayStr);
    } else if (currentPeriod === 'week') {
        filtered = stats.filter(s => s.date >= weekAgoStr);
    } else if (currentPeriod === 'month') {
        filtered = stats.filter(s => s.date >= monthAgoStr);
    }
    
    // サマリー統計を計算
    const totalActions = filtered.length;
    const uniqueUsers = [...new Set(filtered.map(s => s.userId || s.userName))].length;
    const uniqueFeatures = [...new Set(filtered.map(s => s.featureId))].length;
    
    // 機能別集計
    const byFeature = {};
    filtered.forEach(s => {
        if (!byFeature[s.featureId]) {
            byFeature[s.featureId] = {
                featureId: s.featureId,
                featureName: s.featureName,
                category: s.category,
                count: 0,
                users: new Set()
            };
        }
        byFeature[s.featureId].count++;
        byFeature[s.featureId].users.add(s.userName);
    });
    
    // ユーザー別集計（機能ごとの詳細も含む）
    // userId（Firebase Auth UID）をキーとし、旧データはuserNameをキーにフォールバック
    const byUser = {};
    filtered.forEach(s => {
        const userKey = s.userId || s.userName;
        if (!byUser[userKey]) {
            byUser[userKey] = {
                userName: s.userName,
                userId: s.userId || null,
                userEmail: s.userEmail || null,
                count: 0,
                features: new Set(),
                featureDetails: {}, // 機能ごとの詳細
                categoryDetails: {}, // カテゴリごとの詳細
                recentActions: [] // 最近のアクション
            };
        }
        // より新しいデータで表示名・メールを更新
        if (s.userId && s.userEmail) {
            byUser[userKey].userEmail = s.userEmail;
            byUser[userKey].userName = s.userName;
        }
        byUser[userKey].count++;
        byUser[userKey].features.add(s.featureId);

        // 機能ごとの使用回数を記録
        if (!byUser[userKey].featureDetails[s.featureId]) {
            byUser[userKey].featureDetails[s.featureId] = {
                featureId: s.featureId,
                featureName: s.featureName,
                category: s.category,
                count: 0,
                lastUsed: null
            };
        }
        byUser[userKey].featureDetails[s.featureId].count++;
        byUser[userKey].featureDetails[s.featureId].lastUsed = s.timestamp;

        // カテゴリごとの使用回数を記録
        if (!byUser[userKey].categoryDetails[s.category]) {
            byUser[userKey].categoryDetails[s.category] = {
                category: s.category,
                count: 0,
                features: new Set()
            };
        }
        byUser[userKey].categoryDetails[s.category].count++;
        byUser[userKey].categoryDetails[s.category].features.add(s.featureId);

        // 最近のアクション（最新20件まで）
        if (byUser[userKey].recentActions.length < 20) {
            byUser[userKey].recentActions.push({
                featureId: s.featureId,
                featureName: s.featureName,
                category: s.category,
                targetName: s.targetName || null,
                timestamp: s.timestamp
            });
        }
    });
    
    // 各ユーザーの最近のアクションを時系列でソート（新しい順）
    Object.values(byUser).forEach(u => {
        u.recentActions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    });
    
    // カテゴリ別集計
    const byCategory = {};
    filtered.forEach(s => {
        if (!byCategory[s.category]) {
            byCategory[s.category] = { count: 0, features: new Set() };
        }
        byCategory[s.category].count++;
        byCategory[s.category].features.add(s.featureId);
    });
    
    // 未使用機能を特定
    const usedFeatures = new Set(filtered.map(s => s.featureId));
    const unusedFeatures = Object.keys(USAGE_FEATURES).filter(f => !usedFeatures.has(f));
    
    container.innerHTML = `
        <div class="usage-stats-container">
            <div class="usage-stats-header">
                <h3>📊 利用統計</h3>
                <div class="usage-stats-controls">
                    <div class="filter-group">
                        <label>期間:</label>
                        <select id="usagePeriodFilter" onchange="changeUsageStatsPeriod(this.value)">
                            <option value="today" ${currentPeriod === 'today' ? 'selected' : ''}>今日</option>
                            <option value="week" ${currentPeriod === 'week' ? 'selected' : ''}>過去7日間</option>
                            <option value="month" ${currentPeriod === 'month' ? 'selected' : ''}>過去30日間</option>
                            <option value="all" ${currentPeriod === 'all' ? 'selected' : ''}>全期間</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>表示:</label>
                        <select id="usageViewFilter" onchange="changeUsageStatsView(this.value)">
                            <option value="byFeature" ${currentView === 'byFeature' ? 'selected' : ''}>機能別</option>
                            <option value="byUser" ${currentView === 'byUser' ? 'selected' : ''}>ユーザー別</option>
                            <option value="byCategory" ${currentView === 'byCategory' ? 'selected' : ''}>カテゴリ別</option>
                            <option value="unused" ${currentView === 'unused' ? 'selected' : ''}>未使用機能</option>
                            <option value="timeline" ${currentView === 'timeline' ? 'selected' : ''}>タイムライン</option>
                        </select>
                    </div>
                    <button class="btn btn-danger btn-sm" onclick="clearUsageStats()">🗑️ データクリア</button>
                </div>
            </div>
            
            <div class="usage-stats-summary">
                <div class="summary-card">
                    <div class="summary-value">${totalActions}</div>
                    <div class="summary-label">総アクション数</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${uniqueUsers}</div>
                    <div class="summary-label">アクティブユーザー</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${uniqueFeatures}</div>
                    <div class="summary-label">使用機能数</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${unusedFeatures.length}</div>
                    <div class="summary-label">未使用機能</div>
                </div>
            </div>
            
            <div class="usage-stats-content" id="usageStatsContent"></div>
        </div>
    `;
    
    const contentEl = document.getElementById('usageStatsContent');
    
    if (currentView === 'byFeature') {
        renderUsageByFeature(contentEl, byFeature);
    } else if (currentView === 'byUser') {
        renderUsageByUser(contentEl, byUser);
    } else if (currentView === 'byCategory') {
        renderUsageByCategory(contentEl, byCategory);
    } else if (currentView === 'unused') {
        renderUnusedFeatures(contentEl, unusedFeatures);
    } else if (currentView === 'timeline') {
        renderUsageTimeline(contentEl, filtered);
    }
}

// 機能別表示
function renderUsageByFeature(container, byFeature) {
    const sorted = Object.values(byFeature).sort((a, b) => b.count - a.count);
    
    if (sorted.length === 0) {
        container.innerHTML = '<p class="no-data-message">この期間の利用データはありません</p>';
        return;
    }
    
    const maxCount = sorted[0]?.count || 1;
    
    let html = '<div class="usage-feature-list">';
    sorted.forEach(f => {
        const feature = USAGE_FEATURES[f.featureId];
        const icon = feature?.icon || '📌';
        const percentage = (f.count / maxCount * 100).toFixed(0);
        
        html += `
            <div class="usage-feature-item">
                <div class="feature-info">
                    <span class="feature-icon">${icon}</span>
                    <div class="feature-details">
                        <span class="feature-name">${f.featureName}</span>
                        <span class="feature-category">${f.category}</span>
                    </div>
                </div>
                <div class="feature-stats">
                    <div class="usage-bar-container">
                        <div class="usage-bar" style="width: ${percentage}%"></div>
                    </div>
                    <span class="usage-count">${f.count}回</span>
                    <span class="usage-users">${f.users.size}人</span>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

// ユーザー別表示
function renderUsageByUser(container, byUser) {
    const sorted = Object.values(byUser).sort((a, b) => b.count - a.count);
    
    if (sorted.length === 0) {
        container.innerHTML = '<p class="no-data-message">この期間の利用データはありません</p>';
        return;
    }
    
    const maxCount = sorted[0]?.count || 1;
    
    let html = '<div class="usage-user-list">';
    sorted.forEach((u, index) => {
        const percentage = (u.count / maxCount * 100).toFixed(0);
        const userId = `user-detail-${index}`;
        
        // カテゴリ別の使用状況をソート
        const sortedCategories = Object.values(u.categoryDetails || {}).sort((a, b) => b.count - a.count);
        
        // 機能別の使用状況をソート
        const sortedFeatures = Object.values(u.featureDetails || {}).sort((a, b) => b.count - a.count);
        
        const emailDisplay = u.userEmail ? `<span class="user-email">${u.userEmail}</span>` : '<span class="user-email legacy">旧データ（未ログイン時）</span>';

        html += `
            <div class="usage-user-card">
                <div class="usage-user-item" onclick="toggleUserDetail('${userId}')">
                    <div class="user-info">
                        <div class="user-avatar">${u.userName.charAt(0)}</div>
                        <div class="user-name-section">
                            <span class="user-name">${u.userName}</span>
                            ${emailDisplay}
                            <span class="user-summary">${sortedCategories.slice(0, 2).map(c => c.category).join('・') || '-'}</span>
                        </div>
                    </div>
                    <div class="user-stats">
                        <div class="usage-bar-container">
                            <div class="usage-bar" style="width: ${percentage}%"></div>
                        </div>
                        <span class="usage-count">${u.count}回</span>
                        <span class="usage-features">${u.features.size}機能</span>
                        <span class="user-expand-icon" id="${userId}-icon">▼</span>
                    </div>
                </div>
                
                <div class="user-detail-panel" id="${userId}" style="display: none;">
                    <div class="user-detail-tabs">
                        <button class="user-detail-tab active" onclick="switchUserDetailTab('${userId}', 'category', event)">カテゴリ別</button>
                        <button class="user-detail-tab" onclick="switchUserDetailTab('${userId}', 'feature', event)">機能別</button>
                        <button class="user-detail-tab" onclick="switchUserDetailTab('${userId}', 'recent', event)">最近の操作</button>
                    </div>
                    
                    <div class="user-detail-content" id="${userId}-category">
                        ${renderUserCategoryDetail(sortedCategories)}
                    </div>
                    
                    <div class="user-detail-content" id="${userId}-feature" style="display: none;">
                        ${renderUserFeatureDetail(sortedFeatures)}
                    </div>
                    
                    <div class="user-detail-content" id="${userId}-recent" style="display: none;">
                        ${renderUserRecentActions(u.recentActions || [])}
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

// ユーザー詳細の展開/折りたたみ
function toggleUserDetail(userId) {
    const panel = document.getElementById(userId);
    const icon = document.getElementById(`${userId}-icon`);
    if (panel) {
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
            if (icon) icon.textContent = '▲';
        } else {
            panel.style.display = 'none';
            if (icon) icon.textContent = '▼';
        }
    }
}

// ユーザー詳細タブの切り替え
function switchUserDetailTab(userId, tab, event) {
    // タブボタンのアクティブ状態を切り替え
    const tabContainer = event.target.parentElement;
    tabContainer.querySelectorAll('.user-detail-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    // コンテンツの表示/非表示を切り替え
    ['category', 'feature', 'recent'].forEach(t => {
        const content = document.getElementById(`${userId}-${t}`);
        if (content) {
            content.style.display = t === tab ? 'block' : 'none';
        }
    });
}

// カテゴリ別詳細をレンダリング
function renderUserCategoryDetail(categories) {
    if (!categories || categories.length === 0) {
        return '<p class="no-data-message">データがありません</p>';
    }
    
    const maxCount = categories[0]?.count || 1;
    
    let html = '<div class="user-category-detail-list">';
    categories.forEach(c => {
        const percentage = (c.count / maxCount * 100).toFixed(0);
        html += `
            <div class="user-category-detail-item">
                <div class="category-detail-name">${c.category}</div>
                <div class="category-detail-stats">
                    <div class="mini-bar-container">
                        <div class="mini-bar" style="width: ${percentage}%"></div>
                    </div>
                    <span class="category-detail-count">${c.count}回</span>
                    <span class="category-detail-features">${c.features.size}機能</span>
                </div>
            </div>
        `;
    });
    html += '</div>';
    return html;
}

// 機能別詳細をレンダリング
function renderUserFeatureDetail(features) {
    if (!features || features.length === 0) {
        return '<p class="no-data-message">データがありません</p>';
    }
    
    const maxCount = features[0]?.count || 1;
    
    let html = '<div class="user-feature-detail-list">';
    features.forEach(f => {
        const feature = USAGE_FEATURES[f.featureId];
        const icon = feature?.icon || '📌';
        const percentage = (f.count / maxCount * 100).toFixed(0);
        const lastUsed = f.lastUsed ? formatLastUsed(f.lastUsed) : '-';
        
        html += `
            <div class="user-feature-detail-item">
                <div class="feature-detail-info">
                    <span class="feature-detail-icon">${icon}</span>
                    <div class="feature-detail-text">
                        <span class="feature-detail-name">${f.featureName}</span>
                        <span class="feature-detail-category">${f.category}</span>
                    </div>
                </div>
                <div class="feature-detail-stats">
                    <div class="mini-bar-container">
                        <div class="mini-bar feature-bar" style="width: ${percentage}%"></div>
                    </div>
                    <span class="feature-detail-count">${f.count}回</span>
                    <span class="feature-detail-last">最終: ${lastUsed}</span>
                </div>
            </div>
        `;
    });
    html += '</div>';
    return html;
}

// 最近のアクションをレンダリング
function renderUserRecentActions(actions) {
    if (!actions || actions.length === 0) {
        return '<p class="no-data-message">データがありません</p>';
    }
    
    let html = '<div class="user-recent-actions">';
    actions.forEach(a => {
        const feature = USAGE_FEATURES[a.featureId];
        const icon = feature?.icon || '📌';
        const time = new Date(a.timestamp);
        const timeStr = `${time.getMonth() + 1}/${time.getDate()} ${time.getHours()}:${String(time.getMinutes()).padStart(2, '0')}`;
        
        const targetLabel = a.targetName ? `<span class="recent-action-target">→ ${a.targetName}</span>` : '';

        html += `
            <div class="user-recent-action-item">
                <span class="recent-action-time">${timeStr}</span>
                <span class="recent-action-icon">${icon}</span>
                <span class="recent-action-name">${a.featureName}</span>
                ${targetLabel}
                <span class="recent-action-category">${a.category}</span>
            </div>
        `;
    });
    html += '</div>';
    return html;
}

// 最終使用日時をフォーマット
function formatLastUsed(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    // 1時間以内
    if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        return `${mins}分前`;
    }
    // 24時間以内
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours}時間前`;
    }
    // それ以外
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

// カテゴリ別表示
function renderUsageByCategory(container, byCategory) {
    const sorted = Object.entries(byCategory).sort((a, b) => b[1].count - a[1].count);
    
    if (sorted.length === 0) {
        container.innerHTML = '<p class="no-data-message">この期間の利用データはありません</p>';
        return;
    }
    
    const maxCount = sorted[0]?.[1].count || 1;
    
    let html = '<div class="usage-category-list">';
    sorted.forEach(([category, data]) => {
        const percentage = (data.count / maxCount * 100).toFixed(0);
        
        html += `
            <div class="usage-category-item">
                <div class="category-info">
                    <span class="category-name">${category}</span>
                </div>
                <div class="category-stats">
                    <div class="usage-bar-container">
                        <div class="usage-bar category-bar" style="width: ${percentage}%"></div>
                    </div>
                    <span class="usage-count">${data.count}回</span>
                    <span class="usage-features">${data.features.size}機能</span>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

// 未使用機能表示
function renderUnusedFeatures(container, unusedFeatures) {
    if (unusedFeatures.length === 0) {
        container.innerHTML = '<p class="success-message">🎉 すべての機能が使用されています！</p>';
        return;
    }
    
    // カテゴリごとにグループ化
    const byCategory = {};
    unusedFeatures.forEach(fId => {
        const feature = USAGE_FEATURES[fId];
        if (!feature) return;
        if (!byCategory[feature.category]) {
            byCategory[feature.category] = [];
        }
        byCategory[feature.category].push({ id: fId, ...feature });
    });
    
    let html = '<div class="unused-features-list">';
    html += '<p class="unused-description">以下の機能は選択期間中に使用されていません。削除または改善を検討してください。</p>';
    
    Object.entries(byCategory).forEach(([category, features]) => {
        html += `
            <div class="unused-category">
                <h4 class="unused-category-title">${category}</h4>
                <div class="unused-features-grid">
                    ${features.map(f => `
                        <div class="unused-feature-card">
                            <span class="feature-icon">${f.icon}</span>
                            <span class="feature-name">${f.name}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

// タイムライン表示
function renderUsageTimeline(container, filtered) {
    const sorted = [...filtered].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (sorted.length === 0) {
        container.innerHTML = '<p class="no-data-message">この期間の利用データはありません</p>';
        return;
    }
    
    // 最新100件のみ表示
    const limited = sorted.slice(0, 100);
    
    let html = '<div class="usage-timeline">';
    html += `<p class="timeline-info">最新${Math.min(sorted.length, 100)}件を表示 ${sorted.length > 100 ? `(全${sorted.length}件)` : ''}</p>`;
    
    let currentDate = '';
    limited.forEach(s => {
        const date = s.date;
        if (date !== currentDate) {
            if (currentDate) html += '</div>';
            const d = new Date(date);
            const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
            html += `<div class="timeline-date-header">${d.getMonth() + 1}/${d.getDate()}（${dayNames[d.getDay()]}）</div>`;
            html += '<div class="timeline-entries">';
            currentDate = date;
        }
        
        const feature = USAGE_FEATURES[s.featureId];
        const icon = feature?.icon || '📌';
        const time = new Date(s.timestamp);
        const timeStr = `${time.getHours()}:${String(time.getMinutes()).padStart(2, '0')}`;
        
        const targetInfo = s.targetName ? `<span class="timeline-target">→ ${s.targetName}</span>` : '';

        html += `
            <div class="timeline-entry">
                <span class="timeline-time">${timeStr}</span>
                <span class="timeline-icon">${icon}</span>
                <span class="timeline-feature">${s.featureName}</span>
                ${targetInfo}
                <span class="timeline-user">${s.userName}${s.userEmail ? ' (' + s.userEmail + ')' : ''}</span>
            </div>
        `;
    });
    if (currentDate) html += '</div>';
    html += '</div>';
    container.innerHTML = html;
}

// 期間フィルター変更
function changeUsageStatsPeriod(period) {
    state.usageStatsPeriod = period;
    renderAdminPanel();
}

// 表示切り替え
function changeUsageStatsView(view) {
    state.usageStatsView = view;
    renderAdminPanel();
}

// 利用統計データクリア
function clearUsageStats() {
    if (!confirm('利用統計データをすべて削除しますか？この操作は取り消せません。')) return;
    database.ref('usageStats').remove();
    state.usageStats = [];
    renderAdminPanel();
    alert('利用統計データを削除しました');
}

// 発注アドバイスボタンのイベントリスナー
document.getElementById('orderAdviceBtn').addEventListener('click', showOrderAdviceScreen);

// モバイル用フローティングボタンのイベントリスナー
const orderAdviceBtnMobile = document.getElementById('orderAdviceBtnMobile');
if (orderAdviceBtnMobile) {
    orderAdviceBtnMobile.addEventListener('click', showOrderAdviceScreen);
}

// 初期化時にフィードバックデータを読み込み
loadOrderFeedback();

