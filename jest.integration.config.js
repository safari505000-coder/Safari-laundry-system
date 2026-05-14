module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['**/*.integration-spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  setupFiles: ['<rootDir>/src/test/setup/jest-node-env.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup/test-db.ts'],
  testTimeout: 30000,
};
