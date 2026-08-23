// @ts-check
import { defineConfig } from 'astro/config';

const [githubOwner, githubRepository] = (process.env.GITHUB_REPOSITORY || "").split("/");
const isUserSite = githubRepository?.toLowerCase() === `${githubOwner?.toLowerCase()}.github.io`;

const site = process.env.SITE_URL || (githubOwner ? `https://${githubOwner}.github.io` : undefined);
const inferredBase = githubRepository && !isUserSite ? `/${githubRepository}` : undefined;
const requestedBase = process.env.BASE_PATH;
const base = requestedBase === "/" ? undefined : (requestedBase || inferredBase);

export default defineConfig({
  ...(site ? { site } : {}),
  ...(base ? { base } : {}),
});
