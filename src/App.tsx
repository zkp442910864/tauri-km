import { useEffect, useMemo, useRef } from 'react';
import { Outlet, useRouteError } from 'react-router';
import { useRouter } from './router';

// eslint-disable-next-line @typescript-eslint/unbound-method
const old_split = String.prototype.split;
String.prototype.split = function (...arg) {
    if (!this) return [];
    return old_split.apply(this, arg as Parameters<typeof old_split>);
};

const App = () => {
    // const local = useLocation();
    const page = useRouter();
    const { current: cache, } = useRef({
        title: document.title,
    });

    useEffect(() => {
        document.title = page?.title ?? cache.title;
    }, [page,]);

    return useMemo(() => <Outlet />, []);
};

export default App;