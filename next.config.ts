import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// Phone testing: the dev server only serves its scripts to origins it trusts,
// so a phone opening http://<this PC's address>:3000 would get a page that
// doesn't respond. Trust this PC's own network addresses, read fresh at
// start-up because they change (DHCP). Development only.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => a!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanAddresses,
};

export default nextConfig;
