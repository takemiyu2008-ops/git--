'use client';

import { useState } from 'react';
import { categories } from '@/data/categories';

/**
 * フィードバック画面コンポーネント
 */
export default function FeedbackTab({ user, onSwitchTab }) {
    const [feedbacks, setFeedbacks] = useState({});
    const [submittedCategories, setSubmittedCategories] = useState([]);

    const userCategories = categories.filter(c => user.categories.includes(c.id));

    const handleFeedbackChange = (categoryId, field, value) => {
        setFeedbacks(prev => ({
            ...prev,
            [categoryId]: {
                ...prev[categoryId],
                [field]: value
            }
        }));
    };

    const handleSubmit = (categoryId) => {
        const feedback = feedbacks[categoryId];
        // ここでFirebaseなどにデータを保存する想定
        console.log('Feedback submitted:', { categoryId, feedback });

        setSubmittedCategories(prev => [...prev, categoryId]);

        // 送信完了メッセージを表示
        setTimeout(() => {
            alert(`${categories.find(c => c.id === categoryId)?.name}のフィードバックを送信しました`);
        }, 100);
    };

    const accuracyOptions = [
        { value: 'excellent', label: '◎ 的中', color: '#22c55e' },
        { value: 'good', label: '○ まあまあ', color: '#3b82f6' },
        { value: 'normal', label: '△ 普通', color: '#eab308' },
        { value: 'miss', label: '× 外れ', color: '#ef4444' },
    ];

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
        pageTitle: {
            fontSize: '18px',
            fontWeight: '600',
            color: '#fff',
            marginBottom: '20px',
        },
        categoryCard: {
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(10px)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '20px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
        },
        categoryHeader: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '16px',
        },
        categoryIcon: {
            fontSize: '24px',
        },
        categoryName: {
            fontSize: '16px',
            fontWeight: '600',
            color: '#fff',
        },
        fieldGroup: {
            marginBottom: '16px',
        },
        fieldLabel: {
            fontSize: '13px',
            color: '#94a3b8',
            marginBottom: '8px',
            display: 'block',
        },
        accuracyGroup: {
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px',
        },
        accuracyButton: {
            padding: '10px 8px',
            borderRadius: '8px',
            border: '2px solid',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: 'transparent',
        },
        textInput: {
            width: '100%',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            padding: '12px',
            color: '#fff',
            fontSize: '14px',
            outline: 'none',
            transition: 'border-color 0.2s ease',
        },
        textarea: {
            width: '100%',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            padding: '12px',
            color: '#fff',
            fontSize: '14px',
            outline: 'none',
            minHeight: '80px',
            resize: 'vertical',
            fontFamily: 'inherit',
        },
        submitButton: {
            width: '100%',
            padding: '14px',
            borderRadius: '12px',
            border: 'none',
            fontSize: '15px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
        },
        submitEnabled: {
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            color: '#fff',
        },
        submitDisabled: {
            background: 'rgba(255, 255, 255, 0.1)',
            color: '#64748b',
            cursor: 'not-allowed',
        },
        submitted: {
            background: 'rgba(34, 197, 94, 0.2)',
            border: '1px solid #22c55e',
            color: '#22c55e',
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

    const isSubmitted = (categoryId) => submittedCategories.includes(categoryId);

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.headerLeft}>
                    <span style={styles.appTitle}>🛒 発注アドバイザー</span>
                    <span style={styles.userName}>{user.name}</span>
                </div>
            </div>

            <h2 style={styles.pageTitle}>📝 フィードバック入力</h2>

            {userCategories.map((category) => (
                <div
                    key={category.id}
                    style={{
                        ...styles.categoryCard,
                        borderLeft: `4px solid ${category.color}`,
                        opacity: isSubmitted(category.id) ? 0.6 : 1,
                    }}
                >
                    <div style={styles.categoryHeader}>
                        <span style={styles.categoryIcon}>{category.icon}</span>
                        <span style={styles.categoryName}>{category.name}</span>
                        {isSubmitted(category.id) && (
                            <span style={{ marginLeft: 'auto', color: '#22c55e', fontSize: '14px' }}>
                                ✓ 送信済み
                            </span>
                        )}
                    </div>

                    <div style={styles.fieldGroup}>
                        <label style={styles.fieldLabel}>的中度評価</label>
                        <div style={styles.accuracyGroup}>
                            {accuracyOptions.map((opt) => (
                                <button
                                    key={opt.value}
                                    style={{
                                        ...styles.accuracyButton,
                                        borderColor: feedbacks[category.id]?.accuracy === opt.value
                                            ? opt.color
                                            : 'rgba(255, 255, 255, 0.2)',
                                        background: feedbacks[category.id]?.accuracy === opt.value
                                            ? `${opt.color}22`
                                            : 'transparent',
                                        color: feedbacks[category.id]?.accuracy === opt.value
                                            ? opt.color
                                            : '#94a3b8',
                                    }}
                                    onClick={() => handleFeedbackChange(category.id, 'accuracy', opt.value)}
                                    disabled={isSubmitted(category.id)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={styles.fieldGroup}>
                        <label style={styles.fieldLabel}>予想以上に売れたもの</label>
                        <input
                            type="text"
                            style={styles.textInput}
                            placeholder="例: 梅おにぎり、カップ麺"
                            value={feedbacks[category.id]?.soldMore || ''}
                            onChange={(e) => handleFeedbackChange(category.id, 'soldMore', e.target.value)}
                            disabled={isSubmitted(category.id)}
                        />
                    </div>

                    <div style={styles.fieldGroup}>
                        <label style={styles.fieldLabel}>予想より売れなかったもの</label>
                        <input
                            type="text"
                            style={styles.textInput}
                            placeholder="例: サラダ、冷やし中華"
                            value={feedbacks[category.id]?.soldLess || ''}
                            onChange={(e) => handleFeedbackChange(category.id, 'soldLess', e.target.value)}
                            disabled={isSubmitted(category.id)}
                        />
                    </div>

                    <div style={styles.fieldGroup}>
                        <label style={styles.fieldLabel}>気づいたこと・特記事項</label>
                        <textarea
                            style={styles.textarea}
                            placeholder="例: 近くでイベントがあり、人通りが多かった"
                            value={feedbacks[category.id]?.notes || ''}
                            onChange={(e) => handleFeedbackChange(category.id, 'notes', e.target.value)}
                            disabled={isSubmitted(category.id)}
                        />
                    </div>

                    <button
                        style={{
                            ...styles.submitButton,
                            ...(isSubmitted(category.id)
                                ? styles.submitted
                                : feedbacks[category.id]?.accuracy
                                    ? styles.submitEnabled
                                    : styles.submitDisabled
                            ),
                        }}
                        onClick={() => handleSubmit(category.id)}
                        disabled={!feedbacks[category.id]?.accuracy || isSubmitted(category.id)}
                    >
                        {isSubmitted(category.id) ? '✓ 送信完了' : '送信する'}
                    </button>
                </div>
            ))}

            <div style={styles.tabNav}>
                <button
                    style={{ ...styles.tabButton, ...styles.tabInactive }}
                    onClick={() => onSwitchTab('advice')}
                >
                    📋 アドバイス
                </button>
                <button
                    style={{ ...styles.tabButton, ...styles.tabActive }}
                >
                    📝 フィードバック
                </button>
            </div>
        </div>
    );
}
