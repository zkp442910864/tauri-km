import { useDebounceEffect } from '@/hooks';
import { Loading } from '@/layout';
import { FC, ReactNode, useEffect, useRef, useState } from 'react';

export const AwaitComponent: FC<{children: ReactNode, promise: Promise<unknown>}> = ({
    children,
    promise,
}) => {
    const loading = useRef(true);
    const [, update,] = useState({});

    useDebounceEffect(() => {
        loading.current = true;

        void promise.then(() => {
            loading.current = false;
            update({});
        });

    }, [promise,]);

    if (loading.current) {
        return <Loading/>;
    }

    return children;
};
