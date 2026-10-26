import type { NextConfig } from "next";

// Lets phones on the same Wi-Fi open the dev server (http://192.168.x.x:3001).
export default { allowedDevOrigins: ["192.168.*.*"] } satisfies NextConfig;
