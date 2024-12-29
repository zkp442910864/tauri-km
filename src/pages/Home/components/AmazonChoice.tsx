import { useDebounceEffect, useStateExtend } from '@/hooks';
import { Card, Image, List, Typography } from 'antd';
import { createRoot } from 'react-dom/client';
import { table } from '../modules/database';
import { open } from '@tauri-apps/plugin-shell';

const AmazonChoice = () => {

    const [result, set_result,] = useStateExtend<Awaited<ReturnType<typeof table.amazon_product.get_choice_data>>>([]);

    const get_data = async () => {
        const arr = await table.amazon_product.get_choice_data();

        void set_result(arr);
    };

    useDebounceEffect(() => {
        void get_data();
    }, []);

    return (
        <div className="p-10">
            <List
                grid={{ gutter: 10, column: 4, }}
                dataSource={result}
                renderItem={(item) =>
                    <List.Item>
                        <Card className="rel" size="small">
                            <Image src={item.first_image} preview={false} wrapperClassName="un-block" className="un-max-h80px un-object-contain" />
                            <Typography.Paragraph ellipsis copyable title={item.title}>{item.title}</Typography.Paragraph>
                            <Typography.Paragraph ellipsis copyable title={item.model}>{item.model}</Typography.Paragraph>
                            <Typography.Paragraph className="un-m-0!" ellipsis copyable title={item.sku}>{item.sku}</Typography.Paragraph>
                            <div
                                className="i-devicon:amazonwebservices-wordmark un-text-20px un-cursor-pointer abs un-bottom-12px un-right-12px"
                                title="打开链接"
                                onClick={() => void open(item.url!)}
                            ></div>
                        </Card>
                    </List.Item>
                }
            />
        </div>
    );
};

export const amazon_choice_fn = () => {
    const { promise, resolve, reject, } = Promise.withResolvers<boolean>();
    const dom_id = `modal-${Date.now()}`;
    let render: ReturnType<typeof createRoot>;

    const win_number = window.layer.open({
        type: 1, // page 层类型
        area: ['80%', '80%',],
        title: '亚马逊精选产品',
        shadeClose: false, // 点击遮罩区域，关闭弹层
        maxmin: true, // 允许全屏最小化
        anim: 0, // 0-6 的动画形式，-1 不开启
        shade: 0,
        content: `<div id="${dom_id}"></div>`,
        success: (layero, index) => {
            const div = document.querySelector('#' + dom_id)!;
            render = createRoot(div);
            render.render(
                <AmazonChoice
                />
            );
        },
        yes: () => {},
        end: () => {
            resolve(false);
            render.unmount();
        },
    });
    // window.layer.close(win_number);

    return promise;
};
