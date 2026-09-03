const cloudflareMock = new URL("./cloudflare-workers-mock.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: cloudflareMock, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    return {
      url: new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
