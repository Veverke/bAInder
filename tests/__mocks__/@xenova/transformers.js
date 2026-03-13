/**
 * Mock for @xenova/transformers used in Vitest tests.
 *
 * The real package runs ONNX/WASM inference which is not available in the test
 * environment. This mock returns a deterministic embedding pipeline that maps
 * each input text to a simple vector based on character codes, so the math
 * utilities (cosineSimilarity, computeMedoid, etc.) can be tested without a
 * real ML model.
 */

/** Normalise a Float32Array to unit length. */
function normalise(arr) {
  const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0));
  return norm === 0 ? arr : arr.map(v => v / norm);
}

/** Produce a deterministic 16-dim embedding from a text string. */
function deterministicEmbed(text) {
  const dim = 16;
  const arr = new Float32Array(dim);
  for (let i = 0; i < text.length && i < dim; i++) {
    arr[i % dim] += text.charCodeAt(i) / 128;
  }
  return normalise(arr);
}

export const env = {
  allowRemoteModels: true,
  allowLocalModels:  false,
};

/**
 * Mock pipeline factory. Ignores task and model name; always returns a
 * feature-extraction pipeline that embeds texts deterministically.
 */
export async function pipeline(_task, _model, _opts) {
  return async function mockPipeline(texts, _options) {
    const rows = texts.map(t => Array.from(deterministicEmbed(t)));
    return {
      tolist: () => rows,
    };
  };
}
