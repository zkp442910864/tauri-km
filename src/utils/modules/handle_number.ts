export const handle_number = (val?: string | number) => {
    const inline_val = +(val ?? 0);
    if (Number.isNaN(val)) {
        return 0;
    }

    return inline_val;
};