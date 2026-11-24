import { redirect } from "next/navigation";

// v3 is the app now; v2 stays reachable at /v2.
export default function Home() {
  redirect("/trip/live");
}
