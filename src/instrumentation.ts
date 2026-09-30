export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { configureServerFonts } = await import("./server-fonts");
    configureServerFonts();
  }
}
