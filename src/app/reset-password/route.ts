import { redirect } from "next/navigation";
import { getSignInUrl } from "@workos-inc/authkit-nextjs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectUri = new URL("/callback", request.url).toString();
  const loginHint = searchParams.get("email") ?? undefined;
  const authorizationUrl = await getSignInUrl({ loginHint, redirectUri });
  return redirect(authorizationUrl);
}
