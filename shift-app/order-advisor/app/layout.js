import './globals.css';

export const metadata = {
    title: '発注アドバイザー',
    description: 'コンビニエンスストア向け発注アドバイスアプリ',
    viewport: 'width=device-width, initial-scale=1',
};

export default function RootLayout({ children }) {
    return (
        <html lang="ja">
            <head>
                <meta name="theme-color" content="#1a1a2e" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
            </head>
            <body>{children}</body>
        </html>
    );
}
