module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)'],
  modulePathIgnorePatterns: [
    '<rootDir>/.agent/',
    '<rootDir>/temp_skills/',
    '<rootDir>/dist/'
  ],
};
