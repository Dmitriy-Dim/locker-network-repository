/** @type {import('jest').Config} */
const config = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',

    setupFiles: ['<rootDir>/src/__mocks__/textEncoderPolyfill.js'],
    setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],

    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

    transform: {
        '^.+\\.(ts|tsx)$': [
            'ts-jest',
            {
                tsconfig: '<rootDir>/tsconfig.spec.json'
            }
        ]
    },

    moduleNameMapper: {
        '\\.(css|scss|sass)$': 'identity-obj-proxy',
        '\\.(png|jpg|svg|gif)$': '<rootDir>/src/__mocks__/fileMock.ts',
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },

    testMatch: [
        '<rootDir>/src/**/__tests__/**/*.{ts,tsx}',
        '<rootDir>/src/**/*.{test,spec}.{ts,tsx}'
    ]
};

module.exports = config;