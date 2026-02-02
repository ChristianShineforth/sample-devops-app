import Fastify from "fastify";

const app = Fastify();
let counter = 0;

app.get("/health", async () => {
  return { status: "ok" };
});

app.get("/api/count", async () => {
  counter++;
  return { count: counter };
});

const port = process.env.PORT || 3000;
app.listen({ port, host: "0.0.0.0" }, () => {
  console.log(`API running on port ${port}`);
});
