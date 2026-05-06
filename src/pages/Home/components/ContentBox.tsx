import { useDebounceEffect, useStateExtend } from '@/hooks';
import { FC, ReactNode, useRef } from 'react';

/**
 * 内容区域容器组件 —— 自动计算可用高度，撑满视口。
 *
 * 通过 `getBoundingClientRect().top` 计算组件顶部偏移，
 * 使用 `calc(100vh - top)` 设置高度，确保内容区域不超出视口。
 * 内边距默认 20px。
 *
 * @param children - 子内容
 */
export const ContentBox: FC<{children: ReactNode}> = ({ children, }) => {

    const [, update,] = useStateExtend({});
    const div_ref = useRef<HTMLDivElement>(null);
    const { current: state, } = useRef({
        top_height: '0px',
        inline_padding: 20,
    });

    useDebounceEffect(() => {
        state.top_height = `${(div_ref.current?.getBoundingClientRect().top ?? 0) + state.inline_padding * 2}px`;
        // console.log(state.top_height);

        void update({});
    }, []);


    return (
        <div ref={div_ref} style={{ height: `calc(100vh - ${state.top_height})`, padding: state.inline_padding, }}>
            {/* <Splitter
                layout="vertical"
                className="un-w-100% un-h-100%"
                style={{ boxShadow: '0 0 10px rgba(0, 0, 0, 0.1)', }}
            >
                {
                    child_list.map(item => <Splitter.Panel key={item.key}>{item.el}</Splitter.Panel>)
                }
            </Splitter> */}
            {children}
        </div>
    );
};
