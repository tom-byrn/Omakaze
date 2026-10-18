import { redirect } from "next/navigation";

/** /welcome → the landing page, for signed-in users too. */
export default function WelcomeRedirect() {
  redirect("/");
}
