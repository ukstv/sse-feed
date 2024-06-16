type CorsOptions = Pick<RequestInit, "mode" | "credentials">;

export async function connect(endpoint: string, withCredentials: boolean = false, opts?: RequestInit) {
  const origin = globalThis.origin || "";
  const url = new URL(endpoint, origin);
  let corsOptions: CorsOptions;
  if (withCredentials) {
    // If the value of eventSourceInitDict's withCredentials member is true, then set corsAttributeState to Use Credentials
    corsOptions = {
      mode: "cors",
      credentials: "include",
    };
  } else {
    // Let corsAttributeState be Anonymous.
    corsOptions = { mode: "cors", credentials: "same-origin" };
  }
  const response = await fetch(url, {
    ...corsOptions,
    redirect: "follow",
    cache: "no-store",
    headers: {
      Accept: "text/event-stream",
    },
    ...opts,
  });
  return response.body;
}
