import next from "eslint-config-next";

/**
 * `pnpm lint` previously dropped into next lint's interactive setup prompt and
 * failed, because ESLint was never actually configured — a command that
 * advertised a check it never ran.
 *
 * Deliberately just Next's own set: the point is catching real mistakes
 * (unused variables, bad hook dependencies, broken image/link usage), not
 * imposing a style layer on a codebase that doesn't have one.
 */
const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...next,
];

export default config;
