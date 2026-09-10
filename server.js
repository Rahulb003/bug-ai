import app from "./server/app.js";
import { ensureDatabase } from "./server/models/database.js";

const PORT = Number(process.env.PORT || 8080);

await ensureDatabase();

app.listen(PORT, () => {
  console.log(`BUG AI server running on http://127.0.0.1:${PORT}`);
});
