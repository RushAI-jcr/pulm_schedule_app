import { redirect } from "next/navigation";
import { getSignInUrl } from "@workos-inc/authkit-nextjs";

export async function GET(request: Request) {
  const redirectUri = new URL("/callback", request.url).toString();
  const authorizationUrl = await getSignInUrl({ redirectUri });
  return redirect(authorizationUrl);
}
