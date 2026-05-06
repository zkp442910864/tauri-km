import { log_error } from '@/utils';
import { AmazonProduct } from './amazon_product';
import { init_database_raw } from './base';
import { ShopifyProduct } from './shopify_product';

export { DB_NAME } from './base';

/**
 * 数据库表实例注册表。
 *
 * 通过单例模式获取每个表的实例，统一管理所有数据库表的访问入口。
 * - `shopify_product` —— Shopify 产品数据表
 * - `amazon_product` —— Amazon 产品数据表
 */
export const table = {
    shopify_product: ShopifyProduct.get_instance(),
    amazon_product: AmazonProduct.get_instance(),
};

/**
 * 初始化数据库 —— 建立连接并创建所有表。
 * 应用启动时调用一次，失败时自动记录错误到日志系统。
 */
export const init_database = async () => {
    await log_error.capture_error(async () => {
        await init_database_raw();
        await Promise.all(Object.values(table).map(ii => ii.create_table()));
        log_error.push_log('数据库链接成功');
    });
};

/**
 * 重置数据库 —— 删除所有表并重新创建。
 * 用于数据清理或表结构变更后的重建。
 */
export const reset_database = async () => {
    try {
        await Promise.all(Object.values(table).map(ii => ii.reset_table()));
        log_error.push_log('重置数据库成功');
    }
    catch (error) {
        const key = log_error.save_error(error);
        log_error.push_log(`重置数据库失败: ${key}`, { error: true, });
    }
};

