import { redirect } from "next/navigation";
import { getSignInUrl } from "@workos-inc/authkit-nextjs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const loginHint = searchParams.get("email") ?? undefined;
  const authorizationUrl = await getSignInUrl({ loginHint });
  return redirect(authorizationUrl);
}
