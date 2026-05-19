'use client';

/**
 * カテゴリ別アドバイスカードコンポーネント
 */
export default function CategoryCard({ category, advice }) {
    const styles = {
        card: {
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(10px)',
            borderRadius: '16px',
            padding: '20px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderLeft: `4px solid ${category.color}`,
            marginBottom: '16px',
        },
        header: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
        },
        titleContainer: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
        },
        icon: {
            fontSize: '28px',
        },
        title: {
            fontSize: '18px',
            fontWeight: '600',
            color: '#fff',
        },
        confidenceContainer: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
        },
        confidenceLabel: {
            fontSize: '12px',
            color: '#94a3b8',
        },
        confidenceValue: {
            fontSize: '16px',
            fontWeight: 'bold',
            color: getConfidenceColor(advice.confidence),
        },
        progressBar: {
            width: '60px',
            height: '6px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '3px',
            overflow: 'hidden',
        },
        progressFill: {
            height: '100%',
            background: getConfidenceColor(advice.confidence),
            borderRadius: '3px',
            width: `${advice.confidence}%`,
            transition: 'width 0.5s ease',
        },
        recommendationsSection: {
            marginBottom: '16px',
        },
        sectionTitle: {
            fontSize: '14px',
            fontWeight: '600',
            color: '#22c55e',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
        },
        recommendation: {
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '10px',
        },
        reason: {
            fontSize: '14px',
            fontWeight: '600',
            color: '#fff',
            marginBottom: '4px',
        },
        psychology: {
            fontSize: '12px',
            color: '#94a3b8',
            marginBottom: '8px',
            fontStyle: 'italic',
        },
        productList: {
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
        },
        productTag: {
            background: `${category.color}22`,
            border: `1px solid ${category.color}`,
            color: category.color,
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: '500',
        },
        warningsSection: {
            marginTop: '12px',
        },
        warningTitle: {
            fontSize: '14px',
            fontWeight: '600',
            color: '#f59e0b',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
        },
        warning: {
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '8px',
        },
        warningReason: {
            fontSize: '13px',
            fontWeight: '500',
            color: '#f59e0b',
            marginBottom: '4px',
        },
        warningSuggestion: {
            fontSize: '12px',
            color: '#94a3b8',
        },
        noData: {
            fontSize: '14px',
            color: '#64748b',
            textAlign: 'center',
            padding: '20px',
        },
    };

    function getConfidenceColor(confidence) {
        if (confidence >= 80) return '#22c55e';
        if (confidence >= 60) return '#eab308';
        return '#ef4444';
    }

    return (
        <div style={styles.card}>
            <div style={styles.header}>
                <div style={styles.titleContainer}>
                    <span style={styles.icon}>{category.icon}</span>
                    <span style={styles.title}>{category.name}</span>
                </div>
                <div style={styles.confidenceContainer}>
                    <span style={styles.confidenceLabel}>信頼度</span>
                    <span style={styles.confidenceValue}>{advice.confidence}%</span>
                    <div style={styles.progressBar}>
                        <div style={styles.progressFill}></div>
                    </div>
                </div>
            </div>

            {advice.recommendations && advice.recommendations.length > 0 ? (
                <div style={styles.recommendationsSection}>
                    <div style={styles.sectionTitle}>
                        <span>📈</span>
                        <span>推奨事項</span>
                    </div>
                    {advice.recommendations.map((rec, idx) => (
                        <div key={idx} style={styles.recommendation}>
                            <div style={styles.reason}>{rec.reason}</div>
                            <div style={styles.psychology}>「{rec.psychology}」</div>
                            <div style={styles.productList}>
                                {rec.products.map((product, pIdx) => (
                                    <span key={pIdx} style={styles.productTag}>{product}</span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={styles.noData}>特記事項なし</div>
            )}

            {advice.warnings && advice.warnings.length > 0 && (
                <div style={styles.warningsSection}>
                    <div style={styles.warningTitle}>
                        <span>⚠️</span>
                        <span>注意事項</span>
                    </div>
                    {advice.warnings.map((warn, idx) => (
                        <div key={idx} style={styles.warning}>
                            <div style={styles.warningReason}>{warn.reason}</div>
                            <div style={styles.warningSuggestion}>{warn.suggestion}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
