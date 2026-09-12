export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['<rootDir>/test/**/*.test.js'],
  collectCoverageFrom: ['engine.js', 'server.js'],
  coverageProvider: 'v8',
};
