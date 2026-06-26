module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        allowImportingTsExtensions: false,
      },
      diagnostics: false,
    }]
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)'],
  modulePathIgnorePatterns: [
    '<rootDir>/.agent/',
    '<rootDir>/.claude/',
    '<rootDir>/playwright_profile/',
    '<rootDir>/temp_skills/',
    '<rootDir>/dist/'
  ],
  roots: ['<rootDir>'],
  setupFiles: ['<rootDir>/jest.setup.cjs'],
};
