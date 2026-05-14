require('dotenv').config({ path: '.env.test', override: true });

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
  /** Pool + Postgres client can briefly outlive Jest; matches unit-test CI runner. */
  forceExit: true,
};
