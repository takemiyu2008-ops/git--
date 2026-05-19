'use client';

import { useState, useEffect } from 'react';
import UserSelect from '@/components/UserSelect';
import AdviceTab from '@/components/AdviceTab';
import FeedbackTab from '@/components/FeedbackTab';
import { staff } from '@/data/staff';
import { generateWeatherData } from '@/data/weather';

/**
 * メインページコンポーネント
 * 状態管理と画面切替を担当
 */
export default function Home() {
    const [selectedUser, setSelectedUser] = useState(null);
    const [currentTab, setCurrentTab] = useState('advice');
    const [weatherData, setWeatherData] = useState([]);

    useEffect(() => {
        // 天気データを生成
        const weather = generateWeatherData();
        setWeatherData(weather);
    }, []);

    // 担当者選択
    const handleUserSelect = (user) => {
        setSelectedUser(user);
        setCurrentTab('advice');
    };

    // 担当者切替（選択画面に戻る）
    const handleSwitchUser = () => {
        setSelectedUser(null);
    };

    // タブ切替
    const handleSwitchTab = (tab) => {
        setCurrentTab(tab);
    };

    // 担当者未選択時：選択画面
    if (!selectedUser) {
        return (
            <UserSelect
                staff={staff}
                onSelect={handleUserSelect}
            />
        );
    }

    // アドバイス画面
    if (currentTab === 'advice') {
        return (
            <AdviceTab
                user={selectedUser}
                weatherData={weatherData}
                onSwitchUser={handleSwitchUser}
                onSwitchTab={handleSwitchTab}
            />
        );
    }

    // フィードバック画面
    return (
        <FeedbackTab
            user={selectedUser}
            onSwitchTab={handleSwitchTab}
        />
    );
}
