import { redirect } from "next/navigation";
import { getSignUpUrl } from "@workos-inc/authkit-nextjs";

export async function GET(request: Request) {
  const redirectUri = new URL("/callback", request.url).toString();
  const authorizationUrl = await getSignUpUrl({ redirectUri });
  return redirect(authorizationUrl);
}
