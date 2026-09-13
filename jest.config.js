/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  moduleFileExtensions: ["ts", "tsx", "js", "json", "node"],
  watchman: false,
  testMatch: ["<rootDir>/src/__tests__/**/*.test.ts", "<rootDir>/functions/src/__tests__/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "chatWithCoach", "groqService", "validation.test"],
  transform: {
    "^.+\\.[tj]sx?$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.test.json",
      },
    ],
  },
  transformIgnorePatterns: ["node_modules/(?!(jose)/)"],
};
