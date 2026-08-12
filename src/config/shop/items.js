export const shopItems = [
    {
        id: 'extra_work',
        name: 'Ca Làm Việc Thêm',
        price: 5000,
        description: 'Cho phép dùng thêm 1 lần lệnh `/work`.',
        type: 'consumable',
        maxQuantity: 5,
cooldown: 86400000,
        effect: {
            type: 'command_boost',
            command: 'work',
            uses: 1
        }
    },
    {
        id: 'bank_upgrade_1',
        name: 'Nâng Cấp Ngân Hàng I',
        price: 15000,
        description: 'Tăng sức chứa ngân hàng, cho phép gửi nhiều tiền hơn.',
        type: 'upgrade',
        maxLevel: 5,
        effect: {
            type: 'bank_capacity',
            multiplier: 1.5
        }
    },
    {
        id: 'diamond_pickaxe',
        name: 'Cúp Kim Cương',
        price: 50000,
        description: 'Tăng sản lượng khai thác `/mine`',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'mining_yield',
            multiplier: 2.0
        }
    },
    {
        id: 'premium_role',
        name: 'Vai Trò Premium Của Máy Chủ',
        price: 15000,
        description: 'Vai trò đặc biệt với màu nổi bật và thưởng hằng ngày +10%.',
        type: 'role',
roleId: null,
        effect: {
            type: 'daily_bonus',
            multiplier: 1.1
        }
    },
    {
        id: 'lucky_clover',
        name: 'Cỏ May Mắn',
        price: 10000,
        description: 'Tăng cơ hội thắng lớn khi đánh bạc `/gamble` một lần.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'gamble_boost',
            multiplier: 1.5,
            uses: 1
        }
    },
    {
        id: 'fishing_rod',
        name: '🎣 Cần Câu',
        price: 5000,
        description: 'Dùng cho lệnh câu cá',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'fishing_yield',
            multiplier: 1.0
        }
    },
    {
        id: 'pickaxe',
        name: '⛏️ Cúp',
        price: 7500,
        description: 'Dùng cho lệnh khai thác',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'mining_yield',
            multiplier: 1.2
        }
    },
    {
        id: 'laptop',
        name: '💻 Laptop',
        price: 15000,
        description: 'Tăng thu nhập khi làm việc',
        type: 'tool',
        durability: 200,
        effect: {
            type: 'work_yield',
            multiplier: 1.5
        }
    },
    {
        id: 'lucky_charm',
        name: '🍀 Bùa May Mắn',
        price: 10000,
        description: 'Tăng vận may khi đánh bạc. Có 3 lượt dùng trước khi bị tiêu hao.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'gamble_boost',
            multiplier: 1.3,
            uses: 3
        }
    },
    {
        id: 'bank_note',
        name: '📜 Trái Phiếu Ngân Hàng',
        price: 25000,
        description: 'Tăng sức chứa ngân hàng thêm 10,000. Có thể mua nhiều lần.',
        type: 'tool',
        durability: null,
        effect: {
            type: 'bank_capacity',
            increase: 10000
        }
    },
    {
        id: 'personal_safe',
        name: '🔒 Két Sắt Cá Nhân',
        price: 30000,
        description: 'Bảo vệ tiền của bạn khỏi trộm cắp. Ngăn người khác trộm bạn.',
        type: 'tool',
        durability: null,
        effect: {
            type: 'robbery_protection',
            protection: true
        }
    }
];

export function getItemById(itemId) {
    return shopItems.find(item => item.id === itemId);
}

export function getItemsByType(type) {
    return shopItems.filter(item => item.type === type);
}

export function getItemPrice(itemId) {
    const item = getItemById(itemId);
    return item ? item.price : 0;
}

export function validatePurchase(itemId, userData) {
    const item = getItemById(itemId);
    if (!item) {
        return { valid: false, reason: 'Không tìm thấy vật phẩm' };
    }

    const inventory = userData.inventory || {};
    const upgrades = userData.upgrades || {};

    if (item.type === 'consumable' && item.maxQuantity) {
        const currentQuantity = inventory[itemId] || 0;
        if (currentQuantity >= item.maxQuantity) {
            return { 
                valid: false, 
                reason: `Bạn chỉ có thể sở hữu tối đa ${item.maxQuantity} ${item.name}` 
            };
        }
    }

    if (item.type === 'upgrade' && item.maxLevel) {
        
        if (upgrades[itemId]) {
            return { 
                valid: false, 
                reason: `Bạn đã mua ${item.name} rồi` 
            };
        }
    }

    if (item.type === 'tool') {
        
        const currentQuantity = inventory[itemId] || 0;
        if (itemId !== 'bank_note' && currentQuantity > 0) {
            return { 
                valid: false, 
                reason: `Bạn đã có ${item.name} rồi` 
            };
        }
    }

    if (item.type === 'role' && item.roleId) {
        if (userData.roles?.includes(item.roleId)) {
            return { 
                valid: false, 
                reason: `Bạn đã có vai trò ${item.name} rồi` 
            };
        }
    }

    return { valid: true };
}