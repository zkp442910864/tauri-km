# tauri-km

- [文档](https://v2.tauri.app/zh-cn/start/frontend/)
- 解决跨域
    - [禁用csp,会导致ipc通信失败](https://github.com/tauri-apps/tauri-docs/issues/26#issuecomment-1909861413)
    - [通过rust转发请求](https://v2.tauri.app/plugin/http-client/#rust)
- [headless-chrome](https://github.com/rust-headless-chrome/rust-headless-chrome)
- [tokio框架](https://rust-book.junmajinlong.com/ch100/01_understand_tokio_runtime.html)
    - 项目中用于新启一个阻塞线程

- 架构
    - TAO 负责 Tauri 窗口的创建<https://v2.tauri.app/concept/architecture/#tao>
    - WRY 负责 Web 视图的渲染<https://v2.tauri.app/concept/architecture/#wry>

- 功能
    - 半自动处理 chonchow
    1. 获取亚马逊所有sku
    2. 获取所有shopify sku
    3. 数据对比
        1. 遍历出新增的(以亚马逊sku为主进行遍历,匹配shopify,匹配不上的就是新增)
        2. 遍历出删除的(以shopify的sku为主进行遍历,匹配亚马逊sku,匹配不到的就是删除)
        3. 遍历出修改的(需要请求html进行爬取)(以shopify的sku为主进行遍历,匹配亚马逊的商品详情,主要以 商品价格, 商品描述,商品规格,商品详情json, 库存不足? 不一致)
    4. 列出 新增 删除 修改 的数据

        ```ts
            interface IData {
                type: 'add' | 'update' | 'remove';
                shopifyUrl: string;
                amazonUrl: string;
                updateType?: Array<'price' | 'description' | 'specification' | 'detailJSON' | 'inventory'>;
            }
        ```

    5. 后续考虑做出直接自动化 新增,修改,删除
