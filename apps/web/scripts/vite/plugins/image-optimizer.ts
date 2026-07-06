import { createRequire } from "node:module";
import { ViteImageOptimizer } from "vite-plugin-image-optimizer";

const require = createRequire(import.meta.url);
const hasSvgOptimizer = isPackageAvailable("svgo");
const imageAssetPattern = hasSvgOptimizer
  ? /\.(avif|gif|jpe?g|png|svg|tiff|webp)$/i
  : /\.(avif|gif|jpe?g|png|tiff|webp)$/i;

/**
 * Creates the build-only image optimizer with public and source asset support.
 */
export function imageOptimizerPlugin() {
  return ViteImageOptimizer({
    test: imageAssetPattern,
    includePublic: true,
    cache: true,
    cacheLocation: "node_modules/.cache/vite-plugin-image-optimizer",
    logStats: true,
    ...(hasSvgOptimizer
      ? {
          svg: {
            multipass: true,
            plugins: [
              {
                name: "preset-default",
                params: {
                  overrides: {
                    cleanupIds: false,
                    cleanupNumericValues: false,
                    convertPathData: false,
                  },
                },
              },
              "sortAttrs",
            ],
          },
        }
      : {}),
    png: {
      quality: 100,
    },
    jpeg: {
      quality: 90,
      mozjpeg: true,
    },
    jpg: {
      quality: 90,
      mozjpeg: true,
    },
    webp: {
      quality: 90,
    },
    avif: {
      quality: 80,
    },
  });
}

/**
 * Checks optional optimizer packages without forcing them into dependencies.
 */
function isPackageAvailable(packageName: string) {
  try {
    require.resolve(packageName);

    return true;
  } catch {
    return false;
  }
}
