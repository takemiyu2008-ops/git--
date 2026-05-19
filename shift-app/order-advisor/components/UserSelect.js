'use client';

import { categories } from '@/data/categories';

/**
 * 担当者選択画面コンポーネント
 */
export default function UserSelect({ staff, onSelect }) {
    const styles = {
        container: {
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
        },
        title: {
            fontSize: '28px',
            fontWeight: 'bold',
            color: '#fff',
            marginBottom: '10px',
            textAlign: 'center',
        },
        subtitle: {
            fontSize: '14px',
            color: '#94a3b8',
            marginBottom: '40px',
            textAlign: 'center',
        },
        staffGrid: {
            display: 'grid',
            gap: '16px',
            width: '100%',
            maxWidth: '400px',
        },
        staffCard: {
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(10px)',
            borderRadius: '16px',
            padding: '20px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            border: '1px solid rgba(255, 255, 255, 0.1)',
        },
        staffName: {
            fontSize: '20px',
            fontWeight: '600',
            color: '#fff',
            marginBottom: '12px',
        },
        categoryList: {
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
        },
        categoryBadge: {
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '12px',
            color: '#fff',
        },
    };

    const getCategoryInfo = (categoryId) => {
        return categories.find(c => c.id === categoryId);
    };

    return (
        <div style={styles.container}>
            <h1 style={styles.title}>🛒 発注アドバイザー</h1>
            <p style={styles.subtitle}>担当者を選択してください</p>

            <div style={styles.staffGrid}>
                {staff.map((person) => (
                    <div
                        key={person.id}
                        style={styles.staffCard}
                        onClick={() => onSelect(person)}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-4px)';
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }}
                    >
                        <div style={styles.staffName}>{person.name}</div>
                        <div style={styles.categoryList}>
                            {person.categories.map((catId) => {
                                const cat = getCategoryInfo(catId);
                                return (
                                    <span
                                        key={catId}
                                        style={{
                                            ...styles.categoryBadge,
                                            background: `${cat.color}33`,
                                            border: `1px solid ${cat.color}`,
                                        }}
                                    >
                                        {cat.icon} {cat.name}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
