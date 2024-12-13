import { useDebounceEffect, useStateExtend } from '@/hooks';
import { Splitter } from 'antd';
import { FC, ReactNode, useEffect, useRef } from 'react';

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
