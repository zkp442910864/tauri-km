import { useEffect } from 'react';
import { useStateExtend } from './useStateExtend';

export const useCacheValue = <S, >(key: string, valOrFn: S | (() => S)) => {
    const [state, setState,] = useStateExtend(valOrFn);

    const newSetState: typeof setState = async (unknownVal) => {
        const val = typeof unknownVal === 'function' ? (unknownVal as (data: S) => S)(state) : unknownVal;

        window.localStorage.setItem(key, JSON.stringify(val))!;

        await setState(val);
    };

    useEffect(() => {
        try {
            const val = window.localStorage.getItem(key)!;
            if (val) {
                void setState(JSON.parse(val) as S);
            }
        }
        catch (_) {
            //
        }
    }, []);

    return [state, newSetState,]as [S, typeof newSetState];
};
