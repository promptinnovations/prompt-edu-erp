import { redirect } from "next/navigation";
import { getRequestContext } from "../services/request-context";

export default async function Home() {
  const ctx = await getRequestContext();
  redirect(ctx ? "/dashboard" : "/login");
}
