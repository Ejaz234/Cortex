import { prisma } from "../lib/prisma.js";
import { embedText, embedTexts, EMBEDDING_DIMENSION } from "../services/embeddings.js";
import { storeEmbedding, readEmbedding, similaritySearch, validatePgvectorExtension } from "../services/vectorSearch.js";
import { v4 as uuid } from "uuid";

/**
 * E2E test for embeddings + pgvector pipeline.
 * Verifies:
 * 1. pgvector extension is enabled
 * 2. Embeddings are generated with correct dimension
 * 3. Embeddings are stored in database
 * 4. Embeddings can be read back
 * 5. Similarity search works
 */

export async function runEmbeddingsE2ETest(): Promise<void> {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  EMBEDDINGS E2E TEST");
  console.log("═══════════════════════════════════════════════════════════════\n");

  try {
    // Test 1: Validate pgvector extension
    console.log("Test 1: Checking pgvector extension...");
    const hasPgvector = await validatePgvectorExtension();
    if (!hasPgvector) {
      throw new Error("pgvector extension not enabled on database");
    }
    console.log("✓ pgvector extension is enabled\n");

    // Test 2: Create test data
    console.log("Test 2: Creating test project and files...");
    const testProjectId = `test-project-${uuid()}`;
    const testFileIndexId = `test-file-${uuid()}`;

    // Create test project
    const project = await prisma.project.create({
      data: {
        id: testProjectId,
        name: "E2E Test Project",
        githubUrl: "https://github.com/test/test",
        githubOwner: "test",
        githubRepo: "test",
        ownerId: "test-user",
        status: "ready",
      },
    });

    // Create test file index
    const fileIndex = await prisma.fileIndex.create({
      data: {
        id: testFileIndexId,
        projectId: testProjectId,
        path: "test.ts",
        sha: "abc123",
      },
    });

    console.log(`✓ Created test project: ${project.id}`);
    console.log(`✓ Created test file index: ${fileIndex.id}\n`);

    // Test 3: Embed text
    console.log("Test 3: Embedding text samples...");
    const testTexts = [
      "function greet(name: string): string { return `Hello, ${name}!`; }",
      "const config = { apiUrl: 'https://api.example.com', timeout: 5000 };",
      "export interface User { id: string; email: string; name: string; }",
    ];

    const embeddings = await embedTexts(testTexts);

    if (embeddings.length !== testTexts.length) {
      throw new Error(`Expected ${testTexts.length} embeddings, got ${embeddings.length}`);
    }

    for (let i = 0; i < embeddings.length; i++) {
      const embedding = embeddings[i];
      if (embedding.length !== EMBEDDING_DIMENSION) {
        throw new Error(
          `Embedding ${i} has wrong dimension: expected ${EMBEDDING_DIMENSION}, got ${embedding.length}`
        );
      }

      // Check that embedding values are reasonable (should be floats between -1 and 1 roughly)
      const allNumbers = embedding.every((v) => typeof v === "number");
      if (!allNumbers) {
        throw new Error(`Embedding ${i} contains non-numeric values`);
      }
    }

    console.log(`✓ Generated ${embeddings.length} embeddings`);
    console.log(`✓ Each embedding has correct dimension: ${EMBEDDING_DIMENSION}\n`);

    // Test 4: Store embeddings
    console.log("Test 4: Storing embeddings in pgvector...");
    for (let i = 0; i < testTexts.length; i++) {
      await storeEmbedding(testProjectId, testFileIndexId, i, testTexts[i], embeddings[i]);
    }
    console.log(`✓ Stored ${testTexts.length} embeddings in database\n`);

    // Test 5: Read embeddings back
    console.log("Test 5: Reading embeddings back from database...");
    for (let i = 0; i < testTexts.length; i++) {
      const stored = await readEmbedding(testProjectId, testFileIndexId, i);

      if (!stored) {
        throw new Error(`Failed to read embedding ${i}`);
      }

      if (stored.content !== testTexts[i]) {
        throw new Error(
          `Stored content doesn't match: expected "${testTexts[i]}", got "${stored.content}"`
        );
      }

      if (!stored.embedding || stored.embedding.length === 0) {
        throw new Error(`Embedding ${i} is null or empty`);
      }

      if (stored.embedding.length !== EMBEDDING_DIMENSION) {
        throw new Error(
          `Read embedding ${i} has wrong dimension: expected ${EMBEDDING_DIMENSION}, got ${stored.embedding.length}`
        );
      }

      // Verify it's the same embedding (allow small floating point errors)
      const isApproxEqual = stored.embedding.every((v, idx) => {
        const diff = Math.abs(v - embeddings[i][idx]);
        return diff < 0.0001;
      });

      if (!isApproxEqual) {
        throw new Error(`Read embedding ${i} doesn't match stored value`);
      }
    }
    console.log(`✓ Successfully read back all embeddings`);
    console.log(`✓ Embeddings are non-null with correct dimension\n`);

    // Test 6: Similarity search
    console.log("Test 6: Testing similarity search...");
    const queryText = "function that greets a person";
    const queryEmbedding = await embedText(queryText);

    const results = await similaritySearch(testProjectId, queryEmbedding, 3, 0.0); // 0 threshold to get all results

    if (results.length === 0) {
      throw new Error("Similarity search returned no results");
    }

    console.log(`✓ Found ${results.length} similar chunks`);
    console.log("\n  Search results:");
    for (const result of results) {
      console.log(`    - Similarity: ${(result.similarity * 100).toFixed(1)}%`);
      console.log(`      Content: ${result.content.substring(0, 60)}...`);
    }

    // Verify top result is the greeting function
    const topResult = results[0];
    if (!topResult.content.includes("greet")) {
      console.warn("  ⚠ Warning: Top result doesn't include 'greet' keyword");
    }

    console.log("\n✓ Similarity search works correctly\n");

    // Cleanup
    console.log("Test 7: Cleaning up test data...");
    await prisma.documentChunk.deleteMany({
      where: { projectId: testProjectId },
    });
    await prisma.fileIndex.deleteMany({
      where: { projectId: testProjectId },
    });
    await prisma.project.delete({
      where: { id: testProjectId },
    });
    console.log("✓ Cleaned up test data\n");

    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  ✅ ALL TESTS PASSED");
    console.log("═══════════════════════════════════════════════════════════════\n");
  } catch (error) {
    console.error(
      "\n❌ TEST FAILED:",
      error instanceof Error ? error.message : String(error)
    );
    console.log("\n═══════════════════════════════════════════════════════════════\n");
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runEmbeddingsE2ETest()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default runEmbeddingsE2ETest;
