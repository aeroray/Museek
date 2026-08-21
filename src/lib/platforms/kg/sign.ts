import * as md5Lib from "js-md5";

/**
 * KuGou request signature — lx-music kg/util.js `signatureParams`.
 * Default platform is android (comment APIs); playlist calls pass `"web"` explicitly.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const md5 = ((md5Lib as any).default ?? md5Lib) as (str: string) => string;

const KG_WEB_KEY = "NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt";
const KG_ANDROID_KEY = "OIlwieks28dk2k092lksi2UIkp";

export function signatureParams(
  params: string,
  platform: "web" | "android" = "android",
  body = "",
): string {
  const key = platform === "web" ? KG_WEB_KEY : KG_ANDROID_KEY;
  const sorted = params.split("&").sort().join("");
  return md5(`${key}${sorted}${body}${key}`);
}
