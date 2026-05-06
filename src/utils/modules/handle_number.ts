/**
 * 安全的数字转换工具。
 *
 * 将任意值转为数字类型，NaN 或 undefined 返回 0。
 * 常用于从 DOM / API 获取的字符串价格、数量等字段的转换。
 *
 * @param val - 待转换的字符串或数字
 * @returns 转换后的数字，NaN 时返回 0
 *
 * @example
 * ```ts
 * handle_number('$12.99')  // 12.99（需先用正则提取数字部分）
 * handle_number(undefined) // 0
 * handle_number('abc')     // 0
 * handle_number(42)        // 42
 * ```
 */
export const handle_number = (val?: string | number) => {
    const inline_val = +(val ?? 0);
    if (Number.isNaN(val)) {
        return 0;
    }

    return inline_val;
};
