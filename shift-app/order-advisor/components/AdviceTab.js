'use client';

import { useState, useEffect } from 'react';
import WeatherCard from './WeatherCard';
import CategoryCard from './CategoryCard';
import { getOrderTargetDate, getTimeRemaining, generateAllAdvice } from '@/data/adviceLogic';
import { categories } from '@/data/categories';

/**
 * アドバイス画面コンポーネント
 */
export default function AdviceTab({ user, weatherData, onSwitchUser, onSwitchTab }) {
    const [timeRemaining, setTimeRemaining] = useState(null);
    const [orderTarget, setOrderTarget] = useState(null);
    const [adviceList, setAdviceList] = useState([]);

    useEffect(() => {
        // 発注対象日を計算
        const target = getOrderTargetDate();
        setOrderTarget(target);

        // 対象日の天気データを取得
        const targetWeather = weatherData.find((w, idx) => idx === target.daysAhead - 1) || weatherData[0];

        // アドバイスを生成
        const advice = generateAllAdvice(user.categories, targetWeather);
        setAdviceList(advice);

        // 残り時間を更新
        const updateTime = () => {
            setTimeRemaining(getTimeRemaining(target.deadline));
        };
        updateTime();

        const interval = setInterval(updateTime, 60000); // 1分ごとに更新
        return () => clearInterval(interval);
    }, [user, weatherData]);

    const targetWeather = weatherData.find((w, idx) => idx === (orderTarget?.daysAhead || 1) - 1) || weatherData[0];

    const styles = {
        container: {
            minHeight: '100vh',
            padding: '20px',
            paddingBottom: '100px',
        },
        header: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
        },
        headerLeft: {
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
        },
        appTitle: {
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#fff',
        },
        userName: {
            fontSize: '14px',
            color: '#94a3b8',
            background: 'rgba(255, 255, 255, 0.1)',
            padding: '4px 12px',
            borderRadius: '20px',
        },
        switchButton: {
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
        },
        deadlineBanner: {
            background: timeRemaining?.isUrgent
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(220, 38, 38, 0.3))'
                : 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(147, 51, 234, 0.2))',
            border: timeRemaining?.isUrgent
                ? '1px solid rgba(239, 68, 68, 0.5)'
                : '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px',
            textAlign: 'center',
            animation: timeRemaining?.isUrgent ? 'pulse 1.5s infinite' : 'none',
        },
        targetDate: {
            fontSize: '18px',
            fontWeight: '600',
            color: '#fff',
            marginBottom: '4px',
        },
        timeRemaining: {
            fontSize: '14px',
            color: timeRemaining?.isUrgent ? '#ef4444' : '#94a3b8',
            fontWeight: timeRemaining?.isUrgent ? '600' : 'normal',
        },
        sectionTitle: {
            fontSize: '16px',
            fontWeight: '600',
            color: '#94a3b8',
            marginBottom: '12px',
            marginTop: '24px',
        },
        tabNav: {
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'rgba(22, 33, 62, 0.95)',
            backdropFilter: 'blur(10px)',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'center',
            gap: '20px',
        },
        tabButton: {
            flex: 1,
            maxWidth: '200px',
            padding: '12px',
            borderRadius: '12px',
            border: 'none',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
        },
        tabActive: {
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            color: '#fff',
        },
        tabInactive: {
            background: 'rgba(255, 255, 255, 0.1)',
            color: '#94a3b8',
        },
    };

    const formatTargetDateLabel = () => {
        if (!targetWeather || !orderTarget) return '';
        return `${targetWeather.dateStr}(${targetWeather.dayOfWeek}) ${orderTarget.label}`;
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.headerLeft}>
                    <span style={styles.appTitle}>🛒 発注アドバイザー</span>
                    <span style={styles.userName}>{user.name}</span>
                </div>
                <button
                    style={styles.switchButton}
                    onClick={onSwitchUser}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                >
                    担当変更
                </button>
            </div>

            <div style={styles.deadlineBanner}>
                <div style={styles.targetDate}>📦 {formatTargetDateLabel()}</div>
                <div style={styles.timeRemaining}>
                    {timeRemaining?.isOverdue
                        ? '⏰ 締切時間を過ぎました'
                        : `⏰ 締切まで ${timeRemaining?.text || '計算中...'}`
                    }
                </div>
            </div>

            <WeatherCard weatherData={targetWeather} isTargetDay={true} />

            <div style={styles.sectionTitle}>📋 カテゴリ別アドバイス</div>

            {adviceList.map((advice) => (
                <CategoryCard
                    key={advice.id}
                    category={advice}
                    advice={advice}
                />
            ))}

            <div style={styles.tabNav}>
                <button
                    style={{ ...styles.tabButton, ...styles.tabActive }}
                >
                    📋 アドバイス
                </button>
                <button
                    style={{ ...styles.tabButton, ...styles.tabInactive }}
                    onClick={() => onSwitchTab('feedback')}
                >
                    📝 フィードバック
                </button>
            </div>
        </div>
    );
}
