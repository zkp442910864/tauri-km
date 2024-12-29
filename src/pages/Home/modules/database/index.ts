import { log_error } from '@/utils';
import { AmazonProduct } from './amazon_product';
import { init_database_raw } from './base';
import { ShopifyProduct } from './shopify_product';

export { DB_NAME } from './base';

export const table = {
    shopify_product: ShopifyProduct.get_instance(),
    amazon_product: AmazonProduct.get_instance(),
};

export const init_database = async () => {
    await log_error.capture_error(async () => {
        await init_database_raw();
        await Promise.all(Object.values(table).map(ii => ii.create_table()));
        log_error.push_log('数据库链接成功');
    });
};

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

