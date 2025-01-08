import globals from 'globals';
import eslintJs from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tsEslint from 'typescript-eslint';
import { cwd } from 'process';
// import path from 'path';


export default tsEslint.config(
    {
        ignores: ['dist', 'index.html', 'src-tauri', 'build',],
    },
    {
        files: ['**/*.ts', '**/*.tsx',],
        extends: [
            eslintJs.configs.recommended,
            ...tsEslint.configs.recommendedTypeCheckedOnly,
        ],
    },
    {
        extends: [
            eslintJs.configs.recommended,
            ...tsEslint.configs.recommended,
        ],
        languageOptions: {
            parserOptions: {
                project: './tsconfig.json',
                // projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
            ecmaVersion: 'latest',
            globals: globals.browser,
            parser: tsEslint.parser,
        },
        plugins: {
            '@typescript-eslint': tsEslint.plugin,
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            // https://eslint.org/play/
            ...reactHooks.configs.recommended.rules,
            'react-refresh/only-export-components': [
                'warn',
                { allowConstantExport: true, },
            ],
            indent: ['error', 4, {
                SwitchCase: 1,
                ignoredNodes: ['TemplateLiteral',],
            },],
            semi: [2, 'always',],
            'comma-dangle': [
                'error', {
                    arrays: 'always',
                    objects: 'always',
                    imports: 'never',
                    exports: 'never',
                    functions: 'never',
                },
            ],
            'comma-spacing': 1,
            'no-trailing-spaces': 1,
            quotes: ['error', 'single',],
            'quote-props': [1, 'as-needed',],
            'no-multi-spaces': [1,],
            'key-spacing': [1,],
            'object-curly-spacing': [2, 'always',],
            'no-extra-parens': [1,],
            'space-infix-ops': ['error', { int32Hint: false, },],
            'space-before-blocks': [1,],
            'keyword-spacing': 1,
            'brace-style': [1, 'stroustrup',],
            'space-before-function-paren': [1, { anonymous: 'always', named: 'never', asyncArrow: 'always', },],
            '@typescript-eslint/no-unused-expressions': 0,
            'react-hooks/exhaustive-deps': 0,
            '@typescript-eslint/no-unused-vars': [
                1,
                {
                    args: 'all',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                },
            ],
        },
    }
);
