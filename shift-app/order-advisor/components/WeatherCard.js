'use client';

/**
 * 天気カードコンポーネント
 */
export default function WeatherCard({ weatherData, isTargetDay = false }) {
    const styles = {
        card: {
            background: isTargetDay
                ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(147, 51, 234, 0.3))'
                : 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(10px)',
            borderRadius: '16px',
            padding: '20px',
            border: isTargetDay
                ? '2px solid rgba(59, 130, 246, 0.5)'
                : '1px solid rgba(255, 255, 255, 0.1)',
            marginBottom: '16px',
        },
        header: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
        },
        dateContainer: {
            display: 'flex',
            alignItems: 'baseline',
            gap: '8px',
        },
        date: {
            fontSize: '24px',
            fontWeight: 'bold',
            color: '#fff',
        },
        dayOfWeek: {
            fontSize: '16px',
            color: getDayColor(weatherData.dayOfWeekNum),
            fontWeight: '500',
        },
        targetBadge: {
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            color: '#fff',
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: '600',
        },
        weatherInfo: {
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
        },
        weatherIcon: {
            fontSize: '48px',
        },
        tempContainer: {
            display: 'flex',
            flexDirection: 'column',
        },
        highTemp: {
            fontSize: '28px',
            fontWeight: 'bold',
            color: '#ef4444',
        },
        lowTemp: {
            fontSize: '18px',
            color: '#3b82f6',
        },
        weatherLabel: {
            fontSize: '14px',
            color: '#94a3b8',
            marginLeft: 'auto',
        },
        specialDays: {
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginTop: '12px',
        },
        specialBadge: {
            padding: '4px 10px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '500',
        },
    };

    function getDayColor(dayNum) {
        if (dayNum === 0) return '#ef4444'; // 日曜
        if (dayNum === 6) return '#3b82f6'; // 土曜
        return '#94a3b8'; // 平日
    }

    function getSpecialBadgeStyle(impact) {
        const colors = {
            positive: { bg: 'rgba(34, 197, 94, 0.2)', border: '#22c55e' },
            negative: { bg: 'rgba(239, 68, 68, 0.2)', border: '#ef4444' },
            neutral: { bg: 'rgba(148, 163, 184, 0.2)', border: '#94a3b8' },
        };
        const c = colors[impact] || colors.neutral;
        return {
            ...styles.specialBadge,
            background: c.bg,
            border: `1px solid ${c.border}`,
            color: c.border,
        };
    }

    return (
        <div style={styles.card}>
            <div style={styles.header}>
                <div style={styles.dateContainer}>
                    <span style={styles.date}>{weatherData.dateStr}</span>
                    <span style={styles.dayOfWeek}>({weatherData.dayOfWeek})</span>
                </div>
                {isTargetDay && (
                    <span style={styles.targetBadge}>📦 発注対象日</span>
                )}
            </div>

            <div style={styles.weatherInfo}>
                <span style={styles.weatherIcon}>{weatherData.weather.icon}</span>
                <div style={styles.tempContainer}>
                    <span style={styles.highTemp}>{weatherData.highTemp}°</span>
                    <span style={styles.lowTemp}>{weatherData.lowTemp}°</span>
                </div>
                <span style={styles.weatherLabel}>{weatherData.weather.label}</span>
            </div>

            {weatherData.specialDays && weatherData.specialDays.length > 0 && (
                <div style={styles.specialDays}>
                    {weatherData.specialDays.map((special, idx) => (
                        <span key={idx} style={getSpecialBadgeStyle(special.impact)}>
                            {special.label}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
