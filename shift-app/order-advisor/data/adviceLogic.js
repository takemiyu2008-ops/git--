/**
 * 発注アドバイス生成ロジック
 */

import { categories } from './categories';

/**
 * 発注対象日を計算
 * 11時締め：翌日分の発注
 * 11時以降：翌々日分の発注に自動切替
 * @returns {Object} 発注対象日情報
 */
export function getOrderTargetDate() {
    const now = new Date();
    const currentHour = now.getHours();

    // 11時締め判定
    const daysToAdd = currentHour < 11 ? 1 : 2;

    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + daysToAdd);

    // 締切時刻
    const deadline = new Date(now);
    deadline.setHours(11, 0, 0, 0);
    if (currentHour >= 11) {
        deadline.setDate(deadline.getDate() + 1);
    }

    return {
        date: targetDate,
        daysAhead: daysToAdd,
        label: daysToAdd === 1 ? '翌日分' : '翌々日分',
        deadline: deadline,
        isUrgent: (deadline - now) < 60 * 60 * 1000 // 1時間以内
    };
}

/**
 * 締切までの残り時間を取得
 * @param {Date} deadline 締切時刻
 * @returns {Object} 残り時間情報
 */
export function getTimeRemaining(deadline) {
    const now = new Date();
    const diff = deadline - now;

    if (diff <= 0) {
        return { hours: 0, minutes: 0, text: '締切済み', isOverdue: true };
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return {
        hours,
        minutes,
        text: `残り ${hours}時間${minutes}分`,
        isOverdue: false,
        isUrgent: diff < 60 * 60 * 1000
    };
}

/**
 * カテゴリ別アドバイスを生成
 * @param {string} categoryId カテゴリID
 * @param {Object} weatherData 天気データ
 * @returns {Object} アドバイス情報
 */
export function generateAdvice(categoryId, weatherData) {
    const { highTemp, lowTemp, weather, dayOfWeekNum, specialDays } = weatherData;
    const avgTemp = (highTemp + lowTemp) / 2;

    const adviceMap = {
        rice: generateRiceAdvice(avgTemp, highTemp, lowTemp, weather, dayOfWeekNum, specialDays),
        bread: generateBreadAdvice(avgTemp, highTemp, lowTemp, weather, dayOfWeekNum, specialDays),
        noodles: generateNoodlesAdvice(avgTemp, highTemp, lowTemp, weather, dayOfWeekNum, specialDays),
        deli: generateDeliAdvice(avgTemp, highTemp, lowTemp, weather, dayOfWeekNum, specialDays),
        dessert: generateDessertAdvice(avgTemp, highTemp, lowTemp, weather, dayOfWeekNum, specialDays),
        pastry: generatePastryAdvice(avgTemp, highTemp, lowTemp, weather, dayOfWeekNum, specialDays),
        milk: generateMilkAdvice(avgTemp, highTemp, lowTemp, weather, dayOfWeekNum, specialDays)
    };

    return adviceMap[categoryId] || { confidence: 50, recommendations: [], warnings: [] };
}

/**
 * 米飯のアドバイス
 */
function generateRiceAdvice(avgTemp, highTemp, lowTemp, weather, dayOfWeek, specialDays) {
    const recommendations = [];
    const warnings = [];
    let confidence = 70;

    if (lowTemp <= 10) {
        recommendations.push({
            reason: '寒さで温かい商品↑',
            psychology: '体の芯から温まりたい',
            products: ['温かい弁当', '炊き込みご飯おにぎり', '豚汁付き弁当']
        });
        confidence += 10;
    }

    if (highTemp >= 25) {
        recommendations.push({
            reason: '暑さで塩分・さっぱり系↑',
            psychology: '汗で塩分欲求が高まる',
            products: ['梅おにぎり', '塩むすび', '冷やし寿司', 'ネバネバ丼']
        });
        confidence += 8;
    }

    if (weather.label === '雨') {
        warnings.push({
            reason: '雨天で来客減予想',
            suggestion: '発注控えめ（-15%目安）'
        });
        confidence -= 5;
    }

    // 金曜日
    if (dayOfWeek === 5) {
        recommendations.push({
            reason: '週末前の夕食需要↑',
            psychology: '手軽に済ませたい',
            products: ['ボリューム弁当', '丼物']
        });
    }

    return { confidence: Math.min(95, confidence), recommendations, warnings };
}

/**
 * 調理パンのアドバイス
 */
function generateBreadAdvice(avgTemp, highTemp, lowTemp, weather, dayOfWeek, specialDays) {
    const recommendations = [];
    const warnings = [];
    let confidence = 68;

    // 平日朝食需要
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        recommendations.push({
            reason: '平日朝食需要',
            psychology: '時間がない朝に手軽に',
            products: ['たまごサンド', 'ハムサンド', 'ミックスサンド']
        });
        confidence += 5;
    }

    if (lowTemp <= 10) {
        recommendations.push({
            reason: '寒さでボリューム系↑',
            psychology: 'しっかりエネルギー補給',
            products: ['カツサンド', 'ブリトー', 'ホットドッグ']
        });
        confidence += 8;
    }

    if (highTemp >= 25) {
        recommendations.push({
            reason: '暑さでさっぱり系↑',
            psychology: '軽めの食事を好む',
            products: ['野菜サンド', 'フルーツサンド']
        });
        warnings.push({
            reason: '高温で傷みやすい',
            suggestion: '在庫管理に注意'
        });
    }

    return { confidence: Math.min(95, confidence), recommendations, warnings };
}

/**
 * 麺類その他のアドバイス
 */
function generateNoodlesAdvice(avgTemp, highTemp, lowTemp, weather, dayOfWeek, specialDays) {
    const recommendations = [];
    const warnings = [];
    let confidence = 72;

    if (lowTemp <= 10) {
        recommendations.push({
            reason: '寒さで温かい麺↑',
            psychology: '体の芯から温まりたい',
            products: ['カップ麺(温)', 'グラタン', 'ドリア', 'うどん']
        });
        confidence = 85;
    }

    if (highTemp >= 25) {
        recommendations.push({
            reason: '暑さで冷たい麺↑',
            psychology: 'さっぱりしたい',
            products: ['冷やし中華', '冷製パスタ', 'ざるそば']
        });
        warnings.push({
            reason: 'カップ麺(温)需要↓',
            suggestion: '発注控えめに'
        });
        confidence += 10;
    }

    // 月曜日
    if (dayOfWeek === 1) {
        recommendations.push({
            reason: '月曜は手軽さ重視',
            psychology: '週の始まりで疲れ気味',
            products: ['カップ麺', '焼きそば']
        });
        confidence += 5;
    }

    return { confidence: Math.min(95, confidence), recommendations, warnings };
}

/**
 * デリカテッセンのアドバイス
 */
function generateDeliAdvice(avgTemp, highTemp, lowTemp, weather, dayOfWeek, specialDays) {
    const recommendations = [];
    const warnings = [];
    let confidence = 70;

    // 金曜日
    if (dayOfWeek === 5) {
        recommendations.push({
            reason: '金曜日の惣菜需要↑',
            psychology: '週末の解放感・晩酌需要',
            products: ['唐揚げ', 'おつまみ系', 'ポテトサラダ', '枝豆']
        });
        confidence += 12;
    }

    if (highTemp >= 25) {
        recommendations.push({
            reason: '暑さでサラダ需要↑',
            psychology: 'さっぱりしたものを食べたい',
            products: ['サラダ各種', '冷やし惣菜']
        });
        confidence += 8;
    }

    if (lowTemp <= 10) {
        recommendations.push({
            reason: '寒さで温惣菜↑',
            psychology: '温かいものを食べたい',
            products: ['コロッケ', '肉じゃが', 'おでん具材']
        });
        confidence += 8;
    }

    if (weather.label === '雨') {
        recommendations.push({
            reason: '雨天のついで買い狙い',
            psychology: '外出を減らしたい',
            products: ['小分け惣菜', '日持ちする惣菜']
        });
    }

    return { confidence: Math.min(95, confidence), recommendations, warnings };
}

/**
 * デザートのアドバイス
 */
function generateDessertAdvice(avgTemp, highTemp, lowTemp, weather, dayOfWeek, specialDays) {
    const recommendations = [];
    const warnings = [];
    let confidence = 70;

    if (highTemp >= 25) {
        recommendations.push({
            reason: '暑さで冷たいデザート↑↑',
            psychology: 'ひんやり感で涼みたい',
            products: ['ゼリー', 'プリン', 'ヨーグルト', 'アイス風デザート']
        });
        confidence = 88;
    }

    if (avgTemp <= 15) {
        recommendations.push({
            reason: '気温低下でしっとり系↑',
            psychology: 'ほっこりしたい',
            products: ['チルド和菓子', 'チーズケーキ', 'ガトーショコラ']
        });
        confidence += 8;
    }

    // 週末
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        recommendations.push({
            reason: '週末のご褒美需要↑',
            psychology: '自分へのご褒美',
            products: ['プレミアムスイーツ', 'ケーキ類']
        });
        confidence += 10;
    }

    // 給料日後
    const hasPayday = specialDays.some(s => s.type === 'payday');
    if (hasPayday) {
        recommendations.push({
            reason: '給料日後で消費意欲↑',
            psychology: 'ちょっと贅沢してもいい',
            products: ['高単価デザート', 'プレミアムプリン']
        });
        confidence += 5;
    }

    return { confidence: Math.min(95, confidence), recommendations, warnings };
}

/**
 * ペストリーのアドバイス
 */
function generatePastryAdvice(avgTemp, highTemp, lowTemp, weather, dayOfWeek, specialDays) {
    const recommendations = [];
    const warnings = [];
    let confidence = 68;

    // 平日朝
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        recommendations.push({
            reason: '平日朝の食パン需要',
            psychology: '朝食のルーティン',
            products: ['食パン', 'ロールパン', 'バターロール']
        });
        confidence += 5;
    }

    // 日曜日
    if (dayOfWeek === 0) {
        recommendations.push({
            reason: '日曜朝のゆっくり需要',
            psychology: '家族でゆっくり朝食',
            products: ['マルチパック', '高級食パン', 'デニッシュ']
        });
        confidence += 10;
    }

    if (avgTemp <= 15) {
        recommendations.push({
            reason: '寒さで惣菜パン↑',
            psychology: 'ボリュームのある軽食',
            products: ['カレーパン', '焼きそばパン', 'コロッケパン']
        });
        confidence += 8;
    }

    return { confidence: Math.min(95, confidence), recommendations, warnings };
}

/**
 * 牛乳乳飲料のアドバイス
 */
function generateMilkAdvice(avgTemp, highTemp, lowTemp, weather, dayOfWeek, specialDays) {
    const recommendations = [];
    const warnings = [];
    let confidence = 72;

    if (lowTemp <= 10) {
        recommendations.push({
            reason: '寒さでホット用牛乳↑',
            psychology: '温かい飲み物を作りたい',
            products: ['ホット用牛乳', 'ココア用牛乳']
        });
        confidence += 8;
    }

    if (highTemp >= 25) {
        recommendations.push({
            reason: '暑さで冷たい乳飲料↑',
            psychology: 'さっぱり・甘い飲み物',
            products: ['コーヒー牛乳', 'のむヨーグルト', 'フルーツ牛乳']
        });
        confidence += 10;
    }

    // 週末
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        recommendations.push({
            reason: '週末の家族需要↑',
            psychology: '家族で消費量増加',
            products: ['大容量牛乳', 'ファミリーパック']
        });
        confidence += 8;
    }

    return { confidence: Math.min(95, confidence), recommendations, warnings };
}

/**
 * 全カテゴリのアドバイスを一括生成
 * @param {Array} categoryIds 対象カテゴリID配列
 * @param {Object} weatherData 天気データ
 * @returns {Array} アドバイス配列
 */
export function generateAllAdvice(categoryIds, weatherData) {
    return categoryIds.map(categoryId => {
        const category = categories.find(c => c.id === categoryId);
        const advice = generateAdvice(categoryId, weatherData);

        return {
            ...category,
            ...advice
        };
    });
}
