import { shopItems, getItemById, getItemsByType, getItemPrice, validatePurchase } from './items.js';
import { botConfig } from '../bot.js';

const { currency } = botConfig.economy;

export const shopConfig = {
    name: 'Cửa Hàng TitanBot',
    currency: currency.name,
    currencyName: currency.name,
    currencyNamePlural: currency.namePlural || `${currency.name}s`,
    currencySymbol: currency.symbol || '💵',
    
    categories: [
        {
            id: 'consumables',
            name: 'Vật Phẩm Tiêu Hao',
            description: 'Vật phẩm dùng một lần mang lại lợi ích tạm thời',
            icon: '🍯',
            itemTypes: ['consumable']
        },
        {
            id: 'upgrades',
            name: 'Nâng Cấp',
            description: 'Nâng cấp vĩnh viễn giúp tăng cường khả năng của bạn',
            icon: '⚡',
            itemTypes: ['upgrade']
        },
        {
            id: 'tools',
            name: 'Công Cụ',
            description: 'Trang bị giúp thu thập tài nguyên hiệu quả hơn',
            icon: '⛏️',
            itemTypes: ['tool']
        },
        {
            id: 'roles',
            name: 'Vai Trò',
            description: 'Vai trò đặc biệt với các đặc quyền riêng',
            icon: '🎭',
            itemTypes: ['role']
        }
    ],
    
    transaction: {
cooldown: 1000,
maxQuantity: 10,
confirmTimeout: 30000,
        
        refundPolicy: {
            enabled: true,
window: 300000,
fee: 0.1
        }
    },
    
    ui: {
        itemsPerPage: 5,
        showOutOfStock: true,
        showOwnedItems: true,
        showAffordability: true,
        
        colors: {
primary: '#5865F2',
success: '#43B581',
error: '#F04747',
warning: '#FAA61A',
info: '#00B0F4',
            
            rarity: {
common: '#99AAB5',
uncommon: '#2ECC71',
rare: '#3498DB',
epic: '#9B59B6',
legendary: '#F1C40F',
mythic: '#E74C3C'
            }
        },
        
        emojis: {
            currency: '🪙',
            quantity: '✖️',
            price: '💵',
            owned: '✅',
            outOfStock: '❌',
            
            types: {
                consumable: '🍯',
                upgrade: '⚡',
                tool: '⛏️',
                role: '🎭'
            }
        }
    },
    
    events: {
        restock: {
            enabled: true,
interval: 86400000,
announcementChannel: null,
            message: '🛒 **Cửa Hàng Đã Bổ Sung!** Có vật phẩm mới rồi đây!'
        },
        
        sales: {
            enabled: true,
            schedule: [
                {
day: 0,
discount: 0.2,
                    message: '🔥 **Giảm Giá Cuối Tuần!** Giảm 20% tất cả vật phẩm!'
                },
            ]
        }
    }
};

export {
    shopItems,
    getItemById,
    getItemsByType,
    getItemPrice,
    validatePurchase
};

export function getCurrentPrice(itemId, { quantity = 1, userData = null } = {}) {
    const basePrice = getItemPrice(itemId) * quantity;
    
    let discount = 0;
    
    const now = new Date();
    if (shopConfig.events.sales.enabled) {
        const today = now.getDay();
        const sale = shopConfig.events.sales.schedule.find(s => s.day === today);
        if (sale) {
            discount += sale.discount;
        }
    }
    
    if (userData) {
        if (userData.roles?.includes('premium')) {
            discount += 0.1;
        }
        
        if (quantity >= 10) {
discount += 0.1;
        }
    }
    
    discount = Math.max(0, Math.min(1, discount));
    
    return Math.floor(basePrice * (1 - discount));
}

export function getCategoryForItem(itemType) {
    return shopConfig.categories.find(cat => 
        cat.itemTypes.includes(itemType)
    ) || {
        id: 'other',
        name: 'Khác',
        description: 'Các vật phẩm khác',
        icon: '📦'
    };
}

export function getItemsInCategory(categoryId) {
    const category = shopConfig.categories.find(cat => cat.id === categoryId);
    if (!category) return [];
    
    return shopItems.filter(item => 
        category.itemTypes.includes(item.type)
    );
}