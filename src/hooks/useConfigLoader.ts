import { useState, useEffect, useRef } from 'react';
import { fetchConfigFromUrl } from '../utils/github';
import { mapSeparateToInjectionsArray } from '../utils/ergogenBundleLoader';
import { checkFileBridge, readConfigFromFile, readFootprintsFromFiles } from '../utils/fileBridge';
import '../utils/codeberg';
import '../utils/forgejo';

interface UseConfigLoaderProps {
  processInjectionsWithConflictResolution: (
    newInjections: string[][],
    config: string
  ) => Promise<void>;
  setError: (error: string) => void;
}

export const useConfigLoader = ({
  processInjectionsWithConflictResolution,
  setError,
}: UseConfigLoaderProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const loadInitialConfig = async () => {
      // Check for GitHub/Codeberg URL parameter
      const queryParameters = new URLSearchParams(window.location.search);
      const githubUrl = queryParameters.get('github');
      const codebergUrl = queryParameters.get('codeberg');
      const forgejoUrl = queryParameters.get('forgejo');
      const giteaUrl = queryParameters.get('gitea');

      let remoteUrl = githubUrl || codebergUrl || forgejoUrl || giteaUrl;

      if (remoteUrl) {
        if (codebergUrl && !codebergUrl.includes('codeberg.org')) {
          remoteUrl = `https://codeberg.org/${codebergUrl}`;
        } else if (githubUrl && !githubUrl.includes('github.com')) {
          remoteUrl = `https://github.com/${githubUrl}`;
        }

        setIsLoading(true);
        console.log('[useConfigLoader] Loading from URL parameter:', remoteUrl);

        try {
          const result = await fetchConfigFromUrl(remoteUrl);
          console.log('[useConfigLoader] Fetch result:', {
            configLength: result.config.length,
            footprintsCount: result.footprints.length,
            outlinesCount: result.outlines.length,
            configPath: result.configPath,
            rateLimitWarning: result.rateLimitWarning,
          });

          // Show rate limit warning if present
          if (result.rateLimitWarning) {
            setError(result.rateLimitWarning);
          }

          // Convert footprints, outlines, and templates to injection array format
          const newInjections = mapSeparateToInjectionsArray(
            result.footprints,
            result.outlines,
            result.templates
          );

          // Process injections with conflict resolution
          await processInjectionsWithConflictResolution(
            newInjections,
            result.config
          );
        } catch (e) {
          console.error(
            '[useConfigLoader] Failed to load from remote repository:',
            e
          );
          setError(
            `Failed to load from remote repository: ${e instanceof Error ? e.message : String(e)}`
          );
        } finally {
          setIsLoading(false);
        }
        return;
      }

      // No remote URL param: if the local save-helper is running (see
      // scripts/save-server.mjs), load config.yaml directly from disk so the
      // app opens straight into the editor with the on-disk file as the source
      // of truth. This is what powers the local preview/edit workflow and works
      // in Firefox/Zen where the File System Access API is unavailable.
      try {
        const status = await checkFileBridge();
        if (!status.available) {
          console.log(
            '[useConfigLoader] local save-helper not detected; showing Welcome page'
          );
          return;
        }
        setIsLoading(true);
        console.log(
          '[useConfigLoader] loading config.yaml from local save-helper:',
          status.path
        );
        const contents = await readConfigFromFile();
        if (contents === null || contents.trim() === '') {
          console.log('[useConfigLoader] save-helper returned empty contents');
          return;
        }
        // Also load any custom footprints that live next to the config
        // (footprints/<group>/<name>.js) and inject them, so references like
        // `ceoloide/encoder_evqwgd001` resolve in the GUI just like they do with
        // the CLI.
        const footprintInjections = await readFootprintsFromFiles();
        if (footprintInjections.length > 0) {
          console.log(
            `[useConfigLoader] injecting ${footprintInjections.length} custom footprint(s) from disk`
          );
        }
        await processInjectionsWithConflictResolution(
          footprintInjections,
          contents
        );
      } catch (e) {
        console.error(
          '[useConfigLoader] Failed to load from local save-helper:',
          e
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadInitialConfig();
    }
  }, [processInjectionsWithConflictResolution, setError]); // Run once on mount

  return { isLoading };
};
