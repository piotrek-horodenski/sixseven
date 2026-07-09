import { boot } from "./app/app";

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("games failed to boot", err);
  process.exit(1);
});
