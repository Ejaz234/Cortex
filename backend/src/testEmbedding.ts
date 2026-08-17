import { embedText } from "./services/embeddings.js";

async function test() {
  try {
    const embedding = await embedText(
      "Hello, this is a test sentence."
    );

    console.log("SUCCESS");
    console.log("Dimensions:", embedding.length);
    console.log("First 5 values:", embedding.slice(0, 5));
  } catch (error) {
    console.error("FAILED:", error);
  }
}

test();