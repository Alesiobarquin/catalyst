import nextVitals from "eslint-config-next/core-web-vitals";

const config = [...nextVitals, { ignores: ["**/.next/**", "**/out/**"] }];

export default config;
