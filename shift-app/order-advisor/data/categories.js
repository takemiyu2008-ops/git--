// 発注カテゴリ
export const orderCategories = [
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
  { id: 'bread', name: '調理パン', icon: '🥪', items: ['サンドイッチ', 'ロール類', 'ブリトー'], color: '#EAB308' },
  { id: 'processed', name: '加工食品（調味料類、珍味）', icon: '🫙', items: ['調味料', '珍味'], color: '#A855F7' },
  { id: 'sweetsChoco', name: 'お菓子（チョコレート、和菓子類）', icon: '🍫', items: ['チョコレート', '和菓子'], color: '#EC4899' },
  { id: 'dessert', name: 'デザート', icon: '🍰', items: ['チルド用生菓子', 'ヨーグルト', 'ゼリー類'], color: '#F472B6' },
  { id: 'sweetsGummy', name: 'お菓子（グミ、駄菓子、飴類）', icon: '🍬', items: ['グミ', '駄菓子', '飴類'], color: '#FB7185' },
  { id: 'sweetsSnack', name: 'お菓子（ポテトチップス、箱スナック、米菓）', icon: '🍿', items: ['ポテトチップス', '箱スナック', '米菓'], color: '#FDBA74' },
];

// adviceLogic.js 用のエイリアス
export const categories = orderCategories;