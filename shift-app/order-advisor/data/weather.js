/**
 * デモ用7日分天気データ
 * 実運用時はOpen-Meteo APIから取得想定
 */

const weatherTypes = {
    sunny: { icon: '☀️', label: '晴れ' },
    cloudy: { icon: '☁️', label: '曇り' },
    rainy: { icon: '🌧️', label: '雨' },
    snow: { icon: '❄️', label: '雪' },
    partlyCloudy: { icon: '⛅', label: '晴れ時々曇り' }
};

/**
 * 7日分のデモ天気データを生成
 * @returns {Array} 天気データ配列
 */
export function generateWeatherData() {
    const today = new Date();
    const data = [];

    // デモ用の天気パターン
    const patterns = [
        { weather: 'sunny', high: 8, low: 2 },
        { weather: 'partlyCloudy', high: 10, low: 4 },
        { weather: 'cloudy', high: 7, low: 1 },
        { weather: 'rainy', high: 9, low: 5 },
        { weather: 'sunny', high: 12, low: 3 },
        { weather: 'partlyCloudy', high: 11, low: 4 },
        { weather: 'sunny', high: 13, low: 5 }
    ];

    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);

        const pattern = patterns[i];
        const dayOfWeek = date.getDay();
        const dayOfMonth = date.getDate();

        data.push({
            date: date,
            dateStr: formatDate(date),
            dayOfWeek: getDayOfWeekLabel(dayOfWeek),
            dayOfWeekNum: dayOfWeek,
            weather: weatherTypes[pattern.weather],
            highTemp: pattern.high,
            lowTemp: pattern.low,
            specialDays: getSpecialDays(date)
        });
    }

    return data;
}

/**
 * 日付フォーマット
 */
function formatDate(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
}

/**
 * 曜日ラベル取得
 */
function getDayOfWeekLabel(dayOfWeek) {
    const labels = ['日', '月', '火', '水', '木', '金', '土'];
    return labels[dayOfWeek];
}

/**
 * 特別日判定
 */
function getSpecialDays(date) {
    const special = [];
    const dayOfMonth = date.getDate();
    const dayOfWeek = date.getDay();

    // 給料日前後（23-27日）
    if (dayOfMonth >= 23 && dayOfMonth <= 27) {
        special.push({ type: 'payday', label: '💰 給料日前後', impact: 'positive' });
    }

    // 月初（1-5日）
    if (dayOfMonth >= 1 && dayOfMonth <= 5) {
        special.push({ type: 'monthStart', label: '📅 月初', impact: 'positive' });
    }

    // 月末（26-31日）
    if (dayOfMonth >= 26) {
        special.push({ type: 'monthEnd', label: '💸 月末', impact: 'negative' });
    }

    // 金曜日
    if (dayOfWeek === 5) {
        special.push({ type: 'friday', label: '🍺 金曜日', impact: 'positive' });
    }

    // 土曜日
    if (dayOfWeek === 6) {
        special.push({ type: 'saturday', label: '👨‍👩‍👧‍👦 土曜日', impact: 'positive' });
    }

    // 日曜日
    if (dayOfWeek === 0) {
        special.push({ type: 'sunday', label: '🏠 日曜日', impact: 'positive' });
    }

    // 月曜日
    if (dayOfWeek === 1) {
        special.push({ type: 'monday', label: '😴 ブルーマンデー', impact: 'neutral' });
    }

    return special;
}

export { weatherTypes };
