import type { Config } from "jest";

const config: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", {
      tsconfig: {
        jsx: "react-jsx",
        esModuleInterop: true,
      },
    }],
  },
  moduleNameMapper: {
    "^~/(.*)$": "<rootDir>/src/$1",
    "^@acme/ui(.*)$": "<rootDir>/../../packages/ui/src$1",
    "^@acme/db(.*)$": "<rootDir>/../../packages/db/src$1",
    "^@acme/engine(.*)$": "<rootDir>/../../packages/engine/src$1",
    "\\.(css|less|scss|sass)$": "<rootDir>/__mocks__/styleMock.js",
  },
  testMatch: [
    "<rootDir>/src/**/__tests__/**/*.{ts,tsx}",
    "<rootDir>/src/**/*.test.{ts,tsx}",
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/layout.tsx",
    "!src/**/page.tsx",
  ],
};

export default config;
